import { describe, expect, it } from 'vitest'
import {
  BOOKINGS_MAX,
  DAYS_AHEAD,
  EMAIL_MAX,
  LAST_BLOCK,
  NAME_MAX,
  SERVICES,
  SERVICE_IDS,
  blockTime,
  blocksNeeded,
  initialState,
  isWeekend,
  localToday,
  reduce,
  sampleTaken,
  slotsFor,
  validateBooking,
  visibleBookings,
  weekdaysFrom,
  type BookingInput,
  type ServiceId,
  type State,
} from './model'

// Monday 23 November 2026: a fixed "today", so nothing here depends on the day the tests run.
const TODAY = '2026-11-23'
const GOOD: BookingInput = { name: 'Sam Example', email: 'sam@example.test', service: 'consultation', day: '', time: '' }

/** A day and a start block that are free for a service, found the way the screen finds them. */
function freeSlot(service: ServiceId, state: State = initialState()) {
  for (const day of weekdaysFrom(TODAY)) {
    const slot = slotsFor(day, service, state.bookings).find((candidate) => candidate.free)
    if (slot) return { day, block: slot.block }
  }
  throw new Error('no free slot in the sample')
}
const input = (service: ServiceId, state: State = initialState()): BookingInput => {
  const { day, block } = freeSlot(service, state)
  return { ...GOOD, service, day, time: String(block) }
}

