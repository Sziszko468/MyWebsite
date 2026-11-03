import { analyticsEndpoint } from '../analytics/endpointProvider'
import { contactConfig } from '../config/contact'
import { quoteConfig } from '../config/quote'
import { DEFAULT_LANGUAGE } from '../i18n/config'
import { findPage } from '../routes/pages'
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

export interface InlineHashes {
  scriptHashes: readonly string[]
  styleHashes: readonly string[]
}

export interface BuiltSite {
  files: Record<string, string>
  warnings: string[]
}

export function buildSiteFiles(template: string, hashes: InlineHashes, ctx: SeoContext = seoContextFrom()): BuiltSite {
  const files: Record<string, string> = {}
  const warnings: string[] = []

  for (const { page, lang } of allPageVersions()) {
    const directory = page.path === '/' ? lang : `${lang}${page.path}`
    files[`${directory}/index.html`] = renderPage(template, buildHead(page, lang, ctx), page)
  }

  // `/` is the default language's home page under another address: the app moves on to it, and the page
  // says so with its canonical address.
  const home = findPage('/')
  files['index.html'] = renderPage(template, buildHead(home, DEFAULT_LANGUAGE, ctx), home)
  files['404.html'] = renderPage(template, buildHead(undefined, DEFAULT_LANGUAGE, ctx), undefined)

  files['robots.txt'] = buildRobots(ctx.siteUrl)
  if (ctx.siteUrl) files['sitemap.xml'] = buildSitemap(ctx.siteUrl)
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
    connectOrigins: [...new Set([originOf(contactConfig.endpoint), originOf(quoteConfig.endpoint), originOf(analyticsEndpoint)].filter((o): o is string => o !== null))],
  })
  return { files, warnings }
}
