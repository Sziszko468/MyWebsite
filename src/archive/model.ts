import type { MockupKind } from '../content/projects'
import type { DemoType } from '../demos/ids'
import { demoPath } from '../demos/ids'
import { experimentPath, type LabExperiment, type LabId, type LabStatus } from '../content/lab'
import { LOCALE_TAGS, type Language } from '../i18n/config'
import type { CardView } from '../projects/types'

/**
 * The Digital Archive's data (PROMPT 37): one list of what the site has made PUBLIC, built from what the site already has and nothing else: the published projects
 * (the public list of src/projects/, never the administrator's preview), the demos those projects have switched on, the six experiences of the Lab and the design tool.
 * No record is stored, copied into a second database or invented: an entry is a view of an existing record. Plain functions over plain data, no React and no DOM.
 */

export const ARCHIVE_KINDS = ['project', 'demo', 'lab', 'tool'] as const
export type ArchiveKind = (typeof ARCHIVE_KINDS)[number]

export const ARCHIVE_STATUSES = ['live', 'demo', 'in-progress', 'concept', 'ready'] as const
export type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number]

export const SORTS = ['curated', 'name', 'name-desc', 'kind'] as const
export type ArchiveSort = (typeof SORTS)[number]

/** The two categories that are not the project categories of the CMS: what the six experiences and the design tool are. */
export const LAB_CATEGORY = 'creative-coding'
export const TOOL_CATEGORY = 'design-tools'
export const TOOL_PATH = '/lab/design-system'

export type ArchiveVisual =
  | { type: 'image'; src: string; width: number; height: number; alt: string }
  | { type: 'mockup'; kind: MockupKind }
  | { type: 'lab'; id: LabId }
  | { type: 'tool' }

export interface ArchiveEntry {
  /** A stable anchor, `entry-<kind>-<slug>`: the direct link to this entry. */
  id: string
  kind: ArchiveKind
  title: string
  description: string
  /** The key and the name of its category, in the page's language. */
  category: string
  categoryLabel: string
  status: ArchiveStatus
  tags: readonly string[]
  /** Its page (language-free), or `null` for a published project that has none. */
  href: string | null
  /** A second way in: a demo's project, or a project's demo. */
  related: { kind: 'project' | 'demo'; href: string } | null
  visual: ArchiveVisual
  /** The curated order: projects as the administrator ordered them, then demos, experiences by number, the tool. */
  order: number
}

/** The words the builder needs that are not already in the records. All in one language. */
export interface ArchiveWords {
  creativeCoding: string
  designTools: string
  demoName: (type: DemoType) => string
  demoSummary: (type: DemoType) => string
  toolTitle: string
  toolDescription: string
  /** "{project}: {demo}" */
  demoTitle: string
}

