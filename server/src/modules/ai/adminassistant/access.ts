import type { AppContext, SessionInfo } from '../../../context.ts'
import { addMs, MINUTE } from '../../../lib/time.ts'
import { can, type Permission, type Role } from '../../auth/permissions.ts'

/**
 * Who is asking, and what that person may read, decided AGAIN at the moment of every tool call (PROMPT 31).
 *
 * The assistant never has an administrator of its own and never receives a blanket override. What it has is the administrator's `Authority`: the user id and the
 * hash of the session cookie that started the request, both taken from the server's own session (never from the browser's body and never from the model). Each time a
 * tool runs it calls `accessFor(...).need(permission)`, which re-reads the session and the user from the database:
 *
 *   - the session must still exist, not be past its deadline and not have idled out (a sign-out, a password change, a disabled account all end it at once);
 *   - the user must still be active, and the ROLE is the one stored now, not the one at the start of the answer (a role changed mid-answer applies to the next tool call);
 *   - the permission is then checked with the same `can()` the rest of the administration uses (or, in tests, a stricter policy handed in).
 *
 * A refusal says only that the data is not available to this administrator: no title, no count, no hint that a record exists.
 */

export interface Authority {
  userId: string
  /** The hash of the session cookie's token: the key of the session row. The token itself never reaches this module. */
  tokenHash: string
}

export type Policy = (role: Role, permission: Permission) => boolean

/** Why a tool was refused (the model is told only `not_available`; the code is for the log and the tests). */
export class AccessDenied extends Error {
  readonly reason: 'session_ended' | 'forbidden'
  constructor(reason: AccessDenied['reason']) {
    super(reason)
    this.name = 'AccessDenied'
    this.reason = reason
  }
}

interface Row {
  user_id: string
  csrf_token: string
  expires_at: string
  last_seen_at: string
  email: string
  role: Role
  status: 'active' | 'disabled'
}

/** Reads the session and its user WITHOUT touching anything (a tool that reads must not extend a session or delete one). `null`: it is over. */
export function peekSession(app: AppContext, authority: Authority): SessionInfo | null {
  const row = app.db.get<Row>(
    `SELECT s.user_id, s.csrf_token, s.expires_at, s.last_seen_at, u.email, u.role, u.status
       FROM admin_sessions s JOIN admin_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.user_id = ?`,
    [authority.tokenHash, authority.userId],
  )
  if (!row || row.status !== 'active') return null
  const now = app.clock.now()
  if (new Date(row.expires_at) <= now || new Date(row.last_seen_at) <= addMs(now, -app.config.adminIdleMinutes * MINUTE)) return null
  return { userId: row.user_id, email: row.email, role: row.role, csrfToken: row.csrf_token, tokenHash: authority.tokenHash }
}

export interface Access {
  /** The session as it is NOW, or an `AccessDenied('session_ended')`. */
  session(): SessionInfo
  /** The session, provided the current role has the permission; otherwise an `AccessDenied('forbidden')`. */
  need(permission: Permission): SessionInfo
  /** Whether the current role has the permission (false when the session is over). Never throws: for deciding which parts of an overview to build. */
  has(permission: Permission): boolean
}

export function accessFor(app: AppContext, authority: Authority, policy: Policy = can): Access {
  const session = (): SessionInfo => {
    const current = peekSession(app, authority)
    if (!current) throw new AccessDenied('session_ended')
    return current
  }
  return {
    session,
    need(permission) {
      const current = session()
      if (!policy(current.role, permission)) throw new AccessDenied('forbidden')
      return current
    },
    has(permission) {
      const current = peekSession(app, authority)
      return current !== null && policy(current.role, permission)
    },
  }
}
