import type { Language } from '../../i18n/config'

/**
 * What the administration reads and writes about the AI assistant (server/src/modules/ai/admin.ts, settings.ts), and the few
 * pure functions its screen needs. The numbers shown are the ones the server recorded; the cost is an estimate (reported token
 * counts times the configured prices) and the screen says so.
 */

export type AiRange = 'daily' | 'weekly' | 'monthly'
export const AI_RANGES: readonly AiRange[] = ['daily', 'weekly', 'monthly']

export interface AiSettings {
  /** The administrator's activation. It is changed only by the activation switch on the Model tab (never with the other settings). */
  enabled: boolean
  plannerEnabled: boolean
  quoteEnabled: boolean
  languages: Language[]
  maxInputChars: number
  maxHistoryMessages: number
  maxConversationMessages: number
  maxOutputTokens: number
  maxToolCalls: number
  maxRequestsPerSession: number
  maxRequestsPerIp: number
  maxDailyConversations: number
  dailyRequests: number
  dailyTokenBudget: number
  dailyBudgetUsd: number
  monthlyBudgetUsd: number
  alertPercent: number
  conversationMaxHours: number
  retentionDays: number
  effort: 'low' | 'medium' | 'high'
  thinking: 'adaptive' | 'disabled'
  priceInputPerMTok: number
  priceOutputPerMTok: number
  pricesAsOf: string
  welcome: Record<Language, string>
  suggestions: Record<Language, string[]>
}

export type Unavailable = 'operator_disabled' | 'admin_disabled' | 'no_api_key' | 'model_lock' | 'model_unverified'

export interface AiOverview {
  range: AiRange
  from: string
  conversations: number
  requests: number
  failedRequests: number
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  requestsWithReportedUsage: number
  averageResponseMs: number | null
  averageFirstTokenMs: number | null
  toolCalls: number
  tools: { tool: string; calls: number; failed: number; averageMs: number | null }[]
  topics: { topic: string; n: number }[]
  errors: { code: string; n: number }[]
  plannerCompleted: number
  quoteRequestsSent: number
  averageConversationSeconds: number | null
}

export interface AiPoint {
  bucket: string
  requests: number
  failed: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  conversations: number
}

export type ConnectionStatus = 'connected' | 'not_tested' | 'failed' | 'stale' | 'no_key' | 'model_lock'
export type BudgetState = 'ok' | 'warning' | 'exhausted'
export type AlertKind =
  | 'cost_day_warning'
  | 'cost_day_exhausted'
  | 'cost_month_warning'
  | 'cost_month_exhausted'
  | 'tokens_day_warning'
  | 'tokens_day_exhausted'
  | 'requests_day_warning'
  | 'requests_day_exhausted'
  | 'model_unverified'
  | 'model_mismatch'
  | 'model_not_found'
  | 'provider_auth'
  | 'provider_billing'

export interface AiAlert {
  id: string
  kind: AlertKind
  level: 'info' | 'warning' | 'critical'
  period: string
  detail: { used?: number; limit?: number; percent?: number; reason?: string; reported?: string | null } | null
  createdAt: string
  acknowledgedAt: string | null
}

export interface AiConnectionTest {
  id: string
  at: string
  outcome: 'verified' | 'failed'
  reason: string | null
  reportedModel: string | null
  latencyMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  costUsd: number | null
}

/** What the connection test answered: codes, identifiers and numbers only; `message` is the server's safe English sentence. */
export interface AiTestResult {
  ok: boolean
  outcome: 'verified' | 'failed'
  reason: string | null
  message: string
  requestedModel: string
  reportedModel: string | null
  endpoint: string
  latencyMs: number | null
  usage: { inputTokens: number; outputTokens: number } | null
  estimatedCostUsd: number | null
  testedAt: string
}

export interface AiSummary {
  /** The required model. `id` is the configured identifier; it cannot be edited here (`editable` is always false). */
  model: { requiredName: string; id: string; provider: string; editable: false; changeableBy: string; overrideRejected: boolean }
  connection: {
    status: ConnectionStatus
    endpoint: string
    keyConfigured: boolean
    verification: { status: 'unverified' | 'verified' | 'failed' | 'stale'; reportedModel: string | null; checkedAt: string | null; verifiedAt: string | null; reason: string | null }
    lastSuccessfulTest: { at: string; latencyMs: number | null; reportedModel: string | null } | null
    lastError: { at: string; source: 'chat' | 'test'; code: string } | null
    tests: AiConnectionTest[]
  }
  /** Why the assistant cannot be switched on yet (null: it can). */
  activation: { blocker: Unavailable | null }
  totals: { requests: number; modelVerifiedRequests: number; modelUnreportedRequests: number; modelMismatchedRequests: number; tokens: number; estimatedCostUsd: number; monthTokens: number }
  alerts: { open: number; items: AiAlert[] }
  apiKey: 'set' | 'missing'
  operatorEnabled: boolean
  availability: { available: true } | { available: false; reason: Unavailable }
  settings: AiSettings
  ranges: Record<string, [number, number]>
  canWrite: boolean
  budget: {
    day: { spentUsd: number; budgetUsd: number; tokens: number; tokenBudget: number; requests: number; requestLimit: number; state: BudgetState }
    month: { spentUsd: number; budgetUsd: number; state: BudgetState }
    alertPercent: number
  }
  pricing: { inputPerMTok: number; outputPerMTok: number; asOf: string; note: string }
  knowledge: {
    fingerprint: string
    builds: number
    lastBuiltAt: string | null
    sources: {
      projects: { published: number; total: number }
      services: { published: number }
      packages: { published: number }
      addOns: { published: number }
      comparison: { published: boolean }
      fullExperience: { published: boolean }
      developerProfile: { available: boolean; nameSet: boolean }
    }
  }
  overview: AiOverview
}

