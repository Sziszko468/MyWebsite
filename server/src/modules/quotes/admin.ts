import { LANGUAGES, type Language } from '../../config.ts'
import type { AppContext, SessionInfo } from '../../context.ts'
import { HttpError, notFound, validationFailed } from '../../http/errors.ts'
import { toCsv } from '../../lib/csv.ts'
import { cleanBlock, length } from '../../lib/text.ts'
import { Fields, isEmail, isPhone } from '../../lib/validate.ts'
import { iso } from '../../lib/time.ts'
import { parseListing, type Listing } from '../admin/listing.ts'
import { requirePermission } from '../auth/permissions.ts'
import { contentHashOf } from '../contact/service.ts'
import { getInquiry } from '../inquiries/repository.ts'
import type { DeliveryRow } from '../notifications/notifier.ts'
import { briefRows, readBrief } from '../shop/brief.ts'
import { totalsOf } from '../shop/pricing.ts'
import { audit } from '../system/audit.ts'
import { createQuoteRequest } from './create.ts'
import { eventsOf, recordEvent } from './events.ts'
import { linesOf, problemsBeforeSending, quotationsOf, requireQuotation, type QuotationRow } from './quotations.ts'
import { toDecimal } from './money.ts'
import {
  addQuoteNote,
  deleteQuote,
  EXTRA_SORTS,
  getQuote,
  listQuoteNotes,
  listQuotes,
  quoteCounts,
  quoteItems,
  setQuoteArchived,
  type ExtraSort,
  type QuoteFilters,
  type QuoteRow,
} from './repository.ts'
import { checkManualMove, isPriority, isRequestType, isStatus, nextStatuses, PRIORITIES, REQUEST_STATUSES, REQUEST_TYPES, SOURCES, type RequestStatus, type RequestType } from './status.ts'
import { revokeQuoteTokens } from './tokens.ts'
import { buildQuoteView, percentText } from './view.ts'

/** What an administrator can do with the quote requests: look, filter, change the status and priority, write notes, tell the customer, archive, delete, create. The quotation itself is in quotations.ts and lifecycle.ts. */

export function parseQuoteQuery(query: URLSearchParams): QuoteFilters & Listing {
  const listing = parseListing(query)
  const pick = (name: string, allowed: readonly string[]): string | undefined => {
    const value = query.get(name) ?? ''
    return allowed.includes(value) ? value : undefined
  }
  const sort = query.get('sort') ?? ''
  return {
    ...listing,
    status: pick('status', REQUEST_STATUSES),
    type: pick('type', REQUEST_TYPES),
    priority: pick('priority', PRIORITIES),
    source: pick('source', SOURCES),
    extraSort: (EXTRA_SORTS as readonly string[]).includes(sort) ? (sort as ExtraSort) : undefined,
  }
}

export function listForAdmin(app: AppContext, session: SessionInfo | null, query: URLSearchParams) {
  requirePermission(session, 'requests:read')
  const filters = parseQuoteQuery(query)
  const { rows, total } = listQuotes(app.db, filters)
  return { filters, rows, total, itemsOf: itemsSummary(app, rows.map((row) => row.id)) }
}

/** What each listed request asked for, in a word each (the need and the package), fetched for the whole page in one query. */
function itemsSummary(app: AppContext, ids: string[]): Record<string, { need: string; plan: string }[]> {
  const out: Record<string, { need: string; plan: string }[]> = {}
  if (ids.length === 0) return out
  const placeholders = ids.map(() => '?').join(', ')
  for (const row of app.db.all<{ quote_request_id: string; need: string; plan: string }>(`SELECT quote_request_id, need, plan FROM quote_request_items WHERE quote_request_id IN (${placeholders}) ORDER BY position`, ids)) {
    ;(out[row.quote_request_id] ??= []).push({ need: row.need, plan: row.plan })
  }
  return out
}

export interface InquirySummary {
  id: string
  reference: string
  name: string
  subject: string
  status: string
  created_at: string
}

const SUMMARY = 'SELECT id, reference, name, subject, status, created_at FROM inquiries'

