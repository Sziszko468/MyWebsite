import { useId, type CSSProperties } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useAboutContent } from '../../profile/store'
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
  // The owner's own words once they saved a profile in the administration (every text in all three languages), else the website's own.
  const about = useAboutContent()
  if (about.title[lang] === '' && about.paragraphs.length === 0) return null

  return (
    <Section id="story" tone={aboutTone('story')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="01" size="large" title={about.title[lang]} />
        </Reveal>

        <div className={styles.layout}>
          <Reveal className={styles.paragraphs}>
            {about.paragraphs.map((paragraph, position) => (
              <p key={position}>{paragraph[lang]}</p>
            ))}
          </Reveal>

          {about.thought[lang] !== '' && (
            <Reveal className={styles.thoughtSlot} delay={100}>
              <p className={styles.thought}>{about.thought[lang]}</p>
            </Reveal>
          )}
        </div>

        {about.strengths.length > 0 && (
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
            {about.strengths.map((skill, position) => (
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
        )}
      </Container>
    </Section>
  )
}
