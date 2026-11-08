import type { Language } from '../../config.ts'
import type { Database } from '../../db/database.ts'
import { newId, hmacHex, safeEqual } from '../../lib/crypto.ts'
import { addMs, DAY, iso, type Clock } from '../../lib/time.ts'

/**
 * Everything the assistant stores, in one place (the only SQL of the module besides the budget's). A conversation belongs to
 * an anonymous session; its words (`ai_messages`, the title and the plan) go when the visitor deletes it and after the
 * retention; the row itself and the usage numbers stay, because they contain nothing the visitor wrote.
 */

export interface SessionRow {
  id: string
  ip_hash: string
  created_at: string
  last_seen_at: string
  request_count: number
}

export interface ConversationRow {
  id: string
  session_id: string
  language: Language
  title: string | null
  topic: string
  plan_json: string | null
  plan_version: number
  message_count: number
  planner_completed_at: string | null
  quote_reference: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** A session token lives as long as the visitor keeps the tab; the server forgets one that is this old. */
export const SESSION_TTL_MS = 14 * DAY

// ---- sessions -----------------------------------------------------------------------------------------------------

const macOf = (secret: string, id: string): string => hmacHex(secret, `ai-session:${id}`)

export function createSession(db: Database, clock: Clock, secret: string, ipHash: string): { id: string; token: string; expiresAt: string } {
  const id = newId()
  const now = clock.now()
  db.run('INSERT INTO ai_sessions (id, ip_hash, created_at, last_seen_at, request_count) VALUES (?, ?, ?, ?, 0)', [id, ipHash, iso(now), iso(now)])
  return { id, token: `${id}.${macOf(secret, id)}`, expiresAt: iso(addMs(now, SESSION_TTL_MS)) }
}

/** The session a token names, or `null` (malformed, forged, unknown or expired). The signature is checked before the database is asked. */
export function resolveSession(db: Database, clock: Clock, secret: string, token: string | undefined): SessionRow | null {
  if (!token || token.length > 100) return null
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const id = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  if (!/^[0-9a-f-]{36}$/.test(id) || !safeEqual(mac, macOf(secret, id))) return null
  const row = db.get<SessionRow>('SELECT * FROM ai_sessions WHERE id = ?', [id])
  if (!row) return null
  const now = clock.now()
  if (new Date(row.created_at).getTime() + SESSION_TTL_MS < now.getTime()) return null
  db.run('UPDATE ai_sessions SET last_seen_at = ? WHERE id = ?', [iso(now), id])
  return row
}

// ---- conversations ------------------------------------------------------------------------------------------------

export const CONVERSATION_ID = /^[A-Za-z0-9_-]{16,64}$/

export function getConversation(db: Database, sessionId: string, id: string): ConversationRow | undefined {
  return db.get<ConversationRow>('SELECT * FROM ai_conversations WHERE id = ? AND session_id = ?', [id, sessionId])
}

export function createConversation(db: Database, clock: Clock, sessionId: string, id: string, language: Language): ConversationRow {
  const now = iso(clock.now())
  db.run('INSERT INTO ai_conversations (id, session_id, language, topic, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, sessionId, language, 'general', now, now])
  return db.get<ConversationRow>('SELECT * FROM ai_conversations WHERE id = ?', [id])!
}

export function listConversations(db: Database, sessionId: string): ConversationRow[] {
  return db.all<ConversationRow>('SELECT * FROM ai_conversations WHERE session_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 50', [sessionId])
}

export function countSessionConversationsToday(db: Database, day: string): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ai_conversations WHERE created_at >= ?', [`${day}T00:00:00.000Z`])?.n ?? 0
}

/** The words go; the row, the language, the topic and the counts stay (nothing in them is the visitor's text). */
export function eraseConversation(db: Database, clock: Clock, id: string): void {
  db.transaction(() => {
    db.run('DELETE FROM ai_messages WHERE conversation_id = ?', [id])
    db.run('DELETE FROM ai_approvals WHERE conversation_id = ?', [id])
    db.run('UPDATE ai_conversations SET title = NULL, plan_json = NULL, deleted_at = ?, updated_at = ? WHERE id = ?', [iso(clock.now()), iso(clock.now()), id])
  })
}

export function setLanguage(db: Database, id: string, language: Language): void {
  db.run('UPDATE ai_conversations SET language = ? WHERE id = ?', [language, id])
}

export function setTitle(db: Database, id: string, title: string): void {
  db.run('UPDATE ai_conversations SET title = ? WHERE id = ? AND title IS NULL', [title, id])
}

/** Raises the topic when a more specific one is found; `general` never replaces anything. */
export function setTopic(db: Database, id: string, topic: string): void {
  if (topic !== 'general') db.run("UPDATE ai_conversations SET topic = ? WHERE id = ? AND topic = 'general'", [topic, id])
}

// ---- messages -----------------------------------------------------------------------------------------------------

export interface StoredMessage {
  id: string
  role: 'user' | 'assistant'
  /** The UI message (parts included) as JSON. */
  json: string
}

export function loadMessages(db: Database, conversationId: string): StoredMessage[] {
  return db
    .all<{ id: string; role: 'user' | 'assistant'; message_json: string }>('SELECT id, role, message_json FROM ai_messages WHERE conversation_id = ? ORDER BY seq', [conversationId])
    .map((row) => ({ id: row.id, role: row.role, json: row.message_json }))
}

/** Replaces the conversation's messages with this list (the server's copy of the conversation after a turn). */
export function saveMessages(db: Database, clock: Clock, conversationId: string, messages: readonly StoredMessage[]): void {
  const now = iso(clock.now())
  db.transaction(() => {
    db.run('DELETE FROM ai_messages WHERE conversation_id = ?', [conversationId])
    messages.forEach((message, index) => db.run('INSERT INTO ai_messages (id, conversation_id, seq, role, message_json, created_at) VALUES (?, ?, ?, ?, ?, ?)', [message.id, conversationId, index, message.role, message.json, now]))
    db.run('UPDATE ai_conversations SET message_count = ?, updated_at = ? WHERE id = ?', [messages.length, now, conversationId])
  })
}

// ---- the plan -----------------------------------------------------------------------------------------------------

export function savePlan(db: Database, clock: Clock, conversationId: string, plan: unknown | null, version: number): void {
  db.run('UPDATE ai_conversations SET plan_json = ?, plan_version = ?, updated_at = ? WHERE id = ?', [plan === null ? null : JSON.stringify(plan), version, iso(clock.now()), conversationId])
}

export function markPlannerCompleted(db: Database, clock: Clock, conversationId: string): void {
  db.run('UPDATE ai_conversations SET planner_completed_at = COALESCE(planner_completed_at, ?) WHERE id = ?', [iso(clock.now()), conversationId])
}

export function markQuoteSent(db: Database, conversationId: string, reference: string): void {
  db.run('UPDATE ai_conversations SET quote_reference = ? WHERE id = ?', [reference, conversationId])
}

// ---- approvals ----------------------------------------------------------------------------------------------------

export interface ApprovalRow {
  id: string
  conversation_id: string
  plan_version: number
  plan_hash: string
  name: string | null
  email: string | null
  company: string | null
  consent_at: string | null
  created_at: string
  expires_at: string
  consumed_at: string | null
  quote_reference: string | null
}

/** A visitor approvals's life: ten minutes to say "send it" after saying "I approve". */
export const APPROVAL_TTL_MS = 10 * 60_000

export function insertApproval(db: Database, clock: Clock, row: { conversationId: string; planVersion: number; planHash: string; name: string; email: string; company: string | null; consent: boolean }): ApprovalRow {
  const now = clock.now()
  const id = newId()
  db.transaction(() => {
    // One live approval per conversation: a newer one replaces an older one.
    db.run('DELETE FROM ai_approvals WHERE conversation_id = ? AND consumed_at IS NULL', [row.conversationId])
    db.run('INSERT INTO ai_approvals (id, conversation_id, plan_version, plan_hash, name, email, company, consent_at, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, row.conversationId, row.planVersion, row.planHash, row.name, row.email, row.company, row.consent ? iso(now) : null, iso(now), iso(addMs(now, APPROVAL_TTL_MS))])
  })
  return db.get<ApprovalRow>('SELECT * FROM ai_approvals WHERE id = ?', [id])!
}

export function liveApproval(db: Database, clock: Clock, conversationId: string): ApprovalRow | undefined {
  return db.get<ApprovalRow>('SELECT * FROM ai_approvals WHERE conversation_id = ? AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1', [conversationId, iso(clock.now())])
}

/** Marks the approval used and removes the contact details from it: the quote request holds them from now on. */
export function consumeApproval(db: Database, clock: Clock, id: string, reference: string): void {
  db.run('UPDATE ai_approvals SET consumed_at = ?, quote_reference = ?, name = NULL, email = NULL, company = NULL WHERE id = ?', [iso(clock.now()), reference, id])
}

// ---- tool calls ---------------------------------------------------------------------------------------------------

export function recordToolCall(db: Database, clock: Clock, row: { requestId: string; conversationId: string; tool: string; status: 'ok' | 'error' | 'rejected'; durationMs: number }): void {
  const now = clock.now()
  db.run('INSERT INTO ai_tool_calls (id, request_id, conversation_id, tool, status, duration_ms, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [newId(), row.requestId, row.conversationId, row.tool, row.status, Math.max(0, Math.round(row.durationMs)), dayOf(now), iso(now)])
}

export const dayOf = (date: Date): string => date.toISOString().slice(0, 10)
export const monthOf = (date: Date): string => date.toISOString().slice(0, 7)

// ---- retention ----------------------------------------------------------------------------------------------------

/**
 * Removes the words of conversations that have not been touched for `retentionDays` and the sessions nobody uses, and
 * the contact details of approvals that expired unused. Returns what it did, for the log and the administration.
 */
export function purge(db: Database, clock: Clock, retentionDays: number): { conversations: number; sessions: number; approvals: number } {
  const now = clock.now()
  const cutoff = iso(addMs(now, -retentionDays * DAY))
  let conversations = 0
  db.transaction(() => {
    const old = db.all<{ id: string }>('SELECT id FROM ai_conversations WHERE updated_at < ? AND (deleted_at IS NULL OR plan_json IS NOT NULL OR title IS NOT NULL)', [cutoff])
    for (const row of old) {
      eraseConversation(db, clock, row.id)
      conversations += 1
    }
  })
  const approvals = db.run('UPDATE ai_approvals SET name = NULL, email = NULL, company = NULL WHERE consumed_at IS NULL AND expires_at < ? AND (name IS NOT NULL OR email IS NOT NULL)', [iso(now)]).changes
  // A session with no conversation left that has been idle for longer than a token lives.
  const sessions = db.run('DELETE FROM ai_sessions WHERE last_seen_at < ? AND id NOT IN (SELECT session_id FROM ai_conversations)', [iso(addMs(now, -SESSION_TTL_MS))]).changes
  return { conversations, sessions, approvals }
}