export interface DeliveryView {
  id: string
  kind: string
  relatedType: string
  recipient: string
  status: string
  attempts: number
  lastError: string | null
  errorCode: string | null
  provider: string | null
  providerEvent: string | null
  createdAt: string
  acceptedAt: string | null
  deliveredAt: string | null
}

/** The e-mails about this request: its own, its quotations' and its revision requests'. */
function deliveriesOf(app: AppContext, requestId: string, quoteIds: string[], revisionIds: string[]): DeliveryView[] {
  const marks = (ids: string[]) => ids.map(() => '?').join(', ')
  const rows = app.db.all<DeliveryRow>(
    `SELECT * FROM email_deliveries WHERE (related_type = 'quote_request' AND related_id = ?)
       ${quoteIds.length ? `OR (related_type = 'quote' AND related_id IN (${marks(quoteIds)}))` : ''}
       ${revisionIds.length ? `OR (related_type = 'quote_revision' AND related_id IN (${marks(revisionIds)}))` : ''}
     ORDER BY created_at, id`,
    [requestId, ...quoteIds, ...revisionIds],
  )
  return rows.map((row) => ({ id: row.id, kind: row.kind, relatedType: row.related_type, recipient: row.recipient, status: row.status, attempts: row.attempts, lastError: row.last_error, errorCode: row.error_code, provider: row.provider, providerEvent: row.provider_event, createdAt: row.created_at, acceptedAt: row.accepted_at, deliveredAt: row.delivered_at }))
}

export function quotationOut(app: AppContext, quote: QuotationRow, request: QuoteRow) {
  const { accepted_ip_hash: _ip, ...visible } = quote
  const lines = linesOf(app.db, quote.id)
  const currency = quote.currency
  return {
    ...visible,
    lines,
    view: buildQuoteView(quote, lines, request, app.clock.now()),
    // The same shape the editor sends back: text for every amount, so what is typed round-trips exactly.
    form: {
      language: quote.language,
      title: quote.title,
      introduction: quote.introduction,
      understanding: quote.understanding,
      scope: quote.scope,
      deliverables: quote.deliverables,
      exclusions: quote.exclusions,
      paymentTerms: quote.payment_terms,
      terms: quote.terms,
      notes: quote.notes,
      estimatedTimeline: quote.estimated_timeline,
      validUntil: quote.valid_until ?? '',
      pricingMode: quote.pricing_mode,
      pricingNote: quote.pricing_note,
      currency: currency ?? '',
      taxMode: quote.tax_mode,
      taxRatePercent: quote.tax_rate_bp === null ? '' : percentText(quote.tax_rate_bp),
      taxVerified: quote.tax_verified === 1,
      taxNote: quote.tax_note,
      fixedAmount: quote.fixed_minor !== null && currency ? toDecimal(quote.fixed_minor, currency) : '',
      lines: lines.map((line) => ({ kind: line.kind, description: line.description, detail: line.detail, quantity: line.quantity, unitPrice: currency ? toDecimal(line.unit_minor, currency) : String(line.unit_minor), justification: line.justification })),
    },
  }
}

/** One quotation for the editor and the preview: the document, its request in short, and what is still missing before it can be sent. */
export function quotationDetail(app: AppContext, session: SessionInfo | null, id: string) {
  requirePermission(session, 'requests:read')
  const quote = requireQuotation(app, id)
  const request = getQuote(app.db, quote.quote_request_id)
  if (!request) throw notFound('The quote request')
  return {
    request: { id: request.id, reference: request.reference, name: request.name, email: request.email, company: request.company, language: request.language, status: request.status, request_type: request.request_type },
    quotation: quotationOut(app, quote, request),
    problems: quote.status === 'draft' ? problemsBeforeSending(app, quote, linesOf(app.db, quote.id)) : {},
    canSend: app.notifier.canSendQuotations,
    siblings: quotationsOf(app.db, request.id).map((row) => ({ id: row.id, version: row.version, reference: row.reference, status: row.status })),
  }
}

