import { LANGUAGES, type Language } from '../../config.ts'
import { validationFailed, type FieldCode, type FieldErrors } from '../../http/errors.ts'
import { cleanBlock, cleanLine, isRecord, length } from '../../lib/text.ts'

/**
 * The document behind a project: what the website's own project pages already say (src/content/projectDetails/types.ts),
 * with every text as `{ hu, en, nl }`. This file is the only place that knows the shape. It
 *   - turns whatever an administrator's form sends into that shape, cleaned and bounded, naming every field that is wrong
 *     (`normalizeContent`), so a draft can be saved half written but never malformed;
 *   - says, per language, what is missing (`completeness`), which is what the "complete / incomplete / missing" marks
 *     in the administration show and what publication checks;
 *   - cuts the public view (`publicProject`): only what is published, only links that were marked as checked, and nothing of a
 *     section the administrator hid.
 * Texts are plain text: paragraphs are separated by a blank line and the website draws them as text, never as markup, so
 * there is no rich-text input to sanitise and none to get wrong.
 */

export type Tri = Record<Language, string>
export const emptyTri = (): Tri => ({ hu: '', en: '', nl: '' })

export const STATUSES = ['draft', 'published', 'archived'] as const
export type ProjectState = (typeof STATUSES)[number]

export const ACCENTS = ['red', 'blue', 'ink'] as const
export const HEROES = ['split', 'stack', 'route'] as const
export const MOCKUPS = ['finance', 'booking', 'guide', 'logistics'] as const
export const LAYOUTS = ['lead', 'offset', 'compact', 'wide'] as const
export const PROJECT_STATUSES = ['live', 'demo', 'in-progress', 'concept'] as const
export const STACK_GROUPS = ['frontend', 'backend', 'data', 'infrastructure', 'testing', 'services'] as const
export const FEATURE_STATUSES = ['done', 'partial', 'planned'] as const
/** The sections of a project page an administrator may hide. The hero is always there. */
export const SECTIONS = ['overview', 'challenge', 'approach', 'architecture', 'features', 'decisions', 'learned', 'results', 'gallery', 'links'] as const
export type SectionId = (typeof SECTIONS)[number]

export interface LinkEntry {
  url: string
  /** The administrator opened it and it works. A link that is not marked checked is never shown to a visitor. */
  verified: boolean
}

export interface ProjectContent {
  title: Tri
  /** The small label above a card's title ("Finance app"); empty means the category's label is used. */
  cardLabel: Tri
  /** The card on the home page and on the Work page. */
  cardDescription: Tri
  /** One or two sentences at the top of the page. */
  summary: Tri
  /** Whether the project has a page of its own; without one its card says so and links nowhere. */
  detailPage: boolean
  projectStatus: (typeof PROJECT_STATUSES)[number]
  accent: (typeof ACCENTS)[number]
  hero: (typeof HEROES)[number]
  mockup: (typeof MOCKUPS)[number]
  layout: (typeof LAYOUTS)[number]
  tags: string[]
  stack: Array<{ group: (typeof STACK_GROUPS)[number]; items: string[] }>
  repoName: string
  role: Tri
  thumbnail: { mediaId: number; alt: Tri } | null
  gallery: Array<{ mediaId: number; device: 'desktop' | 'mobile'; alt: Tri; caption: Tri; hero: boolean }>
  galleryNote: Tri
  overview: { what: Tri; audience: Tri; problem: Tri; goal: Tri }
  challenges: Array<{ title: Tri; problem: Tri; solution: Tri; source: string }>
  approach: Array<{ title: Tri; text: Tri }>
  architectureText: Tri
  /** A drawn diagram carried over from the website's own pages: kept and shown, not edited here. */
  architecture: Record<string, unknown> | null
  features: Array<{ title: Tri; text: Tri; status: (typeof FEATURE_STATUSES)[number]; imageMediaId: number | null }>
  limits: Tri[]
  decisions: Array<{ title: Tri; text: Tri }>
  learned: Tri[]
  /** Results are shown only when the administrator has written them: the form says they need real evidence. */
  results: Tri[]
  next: Tri[]
  links: { demo: LinkEntry | null; source: LinkEntry | null; extra: (LinkEntry & { label: Tri }) | null; video: LinkEntry | null }
  hidden: SectionId[]
}

