import type { AppContext } from '../../context.ts'
import type { Database } from '../../db/database.ts'
import type { Currency } from '../quotes/money.ts'
import { bucketsOf, type Period, type Span } from './period.ts'
import { emptySection, flow, moneyUnavailable, snapshot, unavailable, type Distribution, type Filters, type MoneyLine, type MoneyMetric, type Section, type Series } from './model.ts'

/**
 * Quote requests, quotations and the conversion funnel (PROMPT 32). Every statement is a read-only, parameterised aggregation over `quote_requests`, `quotes` and `quote_events`.
 * Money is whole minor units, summed as integers per currency (EUR and HUF are never added); a quotation whose price is described in words (`pricing_mode = 'custom'`) is COUNTED
 * but carries no amount. Nothing here is revenue: an accepted quotation is accepted contract value, and the system stores no payment.
 */

export interface Ctx {
  app: AppContext
  db: Database
  period: Period
  f: Filters
  now: Date
}

const opt = <T>(value: T | null): [T | null, T | null] => [value, value]

/** A request restricted to those that asked for a service and/or a package (both optional). */
const ITEMS = `(? IS NULL AND ? IS NULL OR EXISTS (SELECT 1 FROM quote_request_items i LEFT JOIN services s ON s.id = i.service_id LEFT JOIN packages p ON p.id = i.package_id
    WHERE i.quote_request_id = r.id AND (? IS NULL OR s.slug = ?) AND (? IS NULL OR p.code = ?)))`
/** The fixed SQL fragments the statements below are built from (named `sql` so the project's static SQL rule sees what they are: constants of this file, never input). */
const sql = { items: ITEMS }
const itemParams = (f: Filters): Array<string | null> => [f.service, f.packageCode, ...opt(f.service), ...opt(f.packageCode)]

const STAMPS = { sent: 'q.sent_at', accepted: 'q.accepted_at', declined: 'q.declined_at' } as const
type Stamp = keyof typeof STAMPS

interface MoneyRow {
  currency: Currency | null
  n: number
  priced: number
  minor: number
}

/** Quotations whose `sent_at` / `accepted_at` / `declined_at` falls in the span, by currency. Superseded and withdrawn versions are not "quoted": the customer's standing offer is. */
function moneyIn(ctx: Ctx, stamp: Stamp, span: Span): MoneyRow[] {
  const sql = { items: ITEMS, stamp: STAMPS[stamp], standing: stamp === 'sent' ? "q.status IN ('sent', 'accepted', 'declined')" : '1 = 1' }
  return ctx.db.all<MoneyRow>(
    `SELECT q.currency AS currency, COUNT(*) AS n,
            SUM(CASE WHEN q.pricing_mode <> 'custom' AND q.total_minor IS NOT NULL THEN 1 ELSE 0 END) AS priced,
            COALESCE(SUM(CASE WHEN q.pricing_mode <> 'custom' AND q.total_minor IS NOT NULL THEN q.total_minor ELSE 0 END), 0) AS minor
       FROM quotes q JOIN quote_requests r ON r.id = q.quote_request_id
      WHERE ${sql.stamp} >= ? AND ${sql.stamp} < ? AND ${sql.standing}
        AND (? IS NULL OR q.currency = ?) AND (? IS NULL OR r.language = ?) AND ${sql.items}
      GROUP BY q.currency`,
    [span.fromUtc, span.toUtc, ...opt(ctx.f.currency), ...opt(ctx.f.language), ...itemParams(ctx.f)],
  )
}

/** The quotations that are out with the customer now (a state, not a flow). */
function openPipeline(ctx: Ctx): MoneyRow[] {
  return ctx.db.all<MoneyRow>(
    `SELECT q.currency AS currency, COUNT(*) AS n,
            SUM(CASE WHEN q.pricing_mode <> 'custom' AND q.total_minor IS NOT NULL THEN 1 ELSE 0 END) AS priced,
            COALESCE(SUM(CASE WHEN q.pricing_mode <> 'custom' AND q.total_minor IS NOT NULL THEN q.total_minor ELSE 0 END), 0) AS minor
       FROM quotes q JOIN quote_requests r ON r.id = q.quote_request_id
      WHERE q.status = 'sent' AND (? IS NULL OR q.currency = ?) AND (? IS NULL OR r.language = ?) AND ${sql.items}
      GROUP BY q.currency`,
    [...opt(ctx.f.currency), ...opt(ctx.f.language), ...itemParams(ctx.f)],
  )
}

