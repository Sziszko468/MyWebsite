import type { Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { addMs, iso } from '../../lib/time.ts'
import { MailError } from '../notifications/smtp.ts'
import {
  renderBookingCancelled,
  renderBookingCancelledAdmin,
  renderBookingConfirmed,
  renderBookingNewAdmin,
  renderBookingProposal,
  renderBookingReceived,
  renderBookingRescheduled,
  renderChangeAdmin,
  renderChangeDeclined,
  renderChangeReceived,
  type BookingMail,
  type ChangeMail,
} from '../notifications/bookingTemplates.ts'
import type { Rendered } from '../notifications/templates.ts'
import { loadSettings, type BookingRow, type ChangeRow } from './model.ts'
import { getBooking, mintBookingToken, typeById } from './repository.ts'

/**
 * Writes a booking's e-mail from the records it is about, at the moment it is sent (the outbox keeps only the kind and the event id). A booking's
 * message is about one EVENT of the booking, so the once-only rule of the outbox means one message per event, however often a request is repeated.
 *
 * Times come from the event's own snapshot where the message is about a move (a message delayed past a second move still tells the truth about
 * the move it announces); a link is minted now, for this message, and only when the operator has said where the site is.
 */

type Deps = Pick<AppContext, 'db' | 'config' | 'clock'>

interface EventRow {
  id: number
  booking_id: string
  event_type: string
  change_id: string | null
  from_start_at: string | null
  to_start_at: string | null
}

const changeMail = (change: ChangeRow): ChangeMail => ({ kind: change.kind, initiator: change.initiator, status: change.status, newStartAt: change.new_start_at, newEndAt: change.new_end_at, message: change.message, expiresAt: change.expires_at })

export function renderBookingDelivery(deps: Deps, row: { kind: string; related_id: string; language: Language; note: string | null }, brand: string): Rendered | null {
  const { db, config } = deps
  const event = db.get<EventRow>('SELECT id, booking_id, event_type, change_id, from_start_at, to_start_at FROM booking_events WHERE id = ?', [Number(row.related_id)])
  if (!event) return null
  const booking: BookingRow | undefined = getBooking(db, event.booking_id)
  // The booking was erased (the maintenance task or an erasure request): there is nothing left to write about.
  if (!booking) return null
  const type = typeById(db, booking.consultation_type_id)
  const settings = loadSettings(db)
  const lang = row.language
  const lengthMs = Date.parse(booking.end_at) - Date.parse(booking.start_at)
  // Only a move's own event carries the time the booking moved to; a request's event carries the time asked for, which is the change's business.
  const moved = event.event_type === 'rescheduled' && event.to_start_at !== null
  const mail: BookingMail = {
    reference: booking.reference,
    name: booking.name,
    email: booking.email,
    company: booking.company,
    website: booking.website,
    description: booking.description,
    // Never another language's name: a type that has no name in the message's language shows its code.
    typeName: type?.translations[lang].name.trim() || type?.code || '',
    durationMinutes: Math.round(lengthMs / 60_000),
    startAt: moved ? event.to_start_at! : booking.start_at,
    endAt: moved ? iso(addMs(new Date(event.to_start_at!), lengthMs)) : booking.end_at,
    timeZone: booking.time_zone,
    status: booking.status,
    canRequestChange: settings.allowCancelRequests || settings.allowRescheduleRequests,
  }
  const change = event.change_id ? db.get<ChangeRow>('SELECT * FROM booking_changes WHERE id = ?', [event.change_id]) : undefined
  const manage = (): string | null => (config.publicUrl ? `${config.publicUrl}/${lang}/consultation/booking/${mintBookingToken(deps, booking).token}` : null)
  const adminUrl = config.publicUrl ? `${config.publicUrl}/admin/bookings/${booking.id}` : null

  switch (row.kind) {
    case 'booking_received':
      return renderBookingReceived(mail, lang, brand, manage())
    case 'booking_confirmed':
      return renderBookingConfirmed(mail, lang, brand, manage())
    case 'booking_new_admin':
      return renderBookingNewAdmin(mail, lang, brand, adminUrl)
    case 'booking_change_received':
      return change ? renderChangeReceived(mail, changeMail(change), lang, brand, manage()) : null
    case 'booking_change_requested_admin':
      return change ? renderChangeAdmin(mail, changeMail(change), lang, brand, adminUrl) : null
    case 'booking_rescheduled': {
      const previous = event.from_start_at ? { startAt: event.from_start_at, endAt: iso(addMs(new Date(event.from_start_at), lengthMs)) } : null
      return renderBookingRescheduled(mail, previous, lang, brand, manage(), row.note)
    }
    case 'booking_proposal': {
      const url = manage()
      // A proposal is answered on the page behind the link: a message without it would be a proposal nobody can answer.
      if (!url) throw new MailError('The site address (PUBLIC_URL) is not set, so the booking link cannot be built.', { transient: false, reason: 'rejected' })
      return change ? renderBookingProposal(mail, changeMail(change), lang, brand, url, row.note) : null
    }
    case 'booking_change_declined':
      return change ? renderChangeDeclined(mail, changeMail(change), lang, brand, manage(), row.note) : null
    case 'booking_cancelled':
      return renderBookingCancelled(mail, booking.cancelled_by ?? 'owner', lang, brand, manage(), row.note)
    case 'booking_cancelled_admin':
      return renderBookingCancelledAdmin(mail, booking.cancelled_by ?? 'owner', lang, brand, adminUrl)
    default:
      return null
  }
}

/** The address a message to the owner can be answered to: the customer's. */
export function bookingCustomerAddress(deps: Pick<AppContext, 'db'>, relatedId: string): string | null {
  const event = deps.db.get<{ booking_id: string }>('SELECT booking_id FROM booking_events WHERE id = ?', [Number(relatedId)])
  return event ? (getBooking(deps.db, event.booking_id)?.email ?? null) : null
}
