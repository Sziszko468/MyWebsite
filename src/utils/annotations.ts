/**
 * The arithmetic of a position on a picture (PROMPT 27), with no DOM in it so every rule is tested. A position is two numbers from 0 to 1: the share of the picture's WIDTH and
 * HEIGHT from its top left corner. Because it is a share and not a pixel, the same number marks the same spot at every size the picture is shown at, and a marker drawn with
 * `left: x * 100%; top: y * 100%` stays on it when the picture scales. The server checks the same range and rounds to the same four decimals.
 */

export interface Point {
  x: number
  y: number
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export const clamp01 = (value: number): number => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0)

/** Four decimals: a hundredth of a percent; more is noise (and the server stores no more). */
export const round4 = (value: number): number => Math.round(value * 10_000) / 10_000

/** A pointer position on the screen as a position on the picture; `null` when the picture has no size to measure against. Outside the picture is clamped to its edge. */
export function toNormalized(client: Point, box: Box): Point | null {
  if (!(box.width > 0) || !(box.height > 0)) return null
  return { x: round4(clamp01((client.x - box.left) / box.width)), y: round4(clamp01((client.y - box.top) / box.height)) }
}

/** Moves a position by whole steps (the keyboard): one step is one percent, five with Shift. The result stays on the picture. */
export function nudge(point: Point, dx: number, dy: number, step = 0.01): Point {
  return { x: round4(clamp01(point.x + dx * step)), y: round4(clamp01(point.y + dy * step)) }
}

/** The style of a marker: percentages of the picture, so it scales with it. */
export const markerStyle = (point: Point): { left: string; top: string } => ({ left: `${round4(point.x * 100)}%`, top: `${round4(point.y * 100)}%` })

/** A position in words a person can read out, in whole percent from the left and from the top. */
export const describePoint = (point: Point): { left: number; top: number } => ({ left: Math.round(point.x * 100), top: Math.round(point.y * 100) })

export const centre: Point = { x: 0.5, y: 0.5 }

/** Whether a value is a position the server would accept. */
export const isPoint = (value: unknown): value is Point => {
  if (typeof value !== 'object' || value === null) return false
  const { x, y } = value as Record<string, unknown>
  return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1
}

/** The arrow key a placement answers to, as a step in x and y (`null` for any other key). Shift makes the step five times larger. */
export function stepOf(key: string, shift: boolean): { dx: number; dy: number } | null {
  const size = shift ? 5 : 1
  switch (key) {
    case 'ArrowLeft':
      return { dx: -size, dy: 0 }
    case 'ArrowRight':
      return { dx: size, dy: 0 }
    case 'ArrowUp':
      return { dx: 0, dy: -size }
    case 'ArrowDown':
      return { dx: 0, dy: size }
    default:
      return null
  }
}
