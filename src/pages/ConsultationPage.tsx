import { useId } from 'react'
import { BookingFlow } from '../components/consultation/BookingFlow'
import { Container } from '../components/Container/Container'
import { HeroLine, PageHero } from '../components/PageHero/PageHero'
import { Section } from '../components/Section/Section'
import { useConsultationText } from '../booking/hooks'
import styles from './ConsultationPage.module.scss'

/**
 * The consultation booking page (`/<lang>/consultation/`). The first screen says what the page is for; the band under it is the booking itself, which asks
 * the backend whether booking is open and which times are free and then walks the visitor through type, time, details and review. When booking is not
 * open, the page says so and points to the contact page: it never shows a calendar it cannot fill.
 */
export function ConsultationPage() {
  const words = useConsultationText()
  const titleId = useId()
  return (
    <>
      <PageHero
        compact
        eyebrow={words.hero.eyebrow}
        title={
          <>
            <HeroLine>{words.hero.line1}</HeroLine>
            <HeroLine accent>{words.hero.line2}</HeroLine>
          </>
        }
        lead={words.hero.lead}
        seed={4}
      />
      <Section tone="base" labelledBy={titleId}>
        <Container size="wide">
          <h2 id={titleId} className={styles.visuallyHidden}>
            {words.meta.title}
          </h2>
          <div className={styles.band}>
            <BookingFlow />
          </div>
        </Container>
      </Section>
    </>
  )
}
