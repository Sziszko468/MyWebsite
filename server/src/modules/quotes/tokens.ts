import type { AppContext } from '../../context.ts'

/** What the token functions need: the notifier (which writes e-mails) has these three but is not an `AppContext`. */
export type TokenDeps = Pick<AppContext, 'db' | 'clock' | 'config'>
import { newId, randomToken, sha256Hex } from '../../lib/crypto.ts'
import { addMs, DAY, HOUR, iso } from '../../lib/time.ts'

/**
 * The secure links. A token is 256 random bits (base64url, 43 characters); the database keeps only its SHA-256, so a copy of the
 * database opens nothing. A token belongs to one request (a status page) or one quotation, and to one action:
 *
 *   view_request    the customer's status page. Reusable until it expires or is revoked.
 *   view_quote      the quotation page. Reusable until it expires, is revoked, or the version is replaced.
 *   accept_quote    ┐ handed out by the quotation page, when it is opened: each works ONCE, for a couple of hours,
 *   decline_quote   │ and only for the quotation it was made for. Opening the page again replaces the unused ones, so a
 *   request_revision┘ link that was copied somewhere cannot be used twice.
 *
 * A link in an e-mail is a view token. It is minted when the e-mail is written (not stored anywhere in the clear), so a message that is
 * written again for a retry carries a fresh token; the earlier ones keep working until they expire, because that earlier message may well
 * have been the one that arrived.
 */

export type TokenAction = 'view_request' | 'view_quote' | 'accept_quote' | 'decline_quote' | 'request_revision'

export const ACTION_TOKEN_TTL_MS = 2 * HOUR
const SHAPE = /^[A-Za-z0-9_-]{43}$/

export interface TokenRow {
  id: string
  token_hash: string
  quote_request_id: string
  quote_id: string | null
  action: TokenAction
  created_at: string
  expires_at: string
  used_at: string | null
  revoked_at: string | null
}

export const hashToken = (token: string): string => sha256Hex(token)

export interface Minted {
  token: string
  id: string
  expiresAt: string
}

export function mintToken(app: TokenDeps, input: { requestId: string; quoteId: string | null; action: TokenAction; ttlMs: number }): Minted {
  const now = app.clock.now()
  const token = randomToken(32)
  const id = newId()
  const expiresAt = iso(addMs(now, input.ttlMs))
  app.db.run('INSERT INTO customer_action_tokens (id, token_hash, quote_request_id, quote_id, action, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, hashToken(token), input.requestId, input.quoteId, input.action, iso(now), expiresAt])
  return { token, id, expiresAt }
}

/** A view token, valid for the operator's chosen number of days (CUSTOMER_LINK_DAYS). */
export const mintViewToken = (app: TokenDeps, input: { requestId: string; quoteId: string | null }): Minted =>
  mintToken(app, { requestId: input.requestId, quoteId: input.quoteId, action: input.quoteId ? 'view_quote' : 'view_request', ttlMs: app.config.customerLinkDays * DAY })

/** What a token is, or `null` when nothing matches (the same answer for a made-up string as for a deleted record). */
export function findToken(app: TokenDeps, token: string): TokenRow | null {
  if (!SHAPE.test(token)) return null
  return app.db.get<TokenRow>('SELECT * FROM customer_action_tokens WHERE token_hash = ?', [hashToken(token)]) ?? null
}

export type TokenState = 'ok' | 'expired' | 'used' | 'revoked'

export function tokenState(app: TokenDeps, row: TokenRow): TokenState {
  if (row.revoked_at) return 'revoked'
  if (row.used_at) return 'used'
  if (row.expires_at <= iso(app.clock.now())) return 'expired'
  return 'ok'
}

/** Spends a single-use token. False when it was already spent, revoked or expired in the meantime (the update itself is the check, so two requests cannot both win). */
export function consumeToken(app: TokenDeps, id: string): boolean {
  const now = iso(app.clock.now())
  return app.db.run('UPDATE customer_action_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?', [now, id, now]).changes === 1
}

/** Revokes a quotation's tokens (all, or only some actions): a replaced version's links, or the unused action tokens before new ones are made. */
export function revokeQuoteTokens(app: TokenDeps, quoteId: string, actions?: readonly TokenAction[]): number {
  const now = iso(app.clock.now())
  const clauses = actions && actions.length > 0 ? ` AND action IN (${actions.map(() => '?').join(', ')})` : ''
  return app.db.run(`UPDATE customer_action_tokens SET revoked_at = ? WHERE quote_id = ? AND revoked_at IS NULL AND used_at IS NULL${clauses}`, [now, quoteId, ...(actions ?? [])]).changes
}

/** Ends every link of a request (a cancelled request's status page, for example). */
export function revokeRequestTokens(app: TokenDeps, requestId: string): number {
  return app.db.run('UPDATE customer_action_tokens SET revoked_at = ? WHERE quote_request_id = ? AND revoked_at IS NULL', [iso(app.clock.now()), requestId]).changes
}

/** Housekeeping: spent and expired tokens a while after they stopped mattering. */
export function purgeTokens(app: AppContext): number {
  return app.db.run('DELETE FROM customer_action_tokens WHERE expires_at < ?', [iso(addMs(app.clock.now(), -30 * DAY))]).changes
}