// ---------------------------------------------------------------------------------------------------------------
// Normalising what an administrator sends
// ---------------------------------------------------------------------------------------------------------------

export const LIMITS = { title: 120, line: 200, card: 400, paragraph: 3000, item: 1500, source: 160, tag: 60, url: 300, list: 24, stackItems: 40, gallery: 24, challenges: 12 }

class Errors {
  readonly map: FieldErrors = {}
  fail(path: string, code: FieldCode): void {
    if (!(path in this.map)) this.map[path] = code
  }
  get any(): boolean {
    return Object.keys(this.map).length > 0
  }
}

type Input = unknown

function str(errors: Errors, path: string, value: Input, max: number, multiline: boolean): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    errors.fail(path, 'invalid')
    return ''
  }
  const out = multiline ? cleanBlock(value) : cleanLine(value)
  if (length(out) > max) errors.fail(path, 'tooLong')
  return out
}

function tri(errors: Errors, path: string, value: Input, max: number, multiline = false): Tri {
  const out = emptyTri()
  if (value === undefined || value === null) return out
  if (!isRecord(value)) {
    errors.fail(path, 'invalid')
    return out
  }
  for (const language of LANGUAGES) out[language] = str(errors, `${path}.${language}`, value[language], max, multiline)
  return out
}

function list<T>(errors: Errors, path: string, value: Input, max: number, each: (item: unknown, itemPath: string) => T): T[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    errors.fail(path, 'invalid')
    return []
  }
  if (value.length > max) errors.fail(path, 'tooMany')
  return value.slice(0, max).map((item, index) => each(item, `${path}.${index}`))
}

function pick<T extends string>(errors: Errors, path: string, value: Input, allowed: readonly T[], fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    errors.fail(path, 'invalid')
    return fallback
  }
  return value as T
}

function mediaId(errors: Errors, path: string, value: Input): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    errors.fail(path, value === undefined || value === null ? 'required' : 'invalid')
    return 0
  }
  return value
}

/** An address a visitor may be sent to: `https://`, a host, no credentials, no whitespace. Never `javascript:`, never `http:`. */
export function checkedUrl(errors: Errors, path: string, value: Input): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') {
    errors.fail(path, 'invalid')
    return ''
  }
  const text = value.trim()
  if (text.length > LIMITS.url) {
    errors.fail(path, 'tooLong')
    return ''
  }
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password || /\s/.test(text)) throw new Error('not acceptable')
    return url.toString()
  } catch {
    errors.fail(path, 'invalid')
    return ''
  }
}

function link(errors: Errors, path: string, value: Input): LinkEntry | null {
  if (value === undefined || value === null) return null
  if (!isRecord(value)) {
    errors.fail(path, 'invalid')
    return null
  }
  const url = checkedUrl(errors, `${path}.url`, value.url)
  if (!url) return null
  return { url, verified: value.verified === true }
}

const triList = (errors: Errors, path: string, value: Input, max = LIMITS.item): Tri[] =>
  list(errors, path, value, LIMITS.list, (item, at) => tri(errors, at, item, max, true)).filter((item) => LANGUAGES.some((l) => item[l] !== ''))

const stringList = (errors: Errors, path: string, value: Input, max: number, each: number): string[] => {
  const out = list(errors, path, value, max, (item, at) => str(errors, at, item, each, false)).filter((item) => item !== '')
  return [...new Set(out)]
}