describe('Booking demo: days and times', () => {
  it('lists the next ten weekdays from today, skipping weekends, and starts today when today is a weekday', () => {
    const days = weekdaysFrom(TODAY)
    expect(days).toHaveLength(DAYS_AHEAD)
    expect(days[0]).toBe(TODAY)
    expect(days.some(isWeekend)).toBe(false)
    expect(days[5]).toBe('2026-11-30')
    // From a Saturday the first day offered is the Monday after.
    expect(weekdaysFrom('2026-11-21')[0]).toBe('2026-11-23')
  })

  it('writes the time of a half-hour block', () => {
    expect(blockTime(0)).toBe('09:00')
    expect(blockTime(1)).toBe('09:30')
    expect(blockTime(LAST_BLOCK)).toBe('16:30')
  })

  it('needs as many half hours as the service lasts, and the six sample services are the project’s', () => {
    expect(SERVICE_IDS).toHaveLength(6)
    expect(SERVICES.consultation).toEqual({ minutes: 30, dollars: 50 })
    expect(SERVICES['follow-up']).toEqual({ minutes: 15, dollars: 30 })
    expect(SERVICES.treatment).toEqual({ minutes: 60, dollars: 100 })
    expect(SERVICES.therapy.minutes).toBe(45)
    expect(blocksNeeded('follow-up')).toBe(1)
    expect(blocksNeeded('consultation')).toBe(1)
    expect(blocksNeeded('therapy')).toBe(2)
    expect(blocksNeeded('assessment')).toBe(2)
  })

  it('has a fixed pattern of taken times: the same answer every time, some taken and some free', () => {
    const day = '2026-11-24'
    const first = Array.from({ length: LAST_BLOCK + 1 }, (_, block) => sampleTaken(day, block))
    expect(Array.from({ length: LAST_BLOCK + 1 }, (_, block) => sampleTaken(day, block))).toEqual(first)
    expect(first.some(Boolean)).toBe(true)
    expect(first.some((taken) => !taken)).toBe(true)
  })

  it('offers no times on a weekend or on a day that is not a day, and ends every booking by 17:00', () => {
    expect(slotsFor('2026-11-28', 'consultation', [])).toEqual([])
    expect(slotsFor('2026-11-29', 'consultation', [])).toEqual([])
    expect(slotsFor('2026-02-30', 'consultation', [])).toEqual([])
    expect(slotsFor('not a day', 'consultation', [])).toEqual([])
    const long = slotsFor('2026-11-24', 'treatment', [])
    expect(long.at(-1)!.block).toBe(LAST_BLOCK - 1)
    const short = slotsFor('2026-11-24', 'follow-up', [])
    expect(short.at(-1)!.block).toBe(LAST_BLOCK)
  })

  it('marks a long service’s start as taken when any half hour it needs is taken, and a booking of the visitor’s own takes its blocks', () => {
    const day = '2026-11-24'
    const two = slotsFor(day, 'treatment', [])
    for (const slot of two) {
      const expected = !(sampleTaken(day, slot.block) || sampleTaken(day, slot.block + 1))
      expect(slot.free, `${day} ${slot.time}`).toBe(expected)
    }
    const state = reduce(initialState(), { type: 'book', value: { service: 'treatment', day: freeSlot('treatment').day, block: freeSlot('treatment').block, name: 'A B', email: 'a@b.test' } })
    const taken = slotsFor(freeSlot('treatment').day, 'consultation', state.bookings)
    expect(taken.find((slot) => slot.block === freeSlot('treatment').block)!.free).toBe(false)
    expect(taken.find((slot) => slot.block === freeSlot('treatment').block + 1)!.free).toBe(false)
    // A cancelled booking frees its blocks again.
    const cancelled = reduce(state, { type: 'status', id: 1, status: 'cancelled' })
    expect(slotsFor(freeSlot('treatment').day, 'consultation', cancelled.bookings).find((slot) => slot.block === freeSlot('treatment').block)!.free).toBe(true)
  })

  it('reads today in the visitor’s own time zone', () => {
    expect(localToday(new Date(2026, 10, 23, 23, 59))).toBe('2026-11-23')
    expect(localToday(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
  })
})

describe('Booking demo: what a visitor types', () => {
  it('accepts a complete booking and returns it cleaned', () => {
    const result = validateBooking({ ...input('consultation'), name: '  Sam   Example ', email: ' sam@example.test ' }, TODAY, [])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.name).toBe('Sam Example')
      expect(result.value.email).toBe('sam@example.test')
      expect(result.value.service).toBe('consultation')
    }
  })

  it('reports every missing field at once', () => {
    const result = validateBooking({ name: '', email: '', service: '', day: '', time: '' }, TODAY, [])
    expect(result).toEqual({ ok: false, errors: { name: 'required', email: 'required', service: 'required', day: 'required', time: 'required' } })
  })

  it('checks the name', () => {
    const errors = (name: string) => (validateBooking({ ...input('consultation'), name }, TODAY, []) as { errors: Record<string, string> }).errors.name
    expect(errors('A')).toBe('tooShort')
    expect(errors('x'.repeat(NAME_MAX + 1))).toBe('tooLong')
    expect(errors('Sam\u0000')).toBe('invalid')
    expect(errors('Sam\u0007')).toBe('invalid')
    expect(errors('   ')).toBe('required')
  })

  it('checks the email address', () => {
    const errors = (email: string) => (validateBooking({ ...input('consultation'), email }, TODAY, []) as { errors: Record<string, string> }).errors?.email
    for (const bad of ['sam', 'sam@', '@example.test', 'sam@example', 'sam example@x.test', 'sam@@x.test', 'sam@x.t', 'sam\n@x.test', 'a@b.test,c@d.test']) expect(errors(bad), bad).toBe('invalid')
    expect(errors(`${'a'.repeat(EMAIL_MAX)}@x.test`)).toBe('tooLong')
    for (const good of ['sam@example.test', 'first.last+tag@sub.example.test', 'a@b.co']) expect(errors(good), good).toBeUndefined()
  })

  it('checks the service, the day and the time', () => {
    const base = input('consultation')
    const run = (patch: Partial<BookingInput>) => (validateBooking({ ...base, ...patch }, TODAY, []) as { errors: Record<string, string> }).errors
    expect(run({ service: 'nope' })).toMatchObject({ service: 'invalid' })
    expect(run({ service: 'constructor' })).toMatchObject({ service: 'invalid' })
    expect(run({ day: '2026-11-20' })).toMatchObject({ day: 'past' })
    expect(run({ day: '2026-11-28' })).toMatchObject({ day: 'weekend' })
    expect(run({ day: '2027-01-04' })).toMatchObject({ day: 'tooFar' })
    expect(run({ day: '2026-13-01' })).toMatchObject({ day: 'invalid' })
    expect(run({ time: 'x' })).toMatchObject({ time: 'invalid' })
    expect(run({ time: '99' })).toMatchObject({ time: 'invalid' })
    expect(run({ time: '-1' })).toMatchObject({ time: 'invalid' })
  })

  it('refuses a time that is taken, in the sample or by an earlier booking of the visitor’s own', () => {
    const day = weekdaysFrom(TODAY).find((candidate) => slotsFor(candidate, 'consultation', []).some((slot) => !slot.free))!
    const taken = slotsFor(day, 'consultation', []).find((slot) => !slot.free)!
    expect((validateBooking({ ...GOOD, service: 'consultation', day, time: String(taken.block) }, TODAY, []) as { errors: Record<string, string> }).errors).toEqual({ time: 'unavailable' })

    const once = input('consultation')
    let state = initialState()
    const first = validateBooking(once, TODAY, state.bookings)
    if (!first.ok) throw new Error('first booking should pass')
    state = reduce(state, { type: 'book', value: first.value })
    expect((validateBooking(once, TODAY, state.bookings) as { errors: Record<string, string> }).errors).toEqual({ time: 'unavailable' })
  })

  it('treats markup in a name as text', () => {
    const result = validateBooking({ ...input('consultation'), name: '<img src=x onerror=alert(1)>' }, TODAY, [])
    expect(result.ok && result.value.name).toBe('<img src=x onerror=alert(1)>')
  })
})