export interface ArchiveSources {
  lang: Language
  /** The PUBLIC projects, already in the page's language and in the administrator's order. A draft is dropped even if one is passed in. */
  projects: readonly CardView[]
  /** Which of those projects have a demo switched on. */
  demos: ReadonlyArray<{ slug: string; type: DemoType }>
  experiments: readonly LabExperiment[]
  /** The name of a project category (the CMS's own list), in the page's language; empty when the key is unknown. */
  categoryName: (key: string) => string
  words: ArchiveWords
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/
const PROJECT_STATUSES: readonly string[] = ['live', 'demo', 'in-progress', 'concept']
const LAB_STATUSES: Record<LabStatus, ArchiveStatus> = { ready: 'ready', 'in-progress': 'in-progress', concept: 'concept' }

export const entryAnchor = (kind: ArchiveKind, slug: string): string => `entry-${kind}-${slug}`

/** The anchor named by a location hash (`#entry-…`), or `null`. Anything else, or a malformed one, is not a direct link. */
export function anchorFromHash(hash: string): string | null {
  const id = hash.replace(/^#/, '')
  return /^entry-(project|demo|lab|tool)-[a-z0-9][a-z0-9-]{0,63}$/.test(id) ? id : null
}

/** The archive's entries, in the curated order. */
export function buildEntries(sources: ArchiveSources): ArchiveEntry[] {
  const { projects, demos, experiments, categoryName, words } = sources
  const entries: ArchiveEntry[] = []
  const seen = new Set<string>()
  const add = (entry: Omit<ArchiveEntry, 'order'>) => {
    if (seen.has(entry.id)) return
    seen.add(entry.id)
    entries.push({ ...entry, order: entries.length })
  }

  // A draft is not public, and a project the data cannot describe is not shown: the public list should hold neither, and this does not rely on it.
  const visible = projects.filter((project) => !project.draft && SLUG.test(project.slug) && project.name.trim() !== '' && PROJECT_STATUSES.includes(project.status))
  const demoOf = new Map(demos.map((demo) => [demo.slug, demo.type]))
  const categoryLabelOf = (project: CardView) => categoryName(project.category) || project.category

  for (const project of visible) {
    const type = project.detailPath !== null ? demoOf.get(project.slug) : undefined
    add({
      id: entryAnchor('project', project.slug),
      kind: 'project',
      title: project.name,
      description: project.description,
      category: project.category,
      categoryLabel: categoryLabelOf(project),
      status: project.status,
      tags: project.tags,
      href: project.detailPath,
      related: type ? { kind: 'demo', href: demoPath(project.slug) } : null,
      visual: project.image ? { type: 'image', ...project.image } : { type: 'mockup', kind: project.mockup },
    })
  }
  for (const project of visible) {
    const type = project.detailPath !== null ? demoOf.get(project.slug) : undefined
    if (!type) continue
    add({
      id: entryAnchor('demo', project.slug),
      kind: 'demo',
      title: words.demoTitle.replace('{project}', project.name).replace('{demo}', words.demoName(type)),
      description: words.demoSummary(type),
      category: project.category,
      categoryLabel: categoryLabelOf(project),
      status: project.status,
      tags: project.tags,
      href: demoPath(project.slug),
      related: { kind: 'project', href: project.detailPath! },
      visual: { type: 'mockup', kind: project.mockup },
    })
  }
  for (const experiment of [...experiments].sort((a, b) => a.number.localeCompare(b.number))) {
    add({
      id: entryAnchor('lab', experiment.id),
      kind: 'lab',
      title: experiment.name,
      description: experiment.tagline[sources.lang],
      category: LAB_CATEGORY,
      categoryLabel: words.creativeCoding,
      status: LAB_STATUSES[experiment.status],
      tags: experiment.tech,
      href: experiment.status === 'ready' ? experimentPath(experiment.id) : null,
      related: null,
      visual: { type: 'lab', id: experiment.id },
    })
  }
  add({
    id: entryAnchor('tool', 'design-system'),
    kind: 'tool',
    title: words.toolTitle,
    description: words.toolDescription,
    category: TOOL_CATEGORY,
    categoryLabel: words.designTools,
    status: 'ready',
    tags: ['React', 'TypeScript', 'SCSS'],
    href: TOOL_PATH,
    related: null,
    visual: { type: 'tool' },
  })
  return entries
}

/* ── Finding ─────────────────────────────────────────────────────────── */

export interface ArchiveQuery {
  text: string
  kind: ArchiveKind | ''
  category: string
  status: ArchiveStatus | ''
  sort: ArchiveSort
}

export const TEXT_MAX = 80
export const defaultQuery = (): ArchiveQuery => ({ text: '', kind: '', category: '', status: '', sort: 'curated' })

const oneOf = <T extends string>(value: string | null, list: readonly T[]): T | '' => (value !== null && (list as readonly string[]).includes(value) ? (value as T) : '')

/** The query an address asks for. Anything unknown, too long or malformed is ignored: an address never breaks the page. */
export function readQuery(params: URLSearchParams): ArchiveQuery {
  const category = params.get('category') ?? ''
  // Control characters in an address are not part of a search.
  // eslint-disable-next-line no-control-regex
  const text = (params.get('q') ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, TEXT_MAX)
  return {
    text,
    kind: oneOf(params.get('kind'), ARCHIVE_KINDS),
    category: /^[a-z0-9][a-z0-9-]{0,39}$/.test(category) ? category : '',
    status: oneOf(params.get('status'), ARCHIVE_STATUSES),
    sort: oneOf(params.get('sort'), SORTS) || 'curated',
  }
}

/** The address of a query: only what differs from the default, in a fixed order. */
export function writeQuery(query: ArchiveQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.text !== '') params.set('q', query.text.slice(0, TEXT_MAX))
  if (query.kind !== '') params.set('kind', query.kind)
  if (query.category !== '') params.set('category', query.category)
  if (query.status !== '') params.set('status', query.status)
  if (query.sort !== 'curated') params.set('sort', query.sort)
  return params
}

/** Whether the query narrows or reorders anything. */
export const isActive = (query: ArchiveQuery): boolean => query.text.trim() !== '' || query.kind !== '' || query.category !== '' || query.status !== '' || query.sort !== 'curated'

/** A text as search compares it: no accents, no case, single spaces. "Időpont" and "idopont" are the same word. */
export const normalize = (text: string): string => text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** The names of kinds and statuses in the page's language, so a search for "demo" or "koncepció" finds them. */
export interface ArchiveLabels {
  kind: Record<ArchiveKind, string>
  status: Record<ArchiveStatus, string>
}

const haystack = (entry: ArchiveEntry, labels: ArchiveLabels): string =>
  normalize([entry.title, entry.description, entry.categoryLabel, labels.kind[entry.kind], labels.status[entry.status], ...entry.tags].join(' '))

/** The entries that answer a query, in no new order. Every word of the search must be found (in any field). */
export function filterEntries(entries: readonly ArchiveEntry[], query: ArchiveQuery, labels: ArchiveLabels): ArchiveEntry[] {
  const words = normalize(query.text).split(' ').filter(Boolean)
  return entries.filter((entry) => {
    if (query.kind !== '' && entry.kind !== query.kind) return false
    if (query.category !== '' && entry.category !== query.category) return false
    if (query.status !== '' && entry.status !== query.status) return false
    if (words.length === 0) return true
    const text = haystack(entry, labels)
    return words.every((word) => text.includes(word))
  })
}

/** The entries in the asked order; `curated` is the archive's own. Names are compared by the page language's rules. */
export function sortEntries(entries: readonly ArchiveEntry[], sort: ArchiveSort, lang: Language): ArchiveEntry[] {
  const collator = new Intl.Collator(LOCALE_TAGS[lang], { sensitivity: 'base', numeric: true })
  const byCurated = (a: ArchiveEntry, b: ArchiveEntry) => a.order - b.order
  const sorted = [...entries]
  switch (sort) {
    case 'name':
      return sorted.sort((a, b) => collator.compare(a.title, b.title) || byCurated(a, b))
    case 'name-desc':
      return sorted.sort((a, b) => collator.compare(b.title, a.title) || byCurated(a, b))
    case 'kind':
      return sorted.sort((a, b) => ARCHIVE_KINDS.indexOf(a.kind) - ARCHIVE_KINDS.indexOf(b.kind) || collator.compare(a.title, b.title) || byCurated(a, b))
    default:
      return sorted.sort(byCurated)
  }
}

export interface Facet<K extends string = string> {
  key: K
  count: number
}

export interface Facets {
  kinds: Facet<ArchiveKind>[]
  categories: Array<Facet & { label: string }>
  statuses: Facet<ArchiveStatus>[]
}

/** What can be filtered by: only values that at least one entry has, with how many have it. */
export function facetsOf(entries: readonly ArchiveEntry[]): Facets {
  const count = <K extends string>(keys: readonly K[], read: (entry: ArchiveEntry) => K): Facet<K>[] =>
    keys.map((key) => ({ key, count: entries.filter((entry) => read(entry) === key).length })).filter((facet) => facet.count > 0)
  const categoryKeys = [...new Set(entries.map((entry) => entry.category))]
  return {
    kinds: count(ARCHIVE_KINDS, (entry) => entry.kind),
    categories: categoryKeys.map((key) => ({
      key,
      count: entries.filter((entry) => entry.category === key).length,
      label: entries.find((entry) => entry.category === key)!.categoryLabel,
    })),
    statuses: count(ARCHIVE_STATUSES, (entry) => entry.status),
  }
}

/**
 * A query as it can be applied to what is there: a category or a status that no entry has is dropped (an address from another time must not show an empty page),
 * once the entries have arrived.
 */
export function effectiveQuery(query: ArchiveQuery, facets: Facets, loaded: boolean): ArchiveQuery {
  if (!loaded) return query
  return {
    ...query,
    kind: query.kind !== '' && !facets.kinds.some((facet) => facet.key === query.kind) ? '' : query.kind,
    category: query.category !== '' && !facets.categories.some((facet) => facet.key === query.category) ? '' : query.category,
    status: query.status !== '' && !facets.statuses.some((facet) => facet.key === query.status) ? '' : query.status,
  }
}
