import { useId, type ReactElement } from 'react'
import { experimentPath, findExperiment, type LabId } from '../../content/lab'
import { useI18n } from '../../i18n/useI18n'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { LabStatusBadge } from '../lab/ui/LabStatusBadge'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { Reveal } from '../motion/Reveal'
import { usePointerField } from '../motion/usePointerField'
import { Section } from '../Section/Section'
import { SectionHeading } from '../SectionHeading/SectionHeading'
import styles from './LabSection.module.scss'
import { homeTone } from './rhythm'

/** The three experiments sampled here, and the shape each tile gives them; the Lab itself holds all of them. */
const FEATURED: ReadonlyArray<{ id: LabId; kind: 'particles' | 'liquid' | 'motion' }> = [
  { id: 'particle-universe', kind: 'particles' },
  { id: 'liquid-matter', kind: 'liquid' },
  { id: 'type-in-motion', kind: 'motion' },
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

/** Type that stretches towards the pointer: the variable font's width axis follows it. */
function TypeArt() {
  return (
    <div className={styles.type}>
      <span className={styles.typeLine}>Create</span>
      <span className={`${styles.typeLine} ${styles.typeSolid}`}>Without</span>
      <span className={styles.typeLine}>Limits.</span>
    </div>
  )
}

const ART: Record<'particles' | 'liquid' | 'motion', () => ReactElement> = {
  particles: ParticleArt,
  liquid: LiquidArt,
  motion: TypeArt,
}

function LabTile({ id, kind }: { id: LabId; kind: 'particles' | 'liquid' | 'motion' }) {
  const { lang, t } = useI18n()
  const ref = usePointerField<HTMLElement>()
  const experiment = findExperiment(id)
  const Art = ART[kind]
  const theme = kind === 'liquid' ? 'light' : 'dark'
  if (!experiment) return null

  return (
    <article ref={ref} className={styles.tile} data-kind={kind} data-theme={theme}>
      <div className={styles.art} aria-hidden="true">
        <Art />
      </div>
      <div className={styles.copy}>
        <LabStatusBadge status={experiment.status} />
        <h3 className={styles.title}>{experiment.name}</h3>
        <p className={styles.text}>{experiment.tagline[lang]}</p>
        <LocalizedLink to={experimentPath(id)} className={styles.demo}>
          {t.home.lab.open}
          <span className="visually-hidden">: {experiment.name}</span>
        </LocalizedLink>
      </div>
    </article>
  )
}

/**
 * Three of the Lab's experiments as three different shapes in saturated colour, bolder than the
 * rest of the page and the same in either theme. Each opens its own page; the button under them
 * enters the Lab, where all six are. The picture on each only answers the pointer.
 */
export function LabSection() {
  const { t } = useI18n()
  const titleId = useId()

  return (
    <Section id="lab" tone={homeTone('lab')} slant labelledBy={titleId}>
      <Container size="wide">
        <Reveal>
          <SectionHeading
            id={titleId}
            index="05"
            size="large"
            title={t.home.lab.title}
            description={t.home.lab.intro}
          />
        </Reveal>

        <ul className={styles.grid}>
          {FEATURED.map(({ id, kind }, position) => (
            <li key={id} className={styles.item} data-kind={kind}>
              <Reveal className={styles.fill} delay={position * 90}>
                <LabTile id={id} kind={kind} />
              </Reveal>
            </li>
          ))}
        </ul>

        <p className={styles.enter}>
          <Button to="/lab" size="lg" arrow>
            {t.home.lab.enter}
          </Button>
        </p>
      </Container>
    </Section>
  )
}
