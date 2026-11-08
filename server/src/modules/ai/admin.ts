import type { AppContext, SessionInfo } from '../../context.ts'
import { addMs, DAY } from '../../lib/time.ts'
import { can, requirePermission } from '../auth/permissions.ts'
import { spent } from './budget.ts'
import { availability, loadSettings, RANGES } from './settings.ts'
import { dayOf } from './store.ts'

/**
 * What the administration shows of the assistant: real numbers read from what was recorded, privacy-conscious aggregates (no
 * conversation text, no visitor identity), and the settings in force. Nothing here is estimated except the cost, which is the
 * reported token counts times the configured prices and says so.
 */

export type Range = 'daily' | 'weekly' | 'monthly'
const RANGES_DAYS: Record<Range, number> = { daily: 30, weekly: 84, monthly: 365 }

export function parseRange(value: string | null): Range {
  return value === 'weekly' || value === 'monthly' ? value : 'daily'
}

const startOf = (app: AppContext, range: Range): string => dayOf(addMs(app.clock.now(), -(RANGES_DAYS[range] - 1) * DAY))

interface DayRow {
  day: string
  requests: number
  failed: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number | null
}

export function usageOverview(app: AppContext, rangeValue: string | null) {
  const range = parseRange(rangeValue)
  const from = startOf(app, range)
  const totals = app.db.get<{ requests: number; failed: number; inputTokens: number | null; outputTokens: number | null; cost: number | null; latency: number | null; firstToken: number | null; toolCalls: number | null; measured: number }>(
    `SELECT COUNT(*) AS requests,
            SUM(CASE WHEN status IN ('failed', 'abandoned') THEN 1 ELSE 0 END) AS failed,
            SUM(COALESCE(input_tokens, 0)) AS inputTokens, SUM(COALESCE(output_tokens, 0)) AS outputTokens,
            SUM(COALESCE(actual_cost_usd, reserved_cost_usd)) AS cost,
            AVG(CASE WHEN status = 'completed' THEN latency_ms END) AS latency,
            AVG(CASE WHEN status = 'completed' THEN first_token_ms END) AS firstToken,
            SUM(tool_calls) AS toolCalls,
            SUM(CASE WHEN cost_source = 'provider_usage' THEN 1 ELSE 0 END) AS measured
       FROM ai_requests WHERE day >= ?`,
    [from],
  )
  const conversations = app.db.get<{ n: number; planner: number; quotes: number; avgSeconds: number | null }>(
    `SELECT COUNT(*) AS n,
            SUM(CASE WHEN planner_completed_at IS NOT NULL THEN 1 ELSE 0 END) AS planner,
            SUM(CASE WHEN quote_reference IS NOT NULL THEN 1 ELSE 0 END) AS quotes,
            AVG(CASE WHEN message_count > 1 THEN (julianday(updated_at) - julianday(created_at)) * 86400 END) AS avgSeconds
       FROM ai_conversations WHERE created_at >= ?`,
    [`${from}T00:00:00.000Z`],
  )
  const topics = app.db.all<{ topic: string; n: number }>('SELECT topic, COUNT(*) AS n FROM ai_conversations WHERE created_at >= ? GROUP BY topic ORDER BY n DESC', [`${from}T00:00:00.000Z`])
  const tools = app.db.all<{ tool: string; calls: number; failed: number; avgMs: number | null }>(
    `SELECT tool, COUNT(*) AS calls, SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS failed, AVG(duration_ms) AS avgMs FROM ai_tool_calls WHERE day >= ? GROUP BY tool ORDER BY calls DESC`,
    [from],
  )
  const errors = app.db.all<{ code: string; n: number }>("SELECT COALESCE(error_code, 'unknown') AS code, COUNT(*) AS n FROM ai_requests WHERE day >= ? AND status IN ('failed', 'abandoned', 'aborted') GROUP BY code ORDER BY n DESC", [from])
  return {
    range,
    from,
    conversations: conversations?.n ?? 0,
    requests: totals?.requests ?? 0,
    failedRequests: totals?.failed ?? 0,
    inputTokens: totals?.inputTokens ?? 0,
    outputTokens: totals?.outputTokens ?? 0,
    estimatedCostUsd: totals?.cost ?? 0,
    /** How many of the requests have a cost that comes from token counts the provider reported (the rest are reservations or estimates). */
    requestsWithReportedUsage: totals?.measured ?? 0,
    averageResponseMs: totals?.latency === null || totals?.latency === undefined ? null : Math.round(totals.latency),
    averageFirstTokenMs: totals?.firstToken === null || totals?.firstToken === undefined ? null : Math.round(totals.firstToken),
    toolCalls: totals?.toolCalls ?? 0,
    tools: tools.map((row) => ({ tool: row.tool, calls: row.calls, failed: row.failed, averageMs: row.avgMs === null ? null : Math.round(row.avgMs) })),
    topics,
    errors,
    plannerCompleted: conversations?.planner ?? 0,
    quoteRequestsSent: conversations?.quotes ?? 0,
    averageConversationSeconds: conversations?.avgSeconds === null || conversations?.avgSeconds === undefined ? null : Math.round(conversations.avgSeconds),
  }
}

