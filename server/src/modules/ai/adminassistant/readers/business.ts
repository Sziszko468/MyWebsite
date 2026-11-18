import { todayKey } from '../../../projectwork/settings.ts'
import { ageDays, dayKey, dayStart, iso, OUT_OF_CONTEXT } from '../model.ts'
import { isGeneral } from '../scope.ts'
import { link, type ReadCtx } from './common.ts'

/**
 * The business as a whole: overview, activity, alerts and the daily briefing. General context only (a conversation about one customer must not turn into a count of the others).
 * Every number is counted from stored records with a stated period; each part is built only if the administrator's CURRENT role may read the data behind it, and a part that is
 * not available says so without a number. Nothing here is estimated, projected or compared with a guess, and nothing is invented to fill a quiet week.
 */

export type Period = 'today' | 'last_7_days' | 'last_30_days' | 'this_month'

export function periodRange(ctx: ReadCtx, period: Period): { name: Period; from: string; to: string; fromDay: string; toDay: string } {
  const now = ctx.app.clock.now()
  const toDay = dayKey(now)
  const start = new Date(now)
  if (period === 'today') start.setUTCHours(0, 0, 0, 0)
  else if (period === 'last_7_days') start.setUTCDate(start.getUTCDate() - 6)
  else if (period === 'last_30_days') start.setUTCDate(start.getUTCDate() - 29)
  else start.setUTCDate(1)
  const fromDay = dayKey(start)
  return { name: period, from: dayStart(fromDay), to: iso(now), fromDay, toDay }
}

const UNAVAILABLE = { available: false as const, reason: 'not_available_to_you' as const }
const OPEN_QUOTE = ['new', 'under_review', 'waiting_customer', 'quote_preparation']
const ACTIVE_PROJECT = "p.status NOT IN ('completed', 'cancelled')"
const ACTIVE_BOOKING = "('pending', 'confirmed', 'reschedule_requested', 'rescheduled')"

const count = (ctx: ReadCtx, sql: string, params: Array<string | number> = []): number => ctx.app.db.get<{ n: number }>(sql, params)?.n ?? 0
// (The statements below are built only from the constants of this file and `?` placeholders; nothing a person or the model typed is ever put into one.)
const rows = <T>(ctx: ReadCtx, sql: string, params: Array<string | number> = []): T[] => ctx.app.db.all<T>(sql, params)

const UNANSWERED = `(SELECT m.sender_type FROM conversation_messages m WHERE m.conversation_id = c.id AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL ORDER BY m.seq DESC LIMIT 1) = 'customer'`

function requireGeneral(ctx: ReadCtx): void {
  ctx.access.session()
  if (!isGeneral(ctx.scope)) throw OUT_OF_CONTEXT()
}

