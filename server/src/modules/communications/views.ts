import type { AppContext } from '../../context.ts'
import type { Param } from '../../db/database.ts'
import { notFound } from '../../http/errors.ts'
import { type ContextType, type ConversationRow, type ConversationStatus, type EventKey, type MessageRow } from './model.ts'
import { adminUnreadTotals, customerUnreadTotal, readMarker, sql } from './reads.ts'
import { decodeCursor, encodeCursor, likePattern, snippet } from './search.ts'

/**
 * What is shown, for the customer and for the administration (PROMPT 28). The two read models are separate on purpose and both select NAMED columns:
 *
 *  - the customer's reads `visibility = 'customer'` in SQL, never an administrator's e-mail or id, never a private note, never the words of a removed message, and only the
 *    conversations of the customer in the session (a conversation that is not theirs, or is a thread nobody has written a visible word in, is a 404, the same as one that is not there);
 *  - the administration's reads everything, tells the customer's words from the owner's and from the private notes, and says who wrote what.
 *
 * Unread counts are computed (reads.ts), not stored. Dates are ISO instants; the screens format them in the reader's language.
 */

type Db = Pick<AppContext, 'db'>

export interface ContextView {
  type: ContextType
  reference: string
  title: string | null
}

/** The record a thread is about, as the customer sees it (a title they can already see in the portal). A record that is gone is `null`. */
export function contextOf(app: Db, row: Pick<ConversationRow, 'context_type' | 'context_id'>): ContextView | null {
  if (!row.context_type || !row.context_id) return null
  const id = row.context_id
  switch (row.context_type) {
    case 'project': {
      const found = app.db.get<{ reference: string; name: string }>('SELECT reference, name FROM client_projects WHERE id = ?', [id])
      return found ? { type: 'project', reference: found.reference, title: found.name } : null
    }
    case 'deliverable': {
      const found = app.db.get<{ reference: string; title: string }>('SELECT reference, title FROM deliverables WHERE id = ?', [id])
      return found ? { type: 'deliverable', reference: found.reference, title: found.title } : null
    }
    case 'task': {
      const found = app.db.get<{ reference: string; title: string }>('SELECT reference, title FROM project_tasks WHERE id = ?', [id])
      return found ? { type: 'task', reference: found.reference, title: found.title } : null
    }
    case 'booking': {
      const found = app.db.get<{ reference: string }>('SELECT reference FROM bookings WHERE id = ?', [id])
      return found ? { type: 'booking', reference: found.reference, title: null } : null
    }
    case 'quote': {
      const found = app.db.get<{ reference: string }>('SELECT reference FROM quote_requests WHERE id = ?', [id])
      return found ? { type: 'quote', reference: found.reference, title: null } : null
    }
    default:
      return null
  }
}

const preview = (body: string | null): string | null => (body ? body.replace(/\s+/g, ' ').trim().slice(0, 140) : null)

// ============================== the customer ==================================================================================

export interface PortalConversationSummary {
  reference: string
  kind: 'thread' | 'activity'
  subject: string | null
  status: ConversationStatus
  project: { reference: string; name: string } | null
  context: ContextView | null
  lastMessageAt: string | null
  lastActivityAt: string
  lastSender: 'you' | 'studio' | null
  preview: string | null
  removed: boolean
  unread: number
  resolutionRequested: boolean
  snippet?: string | null
}

export type InboxFilter = 'all' | 'unread' | 'open' | 'resolved'
export const INBOX_FILTERS: readonly InboxFilter[] = ['all', 'unread', 'open', 'resolved']

interface InboxRow extends ConversationRow {
  unread: number
  project_reference: string | null
  project_name: string | null
  last_body: string | null
  last_sender: 'customer' | 'admin' | null
  last_deleted: string | null
}

export function customerSummary(app: Db, customerId: string): { unread: number } {
  return { unread: customerUnreadTotal(app, customerId) }
}

