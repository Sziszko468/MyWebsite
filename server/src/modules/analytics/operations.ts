import { addDays, bucketsOf, daysBetween, type Span } from './period.ts'
import { emptySection, flow, snapshot, unavailable, type Metric, type Section, type Series } from './model.ts'
import type { Ctx } from './quotes.ts'

/**
 * Customers, projects, consultations and communication (PROMPT 32): read-only, parameterised aggregations over the modules' own tables. "Now" metrics are snapshots and are never
 * compared with a previous period (the system stores no history of what was open on a past day); flow metrics are counted by the timestamp of the event in the business zone.
 * Customer-visible messages only: a private note (`visibility = 'internal'`) is never read here.
 */

const opt = <T>(value: T | null): [T | null, T | null] => [value, value]
const spans = (ctx: Ctx): Array<Span | null> => [ctx.period, ctx.period.previous]
const ACTIVE_PROJECT = "p.status NOT IN ('completed', 'cancelled')"
const LIVE = "c.kind = 'thread' AND c.status IN ('open', 'waiting_owner', 'waiting_customer') AND c.archived_at IS NULL"
const LAST_SENDER = "(SELECT m.sender_type FROM conversation_messages m WHERE m.conversation_id = c.id AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL ORDER BY m.seq DESC LIMIT 1)"

const ACTIVE_BOOKING_LIST = "('pending', 'confirmed', 'reschedule_requested', 'rescheduled')"
/** Fixed SQL fragments (see quotes.ts): constants of this file, never input. */
const sql = { activeProject: ACTIVE_PROJECT, live: LIVE, lastSender: LAST_SENDER, activeBooking: ACTIVE_BOOKING_LIST, filter: '' }

export const one = (ctx: Ctx, sql: string, params: Array<string | number | null> = []): number => ctx.db.get<{ n: number }>(sql, params)?.n ?? 0

/** A flow metric counted twice (this period and the previous one) with the same statement. */
export function flowOf(ctx: Ctx, id: string, sql: string, extra: Array<string | number | null>, drill: string | null, kind: 'actual' | 'derived' = 'actual'): Metric {
  const [now, before] = spans(ctx)
  const count = (span: Span) => one(ctx, sql, [span.fromUtc, span.toUtc, ...extra])
  return flow(id, kind, count(now as Span), before ? count(before) : null, drill)
}

// ---- customers -----------------------------------------------------------------------------------------------------------------------------

