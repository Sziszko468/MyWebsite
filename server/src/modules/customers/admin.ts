import { LANGUAGES, type Language } from '../../config.ts'
import type { AppContext, SessionInfo } from '../../context.ts'
import { HttpError, notFound, validationFailed } from '../../http/errors.ts'
import { Fields, isEmail } from '../../lib/validate.ts'
import { cleanLine } from '../../lib/text.ts'
import { iso } from '../../lib/time.ts'
import { requirePermission } from '../auth/permissions.ts'
import { MILESTONE_STATUSES } from '../projectwork/model.ts'
import { normalizeEmail } from '../auth/users.ts'
import { audit } from '../system/audit.ts'
import { auditOf, findCustomerByEmail, getCustomer, insertCustomer, isDuplicate, portalSettings, recordAudit, savePortalSettings, type AuditView } from './accounts.ts'
import { canSendLinks, createLinkRequest } from './auth.ts'
import { linkByAdmin, unlinkByAdmin, unlinkedWithAddress, type Candidate } from './linking.ts'
import { queueClientMail } from './mail.ts'
import {
  PROJECT_CATEGORIES,
  PROJECT_STATUSES,
  PROJECT_TRANSITIONS,
  type CustomerRow,
  type DocumentRow,
  type LinkRow,
  type LinkType,
  type MilestoneRow,
  type PortalSettings,
  type ProjectCategory,
  type ProjectEventRow,
  type ProjectRow,
  type ProjectStatus,
} from './model.ts'
import { addMilestone, addNote, changeStatus, createProject, deleteMilestone, getProject, postUpdate, refuse, updateMilestone, updateProject } from './projects.ts'
import { clientSessionsOf, revokeClientSessions, type ClientSessionView } from './sessions.ts'

