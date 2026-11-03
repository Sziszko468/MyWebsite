import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { LocalizedLink } from '../components/LocalizedLink/LocalizedLink'
import { SectionHeading } from '../components/SectionHeading/SectionHeading'
import { useI18n } from '../i18n/useI18n'
import { NAV_PAGES } from '../routes/pages'
import styles from './Page.module.scss'

/**
 * The page for an address that does not exist. It is told to search engines as `noindex` (routes/
 * LanguageLayout.tsx, src/seo/), and gives the visitor somewhere to go: the main pages, not only home.
 */
export function NotFoundPage() {
  const { t } = useI18n()

  return (
    <div className={styles.page}>
      <Container>
        <SectionHeading level={1} index="404" title={t.notFound.title} description={t.notFound.description} />
        <p className={styles.actions}>
          <Button to="/" arrow>
            {t.common.backHome}
          </Button>
        </p>
        <nav className={styles.actions} aria-label={t.notFound.suggestions}>
          <p>{t.notFound.suggestions}</p>
          <ul>
            {NAV_PAGES.filter((page) => page.id !== 'home').map((page) => (
              <li key={page.id}>
                <LocalizedLink to={page.path}>{t.nav[page.id]}</LocalizedLink>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </div>
  )
}
