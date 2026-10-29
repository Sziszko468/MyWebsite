import { useId, type CSSProperties } from 'react'
import { processNote, processSteps } from '../../content/services/process'
import { useI18n } from '../../i18n/useI18n'
import { pad } from '../../utils/format'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { servicesTone } from './rhythm'
import styles from './Process.module.scss'

/**
 * "How we work together": the five steps from the first conversation to handover, climbing from
 * left to right on a wide screen and stacked on a phone. Below them the page's one statement about
 * deadlines and results, which promises none.
 */
export function Process() {
  const { lang, t } = useI18n()
  const titleId = useId()
  const copy = t.servicesPage.process

  return (
    <Section id="process" tone={servicesTone('process')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="04" title={copy.title} description={copy.intro} />
        </Reveal>

        <ol className={styles.steps}>
          {processSteps.map((step, position) => (
            <li key={step.title.hu} className={styles.step} style={{ '--i': position } as CSSProperties}>
              <Reveal delay={position * 70}>
                <span className={styles.number} aria-hidden="true">
                  {pad(position + 1)}
                </span>
                <h3 className={styles.title}>{step.title[lang]}</h3>
                <p className={styles.text}>{step.text[lang]}</p>
              </Reveal>
            </li>
          ))}
        </ol>

        <p className={styles.note}>{processNote[lang]}</p>
      </Container>
    </Section>
  )
}
