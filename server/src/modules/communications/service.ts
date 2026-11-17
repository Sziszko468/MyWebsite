import type { AppContext } from '../../context.ts'
import { ConstraintError, notFound, validationFailed } from '../../http/errors.ts'
import { newId, newReference } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import { getCustomer } from '../customers/accounts.ts'
import { refuse } from '../customers/projects.ts'
import { tellCustomerAbout, tellOwnerAbout } from './notify.ts'
import { ACTIVE_STATUSES, CONVERSATION_STATUSES, LIMITS, type ContextType, type ConversationRow, type ConversationStatus, type EventKey, type MessageRow } from './model.ts'

/**
 * The rules of conversations and messages (PROMPT 28). Everything here runs in ONE transaction per act, on a conversation read again inside it, so two people acting at the same
 * moment are told apart by the database and not by luck. Who is acting is always an argument (the session), never something a body says. The rules (CONVERSATION_WORKFLOW.md):
 *
 *   status follows who is expected to answer:  customer writes → waiting_owner;  the owner writes → waiting_customer;  an announcement or a private note changes nothing;
 *   the owner alone sets open / resolved / archived (and may set any status by hand);  the customer may only ASK for resolution;
 *   a customer's message in a resolved thread reopens it (waiting_owner), an owner's text in a resolved thread reopens it (waiting_customer);  an archived thread takes no new
 *   message from the customer and none from the owner's text or announcement (the owner reopens it first); a private note is always allowed.
 *   A message e-mails the other side only when it STARTS a wait (the status was not already waiting for that side), or when the owner marked it important, or it is an announcement:
 *   five messages in a row are one e-mail, not five.
 */

type Db = Pick<AppContext, 'db' | 'clock'>
export type Actor = { type: 'customer'; id: string } | { type: 'admin'; id: string }

export const conversationBy = (app: Pick<AppContext, 'db'>, reference: string): ConversationRow | undefined => app.db.get<ConversationRow>('SELECT * FROM conversations WHERE reference = ?', [reference])
export const conversationById = (app: Pick<AppContext, 'db'>, id: string): ConversationRow => {
  const row = app.db.get<ConversationRow>('SELECT * FROM conversations WHERE id = ?', [id])
  if (!row) throw notFound('The conversation')
  return row
}
export const messageById = (app: Pick<AppContext, 'db'>, id: string): MessageRow | undefined => app.db.get<MessageRow>('SELECT * FROM conversation_messages WHERE id = ?', [id])

// ---- what a thread can be about --------------------------------------------------------------------------------------------------------

export interface ResolvedContext {
  type: ContextType
  id: string
  projectId: string | null
}

/**
 * The record a thread is about, looked up THROUGH the customer: only a record of theirs, that they can see in the portal (a project of theirs, a deliverable that was published, a
 * task that was shared, a booking or a quote request that was linked to them). Anything else is the same refusal as a record that does not exist.
 */
export function resolveContext(app: Pick<AppContext, 'db'>, customerId: string, context: { type: ContextType; reference: string } | null): ResolvedContext | null {
  if (!context) return null
  const bad = () => validationFailed({ context: 'invalid' })
  switch (context.type) {
    case 'project': {
      const row = app.db.get<{ id: string }>('SELECT id FROM client_projects WHERE reference = ? AND customer_id = ?', [context.reference, customerId])
      if (!row) throw bad()
      return { type: 'project', id: row.id, projectId: row.id }
    }
    case 'deliverable': {
      const row = app.db.get<{ id: string; project_id: string }>(
        'SELECT d.id, d.project_id FROM deliverables d JOIN client_projects p ON p.id = d.project_id WHERE d.reference = ? AND p.customer_id = ? AND d.published_at IS NOT NULL',
        [context.reference, customerId],
      )
      if (!row) throw bad()
      return { type: 'deliverable', id: row.id, projectId: row.project_id }
    }
    case 'task': {
      const row = app.db.get<{ id: string; project_id: string }>(
        'SELECT t.id, t.project_id FROM project_tasks t JOIN client_projects p ON p.id = t.project_id WHERE t.reference = ? AND p.customer_id = ? AND t.customer_visible = 1',
        [context.reference, customerId],
      )
      if (!row) throw bad()
      return { type: 'task', id: row.id, projectId: row.project_id }
    }
    case 'booking': {
      const row = app.db.get<{ id: string }>('SELECT b.id FROM bookings b JOIN customer_links l ON l.booking_id = b.id WHERE b.reference = ? AND l.customer_id = ?', [context.reference, customerId])
      if (!row) throw bad()
      return { type: 'booking', id: row.id, projectId: null }
    }
    case 'quote': {
      const row = app.db.get<{ id: string }>('SELECT q.id FROM quote_requests q JOIN customer_links l ON l.quote_request_id = q.id WHERE q.reference = ? AND l.customer_id = ?', [context.reference, customerId])
      if (!row) throw bad()
      const project = app.db.get<{ id: string }>('SELECT id FROM client_projects WHERE quote_request_id = ? AND customer_id = ? ORDER BY created_at LIMIT 1', [row.id, customerId])
      return { type: 'quote', id: row.id, projectId: project?.id ?? null }
    }
    default:
      throw bad()
  }
}

