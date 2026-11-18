import { AI_CEILING_ENV, AI_CEILING_KEYS, LANGUAGES, type AiSettings, type Language } from '../../config.ts'
import type { AppContext, SessionInfo } from '../../context.ts'
import { HttpError, validationFailed, type FieldCode, type FieldErrors } from '../../http/errors.ts'
import { isRecord } from '../../lib/text.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { getSetting, setSetting } from '../system/settings.ts'
import { isVerified } from './verification.ts'

/**
 * The assistant's settings as an administrator can change them. The environment (config.ts) gives the starting values; what is
 * saved here (one JSON value in `settings`) wins, field by field, and a saved value that is no longer acceptable (a limit
 * lowered in a later version, a hand-edited row) falls back to the starting value instead of breaking the assistant. The
 * model, the API key and the provider's address are not settings: the operator sets them in the environment.
 */

const KEY = 'ai.settings'

/** The accepted range of every numeric setting; the environment uses the same ones (config.ts). */
export const RANGES = {
  maxInputChars: [100, 8000],
  maxHistoryMessages: [2, 100],
  maxConversationMessages: [4, 400],
  maxOutputTokens: [200, 16000],
  maxToolCalls: [1, 20],
  maxRequestsPerSession: [1, 2000],
  maxRequestsPerIp: [1, 2000],
  maxConcurrentRequests: [1, 200],
  maxDailyConversations: [1, 100000],
  dailyRequests: [1, 1000000],
  dailyTokenBudget: [1000, 1_000_000_000],
  dailyBudgetUsd: [0, 100000],
  monthlyBudgetUsd: [0, 1000000],
  alertPercent: [1, 100],
  conversationMaxHours: [1, 720],
  retentionDays: [1, 365],
  priceInputPerMTok: [0, 1000],
  priceOutputPerMTok: [0, 1000],
} as const satisfies Partial<Record<keyof AiSettings, readonly [number, number]>>

type NumericKey = keyof typeof RANGES
const INTEGERS: ReadonlySet<NumericKey> = new Set(['maxInputChars', 'maxHistoryMessages', 'maxConversationMessages', 'maxOutputTokens', 'maxToolCalls', 'maxRequestsPerSession', 'maxRequestsPerIp', 'maxConcurrentRequests', 'maxDailyConversations', 'dailyRequests', 'dailyTokenBudget', 'alertPercent', 'conversationMaxHours', 'retentionDays'])
const BOOLEANS = ['enabled', 'plannerEnabled', 'discoveryEnabled', 'quoteEnabled'] as const

/**
 * What the administration can NEVER change (PROMPT 29): the prices that turn tokens into cost. A price of 0 would switch every budget off, so
 * they come from the price list in code (pricing.ts) or, for the operator, the environment. A saved value for them (an old row, a
 * hand-edited one) is ignored, and a request that sends one is refused as unknown.
 */
export const OPERATOR_ONLY = ['priceInputPerMTok', 'priceOutputPerMTok', 'pricesAsOf'] as const

export const WELCOME_MAX = 400
export const SUGGESTION_MAX = 80
export const SUGGESTIONS_MAX = 8

interface Checked {
  value: Partial<AiSettings>
  errors: FieldErrors
}

