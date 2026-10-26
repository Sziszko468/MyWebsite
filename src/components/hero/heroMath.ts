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

/** The shared clock, in seconds. Click waves are stamped with it by the driver and aged by the shaders. */
export function clockSeconds(): number {
  return performance.now() / 1000
}

/** Small deterministic generator, so generated art looks the same on every load. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
