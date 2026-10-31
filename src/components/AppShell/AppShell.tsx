import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { VelocityIntro } from '../intro/VelocityIntro'
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

/**
 * The frame around every page of every language: skip link, header, main content, footer.
 * An `immersive` page (a Lab experiment) brings its own navigation and fills the screen, so the
 * site header and footer step aside; the skip link and the main landmark stay.
 */
export function AppShell({ children, immersive = false }: { children: ReactNode; immersive?: boolean }) {
  return (
    <div className={styles.shell} data-immersive={immersive}>
      <SkipLink />
      {!immersive && <SiteHeader />}
      <MainContent>{children}</MainContent>
      {!immersive && <SiteFooter />}
      <VelocityIntro />
    </div>
  )
}
