/**
 * The maths of the magnetic pull, kept apart from the DOM so it is tested without a browser.
 *
 * A control leans a few pixels toward the pointer while the pointer is over it: its own centre is the
 * reference, the pull is a fraction of how far the pointer is from it, and it never exceeds a small
 * cap. It is for large, well-spaced calls to action only (a small or crowded control that moves
 * under the pointer is harder to hit, not easier), so a control below a minimum size is left alone.
 */

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** The smallest control that may lean: wide enough and tall enough to be a deliberate target. */
export const MIN_MAGNETIC = { width: 112, height: 44 }

/** The farthest a control may move, in px at intensity 1. */
export const MAX_PULL = 6

/** The share of the pointer's distance from the centre that the control follows. */
export const PULL = 0.12

export function isMagnetic(box: Pick<Box, 'width' | 'height'>): boolean {
  return box.width >= MIN_MAGNETIC.width && box.height >= MIN_MAGNETIC.height
}

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))

/** How far the control moves for a pointer at (x, y), scaled by the scope's intensity. */
export function magneticOffset(x: number, y: number, box: Box, intensity = 1): { x: number; y: number } {
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const limit = MAX_PULL * Math.max(0, intensity)
  return { x: Math.round(clamp((x - cx) * PULL * intensity, limit) * 10) / 10 || 0, y: Math.round(clamp((y - cy) * PULL * intensity, limit) * 10) / 10 || 0 }
}
