import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router'
import { SiteToolbar } from '../components/SiteToolbar/SiteToolbar'
import { siteConfig } from '../config/site'
import { DEFAULT_LANGUAGE, isLanguage } from '../i18n/config'
import { I18nProvider } from '../i18n/I18nProvider'
import { localizedPath } from '../i18n/paths'
import { useI18n } from '../i18n/useI18n'
import styles from './LanguageLayout.module.scss'

/** Keeps <html lang>, the title and the description in step with the active language. */
function DocumentMeta() {
  const { lang, t } = useI18n()

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = `${siteConfig.brandName} — ${t.meta.title}`
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description)
  }, [lang, t])

  return null
}

function SkipLink() {
  const { t } = useI18n()
  return (
    <a className={styles.skipLink} href="#main">
      {t.a11y.skipToContent}
    </a>
  )
}

/** Layout for every /:lang/* route. A first segment that is not a language is treated as a default-language path. */
export function LanguageLayout() {
  const { lang } = useParams()
  const { pathname, search, hash } = useLocation()

  if (!isLanguage(lang)) {
    return <Navigate to={`${localizedPath(DEFAULT_LANGUAGE, pathname)}${search}${hash}`} replace />
  }

  return (
    <I18nProvider lang={lang}>
      <DocumentMeta />
      <SkipLink />
      <SiteToolbar />
      <main id="main" tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
    </I18nProvider>
  )
}
