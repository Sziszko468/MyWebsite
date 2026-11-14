import type { AppContext } from '../../context.ts'
import { addMs, DAY, iso } from '../../lib/time.ts'
import { normalizeEmail } from '../auth/users.ts'
import { purgeExpiredSessions } from '../auth/sessions.ts'
import { sweepAbandoned } from '../ai/budget.ts'
import { loadSettings } from '../ai/settings.ts'
import { purge as purgeAssistant } from '../ai/store.ts'
import { deleteDeliveriesOfRequest } from '../quotes/deliveries.ts'
import { purgeTokens } from '../quotes/tokens.ts'

/**
 * Housekeeping and the deletion procedures. Nothing here runs unless it is asked to: the maintenance task is
 * started by the operator (`npm run server:maintenance`) or by the server's daily timer, and the retention
 * period is the owner's decision (`RETENTION_DAYS`; unset keeps everything). This is technical machinery for a
 * policy; it is not a legal assessment of what the policy should be.
 */

export interface MaintenanceResult {
  expiredSessions: number
  inquiries: number
  quoteRequests: number
  deliveries: number
  /** Customer links that expired more than a month ago. */
  expiredLinks: number
  retentionDays: number | null
  /** The assistant: conversations whose words were removed, idle sessions removed, expired approvals cleared, reservations that never reconciled. */
  assistant: { conversations: number; sessions: number; approvals: number; abandonedRequests: number }
}

export function runMaintenance(app: AppContext): MaintenanceResult {
  const { db, clock, config } = app
  const result: MaintenanceResult = { expiredSessions: purgeExpiredSessions(app), inquiries: 0, quoteRequests: 0, deliveries: 0, expiredLinks: purgeTokens(app), retentionDays: config.retentionDays, assistant: { conversations: 0, sessions: 0, approvals: 0, abandonedRequests: 0 } }
  result.assistant = { ...purgeAssistant(db, clock, loadSettings(app).retentionDays), abandonedRequests: sweepAbandoned(app) }
  if (config.retentionDays !== null) {
    const cutoff = iso(addMs(clock.now(), -config.retentionDays * DAY))
    db.transaction(() => {
      // Only what is finished: archived, or completed (inquiries) / completed, cancelled or declined (quote requests). A request still open is never deleted by age.
      result.inquiries = db.run("DELETE FROM inquiries WHERE updated_at < ? AND (archived_at IS NOT NULL OR status = 'completed')", [cutoff]).changes
      result.quoteRequests = db.run("DELETE FROM quote_requests WHERE updated_at < ? AND (archived_at IS NOT NULL OR status IN ('completed', 'cancelled', 'declined'))", [cutoff]).changes
      result.deliveries = db.run("DELETE FROM email_deliveries WHERE created_at < ? AND status IN ('accepted', 'delivered', 'bounced', 'complained', 'failed', 'cancelled')", [cutoff]).changes
    })
  }
  return result
}

export interface ErasureResult {
  inquiries: number
  quoteRequests: number
  deliveries: number
}

/** Everything the site holds about one e-mail address: the messages, the requests (and their notes and items) and the delivery log. */
export function eraseByEmail(app: AppContext, email: string): ErasureResult {
  const { db } = app
  const address = normalizeEmail(email)
  return db.transaction(() => {
    // The messages about this person's requests and quotations that were addressed to someone else (the owner's notifications) go too:
    // they hold no text of their own, but they point at records that are about to disappear.
    let deliveries = 0
    for (const request of db.all<{ id: string }>('SELECT id FROM quote_requests WHERE email = ?', [address])) deliveries += deleteDeliveriesOfRequest(db, request.id)
    deliveries += db.run('DELETE FROM email_deliveries WHERE recipient = ? COLLATE NOCASE', [address]).changes
    const inquiries = db.run('DELETE FROM inquiries WHERE email = ?', [address]).changes
    // The request takes its items, notes, quotations, lines, links, questions and status-page entries with it (cascades); the history keeps one line per
    // event, with a reference and a status and nothing a person wrote.
    const quoteRequests = db.run('DELETE FROM quote_requests WHERE email = ?', [address]).changes
    return { inquiries, quoteRequests, deliveries }
  })
}
