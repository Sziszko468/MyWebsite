import { loadSettings } from '../ai/settings.ts'
import { spent } from '../ai/budget.ts'
import { bucketsOf } from './period.ts'
import { emptySection, flow, snapshot, type Section } from './model.ts'
import type { Ctx } from './quotes.ts'

/**
 * AI usage and cost (PROMPT 32), from the usage ledger the assistants already keep (`ai_requests`, `ai_tool_calls`): visitor and administrator usage kept apart, with a combined total
 * for cost control. The cost is an ESTIMATE (the tokens the provider reported times the configured prices, in US dollars: never the provider's invoice); cost that was reserved
 * before an answer and never reconciled, and answers whose cost is unknown or was not measured, are shown as what they are. No prompt, no message and no customer record is in any
 * of it: the ledger has none.
 */

interface UsageRow {
  audience: 'visitor' | 'admin'
  requests: number
  completed: number
  failed: number
  aborted: number
  inputTokens: number
  outputTokens: number
  estimated: number
  reserved: number
  reported: number
  unmeasured: number
  latency: number | null
}

const USAGE = `SELECT audience AS audience, COUNT(*) AS requests,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN status IN ('aborted', 'abandoned') THEN 1 ELSE 0 END) AS aborted,
       SUM(COALESCE(input_tokens, 0)) AS inputTokens, SUM(COALESCE(output_tokens, 0)) AS outputTokens,
       SUM(COALESCE(actual_cost_usd, 0)) AS estimated,
       SUM(CASE WHEN actual_cost_usd IS NULL AND status IN ('reserved', 'abandoned', 'aborted') THEN reserved_cost_usd ELSE 0 END) AS reserved,
       SUM(CASE WHEN cost_source = 'provider_usage' THEN 1 ELSE 0 END) AS reported,
       SUM(CASE WHEN status = 'completed' AND (actual_cost_usd IS NULL OR cost_state IN ('none', 'unknown')) THEN 1 ELSE 0 END) AS unmeasured,
       AVG(CASE WHEN status = 'completed' THEN latency_ms END) AS latency
  FROM ai_requests WHERE created_at >= ? AND created_at < ? GROUP BY audience`

const usd = (value: number): number => Math.round(value * 1_000_000) / 1_000_000

type SumKey = 'requests' | 'completed' | 'failed' | 'aborted' | 'inputTokens' | 'outputTokens' | 'estimated' | 'reserved' | 'reported' | 'unmeasured'

