import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppContext, SessionInfo } from '../../context.ts'
import { LANGUAGES, type Language } from '../../config.ts'
import { conflict, notFound, validationFailed, type FieldErrors } from '../../http/errors.ts'
import { iso } from '../../lib/time.ts'
import { cleanLine, isRecord } from '../../lib/text.ts'
import { requirePermission } from '../auth/permissions.ts'
import { mediaById, mediaUrl, mediaOut, type MediaRow } from '../media/service.ts'
import { audit } from '../system/audit.ts'
import { getSetting, setSetting } from '../system/settings.ts'
import {
  completeness,
  emptyTri,
  normalizeContent,
  publicProject,
  publishBlockers,
  requireValid,
  type PictureOut,
  type ProjectContent,
  type ProjectState,
  type PublicProject,
  type Tri,
} from './content.ts'

/**
 * Projects: the rows, the workflow (draft, published, archived), the public view and the administrator's operations. Every
 * operation checks the permission first, validates the whole document, writes in one transaction and leaves a line in the audit
 * log (which carries the project's slug and what happened, never its text). The public functions see only `published` rows.
 */

export interface ProjectRow {
  id: number
  slug: string
  status: ProjectState
  featured: number
  position: number
  category: string
  content_json: string
  published_at: string | null
  created_at: string
  updated_at: string
}

export const RESERVED_SLUGS = ['preview', 'new', 'admin', 'api']
const SLUG = /^[a-z0-9][a-z0-9-]{1,59}$/
export const SEED_PROJECTS_FILE = join(import.meta.dirname, '..', '..', '..', 'seed', 'projects.seed.json')

export interface Category {
  key: string
  label: Tri
}

const KEYS = { categories: 'projects.categories', allLanguages: 'projects.publish.all_languages' } as const

const parseContent = (row: ProjectRow): ProjectContent => JSON.parse(row.content_json) as ProjectContent
const rows = (app: AppContext, where = '', params: Array<string | number> = []): ProjectRow[] =>
  app.db.all<ProjectRow>(`SELECT * FROM projects ${where} ORDER BY position, id`, params)

function find(app: AppContext, id: unknown): ProjectRow {
  const key = typeof id === 'string' && /^\d+$/.test(id) ? Number(id) : id
  const row = typeof key === 'number' ? app.db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', [key]) : undefined
  if (!row) throw notFound('The project')
  return row
}

// ---------------------------------------------------------------------------------------------------------------
// categories and settings
// ---------------------------------------------------------------------------------------------------------------

export function categories(app: AppContext): Category[] {
  const raw = getSetting(app.db, KEYS.categories)
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Category[]) : []
  } catch {
    return []
  }
}

export const requireAllLanguages = (app: AppContext): boolean => getSetting(app.db, KEYS.allLanguages) !== '0'

export function projectSettings(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'content:write')
  return { categories: categories(app), requireAllLanguages: requireAllLanguages(app) }
}

export function saveProjectSettings(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>) {
  const who = requirePermission(session, 'content:write')
  const errors: FieldErrors = {}
  let next = categories(app)
  if ('categories' in body) {
    if (!Array.isArray(body.categories) || body.categories.length > 12) throw validationFailed({ categories: 'invalid' })
    const seen = new Set<string>()
    next = body.categories.map((item, index) => {
      const row = isRecord(item) ? item : {}
      const key = typeof row.key === 'string' ? row.key : ''
      if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(key)) errors[`categories.${index}.key`] = 'invalid'
      else if (seen.has(key)) errors[`categories.${index}.key`] = 'duplicate'
      seen.add(key)
      const label = emptyTri()
      for (const language of LANGUAGES) {
        const value = isRecord(row.label) && typeof row.label[language] === 'string' ? cleanLine(row.label[language]) : ''
        if (!value) errors[`categories.${index}.label.${language}`] = 'required'
        else if (value.length > 60) errors[`categories.${index}.label.${language}`] = 'tooLong'
        label[language] = value
      }
      return { key, label }
    })
    if (Object.keys(errors).length > 0) throw validationFailed(errors)
    // A category a project still uses cannot be taken away: its card would have no label and no filter.
    const used = new Set(rows(app).map((row) => row.category))
    for (const key of used) if (!seen.has(key)) throw conflict(`The category "${key}" is still used by a project.`)
    setSetting(app.db, app.clock, KEYS.categories, JSON.stringify(next), who.userId)
  }
  if ('requireAllLanguages' in body) {
    if (typeof body.requireAllLanguages !== 'boolean') throw validationFailed({ requireAllLanguages: 'invalid' })
    setSetting(app.db, app.clock, KEYS.allLanguages, body.requireAllLanguages ? '1' : '0', who.userId)
  }
  audit(app, who, 'project.settings', 'project', null)
  return { categories: categories(app), requireAllLanguages: requireAllLanguages(app) }
}

