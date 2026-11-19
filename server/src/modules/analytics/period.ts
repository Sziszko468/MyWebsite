import { validationFailed } from '../../http/errors.ts'

/**
 * Reporting periods in the business time zone (PROMPT 32).
 *
 * A period is a run of local calendar days `[from, to]` (both inclusive, `YYYY-MM-DD`). It is turned into a half-open interval of UTC instants `[fromUtc, toUtc)` whose edges are
 * the local midnights, using the zone's offset AT that midnight, so a day with a daylight-saving change is 23 or 25 hours long and nothing is silently mixed between UTC and
 * local time. Timestamp columns (ISO-8601 UTC strings) are compared with the instants; date-only columns (`due_on`, `started_on`) are compared with the local days.
 *
 * The previous equivalent period is the previous calendar unit for the calendar presets (month-to-date and year-to-date are compared with the same number of elapsed days of the
 * previous month/year) and the same number of days immediately before for rolling and custom ranges.
 */

export const PRESETS = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days', 'this_month', 'previous_month', 'this_year', 'previous_year', 'custom'] as const
export type Preset = (typeof PRESETS)[number]

export const MAX_CUSTOM_DAYS = 1830

export interface Span {
  from: string
  to: string
  fromUtc: string
  toUtc: string
  days: number
}

export interface Period extends Span {
  preset: Preset
  zone: string
  /** `null` when there is nothing valid to compare with (a custom range that would reach before the year 2000). */
  previous: Span | null
  /** The local day it is now in the zone (what "today" and "overdue" mean). */
  today: string
}

const DAY = 86_400_000
const DAY_FORMAT = /^\d{4}-\d{2}-\d{2}$/

const asUtc = (day: string): number => Date.parse(`${day}T00:00:00Z`)
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
export const addDays = (day: string, days: number): string => dayOf(asUtc(day) + days * DAY)
export const daysBetween = (from: string, to: string): number => Math.round((asUtc(to) - asUtc(from)) / DAY)

export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_FORMAT.test(value)) return false
  const ms = asUtc(value)
  return Number.isFinite(ms) && dayOf(ms) === value
}

/** Whether the zone name is one the runtime knows. */
export function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** The zone's offset from UTC, in milliseconds, at an instant. */
function offsetAt(zone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(instant / 1000) * 1000
}

/** The instant at which a local calendar day begins in the zone. */
export function startOfLocalDay(day: string, zone: string): string {
  const guess = asUtc(day)
  const first = offsetAt(zone, guess)
  let instant = guess - first
  const second = offsetAt(zone, instant)
  if (second !== first) instant = guess - second
  return new Date(instant).toISOString()
}