export function customerInbox(app: Db, customerId: string, query: { filter: InboxFilter; cursor: string | null; limit: number; q?: string | null }): { items: PortalConversationSummary[]; next: string | null } {
  const where: string[] = ['c.customer_id = ?', "(c.kind = 'activity' OR c.last_message_at IS NOT NULL)"]
  const params: Param[] = [customerId, customerId]
  if (query.filter === 'unread') where.push(`c.kind = 'thread' AND ${sql.customerUnread} > 0`)
  else if (query.filter === 'open') where.push(`c.kind = 'thread' AND c.status IN (${sql.active})`)
  else if (query.filter === 'resolved') where.push("c.kind = 'thread' AND c.status IN ('resolved', 'archived')")
  if (query.q) {
    const pattern = likePattern(query.q)
    where.push(
      `c.kind = 'thread' AND (c.subject LIKE ? ESCAPE '\\' OR c.reference LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM client_projects pp WHERE pp.id = c.project_id AND (pp.reference LIKE ? ESCAPE '\\' OR pp.name LIKE ? ESCAPE '\\'))
        OR EXISTS (SELECT 1 FROM conversation_messages sm WHERE sm.conversation_id = c.id AND sm.visibility = 'customer' AND sm.message_type <> 'system_event' AND sm.deleted_at IS NULL AND sm.body LIKE ? ESCAPE '\\'))`,
    )
    params.push(pattern, pattern, pattern, pattern, pattern)
  }
  const cursor = decodeCursor(query.cursor)
  if (cursor) {
    where.push('(c.last_activity_at < ? OR (c.last_activity_at = ? AND c.id < ?))')
    params.push(cursor.at, cursor.at, cursor.id)
  }
  const rows = app.db.all<InboxRow>(
    `SELECT c.*, ${sql.customerUnread} AS unread, p.reference AS project_reference, p.name AS project_name,
            lm.body AS last_body, lm.sender_type AS last_sender, lm.deleted_at AS last_deleted
     FROM conversations c
     LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.reader_type = 'customer' AND r.reader_id = ?
     LEFT JOIN client_projects p ON p.id = c.project_id
     LEFT JOIN conversation_messages lm ON lm.seq = (SELECT MAX(m2.seq) FROM conversation_messages m2 WHERE m2.conversation_id = c.id AND m2.visibility = 'customer' AND m2.message_type IN ('text', 'announcement'))
     WHERE ${where.join(' AND ')}
     ORDER BY c.last_activity_at DESC, c.id DESC LIMIT ?`,
    [...params, query.limit + 1],
  )
  const page = rows.slice(0, query.limit)
  const items = page.map((row): PortalConversationSummary => ({
    reference: row.reference,
    kind: row.kind,
    subject: row.subject,
    status: row.status,
    project: row.project_reference ? { reference: row.project_reference, name: row.project_name! } : null,
    context: contextOf(app, row),
    lastMessageAt: row.last_message_at,
    lastActivityAt: row.last_activity_at,
    lastSender: row.last_sender === 'customer' ? 'you' : row.last_sender === 'admin' ? 'studio' : null,
    preview: row.last_deleted ? null : preview(row.last_body),
    removed: row.last_deleted !== null,
    unread: row.kind === 'thread' ? row.unread : 0,
    resolutionRequested: row.resolution_requested_at !== null,
  }))
  const last = page[page.length - 1]
  return { items, next: rows.length > query.limit && last ? encodeCursor(last.last_activity_at, last.id) : null }
}

/** The customer's search: their own threads, by subject, project, reference and the customer-visible words, each with a few words around the match. */
export function customerSearch(app: Db, customerId: string, term: string, limit: number): { items: PortalConversationSummary[] } {
  const { items } = customerInbox(app, customerId, { filter: 'all', cursor: null, limit, q: term })
  const pattern = likePattern(term)
  for (const item of items) {
    const match = app.db.get<{ body: string }>(
      `SELECT m.body FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE c.reference = ? AND c.customer_id = ? AND m.visibility = 'customer' AND m.message_type <> 'system_event' AND m.deleted_at IS NULL AND m.body LIKE ? ESCAPE '\\' ORDER BY m.seq DESC LIMIT 1`,
      [item.reference, customerId, pattern],
    )
    item.snippet = match ? snippet(match.body, term) : null
  }
  return { items }
}

