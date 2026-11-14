import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppContext, SessionInfo } from '../../context.ts'
import { conflict, validationFailed } from '../../http/errors.ts'
import { isRecord } from '../../lib/text.ts'
import { iso } from '../../lib/time.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { getSetting, setSetting } from '../system/settings.ts'
import { emptyProfile, normalizeProfile, requireValidProfile, type ProfileDocument } from './content.ts'

/**
 * The profile document's storage and operations. One row in `settings` (`site.profile`) holds the document and the time it was saved; with no
 * row the website shows its own content. Reading it for a visitor needs nothing; changing it needs `content:write`, the CSRF token and (to guard
 * against two administrators) the time the document was read, which a second save must still match.
 */

const KEY = 'site.profile'
export const SEED_PROFILE = join(import.meta.dirname, '..', '..', '..', 'seed', 'profile.seed.json')

interface Stored {
  profile: ProfileDocument
  updatedAt: string
}

function read(app: AppContext): Stored | null {
  const raw = getSetting(app.db, KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !isRecord(parsed.profile) || typeof parsed.updatedAt !== 'string') return null
    // A document saved by an older version may lack a part: each part gets its empty value, nothing is invented.
    return { profile: { ...emptyProfile(), ...(parsed.profile as Partial<ProfileDocument>) }, updatedAt: parsed.updatedAt }
  } catch {
    return null
  }
}

/** The website's own About content as a document: the seed file written from the source files (`npm run catalog:seed-export`). */
export function defaultProfile(): ProfileDocument {
  try {
    const seed: unknown = JSON.parse(readFileSync(SEED_PROFILE, 'utf8'))
    if (!isRecord(seed)) return emptyProfile()
    const asTri = (value: unknown) => ({ hu: '', en: '', nl: '', ...(isRecord(value) ? (value as Record<string, string>) : {}) })
    const story = isRecord(seed.story) ? seed.story : {}
    const contact = isRecord(seed.contact) ? seed.contact : {}
    const profile: ProfileDocument = {
      story: { title: asTri(story.title), paragraphs: (Array.isArray(story.paragraphs) ? story.paragraphs : []).map(asTri), thought: asTri(story.thought) },
      strengths: (Array.isArray(seed.strengths) ? seed.strengths : []).filter(isRecord).map((item) => ({ id: String(item.id), name: asTri(item.name), text: asTri(item.text) })),
      skills: (Array.isArray(seed.technologies) ? seed.technologies : []).filter(isRecord).map((group) => ({
        id: String(group.id),
        label: asTri(group.label),
        skills: (Array.isArray(group.items) ? group.items : []).filter((name): name is string => typeof name === 'string').map((name) => ({ name, level: null })),
      })),
      focus: (Array.isArray(seed.focus) ? seed.focus : []).filter(isRecord).map((item) => ({ id: String(item.id), active: true, title: asTri(item.title), text: asTri(item.text) })),
      contact: {
        email: typeof contact.email === 'string' ? contact.email : '',
        social: (Array.isArray(contact.social) ? contact.social : []).filter(isRecord).map((entry) => ({ id: String(entry.id), label: String(entry.label), url: String(entry.url) })),
      },
    }
    return profile
  } catch {
    return emptyProfile()
  }
}

/** What a visitor gets: the saved document, or `null` while the owner has not saved one (the website then shows its own content). */
export function publicProfile(app: AppContext): (ProfileDocument & { updatedAt: string }) | null {
  const stored = read(app)
  return stored ? { ...stored.profile, updatedAt: stored.updatedAt } : null
}

export function adminProfile(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'content:write')
  const stored = read(app)
  return { profile: stored ? stored.profile : defaultProfile(), saved: stored !== null, updatedAt: stored?.updatedAt ?? null }
}

export function saveProfile(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>) {
  const who = requirePermission(session, 'content:write')
  const current = read(app)
  if (typeof body.expectedUpdatedAt === 'string' && body.expectedUpdatedAt !== (current?.updatedAt ?? '')) throw conflict('The profile was changed by someone else since you opened it. Reload it before saving.')
  if (!isRecord(body.profile)) throw validationFailed({ profile: 'invalid' })
  const profile = requireValidProfile(normalizeProfile(body.profile))
  const updatedAt = iso(app.clock.now())
  setSetting(app.db, app.clock, KEY, JSON.stringify({ profile, updatedAt }), who.userId)
  audit(app, who, 'profile.update', 'profile', null)
  return adminProfile(app, session)
}

/** Back to the website's own content: the saved document is removed. */
export function resetProfile(app: AppContext, session: SessionInfo | null) {
  const who = requirePermission(session, 'content:write')
  app.db.run('DELETE FROM settings WHERE key = ?', [KEY])
  audit(app, who, 'profile.reset', 'profile', null)
  return adminProfile(app, session)
}
