import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { BrandMark } from '../BrandMark/BrandMark'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { LanguageSwitcher } from '../LanguageSwitcher/LanguageSwitcher'
import { MainNav } from '../MainNav/MainNav'
import { MobileMenu } from '../MobileMenu/MobileMenu'
import { ThemeToggle } from '../ThemeToggle/ThemeToggle'
import styles from './SiteHeader.module.scss'
import { useScrolled } from './useScrolled'

/**
 * Sticky site header. From the `nav` breakpoint: brand left, navigation centred, switches and
 * CTA right. Below it: brand and a menu button; everything else lives in the menu dialog.
 * It stays transparent at the top and gains a translucent background and hairline on scroll.
 */
export function SiteHeader() {
  const { t } = useI18n()
  const scrolled = useScrolled()

  return (
    <header className={cx(styles.header, scrolled && styles.scrolled)}>
      <Container className={styles.inner}>
        <BrandMark collapseName />

        <div className={styles.nav}>
          <MainNav variant="bar" />
        </div>

        <div className={styles.actions}>
          <ThemeToggle />
          <LanguageSwitcher />
          <Button to="/contact" size="sm">
            {t.cta.startProject}
          </Button>
        </div>

        <MobileMenu />
      </Container>
    </header>
  )
}
