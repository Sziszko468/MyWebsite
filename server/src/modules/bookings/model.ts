import type { Language } from '../../config.ts'
import type { Database } from '../../db/database.ts'
import { validationFailed, type FieldErrors } from '../../http/errors.ts'
import { iso, type Clock } from '../../lib/time.ts'
import { isRecord } from '../../lib/text.ts'
import { getSetting, setSetting } from '../system/settings.ts'
import { isValidZone } from './zone.ts'

/**
 * The vocabulary of the booking system: the states a booking can be in and the moves between them, the rows the tables hold, and the
 * owner's settings. Everything that decides what is allowed is here (and in `availability.ts` for what is free), so the routes, the
 * administration and the tests all ask the same place.
 */

export type BookingStatus = 'pending' | 'confirmed' | 'reschedule_requested' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show'
export const BOOKING_STATUSES: readonly BookingStatus[] = ['pending', 'confirmed', 'reschedule_requested', 'rescheduled', 'cancelled', 'completed', 'no_show']

/** A booking in one of these states holds its time: nobody else can book it. */
export const ACTIVE_STATUSES: readonly BookingStatus[] = ['pending', 'confirmed', 'reschedule_requested', 'rescheduled']
export const isActive = (status: BookingStatus): boolean => ACTIVE_STATUSES.includes(status)
/** The states that end a booking: nothing moves it again. */
export const FINAL_STATUSES: readonly BookingStatus[] = ['cancelled', 'completed', 'no_show']

/**
 * The state machine. A booking never changes state except along one of these arrows, whoever asks (the visitor's page, the
 * administration, a test): `moveTo` in `service.ts` is the only code that writes a status and it asks `canMove` first.
 *
 *   pending               -> confirmed, cancelled
 *   confirmed             -> reschedule_requested, rescheduled, cancelled, completed, no_show
 *   reschedule_requested  -> confirmed, rescheduled, cancelled, completed, no_show      (declined or withdrawn: back to what it was)
 *   rescheduled           -> reschedule_requested, rescheduled, cancelled, completed, no_show
 *   cancelled, completed, no_show: final
 */
export const TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['reschedule_requested', 'rescheduled', 'cancelled', 'completed', 'no_show'],
  reschedule_requested: ['confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show'],
  rescheduled: ['reschedule_requested', 'rescheduled', 'cancelled', 'completed', 'no_show'],
  cancelled: [],
  completed: [],
  no_show: [],
}

export const canMove = (from: BookingStatus, to: BookingStatus): boolean => TRANSITIONS[from].includes(to)

/** What an administrator may ask for by name, and the state each leads to. `reschedule` and the answers to a request have their own routes. */
export const ADMIN_ACTIONS = ['confirm', 'cancel', 'complete', 'no_show'] as const
export type AdminAction = (typeof ADMIN_ACTIONS)[number]
export const ACTION_TARGET: Readonly<Record<AdminAction, BookingStatus>> = { confirm: 'confirmed', cancel: 'cancelled', complete: 'completed', no_show: 'no_show' }

// ---- rows ----------------------------------------------------------------------------------------------------------------------------

export interface TypeRow {
  id: string
  code: string
  duration_minutes: number | null
  enabled: number
  sort_order: number
  created_at: string
  updated_at: string
}

export interface TypeTranslationRow {
  type_id: string
  language: Language
  name: string
  description: string
}

export interface RuleRow {
  id: string
  consultation_type_id: string | null
  weekday: number
  start_minute: number
  end_minute: number
  created_at: string
}

export interface ExceptionRow {
  id: string
  kind: 'closed' | 'open'
  start_date: string
  end_date: string
  start_minute: number | null
  end_minute: number | null
  label: string | null
  created_at: string
}