/**
 * The administration's side of the client portal. Reading customers needs `clients:read`; working on a customer's project (a status, a milestone, an
 * update, a private note) needs `clients:projects`; everything that touches an account (inviting, switching off, signing out, linking records, creating a
 * project) needs `clients:write`, which only an administrator has. The check is HERE, in the business function, so no route can forget it. Every sensitive
 * act is written twice: to the account's own history (what the customer's audit trail shows) and to the administration's audit log.
 *
 * Nothing returned carries a sign-in secret, a session token or its hash, or a link's secret: an administrator can see THAT a customer is signed in (and
 * from what kind of browser), never HOW.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/
export function validDay(value: string): boolean {
  if (!DAY.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

// ---- the owner's switches --------------------------------------------------------------------------------------------------------------

export function readSettings(app: AppContext, session: SessionInfo | null): PortalSettings & { canSendLinks: boolean } {
  requirePermission(session, 'clients:read')
  return { ...portalSettings(app), canSendLinks: canSendLinks(app) }
}

export function writeSettings(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): PortalSettings {
  const who = requirePermission(session, 'system:write')
  const current = portalSettings(app)
  const known = ['registration', 'selfLinking']
  if (Object.keys(body).length === 0 || !Object.keys(body).every((key) => known.includes(key))) throw validationFailed({ body: 'invalid' })
  for (const key of known) if (key in body && typeof body[key] !== 'boolean') throw validationFailed({ [key]: 'invalid' })
  const next = { registration: typeof body.registration === 'boolean' ? body.registration : current.registration, selfLinking: typeof body.selfLinking === 'boolean' ? body.selfLinking : current.selfLinking }
  savePortalSettings(app, next, who.userId)
  audit(app, who, 'clients.settings', 'portal', null, next)
  return next
}

// ---- the list -----------------------------------------------------------------------------------------------------------------------------

export interface ClientListRow {
  id: string
  email: string
  name: string | null
  company: string | null
  language: Language
  status: CustomerRow['status']
  origin: CustomerRow['origin']
  verified: boolean
  lastSignInAt: string | null
  deletionRequested: boolean
  createdAt: string
  projects: number
  records: number
}

const escapeLike = (value: string): string => value.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_')

export function listClients(app: AppContext, session: SessionInfo | null, query: URLSearchParams): { rows: ClientListRow[]; total: number; page: number; pageSize: number } {
  requirePermission(session, 'clients:read')
  const q = cleanLine(query.get('q') ?? '').slice(0, 100)
  const status = query.get('status')
  const page = Math.max(1, Math.min(10_000, Number.parseInt(query.get('page') ?? '1', 10) || 1))
  const size = Number.parseInt(query.get('pageSize') ?? '', 10)
  const pageSize = Number.isInteger(size) && size >= 1 ? Math.min(size, 100) : 25
  const where: string[] = []
  const params: Array<string | number> = []
  if (q) {
    where.push("(c.email LIKE ? ESCAPE '!' OR c.name LIKE ? ESCAPE '!' OR c.company LIKE ? ESCAPE '!')")
    const like = `%${escapeLike(q)}%`
    params.push(like, like, like)
  }
  if (status === 'invited' || status === 'active' || status === 'disabled') {
    where.push('c.status = ?')
    params.push(status)
  } else if (status === 'deletion') {
    where.push('c.deletion_requested_at IS NOT NULL')
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const total = app.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM customers c ${clause}`, params)?.n ?? 0
  const rows = app.db.all<CustomerRow & { projects: number; records: number }>(
    `SELECT c.*, (SELECT COUNT(*) FROM client_projects p WHERE p.customer_id = c.id) AS projects, (SELECT COUNT(*) FROM customer_links l WHERE l.customer_id = c.id) AS records
     FROM customers c ${clause} ORDER BY c.created_at DESC, c.id LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  )
  return {
    total,
    page,
    pageSize,
    rows: rows.map((row) => ({ id: row.id, email: row.email, name: row.name, company: row.company, language: row.language, status: row.status, origin: row.origin, verified: row.email_verified_at !== null, lastSignInAt: row.last_sign_in_at, deletionRequested: row.deletion_requested_at !== null, createdAt: row.created_at, projects: row.projects, records: row.records })),
  }
}

// ---- inviting ---------------------------------------------------------------------------------------------------------------------------

export function inviteClient(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): { id: string; emailQueued: boolean } {
  const who = requirePermission(session, 'clients:write')
  const fields = new Fields(body)
  const typed = fields.text('email', { max: 254, required: true }, (value) => (isEmail(normalizeEmail(value)) ? undefined : 'invalidEmail'))
  const name = fields.text('name', { max: 100 })
  const company = fields.text('company', { max: 120 })
  const language = fields.oneOf('language', LANGUAGES, { required: true })
  fields.done()
  const email = normalizeEmail(typed ?? '')
  if (findCustomerByEmail(app, email)) throw refuse('There is already an account for this address.', 'already_exists')
  return app.db.transaction(() => {
    let customer: CustomerRow
    try {
      customer = insertCustomer(app, { email, name, company, language: language as Language, status: 'invited', origin: 'invitation', verified: false, invitedBy: who.userId })
    } catch (error) {
      if (isDuplicate(error)) throw refuse('There is already an account for this address.', 'already_exists')
      throw error
    }
    recordAudit(app, { customerId: customer.id, type: 'invited', actor: { type: 'admin', id: who.userId } })
    audit(app, who, 'clients.invite', 'customer', customer.id)
    const emailQueued = canSendLinks(app) && createLinkRequest(app, { purpose: 'activate', customerId: customer.id, email, language: customer.language, ipHash: null })
    return { id: customer.id, emailQueued }
  })
}

// ---- one customer -------------------------------------------------------------------------------------------------------------------------

export interface ClientDetail {
  customer: {
    id: string
    email: string
    name: string | null
    company: string | null
    language: Language
    status: CustomerRow['status']
    origin: CustomerRow['origin']
    verifiedAt: string | null
    lastSignInAt: string | null
    deletionRequestedAt: string | null
    disabledAt: string | null
    createdAt: string
    invitedBy: string | null
  }
  sessions: ClientSessionView[]
  links: Array<{ id: string; type: LinkType; recordId: string; reference: string; method: LinkRow['method']; status: string; linkedAt: string }>
  candidates: Candidate[]
  projects: Array<{ id: string; reference: string; name: string; category: ProjectCategory; status: ProjectStatus; updatedAt: string; quoteRequestReference: string | null }>
  audit: AuditView[]
}

export function clientDetail(app: AppContext, session: SessionInfo | null, id: string): ClientDetail {
  requirePermission(session, 'clients:read')
  const customer = getCustomer(app, id)
  if (!customer) throw notFound('The customer')
  const invitedBy = customer.invited_by ? (app.db.get<{ email: string }>('SELECT email FROM admin_users WHERE id = ?', [customer.invited_by])?.email ?? null) : null
  const links = app.db.all<LinkRow & { q_reference: string | null; q_status: string | null; b_reference: string | null; b_status: string | null }>(
    `SELECT l.*, q.reference AS q_reference, q.customer_status AS q_status, b.reference AS b_reference, b.status AS b_status
     FROM customer_links l LEFT JOIN quote_requests q ON q.id = l.quote_request_id LEFT JOIN bookings b ON b.id = l.booking_id WHERE l.customer_id = ? ORDER BY l.created_at`,
    [id],
  )
  return {
    customer: { id: customer.id, email: customer.email, name: customer.name, company: customer.company, language: customer.language, status: customer.status, origin: customer.origin, verifiedAt: customer.email_verified_at, lastSignInAt: customer.last_sign_in_at, deletionRequestedAt: customer.deletion_requested_at, disabledAt: customer.disabled_at, createdAt: customer.created_at, invitedBy },
    sessions: clientSessionsOf(app, id, null),
    links: links.map((link) => ({ id: link.id, type: link.quote_request_id ? ('quote_request' as const) : ('booking' as const), recordId: (link.quote_request_id ?? link.booking_id)!, reference: (link.q_reference ?? link.b_reference)!, method: link.method, status: (link.q_status ?? link.b_status)!, linkedAt: link.created_at })),
    // Records that carry this address and belong to no account: for the owner to link on purpose. The address is NOT claimed to be verified here.
    candidates: unlinkedWithAddress(app, customer.email),
    projects: app.db
      .all<ProjectRow & { q_reference: string | null }>('SELECT p.*, q.reference AS q_reference FROM client_projects p LEFT JOIN quote_requests q ON q.id = p.quote_request_id WHERE p.customer_id = ? ORDER BY p.created_at DESC', [id])
      .map((row) => ({ id: row.id, reference: row.reference, name: row.name, category: row.category, status: row.status, updatedAt: row.updated_at, quoteRequestReference: row.q_reference })),
    audit: auditOf(app, id),
  }
}

const ACTIONS = ['disable', 'enable', 'revoke_sessions', 'send_link', 'clear_deletion_request'] as const

export function actOnClient(app: AppContext, session: SessionInfo | null, id: string, body: Record<string, unknown>): { ok: true; sessionsClosed?: number; emailQueued?: boolean } {
  const who = requirePermission(session, 'clients:write')
  const customer = getCustomer(app, id)
  if (!customer) throw notFound('The customer')
  const action = body.action
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) throw validationFailed({ action: 'invalid' })
  const actor = { type: 'admin' as const, id: who.userId }
  const now = iso(app.clock.now())
  return app.db.transaction(() => {
    switch (action) {
      case 'disable': {
        app.db.run("UPDATE customers SET status = 'disabled', disabled_at = ?, updated_at = ? WHERE id = ?", [now, now, id])
        revokeClientSessions(app, id)
        // A link already asked for no longer opens the way in.
        app.db.run('UPDATE customer_auth_tokens SET revoked_at = ? WHERE used_at IS NULL AND revoked_at IS NULL AND request_id IN (SELECT id FROM customer_auth_requests WHERE customer_id = ?)', [now, id])
        recordAudit(app, { customerId: id, type: 'disabled', actor })
        audit(app, who, 'clients.disable', 'customer', id)
        return { ok: true as const }
      }
      case 'enable': {
        if (customer.status !== 'disabled') throw refuse('This account is not switched off.', 'not_disabled')
        app.db.run('UPDATE customers SET status = ?, disabled_at = NULL, updated_at = ? WHERE id = ?', [customer.email_verified_at ? 'active' : 'invited', now, id])
        recordAudit(app, { customerId: id, type: 'enabled', actor })
        audit(app, who, 'clients.enable', 'customer', id)
        return { ok: true as const }
      }
      case 'revoke_sessions': {
        const closed = revokeClientSessions(app, id)
        const auditId = recordAudit(app, { customerId: id, type: 'sessions_revoked', actor, detail: 'by_admin' })
        audit(app, who, 'clients.sessions_revoked', 'customer', id, { sessionsClosed: closed })
        // The customer is told they were signed out, in their language.
        if (closed > 0) queueClientMail(app, { kind: 'client_security_notice', relatedType: 'client_audit', relatedId: String(auditId), recipient: customer.email, language: customer.language })
        return { ok: true as const, sessionsClosed: closed }
      }
      case 'send_link': {
        if (customer.status === 'disabled') throw refuse('This account is switched off.', 'customer_disabled')
        if (!canSendLinks(app)) throw refuse('E-mail is not set up, so no link can be sent.', 'email_unavailable')
        const queued = createLinkRequest(app, { purpose: customer.status === 'active' ? 'sign_in' : 'activate', customerId: id, email: customer.email, language: customer.language, ipHash: null })
        recordAudit(app, { customerId: id, type: 'invitation_resent', actor, detail: customer.status === 'active' ? 'sign_in' : 'activate' })
        audit(app, who, 'clients.send_link', 'customer', id)
        return { ok: true as const, emailQueued: queued }
      }
      default: {
        if (!customer.deletion_requested_at) throw refuse('No deletion was requested.', 'no_request')
        app.db.run('UPDATE customers SET deletion_requested_at = NULL, updated_at = ? WHERE id = ?', [now, id])
        recordAudit(app, { customerId: id, type: 'deletion_cancelled', actor, detail: 'by_admin' })
        audit(app, who, 'clients.deletion_cleared', 'customer', id)
        return { ok: true as const }
      }
    }
  })
}

export function linkRecord(app: AppContext, session: SessionInfo | null, id: string, body: Record<string, unknown>): { id: string } {
  const who = requirePermission(session, 'clients:write')
  const type = body.type
  const recordId = body.recordId
  if (type !== 'quote_request' && type !== 'booking') throw validationFailed({ type: 'invalid' })
  if (typeof recordId !== 'string' || recordId.length === 0 || recordId.length > 64) throw validationFailed({ recordId: 'invalid' })
  const linkId = linkByAdmin(app, who.userId, id, type, recordId)
  audit(app, who, 'clients.link', 'customer', id, { type })
  return { id: linkId }
}

export function unlinkRecord(app: AppContext, session: SessionInfo | null, id: string, linkId: string): void {
  const who = requirePermission(session, 'clients:write')
  unlinkByAdmin(app, who.userId, id, linkId)
  audit(app, who, 'clients.unlink', 'customer', id)
}

// ---- projects ------------------------------------------------------------------------------------------------------------------------------

function day(fields: Fields, name: string): string | null {
  return fields.text(name, { max: 10 }, (value) => (validDay(value) ? undefined : 'invalid'))
}

const optionalBoolean = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)

export function createClientProject(app: AppContext, session: SessionInfo | null, customerId: string, body: Record<string, unknown>): { id: string; reference: string } {
  const who = requirePermission(session, 'clients:write')
  const fields = new Fields(body)
  const name = fields.text('name', { max: 120, required: true })
  const category = fields.oneOf('category', PROJECT_CATEGORIES, { required: true })
  const startedOn = day(fields, 'startedOn')
  const expectedOn = day(fields, 'expectedOn')
  const quoteRequestId = fields.text('quoteRequestId', { max: 64 })
  fields.done()
  const project = createProject(app, who.userId, customerId, { name: name!, category: category as ProjectCategory, startedOn, expectedOn, quoteRequestId, notify: optionalBoolean(body.notify) ?? true })
  audit(app, who, 'clients.project_created', 'client_project', project.id)
  return { id: project.id, reference: project.reference }
}

export interface ProjectAdminView {
  project: ProjectRow
  customer: { id: string; email: string; name: string | null; language: Language; status: CustomerRow['status'] }
  quoteRequestReference: string | null
  allowedStatuses: readonly ProjectStatus[]
  milestones: MilestoneRow[]
  events: Array<ProjectEventRow & { adminEmail: string | null }>
  notes: Array<{ id: string; body: string; createdAt: string; authorEmail: string | null }>
  documents: DocumentRow[]
  /** Said plainly so the screen can: files cannot be published until the site has a private store for them. */
  documentsCanBePublished: false
}

