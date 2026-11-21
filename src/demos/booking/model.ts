/**
 * The booking demo's model: plain functions over plain data. The behaviour reproduced from BookingHub is its public booking form (name, email, one of six
 * sample services with a duration and a price, a date from today and a time, required-field and e-mail checks, then a summary) and its appointment list with a
 * status filter, search and status changes. The "availability" is NOT BookingHub's: the real app has no availability or conflict check. It is a labelled
 * illustration the demo adds, made of a fixed pattern of taken times, so a visitor can see how a picker that knows about conflicts would feel.
 */

export const SERVICE_IDS = ['consultation', 'follow-up', 'treatment', 'check-up', 'therapy', 'assessment'] as const
export type ServiceId = (typeof SERVICE_IDS)[number]

/** The six sample services of the project, with the duration and the price (US dollars, as in the project) it lists. */
export const SERVICES: Readonly<Record<ServiceId, { minutes: number; dollars: number }>> = {
  consultation: { minutes: 30, dollars: 50 },
  'follow-up': { minutes: 15, dollars: 30 },
  treatment: { minutes: 60, dollars: 100 },
  'check-up': { minutes: 30, dollars: 40 },
  therapy: { minutes: 45, dollars: 80 },
  assessment: { minutes: 60, dollars: 120 },
}

/** Times start every half hour from 09:00 and a booking ends by 17:00. */
export const FIRST_BLOCK = 0
export const LAST_BLOCK = 15 // 16:30
export const BLOCK_MINUTES = 30
/** How many weekdays ahead a visitor can pick. */
export const DAYS_AHEAD = 10

export const NAME_MAX = 80
export const EMAIL_MAX = 120
export const BOOKINGS_MAX = 40

export const blockTime = (block: number): string => {
  const minutes = 9 * 60 + block * BLOCK_MINUTES
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

export const blocksNeeded = (service: ServiceId): number => Math.ceil(SERVICES[service].minutes / BLOCK_MINUTES)

// ── Days ────────────────────────────────────────────────────────────────────

const toDate = (day: string): Date => new Date(`${day}T00:00:00Z`)
const toDay = (date: Date): string => date.toISOString().slice(0, 10)

export const isDay = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toDate(value).getTime()) && toDay(toDate(value)) === value

/** Today as a calendar day in the visitor's own time zone (`YYYY-MM-DD`). */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export const isWeekend = (day: string): boolean => {
  const weekday = toDate(day).getUTCDay()
  return weekday === 0 || weekday === 6
}

