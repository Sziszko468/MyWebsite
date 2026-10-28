import { useId, type CSSProperties, type ReactElement } from 'react'
import { experiments, type LabExperiment, type LabId } from '../../content/lab'
import { useI18n } from '../../i18n/useI18n'
import { Badge } from '../Badge/Badge'
import { Container } from '../Container/Container'
import { Reveal } from '../motion/Reveal'
import { usePointerField } from '../motion/usePointerField'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import styles from './LabSection.module.scss'
import { homeTone } from './rhythm'

/** The five easing curves drawn on the motion tile, with the timing function each dot follows. */
const EASINGS: ReadonlyArray<{ path: string; timing: string; rest: number }> = [
  { path: 'M1 19 L19 1', timing: 'linear', rest: 0.16 },
  { path: 'M1 19 C11 19 17 13 19 1', timing: 'cubic-bezier(0.4, 0, 1, 1)', rest: 0.36 },
  { path: 'M1 19 C3 7 9 1 19 1', timing: 'cubic-bezier(0, 0, 0.2, 1)', rest: 0.56 },
  { path: 'M1 19 C9 19 11 1 19 1', timing: 'cubic-bezier(0.65, 0, 0.35, 1)', rest: 0.76 },
  { path: 'M1 19 H5 V15 H9 V11 H13 V7 H17 V1 H19', timing: 'steps(6, end)', rest: 0.94 },
]

function ParticleArt() {
  return (
    <>
      <span className={styles.dotsBase} />
      <span className={styles.dotsLit} />
    </>
  )
}

function LiquidArt() {
  return (
    <>
      <span className={styles.blobOne} />
      <span className={styles.blobTwo} />
      <span className={styles.blobThree} />
    </>
  )
}

function MotionArt() {
  return (
    <div className={styles.tracks}>
      {EASINGS.map((easing, index) => (
        <div
          key={index}
          className={styles.track}
          style={{ '--rest': easing.rest, '--timing': easing.timing } as CSSProperties}
        >
          <svg className={styles.curve} viewBox="0 0 20 20" focusable="false">
            <path d={easing.path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className={styles.rail}>
            <span className={styles.runner} />
          </span>
        </div>
      ))}
    </div>
  )
}

const ART: Record<LabId, () => ReactElement> = {
  particles: ParticleArt,
  liquid: LiquidArt,
  motion: MotionArt,
}

function LabTile({ experiment }: { experiment: LabExperiment }) {
  const { t } = useI18n()
  const ref = usePointerField<HTMLElement>()
  const copy = t.home.lab.items[experiment.id]
  const Art = ART[experiment.id]
  const theme = experiment.id === 'liquid' ? 'light' : 'dark'

  return (
    <article ref={ref} className={styles.tile} data-kind={experiment.id} data-theme={theme}>
      <div className={styles.art} aria-hidden="true">
        <Art />
      </div>
      <div className={styles.copy}>
        <Badge status={experiment.status} />
        <h3 className={styles.title}>{experiment.name}</h3>
        <p className={styles.text}>{copy.text}</p>
        {experiment.demoUrl && (
          <a className={styles.demo} href={experiment.demoUrl} target="_blank" rel="noopener noreferrer">
            {t.home.work.demo}
            <span className="visually-hidden"> {t.a11y.opensInNewTab}</span>
          </a>
        )}
      </div>
    </article>
  )
}

/**
 * Three experiments as three different shapes in saturated colour, bolder than the rest of the
 * page and the same in either theme. None is built, so each says "concept" and none offers a
 * demo; the picture on each only answers the pointer.
 */
export function LabSection() {
  const { t } = useI18n()
  const titleId = useId()

  return (
    <Section id="lab" tone={homeTone('lab')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading id={titleId} index="05" size="large" title={t.home.lab.title} description={t.home.lab.intro} />
        </Reveal>

        <ul className={styles.grid}>
          {experiments.map((experiment, position) => (
            <li key={experiment.id} className={styles.item} data-kind={experiment.id}>
              <Reveal className={styles.fill} delay={position * 90}>
                <LabTile experiment={experiment} />
              </Reveal>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  )
}