const CURRENCY_ORDER: Currency[] = ['EUR', 'HUF']

/** Current and previous rows as one money metric: a line per currency, in a fixed order; quotations without a currency (custom pricing) are only counted. */
function moneyMetric(id: string, kind: 'actual' | 'derived', current: MoneyRow[], previous: MoneyRow[] | null, drill: string | null, comparison: 'period' | 'snapshot'): MoneyMetric {
  const byCurrency = (rows: MoneyRow[]) => new Map(rows.filter((row) => row.currency !== null).map((row) => [row.currency as Currency, row]))
  const now = byCurrency(current)
  const before = previous === null ? null : byCurrency(previous)
  const currencies = CURRENCY_ORDER.filter((currency) => now.has(currency) || before?.has(currency))
  const lines: MoneyLine[] = currencies.map((currency) => ({
    currency,
    minor: now.get(currency)?.minor ?? 0,
    previousMinor: before === null ? null : (before.get(currency)?.minor ?? 0),
    priced: now.get(currency)?.priced ?? 0,
    count: now.get(currency)?.n ?? 0,
  }))
  const withoutAmount = current.reduce((sum, row) => sum + (row.n - row.priced), 0)
  return { id, kind, state: 'available', comparison, lines, withoutAmount, reason: null, drill }
}

/** The mean of quotations that carry an amount, per currency, in whole minor units (the integer division is the only arithmetic: a derived figure). */
function averageMetric(id: string, current: MoneyRow[], previous: MoneyRow[]): MoneyMetric {
  const average = (rows: MoneyRow[], currency: Currency): number | null => {
    const row = rows.find((candidate) => candidate.currency === currency)
    return row && row.priced > 0 ? Math.round(row.minor / row.priced) : null
  }
  const lines: MoneyLine[] = CURRENCY_ORDER.filter((currency) => average(current, currency) !== null).map((currency) => ({ currency, minor: average(current, currency) as number, previousMinor: average(previous, currency), priced: current.find((row) => row.currency === currency)?.priced ?? 0, count: current.find((row) => row.currency === currency)?.n ?? 0 }))
  return { id, kind: 'derived', state: 'available', comparison: 'period', lines, withoutAmount: 0, reason: null, drill: null }
}

const countIn = (ctx: Ctx, sql: string, span: Span, extra: Array<string | number | null> = []): number =>
  ctx.db.get<{ n: number }>(sql, [span.fromUtc, span.toUtc, ...extra])?.n ?? 0

const REQUESTS_SQL = `SELECT COUNT(*) AS n FROM quote_requests r WHERE r.created_at >= ? AND r.created_at < ? AND (? IS NULL OR r.language = ?) AND ${sql.items}`
const requestsIn = (ctx: Ctx, span: Span): number => countIn(ctx, REQUESTS_SQL, span, [...opt(ctx.f.language), ...itemParams(ctx.f)])
const contactsIn = (ctx: Ctx, span: Span): number => countIn(ctx, 'SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ? AND created_at < ? AND (? IS NULL OR language = ?)', span, opt(ctx.f.language))

