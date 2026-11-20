import { LANGUAGES, type Language } from '../../config.ts'
import type { AppContext, SessionInfo } from '../../context.ts'
import { ConstraintError, HttpError, notFound, validationFailed, type FieldCode, type FieldErrors } from '../../http/errors.ts'
import { newId } from '../../lib/crypto.ts'
import { cleanBlock, cleanLine, isRecord } from '../../lib/text.ts'
import { iso } from '../../lib/time.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { ACTION_TARGET, BOOKING_STATUSES, closedReasons, loadSettings, parseSettings, saveSettings, TRANSITIONS, type BookingRow, type BookingSettings, type BookingStatus, type ChangeRow, type ExceptionRow, type RuleRow } from './model.ts'
import { blockersBetween } from './availability.ts'
import { changesOf, eventsOf, getBooking, hasAllWords, loadTypes, recordBookingEvent, revokeBookingTokens, typeByCode, typeById, type TypeView } from './repository.ts'
import { cancelBooking, confirmBooking, decideRequest, expireChanges, finishBooking, parseDate, parseInstant, parseMessage, proposeNewTime, publicDays } from './service.ts'
import { addDays, daysBetween, localDateKey, minuteText, parseMinute, resolveLocal, startOfLocalDay, type DateKey } from './zone.ts'

/**
 * The administration's side of the booking system. Reading needs `requests:read`; working with a booking (confirming, cancelling, proposing a time, a
 * note) needs `requests:write`; the consultation types, the weekly hours, the exceptions and the settings need `system:write` (the owner). The check
 * is here, in the business function, so no route can forget it. What an administrator did is also written to the audit log: the action and the
 * record, never what a visitor wrote.
 */

// ---- the booking list --------------------------------------------------------------------------------------------------------------------

const SORTS: Record<string, string> = {
  start: 'b.start_at ASC',
  '-start': 'b.start_at DESC',
  created: 'b.created_at ASC',
  '-created': 'b.created_at DESC',
  name: 'b.name COLLATE NOCASE ASC',
  '-name': 'b.name COLLATE NOCASE DESC',
  status: 'b.status ASC, b.start_at ASC',
}
export const BOOKING_SORTS = Object.keys(SORTS)

export interface BookingFilters {
  q: string
  status: BookingStatus[]
  type: string | null
  from: DateKey | null
  to: DateKey | null
  sort: string
  page: number
  pageSize: number
}

export function parseFilters(query: URLSearchParams): BookingFilters {
  const errors: FieldErrors = {}
  const status = (query.get('status') ?? '').split(',').filter(Boolean)
  for (const one of status) if (!BOOKING_STATUSES.includes(one as BookingStatus)) errors.status = 'invalid'
  const from = query.get('from') ? parseDate(query.get('from')) : null
  const to = query.get('to') ? parseDate(query.get('to')) : null
  if (query.get('from') && !from) errors.from = 'invalid'
  if (query.get('to') && !to) errors.to = 'invalid'
  const sort = query.get('sort') ?? '-created'
  if (!(sort in SORTS)) errors.sort = 'invalid'
  const page = Number(query.get('page') ?? 1)
  const pageSize = Number(query.get('pageSize') ?? 20)
  if (!Number.isInteger(page) || page < 1 || page > 10_000) errors.page = 'invalid'
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) errors.pageSize = 'invalid'
  if (Object.keys(errors).length > 0) throw validationFailed(errors)
  return { q: cleanLine(query.get('q') ?? '').slice(0, 100), status: status as BookingStatus[], type: query.get('type') || null, from, to, sort, page, pageSize }
}

export interface BookingListItem {
  id: string
  reference: string
  name: string
  email: string
  company: string | null
  typeCode: string
  typeName: string
  startAt: string
  endAt: string
  timeZone: string
  status: BookingStatus
  language: Language
  createdAt: string
  /** A customer's request or an owner's proposal is waiting. */
  openChange: 'cancel' | 'reschedule' | null
}

const zoneOf = (settings: BookingSettings): string => settings.timeZone ?? 'UTC'

