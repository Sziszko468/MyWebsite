import type { Language } from '../../i18n/config'

/** The administration's view of a project (server/src/modules/projects/content.ts is the authority; a test holds the two together). */

export type Tri = Record<Language, string>
export type ProjectState = 'draft' | 'published' | 'archived'
export type LanguageState = 'complete' | 'incomplete' | 'missing'

export interface LinkEntry {
  url: string
  verified: boolean
}

export type ProjectBlock =
  | { type: 'text'; heading: Tri; body: Tri }
  | { type: 'image'; heading: Tri; mediaId: number; alt: Tri; caption: Tri }
  | { type: 'gallery'; heading: Tri; images: Array<{ mediaId: number; alt: Tri; caption: Tri }> }
  | { type: 'features'; heading: Tri; items: Tri[] }
  | { type: 'technologies'; heading: Tri; items: string[] }
  | { type: 'highlight'; heading: Tri; text: Tri }
  | { type: 'links'; heading: Tri; links: Array<{ label: Tri; url: string; verified: boolean }> }

export interface ProjectSeo {
  title: Tri
  description: Tri
  ogTitle: Tri
  ogDescription: Tri
  imageMediaId: number | null
  imageAlt: Tri
}

export interface ProjectContent {
  internalTitle: string
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
  services: Tri[]
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
  blocks: ProjectBlock[]
  seo: ProjectSeo
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
  /** The description kept with the picture in the library (the editor offers it when the picture is put on a project). */
  alt: Tri
  /** The projects that use the picture (the library page lists them). */
  usedBy?: Array<{ id: number; slug: string; title: Tri }>
}

/** Where the pictures are kept, as the server sees it. */
export interface MediaStorage {
  directory: string
  writable: boolean
  onApplicationFilesystem: boolean | null
  warning: 'not_writable' | 'application_filesystem' | null
  files: number
}

/** A link that opens one project, in any state, for somebody without an account. The secret is shown once, when the link is made. */
export interface PreviewLink {
  id: string
  label: string | null
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  lastUsedAt: string | null
  state: 'active' | 'expired' | 'revoked'
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
  internalTitle: string
  thumbnail: Picture | null
  detailPage: boolean
  languages: Record<Language, LanguageReport>
  /** The languages the website shows this project in (a language not listed shows nothing of it). */
  available: Language[]
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

// ---- the profile document (the About page and the contact details) ----

export type SkillLevel = 'learning' | 'working' | 'confident'

export interface ProfileDocument {
  story: { title: Tri; paragraphs: Tri[]; thought: Tri }
  strengths: Array<{ id: string; name: Tri; text: Tri }>
  skills: Array<{ id: string; label: Tri; skills: Array<{ name: string; level: SkillLevel | null }> }>
  focus: Array<{ id: string; active: boolean; title: Tri; text: Tri }>
  contact: { email: string; social: Array<{ id: string; label: string; url: string }> }
}

export interface ProfileData {
  profile: ProfileDocument
  /** `false` while the website shows its own content (nothing has been saved here yet). */
  saved: boolean
  updatedAt: string | null
}