// ---- small pieces ----------------------------------------------------------------------------------------------------------------------

/** One message's words: no control characters, not empty, not too long. Line breaks are kept. The route reads them field by field first; this is the last line. */
export function cleanBody(raw: string, max: number = LIMITS.message): string {
  const body = raw.replace(/\r\n?/g, '\n').trim()
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(body)) throw validationFailed({ body: 'invalid' })
  if (body.length === 0) throw validationFailed({ body: 'required' })
  if (body.length > max) throw validationFailed({ body: 'tooLong' })
  return body
}

export function cleanSubject(raw: string): string {
  const subject = raw.replace(/\s+/g, ' ').trim()
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(subject)) throw validationFailed({ subject: 'invalid' })
  if (subject.length === 0) throw validationFailed({ subject: 'required' })
  if (subject.length > LIMITS.subject) throw validationFailed({ subject: 'tooLong' })
  return subject
}

function newConversationReference(app: Pick<AppContext, 'db'>): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reference = newReference('MSG')
    if (!app.db.get('SELECT 1 FROM conversations WHERE reference = ?', [reference])) return reference
  }
  throw new Error('Could not make a unique conversation reference.')
}

/** One event inside a thread (resolved, reopened, archived, a request for resolution), once per state of the thread (the revision). Returns the message's id. */
function threadEvent(app: Db, conversationId: string, key: EventKey, by: 'owner' | 'customer', revision: number): string {
  const idempotencyKey = `conversation:${conversationId}:${key}:${revision}`
  const id = newId()
  const now = iso(app.clock.now())
  const result = app.db.run(
    `INSERT INTO conversation_messages (id, conversation_id, sender_type, sender_id, message_type, visibility, body, event_key, event_params, source_type, source_id, idempotency_key, created_at)
     VALUES (?, ?, 'system', NULL, 'system_event', 'customer', NULL, ?, ?, 'conversation', ?, ?, ?) ON CONFLICT (idempotency_key) DO NOTHING`,
    [id, conversationId, key, JSON.stringify({ by }), conversationId, idempotencyKey, now],
  )
  if (result.changes === 1) return id
  return app.db.get<{ id: string }>('SELECT id FROM conversation_messages WHERE idempotency_key = ?', [idempotencyKey])!.id
}

/** Changes the status (and the timestamps that go with it) and counts the revision up. */
function moveStatus(app: Db, conversation: ConversationRow, to: ConversationStatus, requestKept = false): ConversationRow {
  const now = iso(app.clock.now())
  app.db.run(
    `UPDATE conversations SET status = ?, revision = revision + 1, updated_at = ?, last_activity_at = ?,
       resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_at END,
       archived_at = CASE WHEN ? = 'archived' THEN ? ELSE archived_at END,
       resolution_requested_at = CASE WHEN ? = 1 THEN resolution_requested_at ELSE NULL END
     WHERE id = ?`,
    [to, now, now, to, now, to, now, requestKept ? 1 : 0, conversation.id],
  )
  return conversationById(app, conversation.id)
}

function touchActivity(app: Db, conversationId: string, visibleHuman: boolean): void {
  const now = iso(app.clock.now())
  app.db.run('UPDATE conversations SET last_activity_at = ?, updated_at = ?, last_message_at = CASE WHEN ? = 1 THEN ? ELSE last_message_at END WHERE id = ?', [now, now, visibleHuman ? 1 : 0, now, conversationId])
}

