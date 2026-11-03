import { DEFAULT_LANGUAGE, type Language } from '../i18n/config'
import { PAGES, type PageDef } from '../routes/pages'
import { escapeText } from './html'
import { seoPath } from './paths'

/**
 * The XML sitemap and robots.txt. Only pages that ask to be indexed are listed, each version with
 * the full set of its language alternates (and `x-default`), so a crawler that finds one language
 * finds all of them. Both need the published address; without one there is nothing valid to write.
 */

const loc = (siteUrl: string, lang: Language, page: PageDef) => `${siteUrl}${seoPath(lang, page.path)}`

export function buildSitemap(siteUrl: string, pages: readonly PageDef[] = PAGES): string {
  const entries = pages
    .filter((page) => page.indexable)
    .flatMap((page) =>
      page.languages.map((lang) => {
        const fallback = page.languages.includes(DEFAULT_LANGUAGE) ? DEFAULT_LANGUAGE : page.languages[0]
        const links = [
          ...page.languages.map((code) => ({ hreflang: code as string, href: loc(siteUrl, code, page) })),
          { hreflang: 'x-default', href: loc(siteUrl, fallback, page) },
        ]
          .map((link) => `    <xhtml:link rel="alternate" hreflang="${link.hreflang}" href="${escapeText(link.href)}"/>`)
          .join('\n')
        return `  <url>\n    <loc>${escapeText(loc(siteUrl, lang, page))}</loc>\n${links}\n  </url>`
      }),
    )
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n')
}

/**
 * robots.txt. Everything may be crawled: the pages that must not be listed (the cart, the request
 * builder, the 404 page) say so with `noindex`, which a crawler can only read if it is allowed to
 * fetch them. The sitemap line appears once the address is known.
 */
export function buildRobots(siteUrl: string | null): string {
  const lines = ['User-agent: *', 'Allow: /']
  if (siteUrl) lines.push('', `Sitemap: ${siteUrl}/sitemap.xml`)
  return `${lines.join('\n')}\n`
}
