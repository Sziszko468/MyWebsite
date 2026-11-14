import type { ProjectStatus } from '../components/Badge/Badge'
import type { ProjectDetail } from '../content/projectDetails/types'
import type { MockupKind, ProjectLayout } from '../content/projects'
import type { Trilingual } from '../content/trilingual'
import { LANGUAGES, type Language } from '../i18n/config'

/**
 * What the website knows about a project, wherever it came from: the backend's public API (the administrator's content) or
 * the website's own static content (what it falls back to when no backend answers). The pages and cards read only this, so they
 * do not care which it is.
 */

export interface ProjectCard {
  /** The address of the project's page, `/work/<slug>`. */
  slug: string
  name: Trilingual
  /** The small label above a card's title. */
  label: Trilingual
  description: Trilingual
  /** The key of the category the Work page filters by. */
  category: string
  status: ProjectStatus
  tags: readonly string[]
  layout: ProjectLayout
  mockup: MockupKind
  image: { src: string; width: number; height: number; alt: Trilingual } | null
  /** `null` for a project without a page of its own: its card then says so and links nowhere. */
  detailPath: string | null
  /** A live demo, only when the owner marked the address as checked. */
  demoUrl: string | null
  featured: boolean
  /** Only in a preview: the project is not public yet. */
  draft?: boolean
  /** The languages the project can be shown in (a language not in it shows nothing of the project). Absent: every language. */
  languages?: readonly Language[]
  /** What the head of the project's page says, when the owner wrote something for search and sharing. */
  seo?: ProjectSeo | null
}

export interface ProjectSeo {
  title: Trilingual
  description: Trilingual
  ogTitle: Trilingual
  ogDescription: Trilingual
  image: { src: string; width: number; height: number; alt: Trilingual } | null
}

/** Whether the project has something to say in a language. The website never fills a gap with another language, so a project that lacks one is not listed or opened in it. */
export const isAvailable = (card: Pick<ProjectCard, 'languages'>, lang: Language): boolean => (card.languages ?? LANGUAGES).includes(lang)

/** The projects before and after one in the list, among those that have a page of their own AND can be shown in this language (the list wraps round). */
export function neighboursIn(cards: readonly ProjectCard[], slug: string, lang: Language): { previous: ProjectCard; next: ProjectCard } | null {
  const pages = cards.filter((card) => card.detailPath !== null && isAvailable(card, lang))
  const index = pages.findIndex((card) => card.slug === slug)
  if (index < 0 || pages.length < 2) return null
  return { previous: pages[(index - 1 + pages.length) % pages.length], next: pages[(index + 1) % pages.length] }
}

export interface ProjectCategory {
  key: string
  label: Trilingual
}

export interface ProjectRecord {
  card: ProjectCard
  detail: ProjectDetail
  neighbours: { previous: ProjectCard; next: ProjectCard } | null
  /** `true` when it was read through the administrator's preview. */
  preview: boolean
  /** The project's state, known only in a preview (a public project is published by definition). */
  state?: 'draft' | 'published' | 'archived'
}

/** What a card needs in one language. */
export interface CardView {
  slug: string
  name: string
  label: string
  description: string
  status: ProjectStatus
  tags: readonly string[]
  layout: ProjectLayout
  mockup: MockupKind
  image: { src: string; width: number; height: number; alt: string } | null
  detailPath: string | null
  demoUrl: string | null
  category: string
  featured: boolean
  draft: boolean
}

export function viewOf(card: ProjectCard, lang: Language, categoryLabel?: string): CardView {
  return {
    slug: card.slug,
    name: card.name[lang],
    label: card.label[lang] || categoryLabel || '',
    description: card.description[lang],
    status: card.status,
    tags: card.tags,
    layout: card.layout,
    mockup: card.mockup,
    image: card.image ? { src: card.image.src, width: card.image.width, height: card.image.height, alt: card.image.alt[lang] } : null,
    detailPath: card.detailPath,
    demoUrl: card.demoUrl,
    category: card.category,
    featured: card.featured,
    draft: card.draft === true,
  }
}
