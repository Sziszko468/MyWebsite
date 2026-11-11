import { LANGUAGES, type Language } from '../src/i18n/config'
import { resolveInitialLanguage, savedLanguageFromCookies, type LanguageSource } from '../src/i18n/locale'

/**
 * The decision the edge Worker takes for a request, as plain functions so it can be tested without a Worker runtime.
 *
 * The site lives under `/hu/…`, `/en/…` and `/nl/…`. Only an address that names NO language is decided here: `/` (and a path
 * typed without its language, such as `/services`). Everything else is the visitor's own explicit choice and is never touched.
 */

/** First path segments that are not pages of the website and must never be sent to a language. */
const NOT_PAGES = new Set(['admin', 'api', 'assets', 'projects', 'og', '.well-known'])

/**
 * Crawlers and link-preview fetchers. They are not redirected: they get the root document like any static file, so every language
 * stays reachable for them through the page's links, hreflang alternates and the sitemap (the country of a crawler says nothing about its readers).
 */
const CRAWLER = /(bot|crawler|spider|slurp)\b|googleother|google-inspectiontool|bingpreview|facebookexternalhit|facebot|whatsapp|embedly|mediapartners|ia_archiver|chrome-lighthouse|pagespeed/i

export interface RoutingEnv {
  /** `"1"` only in local tests: lets a request SAY which country it is from. It is never set in wrangler.jsonc. */
  SIMULATE_COUNTRY?: string
}

export type Decision =
  | { kind: 'pass'; reason: 'not-a-page' | 'has-language' | 'method' | 'crawler' }
  | { kind: 'redirect'; location: string; language: Language; source: LanguageSource }

export function isCrawler(userAgent: string | null): boolean {
  return userAgent !== null && CRAWLER.test(userAgent)
}

/** Whether an address names no language and is a page of the website (not a file, the API or the administration). */
export function namesNoLanguage(pathname: string): boolean | 'not-a-page' {
  if (pathname === '/') return true
  const segments = pathname.split('/')
  const first = segments[1] ?? ''
  if ((LANGUAGES as readonly string[]).includes(first)) return false
  if (NOT_PAGES.has(first.toLowerCase())) return 'not-a-page'
  // A file (favicon.svg, robots.txt, sitemap.xml, 404.html) has a dot in its last segment.
  if ((segments[segments.length - 1] ?? '').includes('.')) return 'not-a-page'
  return true
}

/**
 * The country, from the one source that cannot be forged by the visitor: `request.cf.country`, which Cloudflare's network
 * fills in from the connection. Request headers (including `CF-IPCountry`) are NOT read: a browser can send any header,
 * and a header is only as trustworthy as the proxy that sets it. Local tests may opt in to a simulation header.
 */
export function countryOf(request: Request, env: RoutingEnv): string | null {
  if (env.SIMULATE_COUNTRY === '1') {
    const simulated = request.headers.get('x-simulate-country')
    if (simulated !== null) return simulated
  }
  const cf = (request as Request & { cf?: { country?: unknown } }).cf
  return typeof cf?.country === 'string' ? cf.country : null
}

export function decide(request: Request, env: RoutingEnv = {}): Decision {
  if (request.method !== 'GET' && request.method !== 'HEAD') return { kind: 'pass', reason: 'method' }
  const url = new URL(request.url)
  const named = namesNoLanguage(url.pathname)
  if (named === 'not-a-page') return { kind: 'pass', reason: 'not-a-page' }
  if (named === false) return { kind: 'pass', reason: 'has-language' }
  if (isCrawler(request.headers.get('user-agent'))) return { kind: 'pass', reason: 'crawler' }

  const { language, source } = resolveInitialLanguage({
    saved: savedLanguageFromCookies(request.headers.get('cookie')),
    country: countryOf(request, env),
  })
  // The site's addresses are directories (`/hu/services/`), so a path typed without the slash goes straight there.
  const path = url.pathname === '/' ? '/' : url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  return { kind: 'redirect', location: `/${language}${path}${url.search}`, language, source }
}
