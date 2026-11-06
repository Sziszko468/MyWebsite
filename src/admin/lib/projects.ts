import { LANGUAGES, type Language } from '../../i18n/config'
import type { LanguageReport, ProjectContent, Tri } from '../api/projectTypes'

/**
 * What the project editor knows besides what it draws: the empty document a new project starts from, the limits it counts
 * characters against (the same numbers as the server's, server/src/modules/projects/content.ts: a test holds them together),
 * the lists of choices, and the small pure functions that change a document without mutating it.
 */

export const emptyTri = (): Tri => ({ hu: '', en: '', nl: '' })

export const LIMITS = { title: 120, line: 200, card: 400, summary: 800, paragraph: 3000, item: 1500, source: 160, tag: 60, list: 24, gallery: 24, challenges: 12 } as const

export const ACCENTS = ['red', 'blue', 'ink'] as const
export const HEROES = ['split', 'stack', 'route'] as const
export const MOCKUPS = ['finance', 'booking', 'guide', 'logistics'] as const
export const LAYOUTS = ['lead', 'offset', 'compact', 'wide'] as const
export const PROJECT_STATUSES = ['live', 'demo', 'in-progress', 'concept'] as const
export const STACK_GROUPS = ['frontend', 'backend', 'data', 'infrastructure', 'testing', 'services'] as const
export const FEATURE_STATUSES = ['done', 'partial', 'planned'] as const
export const SECTIONS = ['overview', 'challenge', 'approach', 'architecture', 'features', 'decisions', 'learned', 'results', 'gallery', 'links'] as const
/** The longest side a picture keeps before it is uploaded, and the size above which a picture is re-encoded. */
export const IMAGE_MAX_SIDE = 1600
export const IMAGE_COMFORTABLE_BYTES = 600 * 1024

export function emptyContent(): ProjectContent {
  return {
    title: emptyTri(),
    cardLabel: emptyTri(),
    cardDescription: emptyTri(),
    summary: emptyTri(),
    detailPage: true,
    projectStatus: 'concept',
    accent: 'red',
    hero: 'split',
    mockup: 'guide',
    layout: 'compact',
    tags: [],
    stack: [],
    repoName: '',
    role: emptyTri(),
    thumbnail: null,
    gallery: [],
    galleryNote: emptyTri(),
    overview: { what: emptyTri(), audience: emptyTri(), problem: emptyTri(), goal: emptyTri() },
    challenges: [],
    approach: [],
    architectureText: emptyTri(),
    architecture: null,
    features: [],
    limits: [],
    decisions: [],
    learned: [],
    results: [],
    next: [],
    links: { demo: null, source: null, extra: null, video: null },
    hidden: [],
  }
}

/** The title to show for a project in a list or a heading: the language asked for, else any language that has one. */
export function titleOf(title: Tri, language: Language, fallback = ''): string {
  return title[language] || title.hu || title.en || title.nl || fallback
}

/** A copy of `value` with `path` set (arrays and objects along the way are copied, nothing is mutated). */
export function setIn<T>(value: T, path: ReadonlyArray<string | number>, next: unknown): T {
  if (path.length === 0) return next as T
  const [head, ...rest] = path
  if (Array.isArray(value)) {
    const copy = [...value]
    copy[head as number] = setIn(copy[head as number], rest, next)
    return copy as T
  }
  const object = (value ?? {}) as Record<string, unknown>
  return { ...object, [head]: setIn(object[head as string], rest, next) } as T
}

export const moveItem = <T,>(items: readonly T[], index: number, direction: -1 | 1): T[] => {
  const target = index + direction
  if (target < 0 || target >= items.length) return [...items]
  const copy = [...items]
  const [item] = copy.splice(index, 1)
  copy.splice(target, 0, item)
  return copy
}

/** The languages whose text is not whole, for the marks on the language bar. */
export const languagesNeedingWork = (languages: Record<Language, LanguageReport>): Language[] => LANGUAGES.filter((language) => languages[language].state !== 'complete')

/** A server field path (`content.gallery.0.alt.hu`) → the path inside the document (`gallery`, 0, `alt`, `hu`). */
export const documentPath = (field: string): string[] => field.replace(/^content\./, '').split('.')

/** Lines → a list: one item per line, empty lines dropped, repeated items once. */
export const linesToList = (text: string): string[] => [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]

export const shortSize = (bytes: number): string => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`)

/** Whether two documents differ (the form is "dirty"): compared as the JSON they are saved as. */
export const sameDocument = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

// ---------------------------------------------------------------------------------------------------------------
// What is missing, per language, while the administrator types
// ---------------------------------------------------------------------------------------------------------------

const isTri = (value: unknown): value is Tri => typeof value === 'object' && value !== null && !Array.isArray(value) && LANGUAGES.every((l) => typeof (value as Record<string, unknown>)[l] === 'string') && Object.keys(value).length === 3

function walk(value: unknown, path: string, visit: (path: string, tri: Tri) => void): void {
  if (isTri(value)) return visit(path, value)
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}.${index}`, visit))
  else if (typeof value === 'object' && value !== null) for (const [key, item] of Object.entries(value)) if (key !== 'architecture') walk(item, path ? `${path}.${key}` : key, visit)
}

const SECTION_OF: Record<string, string> = {
  overview: 'overview', challenges: 'challenge', approach: 'approach', architectureText: 'architecture', features: 'features', decisions: 'decisions', learned: 'learned', limits: 'learned', next: 'learned',
  results: 'results', gallery: 'gallery', galleryNote: 'gallery', links: 'links',
}

/**
 * The same rule as the server's `completeness` (server/src/modules/projects/content.ts), run on the document as it is being
 * edited, so the marks on the language bar follow the typing. The server decides again at every save and at publication; a test
 * holds the two functions to the same answers.
 */
export function completenessOf(content: ProjectContent): Record<Language, LanguageReport> {
  const out = {} as Record<Language, LanguageReport>
  const untranslated: Record<Language, string[]> = { hu: [], en: [], nl: [] }
  const filled: Record<Language, number> = { hu: 0, en: 0, nl: 0 }
  walk(content, '', (path, node) => {
    for (const l of LANGUAGES) {
      if (node[l] !== '') filled[l] += 1
      else if (LANGUAGES.some((other) => other !== l && node[other] !== '') && !content.hidden.includes(SECTION_OF[path.split('.')[0]] ?? '')) untranslated[l].push(path)
    }
  })
  for (const l of LANGUAGES) {
    const blocking: string[] = []
    if (content.title[l] === '') blocking.push('title')
    if (content.cardDescription[l] === '') blocking.push('cardDescription')
    if (content.summary[l] === '') blocking.push('summary')
    if (content.detailPage && !content.hidden.includes('overview') && content.overview.what[l] === '') blocking.push('overview.what')
    content.gallery.forEach((image, index) => {
      if (image.alt[l] === '') blocking.push(`gallery.${index}.alt`)
    })
    if (content.thumbnail && content.thumbnail.alt[l] === '') blocking.push('thumbnail.alt')
    out[l] = { state: filled[l] === 0 ? 'missing' : blocking.length === 0 && untranslated[l].length === 0 ? 'complete' : 'incomplete', blocking, untranslated: untranslated[l] }
  }
  return out
}
