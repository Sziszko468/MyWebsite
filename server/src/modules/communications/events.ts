import type { AppContext } from '../../context.ts'
import { newId, newReference } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import type { EventKey, EventSource } from './model.ts'

/**
 * System events (PROMPT 28): what other modules already recorded, shown to the customer in their conversation area as events, not as words anybody wrote.
 *
 * How it works, and why it is safe:
 *  - Four modules already write ONE append-only line per fact, in the same transaction as the fact (project events, deliverable events, booking events, quote events). Each of
 *    them now makes one call to a `mirror…` function here with the new line's id. The business rule is not copied: the line is the source of truth, and what is mirrored is read
 *    BACK from it (its type, whether the customer may see it, the few customer-visible words), never passed in.
 *  - A line is mirrored only if the customer may see it (`visibility = 'customer'`) and only for the facts the product lists. Nothing is created for lines written before the
 *    feature existed: only a line written now calls the mirror.
 *  - The same line is mirrored once, whatever happens: the message's `idempotency_key` is `<source>:<line id>` and is UNIQUE, and the insert says `ON CONFLICT DO NOTHING`.
 *  - Mirroring NEVER throws and never undoes the fact: it runs in a savepoint, and any failure is swallowed (the fact stands; the event is simply missing). A test breaks the table
 *    on purpose to prove it.
 *  - The event is a message of the customer's ACTIVITY feed (`conversations.kind = 'activity'`, one per customer and project, made here when the first event arrives). A project's
 *    own conversations show that feed inline (views.ts), so nothing is copied twice.
 *  - An event carries no free text of anybody's: a key, and the few facts the page needs in the reader's language (a title the customer already sees, a number, a status).
 *  - It is never unread and never changes a conversation's status (reads.ts, CONVERSATION_WORKFLOW.md).
 */

type Db = Pick<AppContext, 'db' | 'clock'>

const text = (value: string | null | undefined, max = 160): string | null => (value ? value.replace(/\s+/g, ' ').trim().slice(0, max) : null)

/** The customer's activity feed for a project (or, with no project, for their bookings and quotes); made when it is first needed. */
export function activityFeed(app: Db, customerId: string, projectId: string | null): string {
  const find = () => app.db.get<{ id: string }>("SELECT id FROM conversations WHERE kind = 'activity' AND customer_id = ? AND COALESCE(project_id, '') = ?", [customerId, projectId ?? ''])
  const existing = find()
  if (existing) return existing.id
  const now = iso(app.clock.now())
  app.db.run(
    `INSERT INTO conversations (id, reference, kind, customer_id, project_id, status, started_by, last_activity_at, created_at, updated_at)
     VALUES (?, ?, 'activity', ?, ?, 'open', 'system', ?, ?, ?) ON CONFLICT DO NOTHING`,
    [newId(), newReference('ACT'), customerId, projectId, now, now, now],
  )
  const made = find()
  if (!made) throw new Error('Could not make the activity feed.')
  return made.id
}

export interface EventInput {
  customerId: string
  projectId: string | null
  key: EventKey
  params: Record<string, string | number | boolean | null>
  sourceType: EventSource
  sourceId: string
}

/** Writes one event into the customer's activity feed, once. Returns whether a new message was written. Never throws. */
export function writeSystemEvent(app: Db, input: EventInput): boolean {
  try {
    return app.db.transaction(() => {
      const conversationId = activityFeed(app, input.customerId, input.projectId)
      const now = iso(app.clock.now())
      const params: Record<string, string | number | boolean | null> = {}
      for (const [name, value] of Object.entries(input.params)) params[name] = typeof value === 'string' ? text(value) : value
      const result = app.db.run(
        `INSERT INTO conversation_messages (id, conversation_id, sender_type, sender_id, message_type, visibility, body, event_key, event_params, source_type, source_id, idempotency_key, created_at)
         VALUES (?, ?, 'system', NULL, 'system_event', 'customer', NULL, ?, ?, ?, ?, ?, ?) ON CONFLICT (idempotency_key) DO NOTHING`,
        [newId(), conversationId, input.key, JSON.stringify(params), input.sourceType, input.sourceId, `${input.sourceType}:${input.sourceId}`, now],
      )
      if (result.changes !== 1) return false
      app.db.run('UPDATE conversations SET last_activity_at = ?, updated_at = ? WHERE id = ?', [now, now, conversationId])
      return true
    })
  } catch {
    return false
  }
}

// ---- the four sources -------------------------------------------------------------------------------------------------------------------

/** Projects, milestones, and the customer's tasks (migrations 0012 and 0013): called by `recordProjectEvent` with the new line's id. */
export function mirrorProjectEvent(app: Db, eventId: number): void {
  try {
    const row = app.db.get<{ event_type: string; visibility: string; subject: string | null; to_status: string | null; project_id: string; customer_id: string; name: string }>(
      `SELECT e.event_type, e.visibility, e.subject, e.to_status, e.project_id, p.customer_id, p.name
       FROM client_project_events e JOIN client_projects p ON p.id = e.project_id WHERE e.id = ?`,
      [eventId],
    )
    if (!row || row.visibility !== 'customer') return
    const base = { customerId: row.customer_id, projectId: row.project_id, sourceType: 'project_event' as const, sourceId: String(eventId) }
    switch (row.event_type) {
      case 'created':
        writeSystemEvent(app, { ...base, key: 'project.created', params: { name: row.name } })
        break
      case 'status_changed':
        writeSystemEvent(app, { ...base, key: 'project.status_changed', params: { status: row.to_status } })
        break
      case 'milestone_completed':
        writeSystemEvent(app, { ...base, key: 'milestone.completed', params: { title: row.subject } })
        break
      case 'action_submitted':
        writeSystemEvent(app, { ...base, key: 'task.submitted', params: { title: row.subject } })
        break
      case 'action_accepted':
        writeSystemEvent(app, { ...base, key: 'task.accepted', params: { title: row.subject } })
        break
      case 'action_changes_requested':
        writeSystemEvent(app, { ...base, key: 'task.changes_requested', params: { title: row.subject } })
        break
      default:
    }
  } catch {
    // The fact stands; the event is only a mirror of it.
  }
}

