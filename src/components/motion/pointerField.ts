export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

export interface PointerVars {
  /** Pixels from the element's left edge, clamped to the element. */
  x: number
  /** Pixels from the element's top edge, clamped to the element. */
  y: number
  /** -1 at the left edge, 0 in the middle, 1 at the right edge. */
  px: number
  /** -1 at the top edge, 0 in the middle, 1 at the bottom edge. */
  py: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Where a pointer is inside an element, as the numbers the CSS reads: pixels for a spotlight
 * (--mx, --my) and -1..1 for depth and tilt (--px, --py). The numbers never leave the element's
 * box, and an element without a size reads as the middle.
 */
export function pointerVars(rect: RectLike, clientX: number, clientY: number): PointerVars {
  const width = Math.max(rect.width, 0)
  const height = Math.max(rect.height, 0)
  const x = clamp(clientX - rect.left, 0, width)
  const y = clamp(clientY - rect.top, 0, height)
  return {
    x,
    y,
    px: width > 0 ? (x / width) * 2 - 1 : 0,
    py: height > 0 ? (y / height) * 2 - 1 : 0,
  }
}

/** Rounded so the style attribute does not churn on sub-pixel moves nobody can see. */
export function formatVar(value: number, digits = 3): string {
  return String(Number(value.toFixed(digits)))
}
