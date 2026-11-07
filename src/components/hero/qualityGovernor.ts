import { SCALE_STEP } from './framePacing'

/**
 * Getting quality back. The frame-rate watchdogs (hero/velocityHeroConfig.ts, lab/core/frameWatchdog.ts) only ever
 * lower quality: a phone that stuttered for two seconds while a heavy page was loading, or while the visitor
 * scrolled, would otherwise stay at a lower resolution for the rest of the visit.
 *
 * A screen locked to 60 Hz shows 16.7 ms frames whether the GPU spends 3 ms or 15 ms on each, so headroom cannot
 * be read from the frame time. The governor therefore probes: after the frames have been steadily fine for a
 * while it asks the scene to try one step up, and the watchdog's next verdict says whether that held. A step
 * that does not hold is taken back at once (that is the watchdog's own job) and the governor waits twice as long
 * before the next attempt; after two failed attempts in a row it stops trying for the rest of the visit. A
 * device that cannot hold the higher level therefore costs at most two short stutters, never a loop.
 *
 * Plain code with no WebGL and no timers of its own: it is fed the duration of every frame, so it is tested
 * against simulated frame times.
 */

/** A window whose average frame is under this many milliseconds counts as steady (about 45 fps or better). */
export const STEADY_FRAME_MS = 22
/** Seconds of drawing each judgement looks at. */
export const GOVERNOR_WINDOW_SECONDS = 1.2
/** Seconds of steady drawing before the first attempt to restore a step. */
export const FIRST_RESTORE_WAIT_SECONDS = 12
/** The wait is multiplied by this after every failed attempt. */
export const RESTORE_BACKOFF = 2
/** A step taken back within this many seconds of being restored counts as a failed attempt. */
export const PROBE_SECONDS = 10
/** After this many failed attempts in a row the governor stops. */
export const MAX_FAILED_PROBES = 2
/** A frame longer than this is a pause (a hidden tab, a stage scrolled away), not a measurement. */
const PAUSE_SECONDS = 0.25

export class QualityGovernor {
  private elapsed = 0
  private windowTime = 0
  private windowCount = 0
  private steadySeconds = 0
  private degraded = false
  private wait = FIRST_RESTORE_WAIT_SECONDS
  private restoredAt = Number.NEGATIVE_INFINITY
  private failures = 0

  /** Whether the governor has given up for this visit (two failed attempts in a row). */
  get gaveUp(): boolean {
    return this.failures >= MAX_FAILED_PROBES
  }

  /** Whether quality is below what the device was first given, i.e. there is something to restore. */
  get wantsRestore(): boolean {
    return this.degraded && !this.gaveUp
  }

  /** Seconds of steady drawing still needed before the next attempt. For tests and the dev overlay. */
  get secondsToNextAttempt(): number {
    return Math.max(0, this.wait - this.steadySeconds)
  }

  /** The watchdog lowered the quality (resolution or tier). Call it every time. */
  lowered(): void {
    if (this.elapsed - this.restoredAt <= PROBE_SECONDS) {
      // The step up did not hold: take the lesson and wait longer.
      this.failures += 1
      this.wait *= RESTORE_BACKOFF
    } else {
      this.failures = 0
      this.wait = FIRST_RESTORE_WAIT_SECONDS
    }
    this.restoredAt = Number.NEGATIVE_INFINITY
    this.degraded = true
    this.steadySeconds = 0
    this.windowTime = 0
    this.windowCount = 0
  }

  /** A step up was applied. More may follow: the governor keeps asking while quality is below the ceiling. */
  restored(): void {
    this.restoredAt = this.elapsed
    this.steadySeconds = 0
    this.windowTime = 0
    this.windowCount = 0
  }

  /** Nothing is left to restore: the scene is back at the level it started at. */
  settled(): void {
    this.degraded = false
    this.steadySeconds = 0
    this.failures = 0
    this.wait = FIRST_RESTORE_WAIT_SECONDS
  }

  /**
   * Feed the duration of every drawn frame, in seconds. Returns true when the scene has been steady for long
   * enough and should try one step up; the caller then calls `restored()` (it did) or `settled()` (nothing left).
   */
  tick(delta: number): boolean {
    if (delta > PAUSE_SECONDS) {
      this.steadySeconds = 0
      this.windowTime = 0
      this.windowCount = 0
      return false
    }
    this.elapsed += delta
    if (!this.wantsRestore) return false

    this.windowTime += delta
    this.windowCount += 1
    if (this.windowTime < GOVERNOR_WINDOW_SECONDS) return false

    const averageMs = (this.windowTime / this.windowCount) * 1000
    const seconds = this.windowTime
    this.windowTime = 0
    this.windowCount = 0
    if (averageMs > STEADY_FRAME_MS) {
      this.steadySeconds = 0
      return false
    }
    this.steadySeconds += seconds
    if (this.steadySeconds < this.wait) return false
    this.steadySeconds = 0
    return true
  }
}

/** The next, higher resolution scale, capped at 1, or null when it is already full. Mirrors `stepScaleDown`. */
export function stepScaleUp(scale: number, step = SCALE_STEP): number | null {
  if (scale >= 0.999) return null
  const next = scale / step
  return next >= 0.999 ? 1 : next
}
