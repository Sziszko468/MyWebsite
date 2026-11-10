import type { LanguageModel } from 'ai'
import type { AppContext } from '../../context.ts'
import { iso } from '../../lib/time.ts'
import { audit } from '../system/audit.ts'
import { raiseProviderAlert } from './alerts.ts'
import { costOf } from './budget.ts'
import { AI_MODEL_ID, ModelLockError, ModelObservation } from './model.ts'
import { loadSettings } from './settings.ts'
import { endpointOf, recordFailed, recordLastError, recordVerified, saveConnectionTest, type FailureReason } from './verification.ts'

/**
 * The server-side connection test: ONE minimal request to the required model, made with the server's own key and address, that
 * answers three questions, in this order:
 *
 *   1. Is a key configured, and is the model lock intact (no leftover `ANTHROPIC_MODEL` naming another model)?
 *   2. Does the provider accept the request for the required model with this key (reachable, key valid, account allowed to use it,
 *      model exists)?
 *   3. Does the provider's own reply name the required model as the one that answered? Only then is the model VERIFIED.
 *
 * The outcome is written to the history of tests and to the verification record; failures also raise an administration alert.
 * A successful test NEVER switches the assistant on: the administrator does that separately. The result carries codes, numbers
 * and identifiers: never the key, never the provider's message (which may quote a request).
 */

export interface ConnectionResult {
  ok: boolean
  outcome: 'verified' | 'failed'
  reason: FailureReason | null
  /** A safe sentence for the administrator. */
  message: string
  requestedModel: string
  /** What the provider said answered (null: it said nothing, or the test never reached it). */
  reportedModel: string | null
  endpoint: string
  latencyMs: number | null
  usage: { inputTokens: number; outputTokens: number } | null
  estimatedCostUsd: number | null
  testedAt: string
}

const MESSAGES: Record<FailureReason | 'verified', string> = {
  verified: 'The provider answered and named Claude Haiku 5.5 as the model that produced the answer.',
  no_api_key: 'No API key is configured. Set ANTHROPIC_API_KEY in the server environment.',
  model_lock: 'The server environment names a different model (ANTHROPIC_MODEL). The model is fixed in code and that setting must be removed.',
  invalid_key: 'The provider rejected the API key.',
  billing: 'The provider refused the request because of the account balance or billing.',
  permission: 'The provider refused the request: this key is not allowed to use the required model.',
  model_not_found: 'The provider does not know the required model identifier. A developer must check it against the provider’s current model list.',
  model_mismatch: 'The provider answered with a model that is not the required one. The answer was discarded.',
  model_unreported: 'The provider answered but did not say which model produced the answer, so the model could not be verified.',
  rate_limited: 'The provider is rate limiting this key. Try again in a minute.',
  provider_unavailable: 'The provider is temporarily unavailable. Try again later.',
  network: 'The provider could not be reached from this server.',
  timeout: 'The provider did not answer in time.',
  provider_error: 'The provider returned an error. See the server log.',
}

/** The failure a provider error stands for (the same status mapping the chat uses, with the model-specific ones named). */
export function reasonOf(error: unknown): FailureReason {
  if (error instanceof ModelLockError) return 'model_mismatch'
  const e = error as { name?: string; statusCode?: number; status?: number; cause?: unknown; lastError?: unknown } | null
  if (e?.name === 'AI_RetryError' && e.lastError !== undefined && e.lastError !== error) return reasonOf(e.lastError)
  const status = e?.statusCode ?? e?.status
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return 'timeout'
  if (status === 401) return 'invalid_key'
  if (status === 402) return 'billing'
  if (status === 403) return 'permission'
  if (status === 404) return 'model_not_found'
  if (status === 429) return 'rate_limited'
  if (typeof status === 'number' && status >= 500) return 'provider_unavailable'
  if (typeof status === 'number' && status >= 400) return 'provider_error'
  if (e?.name === 'AI_RetryError' || e?.name === 'AI_APICallError') return 'network'
  return e?.cause ? 'network' : 'provider_error'
}

/** Which failures also raise an alert of their own (every failed test raises `model_unverified`). */
const SPECIFIC_ALERT: Partial<Record<FailureReason, 'model_mismatch' | 'model_not_found' | 'provider_auth' | 'provider_billing'>> = {
  invalid_key: 'provider_auth',
  permission: 'provider_auth',
  billing: 'provider_billing',
  model_not_found: 'model_not_found',
  model_mismatch: 'model_mismatch',
}

export async function runConnectionTest(app: AppContext, modelFor: (observation: ModelObservation) => Promise<LanguageModel>, actorId: string | null): Promise<ConnectionResult> {
  const settings = loadSettings(app)
  const endpoint = endpointOf(app)
  const observation = new ModelObservation()
  const started = performance.now()
  let reason: FailureReason | null = null
  let usage: ConnectionResult['usage'] = null

  if (!app.config.ai.apiKey) reason = 'no_api_key'
  else if (app.config.ai.modelOverride !== null) reason = 'model_lock'
  else {
    try {
      const { generateText } = await import('ai')
      const result = await generateText({
        model: await modelFor(observation),
        instructions: 'You are a connection test. Answer with one short sentence.',
        prompt: 'Reply with one short sentence to confirm you are reachable.',
        maxOutputTokens: 400,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(Math.min(app.config.ai.timeoutMs, 30_000)),
        providerOptions: { anthropic: { effort: 'low' } },
      })
      if (result.usage && (result.usage.inputTokens !== undefined || result.usage.outputTokens !== undefined)) usage = { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 }
      if (observation.reported === null) reason = 'model_unreported'
    } catch (error) {
      reason = reasonOf(error)
      app.log.warn('assistant connection test failed', { reason, error: error instanceof Error ? { name: error.name } : 'unknown' })
    }
  }

  const latencyMs = reason === 'no_api_key' || reason === 'model_lock' ? null : Math.round(performance.now() - started)
  const outcome = reason === null ? 'verified' : 'failed'
  const costUsd = usage ? costOf(usage, settings) : null
  saveConnectionTest(app, { actor_id: actorId, outcome, reason, requested_model: AI_MODEL_ID, reported_model: observation.reported, endpoint, latency_ms: latencyMs, input_tokens: usage?.inputTokens ?? null, output_tokens: usage?.outputTokens ?? null, cost_usd: costUsd })

  if (reason === null) {
    recordVerified(app, observation.reported ?? AI_MODEL_ID, actorId)
  } else {
    recordFailed(app, reason, observation.reported, actorId)
    recordLastError(app, 'test', reason)
    raiseProviderAlert(app, 'model_unverified', { reason })
    const specific = SPECIFIC_ALERT[reason]
    if (specific) raiseProviderAlert(app, specific, { reason, reported: observation.mismatch })
  }
  audit(app, actorId ? { userId: actorId } : null, 'ai.connection_test', 'ai_settings', null, { outcome, reason })

  return {
    ok: reason === null,
    outcome,
    reason,
    message: MESSAGES[reason ?? 'verified'],
    requestedModel: AI_MODEL_ID,
    reportedModel: observation.reported,
    endpoint,
    latencyMs,
    usage,
    estimatedCostUsd: costUsd,
    testedAt: iso(app.clock.now()),
  }
}
