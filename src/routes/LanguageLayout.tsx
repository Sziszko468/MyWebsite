import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router'
import { AppShell } from '../components/AppShell/AppShell'
import { siteConfig } from '../config/site'
import { DEFAULT_LANGUAGE, isLanguage } from '../i18n/config'
import { I18nProvider } from '../i18n/I18nProvider'
import { localizedPath, splitLanguage } from '../i18n/paths'
import { useI18n } from '../i18n/useI18n'
import { findPage, type NavPageId, type PageDef } from './pages'

const NAV_IDS: readonly string[] = ['work', 'services', 'about', 'lab', 'contact']

/** Keeps <html lang>, the title and the description in step with the language and page. */
function DocumentMeta({ page }: { page: PageDef | undefined }) {
  const { lang, t } = useI18n()
  const { brandName } = siteConfig

  useEffect(() => {
    let title = `${brandName} — ${t.meta.title}`
    if (!page) title = `${t.notFound.title} — ${brandName}`
    else if (NAV_IDS.includes(page.id)) title = `${t.nav[page.id as NavPageId]} — ${brandName}`

    document.documentElement.lang = lang
    document.title = title
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description)
  }, [lang, t, page, brandName])

  return null
}

/** A new page starts at the top; switching language on the same page keeps the scroll position. */
function ScrollToTop({ path, hash }: { path: string; hash: string }) {
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [path, hash])
  return null
}

/**
 * Layout for every /:lang/* route. It validates the language, supplies translations and wraps
 * the page in the app shell. A first segment that is not a language is treated as a path in
 * the default language; a page without a translation redirects to its default-language version.
 */
export function LanguageLayout() {
  const { lang } = useParams()
  const { pathname, search, hash } = useLocation()

  if (!isLanguage(lang)) {
    return <Navigate to={`${localizedPath(DEFAULT_LANGUAGE, pathname)}${search}${hash}`} replace />
  }

  const { rest } = splitLanguage(pathname)
  const page = findPage(rest)

  if (page && !page.languages.includes(lang)) {
    return <Navigate to={`${localizedPath(DEFAULT_LANGUAGE, page.path)}${search}${hash}`} replace />
  }

  return (
    <I18nProvider lang={lang}>
      <DocumentMeta page={page} />
      <ScrollToTop path={rest} hash={hash} />
      <AppShell>
        <Outlet />
      </AppShell>
    </I18nProvider>
  )
}
