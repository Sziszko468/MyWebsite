import { useId } from 'react'
import { Container } from '../../Container/Container'
import { Reveal } from '../../motion/Reveal'
import { Section } from '../../Section/Section'
import { useLocalized } from '../core/useLabText'
import { eggText } from '../easter/eggText'
import styles from './Philosophy.module.scss'
import { pageText } from './pageText'

/** Why the Lab exists, in six short principles, and the faint hint about the page's secret. */
export function Philosophy() {
  const t = useLocalized(pageText)
  const egg = useLocalized(eggText)
  const titleId = useId()
  return (
    <Section id="why" tone="inverse" labelledBy={titleId} className={styles.section}>
      <Container size="wide">
        <header className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {t.philosophy.title}
          </h2>
          <p className={styles.intro}>{t.philosophy.intro}</p>
        </header>
        <ol className={styles.list}>
          {t.philosophy.items.map((item, index) => (
            <li key={item.name}>
              <Reveal delay={index * 50}>
                <span className={styles.number} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className={styles.name}>{item.name}</h3>
                <p className={styles.text}>{item.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
        <p className={styles.hint}>{egg.hint}</p>
      </Container>
    </Section>
  )
}