export function customerSection(ctx: Ctx): Section {
  const section = emptySection('customers')
  const language = opt(ctx.f.language)
  const NEW = 'SELECT COUNT(*) AS n FROM customers WHERE created_at >= ? AND created_at < ? AND (? IS NULL OR language = ?)'
  section.metrics.push(
    snapshot('totalCustomers', 'actual', one(ctx, 'SELECT COUNT(*) AS n FROM customers WHERE (? IS NULL OR language = ?)', language), '/clients'),
    flowOf(ctx, 'newCustomers', NEW, language, '/clients'),
    snapshot('activeCustomers', 'actual', one(ctx, "SELECT COUNT(*) AS n FROM customers WHERE status = 'active' AND (? IS NULL OR language = ?)", language), '/clients'),
    snapshot('customersWithActiveProjects', 'actual', one(ctx, `SELECT COUNT(DISTINCT p.customer_id) AS n FROM client_projects p JOIN customers u ON u.id = p.customer_id WHERE ${sql.activeProject} AND (? IS NULL OR u.language = ?)`, language), '/clients'),
    snapshot('customersAwaitingResponse', 'actual', one(ctx, `SELECT COUNT(DISTINCT c.customer_id) AS n FROM conversations c JOIN customers u ON u.id = c.customer_id WHERE ${sql.live} AND ${sql.lastSender} = 'customer' AND (? IS NULL OR u.language = ?)`, language), '/communications'),
    unavailable('customersByCountry', 'country_not_stored'),
    unavailable('customerAcquisitionSource', 'customer_source_not_stored'),
  )
  const returning = `SELECT COUNT(*) AS n FROM customers u WHERE (? IS NULL OR u.language = ?) AND (
      (SELECT COUNT(*) FROM client_projects p WHERE p.customer_id = u.id) >= 2
      OR (SELECT COUNT(DISTINCT q.quote_request_id) FROM quotes q JOIN customer_links l ON l.quote_request_id = q.quote_request_id WHERE l.customer_id = u.id AND q.accepted_at IS NOT NULL) >= 2)`
  const segments: Array<[string, number, string | null]> = [
    ['segmentNew', flowOf(ctx, 'x', NEW, language, null).value ?? 0, '/clients'],
    ['segmentActiveProject', one(ctx, `SELECT COUNT(DISTINCT p.customer_id) AS n FROM client_projects p JOIN customers u ON u.id = p.customer_id WHERE ${sql.activeProject} AND (? IS NULL OR u.language = ?)`, language), '/clients'],
    ['segmentCompletedProject', one(ctx, "SELECT COUNT(DISTINCT p.customer_id) AS n FROM client_projects p JOIN customers u ON u.id = p.customer_id WHERE p.status = 'completed' AND (? IS NULL OR u.language = ?)", language), '/clients'],
    ['segmentReturning', one(ctx, returning, language), '/clients'],
    ['segmentOpenInquiry', one(ctx, "SELECT COUNT(DISTINCT l.customer_id) AS n FROM customer_links l JOIN quote_requests r ON r.id = l.quote_request_id JOIN customers u ON u.id = l.customer_id WHERE r.status IN ('new', 'under_review', 'waiting_customer', 'quote_preparation', 'quote_sent') AND (? IS NULL OR u.language = ?)", language), '/quotes'],
    ['segmentAwaitingAction', one(ctx, `SELECT COUNT(DISTINCT c.customer_id) AS n FROM conversations c JOIN customers u ON u.id = c.customer_id WHERE ${sql.live} AND ${sql.lastSender} = 'customer' AND (? IS NULL OR u.language = ?)`, language), '/communications'],
  ]
  section.distributions.push({ id: 'customerSegments', total: segments.reduce((sum, item) => sum + item[1], 0), items: segments.map(([key, value, drill]) => ({ key, value, drill })) })
  const by = (id: string, sql: string, params: Array<string | null> = []) => {
    const rows = ctx.db.all<{ key: string; n: number }>(sql, params)
    section.distributions.push({ id, total: rows.reduce((sum, row) => sum + row.n, 0), items: rows.map((row) => ({ key: row.key, value: row.n })) })
  }
  by('customersByLanguage', 'SELECT language AS key, COUNT(*) AS n FROM customers WHERE (? IS NULL OR language = ?) GROUP BY language ORDER BY n DESC', language)
  by('customersByStatus', 'SELECT status AS key, COUNT(*) AS n FROM customers WHERE (? IS NULL OR language = ?) GROUP BY status ORDER BY n DESC', language)
  by('customersByOrigin', 'SELECT origin AS key, COUNT(*) AS n FROM customers WHERE (? IS NULL OR language = ?) GROUP BY origin ORDER BY n DESC', language)
  // The lifecycle, from real records: how many customers have reached each step at least once.
  const step = (sql: string) => one(ctx, sql, language)
  const lifecycle = [
    ['lifecycleAccount', step('SELECT COUNT(*) AS n FROM customers WHERE (? IS NULL OR language = ?)')],
    ['lifecycleQuoteRequest', step('SELECT COUNT(DISTINCT l.customer_id) AS n FROM customer_links l JOIN customers u ON u.id = l.customer_id WHERE l.quote_request_id IS NOT NULL AND (? IS NULL OR u.language = ?)')],
    ['lifecycleAcceptedQuotation', step('SELECT COUNT(DISTINCT l.customer_id) AS n FROM customer_links l JOIN quotes q ON q.quote_request_id = l.quote_request_id JOIN customers u ON u.id = l.customer_id WHERE q.accepted_at IS NOT NULL AND (? IS NULL OR u.language = ?)')],
    ['lifecycleProjectStarted', step('SELECT COUNT(DISTINCT p.customer_id) AS n FROM client_projects p JOIN customers u ON u.id = p.customer_id WHERE (? IS NULL OR u.language = ?)')],
    ['lifecycleProjectCompleted', step("SELECT COUNT(DISTINCT p.customer_id) AS n FROM client_projects p JOIN customers u ON u.id = p.customer_id WHERE p.status = 'completed' AND (? IS NULL OR u.language = ?)")],
    ['lifecycleReturning', segments[3][1]],
  ] as const
  section.distributions.push({ id: 'customerLifecycle', total: lifecycle[0][1], items: lifecycle.map(([key, value]) => ({ key, value })) })
  section.series.push(accountSeries(ctx))
  section.limitations.push('country_not_stored', 'customer_source_not_stored', 'returning_rule', 'accounts_not_first_inquiries', 'no_inference_about_people')
  return section
}

