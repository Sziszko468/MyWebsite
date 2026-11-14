import type { Database } from '../../db/database.ts'
import { ACTIVE_STATUSES, type BookingSettings, type ExceptionRow, type RuleRow } from './model.ts'
import { addDays, edgeInstant, isoWeekday, localDateKey, localMinute, resolveLocal, startOfLocalDay, type DateKey } from './zone.ts'

/**
 * Which times can be booked. The server decides this, never the browser: the page asks for a range of days and is told what is free; the
 * booking request names one start time and the server works the answer out again (`findFreeSlot`) before it writes anything.
 *
 * The rules, in the order they are applied to one day:
 *
 *   1. The weekly windows for that weekday (the type's own, if it has any; otherwise the general ones) plus the owner's one-off openings
 *      on that date are merged into the day's windows. Windows are read as local wall-clock times in the scheduling zone and turned into
 *      instants once; from here on everything is elapsed time, so a day with a skipped or repeated hour needs no special case.
 *   2. The owner's closures (a day, a period, or part of a day) are cut out. A closure always wins over an opening.
 *   3. Slots start at the window's start and then every `slotStepMinutes`; a slot must END inside its window.
 *   4. A slot that starts sooner than the minimum notice is dropped; days beyond the horizon, and days before today, are closed.
 *   5. A slot that comes within the buffer of a booking that is alive (or of a slot held for a reschedule) is taken.
 *
 * A day is `available` when it has a free slot, `full` when it has hours but every slot is taken, and `closed` otherwise.
 */

export interface Interval {
  start: number
  end: number
}

export interface Slot extends Interval {
  /** The wall-clock time of the start occurs twice that day (the clocks went back): the page shows the zone's offset to tell them apart. */
  ambiguous: boolean
}

export interface DayAvailability {
  date: DateKey
  status: 'available' | 'full' | 'closed'
  slots: Slot[]
}

export interface EngineInput {
  zone: string
  typeId: string
  durationMinutes: number
  stepMinutes: number
  bufferMinutes: number
  minNoticeHours: number
  horizonDays: number
  now: number
  rules: readonly RuleRow[]
  exceptions: readonly ExceptionRow[]
  /** Time that is taken: bookings that are alive and slots held for a reschedule. */
  blockers: readonly Interval[]
}

const MINUTE = 60_000
const HOUR = 3_600_000

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start)
  const merged: Interval[] = []
  for (const item of sorted) {
    const last = merged[merged.length - 1]
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end)
    else merged.push({ ...item })
  }
  return merged
}

function subtract(list: Interval[], cut: Interval): Interval[] {
  const result: Interval[] = []
  for (const item of list) {
    if (cut.end <= item.start || cut.start >= item.end) result.push(item)
    else {
      if (cut.start > item.start) result.push({ start: item.start, end: cut.start })
      if (cut.end < item.end) result.push({ start: cut.end, end: item.end })
    }
  }
  return result
}

const covers = (exception: ExceptionRow, key: DateKey): boolean => exception.start_date <= key && key <= exception.end_date

function windowOf(key: DateKey, startMinute: number, endMinute: number, zone: string): Interval | null {
  const start = edgeInstant(key, startMinute, zone)
  const end = edgeInstant(key, endMinute, zone)
  return end > start ? { start, end } : null
}

/** The rules a type is offered under: its own, or, when it has none, the general ones. */
export function rulesFor(rules: readonly RuleRow[], typeId: string): RuleRow[] {
  const own = rules.filter((rule) => rule.consultation_type_id === typeId)
  return own.length > 0 ? own : rules.filter((rule) => rule.consultation_type_id === null)
}

/** The times the owner is available on a local date, before anything is booked. */
export function windowsOn(key: DateKey, input: Pick<EngineInput, 'zone' | 'typeId' | 'rules' | 'exceptions'>): Interval[] {
  const { zone } = input
  const weekday = isoWeekday(key)
  let windows: Interval[] = []
  for (const rule of rulesFor(input.rules, input.typeId)) {
    if (rule.weekday !== weekday) continue
    const window = windowOf(key, rule.start_minute, rule.end_minute, zone)
    if (window) windows.push(window)
  }
  for (const exception of input.exceptions) {
    if (exception.kind !== 'open' || !covers(exception, key) || exception.start_minute === null || exception.end_minute === null) continue
    const window = windowOf(key, exception.start_minute, exception.end_minute, zone)
    if (window) windows.push(window)
  }
  windows = mergeIntervals(windows)
  for (const exception of input.exceptions) {
    if (exception.kind !== 'closed' || !covers(exception, key)) continue
    const cut =
      exception.start_minute === null || exception.end_minute === null
        ? { start: startOfLocalDay(key, zone), end: startOfLocalDay(addDays(key, 1), zone) }
        : windowOf(key, exception.start_minute, exception.end_minute, zone)
    if (cut) windows = windows.reduce<Interval[]>((rest, window) => [...rest, ...subtract([window], cut)], [])
  }
  return windows
}