export interface PortalMessage {
  id: string
  seq: number
  type: 'text' | 'announcement' | 'system_event'
  from: 'you' | 'studio' | 'system'
  body: string | null
  removed: boolean
  important: boolean
  event: { key: EventKey; params: Record<string, string | number | boolean | null> } | null
  createdAt: string
  /** The event comes from the project's activity feed, not from this conversation. */
  feed: boolean
}

export interface PortalConversation extends Omit<PortalConversationSummary, 'preview' | 'removed' | 'lastSender' | 'snippet'> {
  startedBy: 'customer' | 'admin' | 'system'
  createdAt: string
  messages: PortalMessage[]
  page: { hasOlder: boolean; oldestSeq: number | null; newestSeq: number | null }
  /** The highest message the customer has been shown. */
  marker: number
  can: { reply: boolean; requestResolution: boolean }
}

type TimelineRow = MessageRow & { admin_email: string | null }

/** The messages of a conversation as one timeline: its own, and (for a conversation about a project) the events of that project's activity feed from the moment it began. */
function timelineRows(app: Db, conversation: ConversationRow, scope: 'customer' | 'admin', before: number | null, limit: number): { rows: TimelineRow[]; hasOlder: boolean } {
  const feed =
    conversation.kind === 'thread' && conversation.project_id
      ? app.db.get<{ id: string }>("SELECT id FROM conversations WHERE kind = 'activity' AND customer_id = ? AND project_id = ?", [conversation.customer_id, conversation.project_id])
      : undefined
  // The feed's events from the moment the conversation began (by sequence, not by the clock: two things in the same millisecond still have an order).
  const began = app.db.get<{ first: number | null }>('SELECT MIN(seq) AS first FROM conversation_messages WHERE conversation_id = ?', [conversation.id])?.first ?? 0
  const where: string[] = ['(m.conversation_id = ? OR (m.conversation_id = ? AND m.seq > ?))']
  const params: Param[] = [conversation.id, feed?.id ?? '', began]
  if (scope === 'customer') where.push("m.visibility = 'customer'")
  if (before !== null) {
    where.push('m.seq < ?')
    params.push(before)
  }
  const rows = app.db.all<TimelineRow>(
    `SELECT m.*, u.email AS admin_email FROM conversation_messages m LEFT JOIN admin_users u ON u.id = m.sender_id AND m.sender_type = 'admin'
     WHERE ${where.join(' AND ')} ORDER BY m.seq DESC LIMIT ?`,
    [...params, limit + 1],
  )
  return { rows: rows.slice(0, limit).reverse(), hasOlder: rows.length > limit }
}

function parseParams(raw: string | null): Record<string, string | number | boolean | null> {
  if (!raw) return {}
  try {
    const value = JSON.parse(raw) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, string | number | boolean | null>) : {}
  } catch {
    return {}
  }
}

const portalMessage = (row: TimelineRow, conversationId: string): PortalMessage => ({
  id: row.id,
  seq: row.seq,
  type: row.message_type,
  from: row.sender_type === 'customer' ? 'you' : row.sender_type === 'admin' ? 'studio' : 'system',
  body: row.deleted_at ? null : row.body,
  removed: row.deleted_at !== null,
  important: row.important === 1,
  event: row.message_type === 'system_event' && row.event_key ? { key: row.event_key, params: parseParams(row.event_params) } : null,
  createdAt: row.created_at,
  feed: row.conversation_id !== conversationId,
})

/** The customer's own conversation (or activity feed), by reference. Not theirs, or not visible to them yet: a 404 like any other. */
export function ownConversation(app: Db, customerId: string, reference: string): ConversationRow {
  const row = app.db.get<ConversationRow>('SELECT * FROM conversations WHERE reference = ? AND customer_id = ?', [reference, customerId])
  if (!row || (row.kind === 'thread' && row.last_message_at === null)) throw notFound('The conversation')
  return row
}

