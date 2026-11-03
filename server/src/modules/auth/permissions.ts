import type { SessionInfo } from '../../context.ts'
import { forbidden, unauthorized } from '../../http/errors.ts'

/**
 * Who may do what. Two roles, a short list of permissions: an `editor` works with requests and the catalogue
 * and content; an `admin` can also delete things for good and see the system page. The check happens in the
 * business functions (modules/*\/admin.ts), not in the HTML, so no route can forget it.
 */
export type Role = 'admin' | 'editor'
export type Permission = 'requests:read' | 'requests:write' | 'requests:delete' | 'catalog:write' | 'catalog:delete' | 'content:write' | 'content:delete' | 'system:read' | 'system:write'

const GRANTS: Record<Role, readonly Permission[]> = {
  admin: ['requests:read', 'requests:write', 'requests:delete', 'catalog:write', 'catalog:delete', 'content:write', 'content:delete', 'system:read', 'system:write'],
  editor: ['requests:read', 'requests:write', 'catalog:write', 'content:write'],
}

export const can = (role: Role, permission: Permission): boolean => GRANTS[role].includes(permission)

/** Throws 401 with no session and 403 with the wrong role; returns the session so a caller can use it. */
export function requirePermission(session: SessionInfo | null, permission: Permission): SessionInfo {
  if (!session) throw unauthorized()
  if (!can(session.role, permission)) throw forbidden()
  return session
}