function writeMessage(
  app: Db,
  input: { conversationId: string; sender: Actor; type: 'text' | 'announcement'; visibility: 'customer' | 'internal'; body: string; important: boolean; clientToken: string | null },
): MessageRow {
  const id = newId()
  app.db.run(
    `INSERT INTO conversation_messages (id, conversation_id, sender_type, sender_id, message_type, visibility, body, important, client_token, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.conversationId, input.sender.type, input.sender.id, input.type, input.visibility, input.body, input.important ? 1 : 0, input.clientToken, iso(app.clock.now())],
  )
  return messageById(app, id)!
}

/** The message this sender already stored under this token in this conversation (a double click, a retry, a second tab), if any. */
function sameToken(app: Pick<AppContext, 'db'>, conversationId: string, sender: Actor, token: string | null): MessageRow | undefined {
  if (!token) return undefined
  return app.db.get<MessageRow>('SELECT * FROM conversation_messages WHERE conversation_id = ? AND sender_type = ? AND sender_id = ? AND client_token = ?', [conversationId, sender.type, sender.id, token])
}

// ---- starting a thread ------------------------------------------------------------------------------------------------------------------

export interface NewThread {
  customerId: string
  starter: Actor
  subject: string
  body: string
  context: ResolvedContext | null
  /** What the owner's first message is; a customer's is always a text. */
  kind?: 'reply' | 'announcement'
  important?: boolean
  clientToken?: string | null
}

export function createThread(app: AppContext, input: NewThread): { conversation: ConversationRow; message: MessageRow; duplicate: boolean } {
  return app.db.transaction(() => {
    const customer = getCustomer(app, input.customerId)
    if (!customer) throw notFound('The customer')
    if (customer.status === 'disabled') throw refuse('This customer account is switched off.', 'customer_disabled')
    const body = cleanBody(input.body)
    const subject = cleanSubject(input.subject)
    const kind = input.starter.type === 'admin' ? (input.kind ?? 'reply') : 'reply'
    const important = input.starter.type === 'admin' && kind === 'reply' && input.important === true

    if (input.starter.type === 'customer') {
      // The same submission twice (a double click, a retry): the thread it made is the answer.
      const earlier = input.clientToken
        ? app.db.get<{ conversation_id: string }>("SELECT conversation_id FROM conversation_messages WHERE sender_type = 'customer' AND sender_id = ? AND client_token = ?", [input.starter.id, input.clientToken])
        : undefined
      if (earlier) {
        const conversation = conversationById(app, earlier.conversation_id)
        return { conversation, message: sameToken(app, conversation.id, input.starter, input.clientToken ?? null)!, duplicate: true }
      }
      const threads = app.db.get<{ n: number; waiting: number }>(
        "SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN status = 'waiting_owner' THEN 1 ELSE 0 END), 0) AS waiting FROM conversations WHERE customer_id = ? AND kind = 'thread'",
        [input.customerId],
      )!
      if (threads.n >= LIMITS.threadsPerCustomer || threads.waiting >= LIMITS.waitingPerCustomer) throw refuse('There are too many conversations waiting for an answer.', 'too_many')
    }

    const now = iso(app.clock.now())
    const id = newId()
    const status: ConversationStatus = input.starter.type === 'customer' ? 'waiting_owner' : kind === 'announcement' ? 'open' : 'waiting_customer'
    app.db.run(
      `INSERT INTO conversations (id, reference, kind, customer_id, project_id, context_type, context_id, subject, status, started_by, last_message_at, last_activity_at, created_at, updated_at)
       VALUES (?, ?, 'thread', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, newConversationReference(app), input.customerId, input.context?.projectId ?? null, input.context?.type ?? null, input.context?.id ?? null, subject, status, input.starter.type, now, now, now, now],
    )
    const message = writeMessage(app, { conversationId: id, sender: input.starter, type: kind === 'announcement' ? 'announcement' : 'text', visibility: 'customer', body, important, clientToken: input.clientToken ?? null })
    const conversation = conversationById(app, id)
    announce(app, conversation, message, { startsWait: true })
    return { conversation, message, duplicate: false }
  })
}

/** E-mails the other side about a new customer-visible message, by the rules at the top of this file. Never throws. */
function announce(app: AppContext, conversation: ConversationRow, message: MessageRow, options: { startsWait: boolean }): void {
  if (message.sender_type === 'customer') {
    if (options.startsWait) tellOwnerAbout(app, 'message_received_admin', message.id)
    return
  }
  if (message.message_type === 'announcement') tellCustomerAbout(app, conversation.customer_id, 'client_message_announcement', message.id)
  else if (message.important === 1) tellCustomerAbout(app, conversation.customer_id, 'client_message_important', message.id)
  else if (options.startsWait) tellCustomerAbout(app, conversation.customer_id, 'client_message_reply', message.id)
}

