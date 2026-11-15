import type { AppContext, RequestCtx } from '../../context.ts'
import { randomToken, safeEqual, sha256Hex } from '../../lib/crypto.ts'
import { addMs, iso, MINUTE } from '../../lib/time.ts'
import { browserOf } from '../auth/account.ts'
import { getCustomer } from './accounts.ts'

/**
 * A customer's sign-in. It is built from the same parts as the administrator's (a random 256-bit token in an HttpOnly cookie, only its SHA-256 in the
 * database, an absolute deadline and an idle limit, a CSRF token for every state-changing request, a new token at every sign-in) but it is a different
 * thing in a different table with a different cookie: a customer's cookie is never looked at by an administration route and the other way round, so no
 * bug in one can make a customer an administrator. The identity of a request is whatever this file resolves from the cookie, and nothing the browser
 * says about itself (no id in a body, an address or a header) is ever believed.
 */

const TOUCH_EVERY_MS = MINUTE

export const clientCookieName = (app: AppContext): string => (app.config.secureCookies ? '__Host-cc_client' : 'cc_client')

export function clientCookie(app: AppContext, token: string, maxAgeSeconds: number): string {
  return `${clientCookieName(app)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${app.config.secureCookies ? '; Secure' : ''}`
}

export const clearedClientCookie = (app: AppContext): string => clientCookie(app, '', 0)

/** Who a request is, once the cookie has been resolved. */
export interface ClientSession {
  customerId: string
  csrfToken: string
  /** Hash of the cookie's token: the session's key in the database. Never sent to anyone. */
  tokenHash: string
  publicId: string
}

interface SessionRow {
  token_hash: string
  public_id: string
  customer_id: string
  csrf_token: string
  last_seen_at: string
  expires_at: string
}

/** Signs a customer in: always a new token (never one the visitor chose). Returns what the cookie and the page need. */
export function startClientSession(app: AppContext, customerId: string, ipHash: string, userAgent: string): { token: string; csrfToken: string; maxAgeSeconds: number } {
  const now = app.clock.now()
  const token = randomToken(32)
  const csrfToken = randomToken(24)
  const lifetimeMs = app.config.client.sessionHours * 3_600_000
  app.db.run('INSERT INTO customer_sessions (token_hash, public_id, customer_id, csrf_token, created_at, last_seen_at, expires_at, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    sha256Hex(token), randomToken(8), customerId, csrfToken, iso(now), iso(now), iso(addMs(now, lifetimeMs)), ipHash, userAgent.slice(0, 200),
  ])
  app.db.run('UPDATE customers SET last_sign_in_at = ?, updated_at = ? WHERE id = ?', [iso(now), iso(now), customerId])
  return { token, csrfToken, maxAgeSeconds: Math.floor(lifetimeMs / 1000) }
}

/**
 * The session a cookie stands for, or `null` when it is unknown, past its deadline, idle for too long, or its account is not active any more (switched
 * off, or never verified). An ended session is deleted on the spot, so a revoked one cannot come back.
 */
export function resolveClientSession(app: AppContext, token: string | undefined): ClientSession | null {
  if (!token || token.length < 20 || token.length > 200) return null
  const { db, clock } = app
  const hash = sha256Hex(token)
  const row = db.get<SessionRow>('SELECT token_hash, public_id, customer_id, csrf_token, last_seen_at, expires_at FROM customer_sessions WHERE token_hash = ?', [hash])
  if (!row) return null
  const now = clock.now()
  const idleLimit = addMs(now, -app.config.client.idleMinutes * MINUTE)
  const customer = getCustomer(app, row.customer_id)
  if (!customer || customer.status !== 'active' || new Date(row.expires_at) <= now || new Date(row.last_seen_at) <= idleLimit) {
    db.run('DELETE FROM customer_sessions WHERE token_hash = ?', [hash])
    return null
  }
  if (now.getTime() - new Date(row.last_seen_at).getTime() > TOUCH_EVERY_MS) db.run('UPDATE customer_sessions SET last_seen_at = ? WHERE token_hash = ?', [iso(now), hash])
  return { customerId: row.customer_id, csrfToken: row.csrf_token, tokenHash: hash, publicId: row.public_id }
}

export const verifyClientCsrf = (session: ClientSession, token: string | null): boolean => token !== null && token !== '' && safeEqual(token, session.csrfToken)

export const endClientSession = (app: AppContext, tokenHash: string): void => void app.db.run('DELETE FROM customer_sessions WHERE token_hash = ?', [tokenHash])

/** Ends every session of an account, or every one but the current. Returns how many ended. */
export function revokeClientSessions(app: AppContext, customerId: string, exceptTokenHash?: string): number {
  return exceptTokenHash
    ? app.db.run('DELETE FROM customer_sessions WHERE customer_id = ? AND token_hash <> ?', [customerId, exceptTokenHash]).changes
    : app.db.run('DELETE FROM customer_sessions WHERE customer_id = ?', [customerId]).changes
}

/** Sessions past their deadline or idle for too long: they could not be used any more; this only forgets them. */
export const purgeClientSessions = (app: AppContext): number =>
  app.db.run('DELETE FROM customer_sessions WHERE expires_at <= ? OR last_seen_at <= ?', [iso(app.clock.now()), iso(addMs(app.clock.now(), -app.config.client.idleMinutes * MINUTE))]).changes

export interface ClientSessionView {
  id: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  browser: string
  current: boolean
}

/** The account's open sessions as the customer (or the owner) may see them: a label for the browser and times. Never the token, its hash or an address. */
export function clientSessionsOf(app: AppContext, customerId: string, currentHash: string | null): ClientSessionView[] {
  const now = iso(app.clock.now())
  return app.db
    .all<{ token_hash: string; public_id: string; created_at: string; last_seen_at: string; expires_at: string; user_agent: string | null }>(
      'SELECT token_hash, public_id, created_at, last_seen_at, expires_at, user_agent FROM customer_sessions WHERE customer_id = ? AND expires_at > ? ORDER BY created_at DESC',
      [customerId, now],
    )
    .map((row) => ({ id: row.public_id, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, browser: browserOf(row.user_agent), current: currentHash !== null && row.token_hash === currentHash }))
}

/** What a portal route's handler calls first: the signed-in customer, or the 401 (the route table already did this; a handler asks again so it cannot be called without). */
export function clientOf(ctx: RequestCtx): ClientSession {
  if (!ctx.customer) throw new Error('A portal handler ran without a customer session.')
  return ctx.customer
}