/** The quote-side KPIs of the executive overview. */
export function quoteMetrics(ctx: Ctx) {
  const { period } = ctx
  const before = period.previous
  const acceptedNow = moneyIn(ctx, 'accepted', period)
  const acceptedBefore = before ? moneyIn(ctx, 'accepted', before) : null
  const sentNow = moneyIn(ctx, 'sent', period)
  const sentBefore = before ? moneyIn(ctx, 'sent', before) : null
  const pipeline = openPipeline(ctx)
  const total = (rows: MoneyRow[]) => rows.reduce((sum, row) => sum + row.n, 0)
  return {
    newRequests: flow('newQuoteRequests', 'actual', requestsIn(ctx, period), before ? requestsIn(ctx, before) : null, '/quotes'),
    newContacts: flow('newContactMessages', 'actual', contactsIn(ctx, period), before ? contactsIn(ctx, before) : null, '/inquiries'),
    openQuotations: snapshot('openQuotations', 'actual', total(pipeline), '/quotes?status=quote_sent'),
    acceptedQuotations: flow('acceptedQuotations', 'actual', total(acceptedNow), acceptedBefore ? total(acceptedBefore) : null, '/quotes?status=accepted'),
    acceptedValue: moneyMetric('acceptedQuotationValue', 'actual', acceptedNow, acceptedBefore, '/quotes?status=accepted', 'period'),
    pipelineValue: moneyMetric('potentialPipelineValue', 'actual', pipeline, null, '/quotes?status=quote_sent', 'snapshot'),
    averageValue: averageMetric('averageQuotationValue', sentNow, sentBefore ?? []),
    quotedValue: moneyMetric('quotedValue', 'actual', sentNow, sentBefore, '/quotes', 'period'),
    declinedValue: moneyMetric('declinedQuotationValue', 'actual', moneyIn(ctx, 'declined', period), before ? moneyIn(ctx, 'declined', before) : null, '/quotes?status=declined', 'period'),
    declinedCount: flow('declinedQuotations', 'actual', total(moneyIn(ctx, 'declined', period)), before ? total(moneyIn(ctx, 'declined', before)) : null, '/quotes?status=declined'),
    sentCount: flow('quotationsSent', 'actual', total(sentNow), sentBefore ? total(sentBefore) : null, '/quotes'),
  }
}

// ---- time series (local days or months, through the zone's own midnights) -----------------------------------------------------------------------------

interface BucketRow {
  day: string
  currency: Currency | null
  n: number
  minor: number
}

/**
 * SERIES_NOTE. A time series is built in ONE sorted pass: the bucket starts (one row each, ordinal 0) and the rows of the period (ordinal 1) are put in one list ordered by time, and
 * the running maximum of the bucket key (keys sort in time order) is the bucket a row belongs to. That costs one sort of (rows + buckets) instead of rows x buckets comparisons, which
 * is what kept a five-year range of 150,000 messages at six seconds (docs/business-intelligence/PERFORMANCE.md). The result is exactly the same as comparing each row with each bucket.
 */
function bucketJson(period: Period): { granularity: 'day' | 'month'; keys: string[]; json: string } {
  const { granularity, buckets } = bucketsOf(period, period.zone)
  return { granularity, keys: buckets.map((bucket) => bucket.key), json: JSON.stringify(buckets.map((bucket) => ({ d: bucket.key, s: bucket.fromUtc, e: bucket.toUtc }))) }
}

function moneySeries(ctx: Ctx, stamp: Stamp): Series[] {
  const { granularity, keys, json } = bucketJson(ctx.period)
  const sql = { items: ITEMS, stamp: STAMPS[stamp] }
  const rows = ctx.db.all<BucketRow>(
    // The rows of the WHOLE period are read once (`p`), then each is given its bucket in ONE sorted pass (see SERIES_NOTE below): joining every bucket to the rows would compare every
    // row with every bucket, and reading the table once per bucket would be worse still.
    `WITH b(day, s, e) AS (SELECT json_extract(value, '$.d'), json_extract(value, '$.s'), json_extract(value, '$.e') FROM json_each(?)),
          p AS MATERIALIZED (SELECT q.currency AS currency, CASE WHEN q.pricing_mode <> 'custom' AND q.total_minor IS NOT NULL THEN q.total_minor ELSE 0 END AS minor, ${sql.stamp} AS at
                               FROM quotes q JOIN quote_requests r ON r.id = q.quote_request_id
                              WHERE ${sql.stamp} >= ? AND ${sql.stamp} < ? AND (? IS NULL OR q.currency = ?) AND (? IS NULL OR r.language = ?) AND ${sql.items}),
          ev AS (SELECT s AS at, 0 AS ord, day AS d, NULL AS currency, 0 AS minor FROM b UNION ALL SELECT at, 1, NULL, currency, minor FROM p),
          lab AS (SELECT ord, currency, minor, MAX(d) OVER (ORDER BY at, ord) AS day FROM ev)
     SELECT day, currency, COUNT(*) AS n, COALESCE(SUM(minor), 0) AS minor FROM lab WHERE ord = 1 AND day IS NOT NULL GROUP BY day, currency`,
    [json, ctx.period.fromUtc, ctx.period.toUtc, ...opt(ctx.f.currency), ...opt(ctx.f.language), ...itemParams(ctx.f)],
  )
  const series: Series[] = []
  const { buckets } = bucketsOf(ctx.period, ctx.period.zone)
  for (const currency of CURRENCY_ORDER) {
    const mine = rows.filter((row) => row.currency === currency)
    if (mine.length === 0) continue
    series.push({ id: `${stamp}ValueSeries`, granularity, unit: 'minor', currency, points: keys.map((key, index) => ({ key, from: buckets[index].from, to: buckets[index].to, value: mine.find((row) => row.day === key)?.minor ?? 0 })) })
  }
  return series
}

