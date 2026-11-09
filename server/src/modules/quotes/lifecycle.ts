import type { AppContext, SessionInfo } from '../../context.ts'
import { HttpError, notFound, validationFailed } from '../../http/errors.ts'
import { cleanBlock, length } from '../../lib/text.ts'
import { iso } from '../../lib/time.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { recordEvent } from './events.ts'
import { MoneyError } from './money.ts'
import { contentHashOfQuotation, getQuotation, linesOf, problemsBeforeSending, quotationsOf, recomputed, requireQuotation, type QuotationRow } from './quotations.ts'
import { getQuote, type QuoteRow } from './repository.ts'
import { revokeQuoteTokens } from './tokens.ts'

/**
 * Sending a quotation, taking it back, and sending it again. Each is one transaction: the version's new state, the request's status, the line in
 * the history, the entry on the customer's status page AND the e-mail in the outbox are written together or not at all, so a sent quotation
 * always has its message queued, and a message is never queued for a quotation that was not sent.
 */

const conflictWith = (message: string, reason: string) => new HttpError(409, 'conflict', message, { details: { reason } })

function requireRequest(app: AppContext, id: string): QuoteRow {
  const row = getQuote(app.db, id)
  if (!row) throw notFound('The quote request')
  return row
}

/** Statuses from which a quotation may go out: not a finished, cancelled or already running project. */
const MAY_QUOTE = new Set(['new', 'under_review', 'waiting_customer', 'quote_preparation', 'quote_sent', 'declined'])

export function sendQuotation(app: AppContext, session: SessionInfo | null, id: string, input: { note?: unknown }): QuotationRow {
  const actor = requirePermission(session, 'requests:write')
  const quote = requireQuotation(app, id)
  if (quote.status !== 'draft') throw conflictWith('This quotation was already sent. Make a new version to change it.', 'not_draft')
  const request = requireRequest(app, quote.quote_request_id)
  const lines = linesOf(app.db, quote.id)

  const problems = problemsBeforeSending(app, quote, lines)
  if (Object.keys(problems).length > 0) throw validationFailed(problems, 'The quotation is not complete.')
  if (!app.notifier.canSendQuotations) throw conflictWith('A quotation can only be sent when e-mail is set up and the site address (PUBLIC_URL) is configured.', 'email_unavailable')
  if (!MAY_QUOTE.has(request.status)) throw conflictWith('A quotation cannot be sent for a request in this state.', 'request_state')
  if (quotationsOf(app.db, request.id).some((row) => row.status === 'accepted')) throw conflictWith('An earlier version of this quotation was accepted. It cannot be replaced.', 'already_accepted')
  const note = typeof input.note === 'string' ? cleanBlock(input.note) : ''
  if (length(note) > 1000) throw validationFailed({ note: 'tooLong' })

  let totals: ReturnType<typeof recomputed>
  try {
    totals = recomputed(quote, lines)
  } catch (error) {
    if (error instanceof MoneyError) throw validationFailed({ lines: 'invalid' }, 'The amounts do not add up.')
    throw error
  }
  const now = iso(app.clock.now())
  const revised = quote.version > 1

  app.db.transaction(() => {
    // Only one version is out at a time (the database insists): the earlier one is replaced first, and its links stop working.
    for (const earlier of quotationsOf(app.db, request.id).filter((row) => row.status === 'sent' && row.id !== quote.id)) {
      app.db.run("UPDATE quotes SET status = 'superseded', updated_at = ? WHERE id = ? AND status = 'sent'", [now, earlier.id])
      const revoked = revokeQuoteTokens(app, earlier.id)
      recordEvent(app, { requestId: request.id, reference: request.reference, quoteId: earlier.id, type: 'quote_superseded', actor: { type: 'admin', session: actor }, summary: `v${earlier.version} replaced by v${quote.version}; ${revoked} link(s) ended` })
    }
    const sent = app.db.run(
      `UPDATE quotes SET status = 'sent', sent_at = ?, content_hash = ?, subtotal_minor = ?, discount_minor = ?, tax_minor = ?, total_minor = ?, updated_at = ? WHERE id = ? AND status = 'draft'`,
      [now, contentHashOfQuotation(quote, lines), totals?.subtotalMinor ?? null, totals?.discountMinor ?? null, totals?.taxMinor ?? null, totals?.totalMinor ?? null, now, quote.id],
    )
    if (sent.changes !== 1) throw conflictWith('This quotation was already sent.', 'not_draft')

    app.db.run("UPDATE quote_requests SET status = 'quote_sent', customer_status = 'quote_sent', updated_at = ? WHERE id = ?", [now, request.id])
    app.db.run("INSERT INTO customer_updates (quote_request_id, kind, status, body, author_id, created_at) VALUES (?, 'quote', 'quote_sent', '', ?, ?)", [request.id, actor.userId, now])
    if (request.status !== 'quote_sent') recordEvent(app, { requestId: request.id, reference: request.reference, type: 'status_changed', actor: { type: 'admin', session: actor }, from: request.status, to: 'quote_sent', summary: 'quotation sent' })
    recordEvent(app, { requestId: request.id, reference: request.reference, quoteId: quote.id, type: 'quote_sent', actor: { type: 'admin', session: actor }, summary: revised ? `v${quote.version} (revision)` : `v${quote.version}` })
    app.notifier.queueQuotation({ ...quote, status: 'sent' }, request, revised, note || null)
    audit(app, actor, 'quote.send', 'quote', quote.id, { request: request.reference, version: quote.version, revised })
  })
  return requireQuotation(app, id)
}

