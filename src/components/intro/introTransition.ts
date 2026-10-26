import { clamp } from '../hero/heroMath'

/**
 * The leaving transition as a pure function of time. The page drives everything from this one
 * number: the scene's rush and spread, the hole that opens in the intro, the fading text.
 * Under reduced motion it is a plain linear fade.
 */

export function easeInOutCubic(x: number): number {
  const t = clamp(x)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Progress 0..1 after `elapsedMs` of a transition that lasts `durationMs`. */
export function exitProgress(elapsedMs: number, durationMs: number, reduced = false): number {
  const t = clamp(elapsedMs / Math.max(durationMs, 1))
  return reduced ? t : easeInOutCubic(t)
}
