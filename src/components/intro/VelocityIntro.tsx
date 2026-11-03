import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { useTheme } from '../../theme/useTheme'
import { cx } from '../../utils/cx'
import { useTouchFirst } from '../hero/capabilities'
import type { ExitSignal } from '../hero/fieldMotion'
import { GenerativeHeroFallback } from '../hero/GenerativeHeroFallback'
import { KineticTypography } from '../hero/KineticTypography'
import { useHeroDriver } from '../hero/useHeroDriver'
import { useStartAfterFirstScreen } from '../hero/startDeferral'
import { useSceneHealth } from '../hero/useSceneHealth'
import { LanguageSwitcher } from '../LanguageSwitcher/LanguageSwitcher'
import { SceneLayer } from '../SceneLayer/SceneLayer'
import { ThemeToggle } from '../ThemeToggle/ThemeToggle'
import { IntroEntryButton } from './IntroEntryButton'
import { browserStores, readSkipPreference, writeSkipPreference } from './introPolicy'
import { useIntro } from './useIntro'
import { useIntroExit } from './useIntroExit'
import styles from './VelocityIntro.module.scss'

// The same lazily loaded chunk as the hero's scene: the intro and the hero share one engine.
const VelocityHeroScene = lazy(() => import('../hero/VelocityHeroScene'))

/** "Don't show this again": a plain checkbox stored in this browser only. */
function SkipOption() {
  const { t } = useI18n()
  const [stores] = useState(browserStores)
  const [skip, setSkip] = useState(() => readSkipPreference(stores))

  return (
    <label className={styles.skip} data-intro-control>
      <input
        className={styles.skipInput}
        type="checkbox"
        checked={skip}
        onChange={(event) => {
          setSkip(event.target.checked)
          writeSkipPreference(stores, event.target.checked)
        }}
      />
      <span className={styles.skipBox} aria-hidden="true" />
      {t.intro.skip}
    </label>
  )
}

