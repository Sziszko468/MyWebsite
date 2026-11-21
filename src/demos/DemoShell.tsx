import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LocalizedLink } from '../components/LocalizedLink/LocalizedLink'
import { useFullscreen } from '../components/lab/core/useFullscreen'
import { demoEntry } from '../content/demos/entry'
import { demoKinds, demoText } from '../content/demos/shell'
import type { Trilingual } from '../content/trilingual'
import { useI18n } from '../i18n/useI18n'
import { cx } from '../utils/cx'
import { fill } from '../utils/format'
import type { DemoType } from './ids'
import { demoComponent, freshDemoComponent } from './registry'
import styles from './DemoShell.module.scss'
import { missingFeatures } from './support'
import { useDemoText } from './useDemoText'

/** A demo that throws while it loads or runs must never take the page with it: the frame says so and offers a retry and the way back. */
class DemoBoundary extends Component<{ fallback: (retry: () => void) => ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('An interactive demo failed to render.', error)
  }

  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children
  }
}

function FullscreenIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d={on ? 'M8 3v5H3M17 8h-5V3M12 17v-5h5M3 12h5v5' : 'M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface DemoShellProps {
  type: DemoType
  /** The project's page slug: where "back" goes. */
  slug: string
  /** The project's name in this language. */
  projectName: string
  /** The owner's own words for how to use the demo (from the administration), or null for the built-in instructions. */
  instructions: Trilingual | null
}

/**
 * The frame of every interactive demo (PROMPT 35). It owns what must be the same for all of them, so no demo can forget it: the way back to the project,
 * the labels that say what the visitor is looking at (an interactive demonstration, simulated data, nothing saved or sent), the short instructions, the
 * account of what is real in the project and what is simulated here, a restart that mounts the demo afresh, full screen (the Lab's controller, so the
 * browser's own full screen where there is one and the same view laid over the window where there is not, with Escape and a visible button to leave),
 * and the loading, failed and unsupported states. Nothing in it traps the visitor: it is an ordinary part of the page, and the site's navigation stays
 * reachable (outside full screen, the frame's own way back is inside it).
 */
export function DemoShell({ type, slug, projectName, instructions }: DemoShellProps) {
  const { lang } = useI18n()
  const text = useDemoText(demoText)
  const kind = useDemoText(demoKinds[type])
  const names = useDemoText(demoEntry.kinds[type])
  const frameRef = useRef<HTMLDivElement | null>(null)
  const fullscreen = useFullscreen(frameRef)
  const [restart, setRestart] = useState(0)
  // A retry after a failed load needs a new lazy component: the first one stays failed.
  const [attempt, setAttempt] = useState(0)
  const [announcement, setAnnouncement] = useState('')
  const first = useRef(true)
  const Demo = useMemo(() => (attempt === 0 ? demoComponent(type) : freshDemoComponent(type)), [type, attempt])
  const missing = missingFeatures()
  const own = instructions?.[lang] ?? ''

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setAnnouncement(fullscreen.active ? text.frame.fullscreenOn : text.frame.fullscreenOff)
  }, [fullscreen.active, text.frame.fullscreenOn, text.frame.fullscreenOff])

  const back = (
    <LocalizedLink to={`/work/${slug}`} className={styles.back}>
      <span aria-hidden="true">←</span> {text.frame.back}
      <span className="visually-hidden">: {projectName}</span>
    </LocalizedLink>
  )

  if (missing.length > 0 || Demo === null) {
    return (
      <div className={styles.frame} data-demo={type}>
        <div className={styles.state} role="alert">
          <h1 className={styles.heading}>{text.states.unsupportedTitle}</h1>
          <p>{text.states.unsupportedText}</p>
          {back}
        </div>
      </div>
    )
  }

  return (
    <div ref={frameRef} className={styles.frame} data-demo={type} data-fullscreen={fullscreen.mode}>
      <header className={styles.head}>
        {back}
        <h1 className={styles.heading}>{fill(text.frame.heading, { name: projectName })}</h1>
        <p className={styles.kindName}>{names.name}</p>
        <ul className={styles.labels}>
          <li className={styles.label} data-kind="interactive">
            <span aria-hidden="true" className={styles.dot} />
            {text.labels.interactive}
          </li>
          <li className={styles.label} data-kind="simulated">
            <span aria-hidden="true" className={styles.diamond} />
            {text.labels.simulated}
          </li>
          <li className={styles.label} data-kind="isolated">
            <span aria-hidden="true" className={styles.ring} />
            {text.labels.notSaved}
          </li>
        </ul>
      </header>

      <section className={styles.how} aria-labelledby="demo-how">
        <h2 id="demo-how" className={styles.subhead}>
          {text.frame.how}
        </h2>
        <p>{kind.instructions}</p>
        {own !== '' && <p className={styles.own}>{own}</p>}
      </section>

      <details className={styles.about}>
        <summary>{text.frame.about}</summary>
        <div className={styles.columns}>
          <div>
            <h3 className={styles.listTitle}>{text.labels.real}</h3>
            <ul className={styles.list}>
              {kind.real.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className={styles.listTitle}>{text.labels.simulatedList}</h3>
            <ul className={styles.list}>
              {kind.simulated.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </details>

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.tool}
          onClick={() => {
            setRestart((value) => value + 1)
            setAnnouncement(text.frame.restarted)
          }}
        >
          {text.frame.restart}
        </button>
        <button
          type="button"
          className={cx(styles.tool, fullscreen.active && styles.toolOn)}
          aria-label={fullscreen.active ? text.frame.exitFullscreen : text.frame.fullscreen}
          data-fullscreen-mode={fullscreen.mode}
          onClick={fullscreen.toggle}
        >
          <FullscreenIcon on={fullscreen.active} />
          <span>{fullscreen.active ? text.frame.exitFullscreen : text.frame.fullscreen}</span>
        </button>
      </div>

      <div className={styles.stage} role="region" aria-label={text.frame.region} data-demo-stage>
        <DemoBoundary
          key={`${restart}-${lang}`}
          fallback={(reset) => (
            <div className={styles.state} role="alert">
              <h2 className={styles.subhead}>{text.states.errorTitle}</h2>
              <p>{text.states.errorText}</p>
              <div className={styles.stateActions}>
                <button
                  type="button"
                  className={styles.tool}
                  onClick={() => {
                    setAttempt((value) => value + 1)
                    reset()
                  }}
                >
                  {text.states.retry}
                </button>
                {back}
              </div>
            </div>
          )}
        >
          <Suspense
            fallback={
              <p className={styles.loading} role="status">
                {text.states.loading}
              </p>
            }
          >
            {/* `Demo` comes from a fixed table and is memoized: a new component exists only after a failed load, on purpose (a failed lazy component stays failed). */}
            {/* eslint-disable-next-line react/static-components */}
            <Demo />
          </Suspense>
        </DemoBoundary>
      </div>

      <p className="visually-hidden" role="status">
        {announcement}
      </p>
    </div>
  )
}