export function detailForAdmin(app: AppContext, session: SessionInfo | null, id: string) {
  requirePermission(session, 'requests:read')
  const quote = getQuote(app.db, id)
  if (!quote) throw notFound('The quote request')
  const items = quoteItems(app.db, id)
  const linked = quote.inquiry_id ? (app.db.get<InquirySummary>(`${SUMMARY} WHERE id = ?`, [quote.inquiry_id]) ?? null) : null
  const quotations = quotationsOf(app.db, id)
  const revisions = app.db.all<{ id: string; quote_id: string; message: string; created_at: string; handled_at: string | null }>('SELECT id, quote_id, message, created_at, handled_at FROM quote_revision_requests WHERE quote_request_id = ? ORDER BY created_at', [id])
  return {
    quote,
    items,
    notes: listQuoteNotes(app.db, id),
    pricing: totalsOf(items.map((item) => item.snapshot)),
    inquiry: linked,
    // The messages the same address has sent: the likely ones to link this request to.
    candidates: app.db.all<InquirySummary>(`${SUMMARY} WHERE email = ? ORDER BY created_at DESC LIMIT 10`, [quote.email]),
    quotations: quotations.map((row) => quotationOut(app, row, quote)),
    revisions,
    deliveries: deliveriesOf(app, id, quotations.map((row) => row.id), revisions.map((row) => row.id)),
    history: eventsOf(app, id),
    customerUpdates: app.db.all<{ id: number; kind: string; status: string | null; body: string; created_at: string }>('SELECT id, kind, status, body, created_at FROM customer_updates WHERE quote_request_id = ? ORDER BY id', [id]),
    nextStatuses: nextStatuses(quote.status).filter((status) => status !== 'quote_sent'),
  }
}

export interface StatusChange {
  status: unknown
  /** E-mail the customer (which also shows the change on their status page). */
  notify?: boolean
  /** Show the change on the customer's status page without an e-mail. */
  show?: boolean
  /** Text for the customer, in the e-mail and on the page. */
  note?: unknown
  /** For the administrators only; required to record an acceptance or decline that happened outside the page. */
  internalNote?: unknown
}

export function changeStatus(app: AppContext, session: SessionInfo | null, id: string, input: StatusChange): { notified: 'queued' | 'off' | 'not_requested' } {
  const actor = requirePermission(session, 'requests:write')
  if (!isStatus(input.status)) throw validationFailed({ status: 'invalid' })
  const to: RequestStatus = input.status
  const customerNote = typeof input.note === 'string' ? cleanBlock(input.note) : ''
  const internalNote = typeof input.internalNote === 'string' ? cleanBlock(input.internalNote) : ''
  if (length(customerNote) > 1000) throw validationFailed({ note: 'tooLong' })
  if (length(internalNote) > 2000) throw validationFailed({ internalNote: 'tooLong' })
  const request = getQuote(app.db, id)
  if (!request) throw notFound('The quote request')
  const from = request.status

  if (from !== to) {
    const check = checkManualMove(from, to, internalNote)
    if (!check.ok) {
      if (check.reason === 'note_required') throw validationFailed({ internalNote: 'required' }, 'Write down why this was recorded by hand.')
      throw new HttpError(409, 'conflict', check.reason === 'system_only' ? 'This status is set by sending a quotation.' : `A request that is ${from} cannot be moved to ${to}.`, { details: { reason: check.reason, from, to } })
    }
  }
  const now = iso(app.clock.now())
  let notified: 'queued' | 'off' | 'not_requested' = 'not_requested'
  app.db.transaction(() => {
    if (from !== to) {
      app.db.run('UPDATE quote_requests SET status = ?, updated_at = ? WHERE id = ?', [to, now, id])
      recordEvent(app, { requestId: id, reference: request.reference, type: 'status_changed', actor: { type: 'admin', session: actor }, from, to, summary: internalNote ? 'with an internal note' : null })
      // A request that is cancelled has no offer out: any quotation still with the customer is taken back and its links end.
      if (to === 'cancelled') {
        for (const open of quotationsOf(app.db, id).filter((row) => row.status === 'sent')) {
          app.db.run("UPDATE quotes SET status = 'withdrawn', updated_at = ? WHERE id = ? AND status = 'sent'", [now, open.id])
          revokeQuoteTokens(app, open.id)
          recordEvent(app, { requestId: id, reference: request.reference, quoteId: open.id, type: 'quote_withdrawn', actor: { type: 'admin', session: actor }, summary: 'request cancelled' })
        }
      }
    }
    if (internalNote) {
      addQuoteNote(app.db, id, actor.userId, internalNote, now)
      recordEvent(app, { requestId: id, reference: request.reference, type: 'note_added', actor: { type: 'admin', session: actor } })
    }
    if (input.notify === true || input.show === true) {
      // The administrator chose to tell the customer: the change appears on their status page, and (with `notify`) in an e-mail.
      app.db.run('UPDATE quote_requests SET customer_status = ?, updated_at = ? WHERE id = ?', [to, now, id])
      app.db.run("INSERT INTO customer_updates (quote_request_id, kind, status, body, author_id, created_at) VALUES (?, 'status', ?, ?, ?, ?)", [id, to, customerNote, actor.userId, now])
      recordEvent(app, { requestId: id, reference: request.reference, type: 'customer_update_posted', actor: { type: 'admin', session: actor }, to })
      if (input.notify === true) {
        const queued = app.notifier.notifyCustomer('quote_status', id, customerNote || null) !== null
        notified = queued ? 'queued' : 'off'
        if (queued) recordEvent(app, { requestId: id, reference: request.reference, type: 'customer_notified', actor: { type: 'admin', session: actor }, to })
      }
    }
    audit(app, actor, 'quote.status', 'quote_request', id, { from, to, emailed: notified === 'queued', shown: input.notify === true || input.show === true })
  })
  return { notified }
}