export function projectDetail(app: AppContext, session: SessionInfo | null, id: string): ProjectAdminView {
  requirePermission(session, 'clients:read')
  const project = getProject(app, id)
  if (!project) throw notFound('The project')
  const customer = getCustomer(app, project.customer_id)
  if (!customer) throw notFound('The customer')
  return {
    project,
    customer: { id: customer.id, email: customer.email, name: customer.name, language: customer.language, status: customer.status },
    quoteRequestReference: project.quote_request_id ? (app.db.get<{ reference: string }>('SELECT reference FROM quote_requests WHERE id = ?', [project.quote_request_id])?.reference ?? null) : null,
    allowedStatuses: PROJECT_TRANSITIONS[project.status],
    milestones: app.db.all<MilestoneRow>('SELECT * FROM client_milestones WHERE project_id = ? ORDER BY position', [id]),
    events: app.db.all<ProjectEventRow & { admin_email: string | null }>("SELECT e.*, u.email AS admin_email FROM client_project_events e LEFT JOIN admin_users u ON e.actor_type = 'admin' AND u.id = e.actor_id WHERE e.project_id = ? ORDER BY e.id DESC", [id]).map(({ admin_email, ...event }) => ({ ...event, adminEmail: admin_email })),
    notes: app.db.all<{ id: string; body: string; created_at: string; email: string | null }>('SELECT n.id, n.body, n.created_at, u.email FROM client_project_notes n LEFT JOIN admin_users u ON u.id = n.author_id WHERE n.project_id = ? ORDER BY n.created_at DESC', [id]).map((row) => ({ id: row.id, body: row.body, createdAt: row.created_at, authorEmail: row.email })),
    documents: app.db.all<DocumentRow>('SELECT * FROM client_documents WHERE project_id = ? ORDER BY created_at DESC', [id]),
    documentsCanBePublished: false,
  }
}