export function listBookings(app: AppContext, session: SessionInfo | null, query: URLSearchParams): { rows: BookingListItem[]; total: number; filters: BookingFilters } {
  requirePermission(session, 'requests:read')
  expireChanges(app)
  const filters = parseFilters(query)
  const settings = loadSettings(app.db)
  const conditions: string[] = []
  const params: (string | number)[] = []
  if (filters.status.length > 0) {
    conditions.push(`b.status IN (${filters.status.map(() => '?').join(', ')})`)
    params.push(...filters.status)
  }
  if (filters.type) {
    conditions.push('t.code = ?')
    params.push(filters.type)
  }
  if (filters.from) {
    conditions.push('b.start_at >= ?')
    params.push(iso(new Date(startOfLocalDay(filters.from, zoneOf(settings)))))
  }
  if (filters.to) {
    conditions.push('b.start_at < ?')
    params.push(iso(new Date(startOfLocalDay(addDays(filters.to, 1), zoneOf(settings)))))
  }
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    conditions.push("(b.name LIKE ? ESCAPE '\\' OR b.email LIKE ? ESCAPE '\\' OR b.reference LIKE ? ESCAPE '\\' OR COALESCE(b.company, '') LIKE ? ESCAPE '\\')")
    params.push(like, like, like, like)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const total = app.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM bookings b JOIN consultation_types t ON t.id = b.consultation_type_id ${where}`, params)?.n ?? 0
  const order = SORTS[filters.sort]
  const rows = app.db.all<BookingRow & { type_code: string; open_kind: 'cancel' | 'reschedule' | null }>(
    `SELECT b.*, t.code AS type_code, (SELECT c.kind FROM booking_changes c WHERE c.booking_id = b.id AND c.status = 'open') AS open_kind
     FROM bookings b JOIN consultation_types t ON t.id = b.consultation_type_id ${where} ORDER BY ${order}, b.id LIMIT ? OFFSET ?`,
    [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
  )
  const types = new Map(loadTypes(app.db).map((type) => [type.code, type]))
  return {
    total,
    filters,
    rows: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      name: row.name,
      email: row.email,
      company: row.company,
      typeCode: row.type_code,
      // The type's name in the OWNER's language is the administration's business; the list shows the booking's own language's name.
      typeName: types.get(row.type_code)?.translations[row.language].name || row.type_code,
      startAt: row.start_at,
      endAt: row.end_at,
      timeZone: row.time_zone,
      status: row.status,
      language: row.language,
      createdAt: row.created_at,
      openChange: row.open_kind,
    })),
  }
}

// ---- one booking -------------------------------------------------------------------------------------------------------------------------

export function bookingDetail(app: AppContext, session: SessionInfo | null, id: string) {
  requirePermission(session, 'requests:read')
  expireChanges(app)
  const row = getBooking(app.db, id)
  if (!row) throw notFound('The booking')
  const type = typeById(app.db, row.consultation_type_id)
  const events = eventsOf(app.db, row.id)
  const placeholders = events.map(() => '?').join(', ')
  const deliveries =
    events.length === 0
      ? []
      : app.db.all<{ id: string; kind: string; recipient: string; status: string; attempts: number; last_error: string | null; created_at: string; related_id: string }>(
          `SELECT id, kind, recipient, status, attempts, last_error, created_at, related_id FROM email_deliveries WHERE related_type = 'booking_event' AND related_id IN (${placeholders}) ORDER BY created_at, rowid`,
          events.map((event) => String(event.id)),
        )
  const quote = row.quote_request_id ? app.db.get<{ id: string; reference: string; status: string }>('SELECT id, reference, status FROM quote_requests WHERE id = ?', [row.quote_request_id]) : undefined
  const { ip_hash: _ip, request_hash: _hash, idempotency_key: _key, ...booking } = row
  const changes: ChangeRow[] = changesOf(app.db, row.id)
  return {
    booking,
    type: type ? { code: type.code, durationMinutes: type.durationMinutes, translations: type.translations } : null,
    changes,
    openChange: changes.find((change) => change.status === 'open') ?? null,
    events: events.map((event) => ({ id: event.id, type: event.event_type, actorType: event.actor_type, actor: event.actor, from: event.from_status, to: event.to_status, fromStart: event.from_start_at, toStart: event.to_start_at, changeId: event.change_id, summary: event.summary, at: event.created_at })),
    notes: app.db.all<{ id: string; body: string; created_at: string; author: string | null }>('SELECT n.id, n.body, n.created_at, u.email AS author FROM booking_notes n LEFT JOIN admin_users u ON u.id = n.author_id WHERE n.booking_id = ? ORDER BY n.created_at, n.rowid', [row.id]),
    deliveries: deliveries.map((delivery) => ({ id: delivery.id, kind: delivery.kind, recipient: delivery.recipient, status: delivery.status, attempts: delivery.attempts, lastError: delivery.last_error, createdAt: delivery.created_at, eventId: Number(delivery.related_id) })),
    quote: quote ? { id: quote.id, reference: quote.reference, status: quote.status } : null,
    activeLinks: app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM booking_tokens WHERE booking_id = ? AND revoked_at IS NULL AND expires_at > ?", [row.id, iso(app.clock.now())])?.n ?? 0,
    // What the administration may offer next, so it shows only the buttons that will work (the server checks regardless).
    next: TRANSITIONS[row.status],
  }
}

/** The days an administrator can propose for a booking: the availability, with the booking's own time not in the way. */
export function proposalDays(app: AppContext, session: SessionInfo | null, id: string, query: URLSearchParams) {
  requirePermission(session, 'requests:read')
  const booking = getBooking(app.db, id)
  if (!booking) throw notFound('The booking')
  const type = typeById(app.db, booking.consultation_type_id)
  if (!type) throw notFound('The consultation type')
  const from = parseDate(query.get('from'))
  const to = parseDate(query.get('to'))
  if (!from || !to) throw validationFailed({ [from ? 'to' : 'from']: 'invalid' })
  return publicDays(app, { ...type, durationMinutes: Math.round((Date.parse(booking.end_at) - Date.parse(booking.start_at)) / 60_000) }, from, to, booking.id)
}

export function actOnBooking(app: AppContext, session: SessionInfo | null, id: string, body: Record<string, unknown>) {
  const actor = requirePermission(session, 'requests:write')
  const booking = getBooking(app.db, id)
  if (!booking) throw notFound('The booking')
  expireChanges(app)
  const who = { type: 'admin' as const, session: actor }
  const action = body.action
  const note = parseMessage(body.message)
  const touched = (name: string, detail: Record<string, unknown> = {}) => audit(app, actor, `booking.${name}`, 'booking', booking.id, { reference: booking.reference, ...detail })
  switch (action) {
    case 'confirm':
    case 'cancel':
    case 'complete':
    case 'no_show': {
      const target = ACTION_TARGET[action]
      if (action === 'confirm') confirmBooking(app, booking, who)
      else if (action === 'cancel') cancelBooking(app, booking, 'owner', who, note, { customer: true, owner: false })
      else finishBooking(app, booking, target as 'completed' | 'no_show', who)
      touched(action)
      return bookingDetail(app, session, id)
    }
    case 'propose': {
      const start = parseInstant(body.start)
      if (start === null) throw validationFailed({ start: body.start === undefined ? 'required' : 'invalid' })
      const result = proposeNewTime(app, booking, start, who, note)
      touched('propose', { outcome: result.outcome })
      return bookingDetail(app, session, id)
    }
    case 'approve':
    case 'reject': {
      decideRequest(app, booking, action === 'approve', who, note)
      touched(action)
      return bookingDetail(app, session, id)
    }
    case 'note': {
      const text = typeof body.text === 'string' ? cleanBlock(body.text) : ''
      if (text === '') throw validationFailed({ text: 'required' })
      if ([...text].length > 2000) throw validationFailed({ text: 'tooLong' })
      app.db.transaction(() => {
        app.db.run('INSERT INTO booking_notes (id, booking_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [newId(), booking.id, actor.userId, text, iso(app.clock.now())])
        recordBookingEvent(app.db, app.clock, { booking, type: 'note_added', actor: who, summary: 'note' })
      })
      touched('note')
      return bookingDetail(app, session, id)
    }
    case 'revoke_links': {
      app.db.transaction(() => {
        const count = revokeBookingTokens(app, booking.id)
        recordBookingEvent(app.db, app.clock, { booking, type: 'links_revoked', actor: who, summary: `links:${count}` })
      })
      touched('revoke_links')
      return bookingDetail(app, session, id)
    }
    default:
      throw validationFailed({ action: 'invalid' })
  }
}

// ---- types, hours, settings --------------------------------------------------------------------------------------------------------------

export interface HourOut {
  id: string
  type: string | null
  weekday: number
  start: string
  end: string
}

export interface ExceptionOut {
  id: string
  kind: 'closed' | 'open'
  startDate: string
  endDate: string
  start: string | null
  end: string | null
  label: string | null
}

export function configuration(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'requests:read')
  const settings = loadSettings(app.db)
  const types = loadTypes(app.db)
  const byId = new Map(types.map((type) => [type.id, type.code]))
  const rules = app.db.all<RuleRow>('SELECT * FROM availability_rules ORDER BY weekday, start_minute')
  const exceptions = app.db.all<ExceptionRow>('SELECT * FROM availability_exceptions ORDER BY start_date, start_minute')
  return {
    settings,
    closedReasons: closedReasons(app.db, settings),
    types: types.map((type) => ({ ...type, complete: hasAllWords(type) && type.durationMinutes !== null })),
    hours: rules.map<HourOut>((rule) => ({ id: rule.id, type: rule.consultation_type_id ? (byId.get(rule.consultation_type_id) ?? null) : null, weekday: rule.weekday, start: minuteText(rule.start_minute), end: minuteText(rule.end_minute) })),
    exceptions: exceptions.map<ExceptionOut>((row) => ({ id: row.id, kind: row.kind, startDate: row.start_date, endDate: row.end_date, start: row.start_minute === null ? null : minuteText(row.start_minute), end: row.end_minute === null ? null : minuteText(row.end_minute), label: row.label })),
    now: iso(app.clock.now()),
  }
}

export function saveBookingSettings(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>) {
  const actor = requirePermission(session, 'system:write')
  const current = loadSettings(app.db)
  const next = parseSettings(body, current)
  // Switching booking on needs something to book and somewhere to be booked: the page the administrator sees says what is missing.
  const saved = saveSettings(app.db, app.clock, actor.userId, next)
  audit(app, actor, 'booking.settings', 'settings', null, { enabled: saved.enabled, timeZone: saved.timeZone, confirmation: saved.confirmation })
  return configuration(app, session)
}

const text = (value: unknown, max: number, field: string, errors: FieldErrors, required: boolean): string => {
  if (value === undefined || value === null || value === '') {
    if (required) errors[field] = 'required'
    return ''
  }
  if (typeof value !== 'string') {
    errors[field] = 'invalid'
    return ''
  }
  const cleaned = cleanLine(value)
  if (required && cleaned === '') errors[field] = 'required'
  else if ([...cleaned].length > max) errors[field] = 'tooLong'
  return cleaned
}

/** Creates or edits a consultation type. The code is chosen once and never changes (analytics and links use it). */
export function saveType(app: AppContext, session: SessionInfo | null, existingCode: string | null, body: Record<string, unknown>): TypeView {
  const actor = requirePermission(session, 'system:write')
  const errors: FieldErrors = {}
  const existing = existingCode ? typeByCode(app.db, existingCode) : null
  if (existingCode && !existing) throw notFound('The consultation type')
  const code = existing ? existing.code : typeof body.code === 'string' ? body.code.trim().toLowerCase() : ''
  if (!existing && !/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(code)) errors.code = code === '' ? 'required' : 'invalid'

  let duration: number | null = existing?.durationMinutes ?? null
  if (body.durationMinutes !== undefined) {
    if (body.durationMinutes === null) duration = null
    else if (typeof body.durationMinutes !== 'number' || !Number.isInteger(body.durationMinutes) || body.durationMinutes < 5 || body.durationMinutes > 480) errors.durationMinutes = 'invalid'
    else duration = body.durationMinutes
  }
  let enabled = existing?.enabled ?? false
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') errors.enabled = 'invalid'
    else enabled = body.enabled
  }
  let sortOrder = existing?.sortOrder ?? 0
  if (body.sortOrder !== undefined) {
    if (typeof body.sortOrder !== 'number' || !Number.isInteger(body.sortOrder) || body.sortOrder < 0 || body.sortOrder > 1000) errors.sortOrder = 'invalid'
    else sortOrder = body.sortOrder
  }
  const given = isRecord(body.translations) ? body.translations : {}
  if (body.translations !== undefined && !isRecord(body.translations)) errors.translations = 'invalid'
  const words = {} as Record<Language, { name: string; description: string }>
  for (const lang of LANGUAGES) {
    const entry = isRecord(given[lang]) ? given[lang] : {}
    const before = existing?.translations[lang] ?? { name: '', description: '' }
    words[lang] = {
      name: 'name' in entry ? text(entry.name, 80, `translations.${lang}.name`, errors, false) : before.name,
      description: 'description' in entry ? (typeof entry.description === 'string' ? cleanBlock(entry.description) : '') : before.description,
    }
    if ([...words[lang].description].length > 600) errors[`translations.${lang}.description`] = 'tooLong'
  }
  // A type is offered only when the owner has decided how long it is and written it in all three languages: nothing is shown half done.
  if (enabled) {
    if (duration === null) errors.durationMinutes = 'required'
    for (const lang of LANGUAGES) {
      if (words[lang].name === '') errors[`translations.${lang}.name`] ??= 'required'
      if (words[lang].description.trim() === '') errors[`translations.${lang}.description`] ??= 'required'
    }
  }
  if (Object.keys(errors).length > 0) throw validationFailed(errors)

  const stamp = iso(app.clock.now())
  const id = existing?.id ?? newId()
  try {
    app.db.transaction(() => {
      if (existing) app.db.run('UPDATE consultation_types SET duration_minutes = ?, enabled = ?, sort_order = ?, updated_at = ? WHERE id = ?', [duration, enabled ? 1 : 0, sortOrder, stamp, id])
      else app.db.run('INSERT INTO consultation_types (id, code, duration_minutes, enabled, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, code, duration, enabled ? 1 : 0, sortOrder, stamp, stamp])
      for (const lang of LANGUAGES) {
        app.db.run(
          'INSERT INTO consultation_type_translations (type_id, language, name, description) VALUES (?, ?, ?, ?) ON CONFLICT (type_id, language) DO UPDATE SET name = excluded.name, description = excluded.description',
          [id, lang, words[lang].name, words[lang].description],
        )
      }
    })
  } catch (error) {
    if (error instanceof ConstraintError && error.kind === 'unique') throw validationFailed({ code: 'duplicate' })
    throw error
  }
  audit(app, actor, existing ? 'booking.type.update' : 'booking.type.create', 'consultation_type', id, { code, enabled })
  return typeById(app.db, id)!
}

const MAX_RULES = 100
const MAX_EXCEPTIONS = 300

/**
 * Replaces the weekly hours and the exceptions as one whole. They are checked together and written in one transaction: a list with one mistake
 * changes nothing. Times the owner typed are checked against the scheduling zone: a time that does not exist on the date (the clocks jump over it)
 * or exists twice (the clocks go back over it) is refused, naming the line.
 */
export function saveHours(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>) {
  const actor = requirePermission(session, 'system:write')
  const settings = loadSettings(app.db)
  const errors: FieldErrors = {}
  const types = new Map(loadTypes(app.db).map((type) => [type.code, type.id]))
  const rules: Omit<RuleRow, 'created_at'>[] = []
  const exceptions: Omit<ExceptionRow, 'created_at'>[] = []

  const listOf = (value: unknown, field: string, max: number): unknown[] => {
    if (value === undefined) return []
    if (!Array.isArray(value) || value.length > max) {
      errors[field] = Array.isArray(value) ? 'tooMany' : 'invalid'
      return []
    }
    return value
  }
  listOf(body.hours, 'hours', MAX_RULES).forEach((raw, index) => {
    const field = `hours.${index}`
    if (!isRecord(raw)) return void (errors[field] = 'invalid')
    const weekday = raw.weekday
    if (typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) errors[`${field}.weekday`] = 'invalid'
    const start = typeof raw.start === 'string' ? parseMinute(raw.start) : null
    const end = typeof raw.end === 'string' ? parseMinute(raw.end) : null
    if (start === null || start >= 1440) errors[`${field}.start`] = 'invalid'
    if (end === null || end < 1) errors[`${field}.end`] = 'invalid'
    if (start !== null && end !== null && end <= start) errors[`${field}.end`] = 'invalid'
    let typeId: string | null = null
    if (raw.type !== undefined && raw.type !== null && raw.type !== '') {
      typeId = typeof raw.type === 'string' ? (types.get(raw.type) ?? null) : null
      if (typeId === null) errors[`${field}.type`] = 'invalid'
    }
    if (!(`${field}.weekday` in errors) && !(`${field}.start` in errors) && !(`${field}.end` in errors) && !(`${field}.type` in errors)) rules.push({ id: newId(), consultation_type_id: typeId, weekday: weekday as number, start_minute: start!, end_minute: end! })
  })

  listOf(body.exceptions, 'exceptions', MAX_EXCEPTIONS).forEach((raw, index) => {
    const field = `exceptions.${index}`
    if (!isRecord(raw)) return void (errors[field] = 'invalid')
    const kind = raw.kind === 'closed' || raw.kind === 'open' ? raw.kind : null
    if (!kind) errors[`${field}.kind`] = 'invalid'
    const startDate = parseDate(raw.startDate)
    const endDate = parseDate(raw.endDate ?? raw.startDate)
    if (!startDate) errors[`${field}.startDate`] = 'invalid'
    if (!endDate) errors[`${field}.endDate`] = 'invalid'
    if (startDate && endDate && endDate < startDate) errors[`${field}.endDate`] = 'invalid'
    const hasTimes = (raw.start !== undefined && raw.start !== null && raw.start !== '') || (raw.end !== undefined && raw.end !== null && raw.end !== '')
    let start: number | null = null
    let end: number | null = null
    if (hasTimes) {
      start = typeof raw.start === 'string' ? parseMinute(raw.start) : null
      end = typeof raw.end === 'string' ? parseMinute(raw.end) : null
      if (start === null || start >= 1440) errors[`${field}.start`] = 'invalid'
      if (end === null || end < 1 || (start !== null && end <= start)) errors[`${field}.end`] = 'invalid'
      // A part of a day belongs to one day.
      if (startDate && endDate && startDate !== endDate) errors[`${field}.endDate`] = 'invalid'
    } else if (kind === 'open') {
      errors[`${field}.start`] = 'required'
    }
    // The wall-clock times the owner typed must exist exactly once on that date in the scheduling zone.
    if (startDate && start !== null && !(`${field}.start` in errors)) {
      if (settings.timeZone === null) errors.timeZone = 'required'
      else {
        for (const [minute, name] of [[start, 'start'], [end, 'end']] as const) {
          if (minute === null || minute >= 1440) continue
          const kindOfTime = resolveLocal(startDate, minute, settings.timeZone).kind
          if (kindOfTime !== 'valid') errors[`${field}.${name}`] = (kindOfTime === 'gap' ? 'nonexistentTime' : 'ambiguousTime') as FieldCode
        }
      }
    }
    const label = raw.label === undefined || raw.label === null ? null : typeof raw.label === 'string' ? cleanLine(raw.label).slice(0, 120) || null : (errors[`${field}.label`] = 'invalid', null)
    if (!Object.keys(errors).some((key) => key.startsWith(`${field}.`) || key === field) && kind && startDate && endDate) exceptions.push({ id: newId(), kind, start_date: startDate, end_date: endDate, start_minute: start, end_minute: end, label })
  })

  if (Object.keys(errors).length > 0) throw validationFailed(errors)
  const stamp = iso(app.clock.now())
  app.db.transaction(() => {
    app.db.run('DELETE FROM availability_rules')
    app.db.run('DELETE FROM availability_exceptions')
    for (const rule of rules) app.db.run('INSERT INTO availability_rules (id, consultation_type_id, weekday, start_minute, end_minute, created_at) VALUES (?, ?, ?, ?, ?, ?)', [rule.id, rule.consultation_type_id, rule.weekday, rule.start_minute, rule.end_minute, stamp])
    for (const row of exceptions) app.db.run('INSERT INTO availability_exceptions (id, kind, start_date, end_date, start_minute, end_minute, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [row.id, row.kind, row.start_date, row.end_date, row.start_minute, row.end_minute, row.label, stamp])
  })
  audit(app, actor, 'booking.hours', 'settings', null, { rules: rules.length, exceptions: exceptions.length })
  return configuration(app, session)
}

// ---- closing days (PROMPT 33) --------------------------------------------------------------------------------------------------------------
// The one change to the consultation hours the assistant's approval-gated actions may make: CLOSE some days. It can only take availability away, never add any; it never touches a
// booking that exists (it refuses when there is one); and it is the same kind of row the hours editor writes (`availability_exceptions`, kind `closed`), so the owner removes it
// in the same place. `saveHours` (above) is unchanged and still replaces the whole set.

/** The longest run of days one closing may cover, and how far ahead it may reach. */
export const CLOSURE_MAX_DAYS = 31
export const CLOSURE_HORIZON_DAYS = 366

export interface ClosureInput {
  startDate: string
  endDate: string
  label: string | null
}

export interface ClosurePlan {
  zone: string
  startDate: DateKey
  endDate: DateKey
  days: number
  label: string | null
  /** Today in the scheduling zone. */
  today: DateKey
  /** Bookings and held reschedule times that fall inside the days: closing is refused while there is any. */
  conflicts: number
  /** The exceptions that exist now. */
  exceptions: number
}

/** What closing these days would touch, without writing anything. A range that cannot be closed is a validation error naming the field. */
export function checkClosure(app: AppContext, session: SessionInfo | null, input: ClosureInput): ClosurePlan {
  requirePermission(session, 'system:write')
  const settings = loadSettings(app.db)
  const errors: FieldErrors = {}
  const start = parseDate(input.startDate)
  const end = parseDate(input.endDate)
  if (!start) errors.startDate = 'invalid'
  if (!end) errors.endDate = 'invalid'
  if (start && end && end < start) errors.endDate = 'invalid'
  if (settings.timeZone === null) errors.timeZone = 'required'
  const label = input.label === null ? null : cleanLine(input.label).slice(0, 120) || null
  if (Object.keys(errors).length > 0 || !start || !end || settings.timeZone === null) throw validationFailed(errors)
  const zone = settings.timeZone
  const today = localDateKey(app.clock.now().getTime(), zone)
  const days = daysBetween(start, end) + 1
  if (start < today) errors.startDate = 'invalid'
  if (days > CLOSURE_MAX_DAYS) errors.endDate = 'tooLong'
  if (daysBetween(today, end) > CLOSURE_HORIZON_DAYS) errors.endDate = 'invalid'
  const exceptions = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM availability_exceptions')!.n
  if (exceptions >= MAX_EXCEPTIONS) errors.exceptions = 'tooMany'
  if (Object.keys(errors).length > 0) throw validationFailed(errors)
  const conflicts = blockersBetween(app.db, startOfLocalDay(start, zone), startOfLocalDay(addDays(end, 1), zone)).length
  return { zone, startDate: start, endDate: end, days, label, today, conflicts, exceptions }
}

/** Closes the days: one `closed` exception for the whole range. Refused (409 `bookings_in_range`) while a booking falls inside it; the owner handles those through the booking itself. */
export function closeDays(app: AppContext, session: SessionInfo | null, input: ClosureInput): { id: string; plan: ClosurePlan } {
  const actor = requirePermission(session, 'system:write')
  return app.db.transaction(() => {
    const plan = checkClosure(app, session, input)
    if (plan.conflicts > 0) throw new HttpError(409, 'conflict', 'There are bookings in those days. Handle them first.', { details: { reason: 'bookings_in_range' } })
    const id = newId()
    app.db.run('INSERT INTO availability_exceptions (id, kind, start_date, end_date, start_minute, end_minute, label, created_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)', [id, 'closed', plan.startDate, plan.endDate, plan.label, iso(app.clock.now())])
    audit(app, actor, 'booking.closed_days', 'settings', null, { from: plan.startDate, to: plan.endDate, days: plan.days })
    return { id, plan }
  })
}

