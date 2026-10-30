import { useId } from 'react'
import { skillGroups, type SkillGroup } from '../../content/about'
import { useI18n } from '../../i18n/useI18n'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { aboutTone } from './rhythm'
import styles from './Skills.module.scss'

function Group({ group }: { group: SkillGroup }) {
  const { lang, t } = useI18n()
  const labelId = useId()

  return (
    <section className={styles.group} data-group={group.id} aria-labelledby={labelId}>
      <h3 id={labelId} className={styles.groupTitle}>
        {group.label[lang]}
      </h3>
      <ul className={styles.skills}>
        {group.skills.map((skill) => (
          <li key={skill.name} className={styles.skill}>
            <span className={styles.name}>{skill.name}</span>
            {/* A level appears only when the owner has set one; none is ever made up. */}
            {skill.level && <span className={styles.level}>{t.aboutPage.skills.levels[skill.level]}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The technologies, in the groups of content/about/skills.ts, set in type: names only, with no
 * bar, percentage, number of years or certificate. A word for how well a tool is known appears
 * beside it only when the owner has chosen one. A group with nothing in it is not drawn.
 */
export function Skills() {
  const { t } = useI18n()
  const titleId = useId()
  const copy = t.aboutPage.skills
  const groups = skillGroups.filter((group) => group.skills.length > 0)

  if (groups.length === 0) return null

  return (
    <Section id="skills" tone={aboutTone('skills')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="03" title={copy.title} description={copy.intro} />
        </Reveal>

        <div className={styles.groups}>
          {groups.map((group, position) => (
            <Reveal key={group.id} className={styles.slot} delay={(position % 2) * 90}>
              <Group group={group} />
            </Reveal>
          ))}
        </div>

        <p className={styles.note}>{copy.note}</p>
      </Container>
    </Section>
  )
}
