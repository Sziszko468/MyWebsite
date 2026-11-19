import type { Permission } from '../api/types'
import { ANALYTICS_LANGUAGES, MAX_CUSTOM_DAYS, PRESETS, SECTION_NAMES, type AnalyticsLanguage, type AnalyticsQuery, type Currency, type Metric, type Preset, type SectionName } from '../api/analytics'

/**
 * What the analytics screen decides, apart from drawing: which sections a role may open, what the filters are and how they live in the address (so a view can be shared and the back
 * button works), which filters mean something in which section, and how a figure is presented (its unit, its comparison). Nothing here computes a business figure.
 */

// ---- sections and permissions --------------------------------------------------------------------------------------------------------------

/** What a role must be able to read for a section to be offered (the server checks again on every request and answers `not_permitted` otherwise). */
export function canOpen(section: SectionName, can: (permission: Permission) => boolean): boolean {
  switch (section) {
    case 'executive':
      return can('requests:read') || can('clients:read') || can('system:read')
    case 'financial':
    case 'funnel':
    case 'consultations':
      return can('requests:read')
    case 'customers':
    case 'projects':
    case 'communication':
      return can('clients:read')
    case 'ai':
      return can('system:read')
    case 'alerts':
      return can('requests:read') || can('clients:read')
  }
}

export const sectionOf = (value: string | null): SectionName => (SECTION_NAMES as readonly string[]).includes(value ?? '') ? (value as SectionName) : 'executive'

// ---- filters -------------------------------------------------------------------------------------------------------------------------

export type FilterKey = 'currency' | 'language' | 'service' | 'package' | 'quoteStatus' | 'projectStatus' | 'consultationStatus'

/** Which filters each section honours (the server ignores a filter a section has no use for; the screen does not offer it). */
export const SECTION_FILTERS: Record<SectionName, readonly FilterKey[]> = {
  executive: ['language', 'projectStatus'],
  financial: ['currency', 'language', 'service', 'package', 'quoteStatus'],
  customers: ['language'],
  funnel: ['language', 'service', 'package'],
  projects: ['projectStatus'],
  consultations: ['language', 'consultationStatus'],
  communication: ['language'],
  ai: [],
  alerts: ['projectStatus'],
}

/** The filters that are set (in the address) but that this section does not use: the screen says so instead of dropping them silently. */
export function ignoredFilters(filters: FilterState, section: SectionName): FilterKey[] {
  const used = new Set<FilterKey>(SECTION_FILTERS[section])
  return (['currency', 'language', 'service', 'package', 'quoteStatus', 'projectStatus', 'consultationStatus'] as const).filter((key) => filters[key] !== '' && !used.has(key))
}

export const CURRENCY_OPTIONS: readonly Currency[] = ['EUR', 'HUF']
export const QUOTATION_STATUS_OPTIONS = ['draft', 'sent', 'accepted', 'declined', 'superseded', 'withdrawn'] as const
export const PROJECT_STATUS_OPTIONS = ['awaiting_start', 'discovery', 'planning', 'design', 'development', 'review', 'waiting_customer', 'finalization', 'completed', 'on_hold', 'cancelled'] as const
export const CONSULTATION_STATUS_OPTIONS = ['pending', 'confirmed', 'reschedule_requested', 'rescheduled', 'cancelled', 'completed', 'no_show'] as const

/** The same slug rule as the server's, so the screen never offers a value the server would refuse. */
export const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/

export interface FilterState {
  period: Preset
  from: string
  to: string
  currency: Currency | ''
  language: AnalyticsLanguage | ''
  service: string
  package: string
  quoteStatus: string
  projectStatus: string
  consultationStatus: string
}

export const DEFAULT_FILTERS: FilterState = { period: 'last_30_days', from: '', to: '', currency: '', language: '', service: '', package: '', quoteStatus: '', projectStatus: '', consultationStatus: '' }

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The filters as the address says them; anything that is not one of the known values is dropped (a hand-edited address can never ask for something odd). */
export function readFilters(params: URLSearchParams): FilterState {
  const get = (name: string) => params.get(name) ?? ''
  const pick = <T extends string>(name: string, allowed: readonly T[]): T | '' => (allowed as readonly string[]).includes(get(name)) ? (get(name) as T) : ''
  const slug = (name: string) => (SLUG.test(get(name)) ? get(name) : '')
  return {
    period: (PRESETS as readonly string[]).includes(get('period')) ? (get('period') as Preset) : DEFAULT_FILTERS.period,
    from: DAY.test(get('from')) ? get('from') : '',
    to: DAY.test(get('to')) ? get('to') : '',
    currency: pick('currency', CURRENCY_OPTIONS),
    language: pick('language', ANALYTICS_LANGUAGES),
    service: slug('service'),
    package: slug('package'),
    quoteStatus: pick('quoteStatus', QUOTATION_STATUS_OPTIONS),
    projectStatus: pick('projectStatus', PROJECT_STATUS_OPTIONS),
    consultationStatus: pick('consultationStatus', CONSULTATION_STATUS_OPTIONS),
  }
}

