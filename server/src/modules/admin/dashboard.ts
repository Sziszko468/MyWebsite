import type { AppContext, SessionInfo } from '../../context.ts'
import { addMs, DAY, iso } from '../../lib/time.ts'
import { requirePermission } from '../auth/permissions.ts'
import { countInquiriesSince, inquiryCounts, listInquiries, type InquiryRow } from '../inquiries/repository.ts'
import { countQuotesSince, listQuotes, quoteCounts, type QuoteRow } from '../quotes/repository.ts'
import { recentActivity } from '../system/activity.ts'

/**
 * The overview. Every number is counted from the database when the page asks: nothing is cached, estimated or
 * made up, and an empty database gives zeros and empty lists (the page then says so instead of showing activity).
 */

type Hidden = 'ip_hash' | 'content_hash'
const withoutFingerprints = <T extends InquiryRow | QuoteRow>(row: T): Omit<T, Hidden> => {
  const { ip_hash: _a, content_hash: _b, ...rest } = row
  return rest
}

export interface RecentItem {
  kind: 'service' | 'package' | 'extra' | 'faq'
  key: string
  title: string
  status: string
  updatedAt: string
}

/** What was edited lately: only rows changed after they were created (a freshly seeded catalogue is not "activity"). */
function recentlyEdited(app: AppContext, limit: number): RecentItem[] {
  return app.db
    .all<{ kind: RecentItem['kind']; key: string; title: string | null; status: string; updated_at: string }>(
      `SELECT * FROM (
         SELECT 'service' AS kind, s.slug AS key, (SELECT title FROM service_translations t WHERE t.service_id = s.id AND t.language = 'hu') AS title, s.status, s.updated_at FROM services s WHERE s.updated_at > s.created_at
         UNION ALL
         SELECT 'package', p.code, (SELECT name FROM package_translations t WHERE t.package_id = p.id AND t.language = 'hu'), p.status, p.updated_at FROM packages p WHERE p.updated_at > p.created_at
         UNION ALL
         SELECT 'extra', e.code, (SELECT name FROM extra_translations t WHERE t.extra_id = e.id AND t.language = 'hu'), e.status, e.updated_at FROM extras e WHERE e.updated_at > e.created_at
         UNION ALL
         SELECT 'faq', c.slug, (SELECT title FROM site_content_translations t WHERE t.content_id = c.id AND t.language = 'hu'), c.status, c.updated_at FROM site_content c WHERE c.type = 'faq' AND c.updated_at > c.created_at
       ) ORDER BY updated_at DESC LIMIT ?`,
      [limit],
    )
    .map((row) => ({ kind: row.kind, key: row.key, title: row.title?.trim() || row.key, status: row.status, updatedAt: row.updated_at }))
}

export function dashboard(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'requests:read')
  const now = app.clock.now()
  const since7 = iso(addMs(now, -7 * DAY))
  const since30 = iso(addMs(now, -30 * DAY))

  const inq = inquiryCounts(app.db)
  const qts = quoteCounts(app.db)
  const count = (counts: Record<string, number>, status: string) => counts[status] ?? 0
  const recentInquiries = listInquiries(app.db, { page: 1, pageSize: 5, archived: 'exclude' }).rows.map(withoutFingerprints)
  const recentQuotes = listQuotes(app.db, { page: 1, pageSize: 5, archived: 'exclude' }).rows.map(withoutFingerprints)

  const quotePending = count(qts.byStatus, 'new') + count(qts.byStatus, 'in_review')
  const quoteDone = count(qts.byStatus, 'accepted') + count(qts.byStatus, 'declined') + count(qts.byStatus, 'closed')
  const inquiryDone = count(inq.byStatus, 'completed')

  return {
    inquiries: {
      total: inq.total,
      new: count(inq.byStatus, 'new'),
      inProgress: count(inq.byStatus, 'in_progress'),
      waitingClient: count(inq.byStatus, 'waiting_client'),
      completed: inquiryDone,
      archived: inq.archived,
      last7Days: countInquiriesSince(app.db, since7),
      last30Days: countInquiriesSince(app.db, since30),
    },
    quotes: {
      total: qts.total,
      new: count(qts.byStatus, 'new'),
      inReview: count(qts.byStatus, 'in_review'),
      quoted: count(qts.byStatus, 'quoted'),
      accepted: count(qts.byStatus, 'accepted'),
      declined: count(qts.byStatus, 'declined'),
      closed: count(qts.byStatus, 'closed'),
      pending: quotePending,
      completed: quoteDone,
      archived: qts.archived,
      last7Days: countQuotesSince(app.db, since7),
      last30Days: countQuotesSince(app.db, since30),
    },
    /** Completed work, both kinds together (the two parts are in `inquiries.completed` and `quotes.completed`). */
    completedRequests: inquiryDone + quoteDone,
    recentInquiries,
    recentQuotes,
    recentlyEdited: recentlyEdited(app, 5),
    activity: recentActivity(app, 10),
    email: app.notifier.summary(),
  }
}