// ---- messages ----------------------------------------------------------------------------------------------------------------------------

export interface NewMessage {
  conversation: Pick<ConversationRow, 'id'>
  sender: Actor
  /** `reply`: a text to the other side. `announcement`: the owner's marked message to the customer (the owner confirmed it). `note`: the owner's private note. */
  kind: 'reply' | 'announcement' | 'note'
  body: string
  important?: boolean
  clientToken?: string | null
  /** The owner confirmed that an announcement goes to the customer. */
  confirmed?: boolean
}

export function postMessage(app: AppContext, input: NewMessage): { message: MessageRow; conversation: ConversationRow; duplicate: boolean } {
  return app.db.transaction(() => {
    const conversation = conversationById(app, input.conversation.id)
    if (conversation.kind !== 'thread') throw refuse('An activity feed is read only.', 'read_only')
    const customer = getCustomer(app, conversation.customer_id)
    if (!customer) throw notFound('The conversation')
    const body = cleanBody(input.body, input.kind === 'note' ? LIMITS.note : LIMITS.message)

    if (input.sender.type === 'customer') {
      if (input.sender.id !== conversation.customer_id || input.kind !== 'reply') throw notFound('The conversation')
      if (customer.status === 'disabled') throw refuse('This customer account is switched off.', 'customer_disabled')
    } else if (input.kind !== 'note' && customer.status === 'disabled') {
      throw refuse('This customer account is switched off.', 'customer_disabled')
    }
    if (input.kind === 'announcement' && input.confirmed !== true) throw validationFailed({ confirm: 'consentRequired' })
    if (input.kind !== 'reply' && input.sender.type !== 'admin') throw notFound('The conversation')
    if (input.important === true && (input.kind !== 'reply' || input.sender.type !== 'admin')) throw validationFailed({ important: 'invalid' })

    const duplicate = sameToken(app, conversation.id, input.sender, input.clientToken ?? null)
    if (duplicate) return { message: duplicate, conversation, duplicate: true }

    if (conversation.status === 'archived' && input.kind !== 'note') throw refuse('This conversation is archived.', 'archived')
    const count = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM conversation_messages WHERE conversation_id = ?', [conversation.id])!.n
    if (count >= LIMITS.messagesPerThread) throw refuse('This conversation is full. Start a new one.', 'conversation_full')

    // A private note: a record for the owner. It changes nothing for anybody else, and only the owner's own pages ever select it.
    if (input.kind === 'note') {
      const message = writeMessage(app, { conversationId: conversation.id, sender: input.sender, type: 'text', visibility: 'internal', body, important: false, clientToken: input.clientToken ?? null })
      touchActivity(app, conversation.id, false)
      return { message, conversation: conversationById(app, conversation.id), duplicate: false }
    }

    // The status follows who is expected to answer (an announcement expects nobody and changes nothing). A reopening is written BEFORE the message that caused it, so the
    // timeline reads: resolved, reopened, and then the words.
    let current = conversationById(app, conversation.id)
    let startsWait = true
    if (input.kind === 'reply') {
      const to: ConversationStatus = input.sender.type === 'customer' ? 'waiting_owner' : 'waiting_customer'
      startsWait = current.status !== to
      if (current.status !== to) {
        const reopened = current.status === 'resolved'
        current = moveStatus(app, current, to, true)
        if (reopened) threadEvent(app, current.id, 'conversation.reopened', input.sender.type === 'customer' ? 'customer' : 'owner', current.revision)
      }
    }
    const message = writeMessage(app, {
      conversationId: conversation.id,
      sender: input.sender,
      type: input.kind === 'announcement' ? 'announcement' : 'text',
      visibility: 'customer',
      body,
      important: input.important === true,
      clientToken: input.clientToken ?? null,
    })
    touchActivity(app, conversation.id, true)
    announce(app, current, message, { startsWait })
    return { message, conversation: conversationById(app, conversation.id), duplicate: false }
  })
}

// ---- the owner's status control, the customer's request ------------------------------------------------------------------------