export interface BookingRow {
  id: string
  reference: string
  consultation_type_id: string
  language: Language
  name: string
  email: string
  company: string | null
  website: string | null
  description: string | null
  start_at: string
  end_at: string
  time_zone: string
  status: BookingStatus
  related_reference: string | null
  quote_request_id: string | null
  idempotency_key: string | null
  request_hash: string | null
  ip_hash: string | null
  consent_at: string | null
  created_at: string
  updated_at: string
  confirmed_at: string | null
  cancelled_at: string | null
  cancelled_by: 'customer' | 'owner' | null
  cancellation_note: string | null
  completed_at: string | null
}

export interface ChangeRow {
  id: string
  booking_id: string
  kind: 'cancel' | 'reschedule'
  initiator: 'customer' | 'owner'
  status: 'open' | 'applied' | 'declined' | 'withdrawn' | 'expired'
  new_start_at: string | null
  new_end_at: string | null
  message: string | null
  booking_status_before: BookingStatus
  expires_at: string | null
  created_at: string
  decided_at: string | null
  decided_by: 'customer' | 'owner' | 'system' | null
}

// ---- the owner's settings ---------------------------------------------------------------------------------------------------------------

/**
 * What the owner decides about how booking works. Stored as JSON in `settings` under `booking.settings`. The numbers below are STARTING
 * values the administration shows for the owner to review; none of them is used publicly until the owner has saved the settings once
 * (`configuredAt`) AND switched booking on AND chosen a time zone. They are not hours and not a policy the site announces.
 */
export interface BookingSettings {
  /** The master switch. Off until the owner turns it on. */
  enabled: boolean
  /** The IANA zone the owner schedules in (`Europe/Budapest`). Required before booking can open; there is no default. */
  timeZone: string | null
  /** How far apart the start times in a window are (a window 09:00 to 12:00 with 30 gives 09:00, 09:30...). */
  slotStepMinutes: number
  /** Free time kept before and after each consultation. */
  bufferMinutes: number
  /** A slot starting sooner than this many hours from now is not offered. */
  minNoticeHours: number
  /** The last day (counted from today in the scheduling zone) a booking can be made for. */
  horizonDays: number
  /** `automatic`: a booking is confirmed when it is made. `manual`: it waits, `pending`, until the owner confirms it. */
  confirmation: 'automatic' | 'manual'
  allowCancelRequests: boolean
  allowRescheduleRequests: boolean
  /** A visitor can ask for a change only while the appointment is at least this many hours away. */
  changeMinNoticeHours: number
  /** A visitor's cancellation or move is a request the owner answers (true), or is carried out at once (false). */
  approvalRequired: boolean
  /** The owner's proposal of a new time must be accepted by the visitor (true), or the booking is moved and the visitor told (false). */
  ownerChangeNeedsConfirmation: boolean
  /** How long the visitor has to answer a proposal. */
  proposalValidHours: number
  /** When the owner last saved the settings; `null` until they did. */
  configuredAt: string | null
}

export const DEFAULT_SETTINGS: BookingSettings = {
  enabled: false,
  timeZone: null,
  slotStepMinutes: 30,
  bufferMinutes: 0,
  minNoticeHours: 24,
  horizonDays: 60,
  confirmation: 'automatic',
  allowCancelRequests: true,
  allowRescheduleRequests: true,
  changeMinNoticeHours: 0,
  approvalRequired: true,
  ownerChangeNeedsConfirmation: true,
  proposalValidHours: 72,
  configuredAt: null,
}

export const SETTINGS_KEY = 'booking.settings'

const INTEGER_RULES: Readonly<Record<'slotStepMinutes' | 'bufferMinutes' | 'minNoticeHours' | 'horizonDays' | 'changeMinNoticeHours' | 'proposalValidHours', readonly [number, number]>> = {
  slotStepMinutes: [5, 240],
  bufferMinutes: [0, 240],
  minNoticeHours: [0, 720],
  horizonDays: [1, 365],
  changeMinNoticeHours: [0, 720],
  proposalValidHours: [1, 720],
}