/** Checks the fields that are present in `input`; absent fields are left to the starting values. */
function check(input: Record<string, unknown>): Checked {
  const value: Partial<AiSettings> = {}
  const errors: FieldErrors = {}
  const fail = (field: string, code: FieldCode) => void (errors[field] ??= code)

  for (const field of BOOLEANS) {
    if (!(field in input)) continue
    if (typeof input[field] === 'boolean') value[field] = input[field] as boolean
    else fail(field, 'invalid')
  }
  for (const field of Object.keys(RANGES) as NumericKey[]) {
    if (!(field in input)) continue
    const raw = input[field]
    const [min, max] = RANGES[field]
    if (typeof raw !== 'number' || !Number.isFinite(raw) || (INTEGERS.has(field) && !Number.isInteger(raw))) fail(field, 'invalid')
    else if (raw < min) fail(field, 'tooShort')
    else if (raw > max) fail(field, 'tooLong')
    else (value as Record<string, unknown>)[field] = raw
  }
  if ('languages' in input) {
    const raw = input.languages
    if (!Array.isArray(raw) || raw.length === 0 || raw.some((item) => typeof item !== 'string' || !(LANGUAGES as readonly string[]).includes(item))) fail('languages', 'invalid')
    else value.languages = LANGUAGES.filter((language) => raw.includes(language))
  }
  if ('effort' in input) {
    if (input.effort === 'low' || input.effort === 'medium' || input.effort === 'high') value.effort = input.effort
    else fail('effort', 'invalid')
  }
  if ('thinking' in input) {
    if (input.thinking === 'adaptive' || input.thinking === 'disabled') value.thinking = input.thinking
    else fail('thinking', 'invalid')
  }
  if ('pricesAsOf' in input) {
    if (typeof input.pricesAsOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.pricesAsOf)) value.pricesAsOf = input.pricesAsOf
    else fail('pricesAsOf', 'invalid')
  }
  if ('welcome' in input) {
    const raw = input.welcome
    if (!isRecord(raw)) fail('welcome', 'invalid')
    else {
      const welcome: Record<Language, string> = { hu: '', en: '', nl: '' }
      for (const language of LANGUAGES) {
        const text = raw[language]
        if (text === undefined) continue
        if (typeof text !== 'string') fail(`welcome.${language}`, 'invalid')
        else if (text.trim().length > WELCOME_MAX) fail(`welcome.${language}`, 'tooLong')
        else welcome[language] = text.trim()
      }
      value.welcome = welcome
    }
  }
  if ('suggestions' in input) {
    const raw = input.suggestions
    if (!isRecord(raw)) fail('suggestions', 'invalid')
    else {
      const suggestions: Record<Language, string[]> = { hu: [], en: [], nl: [] }
      for (const language of LANGUAGES) {
        const list = raw[language]
        if (list === undefined) continue
        if (!Array.isArray(list)) fail(`suggestions.${language}`, 'invalid')
        else if (list.length > SUGGESTIONS_MAX) fail(`suggestions.${language}`, 'tooMany')
        else if (list.some((item) => typeof item !== 'string' || item.trim().length === 0 || item.trim().length > SUGGESTION_MAX)) fail(`suggestions.${language}`, 'invalid')
        else suggestions[language] = (list as string[]).map((item) => item.trim())
      }
      value.suggestions = suggestions
    }
  }
  return { value, errors }
}

function stored(app: AppContext): Record<string, unknown> {
  const raw = getSetting(app.db, KEY)
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** The settings in force: the environment's starting values with the saved ones laid over them (invalid saved values are ignored). */
export function loadSettings(app: AppContext): AiSettings {
  return applyCeilings(app, loadSettingsFrom(app, stored(app)))
}

/** A value above the operator's hard ceiling is applied as the ceiling, whatever was saved (and whenever the ceiling was lowered). */
function applyCeilings(app: AppContext, settings: AiSettings): AiSettings {
  for (const key of AI_CEILING_KEYS) if (settings[key] > app.config.ai.ceilings[key]) settings[key] = app.config.ai.ceilings[key]
  return settings
}

/** `field → new value` for what changed, short enough for the audit log's detail column (texts are named, not copied). */
function changeDetail(before: AiSettings, after: AiSettings): Record<string, string> | null {
  const detail: Record<string, string> = {}
  let size = 0
  for (const key of Object.keys(after) as Array<keyof AiSettings>) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue
    const scalar = typeof after[key] === 'number' || typeof after[key] === 'boolean' || typeof after[key] === 'string'
    const entry = scalar ? `${String(before[key])} → ${String(after[key])}` : 'changed'
    size += key.length + entry.length + 8
    if (size > 440) {
      detail.more = 'and others'
      break
    }
    detail[key] = entry
  }
  return Object.keys(detail).length > 0 ? detail : null
}