/** Builds the canonical document from an administrator's input. Every problem is collected; the caller throws them together. */
export function normalizeContent(input: Input, referenceCheck?: (id: number) => boolean): { content: ProjectContent; errors: FieldErrors } {
  const errors = new Errors()
  const body = isRecord(input) ? input : {}
  if (!isRecord(input)) errors.fail('content', 'invalid')
  const p = 'content'

  const overviewIn = isRecord(body.overview) ? body.overview : {}
  const thumbnailIn = isRecord(body.thumbnail) ? body.thumbnail : null
  const linksIn = isRecord(body.links) ? body.links : {}

  const content: ProjectContent = {
    title: tri(errors, `${p}.title`, body.title, LIMITS.title),
    cardLabel: tri(errors, `${p}.cardLabel`, body.cardLabel, LIMITS.line),
    cardDescription: tri(errors, `${p}.cardDescription`, body.cardDescription, LIMITS.card, true),
    summary: tri(errors, `${p}.summary`, body.summary, LIMITS.card * 2, true),
    detailPage: body.detailPage !== false,
    projectStatus: pick(errors, `${p}.projectStatus`, body.projectStatus, PROJECT_STATUSES, 'concept'),
    accent: pick(errors, `${p}.accent`, body.accent, ACCENTS, 'red'),
    hero: pick(errors, `${p}.hero`, body.hero, HEROES, 'split'),
    mockup: pick(errors, `${p}.mockup`, body.mockup, MOCKUPS, 'guide'),
    layout: pick(errors, `${p}.layout`, body.layout, LAYOUTS, 'compact'),
    tags: stringList(errors, `${p}.tags`, body.tags, 24, LIMITS.tag),
    stack: list(errors, `${p}.stack`, body.stack, STACK_GROUPS.length, (item, at) => {
      const row = isRecord(item) ? item : {}
      if (!isRecord(item)) errors.fail(at, 'invalid')
      return { group: pick(errors, `${at}.group`, row.group, STACK_GROUPS, 'frontend'), items: stringList(errors, `${at}.items`, row.items, LIMITS.stackItems, LIMITS.tag) }
    }).filter((row) => row.items.length > 0),
    repoName: str(errors, `${p}.repoName`, body.repoName, LIMITS.title, false),
    role: tri(errors, `${p}.role`, body.role, LIMITS.card, true),
    thumbnail: thumbnailIn ? { mediaId: mediaId(errors, `${p}.thumbnail.mediaId`, thumbnailIn.mediaId), alt: tri(errors, `${p}.thumbnail.alt`, thumbnailIn.alt, LIMITS.line) } : null,
    gallery: list(errors, `${p}.gallery`, body.gallery, LIMITS.gallery, (item, at) => {
      const row = isRecord(item) ? item : {}
      if (!isRecord(item)) errors.fail(at, 'invalid')
      return {
        mediaId: mediaId(errors, `${at}.mediaId`, row.mediaId),
        device: pick(errors, `${at}.device`, row.device, ['desktop', 'mobile'] as const, 'desktop'),
        alt: tri(errors, `${at}.alt`, row.alt, LIMITS.line),
        caption: tri(errors, `${at}.caption`, row.caption, LIMITS.line),
        hero: row.hero === true,
      }
    }),
    galleryNote: tri(errors, `${p}.galleryNote`, body.galleryNote, LIMITS.card, true),
    overview: {
      what: tri(errors, `${p}.overview.what`, overviewIn.what, LIMITS.paragraph, true),
      audience: tri(errors, `${p}.overview.audience`, overviewIn.audience, LIMITS.paragraph, true),
      problem: tri(errors, `${p}.overview.problem`, overviewIn.problem, LIMITS.paragraph, true),
      goal: tri(errors, `${p}.overview.goal`, overviewIn.goal, LIMITS.paragraph, true),
    },
    challenges: list(errors, `${p}.challenges`, body.challenges, LIMITS.challenges, (item, at) => {
      const row = isRecord(item) ? item : {}
      if (!isRecord(item)) errors.fail(at, 'invalid')
      return { title: tri(errors, `${at}.title`, row.title, LIMITS.line), problem: tri(errors, `${at}.problem`, row.problem, LIMITS.item, true), solution: tri(errors, `${at}.solution`, row.solution, LIMITS.item, true), source: str(errors, `${at}.source`, row.source, LIMITS.source, false) }
    }),
    approach: list(errors, `${p}.approach`, body.approach, LIMITS.list, (item, at) => {
      const row = isRecord(item) ? item : {}
      if (!isRecord(item)) errors.fail(at, 'invalid')
      return { title: tri(errors, `${at}.title`, row.title, LIMITS.line), text: tri(errors, `${at}.text`, row.text, LIMITS.item, true) }
    }),
    architectureText: tri(errors, `${p}.architectureText`, body.architectureText, LIMITS.paragraph, true),
    architecture: (() => {
      if (body.architecture === null || body.architecture === undefined) return null
      if (!isRecord(body.architecture) || !Array.isArray(body.architecture.tiers) || JSON.stringify(body.architecture).length > 40_000) {
        errors.fail(`${p}.architecture`, 'invalid')
        return null
      }
      return body.architecture
    })(),
    features: list(errors, `${p}.features`, body.features, LIMITS.list, (item, at) => {
      const row = isRecord(item) ? item : {}
      if (!isRecord(item)) errors.fail(at, 'invalid')
      const image = row.imageMediaId
      return {
        title: tri(errors, `${at}.title`, row.title, LIMITS.line),
        text: tri(errors, `${at}.text`, row.text, LIMITS.item, true),
        status: pick(errors, `${at}.status`, row.status, FEATURE_STATUSES, 'done'),
        imageMediaId: typeof image === 'number' && Number.isInteger(image) && image > 0 ? image : null,
      }
    }),
    limits: triList(errors, `${p}.limits`, body.limits),
    decisions: list(errors, `${p}.decisions`, body.decisions, LIMITS.list, (item, at) => {
      const row = isRecord(item) ? item : {}
      if (!isRecord(item)) errors.fail(at, 'invalid')
      return { title: tri(errors, `${at}.title`, row.title, LIMITS.line), text: tri(errors, `${at}.text`, row.text, LIMITS.item, true) }
    }),
    learned: triList(errors, `${p}.learned`, body.learned),
    results: triList(errors, `${p}.results`, body.results),
    next: triList(errors, `${p}.next`, body.next),
    links: {
      demo: link(errors, `${p}.links.demo`, linksIn.demo),
      source: link(errors, `${p}.links.source`, linksIn.source),
      extra: (() => {
        const entry = link(errors, `${p}.links.extra`, linksIn.extra)
        if (!entry) return null
        const label = tri(errors, `${p}.links.extra.label`, isRecord(linksIn.extra) ? linksIn.extra.label : undefined, LIMITS.title)
        return { ...entry, label }
      })(),
      video: link(errors, `${p}.links.video`, linksIn.video),
    },
    hidden: [...new Set(list(errors, `${p}.hidden`, body.hidden, SECTIONS.length, (item, at) => pick(errors, at, item, SECTIONS, 'overview')))],
  }

  // A picture a project points at must exist (the caller says which ids do): a dangling id would be a broken image for ever.
  if (referenceCheck) {
    const check = (id: number, path: string) => {
      if (id > 0 && !referenceCheck(id)) errors.fail(path, 'invalid')
    }
    if (content.thumbnail) check(content.thumbnail.mediaId, `${p}.thumbnail.mediaId`)
    content.gallery.forEach((image, index) => check(image.mediaId, `${p}.gallery.${index}.mediaId`))
    content.features.forEach((feature, index) => feature.imageMediaId && check(feature.imageMediaId, `${p}.features.${index}.imageMediaId`))
  }
  // At most one hero picture.
  if (content.gallery.filter((image) => image.hero).length > 1) errors.fail(`${p}.gallery`, 'duplicate')
  return { content, errors: errors.map }
}

