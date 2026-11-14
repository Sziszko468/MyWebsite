import { LANGUAGES, type Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { ConstraintError, HttpError, validationFailed } from '../../http/errors.ts'
import { hmacHex, newId, sha256Hex } from '../../lib/crypto.ts'
import { cleanBlock, countLinks } from '../../lib/text.ts'
import { addMs, HOUR, iso } from '../../lib/time.ts'
import { Fields, isEmail } from '../../lib/validate.ts'
import { normalizeEmail } from '../auth/users.ts'
import type { BookingMailKind } from '../notifications/bookingTemplates.ts'
import { availableDays, findFreeSlot, type Slot } from './availability.ts'
import { canMove, closedReasons, isActive, loadSettings, type BookingRow, type BookingSettings, type BookingStatus, type ChangeRow } from './model.ts'
import { getBooking, nextBookingReference, openChangeOf, recordBookingEvent, typeByCode, typeById, type BookingActor, type BookingEventType, type TypeView } from './repository.ts'
import { addDays, isDateKey, localDateKey, type DateKey } from './zone.ts'

/**
 * Everything that changes a booking. Each function runs in one transaction (the database has one writer, so what a function checks is still true
 * when it writes), writes the history line of what it did, and queues the e-mails that line announces. Nothing here decides WHO may ask: the
 * administration's functions (admin.ts) check the session, the visitor's (customer.ts) check the secret link; both call these.
 */

/** Most bookings a single e-mail address may have alive and in the future at once: against one person (or script) taking every slot. */
export const MAX_ACTIVE_PER_ADDRESS = 3
/** The longest range of days one availability request may ask for. */
export const MAX_RANGE_DAYS = 62

export const BOOKING_LIMITS = {
  name: { min: 2, max: 100 },
  email: { max: 254 },
  company: { max: 120 },
  website: { max: 200 },
  description: { max: 1500 },
  reference: { max: 40 },
  message: { max: 600 },
} as const

const closed = () => new HttpError(409, 'conflict', 'Online booking is not available right now.', { details: { reason: 'closed' } })
const taken = () => new HttpError(409, 'conflict', 'That time is no longer available. Please choose another.', { details: { reason: 'slot_unavailable' } })
const refused = (reason: string, message = 'This booking cannot be changed that way.') => new HttpError(409, 'conflict', message, { details: { reason } })

/** An ISO 8601 moment WITH a zone (`Z` or an offset); a bare local time is refused, because its meaning would depend on the machine that reads it. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/

export function parseInstant(value: unknown): number | null {
  if (typeof value !== 'string' || value.length > 40 || !INSTANT.test(value)) return null
  const at = Date.parse(value)
  return Number.isNaN(at) ? null : at
}

export function parseDate(value: unknown): DateKey | null {
  return typeof value === 'string' && isDateKey(value) ? value : null
}

/** A violated "never two at once" trigger is the same answer as a slot somebody else took a moment earlier. */
function guardOverlap<T>(work: () => T): T {
  try {
    return work()
  } catch (error) {
    if (error instanceof ConstraintError && /booking_overlap/.test(error.message)) throw taken()
    throw error
  }
}

// ---- the public booking ---------------------------------------------------------------------------------------------------------------

export interface BookingInput {
  language: Language
  typeCode: string
  start: number
  name: string
  email: string
  company: string | null
  website: string | null
  description: string | null
  relatedReference: string | null
  consent: boolean
  idempotencyKey: string | null
}

const KEY = /^[A-Za-z0-9_-]{8,80}$/
const CODE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/
const REFERENCE = /^[A-Za-z0-9-]+$/

export function parseBooking(body: Record<string, unknown>, requireConsent: boolean, headerKey: string | null): BookingInput {
  const fields = new Fields(body)
  const language = fields.oneOf('language', LANGUAGES, { required: true })
  const typeCode = fields.text('type', { max: 40, required: true }, (value) => (CODE.test(value) ? undefined : 'invalid'))
  const startValue = body.start
  const start = parseInstant(startValue)
  if (start === null) fields.fail('start', startValue === undefined || startValue === null || startValue === '' ? 'required' : 'invalid')
  const name = fields.text('name', { ...BOOKING_LIMITS.name, required: true })
  const email = fields.text('email', { max: BOOKING_LIMITS.email.max, required: true }, (value) => (isEmail(value) ? undefined : 'invalidEmail'))
  const company = fields.text('company', BOOKING_LIMITS.company)
  const website = fields.url('website', BOOKING_LIMITS.website)
  const description = fields.text('description', { ...BOOKING_LIMITS.description, multiline: true })
  const relatedReference = fields.text('relatedReference', BOOKING_LIMITS.reference, (value) => (REFERENCE.test(value) ? undefined : 'invalid'))
  const consent = fields.consent('consent', requireConsent)
  const bodyKey = body.idempotencyKey
  let idempotencyKey: string | null = null
  const candidate = typeof bodyKey === 'string' && bodyKey !== '' ? bodyKey : headerKey
  if (candidate !== null && candidate !== undefined) {
    if (KEY.test(candidate)) idempotencyKey = candidate
    else fields.fail('idempotencyKey', 'invalid')
  }
  // A field no person sees: filled in, it is a script.
  const trap = body.nickname
  if (typeof trap === 'string' && trap.trim() !== '') throw new HttpError(422, 'spam_suspected', 'The booking was not accepted.')
  if (countLinks(description ?? '') > 3) throw new HttpError(422, 'spam_suspected', 'The booking was not accepted.')
  fields.done()
  return { language: language!, typeCode: typeCode!, start: start!, name: name!, email: normalizeEmail(email!), company, website, description, relatedReference, consent, idempotencyKey }
}

export interface BookingReceipt {
  reference: string
  status: BookingStatus
  type: { code: string; name: string }
  startAt: string
  endAt: string
  timeZone: string
  durationMinutes: number
  language: Language
  /** Whether a confirmation e-mail was queued: the page says so only when it is true, and never claims it arrived. */
  confirmationEmail: boolean
  /** The booking was already made by this very submission (a double click, a retry). */
  duplicate: boolean
}

function receiptOf(booking: BookingRow, type: TypeView, confirmationEmail: boolean, duplicate: boolean): BookingReceipt {
  return {
    reference: booking.reference,
    status: booking.status,
    type: { code: type.code, name: type.translations[booking.language].name },
    startAt: booking.start_at,
    endAt: booking.end_at,
    timeZone: booking.time_zone,
    durationMinutes: type.durationMinutes ?? Math.round((Date.parse(booking.end_at) - Date.parse(booking.start_at)) / 60_000),
    language: booking.language,
    confirmationEmail,
    duplicate,
  }
}

/** Makes the booking, or says why not. The slot is worked out again here, inside the transaction that writes: what the page showed is only a hint. */
export function createBooking(app: AppContext, input: BookingInput, ipHash: string): BookingReceipt {
  const { db, clock, notifier } = app
  return db.transaction(() => {
    const now = clock.now()
    const settings = loadSettings(db)
    if (closedReasons(db, settings).length > 0 || settings.timeZone === null) throw closed()
    const type = typeByCode(db, input.typeCode)
    // A type that does not exist, is switched off or has no words in this language is answered like a made-up one.
    if (!type || !type.enabled || type.durationMinutes === null || type.translations[input.language].name.trim() === '') throw new HttpError(404, 'not_found', 'The consultation type was not found.')

    const fingerprint = sha256Hex(JSON.stringify([type.code, input.start, input.email]))
    if (input.idempotencyKey) {
      const earlier = db.get<BookingRow>('SELECT * FROM bookings WHERE idempotency_key = ?', [input.idempotencyKey])
      if (earlier) {
        if (earlier.request_hash !== fingerprint) throw new HttpError(409, 'conflict', 'This submission key was already used for a different booking.', { details: { reason: 'key_reused' } })
        return receiptOf(earlier, type, false, true)
      }
    }
    expireChanges(app)

    const alive = db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM bookings WHERE email = ? COLLATE NOCASE AND status IN ('pending', 'confirmed', 'reschedule_requested', 'rescheduled') AND end_at > ?`,
      [input.email, iso(now)],
    )?.n ?? 0
    if (alive >= MAX_ACTIVE_PER_ADDRESS) throw validationFailed({ email: 'tooMany' })

    const slot = findFreeSlot(db, settings, { id: type.id, duration_minutes: type.durationMinutes }, now.getTime(), input.start)
    if (!slot) throw taken()

    const status: BookingStatus = settings.confirmation === 'automatic' ? 'confirmed' : 'pending'
    const reference = nextBookingReference(db, now)
    const id = newId()
    // A reference the visitor typed is matched to a quote request only when the e-mail address is the same one: the answer must not tell a stranger which references exist.
    const quote = input.relatedReference ? db.get<{ id: string }>('SELECT id FROM quote_requests WHERE reference = ? COLLATE NOCASE AND email = ? COLLATE NOCASE', [input.relatedReference, input.email]) : undefined
    const stamp = iso(now)
    guardOverlap(() =>
      db.run(
        `INSERT INTO bookings (id, reference, consultation_type_id, language, name, email, company, website, description, start_at, end_at, time_zone, status, related_reference, quote_request_id,
           idempotency_key, request_hash, ip_hash, consent_at, created_at, updated_at, confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, reference, type.id, input.language, input.name, input.email, input.company, input.website, input.description, iso(new Date(slot.start)), iso(new Date(slot.end)), settings.timeZone, status, input.relatedReference, quote?.id ?? null, input.idempotencyKey, fingerprint, ipHash, input.consent ? stamp : null, stamp, stamp, status === 'confirmed' ? stamp : null],
      ),
    )
    const booking = getBooking(db, id)!
    const eventId = recordBookingEvent(db, clock, { booking, type: 'created', actor: { type: 'customer' }, to: status, toStart: booking.start_at, summary: status === 'confirmed' ? 'automatic' : 'awaiting_owner' })
    const queued = notifier.queueBookingMails({ eventId, customerEmail: booking.email, customerLanguage: booking.language, customer: status === 'confirmed' ? 'booking_confirmed' : 'booking_received', owner: 'booking_new_admin' })
    return receiptOf(booking, type, queued, false)
  })
}

