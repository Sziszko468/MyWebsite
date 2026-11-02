import { experimentPath, playableExperiments, type LabId } from '../content/lab'
import { projects, type ProjectId } from '../content/projects'
import { SERVICE_IDS, type ServiceId } from '../content/services/ids'
import { LANGUAGES, type Language } from '../i18n/config'
import { SHOP_PATHS, servicePath } from '../shop/paths'

/**
 * The page registry: the one place that says which pages exist, where they live and in
 * which languages they are available. The router, the navigation, the footer, the document
 * title and the language switcher are all derived from it.
 */

export type NavPageId = 'home' | 'work' | 'services' | 'about' | 'lab' | 'contact'
/** A project's details page: `project-spendly`, `project-bookinghub`... */
export type ProjectPageId = `project-${ProjectId}`
/** An experiment's own page: `lab-particle-universe`, `lab-liquid-matter`... */
export type LabPageId = `lab-${LabId}`
/** A service's product page: `service-website`, `service-webapp`... */
export type ServicePageId = `service-${ServiceId}`
/** The shop's two working pages, under /services. */
export type ShopPageId = 'configure' | 'cart'
export type PageId = NavPageId | ProjectPageId | LabPageId | ServicePageId | ShopPageId | 'designSystem'

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

/**
 * One page per experiment that is ready (content/lab.ts), under /lab. They are not in the
 * navigation (the Lab has its own) and exist in every language. An experiment that is not ready
 * has no page at all.
 */
export const LAB_PAGES: readonly PageDef<LabPageId>[] = playableExperiments.map((experiment) =>
  page<LabPageId>(`lab-${experiment.id}`, experimentPath(experiment.id)),
)

/** The experiment a page shows, or `null` when the page is not an experiment's. */
export function labIdOfPage(id: PageId): LabId | null {
  return id.startsWith('lab-') ? (id.slice('lab-'.length) as LabId) : null
}

/**
 * The shop's pages beneath /services: one product page per service, the request builder and the
 * cart. They are not in the navigation (the Services page leads to them) and exist in every language.
 */
export const SHOP_PAGES: readonly PageDef<ServicePageId | ShopPageId>[] = [
  ...SERVICE_IDS.map((id) => page<ServicePageId>(`service-${id}`, servicePath(id))),
  page<ShopPageId>('configure', SHOP_PATHS.configure),
  page<ShopPageId>('cart', SHOP_PATHS.cart),
]

/** The service a page shows, or `null` when the page is not a service's. */
export function serviceIdOfPage(id: PageId): ServiceId | null {
  return id.startsWith('service-') ? (id.slice('service-'.length) as ServiceId) : null
}

/** Dev-only reference page; absent from production builds. */
const DEV_PAGES: readonly PageDef[] = import.meta.env.DEV ? [page('designSystem', '/design-system')] : []

export const PAGES: readonly PageDef[] = [...NAV_PAGES, ...SHOP_PAGES, ...PROJECT_PAGES, ...LAB_PAGES, ...DEV_PAGES]

function normalize(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed.startsWith('/') ? trimmed || '/' : `/${trimmed}`
}

/** Finds the page for a language-free path, ignoring trailing slashes. */
export function findPage(path: string, pages: readonly PageDef[] = PAGES): PageDef | undefined {
  const wanted = normalize(path)
  return pages.find((candidate) => normalize(candidate.path) === wanted)
}
