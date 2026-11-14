import type { AppContext } from '../../context.ts'
import { HttpError, validationFailed } from '../../http/errors.ts'
import { newId } from '../../lib/crypto.ts'
import { cleanBlock, length } from '../../lib/text.ts'
import { iso } from '../../lib/time.ts'
import { recordEvent } from './events.ts'
import { getQuotation, linesOf, quotationsOf, type QuotationRow } from './quotations.ts'
import { getQuote, type QuoteRow } from './repository.ts'
import { ACTION_TOKEN_TTL_MS, consumeToken, findToken, mintToken, mintViewToken, revokeQuoteTokens, tokenState, type TokenAction, type TokenRow } from './tokens.ts'
import { buildQuoteView, isExpired, type QuoteView } from './view.ts'
import type { RequestStatus } from './status.ts'

/**
 * What a customer can do with a link. Everything here is reached through a secret token and nothing else: a reference, an e-mail address
 * or a guess opens nothing. An unknown token and a wrong one are answered alike (404); a token that WAS real but no longer works says so (410,
 * with a reason), because the person holding it deserves to know to look for a newer message. Accepting, declining and asking for a revision
 * use a single-use token that the quotation page hands out when it is opened; each is checked, spent and acted on in one transaction, so a
 * replayed or doubled click does nothing the second time.
 */

const invalid = () => new HttpError(404, 'not_found', 'This link is not valid.')
const gone = (reason: 'expired' | 'replaced') => new HttpError(410, 'gone', reason === 'expired' ? 'This link has expired.' : 'This link has been replaced or withdrawn.', { details: { reason } })
const refused = (message: string, reason: string) => new HttpError(409, 'conflict', message, { details: { reason } })

/** A made-up or wrong token costs the asker: after a handful they wait. */
function missed(app: AppContext, ip: string): never {
  app.limiters.check('tokenMiss', ip)
  throw invalid()
}

/** The token and the records behind it, or the answer for why not. */
function resolve(app: AppContext, raw: string, allowed: readonly TokenAction[], ip: string): { token: TokenRow; request: QuoteRow; quote: QuotationRow | null } {
  const token = findToken(app, raw)
  if (!token || !allowed.includes(token.action)) return missed(app, ip)
  const state = tokenState(app, token)
  if (state === 'revoked') throw gone('replaced')
  if (state === 'expired') throw gone('expired')
  const request = getQuote(app.db, token.quote_request_id)
  if (!request) return missed(app, ip)
  const quote = token.quote_id ? (getQuotation(app.db, token.quote_id) ?? null) : null
  if (token.quote_id && !quote) return missed(app, ip)
  return { token, request, quote }
}

export type QuoteState = 'open' | 'expired' | 'accepted' | 'declined' | 'superseded' | 'withdrawn'

function stateOf(quote: QuotationRow, now: Date): QuoteState {
  if (quote.status === 'sent') return isExpired(quote, now) ? 'expired' : 'open'
  if (quote.status === 'draft') return 'withdrawn'
  return quote.status
}

export interface QuotePage {
  quote: QuoteView
  state: QuoteState
  /** Single-use tokens for the three things the page can do; only while the offer is open (or, for a revision, expired). */
  actions: { accept: string | null; decline: string | null; revise: string | null }
}

/** The quotation page's data. Opening it hands out fresh single-use tokens and ends any earlier unused ones. */
export function viewQuotation(app: AppContext, raw: string, ip: string): QuotePage {
  const { token, request, quote } = resolve(app, raw, ['view_quote'], ip)
  if (!quote || token.action !== 'view_quote' || quote.status === 'draft') return missed(app, ip)
  const state = stateOf(quote, app.clock.now())
  const view = buildQuoteView(quote, linesOf(app.db, quote.id), request, app.clock.now())
  const actions: QuotePage['actions'] = { accept: null, decline: null, revise: null }
  if (state === 'open' || state === 'expired') {
    app.db.transaction(() => {
      revokeQuoteTokens(app, quote.id, ['accept_quote', 'decline_quote', 'request_revision'])
      const mint = (action: TokenAction) => mintToken(app, { requestId: request.id, quoteId: quote.id, action, ttlMs: ACTION_TOKEN_TTL_MS }).token
      if (state === 'open') {
        actions.accept = mint('accept_quote')
        actions.decline = mint('decline_quote')
      }
      actions.revise = mint('request_revision')
    })
  }
  return { quote: view, state, actions }
}

