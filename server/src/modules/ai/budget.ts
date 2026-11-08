import type { AiSettings } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { HttpError, rateLimited } from '../../http/errors.ts'
import { RateLimiter } from '../../http/rateLimit.ts'
import { newId } from '../../lib/crypto.ts'
import { iso, MINUTE, HOUR } from '../../lib/time.ts'
import { dayOf, monthOf } from './store.ts'

/**
 * Cost control. Every model request is a row of `ai_requests` that is BORN as a reservation: before anything is sent to the
 * provider, one transaction (the database wrapper's are immediate and synchronous, so two requests cannot interleave) adds
 * up what the day and the month have used (a finished request at its reported cost, an unfinished one at the amount reserved
 * for it) and refuses the request when its worst case would take either over the budget. When the provider has answered the
 * reservation is reconciled with the token counts it reported; when it never answers, the reservation stays as the charge
 * until a sweep marks it abandoned (still counted: an unknown cost is never counted as zero).
 *
 * The cost is an ESTIMATE: reported tokens times the configured prices (settings.priceInputPerMTok / priceOutputPerMTok).
 * It is not a bill, and the administration says so.
 */

export interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
}

export const costOf = (usage: Pick<Usage, 'inputTokens' | 'outputTokens'>, settings: Pick<AiSettings, 'priceInputPerMTok' | 'priceOutputPerMTok'>): number =>
  (usage.inputTokens * settings.priceInputPerMTok + usage.outputTokens * settings.priceOutputPerMTok) / 1_000_000

/** A rough count for the reservation: four characters a token is the usual rule of thumb, rounded up and padded for non-English text. */
export const estimateTokens = (characters: number): number => Math.ceil(characters / 3)

/**
 * The worst case of one answer: every step may send the whole prompt again (the tools' results grow it) and write the
 * whole output limit. Deliberately generous; the real amount is reconciled afterwards.
 */
export function worstCase(settings: AiSettings, promptTokens: number): { tokens: number; costUsd: number } {
  const steps = Math.max(1, settings.maxToolCalls)
  const input = promptTokens * steps + 1500 * steps
  const output = settings.maxOutputTokens * steps
  return { tokens: input + output, costUsd: costOf({ inputTokens: input, outputTokens: output }, settings) }
}

export type RefusalReason = 'daily_budget' | 'monthly_budget' | 'daily_tokens' | 'daily_requests' | 'session_requests' | 'daily_conversations'

/** What a visitor is told (a friendly "not available now"): the specifics stay in the administration. */
export class BudgetRefusal extends HttpError {
  readonly reason: RefusalReason
  constructor(reason: RefusalReason) {
    super(reason === 'session_requests' ? 429 : 503, reason === 'session_requests' ? 'rate_limited' : 'service_unavailable', 'The assistant is not available right now.', {
      details: { reason },
      headers: { 'Retry-After': reason === 'daily_requests' || reason === 'daily_budget' || reason === 'daily_tokens' || reason === 'daily_conversations' ? '3600' : '600' },
    })
    this.reason = reason
  }
}

export interface Reservation {
  id: string
  reservedCostUsd: number
  reservedTokens: number
}

export interface ReserveInput {
  conversationId: string
  sessionId: string
  ipHash: string
  model: string
  promptTokens: number
  /** A new conversation counts against the daily number of conversations. */
  newConversation: boolean
}

/**
 * Spent so far today / this month: finished requests at their cost, unfinished ones at what was reserved. A request that failed
 * before the provider reported any usage costs nothing (finish() books it at 0), so it also counts no tokens: otherwise a provider
 * that is down would use up the day's token budget through retries while nothing was spent.
 */
export function spent(app: AppContext, now: Date): { dayCostUsd: number; monthCostUsd: number; dayTokens: number; dayRequests: number } {
  const day = dayOf(now)
  const month = monthOf(now)
  const row = app.db.get<{ dayCost: number | null; monthCost: number | null; dayTokens: number | null; dayRequests: number }>(
    `SELECT SUM(CASE WHEN day = ? THEN COALESCE(actual_cost_usd, reserved_cost_usd) END) AS dayCost,
            SUM(COALESCE(actual_cost_usd, reserved_cost_usd)) AS monthCost,
            SUM(CASE WHEN day = ? THEN CASE
                 WHEN status = 'failed' AND error_code IS NOT 'aborted' AND input_tokens IS NULL AND output_tokens IS NULL THEN 0
                 WHEN status = 'reserved' OR (input_tokens IS NULL AND output_tokens IS NULL) THEN reserved_tokens
                 ELSE COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0) END END) AS dayTokens,
            SUM(CASE WHEN day = ? THEN 1 ELSE 0 END) AS dayRequests
       FROM ai_requests WHERE day >= ?`,
    [day, day, day, `${month}-01`],
  )
  return { dayCostUsd: row?.dayCost ?? 0, monthCostUsd: row?.monthCost ?? 0, dayTokens: row?.dayTokens ?? 0, dayRequests: row?.dayRequests ?? 0 }
}

