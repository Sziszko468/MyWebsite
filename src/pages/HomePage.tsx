import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { SectionHeading } from '../components/SectionHeading/SectionHeading'
import { siteConfig } from '../config/site'
import { useI18n } from '../i18n/useI18n'
import styles from './Page.module.scss'

/** Placeholder until the Home sections are built. */
export function HomePage() {
  const { t } = useI18n()

  return (
    <Container>
      <SectionHeading level={1} index="00" title={siteConfig.brandName} description={t.home.underConstruction} />
      {import.meta.env.DEV && (
        <p className={styles.actions}>
          <Button to="/design-system" variant="secondary" arrow>
            Design system
          </Button>
        </p>
      )}
    </Container>
  )
}
