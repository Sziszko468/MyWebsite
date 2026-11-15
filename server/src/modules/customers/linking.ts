import type { AppContext } from '../../context.ts'
import { conflict, forbidden, notFound } from '../../http/errors.ts'
import { newId } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import type { BookingRow } from '../bookings/model.ts'
import type { QuoteRow } from '../quotes/repository.ts'
import { getCustomer, portalSettings, recordAudit, type AuditActor } from './accounts.ts'
import { isVerified, type CustomerRow, type LinkRow, type LinkType } from './model.ts'

/**
 * Which quote requests and bookings are whose. THE rule of the portal: a customer sees a record if and only if a row in `customer_links` joins their account
 * (their id, from the session) to it. Nothing is matched by an address, a reference typed into a request or a similar-looking name.
 *
 * A link is made in exactly two ways, both recorded in the account's history:
 *  - `admin`: the owner links a record to an account, on purpose, from the administration (always available);
 *  - `verified_email`: a signed-in customer claims a record that carries the address THEY have proven, and only while the owner has switched
 *    "customers may link their own records" on (OFF by default). The candidates are computed by the server from the account's verified address at the moment of
 *    the claim; a record id the browser names that is not among them is ignored. An account whose address has not been verified has no candidates.
 *
 * A record belongs to at most one account (the database refuses a second link), and deleting either side removes the link.
 */

export interface Candidate {
  type: LinkType
  id: string
  reference: string
  createdAt: string
  /** The status the CUSTOMER is shown for a request, the booking's own for a booking. */
  status: string
}

/** Records that carry this address and belong to no account. A list for the owner to choose from, or (for a verified account) for the customer to claim. */
export function unlinkedWithAddress(app: Pick<AppContext, 'db'>, email: string): Candidate[] {
  const requests = app.db.all<{ id: string; reference: string; created_at: string; customer_status: string }>(
    'SELECT q.id, q.reference, q.created_at, q.customer_status FROM quote_requests q WHERE q.email = ? COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM customer_links l WHERE l.quote_request_id = q.id) ORDER BY q.created_at DESC LIMIT 100',
    [email],
  )
  const bookings = app.db.all<{ id: string; reference: string; created_at: string; status: string }>(
    'SELECT b.id, b.reference, b.created_at, b.status FROM bookings b WHERE b.email = ? COLLATE NOCASE AND NOT EXISTS (SELECT 1 FROM customer_links l WHERE l.booking_id = b.id) ORDER BY b.created_at DESC LIMIT 100',
    [email],
  )
  return [
    ...requests.map((row) => ({ type: 'quote_request' as const, id: row.id, reference: row.reference, createdAt: row.created_at, status: row.customer_status })),
    ...bookings.map((row) => ({ type: 'booking' as const, id: row.id, reference: row.reference, createdAt: row.created_at, status: row.status })),
  ]
}

/** What a customer may claim: nothing unless their address is verified and the account is active. */
export const claimable = (app: Pick<AppContext, 'db'>, customer: CustomerRow): Candidate[] => (isVerified(customer) ? unlinkedWithAddress(app, customer.email) : [])

function insertLink(app: AppContext, customerId: string, type: LinkType, recordId: string, method: LinkRow['method'], linkedBy: string | null): string {
  const id = newId()
  app.db.run('INSERT INTO customer_links (id, customer_id, quote_request_id, booking_id, method, linked_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
    id, customerId, type === 'quote_request' ? recordId : null, type === 'booking' ? recordId : null, method, linkedBy, iso(app.clock.now()),
  ])
  return id
}

const referenceOf = (app: AppContext, type: LinkType, id: string): string | null =>
  type === 'quote_request' ? (app.db.get<{ reference: string }>('SELECT reference FROM quote_requests WHERE id = ?', [id])?.reference ?? null) : (app.db.get<{ reference: string }>('SELECT reference FROM bookings WHERE id = ?', [id])?.reference ?? null)