/** Checks every limit and, if all hold, writes the reservation: all in one transaction, so concurrent requests are counted one by one. */
export function reserve(app: AppContext, settings: AiSettings, input: ReserveInput): Reservation {
  const now = app.clock.now()
  const day = dayOf(now)
  const estimate = worstCase(settings, input.promptTokens)
  return app.db.transaction(() => {
    const used = spent(app, now)
    if (used.dayRequests >= settings.dailyRequests) throw new BudgetRefusal('daily_requests')
    if (used.dayTokens + estimate.tokens > settings.dailyTokenBudget) throw new BudgetRefusal('daily_tokens')
    if (used.dayCostUsd + estimate.costUsd > settings.dailyBudgetUsd) throw new BudgetRefusal('daily_budget')
    if (used.monthCostUsd + estimate.costUsd > settings.monthlyBudgetUsd) throw new BudgetRefusal('monthly_budget')
    if (input.newConversation) {
      const created = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ai_conversations WHERE created_at >= ?', [`${day}T00:00:00.000Z`])?.n ?? 0
      // The conversation row already exists (the caller created it before reserving); it counts itself.
      if (created > settings.maxDailyConversations) throw new BudgetRefusal('daily_conversations')
    }
    const sessionRequests = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ai_requests WHERE session_id = ? AND created_at >= ?', [input.sessionId, iso(new Date(now.getTime() - 24 * HOUR))])?.n ?? 0
    if (sessionRequests >= settings.maxRequestsPerSession) throw new BudgetRefusal('session_requests')

    const id = newId()
    app.db.run(
      `INSERT INTO ai_requests (id, conversation_id, session_id, ip_hash, model, status, reserved_cost_usd, reserved_tokens, day, created_at)
       VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?, ?, ?)`,
      [id, input.conversationId, input.sessionId, input.ipHash, input.model, estimate.costUsd, estimate.tokens, day, iso(now)],
    )
    app.db.run('UPDATE ai_sessions SET request_count = request_count + 1 WHERE id = ?', [input.sessionId])
    return { id, reservedCostUsd: estimate.costUsd, reservedTokens: estimate.tokens }
  })
}

export interface Outcome {
  status: 'completed' | 'failed' | 'aborted'
  usage: Usage | null
  steps: number
  toolCalls: number
  errorCode: string | null
  latencyMs: number
  firstTokenMs: number | null
}

/**
 * Reconciles a reservation. With token counts from the provider the cost is that (source `provider_usage`). Without them: a
 * request that failed before the provider answered cost nothing; an aborted or otherwise unreported one keeps its reservation
 * as an estimate, because a half-finished generation may still have been billed.
 */
export function finish(app: AppContext, settings: AiSettings, reservation: Reservation, outcome: Outcome): void {
  const now = app.clock.now()
  const usage = outcome.usage
  let cost: number
  let source: 'provider_usage' | 'estimate'
  if (usage) {
    cost = costOf(usage, settings)
    source = 'provider_usage'
  } else if (outcome.status === 'failed' && outcome.errorCode !== 'aborted') {
    cost = 0
    source = 'estimate'
  } else {
    cost = reservation.reservedCostUsd
    source = 'estimate'
  }
  app.db.run(
    `UPDATE ai_requests SET status = ?, actual_cost_usd = ?, cost_source = ?, input_tokens = ?, output_tokens = ?, cache_read_tokens = ?, cache_write_tokens = ?, reasoning_tokens = ?,
            steps = ?, tool_calls = ?, error_code = ?, latency_ms = ?, first_token_ms = ?, finished_at = ?
      WHERE id = ? AND status = 'reserved'`,
    [outcome.status, cost, source, usage?.inputTokens ?? null, usage?.outputTokens ?? null, usage?.cacheReadTokens ?? null, usage?.cacheWriteTokens ?? null, usage?.reasoningTokens ?? null, outcome.steps, outcome.toolCalls, outcome.errorCode, Math.round(outcome.latencyMs), outcome.firstTokenMs === null ? null : Math.round(outcome.firstTokenMs), iso(now), reservation.id],
  )
}

/** Marks reservations that never reconciled (a crash, a hung provider) abandoned; they keep counting at their reserved cost. */
export function sweepAbandoned(app: AppContext, olderThanMs = 15 * MINUTE): number {
  const cutoff = iso(new Date(app.clock.now().getTime() - olderThanMs))
  return app.db.run("UPDATE ai_requests SET status = 'abandoned', cost_source = 'estimate', error_code = 'abandoned', finished_at = ? WHERE status = 'reserved' AND created_at < ?", [iso(app.clock.now()), cutoff]).changes
}

// ---- the limit on one client address (in memory, like the website's other limits) -----------------------------------

const WINDOW_MS = 10 * MINUTE

/** Counts a model request against the client's address; the limit follows the setting, so the limiter is rebuilt when it changes. */
export class IpLimiter {
  private limiter: RateLimiter | null = null
  private max = 0
  private readonly app: AppContext

  constructor(app: AppContext) {
    this.app = app
  }

  check(ip: string, max: number): void {
    if (!this.app.config.rateLimitsEnabled) return
    if (!this.limiter || this.max !== max) {
      this.limiter = new RateLimiter(this.app.clock, WINDOW_MS, max)
      this.max = max
    }
    const result = this.limiter.hit(`ai:${ip}`)
    if (!result.allowed) throw rateLimited(result.retryAfterSeconds)
  }

  sweep(): void {
    this.limiter?.sweep()
  }
}
