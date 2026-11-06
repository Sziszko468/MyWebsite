import type { ProjectStatus } from '../components/Badge/Badge'
import type { ProjectDetail } from '../content/projectDetails/types'
import type { MockupKind, ProjectLayout } from '../content/projects'
import type { Trilingual } from '../content/trilingual'
import type { Language } from '../i18n/config'

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
    name: card.name[lang] || card.name.hu || card.name.en,
    label: card.label[lang] || card.label.hu || categoryLabel || '',
    description: card.description[lang] || card.description.hu,
    status: card.status,
    tags: card.tags,
    layout: card.layout,
    mockup: card.mockup,
    image: card.image ? { src: card.image.src, width: card.image.width, height: card.image.height, alt: card.image.alt[lang] || card.image.alt.hu } : null,
    detailPath: card.detailPath,
    demoUrl: card.demoUrl,
    category: card.category,
    featured: card.featured,
    draft: card.draft === true,
  }
}
