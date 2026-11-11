import { Suspense, useEffect, useRef } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router'
import { AppShell } from '../components/AppShell/AppShell'
import { RouteErrorBoundary } from '../components/ErrorBoundary/RouteErrorBoundary'
import { ShopFallback } from '../components/shop/ShopFallback'
import { DEFAULT_LANGUAGE, isLanguage } from '../i18n/config'
import { I18nProvider } from '../i18n/I18nProvider'
import { localizedPath, splitLanguage } from '../i18n/paths'
import { startingLanguage } from '../i18n/preference'
import { useI18n } from '../i18n/useI18n'
import { applyHead } from '../seo/apply'
import { buildHead } from '../seo/head'
import { PageTransition } from '../motion/PageTransition'
import { scopeOfPage } from '../motion/config'
import { ScrollManager } from '../motion/ScrollManager'
import { isMissingProject, useProjectsVersion } from '../projects/store'
import { labIdOfPage, projectIdOfPage, resolvePage, type PageDef } from './pages'

/**
 * Keeps <html lang> and the head (title, description, indexing rule, canonical address, language
 * alternates, Open Graph, Twitter, structured data) in step with the language and page. The build
 * already printed the same tags into each page's HTML (src/seo/); this updates them as the visitor
 * moves around, from the one function (`buildHead`) both use.
 */
function DocumentMeta({ page }: { page: PageDef | undefined }) {
  const { lang } = useI18n()
  // A project's title and description are the data's own once it has arrived: the head follows it.
  const projectsVersion = useProjectsVersion()

  useEffect(() => {
    applyHead(buildHead(page, lang))
  }, [lang, page, projectsVersion])

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
  useProjectsVersion()

  if (!isLanguage(lang)) {
    // An address without a language: the visitor's saved language, else English (the edge Worker already did this for the first request).
    return <Navigate to={`${localizedPath(startingLanguage(), pathname)}${search}${hash}`} replace />
  }

  const { rest } = splitLanguage(pathname)
  // A project the backend says does not exist is "not found", like any other unknown address (and is not indexed).
  const found = resolvePage(rest)
  const slug = found ? projectIdOfPage(found.id) : null
  const page = found && slug && slug !== 'preview' && isMissingProject(slug) ? undefined : found
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
        <RouteErrorBoundary resetKey={rest}>
          <Suspense fallback={scope === 'shop' || scope === 'checkout' ? <ShopFallback /> : <PageFallback />}>
            <PageTransition routeKey={rest} scope={scope}>
              <Outlet />
            </PageTransition>
          </Suspense>
        </RouteErrorBoundary>
      </AppShell>
    </I18nProvider>
  )
}