export function customerConversation(app: Db, customerId: string, reference: string, query: { before: number | null; limit: number }): PortalConversation {
  const conversation = ownConversation(app, customerId, reference)
  const { rows, hasOlder } = timelineRows(app, conversation, 'customer', query.before, query.limit)
  const project = conversation.project_id ? app.db.get<{ reference: string; name: string }>('SELECT reference, name FROM client_projects WHERE id = ?', [conversation.project_id]) : undefined
  const unread = conversation.kind === 'thread' ? (app.db.get<{ n: number }>(
    `SELECT ${sql.customerUnread} AS n FROM conversations c LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.reader_type = 'customer' AND r.reader_id = ? WHERE c.id = ?`,
    [customerId, conversation.id],
  )?.n ?? 0) : 0
  const open = conversation.kind === 'thread' && conversation.status !== 'archived'
  return {
    reference: conversation.reference,
    kind: conversation.kind,
    subject: conversation.subject,
    status: conversation.status,
    startedBy: conversation.started_by,
    project: project ?? null,
    context: contextOf(app, conversation),
    createdAt: conversation.created_at,
    lastMessageAt: conversation.last_message_at,
    lastActivityAt: conversation.last_activity_at,
    unread,
    resolutionRequested: conversation.resolution_requested_at !== null,
    messages: rows.map((row) => portalMessage(row, conversation.id)),
    page: { hasOlder, oldestSeq: rows[0]?.seq ?? null, newestSeq: rows[rows.length - 1]?.seq ?? null },
    marker: readMarker(app, conversation.id, { type: 'customer', id: customerId }),
    can: { reply: open, requestResolution: open && conversation.status !== 'resolved' && conversation.resolution_requested_at === null },
  }
}

// ============================== the administration ============================================================================

export interface AdminCustomerView {
  id: string
  name: string | null
  email: string
  company: string | null
  language: string
  status: string
}

export interface AdminConversationSummary {
  reference: string
  subject: string
  status: ConversationStatus
  startedBy: 'customer' | 'admin'
  customer: AdminCustomerView
  project: { id: string; reference: string; name: string } | null
  context: ContextView | null
  lastMessageAt: string | null
  lastActivityAt: string
  lastSender: 'customer' | 'owner' | null
  preview: string | null
  unread: number
  notes: number
  resolutionRequested: boolean
  snippet?: string | null
  inNote?: boolean
}

export type AdminFilter = 'all' | 'unread' | 'open' | 'waiting_owner' | 'waiting_customer' | 'resolved' | 'archived'
export const ADMIN_FILTERS: readonly AdminFilter[] = ['all', 'unread', 'open', 'waiting_owner', 'waiting_customer', 'resolved', 'archived']

interface AdminInboxRow extends ConversationRow {
  unread: number
  notes: number
  c_name: string | null
  c_email: string
  c_company: string | null
  c_language: string
  c_status: string
  p_reference: string | null
  p_name: string | null
  last_body: string | null
  last_sender: 'customer' | 'admin' | null
  last_deleted: string | null
}

export interface AdminInboxQuery {
  filter: AdminFilter
  customerId: string | null
  projectId: string | null
  contextType: ContextType | null
  from: string | null
  to: string | null
  cursor: string | null
  limit: number
  q?: string | null
}

const adminSummary = (app: Db, row: AdminInboxRow): AdminConversationSummary => ({
  reference: row.reference,
  subject: row.subject ?? '',
  status: row.status,
  startedBy: row.started_by === 'customer' ? 'customer' : 'admin',
  customer: { id: row.customer_id, name: row.c_name, email: row.c_email, company: row.c_company, language: row.c_language, status: row.c_status },
  project: row.project_id ? { id: row.project_id, reference: row.p_reference!, name: row.p_name! } : null,
  context: contextOf(app, row),
  lastMessageAt: row.last_message_at,
  lastActivityAt: row.last_activity_at,
  lastSender: row.last_sender === 'customer' ? 'customer' : row.last_sender === 'admin' ? 'owner' : null,
  preview: row.last_deleted ? null : preview(row.last_body),
  unread: row.unread,
  notes: row.notes,
  resolutionRequested: row.resolution_requested_at !== null,
})

