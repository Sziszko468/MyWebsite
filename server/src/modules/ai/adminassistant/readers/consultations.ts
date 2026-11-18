import { iso, likeOf, cut, LIMITS, NOT_FOUND, pageOf, untrusted } from '../model.ts'
import { inScope, isGeneral, scopeClause, scopeIds } from '../scope.ts'
import { link, listed, type ReadCtx } from './common.ts'

/**
 * Consultation bookings for the admin assistant. Permission: `requests:read`. These readers only SELECT. The booking list of the administration also closes expired
 * proposals while it reads (`expireChanges` writes); this one does not: a proposal that has run out but has not been closed yet is reported as `expired: true`, and
 * nothing is changed. Availability, booking status and the customer's e-mail address are never touched or returned; the administrator's own notes on a booking are not read.
 */

const NEED = 'requests:read'
const ACTIVE = ['pending', 'confirmed', 'reschedule_requested', 'rescheduled']

interface Row {
  id: string
  reference: string
  language: string
  name: string
  company: string | null
  description: string
  start_at: string
  end_at: string
  time_zone: string
  status: string
  quote_request_id: string | null
  created_at: string
  type_code: string
  type_name: string | null
  open_kind: string | null
  open_expires_at: string | null
}

// The fixed select list and joins (a constant of this file, never built from input).
const columns = `SELECT b.id, b.reference, b.language, b.name, b.company, b.description, b.start_at, b.end_at, b.time_zone, b.status, b.quote_request_id, b.created_at,
       t.code AS type_code, tt.name AS type_name,
       (SELECT c.kind FROM booking_changes c WHERE c.booking_id = b.id AND c.status = 'open' ORDER BY c.created_at DESC LIMIT 1) AS open_kind,
       (SELECT c.expires_at FROM booking_changes c WHERE c.booking_id = b.id AND c.status = 'open' ORDER BY c.created_at DESC LIMIT 1) AS open_expires_at
  FROM bookings b JOIN consultation_types t ON t.id = b.consultation_type_id LEFT JOIN consultation_type_translations tt ON tt.type_id = t.id AND tt.language = b.language`

export interface ConsultationSearch {
  query?: string | undefined
  status?: string | undefined
  /** `upcoming` (from now on, the default), `past`, or `all`. */
  when?: 'upcoming' | 'past' | 'all' | undefined
  fromDay?: string | undefined
  toDay?: string | undefined
  limit?: number | undefined
  page?: number | undefined
}

interface Overlap {
  id: string
  reference: string
  start_at: string
  end_at: string
  status: string
}

/** Active bookings that overlap the span, from the booking data itself. */
function overlapsIn(ctx: ReadCtx, from: string, to: string): Overlap[] {
  const placeholders = ACTIVE.map(() => '?').join(', ')
  return ctx.app.db.all<Overlap>(`SELECT id, reference, start_at, end_at, status FROM bookings WHERE status IN (${placeholders}) AND start_at < ? AND end_at > ? ORDER BY start_at LIMIT 200`, [...ACTIVE, to, from])
}

function conflictsOf(row: { id: string; start_at: string; end_at: string }, pool: Overlap[]): Overlap[] {
  return pool.filter((other) => other.id !== row.id && other.start_at < row.end_at && other.end_at > row.start_at)
}

