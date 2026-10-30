import { useId, type CSSProperties } from 'react'
import { siteStack } from '../../content/about'
import { useI18n } from '../../i18n/useI18n'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { usePointerField } from '../motion/usePointerField'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import styles from './AboutMindset.module.scss'
import { homeTone } from './rhythm'

function Principle({ word, position }: { word: string; position: number }) {
  const ref = usePointerField<HTMLLIElement>()
  return (
    <li ref={ref} className={styles.principle} style={{ '--step': position } as CSSProperties}>
      <span className={styles.word}>{word}</span>
    </li>
  )
}

/**
 * The person, as an editorial spread: one statement, three words that sum up the aim (they follow
 * the pointer with a spotlight), the owner's own sentence, the tools this site is built with and the
 * way to the About page, where the story, the way of working and the skills are.
 */
export function AboutMindset() {
  const { t } = useI18n()
  const titleId = useId()
  const copy = t.home.about

  return (
    <Section id="about" tone={homeTone('about')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="04" size="large" title={copy.title} />
        </Reveal>

        <div className={styles.layout}>
          <Reveal className={styles.principlesSlot}>
            <ol className={styles.principles} aria-label={copy.principlesLabel}>
              {copy.principles.map((word, position) => (
                <Principle key={word} word={word} position={position} />
              ))}
            </ol>
          </Reveal>

          <Reveal className={styles.aside} delay={100}>
            <p className={styles.statement}>{copy.text}</p>

            <div className={styles.block}>
              <h3 className={styles.blockTitle}>{copy.stackHeading}</h3>
              <ul className={styles.chips}>
                {siteStack.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className={styles.note}>{copy.stackNote}</p>
            </div>

            <div>
              <Button to="/about" variant="secondary" arrow>
                {copy.more}
              </Button>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
