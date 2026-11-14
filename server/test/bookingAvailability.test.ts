import { describe, expect, it } from 'vitest'
import { computeDays, rulesFor, windowsOn, type EngineInput } from '../src/modules/bookings/availability.ts'
import type { ExceptionRow, RuleRow } from '../src/modules/bookings/model.ts'
import { addDays, daysBetween, edgeInstant, isDateKey, isoWeekday, isValidZone, localDateKey, localMinute, minuteText, offsetMinutes, parseDateKey, parseMinute, resolveLocal, startOfLocalDay, wallClock } from '../src/modules/bookings/zone.ts'

const BUDAPEST = 'Europe/Budapest'
const iso = (ms: number) => new Date(ms).toISOString()
const utc = (text: string) => Date.parse(text)

let counter = 0
const rule = (weekday: number, from: string, to: string, typeId: string | null = null): RuleRow => ({ id: `r${counter++}`, consultation_type_id: typeId, weekday, start_minute: parseMinute(from)!, end_minute: parseMinute(to)!, created_at: '' })
const exception = (kind: 'closed' | 'open', start: string, end: string, from: string | null = null, to: string | null = null): ExceptionRow => ({ id: `e${counter++}`, kind, start_date: start, end_date: end, start_minute: from === null ? null : parseMinute(from), end_minute: to === null ? null : parseMinute(to), label: null, created_at: '' })

function input(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    zone: BUDAPEST,
    typeId: 't1',
    durationMinutes: 60,
    stepMinutes: 60,
    bufferMinutes: 0,
    minNoticeHours: 0,
    horizonDays: 365,
    now: utc('2026-01-05T08:00:00Z'),
    rules: [],
    exceptions: [],
    blockers: [],
    ...overrides,
  }
}

describe('calendar dates', () => {
  it('knows which dates are real, and does calendar arithmetic that ignores clocks', () => {
    expect(isDateKey('2026-02-29')).toBe(false)
    expect(isDateKey('2028-02-29')).toBe(true)
    expect(isDateKey('2026-13-01')).toBe(false)
    expect(isDateKey('2026-1-01')).toBe(false)
    expect(parseDateKey('2026-03-29')).toEqual({ year: 2026, month: 3, day: 29 })
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(isoWeekday('2026-11-14')).toBe(6) // a Saturday
    expect(isoWeekday('2026-11-15')).toBe(7) // a Sunday
    expect(isoWeekday('2026-11-16')).toBe(1)
  })

  it('reads and writes the owner\'s times of day', () => {
    expect(parseMinute('09:30')).toBe(570)
    expect(parseMinute('24:00')).toBe(1440)
    expect(parseMinute('9:30')).toBeNull()
    expect(parseMinute('25:00')).toBeNull()
    expect(parseMinute('12:60')).toBeNull()
    expect(minuteText(570)).toBe('09:30')
    expect(minuteText(1440)).toBe('24:00')
  })

  it('accepts a real zone and nothing else', () => {
    expect(isValidZone('Europe/Budapest')).toBe(true)
    expect(isValidZone('UTC')).toBe(true)
    expect(isValidZone('America/New_York')).toBe(true)
    expect(isValidZone('Mars/Olympus')).toBe(false)
    expect(isValidZone('')).toBe(false)
    expect(isValidZone('Europe/Budapest; DROP TABLE')).toBe(false)
    expect(isValidZone(42)).toBe(false)
  })
})

