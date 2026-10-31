import { SLOW_FRAME_MS } from '../../hero/velocityHeroConfig'

/** Seconds at the start in which nothing is judged: the first frames include shader compilation. */
export const WARM_UP_SECONDS = 2.5
/** Seconds of drawing each judgement looks at, so one hitch never decides. */
export const WINDOW_SECONDS = 1.2
/** Seconds after a remedy before the next judgement: the change needs a moment to show. */
export const COOL_DOWN_SECONDS = 2
/** A frame longer than this is a pause (a background tab, a stage scrolled away), not slowness. */
export const PAUSE_SECONDS = 0.25
/** An average this many times the limit is slow beyond doubt: one such window is enough. */
export const SEVERE_FACTOR = 2

const MIN_FRAMES_BEFORE_JUDGING = 15
const MIN_FRAMES_IN_WINDOW = 5

/**
 * Watches how long frames take and says when the scene cannot keep up. Time-based, not
 * frame-based, so a machine drawing at 7 frames a second is helped within seconds instead of
 * minutes. Plain code, so it is tested against simulated frame times.
 *
 * Feed it every frame's duration. It returns the average frame time (ms) of a window when two
 * windows in a row (or one very bad one) were slower than the limit, and null otherwise.
 */
export class FrameWatchdog {
  private elapsed = 0
  private frames = 0
  private time = 0
  private count = 0
  private strikes = 0
  private quietUntil = WARM_UP_SECONDS

  tick(delta: number): number | null {
    if (delta > PAUSE_SECONDS) {
      this.time = 0
      this.count = 0
      this.strikes = 0
      return null
    }
    this.elapsed += delta
    this.frames += 1
    if (this.elapsed < this.quietUntil || this.frames < MIN_FRAMES_BEFORE_JUDGING) return null

    this.time += delta
    this.count += 1
    if (this.time < WINDOW_SECONDS || this.count < MIN_FRAMES_IN_WINDOW) return null

    const averageMs = (this.time / this.count) * 1000
    this.time = 0
    this.count = 0
    this.strikes = averageMs > SLOW_FRAME_MS ? this.strikes + 1 : 0
    const severe = averageMs > SLOW_FRAME_MS * SEVERE_FACTOR
    if (this.strikes >= 2 || (severe && this.strikes >= 1)) {
      this.strikes = 0
      this.quietUntil = this.elapsed + COOL_DOWN_SECONDS
      return averageMs
    }
    return null
  }
}