export function editClientProject(app: AppContext, session: SessionInfo | null, id: string, body: Record<string, unknown>): ProjectRow {
  const who = requirePermission(session, 'clients:projects')
  const known = ['name', 'category', 'startedOn', 'expectedOn']
  if (Object.keys(body).length === 0 || !Object.keys(body).every((key) => known.includes(key))) throw validationFailed({ body: 'invalid' })
  const fields = new Fields(body)
  const changes: Parameters<typeof updateProject>[3] = {}
  if ('name' in body) changes.name = fields.text('name', { max: 120, required: true }) ?? undefined
  if ('category' in body) changes.category = (fields.oneOf('category', PROJECT_CATEGORIES, { required: true }) ?? undefined) as ProjectCategory | undefined
  if ('startedOn' in body) changes.startedOn = day(fields, 'startedOn')
  if ('expectedOn' in body) changes.expectedOn = day(fields, 'expectedOn')
  fields.done()
  const project = updateProject(app, who.userId, id, changes)
  audit(app, who, 'clients.project_edited', 'client_project', id)
  return project
}

export function setProjectStatus(app: AppContext, session: SessionInfo | null, id: string, body: Record<string, unknown>): ProjectRow {
  const who = requirePermission(session, 'clients:projects')
  const fields = new Fields(body)
  const status = fields.oneOf('status', PROJECT_STATUSES, { required: true })
  const note = fields.text('note', { max: 500, multiline: true })
  fields.done()
  const project = changeStatus(app, who.userId, id, status as ProjectStatus, note, optionalBoolean(body.notify))
  audit(app, who, 'clients.project_status', 'client_project', id, { status })
  return project
}

