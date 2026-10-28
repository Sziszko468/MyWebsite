import { lazy, Suspense, useId, useRef } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useTheme } from '../../theme/useTheme'
import { cx } from '../../utils/cx'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import { useIntro } from '../intro/useIntro'
import { SceneLayer } from '../SceneLayer/SceneLayer'
import { GenerativeHeroFallback } from './GenerativeHeroFallback'
import { KineticTypography } from './KineticTypography'
import { useHeroDriver } from './useHeroDriver'
import { useSceneHealth } from './useSceneHealth'
import styles from './VelocityHero.module.scss'

// The scene (Three.js and React Three Fiber) is its own chunk: the headline, the buttons and
// the static fallback are plain HTML and SVG and never wait for it.
const VelocityHeroScene = lazy(() => import('./VelocityHeroScene'))

/**
 * The Home hero. Text and buttons are ordinary HTML above the scene layer, so they are readable
 * and clickable from the first paint, whatever the scene is doing. The scene is a field of light
 * that the visitor moves: cursor, clicks and scroll change it (see HeroDriver).
 *
 * The scene is used only when it can run well (see useSceneHealth). Otherwise the generated SVG
 * stays.
 *
 * While the fullscreen intro covers the page the hero holds still: its scene is not mounted until
 * the intro (its exit included) is gone, because the intro has the page's one WebGL context and two
 * at once would double the GPU memory and the work. It listens to no input and holds its headline
 * animation, which then plays as the intro opens onto it. The generated graphic stands in until
 * the scene has drawn its first frame.
 */
export function VelocityHero() {
  const { t } = useI18n()
  const { theme } = useTheme()
  const titleId = useId()
  const { blocking, phase } = useIntro()
  // The scene waits until the intro is entirely gone, exit included: until then the intro holds the page's one WebGL context.
  const sceneHeld = phase !== 'completed'
  const health = useSceneHealth()
  const { mode, tier, sceneVisible, sceneHandlers } = health

  const rootRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const { driver, inView } = useHeroDriver(sectionRef, stageRef, rootRef, !health.reducedMotion && !blocking)

  return (
    <div ref={rootRef} className={styles.root}>
      <section
        ref={sectionRef}
        className={styles.hero}
        aria-labelledby={titleId}
        data-hero-mode={mode}
        data-hero-ready={sceneVisible}
        data-hero-tier={tier}
        data-intro-pending={blocking}
      >
        <SceneLayer ref={stageRef} className={styles.stage} fallback={<GenerativeHeroFallback />} onError={health.onError}>
          <GenerativeHeroFallback />
          {mode === 'scene' && !sceneHeld && (
            <div className={cx(styles.canvas, sceneVisible && styles.canvasVisible)}>
              <Suspense fallback={null}>
                <VelocityHeroScene
                  theme={theme}
                  tier={tier}
                  driver={driver}
                  active={inView}
                  bloom={health.bloom}
                  antialias={health.antialias}
                  {...sceneHandlers}
                />
              </Suspense>
            </div>
          )}
        </SceneLayer>

        <div className={styles.scrim} aria-hidden="true" />

        <Container className={styles.content}>
          <div className={styles.copy}>
            <KineticTypography id={titleId} lines={[t.hero.titleLine1, t.hero.titleLine2]} />
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

      {/* Three lines grow out of the hero's lower edge as it scrolls away and lead into the next section. */}
      <div className={styles.bridge} aria-hidden="true">
        <span className={styles.bridgeRed} />
        <span className={styles.bridgeInk} />
        <span className={styles.bridgeBlue} />
      </div>
    </div>
  )
}