function IntroDialog() {
  const { t } = useI18n()
  const { theme } = useTheme()
  const { phase, config, engage, enter, finish } = useIntro()
  const health = useSceneHealth()
  // Its headline and button are plain HTML; the scene's code waits for the first screen to settle (hero/startDeferral.ts).
  const sceneMayStart = useStartAfterFirstScreen()
  const touchFirst = useTouchFirst()

  const dialogRef = useRef<HTMLDialogElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const ctaRef = useRef<HTMLButtonElement>(null)
  const exit = useRef<ExitSignal>({ progress: 0 })
  const lastPointer = useRef('mouse')
  const titleId = useId()
  const descriptionId = useId()

  const { driver } = useHeroDriver(dialogRef, stageRef, dialogRef, !health.reducedMotion)
  const { mode, tier, sceneVisible, sceneHandlers } = health

  // Open as a modal dialog before the first paint, so the page never shows through: the browser
  // makes everything behind it inert, keeps focus inside, and puts it above the header.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    ctaRef.current?.focus({ preventScroll: true })
  }, [])

  // The first sign of the visitor (pointer or key) moves the intro from ready to active.
  useEffect(() => {
    const events = ['pointermove', 'pointerdown', 'keydown'] as const
    const first = () => {
      engage()
      for (const name of events) window.removeEventListener(name, first)
    }
    for (const name of events) window.addEventListener(name, first, { passive: true })
    return () => {
      for (const name of events) window.removeEventListener(name, first)
    }
  }, [engage])

  const handleDone = useCallback(() => {
    finish()
    // The intro is about to disappear: put the keyboard where the page begins.
    requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }))
  }, [finish])

  useIntroExit({
    running: phase === 'exiting',
    element: dialogRef,
    signal: exit,
    durationMs: health.reducedMotion ? config.exitMsReduced : config.exitMs,
    reduced: health.reducedMotion,
    onDone: handleDone,
  })

  /** Starts the transition from a point on screen, once. Later calls are ignored. */
  const begin = useCallback(
    (x: number, y: number) => {
      if (!enter()) return
      const dialog = dialogRef.current
      dialog?.style.setProperty('--ix', `${x}px`)
      dialog?.style.setProperty('--iy', `${y}px`)
      driver.wave(x, y, 2.2)
    },
    [enter, driver],
  )

  const beginFromButton = useCallback(() => {
    const rect = ctaRef.current?.getBoundingClientRect()
    if (rect) begin(rect.left + rect.width / 2, rect.top + rect.height / 2)
  }, [begin])

  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    const target = event.target as Element
    if (target.closest('[data-intro-control]')) return

    const onButton = target.closest('[data-intro-enter]') !== null
    const fromKeyboard = event.detail === 0
    // A press on the background enters with a mouse or a pen. A finger on the background does
    // not: a stray touch is not a decision to enter, so touch has to hit the button.
    if (fromKeyboard || lastPointer.current === 'touch') {
      if (!onButton) return
    }
    if (fromKeyboard) beginFromButton()
    else begin(event.clientX, event.clientY)
  }

  // Escape is a way in, too: it leaves the intro the same way the button does.
  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault()
    beginFromButton()
  }

  // Before the visitor has clicked or tapped anything, a browser does not let a page cancel the
  // Escape key: the dialog closes by itself. This component only exists while the intro is not
  // finished, so a closed dialog is put back and the leaving transition is seen.
  const handleClose = () => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.intro}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-phase={phase}
      data-reduced={health.reducedMotion}
      data-intro-mode={mode}
      data-intro-ready={sceneVisible}
      data-intro-tier={tier}
      onPointerDown={(event) => {
        lastPointer.current = event.pointerType
      }}
      onClick={handleClick}
      onCancel={handleCancel}
      onClose={handleClose}
    >
      <SceneLayer ref={stageRef} className={styles.stage} fallback={<GenerativeHeroFallback />} onError={health.onError}>
        <GenerativeHeroFallback />
        {mode === 'scene' && sceneMayStart && (
          <div className={cx(styles.canvas, sceneVisible && styles.canvasVisible)}>
            <Suspense fallback={null}>
              <VelocityHeroScene
                mode="intro"
                exit={exit}
                theme={theme}
                tier={tier}
                driver={driver}
                active
                bloom={health.bloom}
                antialias={health.antialias}
                {...sceneHandlers}
              />
            </Suspense>
          </div>
        )}
      </SceneLayer>

      <div className={styles.scrim} aria-hidden="true" />

      <div className={styles.content}>
        <div className={styles.copy}>
          <KineticTypography
            id={titleId}
            lines={[t.intro.titleLine1, t.intro.titleLine2, t.intro.titleLine3, t.intro.titleLine4]}
            accentFrom={2}
            reactive={false}
          />
          <p id={descriptionId} className={styles.supporting}>
            {t.intro.supporting}
          </p>
        </div>

        <div className={styles.entry}>
          <IntroEntryButton ref={ctaRef} label={touchFirst ? t.intro.ctaTouch : t.intro.cta} />
          <p className={styles.hint}>{touchFirst ? t.intro.hintTouch : t.intro.hint}</p>
          {config.allowSkip && <SkipOption />}
        </div>
      </div>

      <div className={styles.controls} data-intro-control>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </dialog>
  )
}

/**
 * The fullscreen opening: an interactive field of light that answers the pointer, with the
 * headline and the way in as plain HTML above it. It appears per the configuration (src/config/
 * intro.ts), lets the visitor in on a click, a tap on the button, Enter, Space or Escape, plays
 * a short generative exit that opens onto the page already waiting underneath, and then removes
 * itself completely: its canvas is disposed and nothing keeps running.
 */
export function VelocityIntro() {
  const { phase } = useIntro()
  return phase === 'completed' ? null : <IntroDialog />
}
