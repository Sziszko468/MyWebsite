import { experimentPath, playableExperiments, type LabId } from '../content/lab'
import { projects } from '../content/projects'
import type { PackageId } from '../content/packages'
import { PACKAGE_IDS, SERVICE_IDS, type ServiceId } from '../content/services/ids'
import { LANGUAGES, type Language } from '../i18n/config'
import { packagePath } from '../shop/packagePaths'
import { SHOP_PATHS, servicePath } from '../shop/paths'

/**
 * The page registry: the one place that says which pages exist, where they live and in
 * which languages they are available. The router, the navigation, the footer, the document
 * title and the language switcher are all derived from it.
 */

export type NavPageId = 'home' | 'work' | 'services' | 'about' | 'lab' | 'contact'
/** A project's details page: `project-spendly`, `project-bookinghub`, and any slug an administrator publishes. */
export type ProjectPageId = `project-${string}`
/** An experiment's own page: `lab-particle-universe`, `lab-liquid-matter`... */
export type LabPageId = `lab-${LabId}`
/** A service's product page: `service-website`, `service-webapp`... */
export type ServicePageId = `service-${ServiceId}`
/** A package's own page: `package-launch`, `package-grow`... */
export type PackagePageId = `package-${PackageId}`
/** The shop's working pages and the flagship offer's two pages, under /services. */
export type ShopPageId = 'configure' | 'cart' | 'full-experience' | 'full-experience-start'
/** The privacy and cookie notice, linked from the footer. */
export type LegalPageId = 'privacy'
export type PageId = NavPageId | ProjectPageId | LabPageId | ServicePageId | PackagePageId | ShopPageId | LegalPageId | 'designSystem'

export interface PageDef<Id extends PageId = PageId> {
  id: Id
  /** Language-free path; the same in every language. */
  path: string
  /** Languages that have a translated version of this page. Always includes the default. */
  languages: readonly Language[]
  /**
   * Whether search engines should list the page. The cart and the request builder are a visitor's
   * own working state, not content: they say `noindex` and stay out of the sitemap.
   */
  indexable: boolean
}

const page = <Id extends PageId>(
  id: Id,
  path: string,
  languages: readonly Language[] = LANGUAGES,
  indexable = true,
): PageDef<Id> => ({
  id,
  path,
  languages,
  indexable,
})

/** Shown in the header and footer navigation, in this order. */
export const NAV_PAGES: readonly PageDef<NavPageId>[] = [
  page('home', '/'),
  // The portfolio: the published projects, read from the backend (src/projects/), with the website's own four as the fallback.
  page('work', '/work'),
  page('services', '/services'),
  page('about', '/about'),
  page('lab', '/lab'),
  page('contact', '/contact'),
]

/**
 * One page per project of the website's own content that has a details path (content/projects.ts): the pages that are
 * prerendered at build time. They sit under /work, are not in the navigation, and exist in every language. A project an
 * administrator publishes later has no entry here; `resolvePage` gives it one when its address is visited.
 */
export const PROJECT_PAGES: readonly PageDef<ProjectPageId>[] = projects.flatMap((project) =>
  project.detailPath ? [page<ProjectPageId>(`project-${project.id}`, project.detailPath)] : [],
)

/** The project a page shows, or `null` when the page is not a project's. */
export function projectIdOfPage(id: PageId): string | null {
  return id.startsWith('project-') ? id.slice('project-'.length) : null
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
 * The shop's pages beneath /services: one product page per service and one per package, the flagship FULL EXPERIENCE page,
 * its configurator, the request builder and the cart. They are not in the navigation (the Services page leads to them) and
 * exist in every language. The builders and the cart are a visitor's working state, so they are not indexed.
 */
export const SHOP_PAGES: readonly PageDef<ServicePageId | PackagePageId | ShopPageId>[] = [
  ...SERVICE_IDS.map((id) => page<ServicePageId>(`service-${id}`, servicePath(id))),
  ...PACKAGE_IDS.map((id) => page<PackagePageId>(`package-${id}`, packagePath(id))),
  page<ShopPageId>('full-experience', SHOP_PATHS.fullExperience),
  page<ShopPageId>('full-experience-start', SHOP_PATHS.fullExperienceStart, LANGUAGES, false),
  page<ShopPageId>('configure', SHOP_PATHS.configure, LANGUAGES, false),
  page<ShopPageId>('cart', SHOP_PATHS.cart, LANGUAGES, false),
]

/** The package a page shows, or `null` when the page is not a package's. */
export function packageIdOfPage(id: PageId): PackageId | null {
  return id.startsWith('package-') ? (id.slice('package-'.length) as PackageId) : null
}

/** The service a page shows, or `null` when the page is not a service's. */
export function serviceIdOfPage(id: PageId): ServiceId | null {
  return id.startsWith('service-') ? (id.slice('service-'.length) as ServiceId) : null
}

/** The legal pages the footer links to (config/site.ts `legal`). They are not in the navigation and exist in every language. */
export const LEGAL_PAGES: readonly PageDef<LegalPageId>[] = [page<LegalPageId>('privacy', '/privacy')]

/** Dev-only reference page; absent from production builds. */
const DEV_PAGES: readonly PageDef[] = import.meta.env.DEV ? [page('designSystem', '/design-system', LANGUAGES, false)] : []

export const PAGES: readonly PageDef[] = [...NAV_PAGES, ...SHOP_PAGES, ...PROJECT_PAGES, ...LAB_PAGES, ...LEGAL_PAGES, ...DEV_PAGES]

function normalize(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed.startsWith('/') ? trimmed || '/' : `/${trimmed}`
}

/** Finds the page for a language-free path, ignoring trailing slashes. */
export function findPage(path: string, pages: readonly PageDef[] = PAGES): PageDef | undefined {
  const wanted = normalize(path)
  return pages.find((candidate) => normalize(candidate.path) === wanted)
}

const dynamic = new Map<string, PageDef>()
const SLUG_PATH = /^\/work\/([a-z0-9][a-z0-9-]{1,59})$/
const PREVIEW_PATH = /^\/work\/preview\/(\d{1,9})$/

/**
 * The page behind an address: the registered one, or, for `/work/<slug>`, the page of a project that exists only in the
 * administration (a slug is any lowercase word; the page itself says "not found" when there is no such project), or, for
 * `/work/preview/<id>`, an administrator's preview of a project, which is never indexed. The definitions are made once, so a
 * page keeps its identity from render to render.
 */
export function resolvePage(path: string): PageDef | undefined {
  const known = findPage(path)
  if (known) return known
  const wanted = normalize(path)
  const preview = PREVIEW_PATH.exec(wanted)
  if (preview) {
    if (!dynamic.has(wanted)) dynamic.set(wanted, page<ProjectPageId>('project-preview', wanted, LANGUAGES, false))
    return dynamic.get(wanted)
  }
  const match = SLUG_PATH.exec(wanted)
  if (!match || match[1] === 'preview') return undefined
  if (!dynamic.has(wanted)) dynamic.set(wanted, page<ProjectPageId>(`project-${match[1]}`, wanted))
  return dynamic.get(wanted)
}
