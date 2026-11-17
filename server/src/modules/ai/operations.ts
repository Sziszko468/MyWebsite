import { AI_CEILING_KEYS } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { RANGES } from './settings.ts'
import { dayOf, monthOf } from './store.ts'

/**
 * What the administration sees of the assistant's OPERATION (PROMPT 29): aggregates over the usage rows, the counters of the times a limit
 * stopped somebody, the last failures, the last answer, and what the administrators did to the configuration. Counts, codes, durations and
 * estimated costs: never a conversation, a prompt, an answer, a visitor or an address. A cost is always an ESTIMATE (the provider's token counts
 * times the price list in pricing.ts); a request whose cost cannot be known is counted at what was reserved for it and says so.
 */

/**
 * A request's cost, as one of three honest states (migration 0016). A row written before the column existed derives the same three from what
 * it has: reported usage, a failure (nothing answered), or anything else (cancelled, abandoned: unknown).
 */
const COST_STATE = "COALESCE(cost_state, CASE WHEN cost_source = 'provider_usage' THEN 'reported' WHEN status = 'failed' THEN 'none' ELSE 'unknown' END)"

interface PeriodRow {
  requests: number
  completed: number | null
  failed: number | null
  aborted: number | null
  inputTokens: number | null
  outputTokens: number | null
  costUsd: number | null
  avgMs: number | null
  reported: number | null
  none: number | null
  unknown: number | null
  unknownCostUsd: number | null
  truncated: number | null
}

/** Requests of one day (`from` = `to`) or a stretch of days: counts by outcome, the tokens the provider reported, the estimated cost, how much of it is unknown. */
export function period(app: AppContext, from: string, to: string | null = null) {
  const row = app.db.get<PeriodRow>(
    `SELECT COUNT(*) AS requests,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status IN ('failed', 'abandoned') THEN 1 ELSE 0 END) AS failed,
            SUM(CASE WHEN status = 'aborted' THEN 1 ELSE 0 END) AS aborted,
            SUM(COALESCE(input_tokens, 0)) AS inputTokens, SUM(COALESCE(output_tokens, 0)) AS outputTokens,
            SUM(COALESCE(actual_cost_usd, reserved_cost_usd)) AS costUsd,
            AVG(CASE WHEN status = 'completed' THEN latency_ms END) AS avgMs,
            SUM(CASE WHEN ${COST_STATE} = 'reported' THEN 1 ELSE 0 END) AS reported,
            SUM(CASE WHEN ${COST_STATE} = 'none' THEN 1 ELSE 0 END) AS none,
            SUM(CASE WHEN ${COST_STATE} = 'unknown' THEN 1 ELSE 0 END) AS unknown,
            SUM(CASE WHEN ${COST_STATE} = 'unknown' THEN COALESCE(actual_cost_usd, reserved_cost_usd) ELSE 0 END) AS unknownCostUsd,
            SUM(CASE WHEN finish_reason = 'length' THEN 1 ELSE 0 END) AS truncated
       FROM ai_requests WHERE day >= ? AND (? IS NULL OR day <= ?)`,
    [from, to, to],
  )
  return {
    requests: row?.requests ?? 0,
    completed: row?.completed ?? 0,
    failed: row?.failed ?? 0,
    aborted: row?.aborted ?? 0,
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
    estimatedCostUsd: row?.costUsd ?? 0,
    averageResponseMs: row?.avgMs === null || row?.avgMs === undefined ? null : Math.round(row.avgMs),
    /** How the cost of these requests is known: from the provider's own token counts, not at all (the provider never answered), or not known. */
    costAccounting: { reported: row?.reported ?? 0, none: row?.none ?? 0, unknown: row?.unknown ?? 0, unknownCostUsd: row?.unknownCostUsd ?? 0 },
    /** Answers that stopped because they reached the output limit. */
    truncated: row?.truncated ?? 0,
  }
}

