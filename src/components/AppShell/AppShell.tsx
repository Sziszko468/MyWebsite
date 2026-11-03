import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import type { MotionScope } from '../../motion/config'
import { ConsentBanner } from '../Consent/ConsentBanner'
import { CursorLabel } from '../motion/CursorLabel'
import { LoadingBar } from '../motion/Loading'
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
 * site header and footer step aside; the skip link and the main landmark stay. `motionScope` says how
 * strongly the page moves (motion/config.ts): the shell carries it as `data-motion-scope`, and the
 * motion tokens in tokens.css do the rest.
 */
export function AppShell({ children, immersive = false, motionScope = 'site' }: { children: ReactNode; immersive?: boolean; motionScope?: MotionScope }) {
  return (
    <div className={styles.shell} data-immersive={immersive} data-motion-scope={motionScope}>
      <SkipLink />
      <LoadingBar />
      {!immersive && <SiteHeader />}
      <MainContent>{children}</MainContent>
      {!immersive && <SiteFooter />}
      <VelocityIntro />
      <ConsentBanner />
      <CursorLabel />
    </div>
  )
}
