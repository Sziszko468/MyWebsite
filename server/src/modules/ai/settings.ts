import { LANGUAGES, type AiSettings, type Language } from '../../config.ts'
import type { AppContext, SessionInfo } from '../../context.ts'
import { validationFailed, type FieldCode, type FieldErrors } from '../../http/errors.ts'
import { isRecord } from '../../lib/text.ts'
import { requirePermission } from '../auth/permissions.ts'
import { getSetting, setSetting } from '../system/settings.ts'

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
  maxDailyConversations: [1, 100000],
  dailyRequests: [1, 1000000],
  dailyTokenBudget: [1000, 1_000_000_000],
  dailyBudgetUsd: [0, 100000],
  monthlyBudgetUsd: [0, 1000000],
  conversationMaxHours: [1, 720],
  retentionDays: [1, 365],
  priceInputPerMTok: [0, 1000],
  priceOutputPerMTok: [0, 1000],
} as const satisfies Partial<Record<keyof AiSettings, readonly [number, number]>>

type NumericKey = keyof typeof RANGES
const INTEGERS: ReadonlySet<NumericKey> = new Set(['maxInputChars', 'maxHistoryMessages', 'maxConversationMessages', 'maxOutputTokens', 'maxToolCalls', 'maxRequestsPerSession', 'maxRequestsPerIp', 'maxDailyConversations', 'dailyRequests', 'dailyTokenBudget', 'conversationMaxHours', 'retentionDays'])
const BOOLEANS = ['enabled', 'plannerEnabled', 'quoteEnabled'] as const

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
  const defaults = app.config.ai.defaults
  const saved = stored(app)
  const merged: AiSettings = structuredClone(defaults)
  // A saved value is applied one field at a time, so one bad field costs only itself.
  for (const [field, raw] of Object.entries(saved)) {
    const { value, errors } = check({ [field]: raw })
    if (Object.keys(errors).length === 0) Object.assign(merged, value)
  }
  return merged
}

/** What the administration may change; a partial body changes only the fields it names. */
export function saveSettings(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): AiSettings {
  const actor = requirePermission(session, 'system:write')
  const { value, errors } = check(body)
  const unknown = Object.keys(body).filter((field) => !(field in app.config.ai.defaults))
  for (const field of unknown) errors[field] = 'unknown'
  if (Object.keys(errors).length > 0) throw validationFailed(errors)
  const merged = { ...stored(app), ...value }
  // Monetary budgets are coherent only when the day does not exceed the month.
  const effective = { ...loadSettingsFrom(app, merged) }
  if (effective.dailyBudgetUsd > effective.monthlyBudgetUsd) throw validationFailed({ dailyBudgetUsd: 'tooLong' }, 'The daily budget cannot be larger than the monthly budget.')
  setSetting(app.db, app.clock, KEY, JSON.stringify(merged), actor.userId)
  return loadSettings(app)
}

function loadSettingsFrom(app: AppContext, saved: Record<string, unknown>): AiSettings {
  const merged: AiSettings = structuredClone(app.config.ai.defaults)
  for (const [field, raw] of Object.entries(saved)) {
    const { value, errors } = check({ [field]: raw })
    if (Object.keys(errors).length === 0) Object.assign(merged, value)
  }
  return merged
}

export type Unavailable = 'operator_disabled' | 'admin_disabled' | 'no_api_key'

/** Whether the assistant can answer at all, and if not, why (the website only needs to know "not available"). */
export function availability(app: AppContext, settings: AiSettings = loadSettings(app)): { available: true } | { available: false; reason: Unavailable } {
  if (!app.config.ai.enabled) return { available: false, reason: 'operator_disabled' }
  if (!settings.enabled) return { available: false, reason: 'admin_disabled' }
  if (!app.config.ai.apiKey) return { available: false, reason: 'no_api_key' }
  return { available: true }
}

/** What the browser is told: whether to offer the assistant, in which languages, and the texts the administrator chose. No limit, price or key. */
export function publicConfig(app: AppContext): Record<string, unknown> {
  const settings = loadSettings(app)
  const state = availability(app, settings)
  return {
    available: state.available,
    languages: settings.languages,
    plannerEnabled: settings.plannerEnabled,
    quoteEnabled: settings.quoteEnabled,
    maxInputChars: settings.maxInputChars,
    retentionDays: settings.retentionDays,
    welcome: settings.welcome,
    suggestions: settings.suggestions,
  }
}