/** What the administration may change; a partial body changes only the fields it names. */
export function saveSettings(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): AiSettings {
  const actor = requirePermission(session, 'system:write')
  const { value, errors } = check(body)
  const unknown = Object.keys(body).filter((field) => !(field in app.config.ai.defaults) || (OPERATOR_ONLY as readonly string[]).includes(field))
  for (const field of unknown) errors[field] = 'unknown'
  // The operator's hard ceilings: a value above one is refused (not silently lowered), so the administrator sees what the limit is.
  for (const key of AI_CEILING_KEYS) {
    const wanted = value[key]
    if (typeof wanted === 'number' && wanted > app.config.ai.ceilings[key]) errors[key] = 'tooLong'
  }
  if (Object.keys(errors).length > 0) throw validationFailed(errors, Object.keys(errors).some((field) => (AI_CEILING_KEYS as readonly string[]).includes(field) && errors[field] === 'tooLong') ? `A value is above the ceiling the operator set in the environment (${AI_CEILING_KEYS.map((key) => AI_CEILING_ENV[key]).join(', ')}).` : undefined)
  // Switching the assistant ON is the administrator's own decision and needs proof: the required model verified for this key and
  // address (a connection test). Switching it off is always allowed.
  const before = loadSettings(app).enabled
  if (value.enabled === true && !before) {
    const blocker = activationBlocker(app)
    if (blocker) throw new HttpError(409, 'conflict', 'The assistant cannot be switched on until the required model is verified.', { details: { reason: 'verification_required', cause: blocker } })
  }
  const merged = { ...stored(app), ...value }
  // Monetary budgets are coherent only when the day does not exceed the month.
  const effective = applyCeilings(app, loadSettingsFrom(app, merged))
  if (effective.dailyBudgetUsd > effective.monthlyBudgetUsd) throw validationFailed({ dailyBudgetUsd: 'tooLong' }, 'The daily budget cannot be larger than the monthly budget.')
  const previous = loadSettings(app)
  setSetting(app.db, app.clock, KEY, JSON.stringify(merged), actor.userId)
  const after = loadSettings(app)
  // EVERY change of the configuration is recorded (who, when, which field, old → new); activation has its own, clearer entry as well.
  const detail = changeDetail(previous, after)
  if (detail) audit(app, actor, 'ai.settings.update', 'ai_settings', null, detail)
  if (after.enabled !== before) audit(app, actor, after.enabled ? 'ai.activate' : 'ai.deactivate', 'ai_settings', null)
  return after
}

/** The starting values with the saved ones laid over them, one field at a time (so one bad field costs only itself). */
function loadSettingsFrom(app: AppContext, saved: Record<string, unknown>): AiSettings {
  const merged: AiSettings = structuredClone(app.config.ai.defaults)
  for (const [field, raw] of Object.entries(saved)) {
    if ((OPERATOR_ONLY as readonly string[]).includes(field)) continue
    const { value, errors } = check({ [field]: raw })
    if (Object.keys(errors).length === 0) Object.assign(merged, value)
  }
  return merged
}

export type Unavailable = 'operator_disabled' | 'admin_disabled' | 'no_api_key' | 'key_malformed' | 'model_lock' | 'model_unverified'

/**
 * Whether the assistant can answer at all, and if not, why. In this order: the operator's master switch, the administrator's
 * activation, the key, the model lock (a leftover `ANTHROPIC_MODEL` naming another model), and the verification that the
 * REQUIRED model answers for the configured key and address. Nothing else can make the assistant available: there is no
 * "try another model" state.
 */
export function availability(app: AppContext, settings: AiSettings = loadSettings(app)): { available: true } | { available: false; reason: Unavailable } {
  if (!app.config.ai.enabled) return { available: false, reason: 'operator_disabled' }
  if (!settings.enabled) return { available: false, reason: 'admin_disabled' }
  if (app.config.ai.keyProblem === 'malformed') return { available: false, reason: 'key_malformed' }
  if (!app.config.ai.apiKey) return { available: false, reason: 'no_api_key' }
  if (app.config.ai.modelOverride !== null) return { available: false, reason: 'model_lock' }
  if (!isVerified(app)) return { available: false, reason: 'model_unverified' }
  return { available: true }
}

/** Why the assistant cannot be switched on yet (null: it can). Used by the activation switch; a visitor never sees these. */
export function activationBlocker(app: AppContext): Unavailable | null {
  if (!app.config.ai.enabled) return 'operator_disabled'
  if (app.config.ai.keyProblem === 'malformed') return 'key_malformed'
  if (!app.config.ai.apiKey) return 'no_api_key'
  if (app.config.ai.modelOverride !== null) return 'model_lock'
  if (!isVerified(app)) return 'model_unverified'
  return null
}

/** The part of the reason a visitor is told: that the required model could not be verified (the other reasons stay private). */
export const publicReason = (state: ReturnType<typeof availability>): 'model' | null => (!state.available && (state.reason === 'model_unverified' || state.reason === 'model_lock') ? 'model' : null)

/** What the browser is told: whether to offer the assistant, in which languages, and the texts the administrator chose. No limit, price or key. */
export function publicConfig(app: AppContext): Record<string, unknown> {
  const settings = loadSettings(app)
  const state = availability(app, settings)
  return {
    available: state.available,
    // 'model': the administrator switched the assistant on but the required model could not be verified (the visitor is told so).
    unavailableReason: publicReason(state),
    languages: settings.languages,
    plannerEnabled: settings.plannerEnabled,
    discoveryEnabled: settings.plannerEnabled && settings.discoveryEnabled,
    quoteEnabled: settings.quoteEnabled,
    maxInputChars: settings.maxInputChars,
    retentionDays: settings.retentionDays,
    welcome: settings.welcome,
    suggestions: settings.suggestions,
  }
}