// ---- what is free ---------------------------------------------------------------------------------------------------------------------

export interface PublicDay {
  date: DateKey
  status: 'available' | 'full' | 'closed'
  slots: { start: string; end: string; ambiguous: boolean }[]
}

/** The days from `from` to `to`, as the public page may see them: free slots only, nothing about who or what took the rest. */
export function publicDays(app: AppContext, type: TypeView, from: DateKey, to: DateKey, exclude: string | null = null): PublicDay[] {
  const settings = loadSettings(app.db)
  if (closedReasons(app.db, settings).length > 0 || type.durationMinutes === null) throw closed()
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  if (to < from || span >= MAX_RANGE_DAYS) throw validationFailed({ to: 'invalid' })
  return availableDays(app.db, settings, { id: type.id, duration_minutes: type.durationMinutes }, app.clock.now().getTime(), from, to, exclude).map((day) => ({
    date: day.date,
    status: day.status,
    slots: day.slots.map((slot) => ({ start: iso(new Date(slot.start)), end: iso(new Date(slot.end)), ambiguous: slot.ambiguous })),
  }))
}

// ---- state changes ---------------------------------------------------------------------------------------------------------------------

/** The one place a booking's state is written: it asks the state machine first. */
function writeState(app: AppContext, booking: BookingRow, to: BookingStatus, fields: Record<string, string | null> = {}): BookingRow {
  if (booking.status !== to && !canMove(booking.status, to)) throw refused('state')
  if (booking.status === to && to !== 'rescheduled') throw refused('state')
  const stamp = iso(app.clock.now())
  const values: Record<string, string | null> = { status: to, updated_at: stamp, ...fields }
  const names = Object.keys(values)
  // The column names are this file's own constants (never a request's); only the values are parameters.
  const columns = names.map((name) => `${name} = ?`).join(', ')
  guardOverlap(() => app.db.run(`UPDATE bookings SET ${columns} WHERE id = ?`, [...names.map((name) => values[name]), booking.id]))
  return getBooking(app.db, booking.id)!
}