/** A message for the customer's status page (and, if asked, their mailbox) that is not a change of status. */
export function postUpdate(app: AppContext, session: SessionInfo | null, id: string, input: { message: unknown; notify?: boolean }): { notified: 'queued' | 'off' | 'not_requested' } {
  const actor = requirePermission(session, 'requests:write')
  const message = typeof input.message === 'string' ? cleanBlock(input.message) : ''
  if (!message) throw validationFailed({ message: 'required' })
  if (length(message) > 1000) throw validationFailed({ message: 'tooLong' })
  const request = getQuote(app.db, id)
  if (!request) throw notFound('The quote request')
  const now = iso(app.clock.now())
  let notified: 'queued' | 'off' | 'not_requested' = 'not_requested'
  app.db.transaction(() => {
    app.db.run("INSERT INTO customer_updates (quote_request_id, kind, status, body, author_id, created_at) VALUES (?, 'message', NULL, ?, ?, ?)", [id, message, actor.userId, now])
    app.db.run('UPDATE quote_requests SET updated_at = ? WHERE id = ?', [now, id])
    recordEvent(app, { requestId: id, reference: request.reference, type: 'customer_update_posted', actor: { type: 'admin', session: actor } })
    if (input.notify === true) {
      const queued = app.notifier.notifyCustomer('quote_status', id, message) !== null
      notified = queued ? 'queued' : 'off'
      if (queued) recordEvent(app, { requestId: id, reference: request.reference, type: 'customer_notified', actor: { type: 'admin', session: actor } })
    }
    audit(app, actor, 'quote.update_posted', 'quote_request', id, { emailed: notified === 'queued' })
  })
  return { notified }
}

export function setPriority(app: AppContext, session: SessionInfo | null, id: string, value: unknown): void {
  const actor = requirePermission(session, 'requests:write')
  if (!isPriority(value)) throw validationFailed({ priority: 'invalid' })
  const request = getQuote(app.db, id)
  if (!request) throw notFound('The quote request')
  if (request.priority === value) return
  app.db.transaction(() => {
    app.db.run('UPDATE quote_requests SET priority = ?, updated_at = ? WHERE id = ?', [value, iso(app.clock.now()), id])
    recordEvent(app, { requestId: id, reference: request.reference, type: 'priority_changed', actor: { type: 'admin', session: actor }, summary: `${request.priority} -> ${value}` })
    audit(app, actor, 'quote.priority', 'quote_request', id, { from: request.priority, to: value })
  })
}

