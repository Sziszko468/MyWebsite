/**
 * Calendar dates and wall-clock times in a named time zone (PROMPT 24), with nothing but the platform's `Intl`: no library.
 *
 * Three kinds of value are kept apart, and mixing them is how appointments end up an hour off:
 *
 *   - an INSTANT: a point on the UTC time line, stored as ISO text and held here as milliseconds. This is what a booking is.
 *   - a DATE KEY: a calendar date as `YYYY-MM-DD`, with no time and no zone. This is what a visitor picks and what a weekly rule means.
 *   - a LOCAL MINUTE: minutes since midnight on a date key (0 to 1440), what an owner means by "09:30".
 *
 * A date key and a local minute become an instant only through a zone (`resolveLocal`), and that step is explicit about the two ways
 * a wall-clock time can fail to name exactly one instant: when the clocks go FORWARD, the times inside the skipped hour do not exist
 * (a `gap`); when they go BACK, the times inside the repeated hour exist twice (`ambiguous`). Callers decide what each means; nothing
 * here picks one silently.
 */

export type DateKey = string

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

export interface Ymd {
  year: number
  month: number
  day: number
}

/** A real calendar date (no 30 February), or `null`. */
export function parseDateKey(key: string): Ymd | null {
  const match = DATE_KEY.exec(key)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return { year, month, day }
}

export const isDateKey = (key: string): boolean => parseDateKey(key) !== null

/** The key of a calendar date; a key is an identifier, not something shown to a person (display is `Intl`'s). */
export function toDateKey(ymd: Ymd): DateKey {
  return `${String(ymd.year).padStart(4, '0')}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')}`
}

const utcMidnight = (ymd: Ymd): number => Date.UTC(ymd.year, ymd.month - 1, ymd.day)

/** The date `days` after (or before, when negative) a date. Calendar arithmetic: it knows nothing of clocks, so a 23 or 25 hour day is still one day. */
export function addDays(key: DateKey, days: number): DateKey {
  const ymd = parseDateKey(key)
  if (!ymd) throw new RangeError(`Not a date: ${key}`)
  const moved = new Date(utcMidnight(ymd) + days * DAY_MS)
  return toDateKey({ year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() })
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: DateKey, to: DateKey): number {
  const a = parseDateKey(from)
  const b = parseDateKey(to)
  if (!a || !b) throw new RangeError('Not a date.')
  return Math.round((utcMidnight(b) - utcMidnight(a)) / DAY_MS)
}

/** 1 (Monday) to 7 (Sunday), as ISO 8601 numbers them. */
export function isoWeekday(key: DateKey): number {
  const ymd = parseDateKey(key)
  if (!ymd) throw new RangeError(`Not a date: ${key}`)
  const day = new Date(utcMidnight(ymd)).getUTCDay()
  return day === 0 ? 7 : day
}

// ---- zones ----------------------------------------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(zone: string): Intl.DateTimeFormat {
  let found = formatters.get(zone)
  if (!found) {
    // `en-GB` and `h23` only because they make the parts predictable (Latin digits, a 24 hour clock); nothing here is shown to a person.
    found = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
    formatters.set(zone, found)
  }
  return found
}

/** Whether the platform knows the zone (an IANA name such as `Europe/Budapest`, or `UTC`). */
export function isValidZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length < 1 || zone.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(zone)) return false
  try {
    formatter(zone)
    return true
  } catch {
    return false
  }
}

export interface WallClock extends Ymd {
  hour: number
  minute: number
  second: number
}

/** What a wall clock in the zone shows at an instant. */
export function wallClock(instant: number, zone: string): WallClock {
  const parts = formatter(zone).formatToParts(new Date(instant))
  const get = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? Number.NaN)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') }
}

/** The zone's offset from UTC at an instant, in minutes (east is positive). */
export function offsetMinutes(instant: number, zone: string): number {
  const wall = wallClock(instant, zone)
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  return Math.round((asUtc - (instant - (((instant % 1000) + 1000) % 1000))) / MINUTE_MS)
}

/** The calendar date it is in the zone at an instant. */
export function localDateKey(instant: number, zone: string): DateKey {
  const wall = wallClock(instant, zone)
  return toDateKey(wall)
}

