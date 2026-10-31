import { useId, type CSSProperties } from 'react'
import { experimentPath, experiments, isPlayable, type LabExperiment } from '../../../content/lab'
import { Container } from '../../Container/Container'
import { LocalizedLink } from '../../LocalizedLink/LocalizedLink'
import { Reveal } from '../../motion/Reveal'
import { usePointerField } from '../../motion/usePointerField'
import { Section } from '../../Section/Section'
import { useLabText } from '../core/useLabText'
import { LabArt } from '../ui/LabArt'
import { LabStatusBadge } from '../ui/LabStatusBadge'
import styles from './ExperimentGallery.module.scss'

/**
 * How each entry sits in the 12-column grid, by position, so a new experiment gets a layout
 * without being configured: the artwork and the words swap sides, the artwork changes shape and
 * the entry drops or rises, and the pattern repeats every four.
 */
const LAYOUT = [
  { art: '1 / span 7', copy: '9 / span 4', ratio: '4 / 3', drop: 0 },
  { art: '6 / span 7', copy: '1 / span 4', ratio: '16 / 10', drop: 1 },
  { art: '2 / span 6', copy: '9 / span 4', ratio: '1 / 1', drop: 0 },
  { art: '5 / span 8', copy: '1 / span 4', ratio: '16 / 9', drop: 1 },
] as const

function Entry({ experiment, position }: { experiment: LabExperiment; position: number }) {
  const { lang, text, experiments: words } = useLabText()
  const ref = usePointerField<HTMLElement>()
  const copy = words[experiment.id]
  const place = LAYOUT[position % LAYOUT.length]
  const playable = isPlayable(experiment)
  const titleId = useId()

  return (
    <li
      id={`experiment-${experiment.number}`}
      className={styles.item}
      data-accent={experiment.accent}
      data-drop={place.drop}
      style={
        {
          '--art-column': place.art,
          '--copy-column': place.copy,
          '--art-ratio': place.ratio,
        } as CSSProperties
      }
    >
      <Reveal className={styles.reveal}>
        <article ref={ref} className={styles.entry} aria-labelledby={titleId} data-playable={playable}>
          <div className={styles.art} aria-hidden="true">
            <LabArt id={experiment.id} />
            <span className={styles.numeral}>{experiment.number}</span>
          </div>

          <div className={styles.copy}>
            <div className={styles.meta}>
              <span className={styles.number} aria-hidden="true">
                {experiment.number}
              </span>
              <LabStatusBadge status={experiment.status} />
            </div>

            <h3 id={titleId} className={styles.name}>
              {experiment.name}
            </h3>
            <p className={styles.tagline}>{experiment.tagline[lang]}</p>
            <p className={styles.description}>{copy.description}</p>

            <dl className={styles.facts}>
              <div>
                <dt>{text.gallery.technology}</dt>
                <dd>
                  <ul className={styles.tags}>
                    {experiment.tech.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div>
                <dt>{text.gallery.interaction}</dt>
                <dd>
                  <ul className={styles.moves}>
                    {copy.interactions.slice(0, 2).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>

            {playable ? (
              <LocalizedLink to={experimentPath(experiment.id)} className={styles.open}>
                {text.gallery.open}
                <span className="visually-hidden">: {experiment.name}</span>
                <svg className={styles.arrow} viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true">
                  <path d="M2 8h11m0 0L8.5 3.5M13 8l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
                </svg>
              </LocalizedLink>
            ) : (
              <p className={styles.noPage}>{text.gallery.noPage}</p>
            )}
          </div>
        </article>
      </Reveal>
    </li>
  )
}

/**
 * The experiments as a magazine spread rather than a grid of equal cards: each entry pairs an
 * artwork with its words, the sides and proportions change from one entry to the next, and every
 * one carries its number, name, short description, technology, ways to interact, state and the way
 * into the full experiment. It is built from the Lab's list, so a new experiment appears in it
 * with no layout work; one that is not ready is listed with its honest status and no link.
 */
export function ExperimentGallery() {
  const { text } = useLabText()
  const titleId = useId()
  const experiencesId = useId()
  // The short pieces first, then the four applications, each group laid out from its own start.
  const pieces = experiments.filter((experiment) => experiment.kind === 'experiment')
  const full = experiments.filter((experiment) => experiment.kind === 'experience')

  return (
    <Section id="experiments" tone="dark" labelledBy={titleId} className={styles.section}>
      <Container size="wide">
        <header className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {text.gallery.title}
          </h2>
          <p className={styles.intro}>{text.gallery.intro}</p>
        </header>

        <nav aria-label={text.gallery.listLabel} className={styles.index}>
          <ol>
            {experiments.map((experiment) => (
              <li key={experiment.id}>
                {isPlayable(experiment) ? (
                  <LocalizedLink to={experimentPath(experiment.id)} className={styles.indexLink}>
                    <span className={styles.indexNumber}>{experiment.number}</span>
                    {experiment.name}
                  </LocalizedLink>
                ) : (
                  <span className={styles.indexLink} data-off>
                    <span className={styles.indexNumber}>{experiment.number}</span>
                    {experiment.name}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <ol className={styles.list}>
          {pieces.map((experiment, position) => (
            <Entry key={experiment.id} experiment={experiment} position={position} />
          ))}
        </ol>

        {full.length > 0 && (
          <>
            <header className={`${styles.head} ${styles.headSecond}`}>
              <h2 id={experiencesId} className={styles.subtitle}>
                {text.gallery.experiencesTitle}
              </h2>
              <p className={styles.intro}>{text.gallery.experiencesIntro}</p>
            </header>
            <ol className={styles.list} aria-labelledby={experiencesId}>
              {full.map((experiment, position) => (
                <Entry key={experiment.id} experiment={experiment} position={position} />
              ))}
            </ol>
          </>
        )}
      </Container>
    </Section>
  )
}