describe('time zones and daylight saving time', () => {
  it('uses the zone\'s own offset, winter and summer', () => {
    expect(offsetMinutes(utc('2026-01-15T12:00:00Z'), BUDAPEST)).toBe(60)
    expect(offsetMinutes(utc('2026-07-15T12:00:00Z'), BUDAPEST)).toBe(120)
    expect(offsetMinutes(utc('2026-07-15T12:00:00Z'), 'America/New_York')).toBe(-240)
    expect(offsetMinutes(utc('2026-07-15T12:00:00Z'), 'UTC')).toBe(0)
  })

  it('turns a local time into one instant on an ordinary day', () => {
    expect(resolveLocal('2026-01-15', 570, BUDAPEST)).toEqual({ kind: 'valid', at: utc('2026-01-15T08:30:00Z') })
    expect(resolveLocal('2026-07-15', 570, BUDAPEST)).toEqual({ kind: 'valid', at: utc('2026-07-15T07:30:00Z') })
  })

  it('does not accept a local time that does not exist (spring forward, 29 March 2026, 02:00 to 03:00 in Budapest)', () => {
    expect(resolveLocal('2026-03-29', parseMinute('01:59')!, BUDAPEST).kind).toBe('valid')
    const missing = resolveLocal('2026-03-29', parseMinute('02:30')!, BUDAPEST)
    expect(missing.kind).toBe('gap')
    // The jump happens at 01:00 UTC; 03:00 local is the first time that exists again.
    if (missing.kind === 'gap') expect(iso(missing.at)).toBe('2026-03-29T01:00:00.000Z')
    expect(resolveLocal('2026-03-29', parseMinute('03:00')!, BUDAPEST)).toEqual({ kind: 'valid', at: utc('2026-03-29T01:00:00Z') })
  })

  it('names both instants of a local time that happens twice (fall back, 25 October 2026, 03:00 to 02:00 in Budapest)', () => {
    const twice = resolveLocal('2026-10-25', parseMinute('02:30')!, BUDAPEST)
    expect(twice.kind).toBe('ambiguous')
    if (twice.kind === 'ambiguous') {
      expect(iso(twice.first)).toBe('2026-10-25T00:30:00.000Z') // still summer time
      expect(iso(twice.second)).toBe('2026-10-25T01:30:00.000Z') // winter time
    }
    expect(resolveLocal('2026-10-25', parseMinute('01:59')!, BUDAPEST).kind).toBe('valid')
    expect(resolveLocal('2026-10-25', parseMinute('03:00')!, BUDAPEST).kind).toBe('valid')
  })

  it('works the same way in the other direction of the world (New York, 8 March 2026)', () => {
    expect(resolveLocal('2026-03-08', parseMinute('02:30')!, 'America/New_York').kind).toBe('gap')
    expect(resolveLocal('2026-11-01', parseMinute('01:30')!, 'America/New_York').kind).toBe('ambiguous')
  })

  it('reads an instant back as the wall clock of the zone, and as a date', () => {
    expect(wallClock(utc('2026-03-29T00:59:00Z'), BUDAPEST)).toMatchObject({ month: 3, day: 29, hour: 1, minute: 59 })
    expect(wallClock(utc('2026-03-29T01:00:00Z'), BUDAPEST)).toMatchObject({ hour: 3, minute: 0 })
    // 23:30 UTC on 14 November is already 15 November in Budapest.
    expect(localDateKey(utc('2026-11-14T23:30:00Z'), BUDAPEST)).toBe('2026-11-15')
    expect(localMinute(utc('2026-11-14T23:30:00Z'), BUDAPEST)).toBe(30)
    // Midnight does not depend on the season.
    expect(iso(startOfLocalDay('2026-07-01', BUDAPEST))).toBe('2026-06-30T22:00:00.000Z')
    expect(iso(startOfLocalDay('2026-12-01', BUDAPEST))).toBe('2026-11-30T23:00:00.000Z')
  })

  it('a day with a skipped hour is 23 hours long, one with a repeated hour 25', () => {
    expect((startOfLocalDay('2026-03-30', BUDAPEST) - startOfLocalDay('2026-03-29', BUDAPEST)) / 3_600_000).toBe(23)
    expect((startOfLocalDay('2026-10-26', BUDAPEST) - startOfLocalDay('2026-10-25', BUDAPEST)) / 3_600_000).toBe(25)
    expect((startOfLocalDay('2026-11-15', BUDAPEST) - startOfLocalDay('2026-11-14', BUDAPEST)) / 3_600_000).toBe(24)
  })

  it('reads a window edge that is skipped as the moment of the jump and one that repeats as its first occurrence', () => {
    expect(iso(edgeInstant('2026-03-29', parseMinute('02:30')!, BUDAPEST))).toBe('2026-03-29T01:00:00.000Z')
    expect(iso(edgeInstant('2026-10-25', parseMinute('02:30')!, BUDAPEST))).toBe('2026-10-25T00:30:00.000Z')
  })
})