// ---------------------------------------------------------------------------------------------------------------
// pictures
// ---------------------------------------------------------------------------------------------------------------

function mediaIdsOf(content: ProjectContent): number[] {
  return [...(content.thumbnail ? [content.thumbnail.mediaId] : []), ...content.gallery.map((image) => image.mediaId), ...content.features.flatMap((feature) => (feature.imageMediaId ? [feature.imageMediaId] : []))]
}

function picturesFor(app: AppContext, contents: ProjectContent[]): (id: number) => PictureOut | null {
  const map = mediaById(app, contents.flatMap(mediaIdsOf))
  return (id) => {
    const row = map.get(id)
    return row ? { id: row.id, src: mediaUrl(row), width: row.width, height: row.height } : null
  }
}

/** How many project documents use each picture, for the picker ("used 2×") and for the refusal to delete one in use. */
export function mediaUsage(app: AppContext): Map<number, number> {
  const usage = new Map<number, number>()
  for (const row of rows(app)) for (const id of new Set(mediaIdsOf(parseContent(row)))) usage.set(id, (usage.get(id) ?? 0) + 1)
  return usage
}

// ---------------------------------------------------------------------------------------------------------------
// the public view
// ---------------------------------------------------------------------------------------------------------------

export function publicList(app: AppContext): { projects: PublicProject[]; categories: Category[] } {
  const list = rows(app, "WHERE status = 'published'")
  const contents = list.map(parseContent)
  const pictures = picturesFor(app, contents)
  const projects = list.map((row, index) => publicProject(row, contents[index], pictures, false))
  const used = new Set(projects.map((project) => project.category))
  return { projects, categories: categories(app).filter((category) => used.has(category.key)) }
}

/** A published project with a page of its own, in full. Anything else is "not found": a draft is not even acknowledged. */
export function publicOne(app: AppContext, slug: string): { project: PublicProject; neighbours: { previous: PublicProject; next: PublicProject } | null } {
  const published = rows(app, "WHERE status = 'published'")
  const row = published.find((candidate) => candidate.slug === slug)
  if (!row) throw notFound('The project')
  const content = parseContent(row)
  if (!content.detailPage) throw notFound('The project')
  const withPage = published.filter((candidate) => parseContent(candidate).detailPage)
  const contents = withPage.map(parseContent)
  const pictures = picturesFor(app, [content, ...contents])
  const project = publicProject(row, content, pictures, true)
  const index = withPage.findIndex((candidate) => candidate.id === row.id)
  const around =
    withPage.length > 1
      ? {
          previous: publicProject(withPage[(index - 1 + withPage.length) % withPage.length], contents[(index - 1 + withPage.length) % withPage.length], pictures, false),
          next: publicProject(withPage[(index + 1) % withPage.length], contents[(index + 1) % withPage.length], pictures, false),
        }
      : null
  return { project, neighbours: around }
}

// ---------------------------------------------------------------------------------------------------------------
// the administration
// ---------------------------------------------------------------------------------------------------------------

function adminView(app: AppContext, row: ProjectRow, pictures: (id: number) => PictureOut | null) {
  const content = parseContent(row)
  const report = completeness(content)
  const thumb = content.thumbnail ? pictures(content.thumbnail.mediaId) : null
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    featured: row.featured === 1,
    position: row.position,
    category: row.category,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    title: content.title,
    thumbnail: thumb,
    detailPage: content.detailPage,
    languages: report,
    blockers: publishBlockers(content, requireAllLanguages(app)),
  }
}

export function adminList(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'content:write')
  const list = rows(app)
  const pictures = picturesFor(app, list.map(parseContent))
  return { projects: list.map((row) => adminView(app, row, pictures)), categories: categories(app), requireAllLanguages: requireAllLanguages(app) }
}