const conflicts = (start: number, end: number, blockers: readonly Interval[], bufferMs: number): boolean => blockers.some((blocker) => start < blocker.end + bufferMs && end + bufferMs > blocker.start)

/** The state of each local date from `from` to `to` (both included), and the free slots of the days that have any. */
export function computeDays(input: EngineInput, from: DateKey, to: DateKey): DayAvailability[] {
  const durationMs = input.durationMinutes * MINUTE
  const stepMs = input.stepMinutes * MINUTE
  const bufferMs = input.bufferMinutes * MINUTE
  const earliest = input.now + input.minNoticeHours * HOUR
  const today = localDateKey(input.now, input.zone)
  const last = addDays(today, input.horizonDays)
  const days: DayAvailability[] = []
  for (let key = from; key <= to; key = addDays(key, 1)) {
    if (key < today || key > last) {
      days.push({ date: key, status: 'closed', slots: [] })
      continue
    }
    const open: Interval[] = []
    for (const window of windowsOn(key, input)) {
      for (let start = window.start; start + durationMs <= window.end; start += stepMs) {
        if (start >= earliest) open.push({ start, end: start + durationMs })
      }
    }
    const free = open.filter((slot) => !conflicts(slot.start, slot.end, input.blockers, bufferMs))
    const slots: Slot[] = free.map((slot) => ({ ...slot, ambiguous: resolveLocal(key, localMinute(slot.start, input.zone), input.zone).kind === 'ambiguous' }))
    days.push({ date: key, status: slots.length > 0 ? 'available' : open.length > 0 ? 'full' : 'closed', slots })
  }
  return days
}

// ---- from the database -----------------------------------------------------------------------------------------------------------------

export interface TypeForSlots {
  id: string
  duration_minutes: number
}

/** Everything the engine needs to know about time that is already taken, within a window of instants. */
export function blockersBetween(db: Database, from: number, to: number, excludeBookingId: string | null = null): Interval[] {
  const placeholders = ACTIVE_STATUSES.map(() => '?').join(', ')
  const lowIso = new Date(from).toISOString()
  const highIso = new Date(to).toISOString()
  const booked = db.all<{ start_at: string; end_at: string }>(
    `SELECT start_at, end_at FROM bookings WHERE status IN (${placeholders}) AND id <> ? AND end_at > ? AND start_at < ?`,
    [...ACTIVE_STATUSES, excludeBookingId ?? '', lowIso, highIso],
  )
  const held = db.all<{ new_start_at: string; new_end_at: string }>(
    "SELECT new_start_at, new_end_at FROM booking_changes WHERE status = 'open' AND kind = 'reschedule' AND booking_id <> ? AND new_end_at > ? AND new_start_at < ?",
    [excludeBookingId ?? '', lowIso, highIso],
  )
  return [...booked.map((row) => ({ start: Date.parse(row.start_at), end: Date.parse(row.end_at) })), ...held.map((row) => ({ start: Date.parse(row.new_start_at), end: Date.parse(row.new_end_at) }))]
}

export function loadHours(db: Database): { rules: RuleRow[]; exceptions: ExceptionRow[] } {
  return {
    rules: db.all<RuleRow>('SELECT * FROM availability_rules ORDER BY weekday, start_minute'),
    exceptions: db.all<ExceptionRow>('SELECT * FROM availability_exceptions ORDER BY start_date, start_minute'),
  }
}

/** The days from `from` to `to` for a type, as the public page and the booking itself see them. `exclude` is a booking being moved: its own time does not block it. */
export function availableDays(db: Database, settings: BookingSettings, type: TypeForSlots, now: number, from: DateKey, to: DateKey, exclude: string | null = null): DayAvailability[] {
  if (settings.timeZone === null) return []
  const { rules, exceptions } = loadHours(db)
  // Time that could matter: one day either side of the range, so a buffer or a window that crosses midnight is never missed.
  const blockers = blockersBetween(db, startOfLocalDay(addDays(from, -1), settings.timeZone), startOfLocalDay(addDays(to, 2), settings.timeZone), exclude)
  return computeDays(
    {
      zone: settings.timeZone,
      typeId: type.id,
      durationMinutes: type.duration_minutes,
      stepMinutes: settings.slotStepMinutes,
      bufferMinutes: settings.bufferMinutes,
      minNoticeHours: settings.minNoticeHours,
      horizonDays: settings.horizonDays,
      now,
      rules,
      exceptions,
      blockers,
    },
    from,
    to,
  )
}

/** The slot that starts exactly at `start` and is free right now, or `null`. This is the check a booking passes just before it is written. */
export function findFreeSlot(db: Database, settings: BookingSettings, type: TypeForSlots, now: number, start: number, exclude: string | null = null): Slot | null {
  if (settings.timeZone === null) return null
  const key = localDateKey(start, settings.timeZone)
  const [day] = availableDays(db, settings, type, now, key, key, exclude)
  return day?.slots.find((slot) => slot.start === start) ?? null
}