function accountSeries(ctx: Ctx): Series {
  const { granularity, buckets } = bucketsOf(ctx.period, ctx.period.zone)
  const json = JSON.stringify(buckets.map((bucket) => ({ d: bucket.key, s: bucket.fromUtc, e: bucket.toUtc })))
  const rows = ctx.db.all<{ day: string; n: number }>(
    // The period's rows are read once, then given their bucket in one sorted pass (SERIES_NOTE in quotes.ts).
    `WITH b(day, s, e) AS (SELECT json_extract(value, '$.d'), json_extract(value, '$.s'), json_extract(value, '$.e') FROM json_each(?)),
          p AS MATERIALIZED (SELECT u.created_at AS at FROM customers u WHERE u.created_at >= ? AND u.created_at < ? AND (? IS NULL OR u.language = ?)),
          ev AS (SELECT s AS at, 0 AS ord, day AS d FROM b UNION ALL SELECT at, 1, NULL FROM p),
          lab AS (SELECT ord, MAX(d) OVER (ORDER BY at, ord) AS day FROM ev)
     SELECT day, COUNT(*) AS n FROM lab WHERE ord = 1 AND day IS NOT NULL GROUP BY day`,
    [json, ctx.period.fromUtc, ctx.period.toUtc, ...opt(ctx.f.language)],
  )
  return { id: 'newCustomersSeries', granularity, unit: 'count', points: buckets.map((bucket) => ({ key: bucket.key, from: bucket.from, to: bucket.to, value: rows.find((row) => row.day === bucket.key)?.n ?? 0 })) }
}

// ---- projects -----------------------------------------------------------------------------------------------------------------------------

export function projectMetrics(ctx: Ctx) {
  const today = ctx.period.today
  const status = opt(ctx.f.projectStatus)
  return {
    active: snapshot('activeProjects', 'actual', one(ctx, `SELECT COUNT(*) AS n FROM client_projects p WHERE ${sql.activeProject}`), '/clients'),
    completed: flowOf(ctx, 'completedProjects', 'SELECT COUNT(*) AS n FROM client_projects p WHERE p.completed_at >= ? AND p.completed_at < ?', [], '/clients'),
    overdueMilestones: snapshot('overdueMilestones', 'derived', one(ctx, `SELECT COUNT(*) AS n FROM client_milestones m JOIN client_projects p ON p.id = m.project_id WHERE ${sql.activeProject} AND m.completed_at IS NULL AND m.status NOT IN ('completed', 'cancelled') AND m.due_on IS NOT NULL AND m.due_on < ?`, [today]), '/clients'),
    delayedProjects: snapshot('delayedProjects', 'derived', one(ctx, `SELECT COUNT(*) AS n FROM client_projects p WHERE ${sql.activeProject} AND p.expected_on IS NOT NULL AND p.expected_on < ?`, [today]), '/clients'),
    onHold: snapshot('projectsOnHold', 'actual', one(ctx, "SELECT COUNT(*) AS n FROM client_projects p WHERE p.status = 'on_hold'"), '/clients'),
    cancelled: flowOf(ctx, 'cancelledProjects', "SELECT COUNT(*) AS n FROM client_projects p WHERE p.status = 'cancelled' AND p.updated_at >= ? AND p.updated_at < ?", [], '/clients', 'derived'),
    status,
  }
}