export function businessOverview(ctx: ReadCtx, period: Period) {
  requireGeneral(ctx)
  const { app } = ctx
  const range = periodRange(ctx, period)
  const now = iso(app.clock.now())
  const today = todayKey(app)
  const soon = iso(new Date(app.clock.now().getTime() + 14 * 86_400_000))

  const quotes = ctx.access.has('requests:read')
    ? {
        available: true as const,
        receivedInPeriod: count(ctx, 'SELECT COUNT(*) AS n FROM quote_requests WHERE created_at >= ?', [range.from]),
        openNow: Object.fromEntries(OPEN_QUOTE.map((status) => [status, count(ctx, 'SELECT COUNT(*) AS n FROM quote_requests WHERE status = ? AND archived_at IS NULL', [status])])),
        awaitingReviewNow: count(ctx, "SELECT COUNT(*) AS n FROM quote_requests WHERE status IN ('new', 'under_review') AND archived_at IS NULL"),
        highOrUrgentOpenNow: count(ctx, `SELECT COUNT(*) AS n FROM quote_requests WHERE priority IN ('high', 'urgent') AND status IN ('new', 'under_review', 'waiting_customer', 'quote_preparation') AND archived_at IS NULL`),
      }
    : UNAVAILABLE

  const consultations = ctx.access.has('requests:read')
    ? {
        available: true as const,
        upcomingNext14Days: count(ctx, `SELECT COUNT(*) AS n FROM bookings WHERE status IN ${ACTIVE_BOOKING} AND start_at >= ? AND start_at < ?`, [now, soon]),
        pendingConfirmationNow: count(ctx, "SELECT COUNT(*) AS n FROM bookings WHERE status = 'pending' AND end_at >= ?", [now]),
        withOpenChangeNow: count(ctx, "SELECT COUNT(*) AS n FROM booking_changes WHERE status = 'open' AND (expires_at IS NULL OR expires_at > ?)", [now]),
        bookedInPeriod: count(ctx, 'SELECT COUNT(*) AS n FROM bookings WHERE created_at >= ?', [range.from]),
      }
    : UNAVAILABLE

  const clients = ctx.access.has('clients:read')
  const projects = clients
    ? {
        available: true as const,
        activeNow: count(ctx, `SELECT COUNT(*) AS n FROM client_projects p WHERE ${ACTIVE_PROJECT}`),
        byStatusNow: Object.fromEntries(
          rows<{ status: string; n: number }>(ctx, `SELECT p.status, COUNT(*) AS n FROM client_projects p WHERE ${ACTIVE_PROJECT} GROUP BY p.status`).map((row) => [row.status, row.n]),
        ),
        waitingForCustomerFeedbackNow: count(ctx, "SELECT COUNT(*) AS n FROM client_projects p WHERE p.status = 'waiting_customer'"),
        overdueTasksNow: count(ctx, `SELECT COUNT(*) AS n FROM project_tasks t JOIN client_projects p ON p.id = t.project_id WHERE ${ACTIVE_PROJECT} AND t.status NOT IN ('completed', 'cancelled') AND t.due_on IS NOT NULL AND t.due_on < ?`, [today]),
        blockedTasksNow: count(ctx, `SELECT COUNT(*) AS n FROM project_tasks t JOIN client_projects p ON p.id = t.project_id WHERE ${ACTIVE_PROJECT} AND t.status = 'blocked'`),
        customerActionsWaitingNow: count(ctx, `SELECT COUNT(*) AS n FROM project_customer_actions a JOIN client_projects p ON p.id = a.project_id WHERE ${ACTIVE_PROJECT} AND a.status IN ('not_started', 'changes_requested')`),
        customerAnswersAwaitingYourReviewNow: count(ctx, `SELECT COUNT(*) AS n FROM project_customer_actions a JOIN client_projects p ON p.id = a.project_id WHERE ${ACTIVE_PROJECT} AND a.status IN ('submitted', 'under_review')`),
      }
    : UNAVAILABLE
  const conversations = clients
    ? {
        available: true as const,
        openNow: count(ctx, "SELECT COUNT(*) AS n FROM conversations c WHERE c.kind = 'thread' AND c.status IN ('open', 'waiting_owner', 'waiting_customer') AND c.archived_at IS NULL"),
        waitingForYourReplyNow: count(ctx, `SELECT COUNT(*) AS n FROM conversations c WHERE c.kind = 'thread' AND c.status IN ('open', 'waiting_owner', 'waiting_customer') AND c.archived_at IS NULL AND ${UNANSWERED}`),
      }
    : UNAVAILABLE
  const customers = clients
    ? {
        available: true as const,
        activeAccountsNow: count(ctx, "SELECT COUNT(*) AS n FROM customers WHERE status = 'active'"),
        newAccountsInPeriod: count(ctx, 'SELECT COUNT(*) AS n FROM customers WHERE created_at >= ?', [range.from]),
      }
    : UNAVAILABLE

  return {
    basis: 'actual' as const,
    generatedAt: now,
    period: { name: range.name, from: range.from, to: range.to, note: 'Counts with "InPeriod" cover this period; counts with "Now" are the state at the time of generation.' },
    quotes,
    consultations,
    projects,
    conversations,
    customers,
    estimates: 'none' as const,
  }
}

