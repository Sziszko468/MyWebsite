import { ApiError, get, queryString } from './client'

/**
 * The business analytics endpoints (`/api/admin/analytics`, server/src/modules/analytics). The screen only READS: every number was counted by the server from stored records, and the
 * shapes below are what the server sends (a metric says what kind of number it is and whether it exists; money comes per currency in whole minor units and is never added across
 * currencies). The screen never adds money, never computes a rate and never fills a gap: what it shows is what is here.
 */

export type AnalyticsLanguage = 'hu' | 'en' | 'nl'
export const ANALYTICS_LANGUAGES: readonly AnalyticsLanguage[] = ['hu', 'en', 'nl']

export const SECTION_NAMES = ['executive', 'financial', 'customers', 'funnel', 'projects', 'consultations', 'communication', 'ai', 'alerts'] as const
export type SectionName = (typeof SECTION_NAMES)[number]

export const PRESETS = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days', 'this_month', 'previous_month', 'this_year', 'previous_year', 'custom'] as const
export type Preset = (typeof PRESETS)[number]
/** The longest custom period the server accepts (days); the screen says so before asking. */
export const MAX_CUSTOM_DAYS = 1830

export type Kind = 'actual' | 'derived' | 'estimate'
export type State = 'available' | 'unavailable' | 'not_permitted'
export type Comparison = 'period' | 'snapshot' | 'none'
export type Currency = 'EUR' | 'HUF'

export interface Metric {
  id: string
  kind: Kind
  state: State
  value: number | null
  previous: number | null
  change: number | null
  changePercent: number | null
  comparison: Comparison
  reason: string | null
  /** A page of the administration (relative to `/admin`) that lists the records behind the number. */
  drill: string | null
}

export interface MoneyLine {
  currency: Currency
  /** Whole minor units (cents for EUR, forints for HUF). */
  minor: number
  previousMinor: number | null
  priced: number
  count: number
}

export interface MoneyMetric {
  id: string
  kind: Kind
  state: State
  comparison: Comparison
  lines: MoneyLine[]
  withoutAmount: number
  reason: string | null
  drill: string | null
}

export interface SeriesPoint {
  key: string
  from: string
  to: string
  value: number
}

export interface Series {
  id: string
  granularity: 'day' | 'month'
  unit: 'count' | 'minor' | 'usd' | 'days'
  currency?: Currency
  points: SeriesPoint[]
}

export interface Distribution {
  id: string
  total: number
  items: Array<{ key: string; value: number; drill?: string | null; accepted?: number }>
}

export interface Table {
  id: string
  columns: string[]
  rows: Array<Array<string | number | null>>
}

export interface FunnelStage {
  stage: string
  count: number
  conversionFromPrevious: number | null
  conversionFromReceived: number | null
  daysFromPrevious: number | null
}

export interface AlertItem {
  kind: string
  severity: 'high' | 'medium' | 'low'
  reason: string
  reference: string
  date: string
  nextAction: string
  path: string
}

export interface Section {
  name: SectionName
  state: State
  metrics: Metric[]
  money: MoneyMetric[]
  series: Series[]
  distributions: Distribution[]
  tables: Table[]
  limitations: string[]
  extra?: { cohort?: { from: string; to: string }; stages?: FunnelStage[]; items?: AlertItem[]; leftOut?: string[]; truncated?: boolean }
}

export interface Span {
  from: string
  to: string
  fromUtc: string
  toUtc: string
  days: number
}

export interface Meta {
  generatedAt: string
  period: Span & { preset: string; zone: string; today: string }
  previous: Span | null
  currencyNote: 'never_summed_across_currencies'
}

export interface Filters {
  currency: Currency | null
  language: AnalyticsLanguage | null
  service: string | null
  packageCode: string | null
  projectStatus: string | null
  quoteStatus: string | null
  consultationStatus: string | null
  lang: AnalyticsLanguage
}

export interface AnalyticsAnswer {
  meta: Meta
  filters: Filters
  access: { requests: boolean; clients: boolean; system: boolean }
  section: Section
}

/** What the screen asks for: the period and the filters, all optional (the server's defaults apply to what is left out). */
export interface AnalyticsQuery {
  period: Preset
  from?: string
  to?: string
  currency?: Currency
  language?: AnalyticsLanguage
  service?: string
  package?: string
  projectStatus?: string
  quoteStatus?: string
  consultationStatus?: string
  /** The language the catalogue names are given in. */
  lang?: AnalyticsLanguage
}

const BASE = '/api/admin/analytics'

export const analytics = {
  load: (section: SectionName, query: AnalyticsQuery, signal?: AbortSignal) => get<AnalyticsAnswer>(BASE, { query: { section, ...query }, signal }).then((answer) => answer.data),
}

/** A file the server made: its bytes (a CSV starts with a byte order mark, which only a Blob keeps) and the name it suggested. */
export interface Download {
  blob: Blob
  fileName: string
}

/** The same section as a CSV file. A plain `fetch` (the answer is a file, not the JSON envelope), same origin and cookie like every other call. */
export async function downloadCsv(section: SectionName, query: AnalyticsQuery, signal?: AbortSignal): Promise<Download> {
  let response: Response
  try {
    response = await fetch(`${BASE}/export${queryString({ report: section, ...query })}`, { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal, headers: { Accept: 'text/csv' } })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'network', 'The server could not be reached.')
  }
  if (!response.ok) throw new ApiError(response.status, response.status === 403 ? 'forbidden' : 'failed', `The server answered ${response.status}.`)
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename="([A-Za-z0-9._-]+)"/.exec(disposition)
  return { blob: await response.blob(), fileName: match?.[1] ?? `analytics-${section}.csv` }
}