function countSeries(ctx: Ctx, id: string, stamp: Stamp | 'requests'): Series {
  const { granularity, buckets } = bucketsOf(ctx.period, ctx.period.zone)
  const json = JSON.stringify(buckets.map((bucket) => ({ d: bucket.key, s: bucket.fromUtc, e: bucket.toUtc })))
  let rows: Array<{ day: string; n: number }>
  if (stamp === 'requests') {
    rows = ctx.db.all<{ day: string; n: number }>(
      `WITH b(day, s, e) AS (SELECT json_extract(value, '$.d'), json_extract(value, '$.s'), json_extract(value, '$.e') FROM json_each(?)),
            p AS MATERIALIZED (SELECT r.created_at AS at FROM quote_requests r WHERE r.created_at >= ? AND r.created_at < ? AND (? IS NULL OR r.language = ?) AND ${sql.items}),
            ev AS (SELECT s AS at, 0 AS ord, day AS d FROM b UNION ALL SELECT at, 1, NULL FROM p),
            lab AS (SELECT ord, MAX(d) OVER (ORDER BY at, ord) AS day FROM ev)
       SELECT day, COUNT(*) AS n FROM lab WHERE ord = 1 AND day IS NOT NULL GROUP BY day`,
      [json, ctx.period.fromUtc, ctx.period.toUtc, ...opt(ctx.f.language), ...itemParams(ctx.f)],
    )
  } else {
    const sql = { items: ITEMS, stamp: STAMPS[stamp] }
    rows = ctx.db.all<{ day: string; n: number }>(
      `WITH b(day, s, e) AS (SELECT json_extract(value, '$.d'), json_extract(value, '$.s'), json_extract(value, '$.e') FROM json_each(?)),
            p AS MATERIALIZED (SELECT ${sql.stamp} AS at FROM quotes q JOIN quote_requests r ON r.id = q.quote_request_id
                                WHERE ${sql.stamp} >= ? AND ${sql.stamp} < ? AND (? IS NULL OR q.currency = ?) AND (? IS NULL OR r.language = ?) AND ${sql.items}),
            ev AS (SELECT s AS at, 0 AS ord, day AS d FROM b UNION ALL SELECT at, 1, NULL FROM p),
            lab AS (SELECT ord, MAX(d) OVER (ORDER BY at, ord) AS day FROM ev)
       SELECT day, COUNT(*) AS n FROM lab WHERE ord = 1 AND day IS NOT NULL GROUP BY day`,
      [json, ctx.period.fromUtc, ctx.period.toUtc, ...opt(ctx.f.currency), ...opt(ctx.f.language), ...itemParams(ctx.f)],
    )
  }
  return { id, granularity, unit: 'count', points: buckets.map((bucket) => ({ key: bucket.key, from: bucket.from, to: bucket.to, value: rows.find((row) => row.day === bucket.key)?.n ?? 0 })) }
}

// ---- the financial section ------------------------------------------------------------------------------------------------------------------