export function adminInbox(app: Db, adminId: string, query: AdminInboxQuery): { items: AdminConversationSummary[]; next: string | null } {
  const where: string[] = ["c.kind = 'thread'"]
  const params: Param[] = [adminId]
  if (query.filter === 'unread') where.push(`${sql.adminUnread} > 0`)
  else if (query.filter === 'open') where.push(`c.status IN (${sql.active})`)
  else if (query.filter !== 'all') {
    where.push('c.status = ?')
    params.push(query.filter)
  }
  if (query.customerId) {
    where.push('c.customer_id = ?')
    params.push(query.customerId)
  }
  if (query.projectId) {
    where.push('c.project_id = ?')
    params.push(query.projectId)
  }
  if (query.contextType) {
    where.push('c.context_type = ?')
    params.push(query.contextType)
  }
  if (query.from) {
    where.push('c.last_activity_at >= ?')
    params.push(`${query.from}T00:00:00.000Z`)
  }
  if (query.to) {
    where.push('c.last_activity_at <= ?')
    params.push(`${query.to}T23:59:59.999Z`)
  }
  if (query.q) {
    const pattern = likePattern(query.q)
    where.push(
      `(c.subject LIKE ? ESCAPE '\\' OR c.reference LIKE ? ESCAPE '\\' OR cu.name LIKE ? ESCAPE '\\' OR cu.email LIKE ? ESCAPE '\\' OR cu.company LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM client_projects pp WHERE pp.id = c.project_id AND (pp.reference LIKE ? ESCAPE '\\' OR pp.name LIKE ? ESCAPE '\\'))
        OR EXISTS (SELECT 1 FROM conversation_messages sm WHERE sm.conversation_id = c.id AND sm.message_type <> 'system_event' AND sm.deleted_at IS NULL AND sm.body LIKE ? ESCAPE '\\'))`,
    )
    params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern, pattern)
  }
  const cursor = decodeCursor(query.cursor)
  if (cursor) {
    where.push('(c.last_activity_at < ? OR (c.last_activity_at = ? AND c.id < ?))')
    params.push(cursor.at, cursor.at, cursor.id)
  }
  const rows = app.db.all<AdminInboxRow>(
    `SELECT c.*, ${sql.adminUnread} AS unread,
            (SELECT COUNT(*) FROM conversation_messages n WHERE n.conversation_id = c.id AND n.visibility = 'internal' AND n.deleted_at IS NULL) AS notes,
            cu.name AS c_name, cu.email AS c_email, cu.company AS c_company, cu.language AS c_language, cu.status AS c_status,
            p.reference AS p_reference, p.name AS p_name,
            lm.body AS last_body, lm.sender_type AS last_sender, lm.deleted_at AS last_deleted
     FROM conversations c
     JOIN customers cu ON cu.id = c.customer_id
     LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.reader_type = 'admin' AND r.reader_id = ?
     LEFT JOIN client_projects p ON p.id = c.project_id
     LEFT JOIN conversation_messages lm ON lm.seq = (SELECT MAX(m2.seq) FROM conversation_messages m2 WHERE m2.conversation_id = c.id AND m2.visibility = 'customer' AND m2.message_type IN ('text', 'announcement'))
     WHERE ${where.join(' AND ')}
     ORDER BY c.last_activity_at DESC, c.id DESC LIMIT ?`,
    [...params, query.limit + 1],
  )
  const page = rows.slice(0, query.limit)
  const last = page[page.length - 1]
  return { items: page.map((row) => adminSummary(app, row)), next: rows.length > query.limit && last ? encodeCursor(last.last_activity_at, last.id) : null }
}