/** Minutes since local midnight at an instant. */
export function localMinute(instant: number, zone: string): number {
  const wall = wallClock(instant, zone)
  return wall.hour * 60 + wall.minute
}

export type LocalResolution =
  | { kind: 'valid'; at: number }
  /** The clocks went back: the time happens twice. `first` is the earlier instant (before the change), `second` the later one. */
  | { kind: 'ambiguous'; first: number; second: number }
  /** The clocks jumped forward: the time does not exist. `at` is the instant of the jump (the first instant after the skipped hour). */
  | { kind: 'gap'; at: number }

function transitionNear(guess: number, zone: string): number {
  // Find the minute at which the offset changes within a day of `guess`.
  let low = guess - DAY_MS
  let high = guess + DAY_MS
  const before = offsetMinutes(low, zone)
  if (offsetMinutes(high, zone) === before) return guess
  low = Math.floor(low / MINUTE_MS)
  high = Math.floor(high / MINUTE_MS)
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (offsetMinutes(middle * MINUTE_MS, zone) === before) low = middle
    else high = middle
  }
  return high * MINUTE_MS
}

/**
 * The instant(s) a wall-clock time names on a date in a zone. `minute` is 0 to 1440 (1440 is the next midnight).
 * The candidates are the instants that the offsets in force around that day would give, kept only when the zone's own wall clock
 * agrees: none is a gap, two is an overlap, one is the ordinary case.
 */
export function resolveLocal(key: DateKey, minute: number, zone: string): LocalResolution {
  const date = minute >= 1440 ? addDays(key, 1) : key
  const wanted = minute >= 1440 ? 0 : minute
  const ymd = parseDateKey(date)
  if (!ymd) throw new RangeError(`Not a date: ${key}`)
  const naive = Date.UTC(ymd.year, ymd.month - 1, ymd.day, Math.floor(wanted / 60), wanted % 60)
  const offsets = new Set<number>()
  for (const probe of [-2, -1, 0, 1, 2]) offsets.add(offsetMinutes(naive + probe * 12 * 3_600_000, zone))
  const found = new Set<number>()
  for (const offset of offsets) {
    const instant = naive - offset * MINUTE_MS
    const wall = wallClock(instant, zone)
    if (wall.year === ymd.year && wall.month === ymd.month && wall.day === ymd.day && wall.hour * 60 + wall.minute === wanted) found.add(instant)
  }
  const instants = [...found].sort((a, b) => a - b)
  if (instants.length === 1) return { kind: 'valid', at: instants[0] }
  if (instants.length >= 2) return { kind: 'ambiguous', first: instants[0], second: instants[instants.length - 1] }
  return { kind: 'gap', at: transitionNear(naive, zone) }
}

/** The instant the day starts in the zone (midnight, or the first instant after the jump when midnight itself does not exist). */
export function startOfLocalDay(key: DateKey, zone: string): number {
  const resolved = resolveLocal(key, 0, zone)
  return resolved.kind === 'valid' ? resolved.at : resolved.kind === 'ambiguous' ? resolved.first : resolved.at
}

/** How a window's edge is read when its wall-clock time is not one instant: a skipped time is the moment of the jump, a repeated one is its first occurrence. */
export function edgeInstant(key: DateKey, minute: number, zone: string): number {
  const resolved = resolveLocal(key, minute, zone)
  return resolved.kind === 'valid' ? resolved.at : resolved.kind === 'ambiguous' ? resolved.first : resolved.at
}

/** Whether a wall-clock time exists exactly once on a date (what an owner may type for a one-off time). */
export const existsOnce = (key: DateKey, minute: number, zone: string): boolean => resolveLocal(key, minute, zone).kind === 'valid'

// ---- local minutes as the owner types them ---------------------------------------------------------------------------

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

/** `"09:30"` to 570. `"24:00"` is accepted as the end of a day (1440). `null` for anything else. */
export function parseMinute(text: string): number | null {
  if (text === '24:00') return 1440
  const match = TIME.exec(text)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** 570 to `"09:30"`. */
export function minuteText(minute: number): string {
  if (minute >= 1440) return '24:00'
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}
