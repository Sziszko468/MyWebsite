import type { AppContext } from '../../context.ts'
import { iso } from '../../lib/time.ts'
import type { ConversationRow } from './model.ts'

/**
 * Who has read what (migration 0015, `conversation_reads`). A marker is the highest message `seq` a reader has been shown, one per reader per conversation: a customer is read as
 * themselves, an administrator as that one administrator (so two administrators have two markers and neither clears the other's unread). Nothing is cached in a column: every count is
 * computed from the messages and the marker, so it cannot drift and a message can never be counted twice.
 *
 * What counts as unread, by reader (documented in READ_TRACKING.md):
 *  - for the CUSTOMER: the owner's customer-visible texts and announcements that are not removed, after their marker;
 *  - for an ADMINISTRATOR: the customer's texts that are not removed, after that administrator's marker.
 * Neither side's own messages, nobody's private notes (for the customer), and no system event is ever unread: an event is context, not something somebody must answer.
 */

export type Reader = { type: 'customer'; id: string } | { type: 'admin'; id: string }

/** SQL fragments over `conversations c` and `conversation_reads r` (joined on the reader). Fixed text, never built from input. */
export const sql = {
  /** The statuses of a thread that is not finished (model.ts ACTIVE_STATUSES). */
  active: `'open', 'waiting_owner', 'waiting_customer'`,
  customerUnread: `(SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id AND m.sender_type = 'admin' AND m.visibility = 'customer' AND m.message_type IN ('text', 'announcement') AND m.deleted_at IS NULL AND m.seq > COALESCE(r.last_read_seq, 0))`,
  adminUnread: `(SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id AND m.sender_type = 'customer' AND m.deleted_at IS NULL AND m.seq > COALESCE(r.last_read_seq, 0))`,
} as const

/** The highest `seq` of this conversation that the reader is allowed to have been shown (so a marker can never claim more than exists or than they can see). */
function visibleMax(app: Pick<AppContext, 'db'>, conversationId: string, reader: Reader): number {
  const row =
    reader.type === 'customer'
      ? app.db.get<{ top: number | null }>("SELECT MAX(seq) AS top FROM conversation_messages WHERE conversation_id = ? AND visibility = 'customer'", [conversationId])
      : app.db.get<{ top: number | null }>('SELECT MAX(seq) AS top FROM conversation_messages WHERE conversation_id = ?', [conversationId])
  return row?.top ?? 0
}

export function readMarker(app: Pick<AppContext, 'db'>, conversationId: string, reader: Reader): number {
  return app.db.get<{ last_read_seq: number }>('SELECT last_read_seq FROM conversation_reads WHERE conversation_id = ? AND reader_type = ? AND reader_id = ?', [conversationId, reader.type, reader.id])?.last_read_seq ?? 0
}

/**
 * Moves the reader's marker forward to `upTo` (what their screen has actually received), but never past what exists and is visible to them, and never backwards. Returns the marker.
 * The screen asks AFTER the messages arrived; opening a conversation, by itself, marks nothing.
 */
export function markRead(app: Pick<AppContext, 'db' | 'clock'>, conversation: Pick<ConversationRow, 'id'>, reader: Reader, upTo: number): number {
  const target = Math.min(Math.max(0, Math.floor(upTo)), visibleMax(app, conversation.id, reader))
  app.db.run(
    `INSERT INTO conversation_reads (conversation_id, reader_type, reader_id, last_read_seq, last_read_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (conversation_id, reader_type, reader_id) DO UPDATE SET last_read_seq = MAX(last_read_seq, excluded.last_read_seq), last_read_at = CASE WHEN excluded.last_read_seq > last_read_seq THEN excluded.last_read_at ELSE last_read_at END`,
    [conversation.id, reader.type, reader.id, target, iso(app.clock.now())],
  )
  return readMarker(app, conversation.id, reader)
}

/** How many unread messages one conversation holds for this reader. */
export function unreadIn(app: Pick<AppContext, 'db'>, conversationId: string, reader: Reader): number {
  const query =
    reader.type === 'customer'
      ? `SELECT ${sql.customerUnread} AS n FROM conversations c LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.reader_type = 'customer' AND r.reader_id = ? WHERE c.id = ?`
      : `SELECT ${sql.adminUnread} AS n FROM conversations c LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.reader_type = 'admin' AND r.reader_id = ? WHERE c.id = ?`
  return app.db.get<{ n: number }>(query, [reader.id, conversationId])?.n ?? 0
}

/** Every unread message of a customer, in all their threads (an activity feed is never unread). */
export function customerUnreadTotal(app: Pick<AppContext, 'db'>, customerId: string): number {
  return (
    app.db.get<{ n: number }>(
      `SELECT COALESCE(SUM(${sql.customerUnread}), 0) AS n FROM conversations c LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.reader_type = 'customer' AND r.reader_id = c.customer_id
       WHERE c.customer_id = ? AND c.kind = 'thread'`,
      [customerId],
    )?.n ?? 0
  )
}

/** How many threads have at least one unread customer message for this administrator, and how many such messages in all. */
export function adminUnreadTotals(app: Pick<AppContext, 'db'>, adminId: string): { threads: number; messages: number } {
  const row = app.db.get<{ threads: number | null; messages: number | null }>(
    `SELECT COUNT(*) AS threads, COALESCE(SUM(u.n), 0) AS messages FROM (
       SELECT ${sql.adminUnread} AS n FROM conversations c LEFT JOIN conversation_reads r ON r.conversation_id = c.id AND r.reader_type = 'admin' AND r.reader_id = ? WHERE c.kind = 'thread'
     ) u WHERE u.n > 0`,
    [adminId],
  )
  return { threads: row?.threads ?? 0, messages: row?.messages ?? 0 }
}