/** Says which inquiry a quote request belongs to, or (with `null`) that it belongs to none. */
export function linkInquiry(app: AppContext, session: SessionInfo | null, id: string, inquiryId: unknown): void {
  const actor = requirePermission(session, 'requests:write')
  if (inquiryId !== null && typeof inquiryId !== 'string') throw validationFailed({ inquiryId: 'invalid' })
  const request = getQuote(app.db, id)
  if (!request) throw notFound('The quote request')
  const inquiry = inquiryId === null ? null : getInquiry(app.db, inquiryId)
  if (inquiryId !== null && !inquiry) throw validationFailed({ inquiryId: 'invalid' })
  app.db.transaction(() => {
    app.db.run('UPDATE quote_requests SET inquiry_id = ?, updated_at = ? WHERE id = ?', [inquiryId, iso(app.clock.now()), id])
    recordEvent(app, { requestId: id, reference: request.reference, type: 'request_updated', actor: { type: 'admin', session: actor }, summary: inquiry ? 'linked to a message' : 'unlinked from a message' })
    audit(app, actor, inquiry ? 'quote.link' : 'quote.unlink', 'quote_request', id, { inquiry: inquiry?.reference ?? null })
  })
}

export function archive(app: AppContext, session: SessionInfo | null, id: string, archived: boolean): void {
  const actor = requirePermission(session, 'requests:write')
  const request = getQuote(app.db, id)
  if (!request) throw notFound('The quote request')
  app.db.transaction(() => {
    setQuoteArchived(app.db, id, archived, iso(app.clock.now()))
    recordEvent(app, { requestId: id, reference: request.reference, type: archived ? 'archived' : 'restored', actor: { type: 'admin', session: actor } })
    audit(app, actor, archived ? 'quote.archive' : 'quote.unarchive', 'quote_request', id)
  })
}

export function addNote(app: AppContext, session: SessionInfo | null, id: string, body: unknown): void {
  const actor = requirePermission(session, 'requests:write')
  const text = typeof body === 'string' ? cleanBlock(body) : ''
  if (!text) throw validationFailed({ note: 'required' })
  if (length(text) > 2000) throw validationFailed({ note: 'tooLong' })
  const request = getQuote(app.db, id)
  if (!request) throw notFound('The quote request')
  app.db.transaction(() => {
    addQuoteNote(app.db, id, actor.userId, text, iso(app.clock.now()))
    recordEvent(app, { requestId: id, reference: request.reference, type: 'note_added', actor: { type: 'admin', session: actor } })
    audit(app, actor, 'quote.note', 'quote_request', id)
  })
}

/** Deletes a request and everything the site holds about it (an administrator only). The history keeps one line saying it existed, with no personal data. */
export function remove(app: AppContext, session: SessionInfo | null, id: string): void {
  const actor = requirePermission(session, 'requests:delete')
  const request = getQuote(app.db, id)
  if (!request) throw notFound('The quote request')
  app.db.transaction(() => {
    const quoteIds = quotationsOf(app.db, id).map((row) => row.id)
    const revisionIds = app.db.all<{ id: string }>('SELECT id FROM quote_revision_requests WHERE quote_request_id = ?', [id]).map((row) => row.id)
    app.db.run("DELETE FROM email_deliveries WHERE related_type = 'quote_request' AND related_id = ?", [id])
    for (const quoteId of quoteIds) app.db.run("DELETE FROM email_deliveries WHERE related_type = 'quote' AND related_id = ?", [quoteId])
    for (const revisionId of revisionIds) app.db.run("DELETE FROM email_deliveries WHERE related_type = 'quote_revision' AND related_id = ?", [revisionId])
    recordEvent(app, { requestId: id, reference: request.reference, type: 'request_deleted', actor: { type: 'admin', session: actor } })
    if (!deleteQuote(app.db, id)) throw notFound('The quote request')
    audit(app, actor, 'quote.delete', 'quote_request', id, { reference: request.reference })
  })
}

