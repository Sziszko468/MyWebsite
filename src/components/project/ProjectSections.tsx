import { useId, type CSSProperties, type ReactNode } from 'react'
import type { ProjectDetail } from '../../content/projectDetails/types'
import { useI18n } from '../../i18n/useI18n'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { Section } from '../Section/Section'
import type { SectionTone } from '../Section/tone'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import { formatDate, pad } from './format'
import styles from './ProjectSections.module.scss'

// Muted notes that show where a missing piece will go: development only, nothing in production.
const SHOW_PENDING = import.meta.env.DEV

interface BandProps {
  id: string
  tone: SectionTone
  index: string
  title: string
  /** Larger title, for the band that opens with a statement. */
  large?: boolean
  children: ReactNode
}

/** One band of a project page: a themed Section with a numbered heading. */
export function Band({ id, tone, index, title, large, children }: BandProps) {
  const titleId = useId()
  return (
    <Section id={id} tone={tone} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index={index} title={title} size={large ? 'large' : 'default'} />
        </Reveal>
        {children}
      </Container>
    </Section>
  )
}

/** What it is, for whom, which problem, why, and the owner's part; then the stack in groups. */
export function Overview({ detail }: { detail: ProjectDetail }) {
  const { lang, t } = useI18n()
  const { overview, role, stack, reviewed } = detail
  const rows: Array<[label: string, text: string]> = [
    [t.project.overview.what, overview.what[lang]],
    [t.project.overview.audience, overview.audience[lang]],
    [t.project.overview.problem, overview.problem[lang]],
    [t.project.overview.goal, overview.goal[lang]],
  ]
  if (role) rows.push([t.project.overview.role, role[lang]])

  return (
    <div className={styles.overview}>
      <Reveal className={styles.overviewLead}>
        <p className={styles.lead}>{detail.summary[lang]}</p>
        <p className={styles.reviewed}>{t.project.reviewed.replace('{date}', formatDate(reviewed, lang))}</p>
      </Reveal>

      <Reveal className={styles.overviewFacts} delay={100}>
        <dl className={styles.facts}>
          {rows.map(([label, text]) => (
            <div key={label} className={styles.fact}>
              <dt>{label}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </Reveal>

      <Reveal className={styles.stack} delay={140}>
        <h3 className={styles.stackTitle}>{t.project.stackLabel}</h3>
        <dl className={styles.stackGroups}>
          {stack.map((entry) => (
            <div key={entry.group} className={styles.stackGroup}>
              <dt>{t.project.stackGroups[entry.group]}</dt>
              <dd>
                <ul>
                  {entry.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </div>
  )
}

/** Real problems, each with what was done about it and where it is written down. Alternate rows step to the right. */
export function Challenges({ detail }: { detail: ProjectDetail }) {
  const { lang, t } = useI18n()
  return (
    <ol className={styles.challenges}>
      {detail.challenges.map((challenge, position) => (
        <li key={challenge.source} className={styles.challenge} data-side={position % 2 ? 'right' : 'left'}>
          <Reveal>
            <span className={styles.numeral} aria-hidden="true">
              {pad(position + 1)}
            </span>
            <h3 className={styles.challengeTitle}>{challenge.title[lang]}</h3>
            <div className={styles.pair}>
              <div>
                <p className={styles.pairLabel}>{t.project.challenge.problem}</p>
                <p>{challenge.problem[lang]}</p>
              </div>
              <div>
                <p className={styles.pairLabel}>{t.project.challenge.solution}</p>
                <p>{challenge.solution[lang]}</p>
              </div>
            </div>
            <p className={styles.source}>
              <span>{t.project.challenge.source}</span> <code>{challenge.source}</code>
            </p>
          </Reveal>
        </li>
      ))}
    </ol>
  )
}

/** How it was built, as a short run of steps on a line. */
export function Approach({ detail }: { detail: ProjectDetail }) {
  const { lang } = useI18n()
  return (
    <ol className={styles.approach}>
      {detail.approach.map((step, position) => (
        <li key={step.title.hu} className={styles.step} style={{ '--i': position } as CSSProperties}>
          <Reveal delay={position * 70}>
            <span className={styles.stepNumber} aria-hidden="true">
              {pad(position + 1)}
            </span>
            <h3 className={styles.stepTitle}>{step.title[lang]}</h3>
            <p>{step.text[lang]}</p>
          </Reveal>
        </li>
      ))}
    </ol>
  )
}

/** The visual and usability choices that were specific to this project. */
export function Decisions({ detail }: { detail: ProjectDetail }) {
  const { lang } = useI18n()
  return (
    <ul className={styles.decisions}>
      {detail.decisions.map((decision, position) => (
        <li key={decision.title.hu} className={styles.decision}>
          <Reveal delay={(position % 2) * 90}>
            <article>
              <h3 className={styles.decisionTitle}>{decision.title[lang]}</h3>
              <p>{decision.text[lang]}</p>
            </article>
          </Reveal>
        </li>
      ))}
    </ul>
  )
}

/** The owner's own lessons (none are made up) and the possible next steps. */
export function Lessons({ detail }: { detail: ProjectDetail }) {
  const { lang, t } = useI18n()
  const { learned, next } = detail
  return (
    <div className={styles.lessons}>
      {learned.length > 0 ? (
        <Reveal className={styles.learned}>
          {learned.map((lesson) => (
            <p key={lesson.hu} className={styles.quote}>
              {lesson[lang]}
            </p>
          ))}
        </Reveal>
      ) : (
        SHOW_PENDING && <p className={styles.pending}>{t.project.learned.pending}</p>
      )}

      {next.length > 0 && (
        <Reveal className={styles.next} delay={80}>
          <h3 className={styles.nextTitle}>{t.project.learned.next}</h3>
          <ul>
            {next.map((item) => (
              <li key={item.hu}>{item[lang]}</li>
            ))}
          </ul>
        </Reveal>
      )}
    </div>
  )
}