function closeChange(app: AppContext, change: ChangeRow, status: ChangeRow['status'], by: NonNullable<ChangeRow['decided_by']>): void {
  app.db.run('UPDATE booking_changes SET status = ?, decided_at = ?, decided_by = ? WHERE id = ? AND status = ?', [status, iso(app.clock.now()), by, change.id, 'open'])
}

const eventFor = (app: AppContext, booking: BookingRow, type: BookingEventType, actor: BookingActor, extra: { from?: BookingStatus | null; to?: BookingStatus | null; fromStart?: string | null; toStart?: string | null; changeId?: string | null; summary?: string | null } = {}): number =>
  recordBookingEvent(app.db, app.clock, { booking, type, actor, ...extra })

/** An open change whose time has passed (an owner's proposal nobody answered) is closed, and the booking goes back to what it was. */
export function expireChanges(app: AppContext): number {
  const now = iso(app.clock.now())
  const due = app.db.all<ChangeRow>("SELECT * FROM booking_changes WHERE status = 'open' AND expires_at IS NOT NULL AND expires_at <= ?", [now])
  for (const change of due) {
    app.db.transaction(() => {
      const booking = getBooking(app.db, change.booking_id)
      closeChange(app, change, 'expired', 'system')
      if (booking && change.kind === 'reschedule' && booking.status === 'reschedule_requested') writeState(app, booking, change.booking_status_before)
      if (booking) eventFor(app, booking, 'change_expired', { type: 'system' }, { from: booking.status, to: change.booking_status_before, changeId: change.id, summary: 'proposal_expired' })
    })
  }
  return due.length
}

