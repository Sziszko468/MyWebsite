import { useBookingOpen, useConsultationText } from '../../booking/hooks'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import styles from './Consultation.module.scss'

/**
 * A way to the booking page, offered only while booking is open (the backend says so; until it has, and whenever it cannot be asked, nothing is shown):
 * a link to a page that says "not available" is worse than no link. `band` is a quiet strip with a sentence and a button, for the end of a page;
 * `link` is just the button's text, for the footer.
 */
export function ConsultationCta({ variant = 'band' }: { variant?: 'band' | 'link' }) {
  const open = useBookingOpen()
  const words = useConsultationText()
  if (!open) return null
  if (variant === 'link') {
    return (
      <Button to="/consultation" variant="text" arrow>
        {words.cta.label}
      </Button>
    )
  }
  return (
    <div className={styles.ctaBand}>
      <Container size="wide">
        <div className={styles.ctaInner}>
          <p className={styles.ctaLead}>{words.cta.lead}</p>
          <Button to="/consultation" variant="secondary" arrow>
            {words.cta.label}
          </Button>
        </div>
      </Container>
    </div>
  )
}
