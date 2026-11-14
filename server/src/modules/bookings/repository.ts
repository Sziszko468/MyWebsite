import { LANGUAGES, type Language } from '../../config.ts'
import type { AppContext, SessionInfo } from '../../context.ts'
import type { Database } from '../../db/database.ts'
import { newId, randomToken, sha256Hex } from '../../lib/crypto.ts'
import { addMs, DAY, iso, type Clock } from '../../lib/time.ts'
import type { BookingRow, BookingStatus, ChangeRow, TypeRow, TypeTranslationRow } from './model.ts'

/** The queries of the booking system, in one place: rows in, rows out, no rules (the rules are `service.ts`). */

type Deps = Pick<AppContext, 'db' | 'clock' | 'config'>

// ---- consultation types ----------------------------------------------------------------------------------------------------------------

export interface TypeView {
  id: string
  code: string
  durationMinutes: number | null
  enabled: boolean
  sortOrder: number
  translations: Record<Language, { name: string; description: string }>
}

const empty = (): TypeView['translations'] => ({ hu: { name: '', description: '' }, en: { name: '', description: '' }, nl: { name: '', description: '' } })

function viewOf(row: TypeRow, translations: TypeTranslationRow[]): TypeView {
  const words = empty()
  for (const translation of translations) if (translation.type_id === row.id) words[translation.language] = { name: translation.name, description: translation.description }
  return { id: row.id, code: row.code, durationMinutes: row.duration_minutes, enabled: row.enabled === 1, sortOrder: row.sort_order, translations: words }
}

export function loadTypes(db: Database): TypeView[] {
  const rows = db.all<TypeRow>('SELECT * FROM consultation_types ORDER BY sort_order, code')
  const translations = db.all<TypeTranslationRow>('SELECT * FROM consultation_type_translations')
  return rows.map((row) => viewOf(row, translations))
}

export function typeByCode(db: Database, code: string): TypeView | null {
  const row = db.get<TypeRow>('SELECT * FROM consultation_types WHERE code = ?', [code])
  return row ? viewOf(row, db.all<TypeTranslationRow>('SELECT * FROM consultation_type_translations WHERE type_id = ?', [row.id])) : null
}

export function typeById(db: Database, id: string): TypeView | null {
  const row = db.get<TypeRow>('SELECT * FROM consultation_types WHERE id = ?', [id])
  return row ? viewOf(row, db.all<TypeTranslationRow>('SELECT * FROM consultation_type_translations WHERE type_id = ?', [row.id])) : null
}

export const hasAllWords = (type: TypeView): boolean => LANGUAGES.every((lang) => type.translations[lang].name.trim() !== '' && type.translations[lang].description.trim() !== '')

// ---- bookings --------------------------------------------------------------------------------------------------------------------------

export const getBooking = (db: Database, id: string): BookingRow | undefined => db.get<BookingRow>('SELECT * FROM bookings WHERE id = ?', [id])

export const openChangeOf = (db: Database, bookingId: string): ChangeRow | undefined => db.get<ChangeRow>("SELECT * FROM booking_changes WHERE booking_id = ? AND status = 'open'", [bookingId])

export const changesOf = (db: Database, bookingId: string): ChangeRow[] => db.all<ChangeRow>('SELECT * FROM booking_changes WHERE booking_id = ? ORDER BY created_at, rowid', [bookingId])

/** `BK-2026-000001`: the next number of the year. Call it inside the transaction that inserts the booking, like the quote references. */
export function nextBookingReference(db: Database, now: Date): string {
  const year = now.getUTCFullYear()
  const row = db.get<{ value: number }>('INSERT INTO reference_counters (scope, value) VALUES (?, 1) ON CONFLICT (scope) DO UPDATE SET value = value + 1 RETURNING value', [`booking:${year}`])
  if (!row) throw new Error('Could not take the next booking number.')
  return `BK-${String(year).padStart(4, '0')}-${String(row.value).padStart(6, '0')}`
}

// ---- the history -----------------------------------------------------------------------------------------------------------------------

export type BookingEventType = 'created' | 'confirmed' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show' | 'change_requested' | 'change_declined' | 'change_withdrawn' | 'change_expired' | 'note_added' | 'links_revoked' | 'email_failed'

export type BookingActor = { type: 'admin'; session: Pick<SessionInfo, 'userId'> } | { type: 'customer' } | { type: 'system' }

