import { siteConfig } from '../../config/site'
import { Container } from '../Container/Container'
import { LanguageSwitcher } from '../LanguageSwitcher/LanguageSwitcher'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { ThemeToggle } from '../ThemeToggle/ThemeToggle'
import styles from './SiteToolbar.module.scss'

/** Interim chrome that hosts the global switches until the real navigation exists. */
export function SiteToolbar() {
  return (
    <header className={styles.toolbar}>
      <Container className={styles.inner}>
        <LocalizedLink to="/" className={styles.brand}>
          {siteConfig.brandName}
        </LocalizedLink>
        <div className={styles.controls}>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </Container>
    </header>
  )
}