export function financialSection(ctx: Ctx): Section {
  const section = emptySection('financial')
  const q = quoteMetrics(ctx)
  section.money.push(q.quotedValue, q.acceptedValue, q.pipelineValue, q.declinedValue, q.averageValue)
  section.metrics.push(
    q.sentCount,
    q.acceptedQuotations,
    q.declinedCount,
    q.openQuotations,
    unavailable('requestedBudgetAmount', 'stored_as_text'),
    unavailable('recordedRevenue', 'no_payment_data'),
    unavailable('outstandingReceivables', 'no_payment_data'),
  )
  const stated = ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM quote_requests r WHERE r.created_at >= ? AND r.created_at < ? AND r.budget_range IS NOT NULL AND length(trim(r.budget_range)) > 0 AND (? IS NULL OR r.language = ?) AND ${sql.items}`, [ctx.period.fromUtc, ctx.period.toUtc, ...opt(ctx.f.language), ...itemParams(ctx.f)])?.n ?? 0
  section.metrics.push(snapshot('requestsStatingABudget', 'actual', stated, '/quotes'))
  section.money.push(moneyUnavailable('recordedRevenueMoney', 'no_payment_data'))
  section.series.push(...moneySeries(ctx, 'accepted'), countSeries(ctx, 'quotationsSentSeries', 'sent'), countSeries(ctx, 'quotationsAcceptedSeries', 'accepted'), countSeries(ctx, 'quotationsDeclinedSeries', 'declined'))
  // Accepted versus declined value, per currency (a state-free comparison of two stored timestamps).
  section.tables.push({
    id: 'acceptedVersusDeclined',
    columns: ['currency', 'acceptedMinor', 'declinedMinor'],
    rows: CURRENCY_ORDER.map((currency) => [currency, q.acceptedValue.lines.find((line) => line.currency === currency)?.minor ?? 0, q.declinedValue.lines.find((line) => line.currency === currency)?.minor ?? 0]),
  })
  const statuses = ctx.db.all<{ status: string; n: number }>(
    `SELECT q.status AS status, COUNT(*) AS n FROM quotes q JOIN quote_requests r ON r.id = q.quote_request_id
      WHERE q.created_at >= ? AND q.created_at < ? AND (? IS NULL OR q.status = ?) AND (? IS NULL OR q.currency = ?) AND (? IS NULL OR r.language = ?) AND ${sql.items} GROUP BY q.status ORDER BY n DESC`,
    [ctx.period.fromUtc, ctx.period.toUtc, ...opt(ctx.f.quoteStatus), ...opt(ctx.f.currency), ...opt(ctx.f.language), ...itemParams(ctx.f)],
  )
  section.distributions.push({ id: 'quotationsCreatedByStatus', total: statuses.reduce((sum, row) => sum + row.n, 0), items: statuses.map((row) => ({ key: row.status, value: row.n })) })
  section.limitations.push('no_payment_data', 'no_pipeline_history', 'currencies_not_summed', 'budget_stored_as_text', 'custom_pricing_has_no_amount')
  return section
}

// ---- service and package interest -----------------------------------------------------------------------------------------------------------

export function interestDistributions(ctx: Ctx): Distribution[] {
  const base = [ctx.period.fromUtc, ctx.period.toUtc, ...opt(ctx.f.language)] as Array<string | null>
  const services = ctx.db.all<{ code: string; name: string | null; n: number; accepted: number }>(
    `SELECT s.slug AS code, st.title AS name, COUNT(DISTINCT r.id) AS n,
            COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM quotes a WHERE a.quote_request_id = r.id AND a.accepted_at IS NOT NULL) THEN r.id END) AS accepted
       FROM quote_request_items i JOIN quote_requests r ON r.id = i.quote_request_id JOIN services s ON s.id = i.service_id
       LEFT JOIN service_translations st ON st.service_id = s.id AND st.language = ?
      WHERE r.created_at >= ? AND r.created_at < ? AND (? IS NULL OR r.language = ?) GROUP BY s.id ORDER BY n DESC, s.slug LIMIT 20`,
    [ctx.f.lang, ...base],
  )
  const packages = ctx.db.all<{ code: string; name: string | null; n: number; accepted: number }>(
    `SELECT p.code AS code, pt.name AS name, COUNT(DISTINCT r.id) AS n,
            COUNT(DISTINCT CASE WHEN EXISTS (SELECT 1 FROM quotes a WHERE a.quote_request_id = r.id AND a.accepted_at IS NOT NULL) THEN r.id END) AS accepted
       FROM quote_request_items i JOIN quote_requests r ON r.id = i.quote_request_id JOIN packages p ON p.id = i.package_id
       LEFT JOIN package_translations pt ON pt.package_id = p.id AND pt.language = ?
      WHERE r.created_at >= ? AND r.created_at < ? AND (? IS NULL OR r.language = ?) GROUP BY p.id ORDER BY n DESC, p.code LIMIT 20`,
    [ctx.f.lang, ...base],
  )
  const extras = ctx.db.all<{ code: string; name: string | null; n: number }>(
    `SELECT x.code AS code, xt.name AS name, COUNT(DISTINCT r.id) AS n
       FROM quote_request_item_extras e JOIN quote_request_items i ON i.id = e.item_id JOIN quote_requests r ON r.id = i.quote_request_id JOIN extras x ON x.id = e.extra_id
       LEFT JOIN extra_translations xt ON xt.extra_id = x.id AND xt.language = ?
      WHERE r.created_at >= ? AND r.created_at < ? AND (? IS NULL OR r.language = ?) GROUP BY x.id ORDER BY n DESC, x.code LIMIT 20`,
    [ctx.f.lang, ...base],
  )
  const full = ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM quote_requests r WHERE r.kind = 'full_experience' AND r.created_at >= ? AND r.created_at < ? AND (? IS NULL OR r.language = ?)", base)?.n ?? 0
  const channel = ctx.db.all<{ key: string; n: number }>('SELECT r.source AS key, COUNT(*) AS n FROM quote_requests r WHERE r.created_at >= ? AND r.created_at < ? AND (? IS NULL OR r.language = ?) GROUP BY r.source ORDER BY n DESC', base)
  const pack = (id: string, rows: Array<{ code: string; name: string | null; n: number; accepted?: number }>): Distribution => ({ id, total: rows.reduce((sum, row) => sum + row.n, 0), items: rows.map((row) => ({ key: row.name ?? row.code, value: row.n, drill: null, ...(row.accepted === undefined ? {} : { accepted: row.accepted }) })) })
  return [pack('servicesRequested', services), pack('packagesRequested', packages), pack('addOnsRequested', extras), { id: 'fullExperienceRequests', total: full, items: [{ key: 'full_experience', value: full }] }, { id: 'requestChannels', total: channel.reduce((sum, row) => sum + row.n, 0), items: channel.map((row) => ({ key: row.key, value: row.n })) }]
}

// ---- the conversion funnel ------------------------------------------------------------------------------------------------------------------

const STAGES = ['received', 'reviewed', 'prepared', 'sent', 'accepted', 'project', 'completed'] as const
export type Stage = (typeof STAGES)[number]

interface FunnelRow {
  received: number
  reviewed: number
  prepared: number
  sent: number
  accepted: number
  project: number
  completed: number
  d_review: number | null
  d_prepare: number | null
  d_send: number | null
  d_accept: number | null
  d_project: number | null
  d_complete: number | null
}

/** The requests received in the period (the cohort) and how far each got, from real timestamps and events. */
function funnelRow(ctx: Ctx, span: Span): FunnelRow {
  return ctx.db.get<FunnelRow>(
    `WITH c AS (SELECT r.id, r.created_at FROM quote_requests r WHERE r.created_at >= ? AND r.created_at < ? AND (? IS NULL OR r.language = ?) AND ${sql.items}),
          reviewed AS (SELECT c.id, MIN(e.created_at) AS at FROM c JOIN quote_events e ON e.quote_request_id = c.id WHERE e.to_status IS NOT NULL AND e.to_status <> 'new' GROUP BY c.id),
          prepared AS (SELECT c.id, MIN(q.created_at) AS at FROM c JOIN quotes q ON q.quote_request_id = c.id GROUP BY c.id),
          sent AS (SELECT c.id, MIN(q.sent_at) AS at FROM c JOIN quotes q ON q.quote_request_id = c.id WHERE q.sent_at IS NOT NULL GROUP BY c.id),
          accepted AS (SELECT c.id, MIN(q.accepted_at) AS at FROM c JOIN quotes q ON q.quote_request_id = c.id WHERE q.accepted_at IS NOT NULL GROUP BY c.id),
          project AS (SELECT c.id, MIN(p.created_at) AS at, MIN(p.completed_at) AS done FROM c JOIN client_projects p ON p.quote_request_id = c.id GROUP BY c.id)
     SELECT (SELECT COUNT(*) FROM c) AS received,
            (SELECT COUNT(*) FROM reviewed) AS reviewed,
            (SELECT COUNT(*) FROM prepared) AS prepared,
            (SELECT COUNT(*) FROM sent) AS sent,
            (SELECT COUNT(*) FROM accepted) AS accepted,
            (SELECT COUNT(*) FROM project) AS project,
            (SELECT COUNT(*) FROM project WHERE done IS NOT NULL) AS completed,
            (SELECT AVG(julianday(reviewed.at) - julianday(c.created_at)) FROM c JOIN reviewed ON reviewed.id = c.id) AS d_review,
            (SELECT AVG(julianday(prepared.at) - julianday(reviewed.at)) FROM prepared JOIN reviewed ON reviewed.id = prepared.id WHERE prepared.at >= reviewed.at) AS d_prepare,
            (SELECT AVG(julianday(sent.at) - julianday(prepared.at)) FROM sent JOIN prepared ON prepared.id = sent.id) AS d_send,
            (SELECT AVG(julianday(accepted.at) - julianday(sent.at)) FROM accepted JOIN sent ON sent.id = accepted.id) AS d_accept,
            (SELECT AVG(julianday(project.at) - julianday(accepted.at)) FROM project JOIN accepted ON accepted.id = project.id WHERE project.at >= accepted.at) AS d_project,
            (SELECT AVG(julianday(project.done) - julianday(project.at)) FROM project WHERE done IS NOT NULL) AS d_complete`,
    [span.fromUtc, span.toUtc, ...opt(ctx.f.language), ...itemParams(ctx.f)],
  )!
}

const round1 = (value: number | null): number | null => (value === null ? null : Math.round(value * 10) / 10)

export function funnelSection(ctx: Ctx): Section {
  const section = emptySection('funnel')
  const row = funnelRow(ctx, ctx.period)
  const days = [null, row.d_review, row.d_prepare, row.d_send, row.d_accept, row.d_project, row.d_complete]
  const stages = STAGES.map((stage, index) => ({
    stage,
    count: row[stage],
    /** Requests reaching this stage ÷ requests reaching the one before (the cohort's own conversion); `null` for the first stage or when the stage before is empty. */
    conversionFromPrevious: index === 0 || row[STAGES[index - 1]] === 0 ? null : Math.round((row[stage] / row[STAGES[index - 1]]) * 1000) / 10,
    conversionFromReceived: index === 0 || row.received === 0 ? null : Math.round((row[stage] / row.received) * 1000) / 10,
    daysFromPrevious: round1(days[index]),
  }))
  section.extra = { cohort: { from: ctx.period.from, to: ctx.period.to }, stages }
  // The current state of the requests received in the period: a snapshot, never used to compute a conversion.
  const states = ctx.db.all<{ status: string; n: number }>(
    `SELECT r.status AS status, COUNT(*) AS n FROM quote_requests r WHERE r.created_at >= ? AND r.created_at < ? AND (? IS NULL OR r.language = ?) AND ${sql.items} GROUP BY r.status ORDER BY n DESC`,
    [ctx.period.fromUtc, ctx.period.toUtc, ...opt(ctx.f.language), ...itemParams(ctx.f)],
  )
  section.distributions.push({ id: 'cohortCurrentStatus', total: states.reduce((sum, item) => sum + item.n, 0), items: states.map((item) => ({ key: item.status, value: item.n, drill: `/quotes?status=${item.status}` })) })
  const all = ctx.db.all<{ status: string; n: number }>('SELECT status AS status, COUNT(*) AS n FROM quote_requests WHERE archived_at IS NULL GROUP BY status ORDER BY n DESC', [])
  section.distributions.push({ id: 'allRequestsCurrentStatus', total: all.reduce((sum, item) => sum + item.n, 0), items: all.map((item) => ({ key: item.status, value: item.n, drill: `/quotes?status=${item.status}` })) })
  const q = quoteMetrics(ctx)
  const awaitingReview = ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM quote_requests WHERE status IN ('new', 'under_review') AND archived_at IS NULL", [])?.n ?? 0
  const declinedWithReason = ctx.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM quotes WHERE declined_at >= ? AND declined_at < ? AND decline_reason IS NOT NULL AND length(trim(decline_reason)) > 0", [ctx.period.fromUtc, ctx.period.toUtc])?.n ?? 0
  section.metrics.push(
    snapshot('requestsAwaitingReview', 'actual', awaitingReview, '/quotes?status=new'),
    q.openQuotations,
    q.acceptedQuotations,
    q.declinedCount,
    flow('declinedWithRecordedReason', 'actual', declinedWithReason, null, '/quotes?status=declined'),
  )
  section.limitations.push('cohort_not_matured', 'events_only_since_event_log', 'decline_reason_text_not_shown', 'status_snapshot_not_a_funnel')
  return section
}
