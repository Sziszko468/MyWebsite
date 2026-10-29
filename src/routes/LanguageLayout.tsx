import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router'
import { AppShell } from '../components/AppShell/AppShell'
import { siteConfig } from '../config/site'
import { DEFAULT_LANGUAGE, isLanguage } from '../i18n/config'
import { I18nProvider } from '../i18n/I18nProvider'
import { localizedPath, splitLanguage } from '../i18n/paths'
import { useI18n } from '../i18n/useI18n'
import { buildDocumentMeta, ogLocale } from './documentMeta'
import { findPage, type PageDef } from './pages'

/** Sets (or creates) one <meta> tag in the head. */
function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attribute, key)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

/**
 * Keeps <html lang>, the title, the description and the Open Graph tags in step with the language
 * and page. Open Graph is set from script, so it reaches crawlers that run scripts; one that reads
 * only the static HTML sees the site-wide tags in index.html.
 */
function DocumentMeta({ page }: { page: PageDef | undefined }) {
  const { lang, t } = useI18n()
  const { brandName } = siteConfig

  useEffect(() => {
    const meta = buildDocumentMeta(page, lang, t, brandName)
    document.documentElement.lang = lang
    document.title = meta.title
    setMeta('name', 'description', meta.description)
    setMeta('property', 'og:title', meta.title)
    setMeta('property', 'og:description', meta.description)
    setMeta('property', 'og:type', meta.ogType)
    setMeta('property', 'og:locale', ogLocale(lang))
    setMeta('property', 'og:site_name', brandName)
    setMeta('property', 'og:url', window.location.href)
  }, [lang, t, page, brandName])

  return null
}

/**
 * A new page starts at the top; switching language on the same page keeps the scroll position.
 * An address with a #fragment scrolls to that element once the page has rendered it (the browser
 * itself cannot, because the page is drawn by script after it has looked for the target).
 */
function ScrollToTarget({ path, hash }: { path: string; hash: string }) {
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: 'instant' })
      return
    }

    const id = decodeURIComponent(hash.slice(1))
    let frame = 0
    let attempts = 0
    const seek = () => {
      const target = document.getElementById(id)
      if (target) target.scrollIntoView({ block: 'start' })
      else if (attempts++ < 30) frame = requestAnimationFrame(seek)
    }
    seek()
    return () => cancelAnimationFrame(frame)
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
      <ScrollToTarget path={rest} hash={hash} />
      <AppShell>
        <Outlet />
      </AppShell>
    </I18nProvider>
  )
}