export function adminGet(app: AppContext, session: SessionInfo | null, id: unknown) {
  requirePermission(session, 'content:write')
  const row = find(app, id)
  const content = parseContent(row)
  const pictures = picturesFor(app, [content])
  return { ...adminView(app, row, pictures), content, pictures: mediaById(app, mediaIdsOf(content)).size, media: [...mediaById(app, mediaIdsOf(content)).values()].map(mediaOut) }
}

const existingMedia = (app: AppContext) => {
  const cache = new Map<number, boolean>()
  return (id: number): boolean => {
    if (!cache.has(id)) cache.set(id, app.db.get('SELECT 1 AS x FROM media WHERE id = ?', [id]) !== undefined)
    return cache.get(id) as boolean
  }
}

function parseSlug(value: unknown, errors: FieldErrors): string {
  if (typeof value !== 'string' || !SLUG.test(value)) {
    errors.slug = value === undefined || value === '' ? 'required' : 'invalid'
    return ''
  }
  if (RESERVED_SLUGS.includes(value)) errors.slug = 'invalid'
  return value
}

function parseCategory(app: AppContext, value: unknown, errors: FieldErrors): string {
  const known = categories(app).map((category) => category.key)
  if (typeof value !== 'string' || !known.includes(value)) {
    errors.category = value === undefined || value === '' ? 'required' : 'invalid'
    return known[0] ?? 'web'
  }
  return value
}

const nextPosition = (app: AppContext): number => (app.db.get<{ n: number }>('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM projects')?.n ?? 1)