export function projectSection(ctx: Ctx): Section {
  const section = emptySection('projects')
  const m = projectMetrics(ctx)
  const today = ctx.period.today
  section.metrics.push(m.active, m.completed, m.onHold, m.delayedProjects, m.overdueMilestones)
  const tasks = (status: string) => one(ctx, 'SELECT COUNT(*) AS n FROM project_tasks t JOIN client_projects p ON p.id = t.project_id WHERE ' + ACTIVE_PROJECT + ' AND t.status = ?', [status])
  section.metrics.push(
    flowOf(ctx, 'tasksCompleted', 'SELECT COUNT(*) AS n FROM project_tasks t WHERE t.completed_at >= ? AND t.completed_at < ?', [], null),
    snapshot('tasksInProgress', 'actual', tasks('in_progress')),
    snapshot('blockedTasks', 'actual', tasks('blocked')),
    snapshot('tasksAwaitingCustomer', 'actual', one(ctx, `SELECT COUNT(*) AS n FROM project_customer_actions a JOIN client_projects p ON p.id = a.project_id WHERE ${sql.activeProject} AND a.status IN ('not_started', 'changes_requested')`)),
  )
  const dur = ctx.db.get<{ n: number; days: number | null }>(
    "SELECT COUNT(*) AS n, AVG(julianday(substr(p.completed_at, 1, 10)) - julianday(p.started_on)) AS days FROM client_projects p WHERE p.completed_at >= ? AND p.completed_at < ? AND p.started_on IS NOT NULL AND substr(p.completed_at, 1, 10) >= p.started_on",
    [ctx.period.fromUtc, ctx.period.toUtc],
  )
  section.metrics.push(dur && dur.n > 0 && dur.days !== null ? { ...snapshot('averageProjectDurationDays', 'derived', Math.round(dur.days * 10) / 10), comparison: 'none' } : unavailable('averageProjectDurationDays', 'no_completed_projects_with_start_date'))
  const mile = ctx.db.get<{ total: number; done: number }>(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN m.completed_at IS NOT NULL OR m.status = 'completed' THEN 1 ELSE 0 END) AS done FROM client_milestones m WHERE m.due_on >= ? AND m.due_on <= ? AND m.status <> 'cancelled'",
    [ctx.period.from, ctx.period.to],
  )
  section.metrics.push(mile && mile.total > 0 ? { ...snapshot('milestoneCompletionRate', 'derived', Math.round(((mile.done ?? 0) / mile.total) * 1000) / 10), comparison: 'none' } : unavailable('milestoneCompletionRate', 'no_milestones_due_in_period'))
  const dist = (id: string, sql: string, params: Array<string | null> = []) => {
    const rows = ctx.db.all<{ key: string; n: number }>(sql, params)
    section.distributions.push({ id, total: rows.reduce((sum, row) => sum + row.n, 0), items: rows.map((row) => ({ key: row.key, value: row.n })) })
  }
  dist('projectsByStatus', 'SELECT p.status AS key, COUNT(*) AS n FROM client_projects p WHERE (? IS NULL OR p.status = ?) GROUP BY p.status ORDER BY n DESC', opt(ctx.f.projectStatus))
  dist('tasksByStatus', `SELECT t.status AS key, COUNT(*) AS n FROM project_tasks t JOIN client_projects p ON p.id = t.project_id WHERE ${sql.activeProject} AND (? IS NULL OR p.status = ?) GROUP BY t.status ORDER BY n DESC`, opt(ctx.f.projectStatus))
  dist('milestonesByStatus', `SELECT m.status AS key, COUNT(*) AS n FROM client_milestones m JOIN client_projects p ON p.id = m.project_id WHERE (? IS NULL OR p.status = ?) GROUP BY m.status ORDER BY n DESC`, opt(ctx.f.projectStatus))
  // Completed projects over time (the completion timestamp, through the zone's midnights).
  const { granularity, buckets } = bucketsOf(ctx.period, ctx.period.zone)
  const json = JSON.stringify(buckets.map((bucket) => ({ d: bucket.key, s: bucket.fromUtc, e: bucket.toUtc })))
  const done = ctx.db.all<{ day: string; n: number }>(
    `WITH b(day, s, e) AS (SELECT json_extract(value, '$.d'), json_extract(value, '$.s'), json_extract(value, '$.e') FROM json_each(?)),
          p AS MATERIALIZED (SELECT x.completed_at AS at FROM client_projects x WHERE x.completed_at >= ? AND x.completed_at < ?),
          ev AS (SELECT s AS at, 0 AS ord, day AS d FROM b UNION ALL SELECT at, 1, NULL FROM p),
          lab AS (SELECT ord, MAX(d) OVER (ORDER BY at, ord) AS day FROM ev)
     SELECT day, COUNT(*) AS n FROM lab WHERE ord = 1 AND day IS NOT NULL GROUP BY day`,
    [json, ctx.period.fromUtc, ctx.period.toUtc],
  )
  section.series.push({ id: 'completedProjectsSeries', granularity, unit: 'count', points: buckets.map((bucket) => ({ key: bucket.key, from: bucket.from, to: bucket.to, value: done.find((row) => row.day === bucket.key)?.n ?? 0 })) })
  // Workload (open tasks per active project) and the deadlines of the next two weeks: references and dates only.
  section.tables.push({
    id: 'projectWorkload',
    columns: ['reference', 'status', 'openTasks', 'overdueTasks', 'expectedOn'],
    rows: ctx.db
      .all<{ reference: string; status: string; open: number; overdue: number; expected_on: string | null }>(
        `SELECT p.reference AS reference, p.status AS status,
                SUM(CASE WHEN t.status NOT IN ('completed', 'cancelled') THEN 1 ELSE 0 END) AS open,
                SUM(CASE WHEN t.status NOT IN ('completed', 'cancelled') AND t.due_on IS NOT NULL AND t.due_on < ? THEN 1 ELSE 0 END) AS overdue,
                p.expected_on AS expected_on
           FROM client_projects p LEFT JOIN project_tasks t ON t.project_id = p.id WHERE ${sql.activeProject} AND (? IS NULL OR p.status = ?)
          GROUP BY p.id ORDER BY open DESC, p.reference LIMIT 10`,
        [today, ...opt(ctx.f.projectStatus)],
      )
      .map((row) => [row.reference, row.status, row.open ?? 0, row.overdue ?? 0, row.expected_on]),
  })
  const horizon = addDays(today, 14)
  section.tables.push({
    id: 'upcomingDeadlines',
    columns: ['kind', 'reference', 'dueOn'],
    rows: ctx.db
      .all<{ kind: string; reference: string; due_on: string }>(
        `SELECT 'milestone' AS kind, p.reference AS reference, m.due_on AS due_on FROM client_milestones m JOIN client_projects p ON p.id = m.project_id
          WHERE ${sql.activeProject} AND m.completed_at IS NULL AND m.status NOT IN ('completed', 'cancelled') AND m.due_on >= ? AND m.due_on <= ?
         UNION ALL
         SELECT 'task', t.reference, t.due_on FROM project_tasks t JOIN client_projects p ON p.id = t.project_id
          WHERE ${sql.activeProject} AND t.status NOT IN ('completed', 'cancelled') AND t.due_on >= ? AND t.due_on <= ?
         ORDER BY due_on, reference LIMIT 25`,
        [today, horizon, today, horizon],
      )
      .map((row) => [row.kind, row.reference, row.due_on]),
  })
  section.limitations.push('project_history_is_events_only', 'duration_needs_start_date', 'cancellation_time_is_last_update')
  void daysBetween
  return section
}

