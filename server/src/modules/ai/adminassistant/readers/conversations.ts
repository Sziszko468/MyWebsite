import { ageDays, cut, cutBlock, LIMITS, likeOf, NOT_FOUND, pageOf, untrusted } from '../model.ts'
import { inScope, scopeClause, scopeIds } from '../scope.ts'
import { link, listed, type ReadCtx } from './common.ts'

/**
 * Customer conversations (the client communication of the portal) for the admin assistant. Permission: `clients:read`. Only what the CUSTOMER can see is read: messages with
 * `visibility = 'customer'`. Private notes (`visibility = 'internal'`) are never selected, so a draft reply can never quote one. Message bodies are the customer's (or the
 * studio's) words: they come back cut, in fields that say `Untrusted`, and an instruction inside one is data, not a command. Reading never marks anything as read.
 */

const NEED = 'clients:read'
/** A conversation that is still going: not resolved, not archived (the communication module's `waiting_owner` is the one a customer's message puts it in). */
const LIVE = ['open', 'waiting_owner', 'waiting_customer']
const LIVE_SQL = "c.status IN ('open', 'waiting_owner', 'waiting_customer')"

interface Row {
  id: string
  reference: string
  subject: string | null
  status: string
  context_type: string | null
  customer_id: string
  project_id: string | null
  last_message_at: string | null
  last_activity_at: string
  created_at: string
  resolution_requested_at: string | null
  customer_name: string | null
  customer_company: string | null
  customer_language: string
  project_reference: string | null
  last_sender: string | null
  last_customer_at: string | null
  last_owner_at: string | null
}

const LAST_VISIBLE = `(SELECT m.%COL% FROM conversation_messages m WHERE m.conversation_id = c.id AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL%FILTER% ORDER BY m.seq DESC LIMIT 1)`
const last = (column: string, filter = ''): string => LAST_VISIBLE.replace('%COL%', column).replace('%FILTER%', filter)

// The fixed select list and joins (a constant of this file, never built from input).
const columns = `SELECT c.id, c.reference, c.subject, c.status, c.context_type, c.customer_id, c.project_id, c.last_message_at, c.last_activity_at, c.created_at, c.resolution_requested_at,
       cu.name AS customer_name, cu.company AS customer_company, cu.language AS customer_language, p.reference AS project_reference,
       ${last('sender_type')} AS last_sender,
       ${last('created_at', " AND m.sender_type = 'customer'")} AS last_customer_at,
       ${last('created_at', " AND m.sender_type = 'admin'")} AS last_owner_at
  FROM conversations c JOIN customers cu ON cu.id = c.customer_id LEFT JOIN client_projects p ON p.id = c.project_id`

export interface ConversationSearch {
  query?: string | undefined
  filter?: 'all' | 'unanswered' | 'open' | undefined
  limit?: number | undefined
  page?: number | undefined
}

