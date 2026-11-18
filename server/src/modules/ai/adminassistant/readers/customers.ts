import { cut, LIMITS, likeOf, NOT_FOUND, pageOf, RECORD_ID } from '../model.ts'
import { inScope, scopeClause, scopeIds } from '../scope.ts'
import { link, listed, type ReadCtx } from './common.ts'

/**
 * Customers (client portal accounts) for the admin assistant. Permission: `clients:read`. The e-mail address is searchable (an administrator looks a customer up by it) but is
 * never returned, and neither are sign-in details, sessions, invitation data or the customer's audit trail. Nothing here infers anything about a person: only stored fields and
 * counts of stored records are returned.
 */

const NEED = 'clients:read'

interface CustomerRow {
  id: string
  name: string | null
  company: string | null
  language: string
  status: string
  origin: string
  created_at: string
  last_sign_in_at: string | null
  deletion_requested_at: string | null
}

export interface CustomerSearch {
  query?: string | undefined
  status?: string | undefined
  limit?: number | undefined
  page?: number | undefined
}

export function searchCustomers(ctx: ReadCtx, input: CustomerSearch) {
  ctx.access.need(NEED)
  const conditions: string[] = ['1 = 1']
  const params: Array<string | number> = []
  if (input.status) {
    conditions.push('c.status = ?')
    params.push(input.status)
  }
  if (input.query) {
    const like = likeOf(input.query)
    conditions.push("(c.name LIKE ? ESCAPE '!' OR c.company LIKE ? ESCAPE '!' OR c.email LIKE ? ESCAPE '!')")
    params.push(like, like, like)
  }
  const restricted = scopeClause(scopeIds(ctx.scope, 'customer'), 'c.id')
  const where = `${conditions.join(' AND ')}${restricted.sql}`
  const all = [...params, ...restricted.params]
  const page = pageOf(input)
  const total = ctx.app.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM customers c WHERE ${where}`, all)?.n ?? 0
  const rows = ctx.app.db.all<CustomerRow & { projects: number }>(
    `SELECT c.id, c.name, c.company, c.language, c.status, c.origin, c.created_at, c.last_sign_in_at, c.deletion_requested_at,
            (SELECT COUNT(*) FROM client_projects p WHERE p.customer_id = c.id) AS projects
       FROM customers c WHERE ${where} ORDER BY c.created_at DESC, c.id LIMIT ? OFFSET ?`,
    [...all, page.limit, page.offset],
  )
  return listed(
    ctx,
    rows.map((row) => ({
      // (`id`, not `customerId`: the shared tool guard refuses that key name in any result, and it is right to.)
      id: row.id,
      name: cut(row.name, 80),
      company: cut(row.company, 80),
      language: row.language,
      status: row.status,
      createdAt: row.created_at,
      projects: row.projects,
      deletionRequested: row.deletion_requested_at !== null,
      link: link.customer(row.id),
    })),
    total,
    page,
  )
}

export function customerById(ctx: ReadCtx, id: string | undefined): CustomerRow {
  ctx.access.need(NEED)
  const wanted = id ?? (ctx.scope.type === 'customer' ? ctx.scope.ref : null)
  if (!wanted || !RECORD_ID.test(wanted)) throw NOT_FOUND()
  const row = ctx.app.db.get<CustomerRow>('SELECT id, name, company, language, status, origin, created_at, last_sign_in_at, deletion_requested_at FROM customers WHERE id = ?', [wanted])
  if (!row || !inScope(ctx.scope, 'customer', row.id)) throw NOT_FOUND()
  return row
}

export function customerOverview(ctx: ReadCtx, id: string | undefined) {
  const customer = customerById(ctx, id)
  const { app } = ctx
  const projects = app.db.all<{ id: string; reference: string; name: string; status: string; expected_on: string | null; updated_at: string }>(
    'SELECT id, reference, name, status, expected_on, updated_at FROM client_projects WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 20',
    [customer.id],
  )
  const quotes = app.db.all<{ id: string; reference: string; status: string; priority: string; created_at: string }>(
    `SELECT DISTINCT q.id, q.reference, q.status, q.priority, q.created_at FROM quote_requests q
      WHERE q.id IN (SELECT quote_request_id FROM customer_links WHERE customer_id = ? AND quote_request_id IS NOT NULL
                     UNION SELECT quote_request_id FROM client_projects WHERE customer_id = ? AND quote_request_id IS NOT NULL)
      ORDER BY q.created_at DESC LIMIT 20`,
    [customer.id, customer.id],
  )
  const bookings = app.db.all<{ id: string; reference: string; status: string; start_at: string; time_zone: string }>(
    `SELECT b.id, b.reference, b.status, b.start_at, b.time_zone FROM bookings b WHERE b.id IN (SELECT booking_id FROM customer_links WHERE customer_id = ? AND booking_id IS NOT NULL) ORDER BY b.start_at DESC LIMIT 20`,
    [customer.id],
  )
  const conversations = app.db.all<{ reference: string; subject: string | null; status: string; last_message_at: string | null; last_sender: string | null }>(
    `SELECT c.reference, c.subject, c.status, c.last_message_at,
            (SELECT m.sender_type FROM conversation_messages m WHERE m.conversation_id = c.id AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL ORDER BY m.seq DESC LIMIT 1) AS last_sender
       FROM conversations c WHERE c.customer_id = ? AND c.kind = 'thread' ORDER BY c.last_activity_at DESC LIMIT 20`,
    [customer.id],
  )
  return {
    basis: 'actual' as const,
    id: customer.id,
    name: cut(customer.name, 80),
    company: cut(customer.company, 80),
    language: customer.language,
    accountStatus: customer.status,
    accountOrigin: customer.origin,
    customerSince: customer.created_at,
    lastSignInAt: customer.last_sign_in_at,
    deletionRequested: customer.deletion_requested_at !== null,
    projects: projects.map((row) => ({ reference: row.reference, name: cut(row.name, LIMITS.titleChars), status: row.status, expectedOn: row.expected_on, updatedAt: row.updated_at, link: link.project(row.reference, row.id) })),
    activeProjects: projects.filter((row) => !['completed', 'cancelled'].includes(row.status)).length,
    quoteRequests: quotes.map((row) => ({ reference: row.reference, status: row.status, priority: row.priority, receivedAt: row.created_at, link: link.quote(row.reference, row.id) })),
    consultations: bookings.map((row) => ({ reference: row.reference, status: row.status, startAt: row.start_at, timeZone: row.time_zone, link: link.consultation(row.reference, row.id) })),
    conversations: conversations.map((row) => ({
      reference: row.reference,
      subject: cut(row.subject, LIMITS.titleChars),
      status: row.status,
      lastMessageAt: row.last_message_at,
      waitingForYourReply: row.last_sender === 'customer',
      link: link.conversation(row.reference),
    })),
    link: link.customer(customer.id),
  }
}

/** The customer's recent activity, one line per stored event (a kind, a reference, a time): never what was written. */
export function customerActivity(ctx: ReadCtx, id: string | undefined, days: number) {
  const customer = customerById(ctx, id)
  const { app } = ctx
  const since = new Date(app.clock.now().getTime() - days * 86_400_000).toISOString()
  const items: Array<{ at: string; kind: string; reference: string | null }> = []
  for (const row of app.db.all<{ at: string; kind: string; reference: string }>(
    `SELECT e.created_at AS at, e.event_type AS kind, p.reference FROM client_project_events e JOIN client_projects p ON p.id = e.project_id WHERE p.customer_id = ? AND e.created_at >= ? ORDER BY e.created_at DESC LIMIT 25`,
    [customer.id, since],
  )) items.push({ at: row.at, kind: `project_${row.kind}`, reference: row.reference })
  for (const row of app.db.all<{ at: string; kind: string; reference: string }>(
    `SELECT e.created_at AS at, e.event_type AS kind, q.reference FROM quote_events e JOIN quote_requests q ON q.id = e.quote_request_id
      WHERE e.created_at >= ? AND e.quote_request_id IN (SELECT quote_request_id FROM customer_links WHERE customer_id = ? AND quote_request_id IS NOT NULL
                                                          UNION SELECT quote_request_id FROM client_projects WHERE customer_id = ? AND quote_request_id IS NOT NULL) ORDER BY e.created_at DESC LIMIT 25`,
    [since, customer.id, customer.id],
  )) items.push({ at: row.at, kind: `quote_${row.kind}`, reference: row.reference })
  for (const row of app.db.all<{ at: string; sender: string; reference: string }>(
    `SELECT m.created_at AS at, m.sender_type AS sender, c.reference FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE c.customer_id = ? AND c.kind = 'thread' AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL AND m.created_at >= ? ORDER BY m.created_at DESC LIMIT 25`,
    [customer.id, since],
  )) items.push({ at: row.at, kind: row.sender === 'customer' ? 'message_from_customer' : 'message_from_you', reference: row.reference })
  for (const row of app.db.all<{ at: string; kind: string; reference: string }>(
    `SELECT e.created_at AS at, e.event_type AS kind, b.reference FROM booking_events e JOIN bookings b ON b.id = e.booking_id
      WHERE e.created_at >= ? AND b.id IN (SELECT booking_id FROM customer_links WHERE customer_id = ? AND booking_id IS NOT NULL) ORDER BY e.created_at DESC LIMIT 25`,
    [since, customer.id],
  )) items.push({ at: row.at, kind: `consultation_${row.kind}`, reference: row.reference })
  items.sort((a, b) => (a.at < b.at ? 1 : -1))
  return { basis: 'actual' as const, period: { days, from: since, to: app.clock.now().toISOString() }, id: customer.id, items: items.slice(0, LIMITS.timelineMax), note: 'One line per stored event; message texts are not included.' }
}