/** How often each limit stopped somebody: today and this month. Counts only. */
export function limitEvents(app: AppContext) {
  const now = app.clock.now()
  const rows = app.db.all<{ kind: string; today: number | null; month: number | null; lastAt: string | null }>(
    'SELECT kind, SUM(CASE WHEN day = ? THEN count ELSE 0 END) AS today, SUM(count) AS month, MAX(last_at) AS lastAt FROM ai_limit_events WHERE day >= ? GROUP BY kind ORDER BY month DESC',
    [dayOf(now), `${monthOf(now)}-01`],
  )
  return rows.map((row) => ({ kind: row.kind, today: row.today ?? 0, month: row.month ?? 0, lastAt: row.lastAt }))
}

/** The last requests that did not end well: a code, a time, a duration and the request id to look up in the server log. No conversation, no text. */
export function recentFailures(app: AppContext, limit = 15) {
  return app.db
    .all<{ id: string; created_at: string; status: string; error_code: string | null; latency_ms: number | null; steps: number | null; correlation_id: string | null }>(
      "SELECT id, created_at, status, error_code, latency_ms, steps, correlation_id FROM ai_requests WHERE status IN ('failed', 'abandoned') OR (status = 'aborted' AND error_code = 'shutdown') ORDER BY created_at DESC, rowid DESC LIMIT ?",
      [limit],
    )
    .map((row) => ({ id: row.id, at: row.created_at, status: row.status, code: row.error_code ?? 'unknown', latencyMs: row.latency_ms, steps: row.steps, requestId: row.correlation_id }))
}

/** The last request that was answered. */
export function lastSuccessfulRequest(app: AppContext) {
  const row = app.db.get<{ finished_at: string; latency_ms: number | null; input_tokens: number | null; output_tokens: number | null; actual_cost_usd: number | null; finish_reason: string | null; model_verified: number }>(
    "SELECT finished_at, latency_ms, input_tokens, output_tokens, actual_cost_usd, finish_reason, model_verified FROM ai_requests WHERE status = 'completed' ORDER BY finished_at DESC, rowid DESC LIMIT 1",
  )
  if (!row) return null
  return { at: row.finished_at, latencyMs: row.latency_ms, inputTokens: row.input_tokens, outputTokens: row.output_tokens, estimatedCostUsd: row.actual_cost_usd, finishReason: row.finish_reason, modelVerified: row.model_verified === 1 }
}

/** What the administration did to the assistant: the audit log's `ai.*` entries (who, when, what), most recent first. */
export function history(app: AppContext, limit = 15) {
  return app.db
    .all<{ id: number; actor: string | null; action: string; detail: string | null; created_at: string }>(
      "SELECT a.id, u.email AS actor, a.action, a.detail, a.created_at FROM audit_log a LEFT JOIN admin_users u ON u.id = a.actor_id WHERE a.action LIKE 'ai.%' ORDER BY a.id DESC LIMIT ?",
      [limit],
    )
    .map((row) => ({ id: row.id, at: row.created_at, actor: row.actor, action: row.action, detail: row.detail }))
}

/** The provider's state as far as it is known: no key, proven working (the last success is newer than the last error), or failing. Never a guess. */
export function providerStatus(app: AppContext, lastRequestAt: string | null, lastTestAt: string | null, lastErrorAt: string | null): 'not_configured' | 'unknown' | 'ok' | 'error' {
  if (!app.config.ai.apiKey) return 'not_configured'
  const latest = [lastRequestAt, lastTestAt].filter((at): at is string => at !== null).sort().at(-1) ?? null
  if (lastErrorAt !== null && (latest === null || lastErrorAt > latest)) return 'error'
  return latest !== null ? 'ok' : 'unknown'
}

/** The accepted range of each numeric setting with the operator's ceilings applied: an administrator cannot go past them. */
export function effectiveRanges(app: AppContext): Record<string, readonly [number, number]> {
  const ranges: Record<string, readonly [number, number]> = { ...RANGES }
  for (const key of AI_CEILING_KEYS) {
    const range = ranges[key]
    if (range) ranges[key] = [range[0], Math.min(range[1], app.config.ai.ceilings[key])]
  }
  return ranges
}
