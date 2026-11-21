import { LANGUAGES, type Language } from '../../config.ts'
import { validationFailed, type FieldCode, type FieldErrors } from '../../http/errors.ts'
import { cleanBlock, cleanLine, isRecord, length } from '../../lib/text.ts'
import { INSTRUCTIONS_MAX, isDemoType, isEligible, type DemoType } from './demo.ts'

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
export const SECTIONS = ['overview', 'challenge', 'approach', 'architecture', 'features', 'decisions', 'learned', 'results', 'gallery', 'blocks', 'links'] as const
/** The kinds of block an administrator may add to a project page (PROMPT 22): a small fixed vocabulary, plain text only, each drawn as a band of the existing page. */
export const BLOCK_TYPES = ['text', 'image', 'gallery', 'features', 'technologies', 'highlight', 'links'] as const
export type BlockType = (typeof BLOCK_TYPES)[number]
export type SectionId = (typeof SECTIONS)[number]

export interface LinkEntry {
  url: string
  /** The administrator opened it and it works. A link that is not marked checked is never shown to a visitor. */
  verified: boolean
}

/** One reusable content block. Every block has a heading (it becomes the band's title); what else it carries depends on its type. */
export type Block =
  | { type: 'text'; heading: Tri; body: Tri }
  | { type: 'image'; heading: Tri; mediaId: number; alt: Tri; caption: Tri }
  | { type: 'gallery'; heading: Tri; images: Array<{ mediaId: number; alt: Tri; caption: Tri }> }
  | { type: 'features'; heading: Tri; items: Tri[] }
  | { type: 'technologies'; heading: Tri; items: string[] }
  | { type: 'highlight'; heading: Tri; text: Tri }
  | { type: 'links'; heading: Tri; links: Array<{ label: Tri; url: string; verified: boolean }> }

/** What a search engine and a link preview read about the project's page. Every field is optional: what is empty falls back to the card's own text IN THE SAME LANGUAGE. */
export interface ProjectSeo {
  title: Tri
  description: Tri
  ogTitle: Tri
  ogDescription: Tri
  imageMediaId: number | null
  imageAlt: Tri
}

/**
 * The project's interactive demo (PROMPT 35). Only data: a switch, a type from the closed list in demo.ts, and the owner's own plain-text instructions. There is no
 * code, markup, address or component name in it, and `type` can only be a registered one.
 */
export interface DemoConfig {
  enabled: boolean
  type: DemoType | ''
  instructions: Tri
}

export const emptyDemo = (): DemoConfig => ({ enabled: false, type: '', instructions: emptyTri() })

export interface ProjectContent {
  /** A name only the administration shows (to tell two projects apart in the list); never sent to a visitor. */
  internalTitle: string
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
  /** The services delivered for this project (shown with the overview). */
  services: Tri[]
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
  blocks: Block[]
  seo: ProjectSeo
  /** Documents saved before demos existed have none: they read as a demo that is switched off. */
  demo: DemoConfig
  hidden: SectionId[]
}

// ---------------------------------------------------------------------------------------------------------------
// Normalising what an administrator sends
// ---------------------------------------------------------------------------------------------------------------

export const LIMITS = { title: 120, line: 200, card: 400, paragraph: 3000, item: 1500, source: 160, tag: 60, url: 300, list: 24, stackItems: 40, gallery: 24, challenges: 12, blocks: 20, blockImages: 12, blockLinks: 6, seoTitle: 70, seoDescription: 200, ogTitle: 90, ogDescription: 200 }

export class Errors {
  readonly map: FieldErrors = {}
  fail(path: string, code: FieldCode): void {
    if (!(path in this.map)) this.map[path] = code
  }
  get any(): boolean {
    return Object.keys(this.map).length > 0
  }
}

type Input = unknown

export function str(errors: Errors, path: string, value: Input, max: number, multiline: boolean): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    errors.fail(path, 'invalid')
    return ''
  }
  const out = multiline ? cleanBlock(value) : cleanLine(value)
  if (length(out) > max) errors.fail(path, 'tooLong')
  return out
}

export function tri(errors: Errors, path: string, value: Input, max: number, multiline = false): Tri {
  const out = emptyTri()
  if (value === undefined || value === null) return out
  if (!isRecord(value)) {
    errors.fail(path, 'invalid')
    return out
  }
  for (const language of LANGUAGES) out[language] = str(errors, `${path}.${language}`, value[language], max, multiline)
  return out
}

export function list<T>(errors: Errors, path: string, value: Input, max: number, each: (item: unknown, itemPath: string) => T): T[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    errors.fail(path, 'invalid')
    return []
  }
  if (value.length > max) errors.fail(path, 'tooMany')
  return value.slice(0, max).map((item, index) => each(item, `${path}.${index}`))
}

