import type { AppContext, RequestCtx, SessionInfo } from '../../context.ts'
import { hmacHex, randomToken, safeEqual, sha256Hex, verifyPassword, DUMMY_HASH } from '../../lib/crypto.ts'
import { addMs, HOUR, iso, MINUTE } from '../../lib/time.ts'
import { unauthorized } from '../../http/errors.ts'
import type { Role } from './permissions.ts'
import { audit } from '../system/audit.ts'
import { findUserByEmail, type UserRow } from './users.ts'

/**
 * Signing in and staying signed in. The cookie holds a random 256-bit token; only its SHA-256 is stored, so the
 * database alone cannot be used to sign in. A session ends at an absolute time and after a period without use;
 * signing in always issues a new token (never one a visitor chose), signing out and changing the password delete
 * sessions on the server. Five wrong passwords lock the account for fifteen minutes, and a failure never says
 * whether the address exists.
 */

export const MAX_FAILED_LOGINS = 5
export const LOCK_MS = 15 * MINUTE
const TOUCH_EVERY_MS = MINUTE

export const sessionCookieName = (app: AppContext): string => (app.config.secureCookies ? '__Host-cc_admin' : 'cc_admin')

export function sessionCookie(app: AppContext, token: string, maxAgeSeconds: number): string {
  return `${sessionCookieName(app)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${app.config.secureCookies ? '; Secure' : ''}`
}

export const clearedCookie = (app: AppContext): string => sessionCookie(app, '', 0)

interface SessionRow {
  token_hash: string
  user_id: string
  csrf_token: string
  created_at: string
  last_seen_at: string
  expires_at: string
  email: string
  role: Role
  status: 'active' | 'disabled'
}

export interface Authenticated {
  token: string
  maxAgeSeconds: number
  csrfToken: string
  user: UserRow
}

const INVALID = () => unauthorized('The e-mail address or password is not correct, or the account is temporarily locked.')

export async function authenticate(app: AppContext, email: string, password: string, ipHash: string, userAgent: string): Promise<Authenticated> {
  const { db, clock } = app
  const now = clock.now()
  const user = typeof email === 'string' && email.length <= 254 ? findUserByEmail(db, email) : undefined
  const locked = user?.locked_until && new Date(user.locked_until) > now
  // Always do the work of checking a password, so a wrong address costs the same time as a wrong password.
  const ok = await verifyPassword(typeof password === 'string' ? password.slice(0, 200) : '', user && !locked ? user.password_hash : DUMMY_HASH)
  if (!user || user.status !== 'active' || locked) throw INVALID()

  if (!ok) {
    const failures = user.failed_logins + 1
    if (failures >= MAX_FAILED_LOGINS) {
      db.run('UPDATE admin_users SET failed_logins = 0, locked_until = ?, updated_at = ? WHERE id = ?', [iso(new Date(now.getTime() + LOCK_MS)), iso(now), user.id])
      app.log.warn('administrator account locked after repeated failures')
      audit(app, { userId: user.id }, 'admin.locked', 'admin_user', user.id)
    } else {
      db.run('UPDATE admin_users SET failed_logins = ?, updated_at = ? WHERE id = ?', [failures, iso(now), user.id])
    }
    throw INVALID()
  }

  db.run('UPDATE admin_users SET failed_logins = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?', [iso(now), iso(now), user.id])
  const token = randomToken(32)
  const csrfToken = randomToken(24)
  const lifetimeMs = app.config.adminSessionHours * HOUR
  db.run('INSERT INTO admin_sessions (token_hash, user_id, csrf_token, created_at, last_seen_at, expires_at, ip_hash, user_agent, public_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    sha256Hex(token), user.id, csrfToken, iso(now), iso(now), iso(addMs(now, lifetimeMs)), ipHash, userAgent.slice(0, 200), randomToken(8),
  ])
  audit(app, { userId: user.id }, 'admin.login', 'admin_user', user.id)
  return { token, maxAgeSeconds: Math.floor(lifetimeMs / 1000), csrfToken, user }
}