/** Deliverables (migration 0014): called by the deliverables' `recordEvent`. */
export function mirrorDeliverableEvent(app: Db, eventId: number): void {
  try {
    const row = app.db.get<{ event_type: string; visibility: string; version_number: number | null; subject: string | null; title: string; reference: string; published_at: string | null; project_id: string; customer_id: string }>(
      `SELECT e.event_type, e.visibility, e.version_number, e.subject, d.title, d.reference, d.published_at, d.project_id, p.customer_id
       FROM deliverable_events e JOIN deliverables d ON d.id = e.deliverable_id JOIN client_projects p ON p.id = d.project_id WHERE e.id = ?`,
      [eventId],
    )
    if (!row || row.visibility !== 'customer' || !row.published_at) return
    const base = { customerId: row.customer_id, projectId: row.project_id, sourceType: 'deliverable_event' as const, sourceId: String(eventId) }
    const params = { title: row.title, reference: row.reference, version: row.version_number }
    switch (row.event_type) {
      case 'version_published':
        writeSystemEvent(app, { ...base, key: 'deliverable.published', params })
        break
      case 'feedback_submitted':
        writeSystemEvent(app, { ...base, key: 'deliverable.feedback_submitted', params: { ...params, count: Number(row.subject) || 1 } })
        break
      case 'approval_changes_requested':
        writeSystemEvent(app, { ...base, key: 'deliverable.changes_requested', params })
        break
      case 'approval_approved':
        writeSystemEvent(app, { ...base, key: 'deliverable.approved', params })
        break
      default:
    }
  } catch {
    // See above.
  }
}

/** Consultation bookings (migration 0011): called by `recordBookingEvent`. A booking is shown only to the customer it was LINKED to (the owner's or the customer's own explicit act). */
export function mirrorBookingEvent(app: Db, eventId: number): void {
  try {
    const row = app.db.get<{ event_type: string; reference: string; to_start_at: string | null; from_start_at: string | null; start_at: string; time_zone: string; customer_id: string }>(
      `SELECT e.event_type, e.reference, e.to_start_at, e.from_start_at, b.start_at, b.time_zone, l.customer_id
       FROM booking_events e JOIN bookings b ON b.id = e.booking_id JOIN customer_links l ON l.booking_id = b.id WHERE e.id = ?`,
      [eventId],
    )
    if (!row) return
    const base = { customerId: row.customer_id, projectId: null, sourceType: 'booking_event' as const, sourceId: String(eventId) }
    switch (row.event_type) {
      case 'confirmed':
        writeSystemEvent(app, { ...base, key: 'consultation.confirmed', params: { reference: row.reference, at: row.to_start_at ?? row.start_at, zone: row.time_zone } })
        break
      case 'rescheduled':
        writeSystemEvent(app, { ...base, key: 'consultation.rescheduled', params: { reference: row.reference, at: row.to_start_at ?? row.start_at, zone: row.time_zone } })
        break
      case 'cancelled':
        writeSystemEvent(app, { ...base, key: 'consultation.cancelled', params: { reference: row.reference, at: row.from_start_at ?? row.start_at, zone: row.time_zone } })
        break
      default:
    }
  } catch {
    // See above.
  }
}

/** Quotes (migration 0007): called by the quotes' `recordEvent`. Shown to the customer the REQUEST was linked to, in the project that came from it when there is one. */
export function mirrorQuoteEvent(app: Db, eventId: number): void {
  try {
    const row = app.db.get<{ event_type: string; reference: string; quote_reference: string | null; quote_request_id: string; customer_id: string }>(
      `SELECT e.event_type, e.reference, q.reference AS quote_reference, e.quote_request_id, l.customer_id
       FROM quote_events e LEFT JOIN quotes q ON q.id = e.quote_id JOIN customer_links l ON l.quote_request_id = e.quote_request_id WHERE e.id = ?`,
      [eventId],
    )
    if (!row || (row.event_type !== 'quote_sent' && row.event_type !== 'quote_accepted')) return
    const project = app.db.get<{ id: string }>('SELECT id FROM client_projects WHERE quote_request_id = ? AND customer_id = ? ORDER BY created_at LIMIT 1', [row.quote_request_id, row.customer_id])
    writeSystemEvent(app, {
      customerId: row.customer_id,
      projectId: project?.id ?? null,
      key: row.event_type === 'quote_sent' ? 'quote.sent' : 'quote.accepted',
      params: { reference: row.reference, quote: row.quote_reference },
      sourceType: 'quote_event',
      sourceId: String(eventId),
    })
  } catch {
    // See above.
  }
}
