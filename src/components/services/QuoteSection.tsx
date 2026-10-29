import { useId } from 'react'
import { useI18n } from '../../i18n/useI18n'
import type { QuoteDraftApi } from '../../quote/useQuoteDraft'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { QuoteForm } from './QuoteForm'
import { servicesTone } from './rhythm'
import styles from './QuoteSection.module.scss'

/**
 * The quote request band: the title and what to know on one side, the form on the other (above
 * each other on a narrow screen). The package the visitor chose above and the kind of project
 * chosen in a service block arrive here already filled in.
 */
export function QuoteSection({ quote }: { quote: QuoteDraftApi }) {
  const { t } = useI18n()
  const titleId = useId()
  const asideId = useId()
  const copy = t.servicesPage.quote

  return (
    <Section id="quote" tone={servicesTone('quote')} slant labelledBy={titleId}>
      <Container size="wide">
        <div className={styles.layout}>
          <Reveal className={styles.lead}>
            <SectionHeading id={titleId} index="03" title={copy.title} description={copy.intro} size="stacked" />
            <aside className={styles.aside} aria-labelledby={asideId}>
              <h3 id={asideId} className={styles.asideTitle}>
                {copy.aside.title}
              </h3>
              <ul>
                {copy.aside.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>
          </Reveal>

          <div className={styles.form}>
            <QuoteForm draft={quote.draft} onChange={quote.set} onReset={quote.reset} />
          </div>
        </div>
      </Container>
    </Section>
  )
}
