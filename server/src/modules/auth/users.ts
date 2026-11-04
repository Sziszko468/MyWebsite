import type { Database } from '../../db/database.ts'
import { ConstraintError, validationFailed } from '../../http/errors.ts'
import { hashPassword, newId } from '../../lib/crypto.ts'
import { iso, type Clock } from '../../lib/time.ts'
import { cleanLine, length } from '../../lib/text.ts'
import { isEmail } from '../../lib/validate.ts'
import type { Role } from './permissions.ts'

export interface UserRow {
  id: string
  email: string
  password_hash: string
  role: Role
  status: 'active' | 'disabled'
  failed_logins: number
  locked_until: string | null
  last_login_at: string | null
  /** The language of the administration (`hu`/`en`) and its theme; `null`: not chosen yet. */
  ui_language: 'hu' | 'en' | null
  ui_theme: 'light' | 'dark' | null
  created_at: string
  updated_at: string
}

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 200

const COMMON = new Set(['passwordpassword', 'password1234', '123456789012', 'qwertyuiop12', 'administrator', 'letmein12345', 'changeme1234', 'welcome12345'])

/** The password rules: long, not a well-known one, not the account's own name. Length matters more than symbols. */
export function passwordProblem(password: string, email: string): string | null {
  if (length(password) < PASSWORD_MIN) return `The password must be at least ${PASSWORD_MIN} characters.`
  if (length(password) > PASSWORD_MAX) return `The password must be at most ${PASSWORD_MAX} characters.`
  const lower = password.toLowerCase()
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return 'That password is too common.'
  const local = email.split('@')[0].toLowerCase()
  if (local.length >= 4 && lower.includes(local)) return 'The password must not contain the e-mail address.'
  return null
}

export const normalizeEmail = (email: string): string => cleanLine(email).toLowerCase()

export async function createUser(db: Database, clock: Clock, input: { email: string; password: string; role: Role }): Promise<UserRow> {
  const email = normalizeEmail(input.email)
  if (!isEmail(email)) throw validationFailed({ email: 'invalidEmail' })
  const problem = passwordProblem(input.password, email)
  if (problem) throw new Error(problem)
  const now = iso(clock.now())
  const row: UserRow = { id: newId(), email, password_hash: await hashPassword(input.password), role: input.role, status: 'active', failed_logins: 0, locked_until: null, last_login_at: null, ui_language: null, ui_theme: null, created_at: now, updated_at: now }
  try {
    db.run('INSERT INTO admin_users (id, email, password_hash, role, status, failed_logins, locked_until, last_login_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      row.id, row.email, row.password_hash, row.role, row.status, row.failed_logins, row.locked_until, row.last_login_at, row.created_at, row.updated_at,
    ])
  } catch (error) {
    if (error instanceof ConstraintError && error.kind === 'unique') throw new Error(`An administrator with the address ${email} already exists.`)
    throw error
  }
  return row
}

export const findUserByEmail = (db: Database, email: string): UserRow | undefined => db.get<UserRow>('SELECT * FROM admin_users WHERE email = ?', [normalizeEmail(email)])
export const getUser = (db: Database, id: string): UserRow | undefined => db.get<UserRow>('SELECT * FROM admin_users WHERE id = ?', [id])
export const listUsers = (db: Database): UserRow[] => db.all<UserRow>('SELECT * FROM admin_users ORDER BY email')

export async function setPassword(db: Database, clock: Clock, userId: string, password: string): Promise<void> {
  const user = getUser(db, userId)
  if (!user) throw new Error('No such administrator.')
  const problem = passwordProblem(password, user.email)
  if (problem) throw new Error(problem)
  db.run('UPDATE admin_users SET password_hash = ?, failed_logins = 0, locked_until = NULL, updated_at = ? WHERE id = ?', [await hashPassword(password), iso(clock.now()), userId])
}

export const setUserStatus = (db: Database, clock: Clock, userId: string, status: 'active' | 'disabled'): boolean =>
  db.run('UPDATE admin_users SET status = ?, updated_at = ? WHERE id = ?', [status, iso(clock.now()), userId]).changes > 0