/** Sends the confirmation again. A failed one is retried and one that went out is sent once more, on the same row: a request never has two. */
export function resendConfirmation(app: AppContext, session: SessionInfo | null, id: string): { queued: true } {
  const actor = requirePermission(session, 'requests:write')
  const request = getQuote(app.db, id)
  if (!request) throw notFound('The quote request')
  if (!app.notifier.enabled) throw new HttpError(409, 'conflict', 'E-mail is not set up.', { details: { reason: 'email_unavailable' } })
  app.db.transaction(() => {
    const existing = app.db.get<{ id: string; status: string }>("SELECT id, status FROM email_deliveries WHERE related_type = 'quote_request' AND related_id = ? AND kind = 'quote_confirmation'", [id])
    if (existing) {
      if (!app.notifier.resend(existing.id)) throw new HttpError(409, 'conflict', 'The confirmation is still on its way.', { details: { reason: 'in_flight' } })
    } else {
      app.notifier.enqueue({ kind: 'quote_confirmation', relatedType: 'quote_request', relatedId: id, recipient: request.email, language: request.language })
    }
    recordEvent(app, { requestId: id, reference: request.reference, type: 'email_retried', actor: { type: 'admin', session: actor }, summary: 'confirmation' })
    audit(app, actor, 'quote.resend_confirmation', 'quote_request', id)
  })
  return { queued: true }
}

// ---- requests an administrator creates ----------------------------------------------------------------------------------

const MANUAL_TYPES: readonly RequestType[] = ['standard_inquiry', 'general_business', 'custom_service', 'custom_application', 'custom_website', 'package_quote']

/** A request typed in by hand (a phone call, a business card) or made from a message that arrived through the contact form. */
export function createByAdmin(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>, fromInquiryId: string | null): QuoteRow {
  const actor = requirePermission(session, 'requests:write')
  const fields = new Fields(body)
  const inquiry = fromInquiryId ? getInquiry(app.db, fromInquiryId) : undefined
  if (fromInquiryId && !inquiry) throw notFound('The message')
  const name = fields.text('name', { min: 2, max: 100, required: true })
  const email = fields.text('email', { max: 254, required: true }, (value) => (isEmail(value) ? undefined : 'invalidEmail'))
  const phone = fields.text('phone', { max: 30 }, (value) => (isPhone(value) ? undefined : 'invalidPhone'))
  const company = fields.text('company', { max: 100 })
  const website = fields.url('companyWebsite', { max: 200 })
  const description = fields.text('description', { min: 3, max: 4000, required: true, multiline: true })
  const budget = fields.text('budgetRange', { max: 80 })
  const language = fields.oneOf('language', LANGUAGES, { required: true }) as Language | null
  const typeValue = body.requestType === undefined || body.requestType === null || body.requestType === '' ? (inquiry ? 'general_business' : 'standard_inquiry') : body.requestType
  if (!isRequestType(typeValue) || !MANUAL_TYPES.includes(typeValue)) fields.fail('requestType', 'invalid')
  const priority = body.priority === undefined ? 'normal' : body.priority
  if (!isPriority(priority)) fields.fail('priority', 'invalid')
  fields.done()
  const now = iso(app.clock.now())
  const created = createQuoteRequest(app, {
    language: language!,
    kind: 'catalogue',
    requestType: typeValue as RequestType,
    source: inquiry ? 'contact_form' : 'other',
    name: name!,
    email: email!,
    phone,
    company,
    website,
    description: description!,
    objective: null,
    referenceNotes: null,
    timing: null,
    requirements: null,
    budgetRange: budget,
    briefJson: null,
    // The agreement to how the data is used was given to the website, not to the person typing: an inquiry's own consent carries over, a hand-typed request has none on record.
    consent: inquiry?.consent_at != null,
    marketingConsent: false,
    ipHash: null,
    contentHash: contentHashOf(app.config.appSecret, 'admin', email!, description!, now),
    items: [],
    priority: priority as QuoteRow['priority'],
    inquiryId: inquiry?.id ?? null,
    actor: { type: 'admin', session: actor },
  })
  audit(app, actor, inquiry ? 'quote.from_inquiry' : 'quote.create_manual', 'quote_request', created.row.id, { reference: created.row.reference })
  return created.row
}

