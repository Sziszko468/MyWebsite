import { lazy, Suspense, useCallback, useId, useRef, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useTheme } from '../../theme/useTheme'
import { cx } from '../../utils/cx'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { SceneLayer } from '../SceneLayer/SceneLayer'
import { getDeviceHints, supportsWebGL, useReducedMotion } from './capabilities'
import { useHeroInputs } from './useHeroInputs'
import { lowerTier, pickQuality, UNUSABLE_FRAME_MS, type QualityTier } from './velocityHeroConfig'
import { VelocityHeroFallback } from './VelocityHeroFallback'
import styles from './VelocityHero.module.scss'

// The scene (Three.js and React Three Fiber) is its own chunk: the headline, the buttons and
// the static fallback are plain HTML and SVG and never wait for it.
const VelocityHeroScene = lazy(() => import('./VelocityHeroScene'))

/**
 * Development only: `?hero=fallback` forces the static graphic and `?hero=high|medium|low` forces a
 * quality tier, so every path can be checked on one machine. Production ignores the query.
 */
function readDevOverride(): { fallback: boolean; tier?: QualityTier } {
  if (!import.meta.env.DEV) return { fallback: false }
  const value = new URLSearchParams(window.location.search).get('hero')
  if (value === 'fallback') return { fallback: true }
  if (value === 'high' || value === 'medium' || value === 'low') return { fallback: false, tier: value }
  return { fallback: false }
}

/**
 * The Home hero. Text and buttons are ordinary HTML above the scene layer, so they are
 * readable and clickable from the first paint, whatever the 3D scene is doing.
 *
 * The scene is used only when it can run well: WebGL is available, the visitor has not asked
 * for reduced motion, and the frame rate holds up. Otherwise the static graphic stays.
 */
export function VelocityHero() {
  const { t } = useI18n()
  const { theme } = useTheme()
  const reducedMotion = useReducedMotion()
  const titleId = useId()

  const sectionRef = useRef<HTMLElement>(null)
  const { inputs, inView } = useHeroInputs(sectionRef)

  const [override] = useState(readDevOverride)
  const [webgl] = useState(supportsWebGL)
  const [tier, setTier] = useState<QualityTier>(() => override.tier ?? pickQuality(getDeviceHints()))
  const tierRef = useRef(tier)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [contextLost, setContextLost] = useState(false)

  const mode = reducedMotion || !webgl || failed || override.fallback ? 'fallback' : 'scene'

  // The scene reports sustained slow frames: step the quality down, and give up when even the
  // lightest tier cannot keep up.
  const handleSlow = useCallback((averageMs: number) => {
    const lower = lowerTier(tierRef.current)
    if (lower) {
      tierRef.current = lower
      setTier(lower)
      // The new tier may rebuild the canvas; show the static graphic until its first frame.
      setReady(false)
    } else if (averageMs > UNUSABLE_FRAME_MS) {
      setFailed(true)
    }
  }, [])

  const handleReady = useCallback(() => setReady(true), [])
  const handleLost = useCallback(() => setContextLost(true), [])
  const handleRestored = useCallback(() => setContextLost(false), [])
  const handleError = useCallback(() => setFailed(true), [])

  const sceneVisible = mode === 'scene' && ready && !contextLost

  return (
    <section
      ref={sectionRef}
      className={styles.hero}
      aria-labelledby={titleId}
      data-hero-mode={mode}
      data-hero-ready={sceneVisible}
      data-hero-tier={tier}
    >
      <SceneLayer className={styles.stage} fallback={<VelocityHeroFallback />} onError={handleError}>
        <VelocityHeroFallback />
        {mode === 'scene' && (
          <div className={cx(styles.canvas, sceneVisible && styles.canvasVisible)}>
            <Suspense fallback={null}>
              <VelocityHeroScene
                theme={theme}
                tier={tier}
                inputs={inputs}
                active={inView}
                onReady={handleReady}
                onSlow={handleSlow}
                onContextLost={handleLost}
                onContextRestored={handleRestored}
              />
            </Suspense>
          </div>
        )}
      </SceneLayer>

      <div className={styles.scrim} aria-hidden="true" />

      <Container className={styles.content}>
        <div className={styles.copy}>
          <h1 id={titleId} className={styles.title}>
            <span className={styles.line}>{t.hero.titleLine1}</span>
            <span className={cx(styles.line, styles.accent)}>{t.hero.titleLine2}</span>
          </h1>
          <p className={styles.lead}>{t.hero.description}</p>
          <div className={styles.actions}>
            <Button to="/work" size="lg" arrow className={styles.cta}>
              {t.hero.ctaPrimary}
            </Button>
            <Button to="/contact" size="lg" variant="secondary" className={styles.cta}>
              {t.cta.startProject}
            </Button>
          </div>
        </div>
      </Container>

      <p className={styles.cue} aria-hidden="true">
        <span className={styles.cueTrack}>
          <span className={styles.cueDot} />
        </span>
        {t.hero.scrollCue}
      </p>
    </section>
  )
}
