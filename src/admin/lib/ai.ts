import type { Language } from '../../i18n/config'

/**
 * What the administration reads and writes about the AI assistant (server/src/modules/ai/admin.ts, settings.ts), and the few
 * pure functions its screen needs. The numbers shown are the ones the server recorded; the cost is an estimate (reported token
 * counts times the configured prices) and the screen says so.
 */

export type AiRange = 'daily' | 'weekly' | 'monthly'
export const AI_RANGES: readonly AiRange[] = ['daily', 'weekly', 'monthly']

export interface AiSettings {
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

export type Unavailable = 'operator_disabled' | 'admin_disabled' | 'no_api_key'

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

export interface AiSummary {
  model: { id: string; provider: string; changeableBy: string }
  apiKey: 'set' | 'missing'
  operatorEnabled: boolean
  availability: { available: true } | { available: false; reason: Unavailable }
  settings: AiSettings
  ranges: Record<string, [number, number]>
  canWrite: boolean
  budget: {
    day: { spentUsd: number; budgetUsd: number; tokens: number; tokenBudget: number; requests: number; requestLimit: number }
    month: { spentUsd: number; budgetUsd: number }
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
  enabled: boolean
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
    enabled: settings.enabled,
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
  return {
    enabled: form.enabled,
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