describe('the weekly hours and the owner\'s exceptions', () => {
  // 2026-11-16 is a Monday.
  const monday = '2026-11-16'

  it('has no hours at all until the owner writes some', () => {
    const days = computeDays(input(), monday, addDays(monday, 6))
    expect(days.every((day) => day.status === 'closed' && day.slots.length === 0)).toBe(true)
  })

  it('offers slots only inside the window, and only ones that end inside it', () => {
    const days = computeDays(input({ rules: [rule(1, '09:00', '12:00')] }), monday, monday)
    expect(days[0].status).toBe('available')
    expect(days[0].slots.map((slot) => iso(slot.start))).toEqual(['2026-11-16T08:00:00.000Z', '2026-11-16T09:00:00.000Z', '2026-11-16T10:00:00.000Z'])
    // The last slot ends at 12:00 local, never after.
    expect(iso(days[0].slots[2].end)).toBe('2026-11-16T11:00:00.000Z')
  })

  it('does not assume the owner works every weekday', () => {
    const days = computeDays(input({ rules: [rule(1, '09:00', '12:00'), rule(3, '13:00', '15:00')] }), monday, addDays(monday, 6))
    expect(days.map((day) => day.status)).toEqual(['available', 'closed', 'available', 'closed', 'closed', 'closed', 'closed'])
  })

  it('takes the consultation type\'s duration and the start-time spacing', () => {
    const days = computeDays(input({ durationMinutes: 45, stepMinutes: 30, rules: [rule(1, '09:00', '11:00')] }), monday, monday)
    // 09:00, 09:30, 10:00 fit a 45 minute consultation before 11:00; 10:30 would end at 11:15.
    expect(days[0].slots.map((slot) => iso(slot.start).slice(11, 16))).toEqual(['08:00', '08:30', '09:00'])
    expect(days[0].slots.every((slot) => slot.end - slot.start === 45 * 60_000)).toBe(true)
  })

  it('merges overlapping windows instead of offering a time twice', () => {
    const days = computeDays(input({ rules: [rule(1, '09:00', '11:00'), rule(1, '10:00', '12:00')] }), monday, monday)
    expect(days[0].slots.map((slot) => iso(slot.start).slice(11, 16))).toEqual(['08:00', '09:00', '10:00'])
  })

  it('keeps two windows on one day apart (a lunch break)', () => {
    const days = computeDays(input({ rules: [rule(1, '09:00', '11:00'), rule(1, '13:00', '15:00')] }), monday, monday)
    expect(days[0].slots.map((slot) => iso(slot.start).slice(11, 16))).toEqual(['08:00', '09:00', '12:00', '13:00'])
  })

  it('uses a type\'s own hours when it has any, and the general ones otherwise', () => {
    const rules = [rule(1, '09:00', '12:00'), rule(2, '14:00', '16:00', 'special')]
    expect(rulesFor(rules, 'special')).toHaveLength(1)
    expect(rulesFor(rules, 'other')).toHaveLength(1)
    const general = computeDays(input({ typeId: 'other', rules }), monday, addDays(monday, 1))
    expect(general.map((day) => day.status)).toEqual(['available', 'closed'])
    const own = computeDays(input({ typeId: 'special', rules }), monday, addDays(monday, 1))
    expect(own.map((day) => day.status)).toEqual(['closed', 'available'])
  })

  it('closes a date, a period and part of a day, and a closure beats an opening', () => {
    const rules = [rule(1, '09:00', '12:00')]
    const closedDay = computeDays(input({ rules, exceptions: [exception('closed', monday, monday)] }), monday, monday)
    expect(closedDay[0].status).toBe('closed')

    const nextMonday = '2026-11-23'
    const period = computeDays(input({ rules, exceptions: [exception('closed', '2026-11-20', '2026-11-30')] }), monday, nextMonday)
    expect(period.find((day) => day.date === monday)?.status).toBe('available')
    expect(period.find((day) => day.date === nextMonday)?.status).toBe('closed')

    const partial = computeDays(input({ rules, exceptions: [exception('closed', monday, monday, '10:00', '11:00')] }), monday, monday)
    expect(partial[0].slots.map((slot) => iso(slot.start).slice(11, 16))).toEqual(['08:00', '10:00'])

    const opened = computeDays(input({ exceptions: [exception('open', '2026-11-21', '2026-11-21', '10:00', '12:00'), exception('closed', '2026-11-21', '2026-11-21')] }), '2026-11-21', '2026-11-21')
    expect(opened[0].status).toBe('closed')
  })

  it('a one-off opening makes a day available that the weekly hours leave closed', () => {
    const saturday = '2026-11-21'
    const days = computeDays(input({ rules: [rule(1, '09:00', '12:00')], exceptions: [exception('open', saturday, saturday, '10:00', '12:00')] }), saturday, saturday)
    expect(days[0].status).toBe('available')
    expect(days[0].slots).toHaveLength(2)
  })
})

