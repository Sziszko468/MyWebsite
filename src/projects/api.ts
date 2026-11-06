import type { ProjectStatus } from '../components/Badge/Badge'
import type { Accent, Architecture, Challenge, Feature, GalleryImage, HeroVariant, ProjectDetail, StackEntry, StackGroup, Step } from '../content/projectDetails/types'
import type { MockupKind, ProjectLayout } from '../content/projects'
import type { Trilingual } from '../content/trilingual'
import { API_BASE } from '../config/api'
import { LANGUAGES } from '../i18n/config'
import type { ProjectCard, ProjectCategory, ProjectRecord } from './types'

/**
 * Reading the backend's project answers. The answer is data from another program: every field is checked before the
 * pages see it, a bad one is dropped (a bad card is left out, a bad list item is skipped, an address that is not https is
 * ignored), and nothing a page needs is ever `undefined`. The pages never see a shape they could crash on.
 */

type Raw = Record<string, unknown>
const isRaw = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value)
const str = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback)
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback)

function tri(value: unknown): Trilingual {
  const raw = isRaw(value) ? value : {}
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, str(raw[lang])])) as Trilingual
}
const triList = (value: unknown): Trilingual[] => list(value).map(tri).filter((item) => LANGUAGES.some((lang) => item[lang] !== ''))
const httpsUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}
/** A picture's address: a root-relative path of this site or its media, nothing with a scheme (a data: or javascript: address never gets this far). */
const picturePath = (value: unknown): string | null => (typeof value === 'string' && /^\/[A-Za-z0-9_./-]+$/.test(value) && !value.includes('..') ? value : null)
const size = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 20000 ? Math.round(value) : 0)

const STATUSES = ['live', 'demo', 'in-progress', 'concept'] as const satisfies readonly ProjectStatus[]
const MOCKUPS = ['finance', 'booking', 'guide', 'logistics'] as const satisfies readonly MockupKind[]
const LAYOUTS = ['lead', 'offset', 'compact', 'wide'] as const satisfies readonly ProjectLayout[]
const ACCENTS = ['red', 'blue', 'ink'] as const satisfies readonly Accent[]
const HEROES = ['split', 'stack', 'route'] as const satisfies readonly HeroVariant[]
const GROUPS = ['frontend', 'backend', 'data', 'infrastructure', 'testing', 'services'] as const satisfies readonly StackGroup[]

export function parseCard(raw: unknown): ProjectCard | null {
  if (!isRaw(raw) || !isRaw(raw.card) || typeof raw.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{1,59}$/.test(raw.slug)) return null
  const card = raw.card
  const name = tri(card.title)
  if (!LANGUAGES.some((lang) => name[lang] !== '')) return null
  const thumb = isRaw(card.thumbnail) ? card.thumbnail : null
  const src = thumb ? picturePath(thumb.src) : null
  return {
    slug: raw.slug,
    name,
    label: tri(card.label),
    description: tri(card.description),
    category: str(raw.category),
    status: oneOf(card.projectStatus, STATUSES, 'concept'),
    tags: list(card.tags).filter((tag): tag is string => typeof tag === 'string'),
    layout: oneOf(card.layout, LAYOUTS, 'compact'),
    mockup: oneOf(card.mockup, MOCKUPS, 'guide'),
    image: thumb && src && size(thumb.width) && size(thumb.height) ? { src, width: size(thumb.width), height: size(thumb.height), alt: tri(thumb.alt) } : null,
    detailPath: card.detailPage === true ? `/work/${raw.slug}` : null,
    demoUrl: httpsUrl(card.demoUrl),
    featured: raw.featured === true,
    ...(raw.draft === true ? { draft: true } : {}),
  }
}

export function parseCategories(value: unknown): ProjectCategory[] {
  return list(value).flatMap((item) => (isRaw(item) && typeof item.key === 'string' ? [{ key: item.key, label: tri(item.label) }] : []))
}

