import type { IncomingHttpHeaders } from 'node:http'
import { LANGUAGES, type Language } from '../../config.ts'
import type { Reply } from '../../http/reply.ts'

/**
 * The starting language of a visitor who opened an address WITHOUT a language (`/`, or a page typed without `/hu`, `/en`, `/nl`), decided
 * here when the website is served by this process (STATIC_DIR) and the operator has opted in with `COUNTRY_HEADER` (PROMPT 20).
 *
 * It is the same rule as the edge Worker's (worker/routing.ts; `test/contract.test.ts` compares the two decision by decision):
 *   1. a language in the address is the visitor's own choice and is never touched;
 *   2. the language saved by choosing one with the switcher (the cookie `cc_lang`);
 *   3. the language of the visitor's country, read from ONE header the operator names (`CF-IPCountry` behind Cloudflare): Hungary,
 *      Hungarian; the Netherlands, Dutch;
 *   4. English.
 * Crawlers are not redirected (every language stays reachable for them through the page's links and the sitemap). Nothing is stored,
 * logged or passed on: the answer is just the address the visitor is sent to.
 *
 * About trust: the header is trustworthy only because Cloudflare sets it on the way in. A client that reaches this process directly can
 * send any value, and all it can change is the language IT is sent to: that is why this is a language default and nothing else, and why it
 * is off unless `COUNTRY_HEADER` is set. Without the setting `/` is served as before.
 */

const COOKIE = 'cc_lang'
const COUNTRY_LANGUAGES: Readonly<Record<string, Language>> = { HU: 'hu', NL: 'nl' }
/** First path segments that are not pages of the website (the site's own files, the API, the administration, the pictures). */
const NOT_PAGES = new Set(['admin', 'api', 'assets', 'projects', 'og', 'media', '.well-known'])
const CRAWLER = /(bot|crawler|spider|slurp)\b|googleother|google-inspectiontool|bingpreview|facebookexternalhit|facebot|whatsapp|embedly|mediapartners|ia_archiver|chrome-lighthouse|pagespeed/i

/** A header name an operator may configure: letters, digits and hyphens. */
export const isHeaderName = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/.test(value)

const isLanguage = (value: unknown): value is Language => typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)

export function savedLanguage(cookies: string | null | undefined): Language | null {
  if (!cookies) return null
  for (const part of cookies.split(';')) {
    const index = part.indexOf('=')
    if (index < 0 || part.slice(0, index).trim() !== COOKIE) continue
    const value = part.slice(index + 1).trim()
    return isLanguage(value) ? value : null
  }
  return null
}

/** The language of a country given as a two-letter code; anything else (missing, `XX`, `T1`, a made-up value) is English. */
export function languageOfCountry(country: unknown): Language {
  if (typeof country !== 'string') return 'en'
  const code = country.trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? (COUNTRY_LANGUAGES[code] ?? 'en') : 'en'
}

/** Whether an address names no language and is a page of the website (not a file, the API, the administration or a picture). */
export function namesNoLanguage(pathname: string): boolean {
  if (pathname === '/') return true
  const segments = pathname.split('/')
  const first = segments[1] ?? ''
  if (isLanguage(first)) return false
  if (NOT_PAGES.has(first.toLowerCase())) return false
  // A file (favicon.svg, robots.txt, sitemap.xml, 404.html) has a dot in its last segment.
  return !(segments[segments.length - 1] ?? '').includes('.')
}

export interface LanguageRedirectInput {
  /** `COUNTRY_HEADER`: the name of the one header the country is read from; `null` switches the whole thing off. */
  countryHeader: string | null
  method: string
  pathname: string
  search: string
  headers: IncomingHttpHeaders
}

/** The redirect to the visitor's language, or `null` when the address should be served as it is. */
export function languageRedirect(input: LanguageRedirectInput): Reply | null {
  if (input.countryHeader === null) return null
  if (input.method !== 'GET' && input.method !== 'HEAD') return null
  if (!namesNoLanguage(input.pathname)) return null
  const agent = input.headers['user-agent']
  if (typeof agent === 'string' && CRAWLER.test(agent)) return null

  const cookie = input.headers.cookie
  const country = input.headers[input.countryHeader.toLowerCase()]
  const language = savedLanguage(typeof cookie === 'string' ? cookie : null) ?? languageOfCountry(Array.isArray(country) ? country[0] : country)
  // The site's addresses are directories (`/hu/services/`), so a path typed without the slash goes straight there.
  const path = input.pathname === '/' ? '/' : input.pathname.endsWith('/') ? input.pathname : `${input.pathname}/`
  return {
    status: 302,
    headers: {
      Location: `/${language}${path}${input.search}`,
      // The answer depends on a cookie and the connection: nothing may keep it, and nothing may show it to another visitor.
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
    },
    body: '',
  }
}