/** The administration's search: everything the inbox searches, and the private notes (which is why only an administrator's route may call it). */
export function adminSearch(app: Db, adminId: string, term: string, limit: number): { items: AdminConversationSummary[] } {
  const { items } = adminInbox(app, adminId, { filter: 'all', customerId: null, projectId: null, contextType: null, from: null, to: null, cursor: null, limit, q: term })
  const pattern = likePattern(term)
  // Conversations that match only through a private note.
  const viaNotes = app.db.all<AdminInboxRow>(
    `SELECT c.*, 0 AS unread, 0 AS notes, cu.name AS c_name, cu.email AS c_email, cu.company AS c_company, cu.language AS c_language, cu.status AS c_status,
            p.reference AS p_reference, p.name AS p_name, NULL AS last_body, NULL AS last_sender, NULL AS last_deleted
     FROM conversations c JOIN customers cu ON cu.id = c.customer_id LEFT JOIN client_projects p ON p.id = c.project_id
     WHERE c.kind = 'thread' AND EXISTS (SELECT 1 FROM conversation_messages n WHERE n.conversation_id = c.id AND n.visibility = 'internal' AND n.deleted_at IS NULL AND n.body LIKE ? ESCAPE '\\')
     ORDER BY c.last_activity_at DESC LIMIT ?`,
    [pattern, limit],
  )
  const known = new Set(items.map((item) => item.reference))
  for (const row of viaNotes) if (!known.has(row.reference) && items.length < limit) items.push({ ...adminSummary(app, row), inNote: true })
  for (const item of items) {
    const match = app.db.get<{ body: string; visibility: string }>(
      `SELECT m.body, m.visibility FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id
       WHERE c.reference = ? AND m.message_type <> 'system_event' AND m.deleted_at IS NULL AND m.body LIKE ? ESCAPE '\\' ORDER BY m.seq DESC LIMIT 1`,
      [item.reference, pattern],
    )
    item.snippet = match ? snippet(match.body, term) : null
    item.inNote = item.inNote === true || match?.visibility === 'internal'
  }
  return { items }
}

export interface AdminMessage {
  id: string
  seq: number
  type: 'text' | 'announcement' | 'system_event'
  visibility: 'customer' | 'internal'
  from: 'customer' | 'owner' | 'system'
  adminEmail: string | null
  mine: boolean
  body: string | null
  removed: boolean
  edited: boolean
  important: boolean
  event: { key: EventKey; params: Record<string, string | number | boolean | null> } | null
  createdAt: string
  feed: boolean
}

export interface AdminConversation extends AdminConversationSummary {
  createdAt: string
  revision: number
  messages: AdminMessage[]
  page: { hasOlder: boolean; oldestSeq: number | null; newestSeq: number | null }
  marker: number
  messageCountTotal: number
}

const adminMessage = (row: TimelineRow, conversationId: string, adminId: string): AdminMessage => ({
  id: row.id,
  seq: row.seq,
  type: row.message_type,
  visibility: row.visibility,
  from: row.sender_type === 'customer' ? 'customer' : row.sender_type === 'admin' ? 'owner' : 'system',
  adminEmail: row.sender_type === 'admin' ? row.admin_email : null,
  mine: row.sender_type === 'admin' && row.sender_id === adminId,
  // The words of a removed message stay in the record; the screens say it was removed.
  body: row.deleted_at ? null : row.body,
  removed: row.deleted_at !== null,
  edited: row.edited_at !== null,
  important: row.important === 1,
  event: row.message_type === 'system_event' && row.event_key ? { key: row.event_key, params: parseParams(row.event_params) } : null,
  createdAt: row.created_at,
  feed: row.conversation_id !== conversationId,
})

export function adminConversationRow(app: Db, reference: string): ConversationRow {
  const row = app.db.get<ConversationRow>("SELECT * FROM conversations WHERE reference = ? AND kind = 'thread'", [reference])
  if (!row) throw notFound('The conversation')
  return row
}