/** The owner links a record to an account. The record must exist and belong to no account. */
export function linkByAdmin(app: AppContext, adminId: string, customerId: string, type: LinkType, recordId: string): string {
  const customer = getCustomer(app, customerId)
  if (!customer) throw notFound('The customer')
  const reference = referenceOf(app, type, recordId)
  if (!reference) throw notFound(type === 'booking' ? 'The booking' : 'The quote request')
  return app.db.transaction(() => {
    const taken = app.db.get<{ id: string }>(type === 'quote_request' ? 'SELECT id FROM customer_links WHERE quote_request_id = ?' : 'SELECT id FROM customer_links WHERE booking_id = ?', [recordId])
    if (taken) throw conflict('This record already belongs to an account. Remove that link first.')
    const id = insertLink(app, customerId, type, recordId, 'admin', adminId)
    recordAudit(app, { customerId, type: 'record_linked', actor: { type: 'admin', id: adminId }, detail: `${type}:${reference}` })
    return id
  })
}

export function unlinkByAdmin(app: AppContext, adminId: string, customerId: string, linkId: string): void {
  app.db.transaction(() => {
    const link = app.db.get<LinkRow>('SELECT * FROM customer_links WHERE id = ? AND customer_id = ?', [linkId, customerId])
    if (!link) throw notFound('The link')
    const type: LinkType = link.quote_request_id ? 'quote_request' : 'booking'
    const reference = referenceOf(app, type, (link.quote_request_id ?? link.booking_id)!)
    app.db.run('DELETE FROM customer_links WHERE id = ?', [linkId])
    recordAudit(app, { customerId, type: 'record_unlinked', actor: { type: 'admin', id: adminId }, detail: `${type}:${reference ?? '-'}` })
  })
}

/**
 * A signed-in customer claims records that carry their verified address. Only while the owner allows it, only what the server itself finds for the
 * account's address (a name the browser sends that is not among those is ignored: it neither links nor says why), and every link is recorded.
 */
export function claimOwnRecords(app: AppContext, customerId: string, ids: readonly string[] | null): { linked: number } {
  if (!portalSettings(app).selfLinking) throw forbidden('Linking your own records is not switched on.')
  const customer = getCustomer(app, customerId)
  if (!customer) throw notFound('The account')
  return app.db.transaction(() => {
    const wanted = ids ? new Set(ids) : null
    let linked = 0
    for (const candidate of claimable(app, customer)) {
      if (wanted && !wanted.has(candidate.id)) continue
      insertLink(app, customer.id, candidate.type, candidate.id, 'verified_email', null)
      recordAudit(app, { customerId: customer.id, type: 'record_linked', actor: { type: 'customer', id: customer.id } as AuditActor, detail: `${candidate.type}:${candidate.reference} (verified_email)` })
      linked += 1
    }
    return { linked }
  })
}

// ---- reading: only what the account owns -----------------------------------------------------------------------------------------------

/** A quote request of THIS account, by its reference, or `undefined` (the same answer for one that does not exist and one that belongs to someone else). */
export const ownedRequest = (app: Pick<AppContext, 'db'>, customerId: string, reference: string): QuoteRow | undefined =>
  app.db.get<QuoteRow>('SELECT q.* FROM quote_requests q JOIN customer_links l ON l.quote_request_id = q.id WHERE l.customer_id = ? AND q.reference = ?', [customerId, reference])

export const ownedRequests = (app: Pick<AppContext, 'db'>, customerId: string): QuoteRow[] =>
  app.db.all<QuoteRow>('SELECT q.* FROM quote_requests q JOIN customer_links l ON l.quote_request_id = q.id WHERE l.customer_id = ? ORDER BY q.created_at DESC', [customerId])

export const ownedBooking = (app: Pick<AppContext, 'db'>, customerId: string, reference: string): BookingRow | undefined =>
  app.db.get<BookingRow>('SELECT b.* FROM bookings b JOIN customer_links l ON l.booking_id = b.id WHERE l.customer_id = ? AND b.reference = ?', [customerId, reference])

export const ownedBookings = (app: Pick<AppContext, 'db'>, customerId: string): BookingRow[] =>
  app.db.all<BookingRow>('SELECT b.* FROM bookings b JOIN customer_links l ON l.booking_id = b.id WHERE l.customer_id = ? ORDER BY b.start_at DESC', [customerId])
