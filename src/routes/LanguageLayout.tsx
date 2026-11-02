import { Suspense, useEffect, useRef } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router'
import { AppShell } from '../components/AppShell/AppShell'
import { ShopFallback } from '../components/shop/ShopFallback'
import { siteConfig } from '../config/site'
import { DEFAULT_LANGUAGE, isLanguage } from '../i18n/config'
import { I18nProvider } from '../i18n/I18nProvider'
import { localizedPath, splitLanguage } from '../i18n/paths'
import { useI18n } from '../i18n/useI18n'
import { buildDocumentMeta, ogLocale } from './documentMeta'
import { PageTransition } from '../motion/PageTransition'
import { scopeOfPage } from '../motion/config'
import { ScrollManager } from '../motion/ScrollManager'
import { findPage, labIdOfPage, type PageDef } from './pages'

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
 * A short, quiet dip in the page's opacity when the language changes, so the swap of every word reads
 * as one deliberate change rather than a flicker. It is a CSS animation on <main> started by an
 * attribute on <html> (styles/motion.css) and removed again at once; it moves nothing and shifts
 * nothing, and reduced motion drops it.
 */
function LanguageSwitchCue({ lang }: { lang: string }) {
  const previous = useRef(lang)
  useEffect(() => {
    if (previous.current === lang) return
    previous.current = lang
    const root = document.documentElement
    root.dataset.langSwitch = ''
    const timer = window.setTimeout(() => delete root.dataset.langSwitch, 320)
    return () => {
      window.clearTimeout(timer)
      delete root.dataset.langSwitch
    }
  }, [lang])
  return null
}

/**
 * What a page's code shows when a visit starts on it, before it has arrived: a screen tall, so the footer
 * is below the fold and does not jump when the page replaces it (the layout matrix found
 * a shift of about 0.2 with a shorter one).
 */
const PageFallback = () => <div style={{ minHeight: '100svh' }} aria-hidden="true" />

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
  const scope = scopeOfPage(page?.id)

  if (page && !page.languages.includes(lang)) {
    return <Navigate to={`${localizedPath(DEFAULT_LANGUAGE, page.path)}${search}${hash}`} replace />
  }

  return (
    <I18nProvider lang={lang}>
      <DocumentMeta page={page} />
      <ScrollManager path={rest} hash={hash} />
      <LanguageSwitchCue lang={lang} />
      <AppShell immersive={page ? labIdOfPage(page.id) !== null : false} motionScope={scope}>
        {/*
          One boundary for every lazy page, mounted for the whole visit and above the page's own key. The
          router navigates in a React transition, so while the next page's code is on its way the current
          page stays on screen (the loading bar says so after a moment) and the swap happens once it can
          be drawn; the fallback appears only when a visit starts on a page that has not arrived.
        */}
        <Suspense fallback={scope === 'shop' || scope === 'checkout' ? <ShopFallback /> : <PageFallback />}>
          <PageTransition routeKey={rest} scope={scope}>
            <Outlet />
          </PageTransition>
        </Suspense>
      </AppShell>
    </I18nProvider>
  )
}
