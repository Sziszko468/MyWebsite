import { useId, useMemo, useState, type ReactNode } from 'react'
import { experimentPath, findExperiment, neighbourExperiment, type LabId } from '../../../content/lab'
import { LanguageSwitcher } from '../../LanguageSwitcher/LanguageSwitcher'
import { LocalizedLink } from '../../LocalizedLink/LocalizedLink'
import { ThemeToggle } from '../../ThemeToggle/ThemeToggle'
import { Button } from '../../Button/Button'
import { QUALITY_OPTIONS, qualityOfTier, type LabQuality } from '../core/quality'
import { useLabText } from '../core/useLabText'
import { useLabView } from '../core/useLabView'
import { ExperimentDetails } from '../ui/ExperimentDetails'
import { ExperienceContext } from './context'
import styles from './ExperienceFrame.module.scss'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  )
}

interface ExperienceFrameProps {
  id: LabId
  /** The application: its stage and panels. It fills the area under the bar. */
  children: ReactNode
  /** Extra things in the bar, after the title (a status, a save indicator). */
  barExtra?: ReactNode
}

/**
 * The page of one experience: a slim bar of its own (leave, all experiments, previous, next, the
 * title, the settings) over an application that fills the rest of the screen, then the plain-text
 * details. The bar is the only chrome the experiences share; each application lays out its own
 * toolbars and panels under it, so none of them looks like another's dashboard.
 *
 * If WebGL 2 is missing, or a stage failed for good, the application is replaced by a clear
 * message and a way back to the rest of the Lab: never a black screen.
 */
export function ExperienceFrame({ id, children, barExtra }: ExperienceFrameProps) {
  const { lang, text } = useLabText()
  // An experience has no Live/Calm/Still switch: a visitor's earlier choice on another page must not trap it.
  const view = useLabView({ respectPreference: false })
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const experiment = findExperiment(id)
  const previous = neighbourExperiment(id, -1)
  const next = neighbourExperiment(id, 1)
  const value = useMemo(() => ({ id, view }), [id, view])
  if (!experiment) return null

  const failed = view.view === 'still'
  const qualityNow = qualityOfTier(view.tier)
  const qualityLabel = (quality: LabQuality) =>
    quality === 'auto' ? text.experience.quality.auto : text.experience.quality[quality]

  return (
    <>
      <div className={styles.frame} data-experience={id} data-view={view.view} data-lab-tier={view.tier}>
        <header className={styles.bar}>
          <nav className={styles.links} aria-label={text.nav.label}>
            <LocalizedLink to="/" className={styles.icon} aria-label={text.nav.exit}>
              <Icon>
                <path d="M3.5 9.5 10 4l6.5 5.5V16a1 1 0 0 1-1 1H12v-4.5H8V17H4.5a1 1 0 0 1-1-1V9.5Z" />
              </Icon>
            </LocalizedLink>
            <LocalizedLink to="/lab" className={styles.icon} aria-label={text.nav.overview}>
              <Icon>
                <rect x="3.5" y="3.5" width="5" height="5" rx="1" />
                <rect x="11.5" y="3.5" width="5" height="5" rx="1" />
                <rect x="3.5" y="11.5" width="5" height="5" rx="1" />
                <rect x="11.5" y="11.5" width="5" height="5" rx="1" />
              </Icon>
            </LocalizedLink>
          </nav>

          <h1 className={styles.title}>
            <span className={styles.number}>{experiment.number}</span> {experiment.name}
          </h1>
          {barExtra && <div className={styles.extra}>{barExtra}</div>}

          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon>
              <circle cx="4.5" cy="10" r="1" />
              <circle cx="10" cy="10" r="1" />
              <circle cx="15.5" cy="10" r="1" />
            </Icon>
            <span className="visually-hidden">{text.experience.menu}</span>
          </button>

          <div id={menuId} className={styles.settings} data-open={menuOpen}>
            <div className={styles.step}>
              {previous && (
                <LocalizedLink
                  to={experimentPath(previous.id)}
                  className={styles.icon}
                  aria-label={`${text.nav.previous}: ${previous.name}`}
                  rel="prev"
                >
                  <Icon>
                    <path d="m12 4-6 6 6 6" />
                  </Icon>
                </LocalizedLink>
              )}
              {next && (
                <LocalizedLink
                  to={experimentPath(next.id)}
                  className={styles.icon}
                  aria-label={`${text.nav.next}: ${next.name}`}
                  rel="next"
                >
                  <Icon>
                    <path d="m8 4 6 6-6 6" />
                  </Icon>
                </LocalizedLink>
              )}
            </div>
            <label className={styles.quality}>
              <span className={styles.qualityLabel}>{text.experience.qualityLabel}</span>
              <select
                value={view.quality}
                onChange={(event) => view.setQuality(event.currentTarget.value as LabQuality)}
              >
                {QUALITY_OPTIONS.map((quality) => (
                  <option key={quality} value={quality}>
                    {qualityLabel(quality)}
                    {quality === 'auto' ? ` → ${qualityLabel(qualityNow)}` : ''}
                  </option>
                ))}
              </select>
              <span className={styles.qualityNote}>{text.experience.qualityHelp}</span>
            </label>
            <div className={styles.switches}>
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
            <a className={styles.detailsLink} href="#details">
              {text.nav.details} ↓
            </a>
          </div>
        </header>

        <div className={styles.app}>
          <ExperienceContext.Provider value={value}>
            {failed ? (
              <section className={styles.fallback} aria-labelledby={`${menuId}-fb`}>
                <h2 id={`${menuId}-fb`}>
                  {view.reason === 'failed' ? text.experience.failedTitle : text.experience.noWebglTitle}
                </h2>
                <p>{view.reason === 'failed' ? text.experience.failedText : text.experience.noWebglText}</p>
                <div className={styles.fallbackActions}>
                  {view.reason === 'failed' && (
                    <Button variant="primary" onClick={() => view.setQuality('performance')}>
                      {text.experience.retry}
                    </Button>
                  )}
                  <Button to="/lab" variant="secondary" arrow>
                    {text.experience.backToLab}
                  </Button>
                </div>
                <p className={styles.fallbackHelp} lang={lang}>
                  {experiment.tagline[lang]}
                </p>
              </section>
            ) : (
              children
            )}
          </ExperienceContext.Provider>
        </div>
      </div>

      <ExperimentDetails id={id} />
    </>
  )
}
