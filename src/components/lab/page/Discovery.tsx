import { useId } from 'react'
import { experimentPath, playableExperiments, type LabExperiment, type LabId } from '../../../content/lab'
import { Container } from '../../Container/Container'
import { LocalizedLink } from '../../LocalizedLink/LocalizedLink'
import { Reveal } from '../../motion/Reveal'
import { Section } from '../../Section/Section'
import { useLabText, useLocalized } from '../core/useLabText'
import styles from './Discovery.module.scss'
import { pageText } from './pageText'
import { Preview, PreviewHint } from './previews'

/** Where each tile sits on the wide grid. The first is the big one; the others differ in size and in the colour they lean on. */
const PLACE: Record<LabId, string> = {
  'particle-universe': 'a',
  'liquid-matter': 'b',
  'type-in-motion': 'c',
  'infinite-space': 'd',
  'chromatic-distortion': 'e',
}

function Tile({ experiment }: { experiment: LabExperiment }) {
  const t = useLocalized(pageText)
  const { lang } = useLabText()
  const titleId = useId()
  const large = PLACE[experiment.id] === 'a'

  return (
    <div className={styles.cell} data-place={PLACE[experiment.id]}>
      <Reveal className={styles.reveal}>
      <article className={styles.tile} data-cursor={t.discovery.open} data-id={experiment.id} data-accent={experiment.accent} data-large={large} aria-labelledby={titleId}>
        <div className={styles.preview}>
          <Preview id={experiment.id} />
          <span className={styles.numeral} aria-hidden="true">
            {experiment.number}
          </span>
        </div>
        <div className={styles.body}>
          <h3 id={titleId} className={styles.name}>
            {experiment.name}
          </h3>
          <p className={styles.tagline}>{experiment.tagline[lang]}</p>
          <p className={styles.hint}>
            <PreviewHint id={experiment.id} />
          </p>
          <LocalizedLink to={experimentPath(experiment.id)} className={styles.open}>
            {t.discovery.open}
            <span className="visually-hidden">: {experiment.name}</span>
            <span aria-hidden="true"> →</span>
          </LocalizedLink>
        </div>
      </article>
      </Reveal>
    </div>
  )
}

/**
 * The five experiences as a spread, not five equal cards: the first is large, the rest each
 * have their own size, their own colour and a live miniature that answers the pointer (or a finger).
 */
export function Discovery() {
  const t = useLocalized(pageText)
  const titleId = useId()
  return (
    <Section id="experiments" tone="inverse" labelledBy={titleId} className={styles.section}>
      <Container size="wide">
        <header className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {t.discovery.title}
          </h2>
          <p className={styles.intro}>{t.discovery.intro}</p>
        </header>
        <div className={styles.grid}>
          {playableExperiments.map((experiment) => (
            <Tile key={experiment.id} experiment={experiment} />
          ))}
        </div>
      </Container>
    </Section>
  )
}
