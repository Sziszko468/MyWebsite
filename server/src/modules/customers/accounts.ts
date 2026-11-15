import type { Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { ConstraintError } from '../../http/errors.ts'
import { newId } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import { normalizeEmail } from '../auth/users.ts'
import { getSetting, setSetting } from '../system/settings.ts'
import { DEFAULT_PORTAL_SETTINGS, PORTAL_SETTINGS_KEY, type AuditType, type CustomerOrigin, type CustomerRow, type CustomerStatus, type PortalSettings } from './model.ts'

/**
 * The account table and the account's history. Nothing here knows about requests, sessions or e-mail: it is the one place that reads and writes a
 * `customers` row and the one place that writes a line of `customer_audit_events`, so the history cannot be forgotten by a caller.
 */

export const getCustomer = (app: Pick<AppContext, 'db'>, id: string): CustomerRow | undefined => app.db.get<CustomerRow>('SELECT * FROM customers WHERE id = ?', [id])

export const findCustomerByEmail = (app: Pick<AppContext, 'db'>, email: string): CustomerRow | undefined => app.db.get<CustomerRow>('SELECT * FROM customers WHERE email = ? COLLATE NOCASE', [normalizeEmail(email)])

export interface NewCustomer {
  email: string
  name?: string | null
  company?: string | null
  language: Language
  status: CustomerStatus
  origin: CustomerOrigin
  verified: boolean
  invitedBy?: string | null
}

/** Makes an account. A second account for the same address is refused by the database (`ConstraintError` of kind `unique`). */
export function insertCustomer(app: Pick<AppContext, 'db' | 'clock'>, input: NewCustomer): CustomerRow {
  const now = iso(app.clock.now())
  const row: CustomerRow = {
    id: newId(),
    email: normalizeEmail(input.email),
    name: input.name ?? null,
    company: input.company ?? null,
    language: input.language,
    status: input.status,
    origin: input.origin,
    email_verified_at: input.verified ? now : null,
    last_sign_in_at: null,
    deletion_requested_at: null,
    disabled_at: null,
    invited_by: input.invitedBy ?? null,
    created_at: now,
    updated_at: now,
  }
  app.db.run(
    'INSERT INTO customers (id, email, name, company, language, status, origin, email_verified_at, last_sign_in_at, deletion_requested_at, disabled_at, invited_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)',
    [row.id, row.email, row.name, row.company, row.language, row.status, row.origin, row.email_verified_at, row.invited_by, row.created_at, row.updated_at],
  )
  return row
}

export const isDuplicate = (error: unknown): boolean => error instanceof ConstraintError && error.kind === 'unique'

// ---- the owner's two switches ----------------------------------------------------------------------------------------------------------

export function portalSettings(app: Pick<AppContext, 'db'>): PortalSettings {
  const stored = getSetting(app.db, PORTAL_SETTINGS_KEY)
  if (!stored) return { ...DEFAULT_PORTAL_SETTINGS }
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>
    return { registration: parsed.registration === true, selfLinking: parsed.selfLinking === true }
  } catch {
    return { ...DEFAULT_PORTAL_SETTINGS }
  }
}

export function savePortalSettings(app: Pick<AppContext, 'db' | 'clock'>, next: PortalSettings, userId: string): PortalSettings {
  setSetting(app.db, app.clock, PORTAL_SETTINGS_KEY, JSON.stringify(next), userId)
  return next
}

// ---- the account's history ---------------------------------------------------------------------------------------------------------------

export type AuditActor = { type: 'customer'; id: string } | { type: 'admin'; id: string } | { type: 'system' }

/**
 * Writes one line of an account's history and returns its number. `detail` is a short fixed code ("by_admin", "other_sessions"): never an address (not even a network
 * address), a name, a token or anything a person wrote. The line is written by the code that did the thing, in the same transaction.
 */
export function recordAudit(app: Pick<AppContext, 'db' | 'clock'>, input: { customerId: string; type: AuditType; actor: AuditActor; detail?: string | null }): number {
  return app.db.run('INSERT INTO customer_audit_events (customer_id, event_type, actor_type, actor_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
    input.customerId,
    input.type,
    input.actor.type,
    input.actor.type === 'system' ? null : input.actor.id,
    input.detail ?? null,
    iso(app.clock.now()),
  ]).lastInsertRowid
}

export interface AuditView {
  id: number
  type: AuditType
  actor: 'customer' | 'admin' | 'system'
  /** The administrator's address when an administrator did it (never a customer's). */
  adminEmail: string | null
  detail: string | null
  at: string
}

export const auditOf = (app: Pick<AppContext, 'db'>, customerId: string, limit = 100): AuditView[] =>
  app.db
    .all<{ id: number; event_type: AuditType; actor_type: AuditView['actor']; email: string | null; detail: string | null; created_at: string }>(
      `SELECT e.id, e.event_type, e.actor_type, u.email, e.detail, e.created_at
       FROM customer_audit_events e LEFT JOIN admin_users u ON e.actor_type = 'admin' AND u.id = e.actor_id
       WHERE e.customer_id = ? ORDER BY e.id DESC LIMIT ?`,
      [customerId, limit],
    )
    .map((row) => ({ id: row.id, type: row.event_type, actor: row.actor_type, adminEmail: row.email, detail: row.detail, at: row.created_at }))
