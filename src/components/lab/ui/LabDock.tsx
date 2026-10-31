import type { ReactNode } from 'react'
import { experimentPath, neighbourExperiment, playableExperiments, type LabId } from '../../../content/lab'
import { LocalizedLink } from '../../LocalizedLink/LocalizedLink'
import { fill, useLabText } from '../core/useLabText'
import styles from './LabDock.module.scss'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className={styles.icon} viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/**
 * The Lab's own navigation, a slim bar that sits on the stage without covering its middle: leave
 * for the portfolio, back to all experiments, the previous and the next experiment. Real links,
 * so the browser's Back button, a new tab and a shared address all work.
 */
export function LabDock({ id }: { id: LabId }) {
  const { text } = useLabText()
  const previous = neighbourExperiment(id, -1)
  const next = neighbourExperiment(id, 1)
  const index = playableExperiments.findIndex((experiment) => experiment.id === id)
  const total = playableExperiments.length
  const position = String(index + 1).padStart(2, '0')

  return (
    <nav className={styles.dock} aria-label={text.nav.label} data-lab-ui>
      <LocalizedLink to="/" className={styles.item} aria-label={text.nav.exit}>
        <Icon>
          <path d="M3.5 9.5 10 4l6.5 5.5V16a1 1 0 0 1-1 1H12v-4.5H8V17H4.5a1 1 0 0 1-1-1V9.5Z" {...stroke} />
        </Icon>
        <span className={styles.label}>{text.nav.exitShort}</span>
      </LocalizedLink>

      <LocalizedLink to="/lab" className={styles.item} aria-label={text.nav.overview}>
        <Icon>
          <rect x="3.5" y="3.5" width="5" height="5" rx="1" {...stroke} />
          <rect x="11.5" y="3.5" width="5" height="5" rx="1" {...stroke} />
          <rect x="3.5" y="11.5" width="5" height="5" rx="1" {...stroke} />
          <rect x="11.5" y="11.5" width="5" height="5" rx="1" {...stroke} />
        </Icon>
        <span className={styles.label}>{text.nav.overviewShort}</span>
      </LocalizedLink>

      <span className={styles.rule} aria-hidden="true" />

      {previous ? (
        <LocalizedLink
          to={experimentPath(previous.id)}
          className={styles.item}
          aria-label={`${text.nav.previous}: ${previous.name}`}
          rel="prev"
        >
          <Icon>
            <path d="m12 4-6 6 6 6" {...stroke} />
          </Icon>
        </LocalizedLink>
      ) : null}

      <p className={styles.position}>
        <span aria-hidden="true">
          {position} / {String(total).padStart(2, '0')}
        </span>
        <span className="visually-hidden">{fill(text.nav.experimentOf, { current: index + 1, total })}</span>
      </p>

      {next ? (
        <LocalizedLink
          to={experimentPath(next.id)}
          className={styles.item}
          aria-label={`${text.nav.next}: ${next.name}`}
          rel="next"
        >
          <Icon>
            <path d="m8 4 6 6-6 6" {...stroke} />
          </Icon>
        </LocalizedLink>
      ) : null}
    </nav>
  )
}
