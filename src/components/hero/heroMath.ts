export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

/**
 * Frame-rate independent exponential smoothing: after `halfLife` seconds the value has covered
 * half of the distance to the target, whatever the frame rate.
 */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  return lerp(current, target, 1 - Math.pow(0.5, dt / halfLife))
}
