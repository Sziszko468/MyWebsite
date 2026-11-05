import type { AppContext, SessionInfo } from '../../context.ts'
import { conflict, notFound, validationFailed } from '../../http/errors.ts'
import { LANGUAGES } from '../../config.ts'
import { cleanLine } from '../../lib/text.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { notificationPreferences, RESPONSE_NOTE_MAX, saveNotificationPreferences, type NotificationPreferences } from '../system/settings.ts'
import type { DeliveryRow } from './notifier.ts'

/**
 * The administration's view of e-mail: what is configured (and what has actually been verified), which notifications
 * are sent, and the log of every message. It states the integration's real condition and nothing better: "sent" means the
 * provider accepted the message, "delivered" only appears when the provider said so in a signed event, and with no
 * provider (or with sending paused) the page says e-mail is not available. A setting being present is never shown as a
 * working set-up: the checks (checks.ts) ask the provider, the DNS, Cloudflare and the log of real messages.
 */

export const PAGE_SIZE = 20

export interface DeliveryView {
  id: string
  kind: string
  relatedType: string
  /** The record's id, so the screen can link to it; null for a message that belongs to no record (a test). */
  relatedId: string | null
  reference: string | null
  recipient: string
  language: string
  status: string
  /** A message waiting for another attempt after a failed one. */
  retrying: boolean
  attempts: number
  nextAttemptAt: string | null
  /** The kind of failure (auth, quota, rejected, unavailable, bounced, …) the screen words in the administrator's language. */
  errorCode: string | null
  /** The provider's reason, with addresses and tokens masked. */
  lastError: string | null
  providerEvent: string | null
  acceptedAt: string | null
  deliveredAt: string | null
  createdAt: string
}

const STATUSES = new Set(['pending', 'sending', 'accepted', 'delivered', 'bounced', 'complained', 'failed', 'cancelled'])

function view(row: DeliveryRow & { reference: string | null }): DeliveryView {
  return {
    id: row.id,
    kind: row.kind,
    relatedType: row.related_type,
    relatedId: row.related_type === 'system' ? null : row.related_id,
    reference: row.reference,
    recipient: row.recipient,
    language: row.language,
    status: row.status,
    retrying: row.status === 'pending' && row.attempts > 0,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    errorCode: row.error_code,
    lastError: row.last_error,
    providerEvent: row.provider_event,
    acceptedAt: row.accepted_at,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
  }
}

export function overview(app: AppContext, session: SessionInfo | null, query: URLSearchParams = new URLSearchParams()) {
  requirePermission(session, 'requests:read')
  const summary = app.notifier.summary()
  const email = app.config.email
  const prefs = notificationPreferences(app.db)
  const ownerReachable = summary.enabled && email.notifyTo !== null

  const requested = query.get('status') ?? ''
  const page = Math.max(1, Number.parseInt(query.get('page') ?? '1', 10) || 1)
  const where: string[] = []
  const params: (string | number)[] = []
  if (requested === 'retrying') where.push("d.status = 'pending' AND d.attempts > 0")
  else if (requested === 'problem') where.push("d.status IN ('failed', 'bounced', 'complained')")
  else if (STATUSES.has(requested)) {
    where.push('d.status = ?')
    params.push(requested)
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const total = app.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM email_deliveries d ${clause}`, params)?.n ?? 0
  const rows = app.db.all<DeliveryRow & { reference: string | null }>(
    `SELECT d.*, COALESCE(i.reference, q.reference) AS reference
     FROM email_deliveries d
     LEFT JOIN inquiries i ON d.related_type = 'inquiry' AND i.id = d.related_id
     LEFT JOIN quote_requests q ON d.related_type = 'quote_request' AND q.id = d.related_id
     ${clause}
     ORDER BY d.created_at DESC, d.id LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE],
  )

  const automatic = (id: string, enabled: boolean) => ({ id, automatic: true, enabled, active: enabled && ownerReachable })
  return {
    integration: {
      enabled: summary.enabled,
      paused: summary.paused,
      provider: email.provider,
      senderConfigured: email.from !== null,
      /** Whether a public contact address (what customers' replies go to) is configured; the address itself is shown, it is public. */
      replyTo: email.replyTo,
      ownerAddressConfigured: email.notifyTo !== null,
      ownerLanguage: email.notifyLanguage,
      secure: email.smtp?.secure ?? null,
      /** Only that a secret is set, never what it is. */
      webhookSecretSet: email.webhookSecret !== null,
      cloudflareApiSet: email.cloudflare !== null,
    },
    types: [
      automatic('new_inquiry', prefs.newInquiry),
      automatic('new_quote', prefs.newQuote),
      // Sent to the person who wrote, only if an administrator switched confirmations on (they are off until then).
      { id: 'confirm_inquiry', automatic: true, enabled: prefs.confirmInquiry, active: prefs.confirmInquiry && summary.enabled },
      { id: 'confirm_quote', automatic: true, enabled: prefs.confirmQuote, active: prefs.confirmQuote && summary.enabled },
      // Sent to the person who wrote, only when an administrator ticks the box on a status change; there is no switch to turn on.
      { id: 'status_update', automatic: false, enabled: true, active: summary.enabled },
    ],
    preferences: prefs,
    responseNoteMax: RESPONSE_NOTE_MAX,
    counts: { pending: summary.pending, sent: summary.accepted, delivered: summary.delivered, failed: summary.failed, bounced: summary.bounced },
    lastFailure: summary.lastFailure,
    /** What was found when the checks last ran (null: not since the server started), each with the time it was asked. */
    checks: app.emailChecks.last(),
    deliveries: rows.map(view),
    paging: { page, pageSize: PAGE_SIZE, total },
  }
}