export interface BookingEventInput {
  booking: Pick<BookingRow, 'id' | 'reference'>
  type: BookingEventType
  actor: BookingActor
  from?: BookingStatus | null
  to?: BookingStatus | null
  fromStart?: string | null
  toStart?: string | null
  changeId?: string | null
  /** A short fixed phrase or code, never what a person typed. */
  summary?: string | null
}

export function recordBookingEvent(db: Database, clock: Clock, event: BookingEventInput): number {
  const result = db.run(
    `INSERT INTO booking_events (booking_id, reference, event_type, actor_type, actor_id, from_status, to_status, from_start_at, to_start_at, change_id, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.booking.id, event.booking.reference, event.type, event.actor.type, event.actor.type === 'admin' ? event.actor.session.userId : null, event.from ?? null, event.to ?? null, event.fromStart ?? null, event.toStart ?? null, event.changeId ?? null, event.summary ? event.summary.slice(0, 120) : null, iso(clock.now())],
  )
  return result.lastInsertRowid
}

export interface BookingEventRow {
  id: number
  booking_id: string
  reference: string
  event_type: BookingEventType
  actor_type: 'customer' | 'admin' | 'system'
  actor: string | null
  from_status: BookingStatus | null
  to_status: BookingStatus | null
  from_start_at: string | null
  to_start_at: string | null
  change_id: string | null
  summary: string | null
  created_at: string
}

export const eventsOf = (db: Database, bookingId: string): BookingEventRow[] =>
  db.all<BookingEventRow>(
    `SELECT e.id, e.booking_id, e.reference, e.event_type, e.actor_type, u.email AS actor, e.from_status, e.to_status, e.from_start_at, e.to_start_at, e.change_id, e.summary, e.created_at
     FROM booking_events e LEFT JOIN admin_users u ON u.id = e.actor_id WHERE e.booking_id = ? ORDER BY e.id`,
    [bookingId],
  )

// ---- the secure links ------------------------------------------------------------------------------------------------------------------

const SHAPE = /^[A-Za-z0-9_-]{43}$/

export interface BookingTokenRow {
  id: string
  token_hash: string
  booking_id: string
  created_at: string
  expires_at: string
  revoked_at: string | null
}

export const hashToken = (token: string): string => sha256Hex(token)

/**
 * A new secure link for a booking: 256 random bits, of which only the hash is kept. It works until `CUSTOMER_LINK_DAYS` after the later of now
 * and the end of the appointment, or until it is revoked. Each e-mail that carries a link makes its own.
 */
export function mintBookingToken(deps: Deps, booking: Pick<BookingRow, 'id' | 'end_at'>): { token: string; expiresAt: string } {
  const now = deps.clock.now()
  const base = Math.max(now.getTime(), Date.parse(booking.end_at))
  const expiresAt = iso(addMs(new Date(base), deps.config.customerLinkDays * DAY))
  const token = randomToken(32)
  deps.db.run('INSERT INTO booking_tokens (id, token_hash, booking_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', [newId(), hashToken(token), booking.id, iso(now), expiresAt])
  return { token, expiresAt }
}

export function findBookingToken(db: Database, token: string): BookingTokenRow | null {
  if (!SHAPE.test(token)) return null
  return db.get<BookingTokenRow>('SELECT * FROM booking_tokens WHERE token_hash = ?', [hashToken(token)]) ?? null
}

export type TokenState = 'ok' | 'expired' | 'revoked'

export function tokenState(deps: Pick<AppContext, 'clock'>, row: BookingTokenRow): TokenState {
  if (row.revoked_at) return 'revoked'
  return row.expires_at <= iso(deps.clock.now()) ? 'expired' : 'ok'
}

export const revokeBookingTokens = (deps: Pick<AppContext, 'db' | 'clock'>, bookingId: string): number =>
  deps.db.run('UPDATE booking_tokens SET revoked_at = ? WHERE booking_id = ? AND revoked_at IS NULL', [iso(deps.clock.now()), bookingId]).changes

export const purgeBookingTokens = (deps: Pick<AppContext, 'db' | 'clock'>): number => deps.db.run('DELETE FROM booking_tokens WHERE expires_at < ?', [iso(addMs(deps.clock.now(), -30 * DAY))]).changes