export function adminConversation(app: Db, adminId: string, reference: string, query: { before: number | null; limit: number }): AdminConversation {
  const conversation = adminConversationRow(app, reference)
  const { rows, hasOlder } = timelineRows(app, conversation, 'admin', query.before, query.limit)
  const summaryRow = app.db.get<AdminInboxRow>(
    `SELECT c.*, ${sql.adminUnread} AS unread,
            (SELECT COUNT(*) FROM conversation_messages n WHERE n.conversation_id = c.id AND n.visibility = 'internal' AND n.deleted_at IS NULL) AS notes,
            cu.name AS c_name, cu.email AS c_email, cu.company AS c_company, cu.language AS c_language, cu.status AS c_status,
            p.reference AS p_reference, p.name AS p_name,
            lm.body AS last_body, lm.sender_type AS last_sender, lm.deleted_at AS last_deleted
     FROM conversations c JOIN customers cu ON cu.id = c.customer_id
     LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.reader_type = 'admin' AND r.reader_id = ?
     LEFT JOIN client_projects p ON p.id = c.project_id
     LEFT JOIN conversation_messages lm ON lm.seq = (SELECT MAX(m2.seq) FROM conversation_messages m2 WHERE m2.conversation_id = c.id AND m2.visibility = 'customer' AND m2.message_type IN ('text', 'announcement'))
     WHERE c.id = ?`,
    [adminId, conversation.id],
  )!
  return {
    ...adminSummary(app, summaryRow),
    createdAt: conversation.created_at,
    revision: conversation.revision,
    messages: rows.map((row) => adminMessage(row, conversation.id, adminId)),
    page: { hasOlder, oldestSeq: rows[0]?.seq ?? null, newestSeq: rows[rows.length - 1]?.seq ?? null },
    marker: readMarker(app, conversation.id, { type: 'admin', id: adminId }),
    messageCountTotal: app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM conversation_messages WHERE conversation_id = ?', [conversation.id])!.n,
  }
}

/** Search inside one conversation, private notes included: the matching messages, newest first. */
export function searchInConversation(app: Db, adminId: string, reference: string, term: string, limit: number): { items: AdminMessage[] } {
  const conversation = adminConversationRow(app, reference)
  const rows = app.db.all<TimelineRow>(
    `SELECT m.*, u.email AS admin_email FROM conversation_messages m LEFT JOIN admin_users u ON u.id = m.sender_id AND m.sender_type = 'admin'
     WHERE m.conversation_id = ? AND m.message_type <> 'system_event' AND m.deleted_at IS NULL AND m.body LIKE ? ESCAPE '\\' ORDER BY m.seq DESC LIMIT ?`,
    [conversation.id, likePattern(term), limit],
  )
  return { items: rows.map((row) => adminMessage(row, conversation.id, adminId)) }
}

export interface AdminOverview {
  open: number
  waitingOwner: number
  waitingCustomer: number
  resolved: number
  archived: number
  unreadThreads: number
  unreadMessages: number
  recent: AdminConversationSummary[]
}

/** Real counts from the database: nothing is estimated and nothing is invented. */
export function adminOverview(app: Db, adminId: string): AdminOverview {
  const counts = app.db.get<{ open: number | null; waiting_owner: number | null; waiting_customer: number | null; resolved: number | null; archived: number | null }>(
    `SELECT SUM(CASE WHEN status IN (${sql.active}) THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN status = 'waiting_owner' THEN 1 ELSE 0 END) AS waiting_owner,
            SUM(CASE WHEN status = 'waiting_customer' THEN 1 ELSE 0 END) AS waiting_customer,
            SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) AS archived
     FROM conversations WHERE kind = 'thread'`,
  )
  const unread = adminUnreadTotals(app, adminId)
  return {
    open: counts?.open ?? 0,
    waitingOwner: counts?.waiting_owner ?? 0,
    waitingCustomer: counts?.waiting_customer ?? 0,
    resolved: counts?.resolved ?? 0,
    archived: counts?.archived ?? 0,
    unreadThreads: unread.threads,
    unreadMessages: unread.messages,
    recent: adminInbox(app, adminId, { filter: 'all', customerId: null, projectId: null, contextType: null, from: null, to: null, cursor: null, limit: 5 }).items,
  }
}