describe('what is taken, how soon, how far ahead', () => {
  const monday = '2026-11-16'
  const hours = [rule(1, '09:00', '13:00')]

  it('takes a booked slot away, and reports a day with every slot taken as full (not closed)', () => {
    const blockers = [{ start: utc('2026-11-16T08:00:00Z'), end: utc('2026-11-16T09:00:00Z') }]
    const some = computeDays(input({ rules: hours, blockers }), monday, monday)
    expect(some[0].status).toBe('available')
    expect(some[0].slots.map((slot) => iso(slot.start).slice(11, 16))).toEqual(['09:00', '10:00', '11:00'])

    const all = computeDays(input({ rules: hours, blockers: [{ start: utc('2026-11-16T08:00:00Z'), end: utc('2026-11-16T12:00:00Z') }] }), monday, monday)
    expect(all[0].status).toBe('full')
    expect(all[0].slots).toEqual([])
  })

  it('keeps the buffer free on both sides of a booking', () => {
    const blockers = [{ start: utc('2026-11-16T09:00:00Z'), end: utc('2026-11-16T10:00:00Z') }]
    const none = computeDays(input({ rules: hours, stepMinutes: 30, blockers }), monday, monday)
    expect(none[0].slots.map((slot) => iso(slot.start).slice(11, 16))).toEqual(['08:00', '10:00', '10:30', '11:00'])
    const buffered = computeDays(input({ rules: hours, stepMinutes: 30, bufferMinutes: 30, blockers }), monday, monday)
    // 08:00 would end at 09:00 (touching the booking, inside the 30 minute buffer) and 10:00 would start at its end.
    expect(buffered[0].slots.map((slot) => iso(slot.start).slice(11, 16))).toEqual(['10:30', '11:00'])
  })

  it('does not offer a time that has already passed, nor one inside the minimum notice', () => {
    const noon = utc('2026-11-16T11:00:00Z') // 12:00 in Budapest, the middle of the window
    const past = computeDays(input({ rules: hours, now: noon }), monday, monday)
    expect(past[0].slots.map((slot) => iso(slot.start).slice(11, 16))).toEqual(['11:00'])
    const notice = computeDays(input({ rules: hours, now: utc('2026-11-16T06:00:00Z'), minNoticeHours: 3 }), monday, monday)
    expect(notice[0].slots.map((slot) => iso(slot.start).slice(11, 16))).toEqual(['09:00', '10:00', '11:00'])
    const yesterday = computeDays(input({ rules: [rule(7, '09:00', '12:00')], now: utc('2026-11-16T06:00:00Z') }), '2026-11-15', '2026-11-15')
    expect(yesterday[0].status).toBe('closed')
  })

  it('stops at the booking horizon, counted in local days', () => {
    const now = utc('2026-11-16T06:00:00Z')
    const days = computeDays(input({ rules: [1, 2, 3, 4, 5, 6, 7].map((day) => rule(day, '09:00', '10:00')), now, horizonDays: 2 }), '2026-11-16', '2026-11-20')
    expect(days.map((day) => day.status)).toEqual(['available', 'available', 'available', 'closed', 'closed'])
  })
})