export function pick<T extends string>(errors: Errors, path: string, value: Input, allowed: readonly T[], fallback: T): T {
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

export const stringList = (errors: Errors, path: string, value: Input, max: number, each: number): string[] => {
  const out = list(errors, path, value, max, (item, at) => str(errors, at, item, each, false)).filter((item) => item !== '')
  return [...new Set(out)]
}

/** One block: its type decides what else it may carry; anything else it was sent is dropped, and a type that is not in the vocabulary is refused. */
function block(errors: Errors, path: string, value: Input): Block {
  const row = isRecord(value) ? value : {}
  if (!isRecord(value)) errors.fail(path, 'invalid')
  const type = pick(errors, `${path}.type`, row.type, BLOCK_TYPES, 'text')
  const heading = tri(errors, `${path}.heading`, row.heading, LIMITS.title)
  switch (type) {
    case 'image':
      return { type, heading, mediaId: mediaId(errors, `${path}.mediaId`, row.mediaId), alt: tri(errors, `${path}.alt`, row.alt, LIMITS.line), caption: tri(errors, `${path}.caption`, row.caption, LIMITS.line) }
    case 'gallery':
      return {
        type,
        heading,
        images: list(errors, `${path}.images`, row.images, LIMITS.blockImages, (item, at) => {
          const image = isRecord(item) ? item : {}
          if (!isRecord(item)) errors.fail(at, 'invalid')
          return { mediaId: mediaId(errors, `${at}.mediaId`, image.mediaId), alt: tri(errors, `${at}.alt`, image.alt, LIMITS.line), caption: tri(errors, `${at}.caption`, image.caption, LIMITS.line) }
        }),
      }
    case 'features':
      return { type, heading, items: triList(errors, `${path}.items`, row.items, LIMITS.line) }
    case 'technologies':
      return { type, heading, items: stringList(errors, `${path}.items`, row.items, LIMITS.stackItems, LIMITS.tag) }
    case 'highlight':
      return { type, heading, text: tri(errors, `${path}.text`, row.text, LIMITS.item, true) }
    case 'links':
      return {
        type,
        heading,
        links: list(errors, `${path}.links`, row.links, LIMITS.blockLinks, (item, at) => {
          const entry = isRecord(item) ? item : {}
          if (!isRecord(item)) errors.fail(at, 'invalid')
          const url = checkedUrl(errors, `${at}.url`, entry.url)
          return { label: tri(errors, `${at}.label`, entry.label, LIMITS.title), url, verified: entry.verified === true }
        }).filter((entry) => entry.url !== ''),
      }
    default:
      return { type: 'text', heading, body: tri(errors, `${path}.body`, row.body, LIMITS.paragraph, true) }
  }
}

/** The demo switch, read from what the form sends: a type outside the closed list is refused (never stored), and a demo cannot be switched on without one. */
function demoConfig(errors: Errors, path: string, value: Input): DemoConfig {
  if (value === undefined || value === null) return emptyDemo()
  if (!isRecord(value)) {
    errors.fail(path, 'invalid')
    return emptyDemo()
  }
  const enabled = value.enabled === true
  let type: DemoType | '' = ''
  if (isDemoType(value.type)) type = value.type
  else if (value.type !== undefined && value.type !== null && value.type !== '') errors.fail(`${path}.type`, 'invalid')
  if (enabled && type === '') errors.fail(`${path}.type`, 'required')
  return { enabled, type, instructions: tri(errors, `${path}.instructions`, value.instructions, INSTRUCTIONS_MAX, true) }
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

  const seoIn = isRecord(body.seo) ? body.seo : {}
  const content: ProjectContent = {
    internalTitle: str(errors, `${p}.internalTitle`, body.internalTitle, LIMITS.title, false),
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
    services: triList(errors, `${p}.services`, body.services, LIMITS.line),
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
    blocks: list(errors, `${p}.blocks`, body.blocks, LIMITS.blocks, (item, at) => block(errors, at, item)),
    seo: {
      title: tri(errors, `${p}.seo.title`, seoIn.title, LIMITS.seoTitle),
      description: tri(errors, `${p}.seo.description`, seoIn.description, LIMITS.seoDescription),
      ogTitle: tri(errors, `${p}.seo.ogTitle`, seoIn.ogTitle, LIMITS.ogTitle),
      ogDescription: tri(errors, `${p}.seo.ogDescription`, seoIn.ogDescription, LIMITS.ogDescription),
      imageMediaId: typeof seoIn.imageMediaId === 'number' && Number.isInteger(seoIn.imageMediaId) && seoIn.imageMediaId > 0 ? seoIn.imageMediaId : seoIn.imageMediaId === undefined || seoIn.imageMediaId === null ? null : (errors.fail(`${p}.seo.imageMediaId`, 'invalid'), null),
      imageAlt: tri(errors, `${p}.seo.imageAlt`, seoIn.imageAlt, LIMITS.line),
    },
    demo: demoConfig(errors, `${p}.demo`, body.demo),
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
    if (content.seo.imageMediaId) check(content.seo.imageMediaId, `${p}.seo.imageMediaId`)
    content.blocks.forEach((item, index) => {
      if (item.type === 'image') check(item.mediaId, `${p}.blocks.${index}.mediaId`)
      if (item.type === 'gallery') item.images.forEach((image, at) => check(image.mediaId, `${p}.blocks.${index}.images.${at}.mediaId`))
    })
  }
  // At most one hero picture.
  if (content.gallery.filter((image) => image.hero).length > 1) errors.fail(`${p}.gallery`, 'duplicate')
  return { content, errors: errors.map }
}

/**
 * A stored document read back: a project saved before PROMPT 22 has no internal title, services, blocks or SEO, so each is given its empty
 * value. Nothing is validated here (a document was validated when it was written) and nothing is written back until the project is saved.
 */
/** A stored demo read defensively: only a registered type, a real switch, and plain strings. A document from before demos existed has none. */
function storedDemo(value: unknown): DemoConfig {
  if (!isRecord(value)) return emptyDemo()
  const read = isRecord(value.instructions) ? value.instructions : {}
  const instructions = emptyTri()
  for (const language of LANGUAGES) instructions[language] = typeof read[language] === 'string' ? (read[language] as string).slice(0, INSTRUCTIONS_MAX) : ''
  return { enabled: value.enabled === true && isDemoType(value.type), type: isDemoType(value.type) ? value.type : '', instructions }
}

export function upgradeContent(stored: unknown): ProjectContent {
  const content = (isRecord(stored) ? stored : {}) as unknown as ProjectContent
  const seo = (isRecord(content.seo) ? content.seo : {}) as Partial<ProjectSeo>
  return {
    ...content,
    internalTitle: typeof content.internalTitle === 'string' ? content.internalTitle : '',
    services: Array.isArray(content.services) ? content.services : [],
    blocks: Array.isArray(content.blocks) ? content.blocks : [],
    demo: storedDemo((content as unknown as Record<string, unknown>).demo),
    seo: {
      title: seo.title ?? emptyTri(),
      description: seo.description ?? emptyTri(),
      ogTitle: seo.ogTitle ?? emptyTri(),
      ogDescription: seo.ogDescription ?? emptyTri(),
      imageMediaId: typeof seo.imageMediaId === 'number' ? seo.imageMediaId : null,
      imageAlt: seo.imageAlt ?? emptyTri(),
    },
  }
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
    // The social picture and every picture in a block need their description, in every language that is required.
    if (content.seo.imageMediaId && content.seo.imageAlt[l] === '') blocking.push('seo.imageAlt')
    content.blocks.forEach((item, index) => {
      if (item.heading[l] === '') blocking.push(`blocks.${index}.heading`)
      if (item.type === 'image' && item.alt[l] === '') blocking.push(`blocks.${index}.alt`)
      if (item.type === 'gallery') item.images.forEach((image, at) => image.alt[l] === '' && blocking.push(`blocks.${index}.images.${at}.alt`))
    })
    out[l] = { state: filled[l] === 0 ? 'missing' : blocking.length === 0 && untranslated[l].length === 0 ? 'complete' : 'incomplete', blocking, untranslated: untranslated[l] }
  }
  return out
}

