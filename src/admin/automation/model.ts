import { ApiError } from '../api/client'
import { ACTION_STATUSES, ACTION_TYPES, type ActionStatus, type ActionType, type ListQuery } from '../api/automation'
import { analyticsText } from '../i18n/analytics'
import type { AutomationLanguage, AutomationText } from '../i18n/automation'

/**
 * What the automation screen computes from what the server sent (PROMPT 33): never a decision, only how to word a code, how to show a moment, and which filters live in the address. The server
 * decides what exists, who may see it and what may be done; this only lays it out.
 */

/** A code the dictionary has no sentence for, made readable (never shown as a raw key). */
export const humanize = (code: string): string => {
  const words = code.replace(/[._-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const word = (map: Record<string, string>, code: string): string => map[code] ?? humanize(code)

const LOCALE: Record<AutomationLanguage, string> = { hu: 'hu-HU', en: 'en-GB', nl: 'nl-NL' }

/** A moment in the administrator's own time zone, in the screen's language. */
export function moment(iso: string | null, language: AutomationLanguage): string {
  if (iso === null) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(LOCALE[language], { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

/** The words for a project's or a quote request's status: the dashboard's own dictionary already has them in all three languages (one place, one wording). */
export const statusWord = (language: AutomationLanguage, code: string): string => word(analyticsText(language).keys as Record<string, string>, code)

/** The sentence for a change's value: a few fixed words ("today", "now") are translated, a status code gets its word, anything else (a date range) is shown as it is. */
export function valueWord(t: AutomationText, language: AutomationLanguage, field: string, value: string | null): string {
  if (value === null) return '—'
  if (field === 'status') return statusWord(language, value)
  return (t.values as Record<string, string>)[value] ?? value
}

/** What to tell the administrator about a failed request: the server's reason code in the screen's language, else a plain sentence for the kind of failure. Never a technical message. */
export function errorSentence(t: AutomationText, error: unknown): string {
  if (!(error instanceof ApiError)) return t.errors.generic
  const reason = typeof error.details.reason === 'string' ? error.details.reason : null
  if (reason !== null) {
    const failure = (t.failures as Record<string, string>)[reason]
    if (failure) return failure
    const known = (t.errors as Record<string, string>)[reason]
    if (known) return known
  }
  if (error.fields.secondConfirmation) return t.errors.secondConfirmation
  if (error.status === 403) return t.errors.forbidden
  if (error.status === 404) return t.errors.notFound
  return t.errors.generic
}

// ---- the filters in the address ---------------------------------------------------------------------------------------------------

export type Tab = 'pending' | 'history' | 'catalog'
export const TABS: readonly Tab[] = ['pending', 'history', 'catalog']

export interface Filters {
  status: string
  type: string
  admin: string
  target: string
  from: string
  to: string
  page: number
}

export const DEFAULT_FILTERS: Filters = { status: '', type: '', admin: '', target: '', from: '', to: '', page: 1 }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const REFERENCE_PART = /^[A-Za-z0-9._-]{1,64}$/
const ADMIN_ID = /^[A-Za-z0-9-]{8,64}$/

/** The filters an address holds: each one only if it is a value the server would accept (a hand-edited address cannot ask for anything odd). */
export function readFilters(params: URLSearchParams): { tab: Tab; filters: Filters } {
  const tab = TABS.find((candidate) => candidate === params.get('tab')) ?? 'pending'
  const status = params.get('status') ?? ''
  const type = params.get('type') ?? ''
  const page = Number(params.get('page') ?? '1')
  return {
    tab,
    filters: {
      status: (ACTION_STATUSES as readonly string[]).includes(status) ? status : '',
      type: (ACTION_TYPES as readonly string[]).includes(type) ? type : '',
      admin: ADMIN_ID.test(params.get('admin') ?? '') ? (params.get('admin') as string) : '',
      target: REFERENCE_PART.test(params.get('target') ?? '') ? (params.get('target') as string) : '',
      from: DAY.test(params.get('from') ?? '') ? (params.get('from') as string) : '',
      to: DAY.test(params.get('to') ?? '') ? (params.get('to') as string) : '',
      page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
    },
  }
}

export function writeFilters(tab: Tab, filters: Filters): URLSearchParams {
  const params = new URLSearchParams()
  if (tab !== 'pending') params.set('tab', tab)
  for (const key of ['status', 'type', 'admin', 'target', 'from', 'to'] as const) if (filters[key] !== '') params.set(key, filters[key])
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

/** The query the server is asked: the tab decides which statuses, unless a status is chosen. */
export function queryFor(tab: Exclude<Tab, 'catalog'>, filters: Filters): ListQuery {
  return { tab, ...(filters.status ? { status: filters.status } : {}), ...(filters.type ? { type: filters.type } : {}), ...(filters.admin ? { admin: filters.admin } : {}), ...(filters.target ? { target: filters.target } : {}), ...(filters.from ? { from: filters.from } : {}), ...(filters.to ? { to: filters.to } : {}), page: filters.page, pageSize: 20 }
}

export const isFinal = (status: ActionStatus): boolean => ['completed', 'rejected', 'expired', 'cancelled', 'failed'].includes(status)
export const typeName = (t: AutomationText, type: ActionType): string => (t.types as Record<string, { name: string }>)[type]?.name ?? humanize(type)

/** The page of a proposal in the administration, from a reference the server made. */
export const ACTION_PATH = /^\/automation\/ACT-[A-Z0-9]{8}$/
export const REFERENCE = /^ACT-[A-Z0-9]{8}$/
