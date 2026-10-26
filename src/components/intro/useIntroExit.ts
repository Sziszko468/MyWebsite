import { useEffect, type RefObject } from 'react'
import type { ExitSignal } from '../hero/fieldMotion'
import { exitProgress } from './introTransition'

interface IntroExitOptions {
  /** Runs the transition while true. */
  running: boolean
  /** The element that receives `--intro-exit` (0..1) for the CSS to react to. */
  element: RefObject<HTMLElement | null>
  /** The same value, for the scene to read every frame. */
  signal: RefObject<ExitSignal>
  durationMs: number
  reduced: boolean
  /** Called once when the transition has ended. */
  onDone: () => void
}

/**
 * Plays the leaving transition: one eased number, written to a CSS variable and to the scene's
 * signal every frame, and no React state. A timer guarantees the end even if the tab is hidden
 * and animation frames stop.
 */
export function useIntroExit({ running, element, signal, durationMs, reduced, onDone }: IntroExitOptions): void {
  useEffect(() => {
    if (!running) return

    const target = element.current
    const started = performance.now()
    let frame = 0
    let finished = false

    const done = () => {
      if (finished) return
      finished = true
      signal.current.progress = 1
      target?.style.setProperty('--intro-exit', '1')
      onDone()
    }

    const tick = (now: number) => {
      const progress = exitProgress(now - started, durationMs, reduced)
      signal.current.progress = progress
      target?.style.setProperty('--intro-exit', progress.toFixed(4))
      if (progress < 1) frame = requestAnimationFrame(tick)
      else done()
    }

    frame = requestAnimationFrame(tick)
    const safety = window.setTimeout(done, durationMs + 600)

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(safety)
    }
  }, [running, element, signal, durationMs, reduced, onDone])
}