const SECTION_OF: Record<string, SectionId> = {
  overview: 'overview', challenges: 'challenge', approach: 'approach', architectureText: 'architecture', features: 'features', decisions: 'decisions', learned: 'learned', limits: 'learned', next: 'learned',
  results: 'results', gallery: 'gallery', galleryNote: 'gallery', links: 'links', services: 'overview', blocks: 'blocks',
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
    /** The languages the project can be shown in (see `availableLanguages`): a language not in it shows nothing of the project. */
    languages: Language[]
    seo: PublicSeo | null
  }
  detail?: Record<string, unknown>
}

/** What the head of the project's page says, per language; an empty text falls back to the card's, in the same language. */
export interface PublicSeo {
  title: Tri
  description: Tri
  ogTitle: Tri
  ogDescription: Tri
  image: (PictureOut & { alt: Tri }) | null
}

export type PublicBlock =
  | { type: 'text'; heading: Tri; body: Tri }
  | { type: 'image'; heading: Tri; picture: PictureOut; alt: Tri; caption: Tri }
  | { type: 'gallery'; heading: Tri; images: Array<{ picture: PictureOut; alt: Tri; caption: Tri }> }
  | { type: 'features'; heading: Tri; items: Tri[] }
  | { type: 'technologies'; heading: Tri; items: string[] }
  | { type: 'highlight'; heading: Tri; text: Tri }
  | { type: 'links'; heading: Tri; links: Array<{ label: Tri; url: string }> }