export interface RequestPage {
  reference: string
  createdAt: string
  language: QuoteRow['language']
  status: RequestStatus
  updates: Array<{ at: string; kind: 'status' | 'message' | 'quote'; status: RequestStatus | null; body: string }>
  quotations: Array<{ reference: string; version: number; title: string; state: QuoteState; sentAt: string | null; validUntil: string | null; link: string | null }>
}

/** The customer's status page: what they were shown, and nothing else (no notes, no history, no addresses). */
export function viewRequest(app: AppContext, raw: string, ip: string): RequestPage {
  const { request } = resolve(app, raw, ['view_request'], ip)
  const now = app.clock.now()
  const updates = app.db.all<{ created_at: string; kind: 'status' | 'message' | 'quote'; status: RequestStatus | null; body: string }>('SELECT created_at, kind, status, body FROM customer_updates WHERE quote_request_id = ? ORDER BY id', [request.id])
  const quotations = quotationsOf(app.db, request.id).filter((quote) => quote.status !== 'draft')
  return {
    reference: request.reference,
    createdAt: request.created_at,
    language: request.language,
    status: request.customer_status,
    updates: updates.map((row) => ({ at: row.created_at, kind: row.kind, status: row.status, body: row.body })),
    quotations: quotations.map((quote) => ({
      reference: quote.reference,
      version: quote.version,
      title: quote.title,
      state: stateOf(quote, now),
      sentAt: quote.sent_at,
      validUntil: quote.valid_until,
      // A link only for the offer that is out with the customer: the page it leads to is what they were e-mailed.
      link: quote.status === 'sent' ? app.db.transaction(() => mintViewToken(app, { requestId: request.id, quoteId: quote.id }).token) : null,
    })),
  }
}

export interface DecisionInput {
  confirm: boolean
  reason: string | null
  message: string | null
}

export function parseDecision(body: Record<string, unknown>): { token: string } & DecisionInput {
  const token = typeof body.token === 'string' ? body.token : ''
  const errors: Record<string, 'required' | 'invalid' | 'tooLong' | 'tooShort'> = {}
  const text = (name: string, max: number): string | null => {
    const value = body[name]
    if (value === undefined || value === null || value === '') return null
    if (typeof value !== 'string') {
      errors[name] = 'invalid'
      return null
    }
    const cleaned = cleanBlock(value)
    if (length(cleaned) > max) errors[name] = 'tooLong'
    return cleaned || null
  }
  const reason = text('reason', 1000)
  const message = text('message', 2000)
  if (Object.keys(errors).length > 0) throw validationFailed(errors)
  return { token, confirm: body.confirm === true, reason, message }
}

export type DecisionResult = { outcome: 'accepted' | 'declined' | 'revision_requested'; at: string; reference: string }