const note = (value: unknown, field: string): string => {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw validationFailed({ [field]: 'invalid' })
  const cleaned = cleanLine(value)
  if ([...cleaned].length > RESPONSE_NOTE_MAX) throw validationFailed({ [field]: 'tooLong' })
  return cleaned
}

export function savePreferences(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): NotificationPreferences {
  const actor = requirePermission(session, 'system:write')
  if (typeof body.newInquiry !== 'boolean' || typeof body.newQuote !== 'boolean') throw validationFailed({ body: 'invalid' })
  const current = notificationPreferences(app.db)
  const flag = (value: unknown, fallback: boolean, field: string): boolean => {
    if (value === undefined) return fallback
    if (typeof value !== 'boolean') throw validationFailed({ [field]: 'invalid' })
    return value
  }
  const notes = body.responseNote
  if (notes !== undefined && (typeof notes !== 'object' || notes === null || Array.isArray(notes))) throw validationFailed({ responseNote: 'invalid' })
  const given = (notes ?? {}) as Record<string, unknown>
  const responseNote = Object.fromEntries(LANGUAGES.map((language) => [language, language in given ? note(given[language], `responseNote.${language}`) : current.responseNote[language]])) as NotificationPreferences['responseNote']
  const next: NotificationPreferences = {
    newInquiry: body.newInquiry,
    newQuote: body.newQuote,
    confirmInquiry: flag(body.confirmInquiry, current.confirmInquiry, 'confirmInquiry'),
    confirmQuote: flag(body.confirmQuote, current.confirmQuote, 'confirmQuote'),
    responseNote,
  }
  saveNotificationPreferences(app.db, app.clock, actor.userId, next)
  // The log names what was switched, not what was written in the note.
  audit(app, actor, 'settings.notifications', 'settings', null, { newInquiry: next.newInquiry, newQuote: next.newQuote, confirmInquiry: next.confirmInquiry, confirmQuote: next.confirmQuote, responseNoteSet: LANGUAGES.filter((language) => next.responseNote[language] !== '') })
  return next
}

/** Puts a failed message back in the queue and sends it at once; only a failed one can be retried. */
export function retry(app: AppContext, session: SessionInfo | null, id: string): void {
  const actor = requirePermission(session, 'requests:write')
  const row = app.db.get<{ status: string }>('SELECT status FROM email_deliveries WHERE id = ?', [id])
  if (!row) throw notFound('The message')
  if (!app.notifier.enabled) throw conflict(app.notifier.paused ? 'E-mail sending is paused, so nothing can be sent.' : 'E-mail is not configured, so nothing can be sent.')
  if (row.status !== 'failed') throw conflict('Only a message that failed can be sent again.')
  app.notifier.retry(id)
  audit(app, actor, 'notification.retry', 'email_delivery', id)
}

/** Asks the provider, the DNS and Cloudflare again, and answers with what they said. */
export async function runChecks(app: AppContext, session: SessionInfo | null) {
  const actor = requirePermission(session, 'system:read')
  const result = await app.emailChecks.run()
  audit(app, actor, 'notification.checks', 'settings', null, { verified: result.checks.filter((check) => check.state === 'verified').length, total: result.checks.length })
  return result
}

/** Sends a test message to the owner's address (the one in `NOTIFY_TO`), to find out whether sending works at all. */
export function sendTest(app: AppContext, session: SessionInfo | null): { id: string } {
  const actor = requirePermission(session, 'system:write')
  if (!app.notifier.enabled) throw conflict(app.notifier.paused ? 'E-mail sending is paused, so nothing can be sent.' : 'E-mail is not configured, so nothing can be sent.')
  if (app.config.email.notifyTo === null) throw conflict('There is no owner address (NOTIFY_TO) to send a test message to.')
  const id = app.notifier.sendTest()
  if (!id) throw conflict('The test message could not be queued.')
  audit(app, actor, 'notification.test', 'email_delivery', id)
  return { id }
}
