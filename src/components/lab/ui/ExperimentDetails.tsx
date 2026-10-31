import { useId } from 'react'
import { experimentPath, findExperiment, neighbourExperiment, type LabId } from '../../../content/lab'
import { Container } from '../../Container/Container'
import { LocalizedLink } from '../../LocalizedLink/LocalizedLink'
import { useLabText } from '../core/useLabText'
import styles from './ExperimentDetails.module.scss'
import { LabStatusBadge } from './LabStatusBadge'

/**
 * Everything about an experiment that the stage does not say in pixels, as plain, selectable text:
 * what it is, how it is built, how to interact with it and what its state is. It is also the
 * complete experience for a visitor who chose the still view or cannot use WebGL.
 */
export function ExperimentDetails({ id }: { id: LabId }) {
  const { lang, text, experiments } = useLabText()
  const titleId = useId()
  const experiment = findExperiment(id)
  const copy = experiments[id]
  const previous = neighbourExperiment(id, -1)
  const next = neighbourExperiment(id, 1)
  if (!experiment) return null

  return (
    <section id="details" className={styles.details} aria-labelledby={titleId}>
      <Container size="wide">
        <div className={styles.grid}>
          <header className={styles.intro}>
            <p className={styles.eyebrow}>
              {text.nav.lab} / {experiment.number}
            </p>
            <h2 id={titleId} className={styles.title}>
              {text.details.title}
            </h2>
            <p className={styles.tagline}>{experiment.tagline[lang]}</p>
            <p className={styles.description}>{copy.description}</p>
            <p className={styles.keyboard}>{text.details.keyboard}</p>
          </header>

          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>{text.gallery.status}</dt>
              <dd>
                <LabStatusBadge status={experiment.status} />
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>{text.gallery.technology}</dt>
              <dd>
                <ul className={styles.tags}>
                  {experiment.tech.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>{text.gallery.interaction}</dt>
              <dd>
                <ul className={styles.list}>
                  {copy.interactions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </div>

        <nav className={styles.more} aria-label={text.details.more}>
          {previous && (
            <LocalizedLink to={experimentPath(previous.id)} className={styles.moreLink} rel="prev">
              <span className={styles.moreHint}>{text.nav.previous}</span>
              <span className={styles.moreName}>
                <span className={styles.moreNumber}>{previous.number}</span> {previous.name}
              </span>
            </LocalizedLink>
          )}
          <LocalizedLink to="/lab" className={styles.moreLink}>
            <span className={styles.moreHint}>{text.nav.lab}</span>
            <span className={styles.moreName}>{text.nav.overview}</span>
          </LocalizedLink>
          {next && (
            <LocalizedLink to={experimentPath(next.id)} className={styles.moreLink} rel="next">
              <span className={styles.moreHint}>{text.nav.next}</span>
              <span className={styles.moreName}>
                <span className={styles.moreNumber}>{next.number}</span> {next.name}
              </span>
            </LocalizedLink>
          )}
        </nav>
      </Container>
    </section>
  )
}
