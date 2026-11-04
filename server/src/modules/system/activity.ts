import type { AppContext } from '../../context.ts'

/**
 * The history of one record, and the latest things done anywhere, read from the audit log. The log holds the
 * action, who did it, which record and a short summary (a status change says from what to what); it never holds
 * what a visitor wrote or what an administrator typed into a note, so neither does anything read from it here.
 */

export interface ActivityEvent {
  at: string
  /** The administrator's e-mail address; `null` for something that happened without one (the request arriving). */
  actor: string | null
  /** `received`, or the audit action (`inquiry.status`, `quote.note`, …). */
  action: string
  detail: Record<string, unknown> | null
}

export interface RecentActivity extends ActivityEvent {
  entityType: string
  entityId: string | null
  /** What to call the record: an inquiry's or a quote request's reference, otherwise its key. */
  label: string | null
}

const parse = (text: string | null): Record<string, unknown> | null => {
  if (!text) return null
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function activityOf(app: AppContext, entityType: 'inquiry' | 'quote_request', entityId: string, receivedAt: string): ActivityEvent[] {
  const rows = app.db.all<{ created_at: string; actor: string | null; action: string; detail: string | null }>(
    `SELECT a.created_at, u.email AS actor, a.action, a.detail
     FROM audit_log a LEFT JOIN admin_users u ON u.id = a.actor_id
     WHERE a.entity_type = ? AND a.entity_id = ? ORDER BY a.id`,
    [entityType, entityId],
  )
  return [{ at: receivedAt, actor: null, action: 'received', detail: null }, ...rows.map((row) => ({ at: row.created_at, actor: row.actor, action: row.action, detail: parse(row.detail) }))]
}

export function recentActivity(app: AppContext, limit: number): RecentActivity[] {
  return app.db
    .all<{ created_at: string; actor: string | null; action: string; entity_type: string; entity_id: string | null; detail: string | null; inquiry_ref: string | null; quote_ref: string | null }>(
      `SELECT a.created_at, u.email AS actor, a.action, a.entity_type, a.entity_id, a.detail, i.reference AS inquiry_ref, q.reference AS quote_ref
       FROM audit_log a
       LEFT JOIN admin_users u ON u.id = a.actor_id
       LEFT JOIN inquiries i ON a.entity_type = 'inquiry' AND i.id = a.entity_id
       LEFT JOIN quote_requests q ON a.entity_type = 'quote_request' AND q.id = a.entity_id
       ORDER BY a.id DESC LIMIT ?`,
      [limit],
    )
    .map((row) => ({
      at: row.created_at,
      actor: row.actor,
      action: row.action,
      detail: parse(row.detail),
      entityType: row.entity_type,
      entityId: row.entity_id,
      label: row.inquiry_ref ?? row.quote_ref ?? row.entity_id,
    }))
}