/** Ends an open change when the booking itself ends (cancelled, completed, no show): a cancel request is granted, anything else is withdrawn. */
function settleOpenChange(app: AppContext, booking: BookingRow, outcome: 'cancelled' | 'finished', actor: BookingActor): void {
  const open = openChangeOf(app.db, booking.id)
  if (!open) return
  const by = actor.type === 'admin' ? 'owner' : actor.type
  if (open.kind === 'cancel' && outcome === 'cancelled') closeChange(app, open, 'applied', by)
  else {
    closeChange(app, open, 'withdrawn', by)
    eventFor(app, booking, 'change_withdrawn', actor, { changeId: open.id, summary: 'booking_ended' })
  }
}

function mails(app: AppContext, booking: BookingRow, eventId: number, kinds: { customer?: BookingMailKind; owner?: BookingMailKind; note?: string | null }): boolean {
  return app.notifier.queueBookingMails({ eventId, customerEmail: booking.email, customerLanguage: booking.language, ...kinds })
}

/** The owner confirms a booking that was waiting. */
export function confirmBooking(app: AppContext, booking: BookingRow, actor: BookingActor): BookingRow {
  return app.db.transaction(() => {
    const stamp = iso(app.clock.now())
    const next = writeState(app, booking, 'confirmed', { confirmed_at: stamp })
    const eventId = eventFor(app, next, 'confirmed', actor, { from: booking.status, to: 'confirmed', toStart: next.start_at })
    mails(app, next, eventId, { customer: 'booking_confirmed' })
    return next
  })
}

/** A booking ends in cancellation: by the owner, or by the customer (who asked for it, or whose request the owner granted). */
export function cancelBooking(app: AppContext, booking: BookingRow, by: 'owner' | 'customer', actor: BookingActor, note: string | null, mail: { customer: boolean; owner: boolean }): BookingRow {
  return app.db.transaction(() => {
    const stamp = iso(app.clock.now())
    settleOpenChange(app, booking, 'cancelled', actor)
    const next = writeState(app, booking, 'cancelled', { cancelled_at: stamp, cancelled_by: by, cancellation_note: note })
    const eventId = eventFor(app, next, 'cancelled', actor, { from: booking.status, to: 'cancelled', fromStart: booking.start_at })
    mails(app, next, eventId, { ...(mail.customer ? { customer: 'booking_cancelled' as const } : {}), ...(mail.owner ? { owner: 'booking_cancelled_admin' as const } : {}), note: by === 'owner' ? note : null })
    return next
  })
}

/** The owner closes a booking that took place (or that the customer did not come to). Only after it started. */
export function finishBooking(app: AppContext, booking: BookingRow, to: 'completed' | 'no_show', actor: BookingActor): BookingRow {
  return app.db.transaction(() => {
    if (Date.parse(booking.start_at) > app.clock.now().getTime()) throw refused('not_started', 'A booking can be closed only after it has started.')
    settleOpenChange(app, booking, 'finished', actor)
    const stamp = iso(app.clock.now())
    const next = writeState(app, booking, to, to === 'completed' ? { completed_at: stamp } : {})
    eventFor(app, next, to, actor, { from: booking.status, to })
    return next
  })
}

/** Moves a booking to a slot that is free (the caller has checked) and records the change that asked for it. */
function applyMove(app: AppContext, booking: BookingRow, slot: Pick<Slot, 'start' | 'end'>, change: ChangeRow, actor: BookingActor): { booking: BookingRow; eventId: number } {
  const next = writeState(app, booking, 'rescheduled', { start_at: iso(new Date(slot.start)), end_at: iso(new Date(slot.end)) })
  const eventId = eventFor(app, next, 'rescheduled', actor, { from: booking.status, to: 'rescheduled', fromStart: booking.start_at, toStart: next.start_at, changeId: change.id })
  return { booking: next, eventId }
}

