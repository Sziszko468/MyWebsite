import { useId } from 'react'
import { activeFocusTopics } from '../../content/about'
import { useI18n } from '../../i18n/useI18n'
import { pad } from '../../utils/format'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { aboutTone } from './rhythm'
import styles from './Focus.module.scss'

/**
 * What the owner is working on now, from content/about/focus.ts: only the topics marked active,
 * each a title in large type and one sentence about the direction. Nothing here says a topic has
 * been mastered; a plan or something still being learned is not shown as experience. With no
 * active topic the band is left out.
 */
export function Focus() {
  const { lang, t } = useI18n()
  const titleId = useId()
  const copy = t.aboutPage.focus

  if (activeFocusTopics.length === 0) return null

  return (
    <Section id="focus" tone={aboutTone('focus')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="04" title={copy.title} description={copy.intro} />
        </Reveal>

        <ol className={styles.list}>
          {activeFocusTopics.map((topic, position) => (
            <li key={topic.id} className={styles.item}>
              <Reveal>
                <div className={styles.row}>
                  <span className={styles.number} aria-hidden="true">
                    {pad(position + 1)}
                  </span>
                  <h3 className={styles.title}>{topic.title[lang]}</h3>
                  <p className={styles.text}>{topic.text[lang]}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  )
}
