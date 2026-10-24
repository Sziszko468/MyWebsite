import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { MainContent } from '../MainContent/MainContent'
import { SiteFooter } from '../SiteFooter/SiteFooter'
import { SiteHeader } from '../SiteHeader/SiteHeader'
import styles from './AppShell.module.scss'

function SkipLink() {
  const { t } = useI18n()
  return (
    <a className={styles.skipLink} href="#main">
      {t.a11y.skipToContent}
    </a>
  )
}

/** The frame around every page of every language: skip link, header, main content, footer. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <SkipLink />
      <SiteHeader />
      <MainContent>{children}</MainContent>
      <SiteFooter />
    </div>
  )
}
