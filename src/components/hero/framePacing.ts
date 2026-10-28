/**
 * How often the scene draws, and how it gives up resolution before it gives up quality. Plain
 * code, so the policy can be tested against simulated displays without WebGL.
 */

/** Screens up to this refresh rate are drawn on every frame; faster ones on every second, third, … frame. */
export const MAX_DRAWN_HZ = 105

/** Frame intervals outside this range (ms) are pauses or glitches, not the screen's rhythm. */
const MIN_INTERVAL = 2
const MAX_INTERVAL = 40
const SAMPLES = 24
const MIN_SAMPLES = 8

/**
 * Decides which animation frames to draw. A 120, 144 or 240 Hz screen would otherwise draw two,
 * three times as many frames as a 60 Hz one for no visible gain, and the same scene costs it that
 * much more power and heat. The pacer measures the screen's own frame interval (the median of the
 * recent ones, so a hitch does not fool it) and draws every Nth frame, N being the smallest whole
 * number that brings the rate to MAX_DRAWN_HZ or below: every frame on 60, 75, 90 and 100 Hz,
 * every second on 120, 144 and 165 Hz, every third on 240 Hz. Whole multiples keep the rhythm
 * even; a fixed minimum time between frames would turn a 90 Hz screen into a stuttering 45 fps.
 * A slow device (a frame interval of 33 ms) is never slowed down further.
 */
export class FramePacer {
  private readonly intervals: number[] = []
  private last = Number.NaN
  private sinceDrawn = 0

  /** Call once per animation frame with its timestamp (ms). Returns whether this frame is to be drawn. */
  tick(now: number): boolean {
    if (!Number.isNaN(this.last)) {
      const interval = now - this.last
      if (interval >= MIN_INTERVAL && interval <= MAX_INTERVAL) {
        this.intervals.push(interval)
        if (this.intervals.length > SAMPLES) this.intervals.shift()
      }
    }
    this.last = now

    this.sinceDrawn += 1
    if (this.sinceDrawn >= this.every()) {
      this.sinceDrawn = 0
      return true
    }
    return false
  }

  /** Draw one frame in this many. */
  every(): number {
    if (this.intervals.length < MIN_SAMPLES) return 1
    const sorted = [...this.intervals].sort((a, b) => a - b)
    const hz = 1000 / sorted[Math.floor(sorted.length / 2)]
    return Math.max(1, Math.ceil(hz / MAX_DRAWN_HZ - 0.02))
  }
}

/** The resolution scale each "too slow" report multiplies by, and the lowest it may reach. */
export const SCALE_STEP = 0.75
export const MIN_SCALE = 0.5

/**
 * The next, lower resolution scale, or null when the scale is already as low as it may go and
 * the quality tier has to drop instead.
 */
export function stepScaleDown(scale: number): number | null {
  const next = scale * SCALE_STEP
  return next >= MIN_SCALE ? next : null
}
