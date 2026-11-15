import { useEffect, useId } from 'react'
import { BookingFlow } from '../components/consultation/BookingFlow'
import { Container } from '../components/Container/Container'
import { HeroLine, PageHero } from '../components/PageHero/PageHero'
import { Section } from '../components/Section/Section'
import { useBookingOpen, useConsultationText } from '../booking/hooks'
import { useI18n } from '../i18n/useI18n'
import { findPage } from '../routes/pages'
import { applyHead } from '../seo/apply'
import { buildHead } from '../seo/head'
import styles from './ConsultationPage.module.scss'

/**
 * The head of this page while booking is closed. The build wrote the page as indexable (it cannot know whether the owner has opened booking), and the
 * backend answers it with `X-Robots-Tag: noindex` while booking is closed; this is the same decision in the page itself, for a crawler that reads the
 * rendered page: the head of a page that is not indexable (`noindex`, no canonical address, no language alternates, no structured data). It acts only on an
 * explicit answer from the backend: while the answer is not known, or when the backend cannot be reached, the head is left as it is.
 */
function useIndexingWhileClosed(): void {
  const open = useBookingOpen()
  const { lang } = useI18n()
  useEffect(() => {
    if (open === null) return
    const page = findPage('/consultation')
    if (page) applyHead(buildHead(open ? page : { ...page, indexable: false }, lang))
  }, [open, lang])
}

/**
 * The consultation booking page (`/<lang>/consultation/`). The first screen says what the page is for; the band under it is the booking itself, which asks
 * the backend whether booking is open and which times are free and then walks the visitor through type, time, details and review. When booking is not
 * open, the page says so and points to the contact page: it never shows a calendar it cannot fill.
 */
export function ConsultationPage() {
  const words = useConsultationText()
  const titleId = useId()
  useIndexingWhileClosed()
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