export function requireValid(result: { content: ProjectContent; errors: FieldErrors }): ProjectContent {
  if (Object.keys(result.errors).length > 0) throw validationFailed(result.errors)
  return result.content
}

// ---------------------------------------------------------------------------------------------------------------
// What is missing, per language
// ---------------------------------------------------------------------------------------------------------------

export type Completeness = 'complete' | 'incomplete' | 'missing'

export interface LanguageReport {
  state: Completeness
  /** The fields a project needs in this language before it can be published. */
  blocking: string[]
  /** Fields that have text in another language and none in this one. */
  untranslated: string[]
}

const isTri = (value: unknown): value is Tri => isRecord(value) && LANGUAGES.every((l) => typeof value[l] === 'string') && Object.keys(value).length === 3

function walk(value: unknown, path: string, visit: (path: string, tri: Tri) => void): void {
  if (isTri(value)) return visit(path, value)
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}.${index}`, visit))
  else if (isRecord(value)) for (const [key, item] of Object.entries(value)) if (key !== 'architecture') walk(item, path ? `${path}.${key}` : key, visit)
}

/**
 * Per language: which required fields are empty (publishing needs them), which other texts exist elsewhere and not here, and
 * the verdict. `missing` means the language has no text at all; `complete` means nothing blocks and nothing is untranslated.
 */
export function completeness(content: ProjectContent): Record<Language, LanguageReport> {
  const required: Array<[string, (c: ProjectContent, l: Language) => string]> = [
    ['title', (c, l) => c.title[l]],
    ['cardDescription', (c, l) => c.cardDescription[l]],
    ['summary', (c, l) => c.summary[l]],
  ]
  const out = {} as Record<Language, LanguageReport>
  const untranslated: Record<Language, string[]> = { hu: [], en: [], nl: [] }
  const filled: Record<Language, number> = { hu: 0, en: 0, nl: 0 }
  walk(content, '', (path, node) => {
    for (const l of LANGUAGES) {
      if (node[l] !== '') filled[l] += 1
      else if (LANGUAGES.some((other) => other !== l && node[other] !== '') && !hiddenPath(content, path)) untranslated[l].push(path)
    }
  })
  for (const l of LANGUAGES) {
    const blocking = required.filter(([, read]) => read(content, l) === '').map(([name]) => name)
    if (content.detailPage && !content.hidden.includes('overview') && content.overview.what[l] === '') blocking.push('overview.what')
    content.gallery.forEach((image, index) => {
      if (image.alt[l] === '') blocking.push(`gallery.${index}.alt`)
    })
    if (content.thumbnail && content.thumbnail.alt[l] === '') blocking.push('thumbnail.alt')
    out[l] = { state: filled[l] === 0 ? 'missing' : blocking.length === 0 && untranslated[l].length === 0 ? 'complete' : 'incomplete', blocking, untranslated: untranslated[l] }
  }
  return out
}

const SECTION_OF: Record<string, SectionId> = {
  overview: 'overview', challenges: 'challenge', approach: 'approach', architectureText: 'architecture', features: 'features', decisions: 'decisions', learned: 'learned', limits: 'learned', next: 'learned',
  results: 'results', gallery: 'gallery', galleryNote: 'gallery', links: 'links',
}
const hiddenPath = (content: ProjectContent, path: string): boolean => {
  const section = SECTION_OF[path.split('.')[0]]
  return section !== undefined && content.hidden.includes(section)
}

/** Whether a project may be published: every language has what it needs and every picture has its description. */
export function publishBlockers(content: ProjectContent, requireAllLanguages: boolean): string[] {
  const report = completeness(content)
  const out: string[] = []
  const languages = requireAllLanguages ? LANGUAGES : LANGUAGES.filter((l) => report[l].state !== 'missing')
  if (languages.length === 0) out.push('content.title.hu')
  for (const l of languages) for (const name of report[l].blocking) out.push(`content.${name}.${l}`)
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// The public view
// ---------------------------------------------------------------------------------------------------------------

export interface PictureOut {
  id: number
  src: string
  width: number
  height: number
}

export interface PublicProject {
  slug: string
  featured: boolean
  position: number
  category: string
  status: ProjectState
  publishedAt: string | null
  updatedAt: string
  card: {
    title: Tri
    label: Tri
    description: Tri
    tags: string[]
    projectStatus: ProjectContent['projectStatus']
    layout: ProjectContent['layout']
    mockup: ProjectContent['mockup']
    detailPage: boolean
    thumbnail: (PictureOut & { alt: Tri }) | null
    demoUrl: string | null
  }
  detail?: Record<string, unknown>
}

/** Resolves a picture id to its address and size. */
export type Pictures = (id: number) => PictureOut | null

/** Replaces what the administrator hid with nothing, so a hidden section's words never leave the server. */
function stripHidden(content: ProjectContent): ProjectContent {
  const hide = (section: SectionId) => content.hidden.includes(section)
  const copy: ProjectContent = structuredClone(content)
  if (hide('overview')) copy.overview = { what: emptyTri(), audience: emptyTri(), problem: emptyTri(), goal: emptyTri() }
  if (hide('challenge')) copy.challenges = []
  if (hide('approach')) copy.approach = []
  if (hide('architecture')) {
    copy.architecture = null
    copy.architectureText = emptyTri()
  }
  if (hide('features')) copy.features = []
  if (hide('decisions')) copy.decisions = []
  if (hide('learned')) {
    copy.learned = []
    copy.next = []
    copy.limits = []
  }
  if (hide('results')) copy.results = []
  if (hide('gallery')) {
    copy.gallery = []
    copy.galleryNote = emptyTri()
  }
  if (hide('links')) copy.links = { demo: null, source: null, extra: null, video: null }
  return copy
}

const shownLink = (entry: LinkEntry | null): string | null => (entry && entry.verified ? entry.url : null)

export function publicProject(
  row: { slug: string; featured: number; position: number; category: string; status: ProjectState; published_at: string | null; updated_at: string },
  stored: ProjectContent,
  pictures: Pictures,
  full: boolean,
): PublicProject {
  const content = stripHidden(stored)
  const thumb = content.thumbnail ? pictures(content.thumbnail.mediaId) : null
  const out: PublicProject = {
    slug: row.slug,
    featured: row.featured === 1,
    position: row.position,
    category: row.category,
    status: row.status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    card: {
      title: content.title,
      label: content.cardLabel,
      description: content.cardDescription,
      tags: content.tags,
      projectStatus: content.projectStatus,
      layout: content.layout,
      mockup: content.mockup,
      detailPage: content.detailPage,
      thumbnail: thumb && content.thumbnail ? { ...thumb, alt: content.thumbnail.alt } : null,
      // The card's demo link is the project's own, never a draft's, and only when it was marked as checked.
      demoUrl: shownLink(content.links.demo),
    },
  }
  if (!full) return out
  const gallery = content.gallery.flatMap((image) => {
    const picture = pictures(image.mediaId)
    return picture ? [{ ...picture, id: `m${image.mediaId}`, device: image.device, alt: image.alt, caption: image.caption, hero: image.hero }] : []
  })
  out.detail = {
    accent: content.accent,
    hero: content.hero,
    summary: content.summary,
    role: LANGUAGES.some((l) => content.role[l] !== '') ? content.role : null,
    repoName: content.repoName || null,
    stack: content.stack,
    overview: content.overview,
    challenges: content.challenges,
    approach: content.approach,
    architectureText: content.architectureText,
    architecture: content.architecture,
    features: content.features.map((feature) => ({ title: feature.title, text: feature.text, status: feature.status, image: feature.imageMediaId && gallery.some((g) => g.id === `m${feature.imageMediaId}`) ? `m${feature.imageMediaId}` : undefined })),
    limits: content.limits,
    decisions: content.decisions,
    learned: content.learned,
    results: content.results,
    next: content.next,
    gallery,
    galleryNote: LANGUAGES.some((l) => content.galleryNote[l] !== '') ? content.galleryNote : null,
    links: {
      demo: shownLink(content.links.demo),
      source: shownLink(content.links.source),
      extra: content.links.extra && content.links.extra.verified ? { url: content.links.extra.url, label: content.links.extra.label } : null,
      video: shownLink(content.links.video),
    },
    sourceUrl: shownLink(content.links.source),
    reviewed: row.updated_at.slice(0, 10),
  }
  return out
}