export function aiSection(ctx: Ctx): Section {
  const section = emptySection('ai')
  const rows = ctx.db.all<UsageRow>(USAGE, [ctx.period.fromUtc, ctx.period.toUtc])
  const before = ctx.period.previous ? ctx.db.all<UsageRow>(USAGE, [ctx.period.previous.fromUtc, ctx.period.previous.toUtc]) : null
  const sum = (list: UsageRow[], key: SumKey): number => list.reduce((total, row) => total + (row[key] ?? 0), 0)
  const blank = (audience: 'visitor' | 'admin'): UsageRow => ({ audience, requests: 0, completed: 0, failed: 0, aborted: 0, inputTokens: 0, outputTokens: 0, estimated: 0, reserved: 0, reported: 0, unmeasured: 0, latency: null })
  const lines = [rows.find((row) => row.audience === 'visitor') ?? blank('visitor'), rows.find((row) => row.audience === 'admin') ?? blank('admin')]
  section.metrics.push(
    flow('aiRequestsCombined', 'actual', sum(rows, 'requests'), before ? sum(before, 'requests') : null),
    flow('aiTokensCombined', 'actual', sum(rows, 'inputTokens') + sum(rows, 'outputTokens'), before ? sum(before, 'inputTokens') + sum(before, 'outputTokens') : null),
    flow('aiEstimatedCostUsdCombined', 'estimate', usd(sum(rows, 'estimated')), before ? usd(sum(before, 'estimated')) : null),
    flow('aiFailedRequestsCombined', 'actual', sum(rows, 'failed'), before ? sum(before, 'failed') : null),
    flow('aiVisitorRequests', 'actual', lines[0].requests, before ? (before.find((row) => row.audience === 'visitor')?.requests ?? 0) : null),
    flow('aiAdminRequests', 'actual', lines[1].requests, before ? (before.find((row) => row.audience === 'admin')?.requests ?? 0) : null),
  )
  section.tables.push({
    id: 'aiUsageByAudience',
    columns: ['audience', 'requests', 'completed', 'failed', 'aborted', 'inputTokens', 'outputTokens', 'estimatedCostUsd', 'reservedNotReconciledUsd', 'providerReportedRequests', 'unmeasuredCostRequests', 'averageResponseMs'],
    rows: [
      ...lines.map((row) => [row.audience, row.requests, row.completed, row.failed, row.aborted, row.inputTokens, row.outputTokens, usd(row.estimated), usd(row.reserved), row.reported, row.unmeasured, row.latency === null ? null : Math.round(row.latency)]),
      ['combined', sum(rows, 'requests'), sum(rows, 'completed'), sum(rows, 'failed'), sum(rows, 'aborted'), sum(rows, 'inputTokens'), sum(rows, 'outputTokens'), usd(sum(rows, 'estimated')), usd(sum(rows, 'reserved')), sum(rows, 'reported'), sum(rows, 'unmeasured'), null],
    ],
  })
  const tools = ctx.db.all<{ audience: string; tool: string; calls: number; failed: number }>(
    "SELECT audience AS audience, tool AS tool, COUNT(*) AS calls, SUM(CASE WHEN status <> 'ok' THEN 1 ELSE 0 END) AS failed FROM ai_tool_calls WHERE created_at >= ? AND created_at < ? GROUP BY audience, tool ORDER BY calls DESC, tool LIMIT 40",
    [ctx.period.fromUtc, ctx.period.toUtc],
  )
  section.tables.push({ id: 'aiToolUsage', columns: ['audience', 'tool', 'calls', 'failed'], rows: tools.map((row) => [row.audience, row.tool, row.calls, row.failed ?? 0]) })
  const errors = ctx.db.all<{ audience: string; code: string; n: number }>(
    "SELECT audience AS audience, COALESCE(error_code, 'unknown') AS code, COUNT(*) AS n FROM ai_requests WHERE created_at >= ? AND created_at < ? AND status IN ('failed', 'aborted', 'abandoned') GROUP BY audience, code ORDER BY n DESC LIMIT 20",
    [ctx.period.fromUtc, ctx.period.toUtc],
  )
  section.tables.push({ id: 'aiProviderErrors', columns: ['audience', 'errorCode', 'requests'], rows: errors.map((row) => [row.audience, row.code, row.n]) })
  // Budget consumption: today and this month, in the units the budgets are set in (the same figures the AI screen shows).
  const settings = loadSettings(ctx.app)
  const used = spent(ctx.app, ctx.now)
  section.tables.push({
    id: 'aiBudget',
    columns: ['scope', 'spentUsd', 'budgetUsd', 'tokens', 'tokenBudget', 'requests', 'requestBudget'],
    rows: [
      ['day', usd(used.dayCostUsd), settings.dailyBudgetUsd, used.dayTokens, settings.dailyTokenBudget, used.dayRequests, settings.dailyRequests],
      ['month', usd(used.monthCostUsd), settings.monthlyBudgetUsd, null, null, null, null],
    ],
  })
  const { granularity, buckets } = bucketsOf(ctx.period, ctx.period.zone)
  const json = JSON.stringify(buckets.map((bucket) => ({ d: bucket.key, s: bucket.fromUtc, e: bucket.toUtc })))
  const daily = ctx.db.all<{ day: string; audience: string; n: number; cost: number }>(
    `WITH b(day, s, e) AS (SELECT json_extract(value, '$.d'), json_extract(value, '$.s'), json_extract(value, '$.e') FROM json_each(?)),
          p AS MATERIALIZED (SELECT r.audience AS audience, r.actual_cost_usd AS cost, r.created_at AS at FROM ai_requests r WHERE r.created_at >= ? AND r.created_at < ?),
          ev AS (SELECT s AS at, 0 AS ord, day AS d, NULL AS audience, NULL AS cost FROM b UNION ALL SELECT at, 1, NULL, audience, cost FROM p),
          lab AS (SELECT ord, audience, cost, MAX(d) OVER (ORDER BY at, ord) AS day FROM ev)
     SELECT day, audience, COUNT(*) AS n, COALESCE(SUM(cost), 0) AS cost FROM lab WHERE ord = 1 AND day IS NOT NULL GROUP BY day, audience`,
    [json, ctx.period.fromUtc, ctx.period.toUtc],
  )
  for (const audience of ['visitor', 'admin'] as const) {
    section.series.push({ id: `aiRequests${audience === 'visitor' ? 'Visitor' : 'Admin'}Series`, granularity, unit: 'count', points: buckets.map((bucket) => ({ key: bucket.key, from: bucket.from, to: bucket.to, value: daily.find((row) => row.day === bucket.key && row.audience === audience)?.n ?? 0 })) })
  }
  section.series.push({ id: 'aiEstimatedCostSeries', granularity, unit: 'usd', points: buckets.map((bucket) => ({ key: bucket.key, from: bucket.from, to: bucket.to, value: usd(daily.filter((row) => row.day === bucket.key).reduce((total, row) => total + row.cost, 0)) })) })
  section.metrics.push(snapshot('aiBudgetDayPercent', 'derived', settings.dailyBudgetUsd > 0 ? Math.round((used.dayCostUsd / settings.dailyBudgetUsd) * 1000) / 10 : 0))
  section.limitations.push('cost_is_an_estimate', 'usd_unit', 'ledger_has_no_text', 'reserved_cost_not_reconciled')
  return section
}
