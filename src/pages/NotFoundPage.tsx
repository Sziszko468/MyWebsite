import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { SectionHeading } from '../components/SectionHeading/SectionHeading'
import { useI18n } from '../i18n/useI18n'
import styles from './Page.module.scss'

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
      </Container>
    </div>
  )
}
