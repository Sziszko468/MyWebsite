import type { AppContext } from '../../context.ts'
import { newId, hmacHex } from '../../lib/crypto.ts'
import { isRecord } from '../../lib/text.ts'
import { iso } from '../../lib/time.ts'
import { getSetting, setSetting } from '../system/settings.ts'
import { AI_MODEL_ID } from './model.ts'

/**
 * The evidence that the assistant may run: whether the required model was verified, against which key and address, and when.
 *
 * "Verified" means a connection test (or nothing else) got an answer in which the PROVIDER named Claude Haiku 5.5 as the model
 * that produced it. The record is bound to a keyed fingerprint of (model identifier, provider address, API key): a different
 * key or address is a different account or route, so the earlier proof no longer counts and the assistant stays unavailable
 * until the test is run again. The fingerprint is a one-way keyed hash; the key itself is never stored.
 *
 * A request answered by anything but the required model (or a provider that says the model does not exist) turns the record
 * to `failed` on the spot. Only a new successful test turns it back; the administrator's activation switch is separate and is
 * never changed by a test.
 */

const KEY = 'ai.verification'
const ERROR_KEY = 'ai.lastError'

export type VerificationStatus = 'unverified' | 'verified' | 'failed'

export interface Verification {
  status: VerificationStatus
  /** The identifier the record is about (always the required one for a record this code wrote). */
  modelId: string | null
  /** What the provider reported in the test (or in the request that broke the verification). */
  reportedModel: string | null
  checkedAt: string | null
  verifiedAt: string | null
  /** A code (see `FailureReason`), when failed. */
  reason: string | null
  fingerprint: string | null
}

const EMPTY: Verification = { status: 'unverified', modelId: null, reportedModel: null, checkedAt: null, verifiedAt: null, reason: null, fingerprint: null }

/** Why a verification (or a request) failed: codes the administration words and a visitor never sees. */
export type FailureReason =
  | 'no_api_key'
  | 'model_lock'
  | 'invalid_key'
  | 'billing'
  | 'permission'
  | 'model_not_found'
  | 'model_mismatch'
  | 'model_unreported'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'network'
  | 'timeout'
  | 'provider_error'

/** The provider address the assistant talks to (a host, for display and for the record; never a key). */
export function endpointOf(app: AppContext): string {
  const base = app.config.ai.baseUrl
  if (!base) return 'api.anthropic.com'
  try {
    return new URL(base).host
  } catch {
    return 'custom'
  }
}

/** A keyed one-way fingerprint of what the proof is about, or null without a key. */
export function fingerprintOf(app: AppContext): string | null {
  const { apiKey, baseUrl } = app.config.ai
  if (!apiKey) return null
  return hmacHex(app.config.appSecret, `ai-verification|${AI_MODEL_ID}|${baseUrl ?? 'default'}|${apiKey}`)
}

export function readVerification(app: AppContext): Verification {
  const raw = getSetting(app.db, KEY)
  if (!raw) return { ...EMPTY }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return { ...EMPTY }
    const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
    const status = parsed.status === 'verified' || parsed.status === 'failed' ? parsed.status : 'unverified'
    return { status, modelId: text(parsed.modelId), reportedModel: text(parsed.reportedModel), checkedAt: text(parsed.checkedAt), verifiedAt: text(parsed.verifiedAt), reason: text(parsed.reason), fingerprint: text(parsed.fingerprint) }
  } catch {
    return { ...EMPTY }
  }
}

/** True only for a proof about the required model, made with the key and address that are configured now. */
export function isVerified(app: AppContext, record: Verification = readVerification(app)): boolean {
  const fingerprint = fingerprintOf(app)
  return record.status === 'verified' && record.modelId === AI_MODEL_ID && record.reportedModel === AI_MODEL_ID && fingerprint !== null && record.fingerprint === fingerprint
}

/** `stale`: a proof exists but was made with another key or address. */
export function verificationLabel(app: AppContext, record: Verification = readVerification(app)): VerificationStatus | 'stale' {
  if (record.status === 'verified' && !isVerified(app, record)) return 'stale'
  return record.status
}

function write(app: AppContext, record: Verification, actorId: string | null): void {
  setSetting(app.db, app.clock, KEY, JSON.stringify(record), actorId)
}

/** A connection test (or any other first-hand evidence) showed that the required model answered. */
export function recordVerified(app: AppContext, reportedModel: string, actorId: string | null): void {
  const now = iso(app.clock.now())
  write(app, { status: 'verified', modelId: AI_MODEL_ID, reportedModel, checkedAt: now, verifiedAt: now, reason: null, fingerprint: fingerprintOf(app) }, actorId)
}

/** The model could not be verified, or a request showed it is not the required one: the assistant is unavailable from now on. */
export function recordFailed(app: AppContext, reason: FailureReason, reportedModel: string | null, actorId: string | null): void {
  const before = readVerification(app)
  write(app, { status: 'failed', modelId: AI_MODEL_ID, reportedModel, checkedAt: iso(app.clock.now()), verifiedAt: before.verifiedAt, reason, fingerprint: fingerprintOf(app) }, actorId)
}

export interface LastError {
  at: string
  source: 'chat' | 'test'
  code: string
}

/** The most recent error the provider (or the model lock) produced: a code and a time, never a provider message. */
export function recordLastError(app: AppContext, source: LastError['source'], code: string): void {
  setSetting(app.db, app.clock, ERROR_KEY, JSON.stringify({ at: iso(app.clock.now()), source, code } satisfies LastError), null)
}

export function readLastError(app: AppContext): LastError | null {
  const raw = getSetting(app.db, ERROR_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isRecord(parsed) && typeof parsed.at === 'string' && typeof parsed.code === 'string' && (parsed.source === 'chat' || parsed.source === 'test')) return { at: parsed.at, source: parsed.source, code: parsed.code }
  } catch {
    // fall through
  }
  return null
}

// ---- the history of connection tests --------------------------------------------------------------------------------------

export interface ConnectionTestRow {
  id: string
  created_at: string
  actor_id: string | null
  outcome: 'verified' | 'failed'
  reason: string | null
  requested_model: string
  reported_model: string | null
  endpoint: string
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
}

export function saveConnectionTest(app: AppContext, row: Omit<ConnectionTestRow, 'id' | 'created_at'>): ConnectionTestRow {
  const full: ConnectionTestRow = { id: newId(), created_at: iso(app.clock.now()), ...row }
  app.db.run(
    `INSERT INTO ai_connection_tests (id, created_at, actor_id, outcome, reason, requested_model, reported_model, endpoint, latency_ms, input_tokens, output_tokens, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [full.id, full.created_at, full.actor_id, full.outcome, full.reason, full.requested_model, full.reported_model, full.endpoint, full.latency_ms, full.input_tokens, full.output_tokens, full.cost_usd],
  )
  return full
}

export const recentConnectionTests = (app: AppContext, limit = 10): ConnectionTestRow[] => app.db.all<ConnectionTestRow>('SELECT * FROM ai_connection_tests ORDER BY created_at DESC, rowid DESC LIMIT ?', [limit])

export const lastSuccessfulTest = (app: AppContext): ConnectionTestRow | null => app.db.get<ConnectionTestRow>("SELECT * FROM ai_connection_tests WHERE outcome = 'verified' ORDER BY created_at DESC, rowid DESC LIMIT 1") ?? null