/**
 * The languages a project can be shown in: the ones that have what publishing needs and some text of their own. The website never
 * fills a gap with another language, so a language that is not in this list gets no card, no page and no sitemap entry for the project.
 */
export function availableLanguages(content: ProjectContent): Language[] {
  const report = completeness(content)
  return LANGUAGES.filter((language) => report[language].state !== 'missing' && report[language].blocking.length === 0)
}

function publicSeo(content: ProjectContent, pictures: Pictures): PublicSeo | null {
  const { seo } = content
  const picture = seo.imageMediaId ? pictures(seo.imageMediaId) : null
  const written = LANGUAGES.some((language) => seo.title[language] || seo.description[language] || seo.ogTitle[language] || seo.ogDescription[language])
  if (!written && !picture) return null
  return { title: seo.title, description: seo.description, ogTitle: seo.ogTitle, ogDescription: seo.ogDescription, image: picture ? { ...picture, alt: seo.imageAlt } : null }
}

/** The blocks as a visitor may see them: pictures resolved, only links that were marked as checked, and nothing that ended up empty. */
function publicBlocks(content: ProjectContent, pictures: Pictures): PublicBlock[] {
  const some = (value: Tri) => LANGUAGES.some((language) => value[language] !== '')
  return content.blocks.flatMap((item): PublicBlock[] => {
    switch (item.type) {
      case 'text':
        return some(item.body) ? [{ type: 'text', heading: item.heading, body: item.body }] : []
      case 'image': {
        const picture = pictures(item.mediaId)
        return picture ? [{ type: 'image', heading: item.heading, picture, alt: item.alt, caption: item.caption }] : []
      }
      case 'gallery': {
        const images = item.images.flatMap((image) => {
          const picture = pictures(image.mediaId)
          return picture ? [{ picture, alt: image.alt, caption: image.caption }] : []
        })
        return images.length > 0 ? [{ type: 'gallery', heading: item.heading, images }] : []
      }
      case 'features':
        return item.items.length > 0 ? [{ type: 'features', heading: item.heading, items: item.items }] : []
      case 'technologies':
        return item.items.length > 0 ? [{ type: 'technologies', heading: item.heading, items: item.items }] : []
      case 'highlight':
        return some(item.text) ? [{ type: 'highlight', heading: item.heading, text: item.text }] : []
      case 'links': {
        const links = item.links.filter((entry) => entry.verified).map((entry) => ({ label: entry.label, url: entry.url }))
        return links.length > 0 ? [{ type: 'links', heading: item.heading, links }] : []
      }
    }
  })
}

/** Resolves a picture id to its address and size. */
export type Pictures = (id: number) => PictureOut | null

/** Replaces what the administrator hid with nothing, so a hidden section's words never leave the server. */
function stripHidden(content: ProjectContent): ProjectContent {
  const hide = (section: SectionId) => content.hidden.includes(section)
  const copy: ProjectContent = structuredClone(content)
  if (hide('overview')) {
    copy.overview = { what: emptyTri(), audience: emptyTri(), problem: emptyTri(), goal: emptyTri() }
    copy.services = []
  }
  if (hide('blocks')) copy.blocks = []
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

/**
 * What a visitor's page may know about the demo: a registered type that suits THIS project, switched on, with the owner's instructions (plain text, bounded).
 * Anything else, including a type that no longer suits the slug (the slug of an unpublished project can change), is `null`: the project has no demo.
 */
export function publicDemo(demo: DemoConfig, slug: string): { type: DemoType; instructions: Tri | null } | null {
  if (!demo.enabled || demo.type === '' || !isDemoType(demo.type) || !isEligible(demo.type, slug)) return null
  const hasText = LANGUAGES.some((language) => demo.instructions[language] !== '')
  return { type: demo.type, instructions: hasText ? demo.instructions : null }
}

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
      languages: availableLanguages(stored),
      seo: publicSeo(content, pictures),
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
    services: content.services,
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
    blocks: publicBlocks(content, pictures),
    galleryNote: LANGUAGES.some((l) => content.galleryNote[l] !== '') ? content.galleryNote : null,
    links: {
      demo: shownLink(content.links.demo),
      source: shownLink(content.links.source),
      extra: content.links.extra && content.links.extra.verified ? { url: content.links.extra.url, label: content.links.extra.label } : null,
      video: shownLink(content.links.video),
    },
    sourceUrl: shownLink(content.links.source),
    reviewed: row.updated_at.slice(0, 10),
    demo: publicDemo(content.demo, row.slug),
  }
  return out
}
