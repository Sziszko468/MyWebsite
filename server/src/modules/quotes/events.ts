import type { AppContext, SessionInfo } from '../../context.ts'
import { iso } from '../../lib/time.ts'
import type { RequestStatus } from './status.ts'

/**
 * The quotation history: one append-only line for everything that matters about a request, written by the same code that does the
 * thing, in the same transaction. The database refuses to change or delete a line (migration 0007), nothing in the administration edits
 * it, and a line carries a reference, a status and a short fixed summary: never what a person typed, never a secret. (What an
 * administrator did also goes to `audit_log`, as before.)
 */

export type EventType =
  | 'request_created'
  | 'request_updated'
  | 'status_changed'
  | 'priority_changed'
  | 'note_added'
  | 'archived'
  | 'restored'
  | 'quote_created'
  | 'quote_edited'
  | 'quote_version_created'
  | 'quote_sent'
  | 'quote_resent'
  | 'quote_accepted'
  | 'quote_declined'
  | 'quote_superseded'
  | 'quote_withdrawn'
  | 'revision_requested'
  | 'customer_notified'
  | 'customer_update_posted'
  | 'email_failed'
  | 'email_retried'
  | 'link_revoked'
  | 'request_deleted'

export type Actor = { type: 'admin'; session: Pick<SessionInfo, 'userId'> } | { type: 'customer' } | { type: 'system' } | { type: 'assistant' }

export interface EventInput {
  requestId: string
  reference: string
  quoteId?: string | null
  type: EventType
  actor: Actor
  from?: RequestStatus | null
  to?: RequestStatus | null
  /** A short fixed phrase or code (never free text from a person). */
  summary?: string | null
}

export function recordEvent(app: AppContext, event: EventInput): void {
  app.db.run(
    `INSERT INTO quote_events (quote_request_id, quote_id, reference, event_type, actor_type, actor_id, from_status, to_status, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.requestId, event.quoteId ?? null, event.reference, event.type, event.actor.type, event.actor.type === 'admin' ? event.actor.session.userId : null, event.from ?? null, event.to ?? null, event.summary ? event.summary.slice(0, 200) : null, iso(app.clock.now())],
  )
}

export interface EventView {
  id: number
  at: string
  type: EventType
  actorType: 'admin' | 'customer' | 'system' | 'assistant'
  actor: string | null
  quoteReference: string | null
  from: RequestStatus | null
  to: RequestStatus | null
  summary: string | null
}

export function eventsOf(app: AppContext, requestId: string): EventView[] {
  return app.db
    .all<{ id: number; created_at: string; event_type: EventType; actor_type: EventView['actorType']; actor: string | null; quote_reference: string | null; from_status: RequestStatus | null; to_status: RequestStatus | null; summary: string | null }>(
      `SELECT e.id, e.created_at, e.event_type, e.actor_type, u.email AS actor, q.reference AS quote_reference, e.from_status, e.to_status, e.summary
       FROM quote_events e LEFT JOIN admin_users u ON u.id = e.actor_id LEFT JOIN quotes q ON q.id = e.quote_id
       WHERE e.quote_request_id = ? ORDER BY e.id`,
      [requestId],
    )
    .map((row) => ({ id: row.id, at: row.created_at, type: row.event_type, actorType: row.actor_type, actor: row.actor, quoteReference: row.quote_reference, from: row.from_status, to: row.to_status, summary: row.summary }))
}