export function loadSettings(db: Database): BookingSettings {
  const raw = getSetting(db, SETTINGS_KEY)
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    const stored: unknown = JSON.parse(raw)
    if (!isRecord(stored)) return { ...DEFAULT_SETTINGS }
    const merged: BookingSettings = { ...DEFAULT_SETTINGS }
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof BookingSettings)[]) {
      const value = stored[key]
      const nullable = key === 'timeZone' || key === 'configuredAt'
      // A stored value is used only when it has the right kind; anything else keeps the starting value.
      const fits = nullable ? value === null || typeof value === 'string' : typeof value === typeof DEFAULT_SETTINGS[key]
      if (fits) (merged as unknown as Record<string, unknown>)[key] = value
    }
    if (merged.timeZone !== null && !isValidZone(merged.timeZone)) merged.timeZone = null
    if (merged.confirmation !== 'automatic' && merged.confirmation !== 'manual') merged.confirmation = DEFAULT_SETTINGS.confirmation
    return merged
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Reads and checks the owner's settings form: every field is optional (an omitted one keeps its value), and a wrong one names itself. */
export function parseSettings(body: Record<string, unknown>, current: BookingSettings): Omit<BookingSettings, 'configuredAt'> {
  const errors: FieldErrors = {}
  const next: Omit<BookingSettings, 'configuredAt'> = { ...current }
  const flag = (key: 'enabled' | 'allowCancelRequests' | 'allowRescheduleRequests' | 'approvalRequired' | 'ownerChangeNeedsConfirmation') => {
    if (body[key] === undefined) return
    if (typeof body[key] !== 'boolean') errors[key] = 'invalid'
    else next[key] = body[key]
  }
  for (const key of ['enabled', 'allowCancelRequests', 'allowRescheduleRequests', 'approvalRequired', 'ownerChangeNeedsConfirmation'] as const) flag(key)
  for (const [key, [min, max]] of Object.entries(INTEGER_RULES) as [keyof typeof INTEGER_RULES, readonly [number, number]][]) {
    const value = body[key]
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) errors[key] = 'invalid'
    else next[key] = value
  }
  if (body.confirmation !== undefined) {
    if (body.confirmation !== 'automatic' && body.confirmation !== 'manual') errors.confirmation = 'invalid'
    else next.confirmation = body.confirmation
  }
  if (body.timeZone !== undefined) {
    if (body.timeZone === null || body.timeZone === '') next.timeZone = null
    else if (!isValidZone(body.timeZone)) errors.timeZone = 'invalid'
    else next.timeZone = body.timeZone
  }
  if (next.enabled && next.timeZone === null && !('timeZone' in errors)) errors.timeZone = 'required'
  if (Object.keys(errors).length > 0) throw validationFailed(errors)
  return next
}

export function saveSettings(db: Database, clock: Clock, userId: string, next: Omit<BookingSettings, 'configuredAt'>): BookingSettings {
  const saved: BookingSettings = { ...next, configuredAt: iso(clock.now()) }
  setSetting(db, clock, SETTINGS_KEY, JSON.stringify(saved), userId)
  return saved
}

/**
 * Why booking is not open to the public, as codes the administration words; empty when it is open. Booking opens only when every one of
 * these is in order: the owner's explicit decisions, not defaults.
 */
export type ClosedReason = 'switched_off' | 'not_configured' | 'no_time_zone' | 'no_type' | 'no_hours'

export function closedReasons(db: Database, settings: BookingSettings): ClosedReason[] {
  const reasons: ClosedReason[] = []
  if (!settings.enabled) reasons.push('switched_off')
  if (settings.configuredAt === null) reasons.push('not_configured')
  if (settings.timeZone === null) reasons.push('no_time_zone')
  const types = db.all<{ id: string }>('SELECT id FROM consultation_types WHERE enabled = 1')
  if (types.length === 0) reasons.push('no_type')
  else {
    const anyHours = db.get<{ n: number }>("SELECT (SELECT COUNT(*) FROM availability_rules) + (SELECT COUNT(*) FROM availability_exceptions WHERE kind = 'open') AS n")?.n ?? 0
    if (anyHours === 0) reasons.push('no_hours')
  }
  return reasons
}

export const isOpen = (db: Database, settings: BookingSettings): boolean => closedReasons(db, settings).length === 0