/** The address for these filters: only what differs from the default is written. */
export function writeFilters(filters: FilterState, section: SectionName): URLSearchParams {
  const params = new URLSearchParams()
  if (section !== 'executive') params.set('section', section)
  if (filters.period !== DEFAULT_FILTERS.period) params.set('period', filters.period)
  if (filters.period === 'custom') {
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
  }
  for (const key of ['currency', 'language', 'service', 'package', 'quoteStatus', 'projectStatus', 'consultationStatus'] as const) if (filters[key]) params.set(key, filters[key])
  return params
}

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1

/** Why a custom period cannot be asked for (the server would answer 422); `null` when it can. */
export function rangeProblem(filters: FilterState): 'missing' | 'order' | 'length' | null {
  if (filters.period !== 'custom') return null
  if (!filters.from || !filters.to) return 'missing'
  if (filters.from > filters.to) return 'order'
  return daysBetween(filters.from, filters.to) > MAX_CUSTOM_DAYS ? 'length' : null
}

/** The request for the server: the period, and only the filters this section honours. `lang` is the language the catalogue names come back in. */
export function queryFor(filters: FilterState, section: SectionName, language: AnalyticsLanguage): AnalyticsQuery {
  const keep = new Set<FilterKey>(SECTION_FILTERS[section])
  const query: AnalyticsQuery = { period: filters.period, lang: language }
  if (filters.period === 'custom') {
    query.from = filters.from
    query.to = filters.to
  }
  if (keep.has('currency') && filters.currency) query.currency = filters.currency
  if (keep.has('language') && filters.language) query.language = filters.language
  if (keep.has('service') && filters.service) query.service = filters.service
  if (keep.has('package') && filters.package) query.package = filters.package
  if (keep.has('quoteStatus') && filters.quoteStatus) query.quoteStatus = filters.quoteStatus
  if (keep.has('projectStatus') && filters.projectStatus) query.projectStatus = filters.projectStatus
  if (keep.has('consultationStatus') && filters.consultationStatus) query.consultationStatus = filters.consultationStatus
  return query
}

// ---- presenting a figure -------------------------------------------------------------------------------------------------------------------

export type Unit = 'count' | 'percent' | 'hours' | 'days' | 'usd'

/** The unit of a metric whose value is not a plain count. */
const UNITS: Record<string, Unit> = {
  bookingConversionRate: 'percent',
  milestoneCompletionRate: 'percent',
  aiBudgetDayPercent: 'percent',
  averageResponseHours: 'hours',
  averageProjectDurationDays: 'days',
  aiEstimatedCostUsdCombined: 'usd',
}
export const unitOf = (id: string): Unit => UNITS[id] ?? 'count'

/** Which series is the trend of which figure (both in the same section): a small line on the card, with the full chart and its table below. */
export const TREND_OF: Record<string, string> = {
  newCustomers: 'newCustomersSeries',
  quotationsSent: 'quotationsSentSeries',
  acceptedQuotations: 'quotationsAcceptedSeries',
  declinedQuotations: 'quotationsDeclinedSeries',
  completedProjects: 'completedProjectsSeries',
  consultationRequests: 'consultationRequestsSeries',
  messagesFromCustomers: 'messagesFromCustomersSeries',
  messagesFromAdministrators: 'messagesFromAdministratorsSeries',
  aiVisitorRequests: 'aiRequestsVisitorSeries',
  aiAdminRequests: 'aiRequestsAdminSeries',
  aiEstimatedCostUsdCombined: 'aiEstimatedCostSeries',
}

export type Direction = 'up' | 'down' | 'same'

/** The direction of the change since the previous period, only for a figure that is compared with one (a snapshot or an unavailable figure has none). */
export function directionOf(metric: Metric): Direction | null {
  if (metric.state !== 'available' || metric.comparison !== 'period' || metric.change === null) return null
  return metric.change > 0 ? 'up' : metric.change < 0 ? 'down' : 'same'
}

/** The distributions that are parts of one whole (so a ring is honest); every other one is a list of independent counts. */
export const PART_OF_WHOLE = new Set([
  'quotationsCreatedByStatus',
  'requestChannels',
  'customersByLanguage',
  'customersByStatus',
  'customersByOrigin',
  'tasksByStatus',
  'milestonesByStatus',
  'consultationsByStatus',
  'conversationsByStatus',
  'messagesByLanguage',
  'alertsBySeverity',
])

/** Several series drawn in one chart (parts of one picture), in the order they are drawn. A series of a group is not drawn on its own. */
export const SERIES_GROUPS: ReadonlyArray<{ id: 'quotationCounts' | 'messages' | 'aiRequests'; series: readonly string[]; mode: 'grouped' | 'stacked' }> = [
  { id: 'quotationCounts', series: ['quotationsSentSeries', 'quotationsAcceptedSeries', 'quotationsDeclinedSeries'], mode: 'grouped' },
  { id: 'messages', series: ['messagesFromCustomersSeries', 'messagesFromAdministratorsSeries'], mode: 'stacked' },
  { id: 'aiRequests', series: ['aiRequestsVisitorSeries', 'aiRequestsAdminSeries'], mode: 'stacked' },
]
