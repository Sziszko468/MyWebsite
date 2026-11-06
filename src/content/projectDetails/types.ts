import type { Trilingual } from '../trilingual'

/**
 * The data behind a project page. Everything a visitor reads is a `Trilingual`; names of tools,
 * files and systems are plain strings, because they are proper nouns. A section whose data is
 * empty is not shown, so a page never carries a heading with nothing under it.
 *
 * What goes in here has to be backed by the project's own repository: its documentation or its
 * code. Where the two disagree, the code wins, and each challenge says where it is documented.
 */

/** How far a feature has come: `done` works as described, `partial` works in part, `planned` is only a plan. */
export type FeatureStatus = 'done' | 'partial' | 'planned'

/** The same three states for a part of the architecture. */
export type NodeStatus = 'built' | 'partial' | 'planned'

export type StackGroup = 'frontend' | 'backend' | 'data' | 'infrastructure' | 'testing' | 'services'

/** The colour a project's page leans on, besides the neutrals. */
export type Accent = 'red' | 'blue' | 'ink'

/** The composition of a project's hero. */
export type HeroVariant = 'split' | 'stack' | 'route'

export interface ArchNode {
  id: string
  /** The component's name: a proper noun, shown as is. */
  label: string
  /** What it is or does, in a few words. */
  detail?: Trilingual
  status: NodeStatus
}

export interface ArchTier {
  id: string
  label: Trilingual
  nodes: readonly ArchNode[]
}

export interface ArchLink {
  from: string
  to: string
  label: Trilingual
  /** Defaults to the status of the less finished end. */
  status?: NodeStatus
}

export interface Architecture {
  tiers: readonly ArchTier[]
  /** Only connections that exist in the project (or are marked as planned). */
  links: readonly ArchLink[]
  note?: Trilingual
}

export interface Challenge {
  title: Trilingual
  problem: Trilingual
  solution: Trilingual
  /** Where it is written down in the project's repository, e.g. "docs/code-review.md · H1". Not translated. */
  source: string
}

export interface Step {
  title: Trilingual
  text: Trilingual
}

export interface Feature {
  title: Trilingual
  text: Trilingual
  status: FeatureStatus
  /** The id of a gallery image that shows it. */
  image?: string
}

export interface GalleryImage {
  id: string
  /** Root-relative path of an optimised file under public/projects/. */
  src: string
  /** The file's real size, so the layout does not move while it loads. */
  width: number
  height: number
  device: 'desktop' | 'mobile'
  alt: Trilingual
  caption: Trilingual
  /** Used large in the hero. At most one per project. */
  hero?: boolean
}

export interface StackEntry {
  group: StackGroup
  items: readonly string[]
}

export interface ProjectDetail {
  /** The project's address (its slug). For the four static projects it is their id. */
  id: string
  /** The name inside the repository and the app, when it differs from the one shown on the site. */
  repoName: string | null
  accent: Accent
  hero: HeroVariant
  /** One or two sentences for the hero. */
  summary: Trilingual
  /** The owner's part, from what the repository shows. `null` hides the line. */
  role: Trilingual | null
  /** A full https:// address of the source code, if it is public. */
  sourceUrl: string | null
  /** ISO date the documentation and code were last read for this page. */
  reviewed: string
  stack: readonly StackEntry[]
  overview: { what: Trilingual; audience: Trilingual; problem: Trilingual; goal: Trilingual }
  challenges: readonly Challenge[]
  approach: readonly Step[]
  architecture: Architecture | null
  features: readonly Feature[]
  /** What the project does not do, read from its documentation or code. */
  limits: readonly Trilingual[]
  decisions: readonly Step[]
  /** Lessons the owner has confirmed. Empty until they are written; nothing is made up. */
  learned: readonly Trilingual[]
  /** Possible next steps, from the project's own roadmap or from the gaps listed above. */
  next: readonly Trilingual[]
  gallery: readonly GalleryImage[]
  /** What a visitor should know about the screenshots (names, age, data). */
  galleryNote: Trilingual | null
  /** Only on a project managed in the administration: a plain description of the architecture, shown when there is no drawn diagram. */
  architectureText?: Trilingual
  /** Only on a project managed in the administration: results, written by the owner from real evidence. Empty hides the section. */
  results?: readonly Trilingual[]
  /** Only on a project managed in the administration: the addresses the owner marked as checked. */
  links?: { demo: string | null; source: string | null; extra: { url: string; label: Trilingual } | null; video: string | null }
}