/** The next `count` weekdays, starting today when today is one. */
export function weekdaysFrom(today: string, count = DAYS_AHEAD): string[] {
  const out: string[] = []
  const cursor = toDate(today)
  while (out.length < count) {
    const day = toDay(cursor)
    if (!isWeekend(day)) out.push(day)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out
}

// ── Sample availability ─────────────────────────────────────────────────────

/** Whether a half-hour block is taken in the sample pattern. Deterministic: the same day and block always give the same answer. */
export function sampleTaken(day: string, block: number): boolean {
  const dayNumber = Math.floor(toDate(day).getTime() / 86_400_000)
  return (dayNumber * 31 + block * 17 + 5) % 7 < 2
}

export type BookingStatus = 'scheduled' | 'completed' | 'cancelled'

export interface Booking {
  id: number
  service: ServiceId
  day: string
  block: number
  name: string
  email: string
  status: BookingStatus
}

/** The blocks a booking occupies. */
export const occupied = (booking: Pick<Booking, 'service' | 'block'>): number[] => Array.from({ length: blocksNeeded(booking.service) }, (_, i) => booking.block + i)

export interface Slot {
  block: number
  time: string
  free: boolean
}

/** Every start time of a day for a service, and whether the whole stretch is free (not in the sample pattern, not one of the visitor's own bookings). */
export function slotsFor(day: string, service: ServiceId, bookings: readonly Booking[]): Slot[] {
  if (!isDay(day) || isWeekend(day)) return []
  const need = blocksNeeded(service)
  const mine = new Set(bookings.filter((b) => b.day === day && b.status !== 'cancelled').flatMap(occupied))
  const out: Slot[] = []
  for (let block = FIRST_BLOCK; block + need - 1 <= LAST_BLOCK; block += 1) {
    let free = true
    for (let k = 0; k < need; k += 1) if (sampleTaken(day, block + k) || mine.has(block + k)) free = false
    out.push({ block, time: blockTime(block), free })
  }
  return out
}

// ── Validation ──────────────────────────────────────────────────────────────

export type BookingField = 'name' | 'email' | 'service' | 'day' | 'time'
export type BookingError = 'required' | 'invalid' | 'tooShort' | 'tooLong' | 'past' | 'weekend' | 'tooFar' | 'unavailable'

export interface BookingInput {
  name: string
  email: string
  service: string
  day: string
  /** The start block as typed by the picker, or `''`. */
  time: string
}

// Refusing control characters in typed text is the point of this expression.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type BookingResult = { ok: true; value: Omit<Booking, 'id' | 'status'> } | { ok: false; errors: Partial<Record<BookingField, BookingError>> }

/** Everything the form sends, checked at once; every problem is reported so every field can be marked. */
export function validateBooking(input: BookingInput, today: string, bookings: readonly Booking[]): BookingResult {
  const errors: Partial<Record<BookingField, BookingError>> = {}

  const name = input.name.replace(/\s+/g, ' ').trim()
  if (name === '') errors.name = 'required'
  else if (CONTROL.test(name)) errors.name = 'invalid'
  else if ([...name].length < 2) errors.name = 'tooShort'
  else if ([...name].length > NAME_MAX) errors.name = 'tooLong'

  const email = input.email.trim()
  if (email === '') errors.email = 'required'
  else if (email.length > EMAIL_MAX) errors.email = 'tooLong'
  else if (CONTROL.test(email) || !EMAIL.test(email)) errors.email = 'invalid'

  const service = (SERVICE_IDS as readonly string[]).includes(input.service) ? (input.service as ServiceId) : null
  if (!service) errors.service = input.service === '' ? 'required' : 'invalid'

  const day = input.day.trim()
  const last = weekdaysFrom(today).at(-1) ?? today
  if (day === '') errors.day = 'required'
  else if (!isDay(day)) errors.day = 'invalid'
  else if (day < today) errors.day = 'past'
  else if (isWeekend(day)) errors.day = 'weekend'
  else if (day > last) errors.day = 'tooFar'

  let block = -1
  if (input.time === '') errors.time = 'required'
  else if (!/^\d{1,2}$/.test(input.time)) errors.time = 'invalid'
  else block = Number(input.time)

  if (!errors.day && !errors.service && !errors.time && service) {
    const slot = slotsFor(day, service, bookings).find((candidate) => candidate.block === block)
    if (!slot) errors.time = 'invalid'
    else if (!slot.free) errors.time = 'unavailable'
  }

  if (Object.keys(errors).length > 0 || !service) return { ok: false, errors }
  return { ok: true, value: { service, day, block, name, email } }
}

// ── The demo's state ────────────────────────────────────────────────────────

export interface State {
  bookings: Booking[]
  nextId: number
  /** The last booking made, for the summary screen. */
  last: Booking | null
  statusFilter: 'all' | BookingStatus
  search: string
}

export const initialState = (): State => ({ bookings: [], nextId: 1, last: null, statusFilter: 'all', search: '' })

export type Action =
  | { type: 'book'; value: Omit<Booking, 'id' | 'status'> }
  | { type: 'status'; id: number; status: BookingStatus }
  | { type: 'filter'; status: 'all' | BookingStatus }
  | { type: 'search'; text: string }
  | { type: 'dismiss' }

export function reduce(state: State, action: Action): State {
  switch (action.type) {
    case 'book': {
      if (state.bookings.length >= BOOKINGS_MAX) return state
      const booking: Booking = { ...action.value, id: state.nextId, status: 'scheduled' }
      return { ...state, bookings: [...state.bookings, booking], nextId: state.nextId + 1, last: booking }
    }
    case 'status':
      return { ...state, bookings: state.bookings.map((booking) => (booking.id === action.id ? { ...booking, status: action.status } : booking)) }
    case 'filter':
      return { ...state, statusFilter: action.status }
    case 'search':
      return { ...state, search: action.text.slice(0, 60) }
    case 'dismiss':
      return { ...state, last: null }
  }
}

export function visibleBookings(state: State, nameOf: (service: ServiceId) => string): Booking[] {
  const needle = state.search.trim().toLowerCase()
  return state.bookings
    .filter((booking) => state.statusFilter === 'all' || booking.status === state.statusFilter)
    .filter((booking) => needle === '' || booking.name.toLowerCase().includes(needle) || nameOf(booking.service).toLowerCase().includes(needle))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.block - b.block || a.id - b.id))
}