// ---- consultations ------------------------------------------------------------------------------------------------------------------------

export function consultationSection(ctx: Ctx): Section {
  const section = emptySection('consultations')
  const lang = opt(ctx.f.language)
  const filter = 'AND (? IS NULL OR b.language = ?) AND (? IS NULL OR b.status = ?)'
  const sql = { activeBooking: ACTIVE_BOOKING_LIST, filter }
  const params = [...lang, ...opt(ctx.f.consultationStatus)]
  const requested = flowOf(ctx, 'consultationRequests', `SELECT COUNT(*) AS n FROM bookings b WHERE b.created_at >= ? AND b.created_at < ? ${sql.filter}`, params, '/bookings')
  section.metrics.push(
    requested,
    flowOf(ctx, 'confirmedConsultations', `SELECT COUNT(*) AS n FROM bookings b WHERE b.confirmed_at >= ? AND b.confirmed_at < ? ${sql.filter}`, params, '/bookings?status=confirmed'),
    flowOf(ctx, 'cancelledConsultations', `SELECT COUNT(*) AS n FROM bookings b WHERE b.cancelled_at >= ? AND b.cancelled_at < ? ${sql.filter}`, params, '/bookings?status=cancelled'),
    flowOf(ctx, 'completedConsultations', `SELECT COUNT(*) AS n FROM bookings b WHERE b.completed_at >= ? AND b.completed_at < ? ${sql.filter}`, params, '/bookings?status=completed'),
    flowOf(ctx, 'noShows', `SELECT COUNT(DISTINCT e.booking_id) AS n FROM booking_events e JOIN bookings b ON b.id = e.booking_id WHERE e.event_type = 'no_show' AND e.created_at >= ? AND e.created_at < ? ${sql.filter}`, params, '/bookings?status=no_show'),
    snapshot('upcomingConsultations', 'actual', one(ctx, `SELECT COUNT(*) AS n FROM bookings b WHERE b.status IN ${sql.activeBooking} AND b.start_at >= ? ${sql.filter}`, [ctx.now.toISOString(), ...params]), '/bookings'),
  )
  // Of the requests made in the period, how many were ever confirmed (a cohort rate; a young cohort has not had time to be answered).
  const cohort = ctx.db.get<{ total: number; confirmed: number }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN b.confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS confirmed FROM bookings b WHERE b.created_at >= ? AND b.created_at < ? ${sql.filter}`,
    [ctx.period.fromUtc, ctx.period.toUtc, ...params],
  )
  section.metrics.push(cohort && cohort.total > 0 ? { ...snapshot('bookingConversionRate', 'derived', Math.round(((cohort.confirmed ?? 0) / cohort.total) * 1000) / 10), comparison: 'none' } : unavailable('bookingConversionRate', 'no_requests_in_period'))
  const rows = ctx.db.all<{ key: string; n: number }>(`SELECT b.status AS key, COUNT(*) AS n FROM bookings b WHERE b.created_at >= ? AND b.created_at < ? ${sql.filter} GROUP BY b.status ORDER BY n DESC`, [ctx.period.fromUtc, ctx.period.toUtc, ...params])
  section.distributions.push({ id: 'consultationsByStatus', total: rows.reduce((sum, row) => sum + row.n, 0), items: rows.map((row) => ({ key: row.key, value: row.n, drill: `/bookings?status=${row.key}` })) })
  const { granularity, buckets } = bucketsOf(ctx.period, ctx.period.zone)
  const json = JSON.stringify(buckets.map((bucket) => ({ d: bucket.key, s: bucket.fromUtc, e: bucket.toUtc })))
  const made = ctx.db.all<{ day: string; n: number }>(
    `WITH w(day, s, e) AS (SELECT json_extract(value, '$.d'), json_extract(value, '$.s'), json_extract(value, '$.e') FROM json_each(?)),
          p AS MATERIALIZED (SELECT b.created_at AS at FROM bookings b WHERE b.created_at >= ? AND b.created_at < ? AND (? IS NULL OR b.language = ?) AND (? IS NULL OR b.status = ?)),
          ev AS (SELECT s AS at, 0 AS ord, day AS d FROM w UNION ALL SELECT at, 1, NULL FROM p),
          lab AS (SELECT ord, MAX(d) OVER (ORDER BY at, ord) AS day FROM ev)
     SELECT day, COUNT(*) AS n FROM lab WHERE ord = 1 AND day IS NOT NULL GROUP BY day`,
    [json, ctx.period.fromUtc, ctx.period.toUtc, ...lang, ...opt(ctx.f.consultationStatus)],
  )
  section.series.push({ id: 'consultationRequestsSeries', granularity, unit: 'count', points: buckets.map((bucket) => ({ key: bucket.key, from: bucket.from, to: bucket.to, value: made.find((row) => row.day === bucket.key)?.n ?? 0 })) })
  section.limitations.push('completed_is_a_status_an_administrator_set', 'past_time_is_not_attendance', 'conversion_is_cohort_based')
  return section
}

// ---- communication -----------------------------------------------------------------------------------------------------------------------

export function communicationMetrics(ctx: Ctx) {
  return {
    waitingForAdministrator: snapshot('customerWaitingForAdministrator', 'actual', one(ctx, `SELECT COUNT(*) AS n FROM conversations c WHERE ${sql.live} AND ${sql.lastSender} = 'customer'`), '/communications?filter=waiting_owner'),
    administratorWaiting: snapshot('administratorWaitingForCustomer', 'actual', one(ctx, `SELECT COUNT(*) AS n FROM conversations c WHERE ${sql.live} AND ${sql.lastSender} = 'admin'`), '/communications?filter=waiting_customer'),
  }
}

export function communicationSection(ctx: Ctx): Section {
  const section = emptySection('communication')
  const lang = opt(ctx.f.language)
  const m = communicationMetrics(ctx)
  section.metrics.push(
    snapshot('openConversations', 'actual', one(ctx, `SELECT COUNT(*) AS n FROM conversations c JOIN customers u ON u.id = c.customer_id WHERE ${sql.live} AND (? IS NULL OR u.language = ?)`, lang), '/communications?filter=open'),
    m.waitingForAdministrator,
    m.administratorWaiting,
    flowOf(ctx, 'conversationsResolved', "SELECT COUNT(*) AS n FROM conversations c JOIN customers u ON u.id = c.customer_id WHERE c.kind = 'thread' AND c.resolved_at >= ? AND c.resolved_at < ? AND (? IS NULL OR u.language = ?)", lang, '/communications?filter=resolved'),
    flowOf(ctx, 'messagesFromCustomers', "SELECT COUNT(*) AS n FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers u ON u.id = c.customer_id WHERE c.kind = 'thread' AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL AND m.sender_type = 'customer' AND m.created_at >= ? AND m.created_at < ? AND (? IS NULL OR u.language = ?)", lang, null),
    flowOf(ctx, 'messagesFromAdministrators', "SELECT COUNT(*) AS n FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers u ON u.id = c.customer_id WHERE c.kind = 'thread' AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL AND m.sender_type = 'admin' AND m.created_at >= ? AND m.created_at < ? AND (? IS NULL OR u.language = ?)", lang, null),
  )
  // The time from the first message of a run of customer messages to the first administrator reply that follows, from the messages themselves (replies in the period; the
  // customer message may be up to 60 days older than the period). Customer-visible text only.
  const widen = new Date(Date.parse(ctx.period.fromUtc) - 60 * 86_400_000).toISOString()
  const response = ctx.db.get<{ n: number; hours: number | null }>(
    `WITH msg AS (
       SELECT m.conversation_id AS cid, m.seq AS seq, m.sender_type AS who, m.created_at AS at
         FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers u ON u.id = c.customer_id
        WHERE c.kind = 'thread' AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL AND m.sender_type IN ('customer', 'admin')
          AND m.created_at >= ? AND m.created_at < ? AND (? IS NULL OR u.language = ?)),
     lagged AS (SELECT cid, seq, who, at, LAG(who) OVER (PARTITION BY cid ORDER BY seq) AS prev FROM msg),
     runs AS (SELECT cid, seq, who, at, SUM(CASE WHEN prev IS NULL OR prev <> who THEN 1 ELSE 0 END) OVER (PARTITION BY cid ORDER BY seq) AS run FROM lagged),
     starts AS (SELECT cid, run, who, MIN(at) AS at FROM runs GROUP BY cid, run)
     SELECT COUNT(*) AS n, AVG((julianday(a.at) - julianday(c.at)) * 24.0) AS hours
       FROM starts a JOIN starts c ON c.cid = a.cid AND c.run = a.run - 1 WHERE a.who = 'admin' AND c.who = 'customer' AND a.at >= ? AND a.at < ?`,
    [widen, ctx.period.toUtc, ...lang, ctx.period.fromUtc, ctx.period.toUtc],
  )
  section.metrics.push(response && response.n > 0 && response.hours !== null ? { ...snapshot('averageResponseHours', 'derived', Math.round(response.hours * 10) / 10), comparison: 'none' } : unavailable('averageResponseHours', 'no_replies_in_period'))
  section.metrics.push({ ...snapshot('responsesMeasured', 'actual', response?.n ?? 0), comparison: 'none' })
  const { granularity, buckets } = bucketsOf(ctx.period, ctx.period.zone)
  const json = JSON.stringify(buckets.map((bucket) => ({ d: bucket.key, s: bucket.fromUtc, e: bucket.toUtc })))
  const volume = ctx.db.all<{ day: string; who: string; n: number }>(
    `WITH w(day, s, e) AS (SELECT json_extract(value, '$.d'), json_extract(value, '$.s'), json_extract(value, '$.e') FROM json_each(?)),
          p AS MATERIALIZED (SELECT m.sender_type AS who, m.created_at AS at
                               FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers u ON u.id = c.customer_id
                              WHERE c.kind = 'thread' AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL AND m.sender_type IN ('customer', 'admin')
                                AND m.created_at >= ? AND m.created_at < ? AND (? IS NULL OR u.language = ?)),
          ev AS (SELECT s AS at, 0 AS ord, day AS d, NULL AS who FROM w UNION ALL SELECT at, 1, NULL, who FROM p),
          lab AS (SELECT ord, who, MAX(d) OVER (ORDER BY at, ord) AS day FROM ev)
     SELECT day, who, COUNT(*) AS n FROM lab WHERE ord = 1 AND day IS NOT NULL GROUP BY day, who`,
    [json, ctx.period.fromUtc, ctx.period.toUtc, ...lang],
  )
  for (const [id, who] of [['messagesFromCustomersSeries', 'customer'], ['messagesFromAdministratorsSeries', 'admin']] as const) {
    section.series.push({ id, granularity, unit: 'count', points: buckets.map((bucket) => ({ key: bucket.key, from: bucket.from, to: bucket.to, value: volume.find((row) => row.day === bucket.key && row.who === who)?.n ?? 0 })) })
  }
  const byLanguage = ctx.db.all<{ key: string; n: number }>(
    "SELECT u.language AS key, COUNT(*) AS n FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id JOIN customers u ON u.id = c.customer_id WHERE c.kind = 'thread' AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL AND m.created_at >= ? AND m.created_at < ? AND (? IS NULL OR u.language = ?) GROUP BY u.language ORDER BY n DESC",
    [ctx.period.fromUtc, ctx.period.toUtc, ...lang],
  )
  section.distributions.push({ id: 'messagesByLanguage', total: byLanguage.reduce((sum, row) => sum + row.n, 0), items: byLanguage.map((row) => ({ key: row.key, value: row.n })) })
  const status = ctx.db.all<{ key: string; n: number }>("SELECT c.status AS key, COUNT(*) AS n FROM conversations c JOIN customers u ON u.id = c.customer_id WHERE c.kind = 'thread' AND (? IS NULL OR u.language = ?) GROUP BY c.status ORDER BY n DESC", lang)
  section.distributions.push({ id: 'conversationsByStatus', total: status.reduce((sum, row) => sum + row.n, 0), items: status.map((row) => ({ key: row.key, value: row.n })) })
  section.limitations.push('customer_visible_messages_only', 'private_notes_never_read', 'response_time_from_messages', 'language_is_the_customers')
  return section
}
