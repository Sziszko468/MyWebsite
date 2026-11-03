import type { AppContext, SessionInfo } from '../../context.ts'
import { iso } from '../../lib/time.ts'

/** What an administrator did, for the operator. It records the action and the record it touched, never what a visitor wrote. */
export function audit(app: AppContext, actor: Pick<SessionInfo, 'userId'> | null, action: string, entityType: string, entityId: string | number | null, detail?: Record<string, unknown>): void {
  app.db.run('INSERT INTO audit_log (actor_id, action, entity_type, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    actor?.userId ?? null,
    action,
    entityType,
    entityId === null ? null : String(entityId),
    detail ? JSON.stringify(detail).slice(0, 500) : null,
    iso(app.clock.now()),
  ])
}

export interface AuditEntry {
  id: number
  actor: string | null
  action: string
  entity_type: string
  entity_id: string | null
  detail: string | null
  created_at: string
}

export const recentAudit = (app: AppContext, limit = 20): AuditEntry[] =>
  app.db.all<AuditEntry>(
    `SELECT a.id, u.email AS actor, a.action, a.entity_type, a.entity_id, a.detail, a.created_at
     FROM audit_log a LEFT JOIN admin_users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ?`,
    [limit],
  )
