import type { Language } from '../i18n/config'
import { localizedPath, splitLanguage } from '../i18n/paths'
import { PAGES, findPage, resolvePage, type PageDef } from './pages'

export interface LanguageTarget {
  /** Path in the target language, without search or hash. */
  path: string
  /** `false` when the current page has no version in that language and the home page is offered instead. */
  samePage: boolean
}

/**
 * Where the language switcher should send the visitor: the same page in the other language
 * when it exists there. A page that is unknown or not yet translated falls back to the home
 * page of that language, never to a path that would not resolve.
 */
export function resolveLanguageSwitch(
  pathname: string,
  next: Language,
  pages: readonly PageDef[] = PAGES,
): LanguageTarget {
  const rest = splitLanguage(pathname).rest
  // The registered pages, and (on the real registry) a project the administration published: a project is in every language.
  const page = pages === PAGES ? resolvePage(rest) : findPage(rest, pages)
  if (page?.languages.includes(next)) {
    // A customer's private page keeps the secret in its address: the same page, the same link, another language.
    const keepsAddress = page.id === 'customer-quote' || page.id === 'customer-request'
    return { path: localizedPath(next, keepsAddress ? rest : page.path), samePage: true }
  }
  return { path: localizedPath(next), samePage: false }
}