export function addProjectMilestone(app: AppContext, session: SessionInfo | null, id: string, body: Record<string, unknown>): MilestoneRow {
  const who = requirePermission(session, 'clients:projects')
  const fields = new Fields(body)
  const title = fields.text('title', { max: 120, required: true })
  const description = fields.text('description', { max: 1000, multiline: true })
  const dueOn = day(fields, 'dueOn')
  const customerVisible = 'customerVisible' in body ? body.customerVisible : undefined
  if (customerVisible !== undefined && typeof customerVisible !== 'boolean') fields.fail('customerVisible', 'invalid')
  fields.done()
  return addMilestone(app, who.userId, id, { title: title!, dueOn, description, customerVisible: customerVisible as boolean | undefined })
}

export function editProjectMilestone(app: AppContext, session: SessionInfo | null, id: string, milestoneId: string, body: Record<string, unknown>): MilestoneRow {
  const who = requirePermission(session, 'clients:projects')
  const known = ['title', 'description', 'dueOn', 'status', 'customerVisible', 'done']
  if (Object.keys(body).length === 0 || !Object.keys(body).every((key) => known.includes(key))) throw validationFailed({ body: 'invalid' })
  const fields = new Fields(body)
  const changes: Parameters<typeof updateMilestone>[4] = {}
  if ('title' in body) changes.title = fields.text('title', { max: 120, required: true }) ?? undefined
  if ('description' in body) changes.description = fields.text('description', { max: 1000, multiline: true })
  if ('dueOn' in body) changes.dueOn = day(fields, 'dueOn')
  if ('status' in body) changes.status = fields.oneOf('status', MILESTONE_STATUSES, { required: true }) ?? undefined
  if ('customerVisible' in body) {
    if (typeof body.customerVisible !== 'boolean') fields.fail('customerVisible', 'invalid')
    else changes.customerVisible = body.customerVisible
  }
  if ('done' in body) {
    if (typeof body.done !== 'boolean') fields.fail('done', 'invalid')
    else changes.done = body.done
  }
  fields.done()
  return updateMilestone(app, who.userId, id, milestoneId, changes)
}

