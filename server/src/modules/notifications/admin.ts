import type { AppContext, SessionInfo } from '../../context.ts'
import { conflict, notFound, validationFailed } from '../../http/errors.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { notificationPreferences, saveNotificationPreferences, type NotificationPreferences } from '../system/settings.ts'

/**
 * The administration's view of e-mail: what is configured, which notifications are sent, and the delivery log. It
 * states the integration's real condition and nothing better: "accepted" is the strongest status a message can have,
 * and it means the provider took the message, not that anyone read it. With no provider configured the page says
 * e-mail is not available; it never shows a message as sent that was not.
 */

export interface DeliveryView {
  id: string
  kind: string
  reference: string | null
  recipient: string
  language: string
  status: string
  attempts: number
  nextAttemptAt: string | null
  lastError: string | null
  acceptedAt: string | null
  createdAt: string
}

export function overview(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'requests:read')
  const summary = app.notifier.summary()
  const email = app.config.email
  const prefs = notificationPreferences(app.db)
  const ownerReachable = summary.enabled && email.notifyTo !== null
  const deliveries = app.db
    .all<{ id: string; kind: string; reference: string | null; recipient: string; language: string; status: string; attempts: number; next_attempt_at: string | null; last_error: string | null; accepted_at: string | null; created_at: string }>(
      `SELECT d.id, d.kind, COALESCE(i.reference, q.reference) AS reference, d.recipient, d.language, d.status, d.attempts, d.next_attempt_at, d.last_error, d.accepted_at, d.created_at
       FROM email_deliveries d
       LEFT JOIN inquiries i ON d.related_type = 'inquiry' AND i.id = d.related_id
       LEFT JOIN quote_requests q ON d.related_type = 'quote_request' AND q.id = d.related_id
       ORDER BY d.created_at DESC, d.id LIMIT 25`,
    )
    .map((row): DeliveryView => ({ id: row.id, kind: row.kind, reference: row.reference, recipient: row.recipient, language: row.language, status: row.status, attempts: row.attempts, nextAttemptAt: row.next_attempt_at, lastError: row.last_error, acceptedAt: row.accepted_at, createdAt: row.created_at }))
  return {
    integration: {
      enabled: summary.enabled,
      provider: email.provider,
      senderConfigured: email.from !== null,
      ownerAddressConfigured: email.notifyTo !== null,
      ownerLanguage: email.notifyLanguage,
      secure: email.smtp?.secure ?? null,
    },
    types: [
      { id: 'new_inquiry', automatic: true, enabled: prefs.newInquiry, active: prefs.newInquiry && ownerReachable },
      { id: 'new_quote', automatic: true, enabled: prefs.newQuote, active: prefs.newQuote && ownerReachable },
      // Sent to the person who wrote, only when an administrator ticks the box on a status change; there is no switch to turn on.
      { id: 'status_update', automatic: false, enabled: true, active: summary.enabled },
    ],
    preferences: prefs,
    counts: { pending: summary.pending, accepted: summary.accepted, failed: summary.failed },
    lastFailure: summary.lastFailure,
    deliveries,
  }
}

export function savePreferences(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): NotificationPreferences {
  const actor = requirePermission(session, 'system:write')
  if (typeof body.newInquiry !== 'boolean' || typeof body.newQuote !== 'boolean') throw validationFailed({ body: 'invalid' })
  const next = { newInquiry: body.newInquiry, newQuote: body.newQuote }
  saveNotificationPreferences(app.db, app.clock, actor.userId, next)
  audit(app, actor, 'settings.notifications', 'settings', null, next)
  return next
}

/** Puts a failed message back in the queue and sends it at once; only a failed one can be retried. */
export function retry(app: AppContext, session: SessionInfo | null, id: string): void {
  const actor = requirePermission(session, 'requests:write')
  const row = app.db.get<{ status: string }>('SELECT status FROM email_deliveries WHERE id = ?', [id])
  if (!row) throw notFound('The message')
  if (!app.notifier.enabled) throw conflict('E-mail is not configured, so nothing can be sent.')
  if (row.status !== 'failed') throw conflict('Only a message that failed can be sent again.')
  app.notifier.retry(id)
  audit(app, actor, 'notification.retry', 'email_delivery', id)
}
