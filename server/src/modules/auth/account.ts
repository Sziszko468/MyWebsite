import type { AppContext, SessionInfo } from '../../context.ts'
import { notFound, validationFailed } from '../../http/errors.ts'
import { verifyPassword } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import { audit } from '../system/audit.ts'
import { requirePermission } from './permissions.ts'
import { destroyUserSessions, destroySession } from './sessions.ts'
import { getUser, setPassword } from './users.ts'

/**
 * An administrator's own account: the profile, the interface preferences, the password and the sign-ins that are open.
 * Everything here acts on the signed-in administrator only; there is no way to name another account.
 */

export const UI_LANGUAGES = ['hu', 'en'] as const
export const UI_THEMES = ['light', 'dark'] as const

export interface Preferences {
  language: 'hu' | 'en' | null
  theme: 'light' | 'dark' | null
}

export function profile(app: AppContext, session: SessionInfo | null) {
  const who = requirePermission(session, 'requests:read')
  const user = getUser(app.db, who.userId)
  if (!user) throw notFound('The account')
  return {
    email: user.email,
    role: user.role,
    createdAt: user.created_at,
    lastLoginAt: user.last_login_at,
    preferences: { language: user.ui_language, theme: user.ui_theme } satisfies Preferences,
  }
}

/** Each value is a choice from a fixed list or `null` (no preference: the browser's language and theme decide). Fields not sent are left alone. */
export function savePreferences(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): Preferences {
  const who = requirePermission(session, 'requests:read')
  const user = getUser(app.db, who.userId)
  if (!user) throw notFound('The account')
  const known = ['language', 'theme']
  if (!Object.keys(body).every((key) => known.includes(key)) || Object.keys(body).length === 0) throw validationFailed({ body: 'invalid' })
  let language = user.ui_language
  let theme = user.ui_theme
  if ('language' in body) {
    if (body.language !== null && !(UI_LANGUAGES as readonly unknown[]).includes(body.language)) throw validationFailed({ language: 'invalid' })
    language = body.language as Preferences['language']
  }
  if ('theme' in body) {
    if (body.theme !== null && !(UI_THEMES as readonly unknown[]).includes(body.theme)) throw validationFailed({ theme: 'invalid' })
    theme = body.theme as Preferences['theme']
  }
  app.db.run('UPDATE admin_users SET ui_language = ?, ui_theme = ?, updated_at = ? WHERE id = ?', [language, theme, iso(app.clock.now()), who.userId])
  audit(app, who, 'settings.preferences', 'admin_user', who.userId, { language, theme })
  return { language, theme }
}

/** The current password is checked first (a stolen session alone must not be enough to take the account), then every other sign-in ends. */
export async function changePassword(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): Promise<{ otherSessionsClosed: number }> {
  const who = requirePermission(session, 'requests:read')
  const user = getUser(app.db, who.userId)
  if (!user) throw notFound('The account')
  const current = typeof body.current === 'string' ? body.current : ''
  const next = typeof body.next === 'string' ? body.next : ''
  if (!current) throw validationFailed({ current: 'required' })
  if (!next) throw validationFailed({ next: 'required' })
  if (!(await verifyPassword(current.slice(0, 200), user.password_hash))) throw validationFailed({ current: 'invalid' }, 'The current password is not correct.')
  try {
    await setPassword(app.db, app.clock, who.userId, next)
  } catch (error) {
    throw validationFailed({ next: 'invalid' }, error instanceof Error ? error.message : 'That password is not accepted.')
  }
  const closed = destroyUserSessions(app, who.userId, who.tokenHash)
  audit(app, who, 'account.password', 'admin_user', who.userId, { sessionsClosed: closed })
  return { otherSessionsClosed: closed }
}

/** "Chrome on Windows": a short label from the browser's own description. Nothing of the raw text is kept in what is shown. */
export function browserOf(userAgent: string | null): string {
  const ua = userAgent ?? ''
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null
  const system = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null
  if (browser && system) return `${browser} · ${system}`
  return browser ?? system ?? ''
}

export interface SessionView {
  id: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  browser: string
  current: boolean
}

export function listSessions(app: AppContext, session: SessionInfo | null): SessionView[] {
  const who = requirePermission(session, 'requests:read')
  const now = iso(app.clock.now())
  return app.db
    .all<{ token_hash: string; public_id: string; created_at: string; last_seen_at: string; expires_at: string; user_agent: string | null }>(
      'SELECT token_hash, public_id, created_at, last_seen_at, expires_at, user_agent FROM admin_sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC',
      [who.userId, now],
    )
    .map((row) => ({ id: row.public_id, createdAt: row.created_at, lastSeenAt: row.last_seen_at, expiresAt: row.expires_at, browser: browserOf(row.user_agent), current: row.token_hash === who.tokenHash }))
}

/** Ends one of the administrator's own sign-ins (another browser, or this one). */
export function revokeSession(app: AppContext, session: SessionInfo | null, publicId: string): { current: boolean } {
  const who = requirePermission(session, 'requests:read')
  const row = app.db.get<{ token_hash: string }>('SELECT token_hash FROM admin_sessions WHERE public_id = ? AND user_id = ?', [publicId, who.userId])
  if (!row) throw notFound('The sign-in')
  const current = row.token_hash === who.tokenHash
  destroySession(app, row.token_hash)
  audit(app, who, 'account.session_revoked', 'admin_user', who.userId, { current })
  return { current }
}

export function revokeOtherSessions(app: AppContext, session: SessionInfo | null): number {
  const who = requirePermission(session, 'requests:read')
  const closed = destroyUserSessions(app, who.userId, who.tokenHash)
  if (closed > 0) audit(app, who, 'account.sessions_revoked', 'admin_user', who.userId, { sessionsClosed: closed })
  return closed
}

