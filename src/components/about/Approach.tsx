import { useId, type CSSProperties } from 'react'
import { approachLoop, approachSteps } from '../../content/about'
import { useI18n } from '../../i18n/useI18n'
import { pad } from '../../utils/format'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { aboutTone } from './rhythm'
import styles from './Approach.module.scss'

/**
 * The four principles as one chain, not four cards: each step starts where the one before it
 * stopped, joined to it by a line that steps down and across, and the last leads back to the first.
 * From `lg` the steps climb across the band; on a phone they hang from one line down the left.
 */
export function Approach() {
  const { lang, t } = useI18n()
  const titleId = useId()
  const copy = t.aboutPage.approach

  return (
    <Section id="approach" tone={aboutTone('approach')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="02" title={copy.title} description={copy.intro} />
        </Reveal>

        <div className={styles.field}>
          <ol className={styles.chain}>
            {approachSteps.map((step, position) => (
              <li key={step.id} className={styles.step} data-step={step.id} style={{ '--i': position } as CSSProperties}>
                <Reveal delay={position * 80}>
                  <span className={styles.number} aria-hidden="true">
                    {pad(position + 1)}
                  </span>
                  <h3 className={styles.word}>{step.name}</h3>
                  <p className={styles.text}>{step.text[lang]}</p>
                </Reveal>
              </li>
            ))}
          </ol>

          <p className={styles.loop}>
            <svg viewBox="0 0 24 24" width="1.5rem" height="1.5rem" aria-hidden="true" focusable="false">
              <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M18.5 3v4.2h-4.2M5.5 21v-4.2h4.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{approachLoop[lang]}</span>
          </p>
        </div>
      </Container>
    </Section>
  )
}
