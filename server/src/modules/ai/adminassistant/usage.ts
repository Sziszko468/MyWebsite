import type { AppContext, SessionInfo } from '../../../context.ts'
import { addMs, DAY } from '../../../lib/time.ts'
import { requirePermission } from '../../auth/permissions.ts'
import { adminAvailability, loadSettings } from '../settings.ts'
import { dayOf, monthOf } from '../store.ts'
import { countAdminConversations } from './store.ts'
import { REPORT_TOOLS } from './tools.ts'

/**
 * What the administration shows of the admin assistant's use (PROMPT 31): numbers only, from the shared ledger rows marked `audience = 'admin'`. No conversation text, no
 * record references, no administrator names: how many requests, tokens and dollars (an estimate), how long answers take, which tools ran and how often they failed, what
 * failed, how many conversations were started and how many reports were made. These numbers are INCLUDED in the budget and in Operations (one ledger, one wallet) and
 * are left OUT of the public assistant's analytics.
 */

export type UsageRange = 'today' | 'last_7_days' | 'month'

export const parseUsageRange = (value: string | null): UsageRange => (value === 'last_7_days' || value === 'month' ? value : 'today')

function fromDay(app: AppContext, range: UsageRange): string {
  const now = app.clock.now()
  if (range === 'today') return dayOf(now)
  if (range === 'last_7_days') return dayOf(addMs(now, -6 * DAY))
  return `${monthOf(now)}-01`
}

export function adminUsage(app: AppContext, session: SessionInfo | null, rangeValue: string | null) {
  requirePermission(session, 'system:read')
  const range = parseUsageRange(rangeValue)
  const from = fromDay(app, range)
  const { db } = app
  const totals = db.get<{ requests: number; completed: number; failed: number; inputTokens: number | null; outputTokens: number | null; cost: number | null; latency: number | null; toolCalls: number | null; measured: number }>(
    `SELECT COUNT(*) AS requests,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status IN ('failed', 'abandoned') THEN 1 ELSE 0 END) AS failed,
            SUM(COALESCE(input_tokens, 0)) AS inputTokens, SUM(COALESCE(output_tokens, 0)) AS outputTokens,
            SUM(COALESCE(actual_cost_usd, reserved_cost_usd)) AS cost,
            AVG(CASE WHEN status = 'completed' THEN latency_ms END) AS latency,
            SUM(tool_calls) AS toolCalls,
            SUM(CASE WHEN cost_source = 'provider_usage' THEN 1 ELSE 0 END) AS measured
       FROM ai_requests WHERE audience = 'admin' AND day >= ?`,
    [from],
  )
  const tools = db.all<{ tool: string; calls: number; failed: number; avgMs: number | null }>(
    "SELECT tool, COUNT(*) AS calls, SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS failed, AVG(duration_ms) AS avgMs FROM ai_tool_calls WHERE audience = 'admin' AND day >= ? GROUP BY tool ORDER BY calls DESC",
    [from],
  )
  const errors = db.all<{ code: string; n: number }>("SELECT COALESCE(error_code, 'unknown') AS code, COUNT(*) AS n FROM ai_requests WHERE audience = 'admin' AND day >= ? AND status IN ('failed', 'abandoned', 'aborted') GROUP BY code ORDER BY n DESC", [from])
  const recentFailures = db.all<{ created_at: string; error_code: string | null; status: string }>(
    "SELECT created_at, error_code, status FROM ai_requests WHERE audience = 'admin' AND status IN ('failed', 'abandoned') ORDER BY created_at DESC LIMIT 8",
  )
  const series = db.all<{ day: string; requests: number; tokens: number | null; cost: number | null }>(
    `SELECT day, COUNT(*) AS requests, SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS tokens, SUM(COALESCE(actual_cost_usd, reserved_cost_usd)) AS cost
       FROM ai_requests WHERE audience = 'admin' AND day >= ? GROUP BY day ORDER BY day`,
    [dayOf(addMs(app.clock.now(), -13 * DAY))],
  )
  const settings = loadSettings(app)
  const reportCalls = tools.filter((row) => (REPORT_TOOLS as readonly string[]).includes(row.tool)).reduce((sum, row) => sum + row.calls, 0)
  return {
    range,
    from,
    availability: adminAvailability(app, settings),
    enabled: settings.adminAssistantEnabled,
    limits: { requestsPerHourPerAdministrator: settings.adminMaxRequestsPerHour, toolStepsPerAnswer: settings.adminMaxToolCalls, outputTokensPerAnswer: settings.adminMaxOutputTokens, inputCharsPerMessage: settings.adminMaxInputChars },
    requests: totals?.requests ?? 0,
    completedRequests: totals?.completed ?? 0,
    failedRequests: totals?.failed ?? 0,
    inputTokens: totals?.inputTokens ?? 0,
    outputTokens: totals?.outputTokens ?? 0,
    /** The reported token counts times the configured prices: an estimate, not a bill. */
    estimatedCostUsd: totals?.cost ?? 0,
    requestsWithReportedUsage: totals?.measured ?? 0,
    averageResponseMs: totals?.latency === null || totals?.latency === undefined ? null : Math.round(totals.latency),
    toolCalls: totals?.toolCalls ?? 0,
    tools: tools.map((row) => ({ tool: row.tool, calls: row.calls, failed: row.failed, averageMs: row.avgMs === null ? null : Math.round(row.avgMs) })),
    errors,
    recentFailures: recentFailures.map((row) => ({ at: row.created_at, code: row.error_code ?? 'unknown', status: row.status })),
    conversationsStarted: countAdminConversations(db, from),
    reportsGenerated: reportCalls,
    dailySeries: series.map((row) => ({ day: row.day, requests: row.requests, tokens: row.tokens ?? 0, costUsd: row.cost ?? 0 })),
    note: 'These numbers contain no conversation text. The requests are part of the budget and of the Operations totals; the public assistant\'s statistics leave them out.',
  }
}
