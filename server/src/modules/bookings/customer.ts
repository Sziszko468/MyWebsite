import type { Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { HttpError, notFound, validationFailed } from '../../http/errors.ts'
import { isActive, loadSettings, type BookingRow, type BookingStatus } from './model.ts'
import { eventsOf, findBookingToken, getBooking, openChangeOf, tokenState, typeById, type BookingEventType } from './repository.ts'
import { answerProposal, changeAllowance, expireChanges, parseDate, parseInstant, parseMessage, publicDays, requestCancellation, requestReschedule, withdrawRequest, type PublicDay } from './service.ts'

/**
 * What a customer can do with the secure link to their booking. Everything is reached through the secret in the address and nothing else: a
 * reference, an e-mail address or a guess opens nothing. An unknown token and a wrong one are answered alike (404, and a guess costs the guesser);
 * a link that WAS real but no longer works says so (410, with a reason), so the person holding it knows to look for a newer message.
 *
 * Nothing here returns what the owner wrote privately, the address the booking was made from, or anything about another booking.
 */

const invalid = () => new HttpError(404, 'not_found', 'This link is not valid.')
const gone = (reason: 'expired' | 'revoked') => new HttpError(410, 'gone', reason === 'expired' ? 'This link has expired.' : 'This link has been replaced or withdrawn.', { details: { reason } })

/** A made-up or wrong token costs the asker: after a handful they wait. */
function missed(app: AppContext, ip: string): never {
  app.limiters.check('tokenMiss', ip)
  throw invalid()
}

function resolve(app: AppContext, raw: string, ip: string): BookingRow {
  const token = findBookingToken(app.db, raw)
  if (!token) return missed(app, ip)
  const state = tokenState(app, token)
  if (state === 'revoked') throw gone('revoked')
  if (state === 'expired') throw gone('expired')
  const booking = getBooking(app.db, token.booking_id)
  if (!booking) return missed(app, ip)
  return booking
}

/** What a customer's page may say about the history: the moments that concern them, with times and no names. */
const VISIBLE: ReadonlySet<BookingEventType> = new Set(['created', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show', 'change_requested', 'change_declined', 'change_withdrawn', 'change_expired'])

export interface BookingPage {
  reference: string
  status: BookingStatus
  /** Alive: it still holds its time. */
  active: boolean
  language: Language
  type: { code: string; name: string; description: string }
  durationMinutes: number
  startAt: string
  endAt: string
  timeZone: string
  name: string
  company: string | null
  website: string | null
  description: string | null
  cancellation: { by: 'customer' | 'owner'; at: string; note: string | null } | null
  policy: {
    cancel: { allowed: boolean; reason: string | null }
    reschedule: { allowed: boolean; reason: string | null }
    /** Whether the owner answers a request (true) or it is carried out at once (false). */
    approvalRequired: boolean
  }
  /** The one open request or proposal, if any. */
  change: {
    kind: 'cancel' | 'reschedule'
    initiator: 'customer' | 'owner'
    newStartAt: string | null
    newEndAt: string | null
    message: string | null
    expiresAt: string | null
    /** The customer may take their own request back / answer the owner's proposal. */
    canWithdraw: boolean
    canAnswer: boolean
  } | null
  history: { type: BookingEventType; at: string; fromStart: string | null; toStart: string | null; by: 'customer' | 'owner' | 'system' }[]
}

export function pageOf(app: AppContext, booking: BookingRow): BookingPage {
  expireChanges(app)
  const current = getBooking(app.db, booking.id) ?? booking
  const type = typeById(app.db, current.consultation_type_id)
  const settings = loadSettings(app.db)
  const change = openChangeOf(app.db, current.id)
  const verdict = (kind: 'cancel' | 'reschedule') => {
    const answer = changeAllowance(app, current, kind, settings)
    return { allowed: answer.allowed, reason: answer.allowed ? null : answer.reason }
  }
  return {
    reference: current.reference,
    status: current.status,
    active: isActive(current.status),
    language: current.language,
    // The words of the booking's own language, never another's.
    type: { code: type?.code ?? '', name: type?.translations[current.language].name ?? '', description: type?.translations[current.language].description ?? '' },
    durationMinutes: Math.round((Date.parse(current.end_at) - Date.parse(current.start_at)) / 60_000),
    startAt: current.start_at,
    endAt: current.end_at,
    timeZone: current.time_zone,
    name: current.name,
    company: current.company,
    website: current.website,
    description: current.description,
    cancellation: current.status === 'cancelled' && current.cancelled_at && current.cancelled_by ? { by: current.cancelled_by, at: current.cancelled_at, note: current.cancellation_note } : null,
    policy: { cancel: verdict('cancel'), reschedule: verdict('reschedule'), approvalRequired: settings.approvalRequired },
    change: change
      ? { kind: change.kind, initiator: change.initiator, newStartAt: change.new_start_at, newEndAt: change.new_end_at, message: change.message, expiresAt: change.expires_at, canWithdraw: change.initiator === 'customer', canAnswer: change.initiator === 'owner' && change.kind === 'reschedule' }
      : null,
    history: eventsOf(app.db, current.id)
      .filter((event) => VISIBLE.has(event.event_type))
      .map((event) => ({ type: event.event_type, at: event.created_at, fromStart: event.from_start_at, toStart: event.to_start_at, by: event.actor_type === 'admin' ? ('owner' as const) : event.actor_type })),
  }
}

export function viewBooking(app: AppContext, raw: string, ip: string): BookingPage {
  return pageOf(app, resolve(app, raw, ip))
}

/** The days a booking could be moved to: the same availability as for a new booking, with the booking's own time not in the way. */
export function daysForReschedule(app: AppContext, raw: string, query: URLSearchParams, ip: string): PublicDay[] {
  const booking = resolve(app, raw, ip)
  const type = typeById(app.db, booking.consultation_type_id)
  if (!type) throw notFound('The consultation type')
  const from = parseDate(query.get('from'))
  const to = parseDate(query.get('to'))
  if (!from || !to) throw validationFailed({ [from ? 'to' : 'from']: 'invalid' })
  const allowance = changeAllowance(app, booking, 'reschedule')
  if (!allowance.allowed) throw new HttpError(409, 'conflict', 'This booking cannot be moved online.', { details: { reason: allowance.reason } })
  return publicDays(app, { ...type, durationMinutes: Math.round((Date.parse(booking.end_at) - Date.parse(booking.start_at)) / 60_000) }, from, to, booking.id)
}

export type CustomerAction = { action: 'cancel'; message: string | null } | { action: 'reschedule'; start: number; message: string | null } | { action: 'withdraw' } | { action: 'accept' } | { action: 'decline' }

export function parseAction(body: Record<string, unknown>): CustomerAction {
  switch (body.action) {
    case 'cancel':
      return { action: 'cancel', message: parseMessage(body.message) }
    case 'reschedule': {
      const start = parseInstant(body.start)
      if (start === null) throw validationFailed({ start: body.start === undefined ? 'required' : 'invalid' })
      return { action: 'reschedule', start, message: parseMessage(body.message) }
    }
    case 'withdraw':
    case 'accept':
    case 'decline':
      return { action: body.action }
    default:
      throw validationFailed({ action: 'invalid' })
  }
}

export interface ActionResult {
  outcome: 'requested' | 'done' | 'withdrawn' | 'accepted' | 'declined'
  booking: BookingPage
}

export function act(app: AppContext, raw: string, input: CustomerAction, ip: string): ActionResult {
  const booking = resolve(app, raw, ip)
  let outcome: ActionResult['outcome']
  switch (input.action) {
    case 'cancel':
      outcome = requestCancellation(app, booking, input.message)
      break
    case 'reschedule':
      outcome = requestReschedule(app, booking, input.start, input.message)
      break
    case 'withdraw':
      withdrawRequest(app, booking)
      outcome = 'withdrawn'
      break
    case 'accept':
      outcome = answerProposal(app, booking, true)
      break
    case 'decline':
      outcome = answerProposal(app, booking, false)
      break
  }
  return { outcome, booking: pageOf(app, booking) }
}