describe('Booking demo: the list of sample bookings', () => {
  const book = (state: State, service: ServiceId, name: string): State => {
    const checked = validateBooking({ ...input(service, state), name }, TODAY, state.bookings)
    if (!checked.ok) throw new Error(`should be valid: ${JSON.stringify(checked.errors)}`)
    return reduce(state, { type: 'book', value: checked.value })
  }
  const nameOf = (service: ServiceId) => service

  it('records a booking as scheduled and remembers the last one for the summary', () => {
    const state = book(initialState(), 'consultation', 'Sam Example')
    expect(state.bookings).toHaveLength(1)
    expect(state.bookings[0]).toMatchObject({ id: 1, status: 'scheduled', name: 'Sam Example' })
    expect(state.last?.id).toBe(1)
    expect(reduce(state, { type: 'dismiss' }).last).toBeNull()
  })

  it('changes a status, filters by status and searches by name or service, in a stable order', () => {
    let state = initialState()
    state = book(state, 'consultation', 'Alice Dune')
    state = book(state, 'treatment', 'Bob Marsh')
    state = book(state, 'check-up', 'Cleo Vale')
    state = reduce(state, { type: 'status', id: 2, status: 'completed' })
    state = reduce(state, { type: 'status', id: 3, status: 'cancelled' })
    expect(visibleBookings(state, nameOf).map((b) => b.id).sort()).toEqual([1, 2, 3])
    expect(visibleBookings(reduce(state, { type: 'filter', status: 'completed' }), nameOf).map((b) => b.name)).toEqual(['Bob Marsh'])
    expect(visibleBookings(reduce(state, { type: 'filter', status: 'cancelled' }), nameOf).map((b) => b.name)).toEqual(['Cleo Vale'])
    expect(visibleBookings(reduce(state, { type: 'search', text: 'bob' }), nameOf).map((b) => b.name)).toEqual(['Bob Marsh'])
    expect(visibleBookings(reduce(state, { type: 'search', text: 'CHECK' }), nameOf).map((b) => b.name)).toEqual(['Cleo Vale'])
    expect(visibleBookings(reduce(state, { type: 'search', text: 'nobody' }), nameOf)).toEqual([])
    const order = visibleBookings(state, nameOf)
    for (let i = 1; i < order.length; i += 1) expect(order[i - 1].day + String(order[i - 1].block).padStart(2, '0') <= order[i].day + String(order[i].block).padStart(2, '0')).toBe(true)
  })

  it('stops at its limit, so the page cannot be filled without end', () => {
    let state = initialState()
    for (let i = 0; i < BOOKINGS_MAX; i += 1) state = reduce(state, { type: 'book', value: { service: 'follow-up', day: TODAY, block: i % 10, name: `N${i}`, email: 'a@b.test' } })
    expect(state.bookings).toHaveLength(BOOKINGS_MAX)
    expect(reduce(state, { type: 'book', value: { service: 'follow-up', day: TODAY, block: 0, name: 'Extra', email: 'a@b.test' } }).bookings).toHaveLength(BOOKINGS_MAX)
  })

  it('shares nothing between two demos, never changes the state it was given, and a restart is a fresh start', () => {
    const a = initialState()
    const b = initialState()
    const before = JSON.stringify(a)
    const next = reduce(a, { type: 'book', value: { service: 'follow-up', day: TODAY, block: 0, name: 'Sam', email: 'a@b.test' } })
    expect(JSON.stringify(a)).toBe(before)
    expect(b.bookings).toEqual([])
    expect(next.bookings).toHaveLength(1)
    expect(initialState()).toEqual(a)
  })

  it('bounds the search text', () => {
    expect(reduce(initialState(), { type: 'search', text: 'x'.repeat(500) }).search).toHaveLength(60)
  })
})