export function searchConsultations(ctx: ReadCtx, input: ConsultationSearch) {
  ctx.access.need(NEED)
  const now = ctx.app.clock.now()
  const conditions: string[] = ['1 = 1']
  const params: Array<string | number> = []
  const when = input.when ?? 'upcoming'
  if (when === 'upcoming') {
    conditions.push('b.end_at >= ?')
    params.push(iso(now))
  } else if (when === 'past') {
    conditions.push('b.end_at < ?')
    params.push(iso(now))
  }
  if (input.fromDay) {
    conditions.push('b.start_at >= ?')
    params.push(`${input.fromDay}T00:00:00.000Z`)
  }
  if (input.toDay) {
    conditions.push('b.start_at < ?')
    params.push(`${input.toDay}T23:59:59.999Z`)
  }
  if (input.status) {
    conditions.push('b.status = ?')
    params.push(input.status)
  }
  if (input.query) {
    const like = likeOf(input.query)
    conditions.push("(b.reference LIKE ? ESCAPE '!' OR b.name LIKE ? ESCAPE '!' OR COALESCE(b.company, '') LIKE ? ESCAPE '!')")
    params.push(like, like, like)
  }
  const restricted = scopeClause(scopeIds(ctx.scope, 'booking'), 'b.id')
  const where = `${conditions.join(' AND ')}${restricted.sql}`
  const all = [...params, ...restricted.params]
  const page = pageOf(input)
  const total = ctx.app.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM bookings b WHERE ${where}`, all)?.n ?? 0
  const order = when === 'past' ? 'b.start_at DESC' : 'b.start_at'
  const rows = ctx.app.db.all<Row>(`${columns} WHERE ${where} ORDER BY ${order}, b.id LIMIT ? OFFSET ?`, [...all, page.limit, page.offset])
  const pool = rows.length > 0 ? overlapsIn(ctx, rows.reduce((min, row) => (row.start_at < min ? row.start_at : min), rows[0].start_at), rows.reduce((max, row) => (row.end_at > max ? row.end_at : max), rows[0].end_at)) : []
  const general = isGeneral(ctx.scope)
  return listed(
    ctx,
    rows.map((row) => {
      const clash = ACTIVE.includes(row.status) ? conflictsOf(row, pool) : []
      return {
        reference: row.reference,
        type: { code: row.type_code, name: cut(row.type_name, 80) },
        startAt: row.start_at,
        endAt: row.end_at,
        timeZone: row.time_zone,
        status: row.status,
        customer: { name: cut(row.name, 80), company: cut(row.company, 80), language: row.language },
        openChange: row.open_kind ? { kind: row.open_kind, expired: row.open_expires_at !== null && row.open_expires_at <= iso(now) } : null,
        // Other customers' bookings are named only in the general context; in a record context only the number is said.
        schedulingConflicts: general ? clash.map((other) => ({ reference: other.reference, startAt: other.start_at, endAt: other.end_at, status: other.status })) : { count: clash.length },
        link: link.consultation(row.reference, row.id),
      }
    }),
    total,
    page,
  )
}

export function consultationByReference(ctx: ReadCtx, reference: string | undefined): Row {
  ctx.access.need(NEED)
  const ref = reference ?? (ctx.scope.type === 'consultation' ? ctx.scope.ref : null)
  if (!ref) throw NOT_FOUND()
  const row = ctx.app.db.get<Row>(`${columns} WHERE b.reference = ?`, [ref])
  if (!row || !inScope(ctx.scope, 'booking', row.id)) throw NOT_FOUND()
  return row
}

export function consultationDetails(ctx: ReadCtx, reference: string | undefined) {
  const row = consultationByReference(ctx, reference)
  const { app } = ctx
  const now = iso(app.clock.now())
  const changes = app.db.all<{ kind: string; initiator: string; status: string; new_start_at: string | null; new_end_at: string | null; message: string | null; expires_at: string | null; created_at: string }>(
    'SELECT kind, initiator, status, new_start_at, new_end_at, message, expires_at, created_at FROM booking_changes WHERE booking_id = ? ORDER BY created_at DESC LIMIT 5',
    [row.id],
  )
  const events = app.db.all<{ event_type: string; from_status: string | null; to_status: string | null; created_at: string }>('SELECT event_type, from_status, to_status, created_at FROM booking_events WHERE booking_id = ? ORDER BY id DESC LIMIT 15', [row.id])
  const quote = row.quote_request_id && inScope(ctx.scope, 'quote', row.quote_request_id) ? app.db.get<{ id: string; reference: string; status: string }>('SELECT id, reference, status FROM quote_requests WHERE id = ?', [row.quote_request_id]) : undefined
  return {
    basis: 'actual' as const,
    reference: row.reference,
    type: { code: row.type_code, name: cut(row.type_name, 80) },
    startAt: row.start_at,
    endAt: row.end_at,
    timeZone: row.time_zone,
    status: row.status,
    bookedAt: row.created_at,
    customer: { name: cut(row.name, 80), company: cut(row.company, 80), language: row.language },
    customerDescriptionUntrusted: untrusted(row.description, LIMITS.detailText),
    relatedQuoteRequest: quote ? { reference: quote.reference, status: quote.status, link: link.quote(quote.reference, quote.id) } : null,
    changes: changes.map((change) => ({
      kind: change.kind,
      proposedBy: change.initiator,
      status: change.status,
      newStartAt: change.new_start_at,
      newEndAt: change.new_end_at,
      messageUntrusted: untrusted(change.message, 300),
      expiresAt: change.expires_at,
      expired: change.status === 'open' && change.expires_at !== null && change.expires_at <= now,
      at: change.created_at,
    })),
    history: events.map((event) => ({ type: event.event_type, from: event.from_status, to: event.to_status, at: event.created_at })),
    internalNotesIncluded: false as const,
    link: link.consultation(row.reference, row.id),
  }
}

export function consultationBriefing(ctx: ReadCtx, reference: string | undefined) {
  const details = consultationDetails(ctx, reference)
  const row = consultationByReference(ctx, details.reference)
  const pool = overlapsIn(ctx, row.start_at, row.end_at)
  const clash = ACTIVE.includes(row.status) ? conflictsOf(row, pool) : []
  const now = ctx.app.clock.now()
  const hoursUntil = Math.round(((new Date(row.start_at).getTime() - now.getTime()) / 3_600_000) * 10) / 10
  const unknowns: string[] = []
  if (row.description.trim().length < 20) unknowns.push('no_description_from_customer')
  if (!details.relatedQuoteRequest) unknowns.push('no_linked_quote_request')
  return {
    ...details,
    derived: {
      basis: 'derived_from_stored_fields' as const,
      startsInHours: hoursUntil,
      isUpcoming: hoursUntil > 0 && ACTIVE.includes(row.status),
      needsAttention: row.status === 'pending' || details.changes.some((change) => change.status === 'open'),
      schedulingConflicts: isGeneral(ctx.scope) ? clash.map((other) => ({ reference: other.reference, startAt: other.start_at, endAt: other.end_at, status: other.status })) : { count: clash.length },
      unknowns,
    },
  }
}
