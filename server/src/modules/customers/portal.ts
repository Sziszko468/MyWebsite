import { LANGUAGES, type Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { notFound, unavailable, validationFailed } from '../../http/errors.ts'
import { addMs, HOUR, iso } from '../../lib/time.ts'
import { Fields, isEmail } from '../../lib/validate.ts'
import { normalizeEmail } from '../auth/users.ts'
import { isActive } from '../bookings/model.ts'
import { pageOf, type BookingPage } from '../bookings/customer.ts'
import { hashToken, mintBookingToken, typeById } from '../bookings/repository.ts'
import { isExpired, buildQuoteView, priceSummary } from '../quotes/view.ts'
import { linesOf, quotationsOf, type QuotationRow } from '../quotes/quotations.ts'
import { mintToken } from '../quotes/tokens.ts'
import type { RequestStatus } from '../quotes/status.ts'
import { findCustomerByEmail, getCustomer, portalSettings, recordAudit } from './accounts.ts'
import { canSendLinks, createLinkRequest } from './auth.ts'
import { claimable, ownedBooking, ownedBookings, ownedRequest, ownedRequests, type Candidate } from './linking.ts'
import { queueClientMail } from './mail.ts'
import { ACTIVE_STATUSES, AWAITING_CUSTOMER, TERMINAL_STATUSES, type CustomerRow, type ProjectEventType, type ProjectStatus } from './model.ts'
import { openRequests, upcomingTasks } from '../projectwork/portal.ts'
import { portalProjects, type PortalProject } from './projects.ts'
import { clientSessionsOf, endClientSession, revokeClientSessions, type ClientSession, type ClientSessionView } from './sessions.ts'

/**
 * What a signed-in customer can see and do. Every function takes the customer's id from the SESSION (the route passes `ctx.customer.customerId`), never from
 * the request, and every query selects by it: a record that belongs to somebody else, that does not exist, or that was never linked is the same answer
 * (`null` or a 404), so nothing here can be used to find out what exists. Nothing returned carries a note, an internal status, an address of a visitor,
 * a token, a hash or a path.
 */

/** A link opened from the portal to the quote or the booking page is an ordinary secure link, but it only has to last long enough to be clicked. */
const OPENED_LINK_TTL_MS = 2 * HOUR

// ---- the account --------------------------------------------------------------------------------------------------------------------------

export interface CustomerView {
  email: string
  name: string | null
  company: string | null
  language: Language
  createdAt: string
  verifiedAt: string | null
  deletionRequestedAt: string | null
}

export const customerView = (customer: CustomerRow): CustomerView => ({ email: customer.email, name: customer.name, company: customer.company, language: customer.language, createdAt: customer.created_at, verifiedAt: customer.email_verified_at, deletionRequestedAt: customer.deletion_requested_at })

export function sessionInfo(app: AppContext, session: ClientSession): { customer: CustomerView; csrfToken: string; features: { selfLinking: boolean; documents: boolean } } {
  const customer = getCustomer(app, session.customerId)
  if (!customer) throw notFound('The account')
  // Documents can be shown but not delivered until the site has a private store for files (docs/client-portal/DOCUMENTS.md): the page says so honestly.
  return { customer: customerView(customer), csrfToken: session.csrfToken, features: { selfLinking: portalSettings(app).selfLinking, documents: false } }
}

export function updateProfile(app: AppContext, session: ClientSession, body: Record<string, unknown>): CustomerView {
  const customer = getCustomer(app, session.customerId)
  if (!customer) throw notFound('The account')
  const known = ['name', 'company', 'language']
  if (Object.keys(body).length === 0 || !Object.keys(body).every((key) => known.includes(key))) throw validationFailed({ body: 'invalid' })
  const fields = new Fields(body)
  const name = 'name' in body ? fields.text('name', { max: 100 }) : customer.name
  const company = 'company' in body ? fields.text('company', { max: 120 }) : customer.company
  const language = 'language' in body ? fields.oneOf('language', LANGUAGES, { required: true }) : customer.language
  fields.done()
  app.db.transaction(() => {
    app.db.run('UPDATE customers SET name = ?, company = ?, language = ?, updated_at = ? WHERE id = ?', [name, company, language, iso(app.clock.now()), customer.id])
    recordAudit(app, { customerId: customer.id, type: 'profile_updated', actor: { type: 'customer', id: customer.id }, detail: Object.keys(body).join(',') })
  })
  return customerView(getCustomer(app, customer.id)!)
}

/**
 * "Use this address instead." The same answer whatever the address is. A link goes to the NEW address; nothing changes until it is opened. The current
 * address is told that a change was asked for (a notice with no link in it).
 */
export function requestEmailChange(app: AppContext, session: ClientSession, body: Record<string, unknown>, ipHash: string): void {
  const customer = getCustomer(app, session.customerId)
  if (!customer) throw notFound('The account')
  const fields = new Fields(body)
  const typed = fields.text('email', { max: 254, required: true }, (value) => (isEmail(normalizeEmail(value)) ? undefined : 'invalidEmail'))
  fields.done()
  const next = normalizeEmail(typed ?? '')
  if (!canSendLinks(app)) throw unavailable('Links cannot be sent right now.')
  const since = iso(addMs(app.clock.now(), -HOUR))
  const recent = app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM customer_auth_requests WHERE customer_id = ? AND purpose = 'email_change' AND created_at >= ?", [customer.id, since])?.n ?? 0
  const other = findCustomerByEmail(app, next)
  // Nothing is said about whether the address is already someone's: it simply gets no link.
  if (recent >= 3 || next === customer.email.toLowerCase() || (other && other.id !== customer.id)) return
  app.db.transaction(() => {
    createLinkRequest(app, { purpose: 'email_change', customerId: customer.id, email: next, language: customer.language, ipHash })
    const auditId = recordAudit(app, { customerId: customer.id, type: 'email_change_requested', actor: { type: 'customer', id: customer.id } })
    queueClientMail(app, { kind: 'client_security_notice', relatedType: 'client_audit', relatedId: String(auditId), recipient: customer.email, language: customer.language })
  })
}

export const sessionsOf = (app: AppContext, session: ClientSession): ClientSessionView[] => clientSessionsOf(app, session.customerId, session.tokenHash)

/** Ends one of the customer's OWN sign-ins by its public id: another customer's id finds nothing. */
export function revokeOne(app: AppContext, session: ClientSession, publicId: string): { current: boolean } {
  const row = app.db.get<{ token_hash: string }>('SELECT token_hash FROM customer_sessions WHERE public_id = ? AND customer_id = ?', [publicId, session.customerId])
  if (!row) throw notFound('The sign-in')
  endClientSession(app, row.token_hash)
  return { current: row.token_hash === session.tokenHash }
}

export function revokeOthers(app: AppContext, session: ClientSession): number {
  const closed = revokeClientSessions(app, session.customerId, session.tokenHash)
  if (closed > 0) recordAudit(app, { customerId: session.customerId, type: 'sessions_revoked', actor: { type: 'customer', id: session.customerId }, detail: 'other_sessions' })
  return closed
}

export function signOut(app: AppContext, session: ClientSession): void {
  endClientSession(app, session.tokenHash)
  recordAudit(app, { customerId: session.customerId, type: 'signed_out', actor: { type: 'customer', id: session.customerId } })
}

/**
 * "Delete my account." It records the request, tells the customer it arrived and tells the owner. It deletes nothing: erasing is the owner's act (the CLI's
 * `erase`), as it is for every other record the site holds, and the customer is told so in the answer, not left to find out.
 */
export function requestDeletion(app: AppContext, session: ClientSession): { requestedAt: string } {
  const customer = getCustomer(app, session.customerId)
  if (!customer) throw notFound('The account')
  if (customer.deletion_requested_at) return { requestedAt: customer.deletion_requested_at }
  const now = iso(app.clock.now())
  app.db.transaction(() => {
    app.db.run('UPDATE customers SET deletion_requested_at = ?, updated_at = ? WHERE id = ?', [now, now, customer.id])
    const auditId = recordAudit(app, { customerId: customer.id, type: 'deletion_requested', actor: { type: 'customer', id: customer.id } })
    queueClientMail(app, { kind: 'client_security_notice', relatedType: 'client_audit', relatedId: String(auditId), recipient: customer.email, language: customer.language })
    if (app.config.email.notifyTo) queueClientMail(app, { kind: 'client_deletion_requested_admin', relatedType: 'client_audit', relatedId: String(auditId), recipient: app.config.email.notifyTo, language: app.config.email.notifyLanguage })
  })
  return { requestedAt: now }
}

export function cancelDeletion(app: AppContext, session: ClientSession): void {
  const customer = getCustomer(app, session.customerId)
  if (!customer || !customer.deletion_requested_at) return
  app.db.transaction(() => {
    app.db.run('UPDATE customers SET deletion_requested_at = NULL, updated_at = ? WHERE id = ?', [iso(app.clock.now()), customer.id])
    recordAudit(app, { customerId: customer.id, type: 'deletion_cancelled', actor: { type: 'customer', id: customer.id } })
  })
}

// ---- linking ---------------------------------------------------------------------------------------------------------------------------

export function candidatesOf(app: AppContext, session: ClientSession): Candidate[] {
  if (!portalSettings(app).selfLinking) return []
  const customer = getCustomer(app, session.customerId)
  return customer ? claimable(app, customer) : []
}

// ---- the overview ------------------------------------------------------------------------------------------------------------------------

export interface Overview {
  name: string | null
  counts: { active: number; awaitingYou: number; completed: number; requests: number; bookings: number }
  awaitingYou: Array<Pick<PortalProject, 'reference' | 'name' | 'status'>>
  activity: Array<{ id: number; type: ProjectEventType; at: string; toStatus: string | null; note: string | null; milestone: string | null; subject: string | null; project: { reference: string; name: string } }>
  /** The requests the customer has to answer now (customer actions that wait for them), most urgent first. */
  needsYou: ReturnType<typeof openRequests>
  upcoming: Array<{ kind: 'milestone' | 'task'; project: { reference: string; name: string }; title: string; dueOn: string | null; overdue: boolean }>
  bookings: Array<{ reference: string; startAt: string; endAt: string; timeZone: string; typeName: string; status: string; language: Language }>
}

export function overview(app: AppContext, session: ClientSession): Overview {
  const customer = getCustomer(app, session.customerId)
  if (!customer) throw notFound('The account')
  const now = app.clock.now()
  const today = iso(now).slice(0, 10)
  const projects = portalProjects(app, customer.id)
  // Only the lines written FOR the customer, and none about a milestone or a task the owner has not shared.
  const activity = app.db.all<{ id: number; event_type: ProjectEventType; created_at: string; to_status: string | null; note: string | null; milestone_title: string | null; subject: string | null; reference: string; name: string }>(
    `SELECT e.id, e.event_type, e.created_at, e.to_status, e.note, m.title AS milestone_title, e.subject, p.reference, p.name
     FROM client_project_events e JOIN client_projects p ON p.id = e.project_id LEFT JOIN client_milestones m ON m.id = e.milestone_id LEFT JOIN project_tasks t ON t.id = e.task_id
     WHERE p.customer_id = ? AND e.visibility = 'customer' AND (m.id IS NULL OR m.customer_visible = 1) AND (e.task_id IS NULL OR t.customer_visible = 1) ORDER BY e.id DESC LIMIT 8`,
    [customer.id],
  )
  const upcoming = app.db.all<{ title: string; due_on: string | null; reference: string; name: string }>(
    `SELECT m.title, m.due_on, p.reference, p.name FROM client_milestones m JOIN client_projects p ON p.id = m.project_id
     WHERE p.customer_id = ? AND m.completed_at IS NULL AND m.customer_visible = 1 AND m.status <> 'cancelled' AND p.status NOT IN (${TERMINAL_STATUSES.map(() => '?').join(', ')})
     ORDER BY (m.due_on IS NULL), m.due_on, m.position LIMIT 6`,
    [customer.id, ...TERMINAL_STATUSES],
  )
  const requests = ownedRequests(app, customer.id)
  const bookings = ownedBookings(app, customer.id)
  const needsYou = openRequests(app, customer.id)
  const nowIso = iso(now)
  return {
    name: customer.name,
    counts: {
      active: projects.filter((project) => ACTIVE_STATUSES.includes(project.status)).length,
      awaitingYou: new Set([...projects.filter((project) => AWAITING_CUSTOMER.includes(project.status)).map((project) => project.reference), ...needsYou.map((entry) => entry.project.reference)]).size,
      completed: projects.filter((project) => project.status === 'completed').length,
      requests: requests.length,
      bookings: bookings.length,
    },
    awaitingYou: projects.filter((project) => AWAITING_CUSTOMER.includes(project.status)).map((project) => ({ reference: project.reference, name: project.name, status: project.status })),
    activity: activity.map((row) => ({ id: row.id, type: row.event_type, at: row.created_at, toStatus: row.to_status, note: row.note, milestone: row.milestone_title, subject: row.subject, project: { reference: row.reference, name: row.name } })),
    needsYou,
    upcoming: [
      ...upcoming.map((row) => ({ kind: 'milestone' as const, project: { reference: row.reference, name: row.name }, title: row.title, dueOn: row.due_on, overdue: row.due_on !== null && row.due_on < today })),
      ...upcomingTasks(app, customer.id).map((row) => ({ kind: 'task' as const, ...row })),
    ]
      .sort((a, b) => (a.dueOn === null ? 1 : b.dueOn === null ? -1 : a.dueOn.localeCompare(b.dueOn)))
      .slice(0, 8),
    bookings: bookings
      .filter((booking) => isActive(booking.status) && booking.end_at >= nowIso)
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .slice(0, 3)
      .map((booking) => ({ reference: booking.reference, startAt: booking.start_at, endAt: booking.end_at, timeZone: booking.time_zone, typeName: typeById(app.db, booking.consultation_type_id)?.translations[booking.language].name ?? '', status: booking.status, language: booking.language })),
  }
}

// ---- quote requests -----------------------------------------------------------------------------------------------------------------------

type QuoteState = 'open' | 'expired' | 'accepted' | 'declined' | 'superseded' | 'withdrawn'

function stateOf(quote: QuotationRow, now: Date): QuoteState {
  if (quote.status === 'sent') return isExpired(quote, now) ? 'expired' : 'open'
  if (quote.status === 'draft') return 'withdrawn'
  return quote.status
}

export interface PortalRequest {
  reference: string
  createdAt: string
  language: Language
  /** The status the customer was SHOWN (never the internal one). */
  status: RequestStatus
  updates: Array<{ at: string; kind: 'status' | 'message' | 'quote'; status: RequestStatus | null; body: string }>
  quotes: Array<{ reference: string; version: number; title: string; state: QuoteState; sentAt: string | null; validUntil: string | null; acceptedAt: string | null; price: string | null; timeline: string | null; language: Language }>
  projects: Array<{ reference: string; name: string; status: ProjectStatus }>
}

export function portalRequests(app: AppContext, session: ClientSession): Array<Pick<PortalRequest, 'reference' | 'createdAt' | 'status' | 'language'> & { acceptedQuote: string | null; projects: number }> {
  return ownedRequests(app, session.customerId).map((request) => ({
    reference: request.reference,
    createdAt: request.created_at,
    status: request.customer_status,
    language: request.language,
    acceptedQuote: app.db.get<{ reference: string }>("SELECT reference FROM quotes WHERE quote_request_id = ? AND status = 'accepted' ORDER BY version DESC LIMIT 1", [request.id])?.reference ?? null,
    projects: app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM client_projects WHERE customer_id = ? AND quote_request_id = ?', [session.customerId, request.id])?.n ?? 0,
  }))
}

/** A request of this customer's, with what they were shown (the status page's content) and the quotes sent for it. `null` when it is not theirs. */
export function portalRequest(app: AppContext, session: ClientSession, reference: string): PortalRequest | null {
  const request = ownedRequest(app, session.customerId, reference)
  if (!request) return null
  const now = app.clock.now()
  const updates = app.db.all<{ created_at: string; kind: 'status' | 'message' | 'quote'; status: RequestStatus | null; body: string }>('SELECT created_at, kind, status, body FROM customer_updates WHERE quote_request_id = ? ORDER BY id', [request.id])
  const quotes = quotationsOf(app.db, request.id).filter((quote) => quote.status !== 'draft')
  return {
    reference: request.reference,
    createdAt: request.created_at,
    language: request.language,
    status: request.customer_status,
    updates: updates.map((row) => ({ at: row.created_at, kind: row.kind, status: row.status, body: row.body })),
    quotes: quotes.map((quote) => {
      const price = priceSummary(buildQuoteView(quote, linesOf(app.db, quote.id), request, now), '')
      return { reference: quote.reference, version: quote.version, title: quote.title, state: stateOf(quote, now), sentAt: quote.sent_at, validUntil: quote.valid_until, acceptedAt: quote.accepted_at, price: price || null, timeline: quote.estimated_timeline.trim() || null, language: quote.language }
    }),
    projects: app.db.all<{ reference: string; name: string; status: ProjectStatus }>('SELECT reference, name, status FROM client_projects WHERE customer_id = ? AND quote_request_id = ? ORDER BY created_at', [session.customerId, request.id]),
  }
}

/**
 * A link to the existing quote page (or the request's status page) for one of THIS customer's requests. It is the ordinary secure link of the quotation
 * system, made on request and good for a couple of hours: opening it works exactly as before, and accepting or declining is still done there, by its own
 * single-use steps. Nothing about the quotation's rules changes.
 */
export function openRequestLink(app: AppContext, session: ClientSession, reference: string, quoteReference: string | null): { path: string } {
  const request = ownedRequest(app, session.customerId, reference)
  if (!request) throw notFound('The request')
  if (quoteReference) {
    const quote = quotationsOf(app.db, request.id).find((candidate) => candidate.reference === quoteReference && candidate.status !== 'draft')
    if (!quote) throw notFound('The quote')
    return { path: `quote/${mintToken(app, { requestId: request.id, quoteId: quote.id, action: 'view_quote', ttlMs: OPENED_LINK_TTL_MS }).token}` }
  }
  return { path: `request/${mintToken(app, { requestId: request.id, quoteId: null, action: 'view_request', ttlMs: OPENED_LINK_TTL_MS }).token}` }
}

// ---- bookings ------------------------------------------------------------------------------------------------------------------------

export function portalBookings(app: AppContext, session: ClientSession): Array<{ reference: string; status: string; active: boolean; startAt: string; endAt: string; timeZone: string; typeName: string; language: Language }> {
  return ownedBookings(app, session.customerId).map((booking) => ({
    reference: booking.reference,
    status: booking.status,
    active: isActive(booking.status),
    startAt: booking.start_at,
    endAt: booking.end_at,
    timeZone: booking.time_zone,
    typeName: typeById(app.db, booking.consultation_type_id)?.translations[booking.language].name ?? '',
    language: booking.language,
  }))
}

/** One of THIS customer's bookings, as the booking page itself shows it (the same function, so the same fields and no private note). */
export function portalBooking(app: AppContext, session: ClientSession, reference: string): BookingPage | null {
  const booking = ownedBooking(app, session.customerId, reference)
  return booking ? pageOf(app, booking) : null
}

/** The ordinary secure link to a booking of this customer's, good for a couple of hours: changes and cancellations stay where they have always been. */
export function openBookingLink(app: AppContext, session: ClientSession, reference: string): { path: string } {
  const booking = ownedBooking(app, session.customerId, reference)
  if (!booking) throw notFound('The booking')
  const { token, expiresAt } = mintBookingToken(app, booking)
  const short = iso(addMs(app.clock.now(), OPENED_LINK_TTL_MS))
  if (short < expiresAt) app.db.run('UPDATE booking_tokens SET expires_at = ? WHERE token_hash = ?', [short, hashToken(token)])
  return { path: `consultation/booking/${token}` }
}

// ---- documents -----------------------------------------------------------------------------------------------------------------------

/**
 * The place a document's bytes would be fetched from. The site has no private file store yet (nothing in it can hold a file that must not be public), so
 * the one implementation says so. The day a store exists it is written here, behind the authorization that already runs before it.
 */
export interface DocumentStore {
  open(storageKey: string): Promise<{ contentType: string; body: Buffer }>
}

export const NO_DOCUMENT_STORE: DocumentStore = {
  open: () => Promise.reject(unavailable('Documents cannot be delivered yet.')),
}

/** Refused for a document that is not this customer's published one: the same 404 whatever the reason. */
export function documentFor(app: AppContext, customerId: string, documentId: string): { storageKey: string } {
  const row = app.db.get<{ storage_key: string | null }>('SELECT d.storage_key FROM client_documents d JOIN client_projects p ON p.id = d.project_id WHERE d.id = ? AND p.customer_id = ? AND d.published_at IS NOT NULL', [documentId, customerId])
  if (!row || !row.storage_key) throw notFound('The document')
  return { storageKey: row.storage_key }
}