export interface AiUsage extends AiOverview {
  series: { range: AiRange; points: AiPoint[] }
}

/** The settings form's state: numbers as the text in their boxes, the chips as one line each. */
export interface AiForm {
  plannerEnabled: boolean
  quoteEnabled: boolean
  languages: Language[]
  numbers: Record<NumericSetting, string>
  effort: AiSettings['effort']
  thinking: AiSettings['thinking']
  pricesAsOf: string
  welcome: Record<Language, string>
  suggestions: Record<Language, string>
}

export const NUMERIC_SETTINGS = [
  'dailyBudgetUsd',
  'monthlyBudgetUsd',
  'alertPercent',
  'dailyTokenBudget',
  'dailyRequests',
  'maxDailyConversations',
  'maxRequestsPerSession',
  'maxRequestsPerIp',
  'maxInputChars',
  'maxHistoryMessages',
  'maxConversationMessages',
  'maxOutputTokens',
  'maxToolCalls',
  'conversationMaxHours',
  'retentionDays',
  'priceInputPerMTok',
  'priceOutputPerMTok',
] as const
export type NumericSetting = (typeof NUMERIC_SETTINGS)[number]

export function formFrom(settings: AiSettings): AiForm {
  return {
    plannerEnabled: settings.plannerEnabled,
    quoteEnabled: settings.quoteEnabled,
    languages: [...settings.languages],
    numbers: Object.fromEntries(NUMERIC_SETTINGS.map((key) => [key, String(settings[key])])) as Record<NumericSetting, string>,
    effort: settings.effort,
    thinking: settings.thinking,
    pricesAsOf: settings.pricesAsOf,
    welcome: { ...settings.welcome },
    suggestions: { hu: settings.suggestions.hu.join('\n'), en: settings.suggestions.en.join('\n'), nl: settings.suggestions.nl.join('\n') },
  }
}

/** The body of the save: every field, numbers parsed (an empty or non-numeric box becomes `null`, which the server refuses with the field named). */
export function payloadFrom(form: AiForm): Record<string, unknown> {
  const numbers = Object.fromEntries(
    NUMERIC_SETTINGS.map((key) => {
      const text = form.numbers[key].trim().replace(',', '.')
      const value = text === '' ? Number.NaN : Number(text)
      return [key, Number.isFinite(value) ? value : null]
    }),
  )
  const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean)
  // Not `enabled`: switching the assistant on or off is its own action (it needs a verified model), so saving other settings can never do it.
  return {
    plannerEnabled: form.plannerEnabled,
    quoteEnabled: form.quoteEnabled,
    languages: form.languages,
    ...numbers,
    effort: form.effort,
    thinking: form.thinking,
    pricesAsOf: form.pricesAsOf.trim(),
    welcome: form.welcome,
    suggestions: { hu: lines(form.suggestions.hu), en: lines(form.suggestions.en), nl: lines(form.suggestions.nl) },
  }
}

export const sameForm = (a: AiForm, b: AiForm): boolean => JSON.stringify(a) === JSON.stringify(b)

/** A share of a budget, 0 to 1, for a bar. A budget of zero is "nothing may be spent": full as soon as anything has been. */
export const share = (used: number, budget: number): number => (budget <= 0 ? (used > 0 ? 1 : 0) : Math.min(1, used / budget))

/** US dollars with the precision the amounts need (a request costs a fraction of a cent). */
export function dollars(value: number, language: 'hu' | 'en'): string {
  const digits = value === 0 ? 2 : value < 0.01 ? 5 : value < 1 ? 4 : 2
  return new Intl.NumberFormat(language === 'hu' ? 'hu-HU' : 'en-GB', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

export function duration(seconds: number | null, language: 'hu' | 'en'): string {
  if (seconds === null) return '–'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes === 0) return `${rest} ${language === 'hu' ? 'mp' : 's'}`
  return `${minutes} ${language === 'hu' ? 'perc' : 'min'} ${rest} ${language === 'hu' ? 'mp' : 's'}`
}