export function searchConversations(ctx: ReadCtx, input: ConversationSearch) {
  ctx.access.need(NEED)
  const conditions: string[] = ["c.kind = 'thread'", 'c.archived_at IS NULL']
  const params: Array<string | number> = []
  if (input.filter === 'open') conditions.push(LIVE_SQL)
  if (input.filter === 'unanswered') conditions.push(`${LIVE_SQL} AND ${last('sender_type')} = 'customer'`)
  if (input.query) {
    const like = likeOf(input.query)
    // The subject, the reference and the customer's name, not the words of the messages: a search must not be a way to read them.
    conditions.push("(c.subject LIKE ? ESCAPE '!' OR c.reference LIKE ? ESCAPE '!' OR cu.name LIKE ? ESCAPE '!' OR cu.company LIKE ? ESCAPE '!')")
    params.push(like, like, like, like)
  }
  const restricted = scopeClause(scopeIds(ctx.scope, 'conversation'), 'c.id')
  const where = `${conditions.join(' AND ')}${restricted.sql}`
  const all = [...params, ...restricted.params]
  const page = pageOf(input)
  const total = ctx.app.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM conversations c JOIN customers cu ON cu.id = c.customer_id WHERE ${where}`, all)?.n ?? 0
  const rows = ctx.app.db.all<Row>(`${columns} WHERE ${where} ORDER BY c.last_activity_at DESC, c.id LIMIT ? OFFSET ?`, [...all, page.limit, page.offset])
  const now = ctx.app.clock.now()
  return listed(
    ctx,
    rows.map((row) => ({
      reference: row.reference,
      subject: cut(row.subject, LIMITS.titleChars),
      status: row.status,
      customer: { name: cut(row.customer_name, 80), company: cut(row.customer_company, 80), language: row.customer_language },
      projectReference: row.project_reference,
      lastMessageAt: row.last_message_at,
      lastMessageFrom: row.last_sender === 'customer' ? 'customer' : row.last_sender === 'admin' ? 'you' : null,
      waitingForYourReply: LIVE.includes(row.status) && row.last_sender === 'customer',
      waitingDays: LIVE.includes(row.status) && row.last_sender === 'customer' && row.last_customer_at ? ageDays(now, row.last_customer_at) : null,
      link: link.conversation(row.reference),
    })),
    total,
    page,
  )
}

export function conversationByReference(ctx: ReadCtx, reference: string | undefined): Row {
  ctx.access.need(NEED)
  const ref = reference ?? (ctx.scope.type === 'conversation' ? ctx.scope.ref : null)
  if (!ref) throw NOT_FOUND()
  const row = ctx.app.db.get<Row>(`${columns} WHERE c.reference = ? AND c.kind = 'thread'`, [ref])
  if (!row || !inScope(ctx.scope, 'conversation', row.id)) throw NOT_FOUND()
  return row
}

interface MessageRow {
  seq: number
  sender_type: string
  message_type: string
  body: string
  important: number
  event_key: string | null
  created_at: string
  deleted_at: string | null
  edited_at: string | null
}

function messagesOf(ctx: ReadCtx, conversationId: string, limit: number, beforeSeq: number | null): { rows: MessageRow[]; hasOlder: boolean } {
  const rows = ctx.app.db.all<MessageRow>(
    `SELECT seq, sender_type, message_type, body, important, event_key, created_at, deleted_at, edited_at FROM conversation_messages
      WHERE conversation_id = ? AND visibility = 'customer' AND message_type IN ('text', 'announcement', 'system_event') AND (? IS NULL OR seq < ?) ORDER BY seq DESC LIMIT ?`,
    [conversationId, beforeSeq, beforeSeq, limit + 1],
  )
  return { rows: rows.slice(0, limit).reverse(), hasOlder: rows.length > limit }
}

const fromOf = (type: string): 'customer' | 'you' | 'system' => (type === 'customer' ? 'customer' : type === 'admin' ? 'you' : 'system')

export function conversationDetails(ctx: ReadCtx, reference: string | undefined, input: { limit?: number | undefined; beforeSeq?: number | undefined }) {
  const conversation = conversationByReference(ctx, reference)
  const limit = Math.min(Math.max(1, Math.trunc(input.limit ?? 20)), LIMITS.messagesMax)
  const { rows, hasOlder } = messagesOf(ctx, conversation.id, limit, input.beforeSeq ?? null)
  const now = ctx.app.clock.now()
  const waiting = LIVE.includes(conversation.status) && conversation.last_sender === 'customer'
  return {
    basis: 'actual' as const,
    reference: conversation.reference,
    subject: cut(conversation.subject, LIMITS.titleChars),
    status: conversation.status,
    contextType: conversation.context_type,
    projectReference: conversation.project_reference,
    customer: { name: cut(conversation.customer_name, 80), company: cut(conversation.customer_company, 80), preferredLanguage: conversation.customer_language },
    startedAt: conversation.created_at,
    lastMessageAt: conversation.last_message_at,
    resolutionRequestedByCustomer: conversation.resolution_requested_at !== null,
    waitingForYourReply: waiting,
    waitingDays: waiting && conversation.last_customer_at ? ageDays(now, conversation.last_customer_at) : null,
    lastCustomerMessageAt: conversation.last_customer_at,
    lastReplyFromYouAt: conversation.last_owner_at,
    messages: rows.map((row) => ({
      seq: row.seq,
      from: fromOf(row.sender_type),
      kind: row.message_type,
      at: row.created_at,
      important: row.important === 1,
      removed: row.deleted_at !== null,
      edited: row.edited_at !== null,
      eventKey: row.event_key,
      textUntrusted: row.deleted_at !== null || row.message_type === 'system_event' ? null : untrusted(cutBlock(row.body, LIMITS.message), LIMITS.message),
    })),
    hasOlderMessages: hasOlder,
    privateNotesIncluded: false as const,
    link: link.conversation(conversation.reference),
  }
}

/** The part of a conversation that needs the administrator: what the customer wrote since the last reply, what looks like a question, the counts. Heuristics are named as such. */
export function summarizeConversation(ctx: ReadCtx, reference: string | undefined) {
  const conversation = conversationByReference(ctx, reference)
  const { rows } = messagesOf(ctx, conversation.id, LIMITS.messagesMax, null)
  const texts = rows.filter((row) => row.message_type === 'text' && row.deleted_at === null)
  const lastOwnerSeq = [...texts].reverse().find((row) => row.sender_type === 'admin')?.seq ?? 0
  const unanswered = texts.filter((row) => row.sender_type === 'customer' && row.seq > lastOwnerSeq)
  const first = texts[0]
  return {
    basis: 'actual' as const,
    reference: conversation.reference,
    subject: cut(conversation.subject, LIMITS.titleChars),
    status: conversation.status,
    customer: { name: cut(conversation.customer_name, 80), preferredLanguage: conversation.customer_language },
    counts: { fromCustomer: texts.filter((row) => row.sender_type === 'customer').length, fromYou: texts.filter((row) => row.sender_type === 'admin').length, windowSize: rows.length, window: 'the most recent messages, up to 40' },
    firstMessageUntrusted: first ? untrusted(first.body, 400) : null,
    unansweredCustomerMessages: unanswered.slice(-10).map((row) => ({ seq: row.seq, at: row.created_at, textUntrusted: untrusted(cutBlock(row.body, 600), 600) })),
    possibleQuestionsFromCustomer: {
      heuristic: 'messages from the customer that contain a question mark; the assistant must check the wording itself',
      items: texts.filter((row) => row.sender_type === 'customer' && row.body.includes('?')).slice(-6).map((row) => ({ seq: row.seq, at: row.created_at, textUntrusted: untrusted(row.body, 300) })),
    },
    recentMessagesUntrusted: texts.slice(-8).map((row) => ({ from: fromOf(row.sender_type), at: row.created_at, textUntrusted: untrusted(cutBlock(row.body, 500), 500) })),
    privateNotesIncluded: false as const,
    link: link.conversation(conversation.reference),
  }
}