// ---- numbers and exports --------------------------------------------------------------------------------------------------

export function overview(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'requests:read')
  const counts = quoteCounts(app.db)
  const of = (status: RequestStatus) => counts.byStatus[status] ?? 0
  return {
    ...counts,
    // The numbers the quotation page shows, counted from the database (archived requests are counted apart).
    open: {
      total: counts.total,
      new: of('new'),
      underReview: of('under_review'),
      waitingCustomer: of('waiting_customer'),
      quotePreparation: of('quote_preparation'),
      quoteSent: of('quote_sent'),
      accepted: of('accepted'),
      declined: of('declined'),
      activeProjects: of('in_progress'),
      completed: of('completed'),
      cancelled: of('cancelled'),
      archived: counts.archived,
    },
  }
}

/** One request, complete, as JSON: the thing to hand to whoever writes the quote, or to the customer who asks for their data. */
export function exportOne(app: AppContext, session: SessionInfo | null, id: string): Record<string, unknown> {
  const { quote, items, notes, pricing, quotations, revisions, history } = detailForAdmin(app, session, id)
  const { id: _id, ip_hash: _ip, content_hash: _hash, inquiry_id: _inquiry, brief_json: briefJson, ...visible } = quote
  // The brief of a FULL EXPERIENCE request is an object in the export, not the text it is stored as.
  return {
    ...visible,
    ...(briefJson ? { brief: readBrief(briefJson) } : {}),
    items,
    pricing,
    notes: notes.map((note) => ({ author: note.author_email, body: note.body, createdAt: note.created_at })),
    quotations: quotations.map(({ id: _quoteId, quote_request_id: _requestId, created_by: _by, supersedes_id: _supersedes, content_hash: _hash2, lines, view, form: _form, ...rest }) => ({
      ...rest,
      lines: lines.map((line) => ({ kind: line.kind, description: line.description, detail: line.detail, quantity: line.quantity, unitMinor: line.unit_minor, justification: line.justification })),
      view,
    })),
    revisionRequests: revisions.map((row) => ({ message: row.message, createdAt: row.created_at })),
    history: history.map(({ at, type, actorType, from, to, summary }) => ({ at, type, actorType, from, to, summary })),
  }
}

const summaryOf = (quote: QuoteRow, itemsText: string): unknown[] => [
  quote.reference, quote.created_at, quote.status, quote.request_type, quote.source, quote.priority, quote.name, quote.email, quote.phone, quote.language, quote.kind === 'full_experience' ? 'FULL EXPERIENCE' : itemsText, quote.objective, quote.timing, quote.budget_range,
  quote.description, quote.requirements, quote.reference_notes, quote.kind, quote.company, quote.website, quote.kind === 'full_experience' ? briefRows(quote, 'en').map((row) => `${row.label}: ${row.value}`).join('; ') : null,
]

/** The current list (all pages, same filters) as CSV; cells that a spreadsheet could run as a formula are neutralised (lib/csv.ts). */
export function exportCsv(app: AppContext, session: SessionInfo | null, query: URLSearchParams): string {
  requirePermission(session, 'requests:read')
  const filters = { ...parseQuoteQuery(query), page: 1, pageSize: 5000 }
  const { rows } = listQuotes(app.db, filters)
  return toCsv(
    ['reference', 'received', 'status', 'type', 'source', 'priority', 'name', 'email', 'phone', 'language', 'services', 'objective', 'timing', 'budget', 'description', 'requirements', 'references', 'kind', 'company', 'website', 'brief'],
    rows.map((quote) =>
      summaryOf(
        quote,
        quoteItems(app.db, quote.id)
          .map((item) => `${item.need}:${item.plan}${item.extras.length ? `+${item.extras.join('+')}` : ''}`)
          .join('; '),
      ),
    ),
  )
}