function parseDetail(slug: string, raw: unknown): ProjectDetail | null {
  if (!isRaw(raw)) return null
  const overview = isRaw(raw.overview) ? raw.overview : {}
  const links = isRaw(raw.links) ? raw.links : {}
  const extra = isRaw(links.extra) && httpsUrl(links.extra.url) ? { url: httpsUrl(links.extra.url) as string, label: tri(links.extra.label) } : null
  const gallery: GalleryImage[] = list(raw.gallery).flatMap((item) => {
    if (!isRaw(item)) return []
    const src = picturePath(item.src)
    if (!src || !size(item.width) || !size(item.height) || typeof item.id !== 'string') return []
    return [{ id: item.id, src, width: size(item.width), height: size(item.height), device: oneOf(item.device, ['desktop', 'mobile'] as const, 'desktop'), alt: tri(item.alt), caption: tri(item.caption), ...(item.hero === true ? { hero: true } : {}) }]
  })
  const step = (item: unknown): Step | null => (isRaw(item) ? { title: tri(item.title), text: tri(item.text) } : null)
  const present = <T,>(value: T | null): value is T => value !== null
  const architecture = isRaw(raw.architecture) && Array.isArray(raw.architecture.tiers) ? (raw.architecture as unknown as Architecture) : null
  return {
    id: slug,
    repoName: typeof raw.repoName === 'string' && raw.repoName !== '' ? raw.repoName : null,
    accent: oneOf(raw.accent, ACCENTS, 'red'),
    hero: oneOf(raw.hero, HEROES, 'split'),
    summary: tri(raw.summary),
    role: isRaw(raw.role) ? tri(raw.role) : null,
    sourceUrl: httpsUrl(raw.sourceUrl),
    reviewed: str(raw.reviewed, '1970-01-01'),
    stack: list(raw.stack).flatMap((item): StackEntry[] => (isRaw(item) ? [{ group: oneOf(item.group, GROUPS, 'frontend'), items: list(item.items).filter((entry): entry is string => typeof entry === 'string') }] : [])),
    overview: { what: tri(overview.what), audience: tri(overview.audience), problem: tri(overview.problem), goal: tri(overview.goal) },
    challenges: list(raw.challenges).flatMap((item): Challenge[] => (isRaw(item) ? [{ title: tri(item.title), problem: tri(item.problem), solution: tri(item.solution), source: str(item.source) }] : [])),
    approach: list(raw.approach).map(step).filter(present),
    architecture,
    features: list(raw.features).flatMap((item): Feature[] => (isRaw(item) ? [{ title: tri(item.title), text: tri(item.text), status: oneOf(item.status, ['done', 'partial', 'planned'] as const, 'done'), ...(typeof item.image === 'string' ? { image: item.image } : {}) }] : [])),
    limits: triList(raw.limits),
    decisions: list(raw.decisions).map(step).filter(present),
    learned: triList(raw.learned),
    next: triList(raw.next),
    gallery,
    galleryNote: isRaw(raw.galleryNote) ? tri(raw.galleryNote) : null,
    architectureText: tri(raw.architectureText),
    results: triList(raw.results),
    links: { demo: httpsUrl(links.demo), source: httpsUrl(links.source), extra, video: httpsUrl(links.video) },
  }
}

export function parseRecord(raw: unknown, neighbours: unknown, preview: boolean): ProjectRecord | null {
  const card = parseCard(raw)
  if (!card || !isRaw(raw)) return null
  const detail = parseDetail(card.slug, raw.detail)
  if (!detail) return null
  const around = isRaw(neighbours) ? { previous: parseCard(neighbours.previous), next: parseCard(neighbours.next) } : null
  return { card, detail, neighbours: around && around.previous && around.next ? { previous: around.previous, next: around.next } : null, preview }
}

export type FetchOutcome = { kind: 'ok'; data: unknown; meta: unknown } | { kind: 'missing' } | { kind: 'unauthorized' } | { kind: 'error' }

/** One GET to the backend. `null` base (no backend configured) is an error the caller answers with the static content. */
export async function getJson(path: string, options: { credentials?: boolean; timeoutMs?: number } = {}): Promise<FetchOutcome> {
  if (API_BASE === null) return { kind: 'error' }
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: 'application/json' },
      credentials: options.credentials ? 'include' : 'same-origin',
      signal: AbortSignal.timeout(options.timeoutMs ?? 6000),
    })
    if (response.status === 404) return { kind: 'missing' }
    if (response.status === 401 || response.status === 403) return { kind: 'unauthorized' }
    if (!response.ok) return { kind: 'error' }
    const body: unknown = await response.json()
    return isRaw(body) ? { kind: 'ok', data: body.data, meta: body.meta } : { kind: 'error' }
  } catch {
    return { kind: 'error' }
  }
}