/** The session a cookie stands for, or `null` when it is unknown, expired, idle for too long or its user is disabled. */
export function resolveSession(app: AppContext, token: string | undefined): SessionInfo | null {
  if (!token || token.length < 20 || token.length > 200) return null
  const { db, clock } = app
  const hash = sha256Hex(token)
  const row = db.get<SessionRow>(
    `SELECT s.token_hash, s.user_id, s.csrf_token, s.created_at, s.last_seen_at, s.expires_at, u.email, u.role, u.status
     FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id WHERE s.token_hash = ?`,
    [hash],
  )
  if (!row) return null
  const now = clock.now()
  const idleLimit = addMs(now, -app.config.adminIdleMinutes * MINUTE)
  if (row.status !== 'active' || new Date(row.expires_at) <= now || new Date(row.last_seen_at) <= idleLimit) {
    db.run('DELETE FROM admin_sessions WHERE token_hash = ?', [hash])
    return null
  }
  if (now.getTime() - new Date(row.last_seen_at).getTime() > TOUCH_EVERY_MS) db.run('UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?', [iso(now), hash])
  return { userId: row.user_id, email: row.email, role: row.role, csrfToken: row.csrf_token, tokenHash: hash }
}

export const destroySession = (app: AppContext, tokenHash: string): void => void app.db.run('DELETE FROM admin_sessions WHERE token_hash = ?', [tokenHash])

export function destroyUserSessions(app: AppContext, userId: string, exceptTokenHash?: string): number {
  return exceptTokenHash
    ? app.db.run('DELETE FROM admin_sessions WHERE user_id = ? AND token_hash <> ?', [userId, exceptTokenHash]).changes
    : app.db.run('DELETE FROM admin_sessions WHERE user_id = ?', [userId]).changes
}

/** Sessions past their deadline, and those left unused longer than the idle limit (they could not be used any more; this only forgets them). */
export const purgeExpiredSessions = (app: AppContext): number =>
  app.db.run('DELETE FROM admin_sessions WHERE expires_at <= ? OR last_seen_at <= ?', [iso(app.clock.now()), iso(addMs(app.clock.now(), -app.config.adminIdleMinutes * MINUTE))]).changes

// ---- CSRF ----------------------------------------------------------------------------------------------------------

/** A token for the sign-in form, which has no session yet: an HMAC of the current hour, accepted for this hour and the last. */
export function loginCsrfToken(app: AppContext, hourOffset = 0): string {
  return hmacHex(app.config.appSecret, `login|${Math.floor(app.clock.now().getTime() / HOUR) - hourOffset}`)
}

export const verifyLoginCsrf = (app: AppContext, token: string | null): boolean => token !== null && (safeEqual(token, loginCsrfToken(app)) || safeEqual(token, loginCsrfToken(app, 1)))

export const verifySessionCsrf = (session: SessionInfo, token: string | null): boolean => token !== null && safeEqual(token, session.csrfToken)

/** Whether an `Origin` header names the host the request was sent to (a page of this same server). */
export function originIsThisHost(ctx: RequestCtx, origin: string): boolean {
  try {
    return new URL(origin).host === ctx.req.headers.host
  } catch {
    return false
  }
}

/**
 * The admin's state-changing requests must come from the admin's own pages: a `Sec-Fetch-Site` or an `Origin` from
 * elsewhere is refused. `Origin: null` is *not* a sign of another site: a browser sends it with a form post from a
 * page served with `Referrer-Policy: no-referrer` (which the admin is), so on its own it decides nothing; the
 * browser's `Sec-Fetch-Site` and the CSRF token, which every such request must carry, do.
 */
export function sameOrigin(ctx: RequestCtx): boolean {
  const site = ctx.req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false
  if (ctx.origin && ctx.origin !== 'null') return originIsThisHost(ctx, ctx.origin)
  return true
}
