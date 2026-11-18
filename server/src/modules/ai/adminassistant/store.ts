import type { Language } from '../../../config.ts'
import type { Database } from '../../../db/database.ts'
import { newId } from '../../../lib/crypto.ts'
import { addMs, DAY, iso, type Clock } from '../../../lib/time.ts'

/**
 * Everything the AI admin assistant stores (PROMPT 31), in one place. A conversation belongs to ONE administrator (`user_id`) and is found only through
 * that administrator: every function that reads or changes one takes the user id, so another administrator's conversation, a visitor's conversation and
 * a guessed id are all simply "not found". The words of a conversation are deleted for good (a hard delete: nothing aggregates over these rows) when
 * the administrator deletes it, by retention, and when the account goes (the foreign key cascades). The usage numbers live in `ai_requests`, which
 * holds no words.
 */

export const CONTEXT_TYPES = ['general', 'project', 'quote', 'customer', 'conversation', 'consultation'] as const
export type ContextType = (typeof CONTEXT_TYPES)[number]

export interface AdminConversationRow {
  id: string
  user_id: string
  language: Language
  title: string | null
  context_type: ContextType
  context_ref: string | null
  status: 'active' | 'closed'
  message_count: number
  created_at: string
  updated_at: string
}

/** The id a browser may propose for a new conversation (a long random one); it is only a key, ownership is by `user_id`. */
export const ADMIN_CONVERSATION_ID = /^[A-Za-z0-9_-]{16,64}$/

export function getAdminConversation(db: Database, userId: string, id: string): AdminConversationRow | undefined {
  return db.get<AdminConversationRow>('SELECT * FROM ai_admin_conversations WHERE id = ? AND user_id = ?', [id, userId])
}

export function createAdminConversation(db: Database, clock: Clock, row: { id: string; userId: string; language: Language; contextType: ContextType; contextRef: string | null }): AdminConversationRow {
  const now = iso(clock.now())
  db.run('INSERT INTO ai_admin_conversations (id, user_id, language, context_type, context_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [row.id, row.userId, row.language, row.contextType, row.contextRef, now, now])
  return db.get<AdminConversationRow>('SELECT * FROM ai_admin_conversations WHERE id = ?', [row.id])!
}

const escapeLike = (value: string): string => value.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_')

/** The administrator's own conversations, newest first; `q` looks in the titles and in the words of the conversation. At most 50. */
export function listAdminConversations(db: Database, userId: string, q: string | null): AdminConversationRow[] {
  if (q) {
    const like = `%${escapeLike(q)}%`
    return db.all<AdminConversationRow>(
      `SELECT c.* FROM ai_admin_conversations c
        WHERE c.user_id = ? AND (c.title LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM ai_admin_messages m WHERE m.conversation_id = c.id AND m.role = 'user' AND m.message_json LIKE ? ESCAPE '!'))
        ORDER BY c.updated_at DESC LIMIT 50`,
      [userId, like, like],
    )
  }
  return db.all<AdminConversationRow>('SELECT * FROM ai_admin_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50', [userId])
}

export interface StoredAdminMessage {
  id: string
  role: 'user' | 'assistant'
  /** The UI message (parts, tool results included) as JSON. */
  json: string
}

export function loadAdminMessages(db: Database, conversationId: string): StoredAdminMessage[] {
  return db
    .all<{ id: string; role: 'user' | 'assistant'; message_json: string }>('SELECT id, role, message_json FROM ai_admin_messages WHERE conversation_id = ? ORDER BY seq', [conversationId])
    .map((row) => ({ id: row.id, role: row.role, json: row.message_json }))
}

/** Replaces the conversation's messages with this list (the server's copy after a turn). */
export function saveAdminMessages(db: Database, clock: Clock, conversationId: string, messages: readonly StoredAdminMessage[]): void {
  const now = iso(clock.now())
  db.transaction(() => {
    db.run('DELETE FROM ai_admin_messages WHERE conversation_id = ?', [conversationId])
    messages.forEach((message, index) => db.run('INSERT INTO ai_admin_messages (id, conversation_id, seq, role, message_json, created_at) VALUES (?, ?, ?, ?, ?, ?)', [message.id || newId(), conversationId, index, message.role, message.json, now]))
    db.run('UPDATE ai_admin_conversations SET message_count = ?, updated_at = ? WHERE id = ?', [messages.length, now, conversationId])
  })
}

export function setAdminTitle(db: Database, id: string, title: string): void {
  db.run('UPDATE ai_admin_conversations SET title = ? WHERE id = ? AND title IS NULL', [title, id])
}

export function setAdminLanguage(db: Database, id: string, language: Language): void {
  db.run('UPDATE ai_admin_conversations SET language = ? WHERE id = ?', [language, id])
}

export function closeAdminConversation(db: Database, id: string): void {
  db.run("UPDATE ai_admin_conversations SET status = 'closed' WHERE id = ?", [id])
}

/** Deletes the conversation and every message of it, for good. Returns whether it existed (for this administrator). */
export function deleteAdminConversation(db: Database, userId: string, id: string): boolean {
  return db.run('DELETE FROM ai_admin_conversations WHERE id = ? AND user_id = ?', [id, userId]).changes > 0
}

/**
 * Deletes the conversations that were opened ABOUT these records (a customer, their projects, their quote requests, their conversations, their consultations): called when
 * the person is erased from the system, so what an administrator discussed with the assistant about them goes with them. (A general-context conversation that merely mentioned
 * them cannot be found by a reference; retention removes it.)
 */
export function deleteAdminConversationsAbout(db: Database, records: ReadonlyArray<{ type: ContextType; ref: string }>): number {
  let removed = 0
  for (const record of records) removed += db.run('DELETE FROM ai_admin_conversations WHERE context_type = ? AND context_ref = ?', [record.type, record.ref]).changes
  return removed
}

/** Retention: removes the conversations (with their messages) not touched for `retentionDays`. Returns how many. */
export function purgeAdminConversations(db: Database, clock: Clock, retentionDays: number): number {
  return db.run('DELETE FROM ai_admin_conversations WHERE updated_at < ?', [iso(addMs(clock.now(), -retentionDays * DAY))]).changes
}

/** Counts for the usage page: conversations started in a period, by anyone (no words, no names). */
export function countAdminConversations(db: Database, fromDay: string): number {
  return db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ai_admin_conversations WHERE created_at >= ?', [`${fromDay}T00:00:00.000Z`])?.n ?? 0
}
