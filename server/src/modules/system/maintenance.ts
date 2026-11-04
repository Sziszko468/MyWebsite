import type { AppContext } from '../../context.ts'
import { addMs, DAY, iso } from '../../lib/time.ts'
import { normalizeEmail } from '../auth/users.ts'
import { purgeExpiredSessions } from '../auth/sessions.ts'

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
  retentionDays: number | null
}

export function runMaintenance(app: AppContext): MaintenanceResult {
  const { db, clock, config } = app
  const result: MaintenanceResult = { expiredSessions: purgeExpiredSessions(app), inquiries: 0, quoteRequests: 0, deliveries: 0, retentionDays: config.retentionDays }
  if (config.retentionDays !== null) {
    const cutoff = iso(addMs(clock.now(), -config.retentionDays * DAY))
    db.transaction(() => {
      // Only what is finished: archived, or completed (inquiries) / closed or declined (quote requests). A request still open is never deleted by age.
      result.inquiries = db.run("DELETE FROM inquiries WHERE updated_at < ? AND (archived_at IS NOT NULL OR status = 'completed')", [cutoff]).changes
      result.quoteRequests = db.run("DELETE FROM quote_requests WHERE updated_at < ? AND (archived_at IS NOT NULL OR status IN ('closed', 'declined'))", [cutoff]).changes
      result.deliveries = db.run("DELETE FROM email_deliveries WHERE created_at < ? AND status IN ('accepted', 'failed', 'cancelled')", [cutoff]).changes
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
    const deliveries = db.run('DELETE FROM email_deliveries WHERE recipient = ? COLLATE NOCASE', [address]).changes
    const inquiries = db.run('DELETE FROM inquiries WHERE email = ?', [address]).changes
    const quoteRequests = db.run('DELETE FROM quote_requests WHERE email = ?', [address]).changes
    return { inquiries, quoteRequests, deliveries }
  })
}
