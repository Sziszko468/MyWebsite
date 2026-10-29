import { projects, type ProjectId } from '../content/projects'
import { LANGUAGES, type Language } from '../i18n/config'

/**
 * The page registry: the one place that says which pages exist, where they live and in
 * which languages they are available. The router, the navigation, the footer, the document
 * title and the language switcher are all derived from it.
 */

export type NavPageId = 'home' | 'work' | 'services' | 'about' | 'lab' | 'contact'
/** A project's details page: `project-spendly`, `project-bookinghub`... */
export type ProjectPageId = `project-${ProjectId}`
export type PageId = NavPageId | ProjectPageId | 'designSystem'

export interface PageDef<Id extends PageId = PageId> {
  id: Id
  /** Language-free path; the same in every language. */
  path: string
  /** Languages that have a translated version of this page. Always includes the default. */
  languages: readonly Language[]
}

const page = <Id extends PageId>(id: Id, path: string, languages: readonly Language[] = LANGUAGES): PageDef<Id> => ({
  id,
  path,
  languages,
})

/** Shown in the header and footer navigation, in this order. */
export const NAV_PAGES: readonly PageDef<NavPageId>[] = [
  page('home', '/'),
  page('work', '/work'),
  page('services', '/services'),
  page('about', '/about'),
  page('lab', '/lab'),
  page('contact', '/contact'),
]

/**
 * One page per project that has a details path (content/projects.ts). They sit under /work, are
 * not in the navigation, and exist in every language.
 */
export const PROJECT_PAGES: readonly PageDef<ProjectPageId>[] = projects.flatMap((project) =>
  project.detailPath ? [page<ProjectPageId>(`project-${project.id}`, project.detailPath)] : [],
)

/** The project a page shows, or `null` when the page is not a project's. */
export function projectIdOfPage(id: PageId): ProjectId | null {
  return id.startsWith('project-') ? (id.slice('project-'.length) as ProjectId) : null
}

/** Dev-only reference page; absent from production builds. */
const DEV_PAGES: readonly PageDef[] = import.meta.env.DEV ? [page('designSystem', '/design-system')] : []

export const PAGES: readonly PageDef[] = [...NAV_PAGES, ...PROJECT_PAGES, ...DEV_PAGES]

function normalize(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed.startsWith('/') ? trimmed || '/' : `/${trimmed}`
}

/** Finds the page for a language-free path, ignoring trailing slashes. */
export function findPage(path: string, pages: readonly PageDef[] = PAGES): PageDef | undefined {
  const wanted = normalize(path)
  return pages.find((candidate) => normalize(candidate.path) === wanted)
}