/** Sends the e-mail with the link again (a lost message): a new link, the same offer. Only while the version is out with the customer. */
export function resendQuotation(app: AppContext, session: SessionInfo | null, id: string): void {
  const actor = requirePermission(session, 'requests:write')
  const quote = requireQuotation(app, id)
  if (quote.status !== 'sent') throw conflictWith('Only a quotation that is out with the customer can be sent again.', 'not_sent')
  if (!app.notifier.canSendQuotations) throw conflictWith('E-mail is not set up.', 'email_unavailable')
  const request = requireRequest(app, quote.quote_request_id)
  app.db.transaction(() => {
    app.notifier.queueQuotation(quote, request, quote.version > 1, null)
    recordEvent(app, { requestId: request.id, reference: request.reference, quoteId: quote.id, type: 'quote_resent', actor: { type: 'admin', session: actor }, summary: `v${quote.version}` })
    audit(app, actor, 'quote.resend', 'quote', quote.id, { version: quote.version })
  })
}

/** Takes a quotation back before the customer decides: its links stop working and the request goes back to preparation. */
export function withdrawQuotation(app: AppContext, session: SessionInfo | null, id: string): QuotationRow {
  const actor = requirePermission(session, 'requests:write')
  const quote = requireQuotation(app, id)
  if (quote.status !== 'sent') throw conflictWith('Only a quotation that is out with the customer can be withdrawn.', 'not_sent')
  const request = requireRequest(app, quote.quote_request_id)
  const now = iso(app.clock.now())
  app.db.transaction(() => {
    const changed = app.db.run("UPDATE quotes SET status = 'withdrawn', updated_at = ? WHERE id = ? AND status = 'sent'", [now, quote.id])
    if (changed.changes !== 1) throw conflictWith('The customer decided in the meantime.', 'not_sent')
    const revoked = revokeQuoteTokens(app, quote.id)
    if (request.status === 'quote_sent') {
      app.db.run("UPDATE quote_requests SET status = 'quote_preparation', customer_status = 'quote_preparation', updated_at = ? WHERE id = ?", [now, request.id])
      recordEvent(app, { requestId: request.id, reference: request.reference, type: 'status_changed', actor: { type: 'admin', session: actor }, from: 'quote_sent', to: 'quote_preparation', summary: 'quotation withdrawn' })
    }
    recordEvent(app, { requestId: request.id, reference: request.reference, quoteId: quote.id, type: 'quote_withdrawn', actor: { type: 'admin', session: actor }, summary: `v${quote.version}; ${revoked} link(s) ended` })
    audit(app, actor, 'quote.withdraw', 'quote', quote.id, { version: quote.version })
  })
  return getQuotation(app.db, id) as QuotationRow
}
