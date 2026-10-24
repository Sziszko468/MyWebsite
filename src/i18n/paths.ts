import { isLanguage, type Language } from './config'

/** '/' stays '/hu/'; everything else is '/hu/path' (no trailing slash). */
export function localizedPath(lang: Language, path = '/'): string {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '')
  return clean ? `/${lang}/${clean}` : `/${lang}/`
}

/** Splits '/en/design-system' into its language and the language-free remainder. */
export function splitLanguage(pathname: string): { lang: Language | null; rest: string } {
  const [, first = '', ...tail] = pathname.split('/')
  if (isLanguage(first)) return { lang: first, rest: `/${tail.join('/')}` }
  return { lang: null, rest: pathname.startsWith('/') ? pathname : `/${pathname}` }
}

/** Same page, other language. Search and hash are appended by the caller. */
export function switchLanguagePath(pathname: string, next: Language): string {
  return localizedPath(next, splitLanguage(pathname).rest)
}
