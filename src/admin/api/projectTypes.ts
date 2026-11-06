import type { Language } from '../../i18n/config'

/** The administration's view of a project (server/src/modules/projects/content.ts is the authority; a test holds the two together). */

export type Tri = Record<Language, string>
export type ProjectState = 'draft' | 'published' | 'archived'
export type LanguageState = 'complete' | 'incomplete' | 'missing'

export interface LinkEntry {
  url: string
  verified: boolean
}

export interface ProjectContent {
  title: Tri
  cardLabel: Tri
  cardDescription: Tri
  summary: Tri
  detailPage: boolean
  projectStatus: 'live' | 'demo' | 'in-progress' | 'concept'
  accent: 'red' | 'blue' | 'ink'
  hero: 'split' | 'stack' | 'route'
  mockup: 'finance' | 'booking' | 'guide' | 'logistics'
  layout: 'lead' | 'offset' | 'compact' | 'wide'
  tags: string[]
  stack: Array<{ group: 'frontend' | 'backend' | 'data' | 'infrastructure' | 'testing' | 'services'; items: string[] }>
  repoName: string
  role: Tri
  thumbnail: { mediaId: number; alt: Tri } | null
  gallery: Array<{ mediaId: number; device: 'desktop' | 'mobile'; alt: Tri; caption: Tri; hero: boolean }>
  galleryNote: Tri
  overview: { what: Tri; audience: Tri; problem: Tri; goal: Tri }
  challenges: Array<{ title: Tri; problem: Tri; solution: Tri; source: string }>
  approach: Array<{ title: Tri; text: Tri }>
  architectureText: Tri
  architecture: Record<string, unknown> | null
  features: Array<{ title: Tri; text: Tri; status: 'done' | 'partial' | 'planned'; imageMediaId: number | null }>
  limits: Tri[]
  decisions: Array<{ title: Tri; text: Tri }>
  learned: Tri[]
  results: Tri[]
  next: Tri[]
  links: { demo: LinkEntry | null; source: LinkEntry | null; extra: (LinkEntry & { label: Tri }) | null; video: LinkEntry | null }
  hidden: string[]
}

export interface LanguageReport {
  state: LanguageState
  blocking: string[]
  untranslated: string[]
}

export interface Picture {
  id: number
  src: string
  width: number
  height: number
}

export interface MediaItem extends Picture {
  mime: string
  bytes: number
  name: string | null
  storage: 'upload' | 'public'
  createdAt: string
  uses?: number
}

export interface Category {
  key: string
  label: Tri
}

export interface ProjectListItem {
  id: number
  slug: string
  status: ProjectState
  featured: boolean
  position: number
  category: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
  title: Tri
  thumbnail: Picture | null
  detailPage: boolean
  languages: Record<Language, LanguageReport>
  blockers: string[]
}

export interface ProjectDetailData extends ProjectListItem {
  content: ProjectContent
  media: MediaItem[]
}

export interface ProjectList {
  projects: ProjectListItem[]
  categories: Category[]
  requireAllLanguages: boolean
}

export interface TextKey {
  key: string
  group: string
  label: string
  placeholders?: string[]
  default: Tri
  values: Tri
}
