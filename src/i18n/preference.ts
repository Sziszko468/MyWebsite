import type { Language } from './config'
import { DEFAULT_LANGUAGE } from './config'
import { languageCookie, savedLanguageFromCookies } from './locale'

/**
 * The visitor's saved language, in the browser. The visitor writes it by choosing a language with the switcher
 * (never by merely opening a page) and the edge Worker (worker/) reads the same cookie before it decides where `/` goes,
 * which is why the choice is kept in a cookie and not in the page's own storage. Every access is guarded: a browser that blocks cookies simply has
 * no saved language, and the address still decides the language of the page.
 */

export function readSavedLanguage(): Language | null {
  try {
    return typeof document === 'undefined' ? null : savedLanguageFromCookies(document.cookie)
  } catch {
    return null
  }
}

export function saveLanguage(language: Language): void {
  try {
    document.cookie = languageCookie(language, { secure: location.protocol === 'https:' })
  } catch {
    // Cookies are blocked: nothing to remember, and nothing is lost.
  }
}

/**
 * The language to open when an address names none (`/`, or a path without a language): the saved choice, else English.
 * The country is not known in the browser (and is never asked for): at the edge it was already used for `/`.
 */
export function startingLanguage(): Language {
  return readSavedLanguage() ?? DEFAULT_LANGUAGE
}