/** Accepts, declines or asks for a revision, depending on what the token was made for. */
export function act(app: AppContext, input: { token: string } & DecisionInput, ip: string, ipHash: string): DecisionResult {
  const { token, request, quote } = resolve(app, input.token, ['accept_quote', 'decline_quote', 'request_revision'], ip)
  if (!quote) return missed(app, ip)
  // A spent token is a replay; say so plainly rather than "not found".
  if (token.used_at) throw refused('This action was already carried out.', 'already_used')
  const now = app.clock.now()
  const nowIso = iso(now)
  const today = nowIso.slice(0, 10)

  if (token.action === 'request_revision') {
    if (!input.message || length(input.message) < 3) throw validationFailed({ message: input.message ? 'tooShort' : 'required' })
    if (quote.status !== 'sent') throw refused('This quotation is no longer open.', 'not_open')
    const id = newId()
    app.db.transaction(() => {
      if (!consumeToken(app, token.id)) throw refused('This action was already carried out.', 'already_used')
      app.db.run('INSERT INTO quote_revision_requests (id, quote_id, quote_request_id, message, created_at) VALUES (?, ?, ?, ?, ?)', [id, quote.id, request.id, input.message, nowIso])
      if (request.status === 'quote_sent') {
        app.db.run("UPDATE quote_requests SET status = 'under_review', customer_status = 'under_review', updated_at = ? WHERE id = ?", [nowIso, request.id])
        app.db.run("INSERT INTO customer_updates (quote_request_id, kind, status, body, author_id, created_at) VALUES (?, 'status', 'under_review', '', NULL, ?)", [request.id, nowIso])
        recordEvent(app, { requestId: request.id, reference: request.reference, type: 'status_changed', actor: { type: 'customer' }, from: 'quote_sent', to: 'under_review', summary: 'revision requested' })
      }
      recordEvent(app, { requestId: request.id, reference: request.reference, quoteId: quote.id, type: 'revision_requested', actor: { type: 'customer' }, summary: `v${quote.version}` })
      app.notifier.queueRevisionNotice(id, quote, request)
    })
    return { outcome: 'revision_requested', at: nowIso, reference: quote.reference }
  }

  const accepting = token.action === 'accept_quote'
  if (!input.confirm) throw validationFailed({ confirm: 'required' }, accepting ? 'Confirm that you accept the quotation.' : 'Confirm that you decline the quotation.')
  if (quote.status !== 'sent') throw refused(quote.status === 'accepted' || quote.status === 'declined' ? 'This quotation was already decided.' : 'This quotation is no longer open.', quote.status === 'accepted' || quote.status === 'declined' ? 'already_decided' : 'not_open')
  if (accepting && quote.valid_until !== null && quote.valid_until < today) throw refused('This offer is no longer valid. Ask for a new one.', 'quote_expired')

  app.db.transaction(() => {
    // The token is spent and the quotation changes in the same step: the update is only true while the quotation is still open, so of two
    // simultaneous clicks exactly one succeeds, and a failure puts the token back.
    if (!consumeToken(app, token.id)) throw refused('This action was already carried out.', 'already_used')
    const changed = accepting
      ? app.db.run("UPDATE quotes SET status = 'accepted', accepted_at = ?, accepted_ip_hash = ?, updated_at = ? WHERE id = ? AND status = 'sent' AND (valid_until IS NULL OR valid_until >= ?)", [nowIso, ipHash, nowIso, quote.id, today])
      : app.db.run("UPDATE quotes SET status = 'declined', declined_at = ?, decline_reason = ?, updated_at = ? WHERE id = ? AND status = 'sent'", [nowIso, input.reason, nowIso, quote.id])
    if (changed.changes !== 1) throw refused('This quotation was already decided.', 'already_decided')
    // Nothing else can be done with this version's links except reading it.
    revokeQuoteTokens(app, quote.id, ['accept_quote', 'decline_quote', 'request_revision'])
    const next: RequestStatus = accepting ? 'accepted' : 'declined'
    app.db.run('UPDATE quote_requests SET status = ?, customer_status = ?, updated_at = ? WHERE id = ?', [next, next, nowIso, request.id])
    app.db.run("INSERT INTO customer_updates (quote_request_id, kind, status, body, author_id, created_at) VALUES (?, 'status', ?, '', NULL, ?)", [request.id, next, nowIso])
    recordEvent(app, { requestId: request.id, reference: request.reference, type: 'status_changed', actor: { type: 'customer' }, from: request.status, to: next, summary: accepting ? 'quotation accepted' : 'quotation declined' })
    recordEvent(app, { requestId: request.id, reference: request.reference, quoteId: quote.id, type: accepting ? 'quote_accepted' : 'quote_declined', actor: { type: 'customer' }, summary: `v${quote.version}` })
    app.notifier.queueDecision({ ...quote, status: accepting ? 'accepted' : 'declined', accepted_at: accepting ? nowIso : null, declined_at: accepting ? null : nowIso }, request, accepting ? 'accepted' : 'declined')
  })
  return { outcome: accepting ? 'accepted' : 'declined', at: nowIso, reference: quote.reference }
}