function insert(app: AppContext, input: { slug: string; status: ProjectState; featured: boolean; position: number; category: string; content: ProjectContent; publishedAt: string | null }): number {
  const now = iso(app.clock.now())
  return app.db.run(
    `INSERT INTO projects (slug, status, featured, position, category, content_json, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.slug, input.status, input.featured ? 1 : 0, input.position, input.category, JSON.stringify(input.content), input.publishedAt, now, now],
  ).lastInsertRowid
}

export function create(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>) {
  const who = requirePermission(session, 'content:write')
  const errors: FieldErrors = {}
  const slug = parseSlug(body.slug, errors)
  const category = parseCategory(app, body.category, errors)
  const parsed = normalizeContent(body.content ?? {}, existingMedia(app))
  Object.assign(errors, parsed.errors, errors)
  if (slug && app.db.get('SELECT 1 AS x FROM projects WHERE slug = ?', [slug])) errors.slug = 'duplicate'
  if (!parsed.content.title.hu && !parsed.content.title.en && !parsed.content.title.nl) errors['content.title.hu'] = 'required'
  if (Object.keys(errors).length > 0) throw validationFailed(errors)
  const id = app.db.transaction(() => insert(app, { slug, status: 'draft', featured: false, position: nextPosition(app), category, content: parsed.content, publishedAt: null }))
  audit(app, who, 'project.create', 'project', id, { slug })
  return adminGet(app, session, id)
}

export function update(app: AppContext, session: SessionInfo | null, id: unknown, body: Record<string, unknown>) {
  const who = requirePermission(session, 'content:write')
  const row = find(app, id)
  const errors: FieldErrors = {}
  // Two administrators on one project: the second save is refused rather than silently winning.
  if (typeof body.expectedUpdatedAt === 'string' && body.expectedUpdatedAt !== row.updated_at) throw conflict('The project was changed by someone else since you opened it. Reload it before saving.')
  let slug = row.slug
  if (body.slug !== undefined && body.slug !== row.slug) {
    slug = parseSlug(body.slug, errors)
    // An address that has been public is never changed: links and search results point at it.
    if (row.published_at !== null) errors.slug = 'invalid'
    else if (slug && app.db.get('SELECT 1 AS x FROM projects WHERE slug = ? AND id <> ?', [slug, row.id])) errors.slug = 'duplicate'
  }
  const category = body.category !== undefined ? parseCategory(app, body.category, errors) : row.category
  const parsed = normalizeContent(body.content ?? parseContent(row), existingMedia(app))
  Object.assign(errors, parsed.errors, errors)
  if (!parsed.content.title.hu && !parsed.content.title.en && !parsed.content.title.nl) errors['content.title.hu'] = 'required'
  // A project that is public stays valid to publish: saving may not strip what publication requires.
  if (row.status === 'published') {
    for (const path of publishBlockers(parsed.content, requireAllLanguages(app))) errors[path] ??= 'required'
  }
  if (Object.keys(errors).length > 0) throw validationFailed(errors)
  const now = iso(app.clock.now())
  app.db.run('UPDATE projects SET slug = ?, category = ?, content_json = ?, updated_at = ? WHERE id = ?', [slug, category, JSON.stringify(parsed.content), now, row.id])
  audit(app, who, 'project.update', 'project', row.id, { slug })
  return adminGet(app, session, row.id)
}

type Action = 'publish' | 'unpublish' | 'archive' | 'restore'

export function transition(app: AppContext, session: SessionInfo | null, id: unknown, action: Action) {
  const who = requirePermission(session, 'content:write')
  const row = find(app, id)
  const now = iso(app.clock.now())
  if (action === 'publish') {
    if (row.status === 'published') return adminGet(app, session, row.id)
    const blockers = publishBlockers(parseContent(row), requireAllLanguages(app))
    if (blockers.length > 0) {
      const errors: FieldErrors = {}
      for (const path of blockers) errors[path] = 'required'
      throw validationFailed(errors, 'The project cannot be published yet: some required texts are missing.')
    }
    app.db.run("UPDATE projects SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?", [now, now, row.id])
  } else if (action === 'unpublish') {
    if (row.status !== 'published') throw conflict('Only a published project can be unpublished.')
    // Back to a draft: gone from every public list, its content untouched.
    app.db.run("UPDATE projects SET status = 'draft', updated_at = ? WHERE id = ?", [now, row.id])
  } else if (action === 'archive') {
    if (row.status === 'archived') return adminGet(app, session, row.id)
    // An archived project is no longer featured: it would otherwise come back to the home page when restored.
    app.db.run("UPDATE projects SET status = 'archived', featured = 0, updated_at = ? WHERE id = ?", [now, row.id])
  } else {
    if (row.status !== 'archived') throw conflict('Only an archived project can be restored.')
    app.db.run("UPDATE projects SET status = 'draft', updated_at = ? WHERE id = ?", [now, row.id])
  }
  audit(app, who, `project.${action}`, 'project', row.id, { slug: row.slug })
  return adminGet(app, session, row.id)
}

export function setFeatured(app: AppContext, session: SessionInfo | null, id: unknown, featured: unknown) {
  const who = requirePermission(session, 'content:write')
  if (typeof featured !== 'boolean') throw validationFailed({ featured: 'invalid' })
  const row = find(app, id)
  if (featured && row.status === 'archived') throw conflict('An archived project cannot be featured.')
  app.db.run('UPDATE projects SET featured = ?, updated_at = ? WHERE id = ?', [featured ? 1 : 0, iso(app.clock.now()), row.id])
  audit(app, who, featured ? 'project.feature' : 'project.unfeature', 'project', row.id, { slug: row.slug })
  return adminGet(app, session, row.id)
}

export function duplicate(app: AppContext, session: SessionInfo | null, id: unknown) {
  const who = requirePermission(session, 'content:write')
  const row = find(app, id)
  let slug = `${row.slug}-copy`.slice(0, 60)
  for (let n = 2; app.db.get('SELECT 1 AS x FROM projects WHERE slug = ?', [slug]); n += 1) slug = `${row.slug}-copy-${n}`.slice(0, 60)
  const newId = app.db.transaction(() => insert(app, { slug, status: 'draft', featured: false, position: nextPosition(app), category: row.category, content: parseContent(row), publishedAt: null }))
  audit(app, who, 'project.duplicate', 'project', newId, { from: row.slug, slug })
  return adminGet(app, session, newId)
}

export function remove(app: AppContext, session: SessionInfo | null, id: unknown): void {
  const who = requirePermission(session, 'content:delete')
  const row = find(app, id)
  app.db.run('DELETE FROM projects WHERE id = ?', [row.id])
  audit(app, who, 'project.delete', 'project', row.id, { slug: row.slug })
}

/** A full ordering: every project exactly once. A partial or repeated list is refused, so the order is never half applied. */
export function reorder(app: AppContext, session: SessionInfo | null, ids: unknown): void {
  const who = requirePermission(session, 'content:write')
  const all = rows(app).map((row) => row.id)
  if (!Array.isArray(ids) || ids.length !== all.length || !ids.every((id) => typeof id === 'number') || new Set(ids).size !== ids.length || !ids.every((id) => all.includes(id as number))) throw validationFailed({ ids: 'invalid' })
  app.db.transaction(() => ids.forEach((id, index) => app.db.run('UPDATE projects SET position = ? WHERE id = ?', [index + 1, id as number])))
  audit(app, who, 'project.reorder', 'project', null)
}

/** The preview: the page as the public would see it, for a project in any state. Only a signed-in administrator can ask. */
export function previewOne(app: AppContext, session: SessionInfo | null, id: unknown) {
  requirePermission(session, 'content:write')
  const row = find(app, id)
  const content = parseContent(row)
  const pictures = picturesFor(app, [content])
  return { project: publicProject(row, content, pictures, true), neighbours: null, preview: true, status: row.status, languages: completeness(content) }
}

/** The list for previewing the Work page and the home page's Selected Work with drafts included (archived stay out). */
export function previewList(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'content:write')
  const list = rows(app, "WHERE status <> 'archived'")
  const contents = list.map(parseContent)
  const pictures = picturesFor(app, contents)
  const projects = list.map((row, index) => publicProject(row, contents[index], pictures, false))
  return { projects: projects.map((project, index) => ({ ...project, draft: list[index].status !== 'published' })), categories: categories(app), preview: true }
}

// ---------------------------------------------------------------------------------------------------------------
// the seed: the website's own projects, loaded once into an empty table
// ---------------------------------------------------------------------------------------------------------------

export interface ProjectSeedResult {
  seeded: boolean
  projects: number
  media: number
}

export function seedProjects(app: AppContext, file = SEED_PROJECTS_FILE): ProjectSeedResult {
  const existing = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM projects')?.n ?? 0
  if (existing > 0) return { seeded: false, projects: 0, media: 0 }
  let data: unknown
  try {
    data = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return { seeded: false, projects: 0, media: 0 }
  }
  if (!isRecord(data) || !Array.isArray(data.projects)) throw new Error('The projects seed file is not valid.')
  const now = iso(app.clock.now())
  let mediaCount = 0
  app.db.transaction(() => {
    if (Array.isArray(data.categories) && !getSetting(app.db, KEYS.categories)) setSetting(app.db, app.clock, KEYS.categories, JSON.stringify(data.categories), null)
    const byPath = new Map<string, number>()
    for (const item of Array.isArray(data.media) ? data.media : []) {
      if (!isRecord(item)) continue
      const result = app.db.run(
        `INSERT INTO media (storage, path, mime, bytes, width, height, sha256, original_name, created_by, created_at) VALUES ('public', ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [String(item.path), String(item.mime), Number(item.bytes), Number(item.width), Number(item.height), String(item.sha256), String(item.path).split('/').pop() ?? null, now],
      )
      byPath.set(String(item.path), result.lastInsertRowid)
      mediaCount += 1
    }
    const resolve = (value: unknown): number => {
      const id = typeof value === 'string' ? byPath.get(value) : undefined
      if (!id) throw new Error(`The projects seed names a picture that is not in its media list: ${String(value)}`)
      return id
    }
    for (const item of data.projects as unknown[]) {
      if (!isRecord(item) || !isRecord(item.content)) throw new Error('The projects seed has a project without content.')
      const content = structuredClone(item.content) as Record<string, unknown>
      if (isRecord(content.thumbnail)) content.thumbnail = { ...content.thumbnail, mediaId: resolve(content.thumbnail.mediaPath) }
      if (Array.isArray(content.gallery)) content.gallery = content.gallery.map((image) => (isRecord(image) ? { ...image, mediaId: resolve(image.mediaPath) } : image))
      if (Array.isArray(content.features)) content.features = content.features.map((feature) => (isRecord(feature) && typeof feature.imageMediaPath === 'string' ? { ...feature, imageMediaId: resolve(feature.imageMediaPath) } : feature))
      const parsed = normalizeContent(content)
      const normalized = requireValid(parsed)
      const status = (item.status as ProjectState) ?? 'published'
      insert(app, {
        slug: String(item.slug),
        status,
        featured: item.featured === true,
        position: Number(item.position) || nextPosition(app),
        category: String(item.category),
        content: normalized,
        publishedAt: status === 'published' ? now : null,
      })
    }
  })
  return { seeded: true, projects: (data.projects as unknown[]).length, media: mediaCount }
}

export type { Language, MediaRow }
