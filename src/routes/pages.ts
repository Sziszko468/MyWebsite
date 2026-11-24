import { experimentPath, playableExperiments, type LabId } from '../content/lab'
import { DEMO_SLUGS, demoPath } from '../demos/ids'
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
/** A project's interactive demo (PROMPT 35): `demo-spendly`, `demo-bookinghub`, and the slug of any project an administrator switches a registered demo on for. */
export type DemoPageId = `demo-${string}`
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
/** CONTROL ROOM AI: the assistant's own page. */
export type AiPageId = 'control-room'
/** The Design System Playground (PROMPT 36): a tool of the Lab at `/lab/design-system`. Its id does not start with `lab-`, because those are the experiments' pages. */
export type PlaygroundPageId = 'design-playground'
/** The customer's private pages (PROMPT 17): a quotation and a request's status. Each is reached only through a secret in its address. */
export type CustomerPageId = 'customer-quote' | 'customer-request'
/** The consultation booking (PROMPT 24): the public page, and the customer's own booking page behind a secret link. */
export type ConsultationPageId = 'consultation' | 'customer-booking'
/** The client portal (PROMPT 25): one private page for every address below `/client-portal`. */
export type PortalPageId = 'client-portal'
export type PageId = PortalPageId | NavPageId | ProjectPageId | DemoPageId | LabPageId | ServicePageId | PackagePageId | ShopPageId | LegalPageId | AiPageId | CustomerPageId | ConsultationPageId | PlaygroundPageId | 'designSystem'

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
 * One page per project that has a demo type that suits it (src/demos/ids.ts), at `/work/<slug>/demo`. The page is a workspace on invented sample data, not
 * content: it is not indexed and not in the sitemap (the project's own page is), it says so to crawlers, and it exists in every language. A project an
 * administrator publishes later gets its demo page through `resolvePage`, the same way its project page does.
 */
export const DEMO_PAGES: readonly PageDef<DemoPageId>[] = DEMO_SLUGS.map((slug) => page<DemoPageId>(`demo-${slug}`, demoPath(slug), LANGUAGES, false))

/** The project a demo page belongs to, or `null` when the page is not a demo's. */
export function demoSlugOfPage(id: PageId): string | null {
  return id.startsWith('demo-') ? id.slice('demo-'.length) : null
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

/**
 * The Design System Playground: a tool in the Lab's ecosystem, NOT a seventh experience (the Lab has exactly six, and this page is in none of their lists). It is indexable,
 * exists in every language, is in no menu, and the Lab's overview links to it from a band of its own.
 */
export const PLAYGROUND_PAGES: readonly PageDef<PlaygroundPageId>[] = [page<PlaygroundPageId>('design-playground', '/lab/design-system')]

/** The legal pages the footer links to (config/site.ts `legal`). They are not in the navigation and exist in every language. */
export const LEGAL_PAGES: readonly PageDef<LegalPageId>[] = [page<LegalPageId>('privacy', '/privacy')]

/** The assistant's page: indexable, exists in every language (its content is the visitor's own conversation, drawn by the browser). */
export const AI_PAGES: readonly PageDef<AiPageId>[] = [page<AiPageId>('control-room', '/control-room')]

/**
 * The customer's private pages. Their address is `/quote/<secret>` and `/request/<secret>`; the registered path is the bare `/quote` and `/request`
 * (a quiet "this link is incomplete" page, prerendered as a noindex shell). They exist in every language, are never indexed, and are in no menu.
 */
export const CUSTOMER_PAGES: readonly PageDef<CustomerPageId>[] = [
  page<CustomerPageId>('customer-quote', '/quote', LANGUAGES, false),
  page<CustomerPageId>('customer-request', '/request', LANGUAGES, false),
]

/**
 * The consultation page, and the customer's booking page. The booking page's registered path is the bare `/consultation/booking` (a quiet "this link is
 * incomplete" page, prerendered as a noindex shell); the address with the secret after it is resolved to it. Neither is in a menu: the footer and the
 * calls to action on the shop and contact pages lead to the first, and only while booking is open.
 */
export const CONSULTATION_PAGES: readonly PageDef<ConsultationPageId>[] = [
  page<ConsultationPageId>('consultation', '/consultation'),
  page<ConsultationPageId>('customer-booking', '/consultation/booking', LANGUAGES, false),
]

/**
 * The client portal: a signed-in customer's own workspace. The build ships ONE quiet shell for it (registered at `/client-portal`, prerendered like the customer's
 * other private pages) and every address below it, a project or the page a sign-in link opens, is that same shell; the application asks the server who is signed in.
 * It exists in every language, is never indexed and is in no menu.
 */
export const PORTAL_PAGES: readonly PageDef<PortalPageId>[] = [page<PortalPageId>('client-portal', '/client-portal', LANGUAGES, false)]

/**
 * Whether a page is a customer's private page: it is reached only through a secret in its address (a quotation, a request's status, a consultation booking) or behind
 * a sign-in (the client portal). Such a page is told to crawlers as `noindex, nofollow` (not just "do not list it"): nothing on it is for a search engine to read or follow.
 */
export const isPrivatePage = (page: PageDef | undefined): boolean => page !== undefined && (page.id === 'customer-quote' || page.id === 'customer-request' || page.id === 'customer-booking' || page.id === 'client-portal')

/** The secret part of a customer page's address: 256 random bits as base64url are 43 characters; a little room either way. */
const CUSTOMER_PATH = /^\/(quote|request|consultation\/booking)\/[A-Za-z0-9_-]{20,64}$/
/** Every address below the client portal is the portal's one page (a project, an account page, the page a sign-in link opens). */
const PORTAL_PATH = /^\/client-portal\/[A-Za-z0-9_\-/]+$/

/** Dev-only reference page; absent from production builds. */
const DEV_PAGES: readonly PageDef[] = import.meta.env.DEV ? [page('designSystem', '/design-system', LANGUAGES, false)] : []

export const PAGES: readonly PageDef[] = [...NAV_PAGES, ...SHOP_PAGES, ...PROJECT_PAGES, ...DEMO_PAGES, ...LAB_PAGES, ...PLAYGROUND_PAGES, ...AI_PAGES, ...LEGAL_PAGES, ...CUSTOMER_PAGES, ...CONSULTATION_PAGES, ...PORTAL_PAGES, ...DEV_PAGES]

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
/** A project's demo: `/work/<slug>/demo`. The page itself says "not found" when the project has no demo. */
const DEMO_PATH = /^\/work\/([a-z0-9][a-z0-9-]{1,59})\/demo$/
/** A preview link (PROMPT 22): 256 random bits as base64url are 43 characters; a little room either way. The secret is not part of the page's identity. */
const PREVIEW_LINK_PATH = /^\/work\/preview\/link\/[A-Za-z0-9_-]{20,64}$/
const LINK_PREVIEW_PAGE = page<ProjectPageId>('project-preview', '/work/preview/link', LANGUAGES, false)

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
  // A customer's private page: the page is the registered one, whatever the secret in the address is.
  const customer = CUSTOMER_PATH.exec(wanted)
  if (customer) return findPage(`/${customer[1]}`)
  if (PORTAL_PATH.test(wanted)) return findPage('/client-portal')
  if (PREVIEW_LINK_PATH.test(wanted)) return LINK_PREVIEW_PAGE
  const preview = PREVIEW_PATH.exec(wanted)
  if (preview) {
    if (!dynamic.has(wanted)) dynamic.set(wanted, page<ProjectPageId>('project-preview', wanted, LANGUAGES, false))
    return dynamic.get(wanted)
  }
  const demo = DEMO_PATH.exec(wanted)
  if (demo && demo[1] !== 'preview') {
    if (!dynamic.has(wanted)) dynamic.set(wanted, page<DemoPageId>(`demo-${demo[1]}`, wanted, LANGUAGES, false))
    return dynamic.get(wanted)
  }
  const match = SLUG_PATH.exec(wanted)
  if (!match || match[1] === 'preview') return undefined
  if (!dynamic.has(wanted)) dynamic.set(wanted, page<ProjectPageId>(`project-${match[1]}`, wanted))
  return dynamic.get(wanted)
}
