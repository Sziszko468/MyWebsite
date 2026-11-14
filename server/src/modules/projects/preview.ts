import type { AppContext, SessionInfo } from '../../context.ts'
import { HttpError, notFound, validationFailed } from '../../http/errors.ts'
import { newId, randomToken, sha256Hex } from '../../lib/crypto.ts'
import { cleanLine } from '../../lib/text.ts'
import { addMs, DAY, iso } from '../../lib/time.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { completeness, publicProject } from './content.ts'
import { picturesOf, projectRow, parseProject } from './service.ts'

/**
 * Preview links (PROMPT 22): a way to show ONE project, in any state, to somebody who has no account (a client approving a draft).
 * The link is a bearer secret of 256 random bits; the database keeps only its SHA-256, so a copy of the database opens nothing. A link
 * names one project, ends after at most 30 days, can be revoked at any moment, is never listed or put in a sitemap, and what it opens is
 * answered `no-store`, `noindex` and without a referrer. An unknown, malformed or wrong secret is "not found", always in the same words;
 * a real one that has ended says so (410). Failed guesses are counted per address like every other secret in this system.
 */

export const MAX_LINK_DAYS = 30
export const DEFAULT_LINK_DAYS = 7
const MAX_ACTIVE_PER_PROJECT = 10
const SHAPE = /^[A-Za-z0-9_-]{43}$/

interface TokenRow {
  id: string
  project_id: number
  token_hash: string
  label: string | null
  created_by: string | null
  created_at: string
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
}

export type LinkState = 'active' | 'expired' | 'revoked'

const stateOf = (row: TokenRow, now: string): LinkState => (row.revoked_at ? 'revoked' : row.expires_at <= now ? 'expired' : 'active')

const linkOut = (row: TokenRow, now: string) => ({ id: row.id, label: row.label, createdAt: row.created_at, expiresAt: row.expires_at, revokedAt: row.revoked_at, lastUsedAt: row.last_used_at, state: stateOf(row, now) })

/** Makes a link for a project. The secret is in the answer once; afterwards only its hash exists. */
export function createPreviewLink(app: AppContext, session: SessionInfo | null, projectId: number, input: { days?: unknown; label?: unknown }) {
  const who = requirePermission(session, 'content:write')
  const project = projectRow(app, projectId)
  const days = input.days === undefined || input.days === null ? DEFAULT_LINK_DAYS : input.days
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > MAX_LINK_DAYS) throw validationFailed({ days: 'invalid' })
  const label = typeof input.label === 'string' ? cleanLine(input.label).slice(0, 80) : ''
  const now = iso(app.clock.now())
  const active = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_preview_tokens WHERE project_id = ? AND revoked_at IS NULL AND expires_at > ?', [project.id, now])?.n ?? 0
  if (active >= MAX_ACTIVE_PER_PROJECT) throw new HttpError(409, 'conflict', 'This project already has the most preview links it may have. Revoke one first.', { details: { reason: 'too_many' } })
  const token = randomToken(32)
  const id = newId()
  const expiresAt = iso(addMs(app.clock.now(), days * DAY))
  app.db.run('INSERT INTO project_preview_tokens (id, project_id, token_hash, label, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, project.id, sha256Hex(token), label || null, who.userId, now, expiresAt])
  audit(app, who, 'project.preview_link.create', 'project', project.id, { slug: project.slug, days })
  return { id, token, expiresAt, label: label || null }
}

export function listPreviewLinks(app: AppContext, session: SessionInfo | null, projectId: number) {
  requirePermission(session, 'content:write')
  const project = projectRow(app, projectId)
  const now = iso(app.clock.now())
  return app.db.all<TokenRow>('SELECT * FROM project_preview_tokens WHERE project_id = ? ORDER BY created_at DESC, id', [project.id]).map((row) => linkOut(row, now))
}

/** Ends a link. Doing it twice, or to a link that already ended, changes nothing. */
export function revokePreviewLink(app: AppContext, session: SessionInfo | null, projectId: number, linkId: string) {
  const who = requirePermission(session, 'content:write')
  const project = projectRow(app, projectId)
  const row = app.db.get<TokenRow>('SELECT * FROM project_preview_tokens WHERE id = ? AND project_id = ?', [linkId, project.id])
  if (!row) throw notFound('The preview link')
  const now = iso(app.clock.now())
  if (!row.revoked_at) {
    app.db.run('UPDATE project_preview_tokens SET revoked_at = ? WHERE id = ?', [now, row.id])
    audit(app, who, 'project.preview_link.revoke', 'project', project.id, { slug: project.slug })
  }
  return linkOut({ ...row, revoked_at: row.revoked_at ?? now }, now)
}

/** What a preview link opens: the project as a visitor would see it, whatever state it is in, and nothing else. */
export function previewByToken(app: AppContext, token: string, ip: string) {
  const miss = (): never => {
    app.limiters.check('tokenMiss', ip)
    throw notFound('The preview link')
  }
  if (!SHAPE.test(token)) return miss()
  const row = app.db.get<TokenRow>('SELECT * FROM project_preview_tokens WHERE token_hash = ?', [sha256Hex(token)])
  if (!row) return miss()
  const now = iso(app.clock.now())
  const state = stateOf(row, now)
  if (state !== 'active') throw new HttpError(410, 'gone', state === 'revoked' ? 'This preview link was withdrawn.' : 'This preview link has expired.', { details: { reason: state } })
  const project = parseProject(app, row.project_id)
  if (!project) return miss()
  app.db.run('UPDATE project_preview_tokens SET last_used_at = ? WHERE id = ?', [now, row.id])
  const pictures = picturesOf(app, project.content)
  return { project: publicProject(project.row, project.content, pictures, true), neighbours: null, preview: true, status: project.row.status, languages: completeness(project.content) }
}