export function setStatus(app: AppContext, conversation: Pick<ConversationRow, 'id'>, to: string, expectedRevision: number): ConversationRow {
  return app.db.transaction(() => {
    const current = conversationById(app, conversation.id)
    if (current.kind !== 'thread') throw refuse('An activity feed has no status.', 'read_only')
    if (!(CONVERSATION_STATUSES as readonly string[]).includes(to)) throw validationFailed({ status: 'invalid' })
    if (current.revision !== expectedRevision) throw refuse('This conversation was changed by someone else. Reload it and try again.', 'stale')
    if (current.status === to) throw refuse('The conversation already has this status.', 'invalid_transition')
    const next = to as ConversationStatus
    const finished = current.status === 'resolved' || current.status === 'archived'
    const updated = moveStatus(app, current, next)
    if (next === 'resolved') {
      const eventId = threadEvent(app, updated.id, 'conversation.resolved', 'owner', updated.revision)
      tellCustomerAbout(app, updated.customer_id, 'client_conversation_resolved', eventId)
    } else if (next === 'archived') {
      threadEvent(app, updated.id, 'conversation.archived', 'owner', updated.revision)
    } else if (finished) {
      threadEvent(app, updated.id, 'conversation.reopened', 'owner', updated.revision)
    }
    return conversationById(app, updated.id)
  })
}

/** The customer asks for the thread to be resolved. It is a request, not a status: the owner decides. Asking twice is asking once. */
export function requestResolution(app: AppContext, conversation: Pick<ConversationRow, 'id'>, customerId: string): ConversationRow {
  return app.db.transaction(() => {
    const current = conversationById(app, conversation.id)
    if (current.kind !== 'thread' || current.customer_id !== customerId) throw notFound('The conversation')
    if (current.status === 'resolved' || current.status === 'archived') throw refuse('This conversation is already finished.', 'closed')
    if (current.resolution_requested_at) return current
    const now = iso(app.clock.now())
    app.db.run('UPDATE conversations SET resolution_requested_at = ?, revision = revision + 1, last_activity_at = ?, updated_at = ? WHERE id = ?', [now, now, now, current.id])
    const updated = conversationById(app, current.id)
    const eventId = threadEvent(app, updated.id, 'conversation.resolution_requested', 'customer', updated.revision)
    tellOwnerAbout(app, 'resolution_requested_admin', eventId)
    return updated
  })
}

// ---- removing and editing the owner's own words -----------------------------------------------------------------------------------

function ownMessage(app: Pick<AppContext, 'db'>, conversationId: string, messageId: string, adminId: string): MessageRow {
  const row = app.db.get<MessageRow>("SELECT * FROM conversation_messages WHERE id = ? AND conversation_id = ? AND sender_type = 'admin' AND sender_id = ? AND message_type <> 'system_event'", [messageId, conversationId, adminId])
  if (!row) throw notFound('The message')
  return row
}

/** The owner removes THEIR OWN message or note: it stays in the record and the customer sees that a message was removed, not what it said. A customer's message is never removed. */
export function removeMessage(app: Db, conversation: Pick<ConversationRow, 'id'>, messageId: string, adminId: string): MessageRow {
  return app.db.transaction(() => {
    const row = ownMessage(app, conversation.id, messageId, adminId)
    if (row.deleted_at) return row
    app.db.run('UPDATE conversation_messages SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [iso(app.clock.now()), row.id])
    touchActivity(app, conversation.id, false)
    return messageById(app, row.id)!
  })
}

/** The owner edits THEIR OWN private note. A message the customer can see is never edited: a correction is a new message. */
export function editNote(app: Db, conversation: Pick<ConversationRow, 'id'>, messageId: string, adminId: string, rawBody: string): MessageRow {
  return app.db.transaction(() => {
    const row = ownMessage(app, conversation.id, messageId, adminId)
    if (row.visibility !== 'internal') throw refuse('A message the customer can see is never edited.', 'not_a_note')
    if (row.deleted_at) throw refuse('This note was removed.', 'removed')
    const body = cleanBody(rawBody, LIMITS.note)
    try {
      app.db.run('UPDATE conversation_messages SET body = ?, edited_at = ? WHERE id = ? AND deleted_at IS NULL', [body, iso(app.clock.now()), row.id])
    } catch (error) {
      if (error instanceof ConstraintError) throw refuse('This note cannot be changed.', 'not_a_note')
      throw error
    }
    touchActivity(app, conversation.id, false)
    return messageById(app, row.id)!
  })
}

/** Whether a thread still takes a customer's message (it exists, is a thread, is not archived). */
export const takesCustomerMessage = (conversation: Pick<ConversationRow, 'kind' | 'status'>): boolean => conversation.kind === 'thread' && conversation.status !== 'archived'
export const isActive = (conversation: Pick<ConversationRow, 'status'>): boolean => ACTIVE_STATUSES.includes(conversation.status)
