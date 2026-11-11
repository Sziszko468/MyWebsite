import { DEFAULT_LANGUAGE, LANGUAGES, type Language } from './config'

/**
 * Which language a visitor starts in, decided in this order (PROMPT 18):
 *
 *   1. the language the visitor picked in the address they opened (`/hu/…`, `/en/…`, `/nl/…`): decided by the route, not here;
 *   2. the language the visitor saved by choosing one with the language switcher (a small first-party cookie);
 *   3. the language of the visitor's country: Hungary -> Hungarian, the Netherlands -> Dutch;
 *   4. English, for every other country and whenever the country is not known.
 *
 * This file is the one place where the rule is written. It has no dependencies and touches neither the browser nor
 * the network, so the same code runs in the edge Worker (worker/), in the browser (i18n/preference.ts) and in tests.
 * The country is never read here: callers hand over a two-letter code that trusted infrastructure produced.
 */

/** The only countries that start in a language other than English. Everything else is English on purpose. */
export const COUNTRY_LANGUAGES: Readonly<Record<string, Language>> = { HU: 'hu', NL: 'nl' }

/** The name of the cookie that remembers a manual choice. It holds one of the three language codes and nothing else. */
export const LANGUAGE_COOKIE = 'cc_lang'

/** How long a manual choice is remembered: one year. A new choice starts the year again. */
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * The language of a country, from its ISO 3166-1 alpha-2 code. Anything that is not such a code (a missing value,
 * "XX" for an unknown country, "T1" for Tor, a made-up string) is English.
 */
export function languageForCountry(country: unknown): Language {
  if (typeof country !== 'string') return DEFAULT_LANGUAGE
  const code = country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return DEFAULT_LANGUAGE
  return COUNTRY_LANGUAGES[code] ?? DEFAULT_LANGUAGE
}

/** `true` for exactly the three language codes (a stored value is never trusted before it passes this). */
export function isSavedLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/** The saved language in the text of a `Cookie` header (a browser's cookie string reads the same), or `null` when there is none or it is not a language. */
export function savedLanguageFromCookies(cookies: string | null | undefined): Language | null {
  if (!cookies) return null
  for (const part of cookies.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() !== LANGUAGE_COOKIE) continue
    const value = part.slice(index + 1).trim()
    return isSavedLanguage(value) ? value : null
  }
  return null
}

/** Where the starting language came from, for the tests and the documentation. */
export type LanguageSource = 'saved' | 'country' | 'fallback'

export interface InitialLanguage {
  language: Language
  source: LanguageSource
}

/**
 * The starting language when the address names none: a saved choice first, then the country, then English.
 * A saved value that is not one of the three languages counts as no saved value.
 */
export function resolveInitialLanguage(input: { saved?: unknown; country?: unknown }): InitialLanguage {
  if (isSavedLanguage(input.saved)) return { language: input.saved, source: 'saved' }
  const language = languageForCountry(input.country)
  const known = typeof input.country === 'string' && COUNTRY_LANGUAGES[input.country.trim().toUpperCase()] !== undefined
  return { language, source: known ? 'country' : 'fallback' }
}

/**
 * The text of the cookie that remembers a manual choice, ready to be written by the browser or by a server.
 * First-party, `SameSite=Lax`, the whole site, one year; `Secure` on HTTPS. It holds the language code and nothing about the visitor.
 */
export function languageCookie(language: Language, options: { secure: boolean }): string {
  return `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=${LANGUAGE_COOKIE_MAX_AGE}; SameSite=Lax${options.secure ? '; Secure' : ''}`
}
