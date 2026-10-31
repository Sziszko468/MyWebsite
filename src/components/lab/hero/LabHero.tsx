import { lazy, useEffect, useId, useRef, type CSSProperties } from 'react'
import { useTouchFirst } from '../../hero/capabilities'
import { Button } from '../../Button/Button'
import { Container } from '../../Container/Container'
import { LabStage } from '../core/LabStage'
import { useLabText } from '../core/useLabText'
import { useLabView } from '../core/useLabView'
import { LabChoice } from '../ui/LabControls'
import type { LabView } from '../core/labMode'
import styles from './LabHero.module.scss'
import type { HeroLayout } from './LabHeroScene'

// The scene (Three.js and its shaders) is its own chunk: the headline, the button and the still
// picture are plain HTML and SVG and never wait for it.
const LabHeroScene = lazy(() => import('./LabHeroScene'))

const WIDE_QUERY = '(min-width: 64rem)'

/** The core sits to the right of the headline on a wide screen and under the text on a narrow one. */
const WIDE_LAYOUT: HeroLayout = { shiftX: 0.36, shiftY: 0, fit: 0.86 }
const NARROW_LAYOUT: HeroLayout = { shiftX: 0, shiftY: 0, fit: 0.86 }

function HeroPoster() {
  return (
    <div className={styles.poster}>
      <span className={styles.posterCore} />
      <span className={styles.posterRing} />
      <span className={styles.posterRingOuter} />
    </div>
  )
}

/**
 * The Lab's first screen: the headline in type, one button, the signature line and an interactive
 * object. The object is a deforming, contour-lined sphere: at rest it is calm, and the first move
 * of the pointer (or a finger, or an arrow key) dents it, turns its light and sends heat through
 * its lines; a click sends a wave across it and throws its dust outward. The text is ordinary
 * HTML above the scene, readable from the first paint; the scene is used only when it can run
 * well (see useLabView), otherwise the picture stays.
 */
export function LabHero() {
  const { text } = useLabText()
  const view = useLabView()
  const touchFirst = useTouchFirst()
  const titleId = useId()
  const layout = useRef<HeroLayout>(WIDE_LAYOUT)
  const copy = text.hero

  useEffect(() => {
    const query = window.matchMedia(WIDE_QUERY)
    const apply = () => {
      layout.current = query.matches ? WIDE_LAYOUT : NARROW_LAYOUT
    }
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  const notice =
    view.reason === 'no-webgl'
      ? text.notices.noWebgl
      : view.reason === 'failed'
        ? text.notices.failed
        : view.reason === 'user'
          ? text.notices.still
          : view.view === 'calm'
            ? text.notices.calm
            : null

  const words = copy.title.split(' ')
  // The longest word sets the headline's size: it is the one that must fit the column, whatever the language.
  const longest = Math.max(...words.map((word) => word.length))
  const last = words.pop() ?? ''
  const head = words.join(' ')

  const viewOptions: Array<{ value: LabView; label: string; help: string }> = [
    { value: 'live', label: text.view.live, help: text.view.liveHelp },
    { value: 'calm', label: text.view.calm, help: text.view.calmHelp },
    { value: 'still', label: text.view.still, help: text.view.stillHelp },
  ]

  return (
    <section className={styles.hero} aria-labelledby={titleId} data-view={view.view}>
      <div className={styles.stageBox}>
        <LabStage
          label={copy.stageLabel}
          view={view.view}
          tier={view.tier}
          camera={{ fov: 40, position: [0, 0, 6.4] }}
          antialias
          className={styles.stage}
          touchAction="pan-y"
          poster={<HeroPoster />}
          hint={touchFirst ? copy.hintTouch : copy.hint}
          onSlow={view.onSlow}
          onFail={view.onFail}
          notices={{ loading: text.notices.loading, contextLost: text.notices.contextLost }}
        >
          <LabHeroScene layout={layout} />
        </LabStage>
      </div>

      <div className={styles.scrim} aria-hidden="true" />

      <Container size="wide" className={styles.content}>
        <div className={styles.copy} style={{ '--longest': longest } as CSSProperties}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h1 id={titleId} className={styles.title}>
            <span className={styles.line} style={{ '--i': 0 } as CSSProperties}>
              {head}
            </span>{' '}
            <span className={`${styles.line} ${styles.accent}`} style={{ '--i': 1 } as CSSProperties}>
              {last}
            </span>
          </h1>
          <p className={styles.lead}>{copy.lead}</p>
          <div className={styles.actions}>
            <Button href="#experiments" size="lg" arrow>
              {copy.cta}
            </Button>
          </div>
          <p className={styles.signature} lang="en">
            {text.signature.split(' ').map((word, index) => (
              <span key={word} className={styles.word} data-tone={index}>
                {word}
              </span>
            ))}
          </p>
        </div>

        <div className={styles.view}>
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          <LabChoice<LabView>
            label={text.view.label}
            value={view.view}
            options={viewOptions}
            onChange={view.choose}
            columns={3}
          />
        </div>
      </Container>
    </section>
  )
}