interface Item {
  reference: string
  ageDays?: number
  detail?: string
}
export interface Alert {
  kind: string
  severity: 'high' | 'medium' | 'low'
  count: number
  rule: string
  items: Item[]
}

export function administrativeAlerts(ctx: ReadCtx) {
  requireGeneral(ctx)
  const { app } = ctx
  const nowDate = app.clock.now()
  const now = iso(nowDate)
  const today = todayKey(app)
  const alerts: Alert[] = []
  const unavailable: string[] = []
  const take = <T,>(rows: T[], map: (row: T) => Item): Item[] => rows.slice(0, 10).map(map)

  if (ctx.access.has('requests:read')) {
    const fresh = rows<{ reference: string; created_at: string }>(ctx, "SELECT reference, created_at FROM quote_requests WHERE status = 'new' AND archived_at IS NULL AND created_at < ? ORDER BY created_at LIMIT 50", [iso(new Date(nowDate.getTime() - 2 * 86_400_000))])
    if (fresh.length > 0) alerts.push({ kind: 'quote_requests_not_reviewed', severity: 'high', count: fresh.length, rule: 'status is "new" and the request is more than 2 days old', items: take(fresh, (row) => ({ reference: row.reference, ageDays: ageDays(nowDate, row.created_at) })) })
    const hot = rows<{ reference: string; created_at: string; priority: string }>(ctx, "SELECT reference, created_at, priority FROM quote_requests WHERE priority IN ('high', 'urgent') AND status IN ('new', 'under_review', 'quote_preparation') AND archived_at IS NULL ORDER BY created_at LIMIT 50")
    if (hot.length > 0) alerts.push({ kind: 'high_priority_requests_open', severity: 'medium', count: hot.length, rule: 'priority is "high" or "urgent" and the request is open on your side', items: take(hot, (row) => ({ reference: row.reference, ageDays: ageDays(nowDate, row.created_at), detail: row.priority })) })
    const pending = rows<{ reference: string; start_at: string }>(ctx, "SELECT reference, start_at FROM bookings WHERE status = 'pending' AND start_at >= ? AND start_at < ? ORDER BY start_at LIMIT 50", [now, iso(new Date(nowDate.getTime() + 3 * 86_400_000))])
    if (pending.length > 0) alerts.push({ kind: 'consultations_unconfirmed_soon', severity: 'high', count: pending.length, rule: 'status is "pending" and it starts within 3 days', items: take(pending, (row) => ({ reference: row.reference, detail: row.start_at })) })
    const changes = rows<{ reference: string; kind: string }>(ctx, "SELECT b.reference, c.kind FROM booking_changes c JOIN bookings b ON b.id = c.booking_id WHERE c.status = 'open' AND (c.expires_at IS NULL OR c.expires_at > ?) LIMIT 50", [now])
    if (changes.length > 0) alerts.push({ kind: 'consultation_changes_open', severity: 'medium', count: changes.length, rule: 'a cancel or reschedule proposal is open and has not run out', items: take(changes, (row) => ({ reference: row.reference, detail: row.kind })) })
  } else unavailable.push('quote_requests_and_consultations')

  if (ctx.access.has('clients:read')) {
    const overdue = rows<{ reference: string; due_on: string }>(ctx, `SELECT t.reference, t.due_on FROM project_tasks t JOIN client_projects p ON p.id = t.project_id WHERE ${ACTIVE_PROJECT} AND t.status NOT IN ('completed', 'cancelled') AND t.due_on IS NOT NULL AND t.due_on < ? ORDER BY t.due_on LIMIT 50`, [today])
    const overdueCount = count(ctx, `SELECT COUNT(*) AS n FROM project_tasks t JOIN client_projects p ON p.id = t.project_id WHERE ${ACTIVE_PROJECT} AND t.status NOT IN ('completed', 'cancelled') AND t.due_on IS NOT NULL AND t.due_on < ?`, [today])
    if (overdueCount > 0) alerts.push({ kind: 'tasks_overdue', severity: 'high', count: overdueCount, rule: 'a task of an active project is not completed or cancelled and its due date has passed', items: take(overdue, (row) => ({ reference: row.reference, detail: row.due_on })) })
    const review = rows<{ reference: string; submitted_at: string | null }>(ctx, `SELECT t.reference, a.submitted_at FROM project_customer_actions a JOIN project_tasks t ON t.id = a.task_id JOIN client_projects p ON p.id = a.project_id WHERE ${ACTIVE_PROJECT} AND a.status IN ('submitted', 'under_review') ORDER BY a.submitted_at LIMIT 50`)
    if (review.length > 0) alerts.push({ kind: 'customer_answers_awaiting_review', severity: 'medium', count: review.length, rule: 'a customer submitted an answer and it has not been reviewed', items: take(review, (row) => ({ reference: row.reference, ageDays: row.submitted_at ? ageDays(nowDate, row.submitted_at) : undefined })) })
    const unanswered = rows<{ reference: string; at: string }>(ctx, 
      `SELECT c.reference, (SELECT m.created_at FROM conversation_messages m WHERE m.conversation_id = c.id AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL ORDER BY m.seq DESC LIMIT 1) AS at
         FROM conversations c WHERE c.kind = 'thread' AND c.status IN ('open', 'waiting_owner', 'waiting_customer') AND c.archived_at IS NULL AND ${UNANSWERED} ORDER BY at LIMIT 50`,
    )
    const late = unanswered.filter((row) => ageDays(nowDate, row.at) >= 2)
    if (late.length > 0) alerts.push({ kind: 'customer_messages_unanswered', severity: 'high', count: late.length, rule: 'the last message of an open conversation is from the customer and is 2 or more days old', items: take(late, (row) => ({ reference: row.reference, ageDays: ageDays(nowDate, row.at) })) })
    const approvals = rows<{ reference: string; requested_at: string }>(ctx, `SELECT d.reference, ap.requested_at FROM deliverable_approvals ap JOIN deliverables d ON d.id = ap.deliverable_id JOIN client_projects p ON p.id = d.project_id WHERE ap.state = 'requested' AND ap.requested_at < ? AND ${ACTIVE_PROJECT} ORDER BY ap.requested_at LIMIT 50`, [iso(new Date(nowDate.getTime() - 7 * 86_400_000))])
    if (approvals.length > 0) alerts.push({ kind: 'approvals_waiting_for_customer', severity: 'low', count: approvals.length, rule: 'an approval was requested from the customer more than 7 days ago and has no answer', items: take(approvals, (row) => ({ reference: row.reference, ageDays: ageDays(nowDate, row.requested_at) })) })
    const late2 = rows<{ reference: string; expected_on: string }>(ctx, `SELECT p.reference, p.expected_on FROM client_projects p WHERE ${ACTIVE_PROJECT} AND p.expected_on IS NOT NULL AND p.expected_on < ? ORDER BY p.expected_on LIMIT 50`, [today])
    if (late2.length > 0) alerts.push({ kind: 'projects_past_expected_date', severity: 'medium', count: late2.length, rule: 'an active project\'s expected date has passed', items: take(late2, (row) => ({ reference: row.reference, detail: row.expected_on })) })
  } else unavailable.push('projects_and_conversations')

  const order = { high: 0, medium: 1, low: 2 }
  alerts.sort((a, b) => order[a.severity] - order[b.severity])
  return {
    basis: 'actual_records_and_fixed_rules' as const,
    generatedAt: now,
    alerts,
    allClear: alerts.length === 0 && unavailable.length === 0,
    notAvailableToYou: unavailable,
    note: 'These are the only things the fixed rules found. An empty list means no rule matched, not that nothing needs attention.',
  }
}

