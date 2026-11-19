import type { Currency } from '../quotes/money.ts'
import type { Span } from './period.ts'

/**
 * The shapes the analytics send (PROMPT 32). Every number is one of three kinds and says so:
 *   - `actual`:   a stored fact counted or summed (a count of rows with a timestamp in the period, a sum of stored minor units);
 *   - `derived`:  arithmetic or a fixed rule applied to stored facts (an average, a rate, "overdue" = a date that has passed);
 *   - `estimate`: something that is not a stored fact (the AI cost: reported tokens times configured prices — never an invoice).
 * A metric that cannot be known is `unavailable` with a reason, or `not_permitted` for this role — NEVER a zero: zero is a number the data produced.
 */

export type Kind = 'actual' | 'derived' | 'estimate'
export type State = 'available' | 'unavailable' | 'not_permitted'
/** `period`: compared with the previous equivalent period; `snapshot`: the situation now (no stored history to compare with); `none`: nothing to compare. */
export type Comparison = 'period' | 'snapshot' | 'none'

export interface Metric {
  id: string
  kind: Kind
  state: State
  value: number | null
  previous: number | null
  change: number | null
  /** `null` when the previous value is zero or unknown (a percentage of nothing is not a number). */
  changePercent: number | null
  comparison: Comparison
  /** A code for why it is unavailable (`no_payment_data`, `stored_as_text`, `not_permitted`…). */
  reason: string | null
  /** The page of the administration that lists the records behind the number (relative to `/admin`). */
  drill: string | null
}

const round1 = (value: number): number => Math.round(value * 10) / 10

export function flow(id: string, kind: Kind, value: number, previous: number | null, drill: string | null = null): Metric {
  const change = previous === null ? null : round1(value - previous)
  return { id, kind, state: 'available', value, previous, change, changePercent: previous === null || previous === 0 ? null : round1(((value - previous) / previous) * 100), comparison: previous === null ? 'none' : 'period', reason: null, drill }
}

export function snapshot(id: string, kind: Kind, value: number, drill: string | null = null): Metric {
  return { id, kind, state: 'available', value, previous: null, change: null, changePercent: null, comparison: 'snapshot', reason: null, drill }
}

export const unavailable = (id: string, reason: string): Metric => ({ id, kind: 'actual', state: 'unavailable', value: null, previous: null, change: null, changePercent: null, comparison: 'none', reason, drill: null })
export const notPermitted = (id: string): Metric => ({ id, kind: 'actual', state: 'not_permitted', value: null, previous: null, change: null, changePercent: null, comparison: 'none', reason: 'not_permitted', drill: null })

/** A sum of money, one line per currency: EUR and HUF are never added, and an amount is whole minor units. */
export interface MoneyLine {
  currency: Currency
  /** Whole minor units (cents for EUR, forints for HUF). */
  minor: number
  previousMinor: number | null
  /** How many quotations carry an amount in this sum / how many there are in all. */
  priced: number
  count: number
}

export interface MoneyMetric {
  id: string
  kind: Kind
  state: State
  comparison: Comparison
  lines: MoneyLine[]
  /** Quotations that count but carry no figure (a price described in words): reported, never valued. */
  withoutAmount: number
  reason: string | null
  drill: string | null
}

export const moneyUnavailable = (id: string, reason: string): MoneyMetric => ({ id, kind: 'actual', state: 'unavailable', comparison: 'none', lines: [], withoutAmount: 0, reason, drill: null })
export const moneyNotPermitted = (id: string): MoneyMetric => ({ id, kind: 'actual', state: 'not_permitted', comparison: 'none', lines: [], withoutAmount: 0, reason: 'not_permitted', drill: null })

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
  /** `accepted`: for the interest lists, how many of the requests that asked for it were followed by an accepted quotation. */
  items: Array<{ key: string; value: number; drill?: string | null; accepted?: number }>
}

export interface Filters {
  currency: Currency | null
  language: 'hu' | 'en' | 'nl' | null
  service: string | null
  packageCode: string | null
  projectStatus: string | null
  quoteStatus: string | null
  consultationStatus: string | null
  /** The language the catalogue names are given in (a display choice, not a filter). */
  lang: 'hu' | 'en' | 'nl'
}

export interface Meta {
  generatedAt: string
  period: Span & { preset: string; zone: string; today: string }
  previous: Span | null
  currencyNote: 'never_summed_across_currencies'
}

export type SectionName = 'executive' | 'financial' | 'customers' | 'funnel' | 'projects' | 'consultations' | 'communication' | 'ai' | 'alerts'
export const SECTIONS: readonly SectionName[] = ['executive', 'financial', 'customers', 'funnel', 'projects', 'consultations', 'communication', 'ai', 'alerts']

export interface Notice {
  /** A code the screen words: what the system does not store, or what a number does not mean. */
  code: string
}

export interface Section {
  name: SectionName
  state: State
  metrics: Metric[]
  money: MoneyMetric[]
  series: Series[]
  distributions: Distribution[]
  tables: Array<{ id: string; columns: string[]; rows: Array<Array<string | number | null>> }>
  limitations: string[]
  /** Only some sections add their own shape (the funnel's stages, the alerts' list). */
  extra?: Record<string, unknown>
}

export const emptySection = (name: SectionName, state: State = 'available'): Section => ({ name, state, metrics: [], money: [], series: [], distributions: [], tables: [], limitations: [] })