describe('daylight saving time inside the availability', () => {
  it('offers every real hour on the day the clocks go forward and never a time that does not exist', () => {
    const sunday = '2026-03-29'
    const days = computeDays(input({ now: utc('2026-03-01T00:00:00Z'), rules: [rule(7, '00:00', '06:00')] }), sunday, sunday)
    // Local 00:00 to 06:00 is five elapsed hours that day: 00:00, 01:00, 03:00, 04:00, 05:00 (02:00 does not exist).
    const local = days[0].slots.map((slot) => `${String(Math.floor(localMinute(slot.start, BUDAPEST) / 60)).padStart(2, '0')}:00`)
    expect(local).toEqual(['00:00', '01:00', '03:00', '04:00', '05:00'])
    expect(days[0].slots.some((slot) => localMinute(slot.start, BUDAPEST) === 120)).toBe(false)
    expect(days[0].slots.every((slot) => !slot.ambiguous)).toBe(true)
  })

  it('offers the repeated hour twice on the day the clocks go back and says so', () => {
    const sunday = '2026-10-25'
    const days = computeDays(input({ now: utc('2026-10-01T00:00:00Z'), rules: [rule(7, '00:00', '05:00')] }), sunday, sunday)
    // Six elapsed hours: 00:00, 01:00, 02:00 (summer), 02:00 (winter), 03:00, 04:00.
    expect(days[0].slots).toHaveLength(6)
    const twoOClock = days[0].slots.filter((slot) => localMinute(slot.start, BUDAPEST) === 120)
    expect(twoOClock).toHaveLength(2)
    expect(twoOClock.every((slot) => slot.ambiguous)).toBe(true)
    expect(iso(twoOClock[0].start)).toBe('2026-10-25T00:00:00.000Z')
    expect(iso(twoOClock[1].start)).toBe('2026-10-25T01:00:00.000Z')
    expect(days[0].slots.filter((slot) => slot.ambiguous)).toHaveLength(2)
  })

  it('keeps a nine o\'clock consultation at nine o\'clock on both sides of a change, which is a different instant', () => {
    const rules = [rule(1, '09:00', '10:00'), rule(7, '09:00', '10:00')]
    const before = computeDays(input({ now: utc('2026-03-01T00:00:00Z'), rules }), '2026-03-23', '2026-03-23')
    const after = computeDays(input({ now: utc('2026-03-01T00:00:00Z'), rules }), '2026-03-30', '2026-03-30')
    expect(iso(before[0].slots[0].start)).toBe('2026-03-23T08:00:00.000Z')
    expect(iso(after[0].slots[0].start)).toBe('2026-03-30T07:00:00.000Z')
  })

  it('reads a window whose edge falls in the skipped hour as ending at the jump', () => {
    const windows = windowsOn('2026-03-29', { zone: BUDAPEST, typeId: 't1', rules: [rule(7, '00:30', '02:30')], exceptions: [] })
    expect(windows).toHaveLength(1)
    expect(iso(windows[0].start)).toBe('2026-03-28T23:30:00.000Z')
    expect(iso(windows[0].end)).toBe('2026-03-29T01:00:00.000Z')
  })

  it('hands out the same slots in another zone as that zone\'s own hours (9 to 10 in New York is 14 or 13 in UTC)', () => {
    const winter = computeDays(input({ zone: 'America/New_York', now: utc('2026-01-01T00:00:00Z'), rules: [rule(1, '09:00', '10:00')] }), '2026-01-12', '2026-01-12')
    const summer = computeDays(input({ zone: 'America/New_York', now: utc('2026-01-01T00:00:00Z'), rules: [rule(1, '09:00', '10:00')] }), '2026-07-13', '2026-07-13')
    expect(iso(winter[0].slots[0].start)).toBe('2026-01-12T14:00:00.000Z')
    expect(iso(summer[0].slots[0].start)).toBe('2026-07-13T13:00:00.000Z')
  })
})