export function businessActivity(ctx: ReadCtx, days: number) {
  requireGeneral(ctx)
  const { app } = ctx
  const now = app.clock.now()
  const from = iso(new Date(now.getTime() - days * 86_400_000))
  const changes: Array<{ area: string; kind: string; count: number; references?: string[] }> = []
  const unavailable: string[] = []
  if (ctx.access.has('requests:read')) {
    const received = rows<{ reference: string }>(ctx, 'SELECT reference FROM quote_requests WHERE created_at >= ? ORDER BY created_at DESC LIMIT 200', [from])
    if (received.length > 0) changes.push({ area: 'quote_requests', kind: 'received', count: received.length, references: received.slice(0, 10).map((row) => row.reference) })
    for (const row of rows<{ event_type: string; n: number }>(ctx, "SELECT event_type, COUNT(*) AS n FROM quote_events WHERE created_at >= ? AND event_type <> 'created' GROUP BY event_type ORDER BY n DESC LIMIT 12", [from])) changes.push({ area: 'quote_requests', kind: row.event_type, count: row.n })
    const booked = count(ctx, 'SELECT COUNT(*) AS n FROM bookings WHERE created_at >= ?', [from])
    if (booked > 0) changes.push({ area: 'consultations', kind: 'booked', count: booked })
    for (const row of rows<{ event_type: string; n: number }>(ctx, "SELECT event_type, COUNT(*) AS n FROM booking_events WHERE created_at >= ? AND event_type <> 'created' GROUP BY event_type ORDER BY n DESC LIMIT 8", [from])) changes.push({ area: 'consultations', kind: row.event_type, count: row.n })
  } else unavailable.push('quote_requests_and_consultations')
  if (ctx.access.has('clients:read')) {
    for (const row of rows<{ event_type: string; n: number }>(ctx, 'SELECT event_type, COUNT(*) AS n FROM client_project_events WHERE created_at >= ? GROUP BY event_type ORDER BY n DESC LIMIT 15', [from])) changes.push({ area: 'projects', kind: row.event_type, count: row.n })
    const messages = rows<{ sender_type: string; n: number }>(ctx, "SELECT sender_type, COUNT(*) AS n FROM conversation_messages WHERE created_at >= ? AND visibility = 'customer' AND message_type = 'text' AND deleted_at IS NULL GROUP BY sender_type", [from])
    for (const row of messages) changes.push({ area: 'conversations', kind: row.sender_type === 'customer' ? 'messages_from_customers' : row.sender_type === 'admin' ? 'messages_from_you' : 'messages_from_system', count: row.n })
    const accounts = count(ctx, 'SELECT COUNT(*) AS n FROM customers WHERE created_at >= ?', [from])
    if (accounts > 0) changes.push({ area: 'customers', kind: 'new_accounts', count: accounts })
  } else unavailable.push('projects_and_conversations')
  return { basis: 'actual' as const, period: { days, from, to: iso(now) }, changes, nothingRecorded: changes.length === 0 && unavailable.length === 0, notAvailableToYou: unavailable, note: 'One line per kind of stored event; texts are not included.' }
}

