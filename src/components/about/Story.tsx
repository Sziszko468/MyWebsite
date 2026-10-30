import { useId, type CSSProperties } from 'react'
import { storyParagraphs, storyThought, storyTitle, transferableSkills } from '../../content/about'
import { useI18n } from '../../i18n/useI18n'
import { pad } from '../../utils/format'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { aboutTone } from './rhythm'
import styles from './Story.module.scss'

/**
 * The personal story: the working title across the band, the paragraphs and the closing thought
 * from content/about/story.ts, and under them the seven skills that carried over from logistics
 * into development, set between the two fields they connect. Nothing in it names an employer, a
 * period or a result.
 */
export function Story() {
  const { lang, t } = useI18n()
  const titleId = useId()
  const copy = t.aboutPage.story

  return (
    <Section id="story" tone={aboutTone('story')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="01" size="large" title={storyTitle[lang]} />
        </Reveal>

        <div className={styles.layout}>
          <Reveal className={styles.paragraphs}>
            {storyParagraphs.map((paragraph) => (
              <p key={paragraph.hu}>{paragraph[lang]}</p>
            ))}
          </Reveal>

          <Reveal className={styles.thoughtSlot} delay={100}>
            <p className={styles.thought}>{storyThought[lang]}</p>
          </Reveal>
        </div>

        <div className={styles.bridge}>
          <Reveal>
            <h3 className={styles.bridgeTitle}>{copy.skillsTitle}</h3>
            <p className={styles.bridgeIntro}>{copy.skillsIntro}</p>
            <p className={styles.ends} aria-hidden="true">
              <span>{copy.fromLabel}</span>
              <span className={styles.endsLine} />
              <span>{copy.toLabel}</span>
            </p>
          </Reveal>

          <ul className={styles.skills}>
            {transferableSkills.map((skill, position) => (
              <li key={skill.id} className={styles.skill} style={{ '--i': position } as CSSProperties}>
                <Reveal delay={(position % 2) * 80}>
                  <span className={styles.number} aria-hidden="true">
                    {pad(position + 1)}
                  </span>
                  <h4 className={styles.skillName}>{skill.name[lang]}</h4>
                  <p className={styles.skillText}>{skill.text[lang]}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  )
}
