import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { VelocityHero } from '../components/hero/VelocityHero'
import { SectionHeading } from '../components/SectionHeading/SectionHeading'
import { siteConfig } from '../config/site'
import { useI18n } from '../i18n/useI18n'
import styles from './Page.module.scss'

/** The Hero, then a placeholder for the sections that are still to be built. */
export function HomePage() {
  const { t } = useI18n()

  return (
    <>
      <VelocityHero />
      <div className={styles.page}>
        <Container>
          <SectionHeading index="01" title={siteConfig.brandName} description={t.home.underConstruction} />
          {import.meta.env.DEV && (
            <p className={styles.actions}>
              <Button to="/design-system" variant="secondary" arrow>
                Design system
              </Button>
            </p>
          )}
        </Container>
      </div>
    </>
  )
}
