import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { SectionHeading } from '../components/SectionHeading/SectionHeading'
import { useI18n } from '../i18n/useI18n'
import { NAV_PAGES, type NavPageId } from '../routes/pages'
import styles from './Page.module.scss'

/** Stand-in for a page that is not built yet: a real, translated destination, not a dead link. */
export function PlaceholderPage({ pageId }: { pageId: NavPageId }) {
  const { t } = useI18n()
  const position = NAV_PAGES.findIndex((page) => page.id === pageId)

  return (
    <div className={styles.page}>
      <Container>
        <SectionHeading
          level={1}
          index={String(position).padStart(2, '0')}
          title={t.nav[pageId]}
          description={t.placeholder.description}
        />
        <p className={styles.actions}>
          <Button to="/" variant="secondary" arrow>
            {t.common.backHome}
          </Button>
        </p>
      </Container>
    </div>
  )
}