export function removeProjectMilestone(app: AppContext, session: SessionInfo | null, id: string, milestoneId: string): void {
  requirePermission(session, 'clients:projects')
  deleteMilestone(app, id, milestoneId)
}

export function postProjectUpdate(app: AppContext, session: SessionInfo | null, id: string, body: Record<string, unknown>): { id: number } {
  const who = requirePermission(session, 'clients:projects')
  const fields = new Fields(body)
  const kind = fields.oneOf('kind', ['update', 'feedback'] as const, { required: true })
  const note = fields.text('note', { max: 1000, min: 2, multiline: true, required: true })
  fields.done()
  const eventId = postUpdate(app, who.userId, id, { kind: kind as 'update' | 'feedback', note: note!, notify: optionalBoolean(body.notify) })
  audit(app, who, 'clients.project_update', 'client_project', id, { kind })
  return { id: eventId }
}

export function addProjectNote(app: AppContext, session: SessionInfo | null, id: string, body: Record<string, unknown>): { id: string } {
  const who = requirePermission(session, 'clients:projects')
  const fields = new Fields(body)
  const text = fields.text('body', { max: 2000, multiline: true, required: true })
  fields.done()
  return { id: addNote(app, who.userId, id, text!) }
}

/**
 * Publishing a document is not possible yet: the site has no private place for a file (docs/client-portal/DOCUMENTS.md), and a document that is published
 * must have one (the database refuses otherwise). The refusal is explicit rather than a quiet success, so nobody believes a customer can see a file.
 */
export function publishProjectDocument(app: AppContext, session: SessionInfo | null, id: string, documentId: string): never {
  requirePermission(session, 'clients:projects')
  const found = app.db.get('SELECT 1 FROM client_documents WHERE id = ? AND project_id = ?', [documentId, id])
  if (!found) throw notFound('The document')
  throw new HttpError(409, 'conflict', 'Documents cannot be published until the site has a private place to keep them.', { details: { reason: 'storage_unavailable' } })
}

