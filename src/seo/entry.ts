import { analyticsEndpoint } from '../analytics/endpointProvider'
import { API_BASE } from '../config/api'
import { contactConfig } from '../config/contact'
import { quoteConfig } from '../config/quote'
import { DEFAULT_LANGUAGE } from '../i18n/config'
import { parseCard, parseCategories } from '../projects/api'
import { primeProjects } from '../projects/store'
import type { ProjectCard } from '../projects/types'
import { PAGES, PROJECT_PAGES, findPage, resolvePage, type PageDef } from '../routes/pages'
import { buildHeadersFile, originOf } from '../security/headers'
import { allPageVersions, buildHead, seoContextFrom, type SeoContext } from './head'
import { renderPage } from './html'
import { buildRobots, buildSitemap } from './sitemap'

/**
 * What the build writes besides the application itself, as `path -> content` (paths relative to
 * `dist/`). It runs once, after `vite build`, from scripts/prerender.mjs; nothing here ships to the browser.
 *
 * - one HTML file for every page in every language (`hu/services/index.html`), the built page shell
 *   with that page's own head, so a crawler or a link preview that does not run script still finds the
 *   title, description, canonical address, language alternates, Open Graph tags and structured data;
 * - the shell for `/` (which the app sends on to the default language) and a `404.html`;
 * - `sitemap.xml` and `robots.txt`, and the `_headers` file.
 */

// The projects the backend had published when `npm run catalog:pull` was last run (git-ignored). Read only here, by the build:
// the browser's bundle never contains it (it asks the backend at run time).
const pulledFiles = import.meta.glob<unknown>('../content/projects.generated.json', { eager: true, import: 'default' })
export const pulledProjects: unknown = Object.values(pulledFiles)[0] ?? null

/** The cards in a pulled document, or `null` when there is no such document (then the website's own four projects are what is built). */
export function pulledCards(pulled: unknown): { cards: ProjectCard[]; categories: ReturnType<typeof parseCategories> } | null {
  if (typeof pulled !== 'object' || pulled === null || !Array.isArray((pulled as { projects?: unknown }).projects)) return null
  const document = pulled as { projects: unknown[]; categories?: unknown }
  return { cards: document.projects.map(parseCard).filter((card): card is ProjectCard => card !== null), categories: parseCategories(document.categories) }
}

/**
 * The pages to write. Without pulled projects: the registry, as it always was. With them, **the backend's answer is the truth**:
 * a project of the website's own that the backend does not publish (or publishes without a page of its own) gets no file and no
 * sitemap entry, and a project that exists only in the administration, and has a page, gets one in every language, under its own
 * address, with its own title and description.
 */
export function pagesForBuild(pulled: unknown = pulledProjects): readonly PageDef[] {
  const found = pulledCards(pulled)
  if (!found) return PAGES
  const wanted = new Set(found.cards.filter((card) => card.detailPath !== null).map((card) => `/work/${card.slug}`))
  const ownProjects = new Set<PageDef>(PROJECT_PAGES)
  const kept = PAGES.filter((page) => !ownProjects.has(page) || wanted.has(page.path))
  const added = [...wanted].flatMap((path) => {
    const page = resolvePage(path)
    return page && !kept.includes(page) ? [page] : []
  })
  return [...kept, ...added]
}

export interface InlineHashes {
  scriptHashes: readonly string[]
  styleHashes: readonly string[]
}

export interface BuiltSite {
  files: Record<string, string>
  warnings: string[]
}

export function buildSiteFiles(template: string, hashes: InlineHashes, ctx: SeoContext = seoContextFrom(), pulled: unknown = pulledProjects): BuiltSite {
  const files: Record<string, string> = {}
  const warnings: string[] = []

  // A project's head is written from the card the backend published (runtimeProject reads the store).
  const found = pulledCards(pulled)
  if (found) primeProjects(found.cards, found.categories)
  const pages = pagesForBuild(pulled)

  for (const { page, lang } of allPageVersions(pages)) {
    const directory = page.path === '/' ? lang : `${lang}${page.path}`
    files[`${directory}/index.html`] = renderPage(template, buildHead(page, lang, ctx), page)
  }

  // `/` is the default language's home page under another address: the app moves on to it, and the page
  // says so with its canonical address.
  const home = findPage('/')
  files['index.html'] = renderPage(template, buildHead(home, DEFAULT_LANGUAGE, ctx), home)
  files['404.html'] = renderPage(template, buildHead(undefined, DEFAULT_LANGUAGE, ctx), undefined)

  files['robots.txt'] = buildRobots(ctx.siteUrl)
  if (ctx.siteUrl) files['sitemap.xml'] = buildSitemap(ctx.siteUrl, pages)
  else {
    warnings.push(
      'VITE_SITE_URL is not set: every page says "noindex, nofollow", and no canonical address, hreflang, Open Graph address, structured data, sitemap.xml or Sitemap line was written. Set it to the published origin (for example https://example.com) when building for production.',
    )
  }
  if (!ctx.brandIsSet) {
    warnings.push('The brand name in src/config/site.ts is still the placeholder, so structured data does not describe a person or a website by it.')
  }

  files._headers = buildHeadersFile({
    ...hashes,
    // The backend's own origin too: the assistant and the catalogue talk to it even when a form handler of another kind is configured.
    connectOrigins: [...new Set([originOf(API_BASE), originOf(contactConfig.endpoint), originOf(quoteConfig.endpoint), originOf(analyticsEndpoint)].filter((o): o is string => o !== null))],
  })
  return { files, warnings }
}