export function dailyBriefing(ctx: ReadCtx) {
  requireGeneral(ctx)
  const { app } = ctx
  const nowDate = app.clock.now()
  const now = iso(nowDate)
  const dayAgo = iso(new Date(nowDate.getTime() - 86_400_000))
  const in3days = iso(new Date(nowDate.getTime() + 3 * 86_400_000))
  const today = todayKey(app)
  const sections: Record<string, unknown> = {}
  const sources: string[] = []
  const unavailable: string[] = []
  if (ctx.access.has('requests:read')) {
    sources.push('quote_requests', 'bookings')
    const fresh = rows<{ id: string; reference: string; created_at: string; priority: string }>(ctx, 'SELECT id, reference, created_at, priority FROM quote_requests WHERE created_at >= ? ORDER BY created_at DESC LIMIT 15', [dayAgo])
    sections.newQuoteRequests = { periodHours: 24, count: fresh.length, items: fresh.map((row) => ({ reference: row.reference, receivedAt: row.created_at, priority: row.priority, link: link.quote(row.reference, row.id) })) }
    const upcoming = rows<{ id: string; reference: string; start_at: string; status: string }>(ctx, `SELECT id, reference, start_at, status FROM bookings WHERE status IN ${ACTIVE_BOOKING} AND start_at >= ? AND start_at < ? ORDER BY start_at LIMIT 15`, [now, in3days])
    sections.upcomingConsultations = { periodDays: 3, count: upcoming.length, items: upcoming.map((row) => ({ reference: row.reference, startAt: row.start_at, status: row.status, link: link.consultation(row.reference, row.id) })) }
  } else unavailable.push('quote_requests_and_consultations')
  if (ctx.access.has('clients:read')) {
    sources.push('client_projects', 'project_tasks', 'client_project_events', 'project_customer_actions', 'deliverable_approvals', 'conversations')
    const events = rows<{ event_type: string; n: number }>(ctx, 'SELECT event_type, COUNT(*) AS n FROM client_project_events WHERE created_at >= ? GROUP BY event_type ORDER BY n DESC LIMIT 12', [dayAgo])
    sections.activeProjectChanges = { periodHours: 24, byKind: events.map((row) => ({ kind: row.event_type, count: row.n })) }
    sections.overdueTasks = { count: count(ctx, `SELECT COUNT(*) AS n FROM project_tasks t JOIN client_projects p ON p.id = t.project_id WHERE ${ACTIVE_PROJECT} AND t.status NOT IN ('completed', 'cancelled') AND t.due_on IS NOT NULL AND t.due_on < ?`, [today]), asOfDay: today }
    sections.pendingCustomerApprovals = {
      approvalsRequested: count(ctx, "SELECT COUNT(*) AS n FROM deliverable_approvals WHERE state = 'requested'"),
      customerActionsWaiting: count(ctx, `SELECT COUNT(*) AS n FROM project_customer_actions a JOIN client_projects p ON p.id = a.project_id WHERE ${ACTIVE_PROJECT} AND a.status IN ('not_started', 'changes_requested')`),
      customerAnswersAwaitingYourReview: count(ctx, `SELECT COUNT(*) AS n FROM project_customer_actions a JOIN client_projects p ON p.id = a.project_id WHERE ${ACTIVE_PROJECT} AND a.status IN ('submitted', 'under_review')`),
    }
    const waiting = rows<{ reference: string }>(ctx, `SELECT c.reference FROM conversations c WHERE c.kind = 'thread' AND c.status IN ('open', 'waiting_owner', 'waiting_customer') AND c.archived_at IS NULL AND ${UNANSWERED} ORDER BY c.last_message_at LIMIT 15`)
    sections.unansweredCustomerMessages = { count: count(ctx, `SELECT COUNT(*) AS n FROM conversations c WHERE c.kind = 'thread' AND c.status IN ('open', 'waiting_owner', 'waiting_customer') AND c.archived_at IS NULL AND ${UNANSWERED}`), items: waiting.map((row) => ({ reference: row.reference, link: link.conversation(row.reference) })) }
  } else unavailable.push('projects_and_conversations')
  const alerts = administrativeAlerts(ctx)
  return {
    basis: 'actual' as const,
    title: 'Daily administrative briefing',
    generatedAt: now,
    period: { description: 'the last 24 hours for new records and changes, the next 3 days for consultations, and the state now for what is overdue or pending', from: dayAgo, to: now },
    sections,
    alerts: { items: alerts.alerts.map((alert) => ({ kind: alert.kind, severity: alert.severity, count: alert.count, rule: alert.rule })), note: alerts.note },
    sources,
    notAvailableToYou: unavailable,
    limitations: ['Only stored records are summarised.', 'Quiet areas are shown as zero or empty, not filled in.', 'Private notes and message texts are not read for the briefing.'],
  }
}

