import { useId, type CSSProperties, type ReactNode } from 'react'
import { aboutProfile, localize, siteStack, type TimelineEntry } from '../../content/about'
import type { Language } from '../../i18n/config'
import { useI18n } from '../../i18n/useI18n'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { usePointerField } from '../motion/usePointerField'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import styles from './AboutMindset.module.scss'
import { homeTone } from './rhythm'

// Personal facts come only from content/about.ts and are left out while empty. In development a
// muted note shows where each block will go; production shows nothing in its place.
const SHOW_PENDING = import.meta.env.DEV

function Pending({ children }: { children: ReactNode }) {
  return <p className={styles.pending}>{children}</p>
}

function Principle({ word, position }: { word: string; position: number }) {
  const ref = usePointerField<HTMLLIElement>()
  return (
    <li ref={ref} className={styles.principle} style={{ '--step': position } as CSSProperties}>
      <span className={styles.word}>{word}</span>
    </li>
  )
}

function Timeline({ entries, lang }: { entries: readonly TimelineEntry[]; lang: Language }) {
  return (
    <ul className={styles.timeline}>
      {entries.map((entry, index) => (
        <li key={index}>
          <span className={styles.period}>{entry.period}</span>
          <strong className={styles.entryTitle}>{localize(entry.title, lang)}</strong>
          {entry.place && <span className={styles.place}>{entry.place}</span>}
          {entry.summary && <p>{localize(entry.summary, lang)}</p>}
        </li>
      ))}
    </ul>
  )
}

/**
 * The person, as an editorial spread: one statement, three words that sum up the aim (they follow
 * the pointer with a spotlight), the owner's own sentence, and the tools this site is built with.
 * A story, experience, education and skills appear only once content/about.ts has them.
 */
export function AboutMindset() {
  const { lang, t } = useI18n()
  const titleId = useId()
  const copy = t.home.about
  const { story, experience, education, skills } = aboutProfile

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

            {story.length > 0 ? (
              <div className={styles.block}>
                <h3 className={styles.blockTitle}>{copy.storyHeading}</h3>
                {story.map((paragraph, index) => (
                  <p key={index} className={styles.story}>
                    {localize(paragraph, lang)}
                  </p>
                ))}
              </div>
            ) : (
              SHOW_PENDING && <Pending>{copy.storyHeading}: src/content/about.ts</Pending>
            )}

            {experience.length > 0 ? (
              <div className={styles.block}>
                <h3 className={styles.blockTitle}>{copy.experienceHeading}</h3>
                <Timeline entries={experience} lang={lang} />
              </div>
            ) : (
              SHOW_PENDING && <Pending>{copy.experienceHeading}: src/content/about.ts</Pending>
            )}

            {education.length > 0 ? (
              <div className={styles.block}>
                <h3 className={styles.blockTitle}>{copy.educationHeading}</h3>
                <Timeline entries={education} lang={lang} />
              </div>
            ) : (
              SHOW_PENDING && <Pending>{copy.educationHeading}: src/content/about.ts</Pending>
            )}

            {skills.length > 0 ? (
              <div className={styles.block}>
                <h3 className={styles.blockTitle}>{copy.skillsHeading}</h3>
                {skills.map((group, index) => (
                  <div key={index} className={styles.skillGroup}>
                    <p className={styles.skillLabel}>{localize(group.label, lang)}</p>
                    <ul className={styles.chips}>
                      {group.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              SHOW_PENDING && <Pending>{copy.skillsHeading}: src/content/about.ts</Pending>
            )}

            <div className={styles.block}>
              <h3 className={styles.blockTitle}>{copy.stackHeading}</h3>
              <ul className={styles.chips}>
                {siteStack.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className={styles.note}>{copy.stackNote}</p>
            </div>
          </Reveal>
        </div>
      </Container>
    </Section>
  )
}
