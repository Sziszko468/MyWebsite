/**
 * The arithmetic of a schedule (PROMPT 26), shared by the customer's portal and the administration, with no chart library: what to draw is a list of rows, each with a
 * position and a width in percent of a range of days, and the rows ARE the accessible version (the title and the dates are text; the bar is a picture of them).
 *
 * Every date is a calendar day, `YYYY-MM-DD`, with no zone. A day has no hour, so a bar is whole days and daylight saving cannot move it: the arithmetic is done on
 * UTC midnights. "Today" is handed in (the server decides it, in the owner's zone, and sends it), never read from the browser's clock, so the customer's screen, the
 * owner's screen and the reminders agree on what is overdue.
 */

const DAY_MS = 86_400_000
const DAY = /^\d{4}-\d{2}-\d{2}$/

export const isDay = (value: string | null | undefined): value is string => typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

const stamp = (day: string): number => Date.parse(`${day}T00:00:00Z`)

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export const daysBetween = (from: string, to: string): number => Math.round((stamp(to) - stamp(from)) / DAY_MS)

export const addDays = (day: string, count: number): string => new Date(stamp(day) + count * DAY_MS).toISOString().slice(0, 10)

/** 0 (Monday) … 6 (Sunday). */
const weekday = (day: string): number => (new Date(stamp(day)).getUTCDay() + 6) % 7

export interface ScheduleInput {
  id: string
  title: string
  startOn: string | null
  dueOn: string | null
  /** Finished (completed): drawn as done, never as late. */
  done?: boolean
  /** Cancelled: not drawn at all. */
  cancelled?: boolean
  kind?: 'task' | 'milestone'
  /** Whatever the screen wants back with the row (a status, a link). */
  meta?: string
}

export interface ScheduleRow {
  id: string
  title: string
  kind: 'task' | 'milestone'
  meta?: string
  /** The first and the last day it covers (the same day for a single date). */
  from: string
  to: string
  /** Only one of the two dates was set: a point, not a span. */
  point: boolean
  done: boolean
  overdue: boolean
  /** Percent of the range. */
  left: number
  width: number
}

export interface ScheduleTick {
  at: string
  kind: 'week' | 'month'
  left: number
}

export interface Schedule {
  /** `null` when nothing has a date. */
  range: { from: string; to: string; days: number } | null
  /** Where today falls, in percent of the range; `null` when it is not near what is drawn. */
  today: number | null
  ticks: ScheduleTick[]
  rows: ScheduleRow[]
  /** What has no date: listed, never left out. */
  unscheduled: ScheduleInput[]
}

/** A bar is never thinner than this (percent), so a one-day task can still be seen and tapped. */
const MINIMUM_WIDTH = 1.6

/** How far from the drawn range today may be and still get a marker (days). */
const NEARBY = 14

export function buildSchedule(items: readonly ScheduleInput[], today: string): Schedule {
  const live = items.filter((item) => !item.cancelled)
  const scheduled = live.filter((item) => isDay(item.startOn) || isDay(item.dueOn))
  const unscheduled = live.filter((item) => !isDay(item.startOn) && !isDay(item.dueOn))
  if (scheduled.length === 0) return { range: null, today: null, ticks: [], rows: [], unscheduled }

  const spans = scheduled.map((item) => {
    const start = isDay(item.startOn) ? item.startOn : null
    const due = isDay(item.dueOn) ? item.dueOn : null
    // A span whose dates are the wrong way round is read as the one day it ends on, never as a negative bar.
    const from = start ?? due!
    const to = due ?? start!
    return { item, from: from <= to ? from : to, to: from <= to ? to : from, point: start === null || due === null || start === due }
  })
  const first = spans.reduce((best, span) => (span.from < best ? span.from : best), spans[0].from)
  const last = spans.reduce((best, span) => (span.to > best ? span.to : best), spans[0].to)
  const showToday = isDay(today) && today >= addDays(first, -NEARBY) && today <= addDays(last, NEARBY)
  const from = showToday && today < first ? today : first
  const to = showToday && today > last ? today : last
  const days = daysBetween(from, to) + 1
  const percent = (offset: number) => (offset / days) * 100

  const rows = spans
    .map(({ item, from: start, to: end, point }): ScheduleRow => {
      const width = Math.max(percent(daysBetween(start, end) + 1), MINIMUM_WIDTH)
      const left = Math.min(percent(daysBetween(from, start)), 100 - width)
      return { id: item.id, title: item.title, kind: item.kind ?? 'task', meta: item.meta, from: start, to: end, point, done: item.done === true, overdue: item.done !== true && end < today, left, width }
    })
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.title.localeCompare(b.title))

  const ticks: ScheduleTick[] = []
  if (days <= 120) {
    for (let day = from; day <= to; day = addDays(day, 1)) if (weekday(day) === 0) ticks.push({ at: day, kind: 'week', left: percent(daysBetween(from, day)) })
  } else {
    for (let day = from; day <= to; day = addDays(day, 1)) if (day.endsWith('-01')) ticks.push({ at: day, kind: 'month', left: percent(daysBetween(from, day)) })
  }
  return { range: { from, to, days }, today: showToday ? percent(daysBetween(from, today)) : null, ticks, rows, unscheduled }
}

/** Whether a day (or span's end) has passed without the thing being done. */
export const isOverdue = (dueOn: string | null, today: string, done: boolean): boolean => !done && isDay(dueOn) && dueOn < today