/** The local calendar day an instant falls on in the zone. */
export function localDay(instant: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function span(from: string, to: string, zone: string): Span {
  return { from, to, fromUtc: startOfLocalDay(from, zone), toUtc: startOfLocalDay(addDays(to, 1), zone), days: daysBetween(from, to) + 1 }
}

const monthStart = (day: string): string => `${day.slice(0, 7)}-01`
const addMonths = (first: string, months: number): string => {
  const date = new Date(asUtc(first))
  date.setUTCMonth(date.getUTCMonth() + months, 1)
  return dayOf(date.getTime())
}
const monthEnd = (first: string): string => addDays(addMonths(first, 1), -1)
const yearStart = (day: string): string => `${day.slice(0, 4)}-01-01`
const addYears = (first: string, years: number): string => `${String(Number(first.slice(0, 4)) + years).padStart(4, '0')}-01-01`

export interface PeriodInput {
  period?: string | null
  from?: string | null
  to?: string | null
}

/** Resolves what a request asked for; anything that is not a known preset or a valid range is a validation error (never a silent default for a wrong value). */
export function resolvePeriod(input: PeriodInput, now: Date, zone: string): Period {
  const today = localDay(now, zone)
  const preset = (input.period ?? 'last_30_days') as Preset
  if (!(PRESETS as readonly string[]).includes(preset)) throw validationFailed({ period: 'invalid' })
  let current: { from: string; to: string }
  let previous: { from: string; to: string } | null
  const rolling = (days: number) => {
    const from = addDays(today, -(days - 1))
    return { current: { from, to: today }, previous: { from: addDays(from, -days), to: addDays(from, -1) } }
  }
  if (preset === 'today') ({ current, previous } = rolling(1))
  else if (preset === 'yesterday') {
    const day = addDays(today, -1)
    current = { from: day, to: day }
    previous = { from: addDays(day, -1), to: addDays(day, -1) }
  } else if (preset === 'last_7_days') ({ current, previous } = rolling(7))
  else if (preset === 'last_30_days') ({ current, previous } = rolling(30))
  else if (preset === 'last_90_days') ({ current, previous } = rolling(90))
  else if (preset === 'this_month') {
    const first = monthStart(today)
    const before = addMonths(first, -1)
    const elapsed = daysBetween(first, today)
    const end = addDays(before, elapsed)
    current = { from: first, to: today }
    previous = { from: before, to: end > monthEnd(before) ? monthEnd(before) : end }
  } else if (preset === 'previous_month') {
    const first = addMonths(monthStart(today), -1)
    const before = addMonths(first, -1)
    current = { from: first, to: monthEnd(first) }
    previous = { from: before, to: monthEnd(before) }
  } else if (preset === 'this_year') {
    const first = yearStart(today)
    const before = addYears(first, -1)
    const elapsed = daysBetween(first, today)
    const end = addDays(before, elapsed)
    const yearEnd = addDays(first, -1)
    current = { from: first, to: today }
    previous = { from: before, to: end > yearEnd ? yearEnd : end }
  } else if (preset === 'previous_year') {
    const first = addYears(yearStart(today), -1)
    const before = addYears(first, -1)
    current = { from: first, to: addDays(addYears(first, 1), -1) }
    previous = { from: before, to: addDays(first, -1) }
  } else {
    if (!validDay(input.from) || !validDay(input.to)) throw validationFailed({ from: validDay(input.from) ? undefined : 'invalid', to: validDay(input.to) ? undefined : 'invalid' } as never)
    if (input.from > input.to) throw validationFailed({ to: 'invalid' })
    const days = daysBetween(input.from, input.to) + 1
    if (days > MAX_CUSTOM_DAYS) throw validationFailed({ to: 'tooLong' })
    if (input.from < '2000-01-01' || input.to > addDays(today, 366)) throw validationFailed({ from: 'invalid' })
    current = { from: input.from, to: input.to }
    previous = { from: addDays(input.from, -days), to: addDays(input.from, -1) }
  }
  if (previous && previous.from < '2000-01-01') previous = null
  return { preset, zone, today, ...span(current.from, current.to, zone), previous: previous ? span(previous.from, previous.to, zone) : null }
}

export interface Bucket {
  key: string
  /** The first local day of the bucket (clipped to the period). */
  from: string
  to: string
  fromUtc: string
  toUtc: string
}

/** The buckets a time series is drawn in: local days for up to 62 days, local calendar months for longer ranges (the first and last clipped to the period). */
export function bucketsOf(period: Span, zone: string): { granularity: 'day' | 'month'; buckets: Bucket[] } {
  const buckets: Bucket[] = []
  if (period.days <= 62) {
    for (let day = period.from; day <= period.to; day = addDays(day, 1)) buckets.push({ key: day, from: day, to: day, ...pair(day, day, zone) })
    return { granularity: 'day', buckets }
  }
  let first = monthStart(period.from)
  while (first <= period.to) {
    const from = first < period.from ? period.from : first
    const end = monthEnd(first)
    const to = end > period.to ? period.to : end
    buckets.push({ key: first.slice(0, 7), from, to, ...pair(from, to, zone) })
    first = addMonths(first, 1)
  }
  return { granularity: 'month', buckets }
}

function pair(from: string, to: string, zone: string): { fromUtc: string; toUtc: string } {
  const s = span(from, to, zone)
  return { fromUtc: s.fromUtc, toUtc: s.toUtc }
}