function insertChange(app: AppContext, booking: BookingRow, input: { kind: ChangeRow['kind']; initiator: ChangeRow['initiator']; status: ChangeRow['status']; slot?: Pick<Slot, 'start' | 'end'>; message: string | null; expiresAt?: string | null; by?: ChangeRow['decided_by'] }): ChangeRow {
  const id = newId()
  const stamp = iso(app.clock.now())
  guardOverlap(() =>
    app.db.run(
      `INSERT INTO booking_changes (id, booking_id, kind, initiator, status, new_start_at, new_end_at, message, booking_status_before, expires_at, created_at, decided_at, decided_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, booking.id, input.kind, input.initiator, input.status, input.slot ? iso(new Date(input.slot.start)) : null, input.slot ? iso(new Date(input.slot.end)) : null, input.message, booking.status, input.expiresAt ?? null, stamp, input.status === 'open' ? null : stamp, input.status === 'open' ? null : (input.by ?? input.initiator)],
    ),
  )
  return app.db.get<ChangeRow>('SELECT * FROM booking_changes WHERE id = ?', [id])!
}

function typeOf(app: AppContext, booking: BookingRow): TypeView & { durationMinutes: number } {
  const type = typeById(app.db, booking.consultation_type_id)
  if (!type) throw new HttpError(404, 'not_found', 'The consultation type was not found.')
  return { ...type, durationMinutes: Math.round((Date.parse(booking.end_at) - Date.parse(booking.start_at)) / 60_000) }
}

/** A free slot for this booking at `start`, found as if the booking itself were not in the way, or the answer that it is taken. */
function freeSlotFor(app: AppContext, booking: BookingRow, settings: BookingSettings, start: number): Slot {
  const type = typeOf(app, booking)
  const slot = findFreeSlot(app.db, settings, { id: type.id, duration_minutes: type.durationMinutes }, app.clock.now().getTime(), start, booking.id)
  if (!slot) throw taken()
  return slot
}

// ---- the customer's requests -----------------------------------------------------------------------------------------------------------

/** Whether the customer's page may offer a change right now, and if not, the reason (a code the page words). */
export function changeAllowance(app: AppContext, booking: BookingRow, kind: 'cancel' | 'reschedule', settings = loadSettings(app.db)): { allowed: true } | { allowed: false; reason: string } {
  if (kind === 'cancel' ? !settings.allowCancelRequests : !settings.allowRescheduleRequests) return { allowed: false, reason: 'not_offered' }
  const startsIn = Date.parse(booking.start_at) - app.clock.now().getTime()
  if (startsIn <= 0) return { allowed: false, reason: 'started' }
  const allowedStates: BookingStatus[] = kind === 'cancel' ? ['pending', 'confirmed', 'rescheduled'] : ['confirmed', 'rescheduled']
  if (!allowedStates.includes(booking.status)) return { allowed: false, reason: isActive(booking.status) ? 'state' : 'ended' }
  if (openChangeOf(app.db, booking.id)) return { allowed: false, reason: 'change_open' }
  if (startsIn < settings.changeMinNoticeHours * HOUR) return { allowed: false, reason: 'too_late' }
  return { allowed: true }
}

function assertAllowed(app: AppContext, booking: BookingRow, kind: 'cancel' | 'reschedule', settings: BookingSettings): void {
  const verdict = changeAllowance(app, booking, kind, settings)
  if (!verdict.allowed) throw refused(verdict.reason, verdict.reason === 'not_offered' ? 'This change cannot be requested online.' : 'This booking cannot be changed that way.')
}

export function parseMessage(value: unknown, field = 'message'): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw validationFailed({ [field]: 'invalid' })
  const cleaned = cleanBlock(value)
  if (cleaned === '') return null
  if ([...cleaned].length > BOOKING_LIMITS.message.max) throw validationFailed({ [field]: 'tooLong' })
  return cleaned
}

export type CustomerOutcome = 'requested' | 'done'

export function requestCancellation(app: AppContext, booking: BookingRow, message: string | null): CustomerOutcome {
  return app.db.transaction(() => {
    expireChanges(app)
    const settings = loadSettings(app.db)
    const current = getBooking(app.db, booking.id)!
    assertAllowed(app, current, 'cancel', settings)
    if (!settings.approvalRequired) {
      cancelBooking(app, current, 'customer', { type: 'customer' }, message, { customer: true, owner: true })
      return 'done'
    }
    const change = insertChange(app, current, { kind: 'cancel', initiator: 'customer', status: 'open', message })
    const eventId = eventFor(app, current, 'change_requested', { type: 'customer' }, { changeId: change.id, summary: 'cancel' })
    mails(app, current, eventId, { customer: 'booking_change_received', owner: 'booking_change_requested_admin' })
    return 'requested'
  })
}

export function requestReschedule(app: AppContext, booking: BookingRow, start: number, message: string | null): CustomerOutcome {
  return app.db.transaction(() => {
    expireChanges(app)
    const settings = loadSettings(app.db)
    const current = getBooking(app.db, booking.id)!
    assertAllowed(app, current, 'reschedule', settings)
    if (start === Date.parse(current.start_at)) throw validationFailed({ start: 'invalid' })
    const slot = freeSlotFor(app, current, settings, start)
    if (!settings.approvalRequired) {
      const change = insertChange(app, current, { kind: 'reschedule', initiator: 'customer', status: 'applied', slot, message })
      const { booking: moved, eventId } = applyMove(app, current, slot, change, { type: 'customer' })
      mails(app, moved, eventId, { customer: 'booking_rescheduled', owner: 'booking_change_requested_admin' })
      return 'done'
    }
    // The new time is HELD for this request (nobody else can book it); the booking stays at its current time until the owner agrees.
    const change = insertChange(app, current, { kind: 'reschedule', initiator: 'customer', status: 'open', slot, message })
    const asked = writeState(app, current, 'reschedule_requested')
    const eventId = eventFor(app, asked, 'change_requested', { type: 'customer' }, { from: current.status, to: 'reschedule_requested', fromStart: current.start_at, toStart: change.new_start_at, changeId: change.id, summary: 'reschedule' })
    mails(app, asked, eventId, { customer: 'booking_change_received', owner: 'booking_change_requested_admin' })
    return 'requested'
  })
}

/** The customer takes back their own open request. */
export function withdrawRequest(app: AppContext, booking: BookingRow): void {
  app.db.transaction(() => {
    const change = openChangeOf(app.db, booking.id)
    if (!change || change.initiator !== 'customer') throw refused('no_request', 'There is no request to withdraw.')
    closeChange(app, change, 'withdrawn', 'customer')
    const current = getBooking(app.db, booking.id)!
    const restored = change.kind === 'reschedule' && current.status === 'reschedule_requested' ? writeState(app, current, change.booking_status_before) : current
    eventFor(app, restored, 'change_withdrawn', { type: 'customer' }, { from: current.status, to: restored.status, changeId: change.id, summary: 'by_customer' })
  })
}

/** The customer answers the owner's proposal of a new time. */
export function answerProposal(app: AppContext, booking: BookingRow, accept: boolean): 'accepted' | 'declined' {
  return app.db.transaction(() => {
    expireChanges(app)
    const current = getBooking(app.db, booking.id)!
    const change = openChangeOf(app.db, booking.id)
    if (!change || change.initiator !== 'owner' || change.kind !== 'reschedule' || !change.new_start_at || !change.new_end_at) throw refused('no_proposal', 'There is no proposal to answer.')
    if (!accept) {
      closeChange(app, change, 'declined', 'customer')
      const restored = current.status === 'reschedule_requested' ? writeState(app, current, change.booking_status_before) : current
      const eventId = eventFor(app, restored, 'change_declined', { type: 'customer' }, { from: current.status, to: restored.status, changeId: change.id, summary: 'proposal' })
      mails(app, restored, eventId, { owner: 'booking_change_requested_admin' })
      return 'declined'
    }
    // The proposed time has been held for this booking the whole time, so it is still free; it only has to still be ahead of us.
    if (Date.parse(change.new_start_at) <= app.clock.now().getTime()) {
      closeChange(app, change, 'expired', 'system')
      const restored = current.status === 'reschedule_requested' ? writeState(app, current, change.booking_status_before) : current
      eventFor(app, restored, 'change_expired', { type: 'system' }, { from: current.status, to: restored.status, changeId: change.id, summary: 'proposal_passed' })
      throw refused('expired', 'This proposal has expired.')
    }
    closeChange(app, change, 'applied', 'customer')
    const { booking: moved, eventId } = applyMove(app, current, { start: Date.parse(change.new_start_at), end: Date.parse(change.new_end_at) }, { ...change, status: 'applied' }, { type: 'customer' })
    mails(app, moved, eventId, { customer: 'booking_rescheduled', owner: 'booking_change_requested_admin' })
    return 'accepted'
  })
}

// ---- the owner's decisions -------------------------------------------------------------------------------------------------------------

/** The owner answers a request the customer made. */
export function decideRequest(app: AppContext, booking: BookingRow, approve: boolean, actor: BookingActor, note: string | null): BookingRow {
  return app.db.transaction(() => {
    const current = getBooking(app.db, booking.id)!
    const change = openChangeOf(app.db, booking.id)
    if (!change || change.initiator !== 'customer') throw refused('no_request', 'There is no request to answer.')
    if (!approve) {
      closeChange(app, change, 'declined', 'owner')
      const restored = change.kind === 'reschedule' && current.status === 'reschedule_requested' ? writeState(app, current, change.booking_status_before) : current
      const eventId = eventFor(app, restored, 'change_declined', actor, { from: current.status, to: restored.status, changeId: change.id, summary: change.kind })
      mails(app, restored, eventId, { customer: 'booking_change_declined', note })
      return restored
    }
    if (change.kind === 'cancel') return cancelBooking(app, current, 'customer', actor, change.message, { customer: true, owner: false })
    if (!change.new_start_at || !change.new_end_at) throw refused('state')
    if (Date.parse(change.new_start_at) <= app.clock.now().getTime()) throw refused('passed', 'The requested time has already passed.')
    closeChange(app, change, 'applied', 'owner')
    const { booking: moved, eventId } = applyMove(app, current, { start: Date.parse(change.new_start_at), end: Date.parse(change.new_end_at) }, { ...change, status: 'applied' }, actor)
    mails(app, moved, eventId, { customer: 'booking_rescheduled', note })
    return moved
  })
}

/**
 * The owner proposes a new time. By the settings the customer must accept it (the booking stays where it is until they do, the new time is held, and the
 * proposal lapses after a while), or the booking is moved at once and the customer told. Either way the new time must be one the availability
 * rules offer (as if the booking itself were not in the way).
 */
export function proposeNewTime(app: AppContext, booking: BookingRow, start: number, actor: BookingActor, note: string | null): { booking: BookingRow; outcome: 'proposed' | 'moved' } {
  return app.db.transaction(() => {
    expireChanges(app)
    const settings = loadSettings(app.db)
    const current = getBooking(app.db, booking.id)!
    if (!['confirmed', 'rescheduled'].includes(current.status)) throw refused(openChangeOf(app.db, current.id) ? 'change_open' : 'state')
    if (Date.parse(current.start_at) <= app.clock.now().getTime()) throw refused('started', 'A booking that has started cannot be moved.')
    if (start === Date.parse(current.start_at)) throw validationFailed({ start: 'invalid' })
    const slot = freeSlotFor(app, current, settings, start)
    if (!settings.ownerChangeNeedsConfirmation) {
      const change = insertChange(app, current, { kind: 'reschedule', initiator: 'owner', status: 'applied', slot, message: note, by: 'owner' })
      const { booking: moved, eventId } = applyMove(app, current, slot, change, actor)
      mails(app, moved, eventId, { customer: 'booking_rescheduled', note })
      return { booking: moved, outcome: 'moved' }
    }
    const expiresAt = iso(new Date(Math.min(addMs(app.clock.now(), settings.proposalValidHours * HOUR).getTime(), slot.start)))
    const change = insertChange(app, current, { kind: 'reschedule', initiator: 'owner', status: 'open', slot, message: note, expiresAt })
    const asked = writeState(app, current, 'reschedule_requested')
    const eventId = eventFor(app, asked, 'change_requested', actor, { from: current.status, to: 'reschedule_requested', fromStart: current.start_at, toStart: change.new_start_at, changeId: change.id, summary: 'proposal' })
    mails(app, asked, eventId, { customer: 'booking_proposal', note })
    return { booking: asked, outcome: 'proposed' }
  })
}

export const ipHashOf = (app: AppContext, ip: string): string => hmacHex(app.config.appSecret, ip)
export { localDateKey, addDays }