/** Per day, week (starting Monday) or month, zero where nothing happened, so a chart's axis is honest. */
export function usageSeries(app: AppContext, rangeValue: string | null) {
  const range = parseRange(rangeValue)
  const from = startOf(app, range)
  const rows = app.db.all<DayRow>(
    `SELECT day, COUNT(*) AS requests, SUM(CASE WHEN status IN ('failed', 'abandoned') THEN 1 ELSE 0 END) AS failed,
            SUM(COALESCE(input_tokens, 0)) AS inputTokens, SUM(COALESCE(output_tokens, 0)) AS outputTokens,
            SUM(COALESCE(actual_cost_usd, reserved_cost_usd)) AS costUsd, AVG(latency_ms) AS latencyMs
       FROM ai_requests WHERE day >= ? GROUP BY day ORDER BY day`,
    [from],
  )
  const conversations = app.db.all<{ day: string; n: number }>('SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM ai_conversations WHERE created_at >= ? GROUP BY day', [`${from}T00:00:00.000Z`])
  const byDay = new Map(rows.map((row) => [row.day, row]))
  const conversationsByDay = new Map(conversations.map((row) => [row.day, row.n]))

  const bucketOf = (day: string): string => {
    if (range === 'daily') return day
    if (range === 'monthly') return day.slice(0, 7)
    const date = new Date(`${day}T00:00:00.000Z`)
    const back = (date.getUTCDay() + 6) % 7
    return dayOf(new Date(date.getTime() - back * DAY))
  }
  const buckets = new Map<string, { bucket: string; requests: number; failed: number; inputTokens: number; outputTokens: number; costUsd: number; conversations: number }>()
  for (let i = 0; i < RANGES_DAYS[range]; i += 1) {
    const day = dayOf(addMs(app.clock.now(), -(RANGES_DAYS[range] - 1 - i) * DAY))
    const key = bucketOf(day)
    const entry = buckets.get(key) ?? { bucket: key, requests: 0, failed: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, conversations: 0 }
    const row = byDay.get(day)
    if (row) {
      entry.requests += row.requests
      entry.failed += row.failed
      entry.inputTokens += row.inputTokens
      entry.outputTokens += row.outputTokens
      entry.costUsd += row.costUsd
    }
    entry.conversations += conversationsByDay.get(day) ?? 0
    buckets.set(key, entry)
  }
  return { range, points: [...buckets.values()] }
}

/** The page: settings in force, where today and this month stand against their budgets, the knowledge sources, and a month of numbers. */
export function summaryOf(app: AppContext, session: SessionInfo | null) {
  const actor = requirePermission(session, 'system:read')
  const settings = loadSettings(app)
  const now = app.clock.now()
  const used = spent(app, now)
  return {
    model: { id: app.config.ai.model, provider: 'Anthropic', changeableBy: 'the operator, in the server environment (ANTHROPIC_MODEL)' },
    apiKey: app.config.ai.apiKey ? 'set' : 'missing',
    operatorEnabled: app.config.ai.enabled,
    availability: availability(app, settings),
    settings,
    ranges: RANGES,
    canWrite: can(actor.role, 'system:write'),
    budget: {
      day: { spentUsd: used.dayCostUsd, budgetUsd: settings.dailyBudgetUsd, tokens: used.dayTokens, tokenBudget: settings.dailyTokenBudget, requests: used.dayRequests, requestLimit: settings.dailyRequests },
      month: { spentUsd: used.monthCostUsd, budgetUsd: settings.monthlyBudgetUsd },
    },
    pricing: { inputPerMTok: settings.priceInputPerMTok, outputPerMTok: settings.priceOutputPerMTok, asOf: settings.pricesAsOf, note: 'Costs shown are estimates: the token counts the provider reported times these prices. They are not a bill.' },
    knowledge: app.assistant.knowledge.status(),
    overview: usageOverview(app, 'daily'),
  }
}
