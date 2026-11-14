import { LOCALE_TAGS, type Language } from '../i18n/config'

/**
 * Dates for the booking page. Two kinds of value, kept apart on purpose:
 *
 *   - an INSTANT (an ISO text with a `Z`, what the server sends): a point on the time line. It is shown with `Intl`, always in the zone the OWNER
 *     scheduled in (`timeZone`), never in the visitor's: the browser's own zone is not consulted anywhere on this page.
 *   - a DATE KEY (`2026-11-04`): a calendar day with no time and no zone, what a calendar cell is. Moving between keys is calendar arithmetic that knows
 *     nothing of clocks, so a 23 or 25 hour day is one day.
 *
 * A key is an identifier, not something shown to a person: whatever is shown is made by `Intl`.
 */

export type DateKey = string

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseKey(key: DateKey): { year: number; month: number; day: number } | null {
  const match = KEY.exec(key)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? { year, month, day } : null
}

function keyOf(date: Date): DateKey {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

const utc = (key: DateKey): Date => {
  const parts = parseKey(key)
  if (!parts) throw new RangeError(`Not a date: ${key}`)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
}

export const addDays = (key: DateKey, days: number): DateKey => keyOf(new Date(utc(key).getTime() + days * 86_400_000))

/** The first day of the month `months` after (or before) the one the date is in. */
export function addMonths(key: DateKey, months: number): DateKey {
  const parts = parseKey(key)
  if (!parts) throw new RangeError(`Not a date: ${key}`)
  return keyOf(new Date(Date.UTC(parts.year, parts.month - 1 + months, 1)))
}

export const firstOfMonth = (key: DateKey): DateKey => addMonths(key, 0)

/** The same day-of-month in another month, or the month's last day when it is shorter (31 January to 28 February). */
export function sameDayIn(month: DateKey, day: number): DateKey {
  const first = firstOfMonth(month)
  return addDays(first, Math.min(day, Number(lastOfMonth(first).slice(8))) - 1)
}

export function lastOfMonth(key: DateKey): DateKey {
  return addDays(addMonths(key, 1), -1)
}

/** 1 (Monday) to 7 (Sunday). */
export function isoWeekday(key: DateKey): number {
  const day = utc(key).getUTCDay()
  return day === 0 ? 7 : day
}

/** The month's calendar, Monday first: each week is seven cells, a day outside the month is `null`. */
export function monthWeeks(monthStart: DateKey): (DateKey | null)[][] {
  const first = firstOfMonth(monthStart)
  const last = lastOfMonth(first)
  const cells: (DateKey | null)[] = Array.from({ length: isoWeekday(first) - 1 }, () => null)
  for (let key = first; key <= last; key = addDays(key, 1)) cells.push(key)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (DateKey | null)[][] = []
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7))
  return weeks
}

// ---- shown to a person -----------------------------------------------------------------------------------------------------------------

/** A calendar day in words (the key names a day, so it is read as UTC midnight, which is that same day everywhere). */
export function dayLabel(key: DateKey, lang: Language, style: 'full' | 'long' | 'medium' = 'full'): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { dateStyle: style, timeZone: 'UTC' }).format(utc(key))
}

export function monthLabel(key: DateKey, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(key))
}

/** The seven weekday names, Monday first, short and long (the short one is what the column head shows, the long one what a reader hears). */
export function weekdayNames(lang: Language): { short: string; long: string }[] {
  const short = new Intl.DateTimeFormat(LOCALE_TAGS[lang], { weekday: 'short', timeZone: 'UTC' })
  const long = new Intl.DateTimeFormat(LOCALE_TAGS[lang], { weekday: 'long', timeZone: 'UTC' })
  // 2026-11-02 is a Monday.
  return Array.from({ length: 7 }, (_, index) => {
    const date = utc(addDays('2026-11-02', index))
    return { short: short.format(date), long: long.format(date) }
  })
}

const at = (instant: string): Date => new Date(instant)

/** The date of an instant, in the zone the owner scheduled in. */
export function instantDay(instant: string, zone: string, lang: Language, style: 'full' | 'long' | 'medium' = 'full'): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { dateStyle: style, timeZone: zone }).format(at(instant))
}

/** The clock time of an instant in the scheduling zone; with `zoneName` it also names the zone's abbreviation (what tells the repeated hour apart). */
export function instantClock(instant: string, zone: string, lang: Language, zoneName = false): string {
  // `timeStyle` cannot be combined with `timeZoneName` (the platform refuses it), so the zone's name asks for the fields themselves.
  const options: Intl.DateTimeFormatOptions = zoneName ? { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } : { timeStyle: 'short' }
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { ...options, timeZone: zone }).format(at(instant))
}

export function instantRange(start: string, end: string, zone: string, lang: Language): string {
  return `${instantClock(start, zone, lang)}–${instantClock(end, zone, lang)}`
}

/** A moment with its date, as one phrase ("4 November 2026 at 14:00"). */
export function instantMoment(instant: string, zone: string, lang: Language): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[lang], { dateStyle: 'long', timeStyle: 'short', timeZone: zone }).format(at(instant))
}

/** The zone as the page names it: its IANA name and what that is called at that moment ("Europe/Budapest, Central European Standard Time"). */
export function zoneName(zone: string, lang: Language, instant: string | null = null): string {
  const when = instant ? at(instant) : new Date()
  const name = new Intl.DateTimeFormat(LOCALE_TAGS[lang], { timeZone: zone, timeZoneName: 'long' }).formatToParts(when).find((part) => part.type === 'timeZoneName')?.value
  return name ? `${zone}, ${name}` : zone
}

/** The date key an instant falls on in the scheduling zone. */
export function instantKey(instant: string, zone: string): DateKey {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at(instant))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}
