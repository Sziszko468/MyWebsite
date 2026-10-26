import { clamp, lerp, smoothstep } from './heroMath'
import { FIELD } from './velocityHeroConfig'

/**
 * How the field's motion follows from what the visitor is doing, as a pure function so the
 * difference between the two uses of the engine can be tested without WebGL.
 *
 *   hero    a world that is always flowing: it rushes past at rest, faster when pushed
 *   intro   a world that is still until touched: with no input it does not move at all, and the
 *           pointer's energy is what drives the flow, the light streaks and the distortion
 *
 * `exit` (0..1) is the intro's leaving transition: the world rushes past, the field flies apart
 * towards the screen edges, the view widens and rolls, and the light fades out at the end.
 */

export type FieldMode = 'hero' | 'intro'

/** The intro's leaving transition, written by the page and read by the scene every frame. */
export interface ExitSignal {
  /** Eased progress, 0..1. */
  progress: number
}

export interface MotionInput {
  mode: FieldMode
  /** The scene waking up after it appears, 0..1. */
  ramp: number
  /** Pointer energy, 0..1. */
  energy: number
  /** Scroll speed, 0..1. */
  pull: number
  /** Extra speed from the scroll pose, 0..1. */
  boost: number
  /** The intro's exit, 0..1. */
  exit: number
}

export interface Motion {
  /** World units per second. */
  speed: number
  /** Rate of the ambient clock (swirl, surface waves), 1 = normal. */
  phaseRate: number
  /** 0..1 streak length. */
  streak: number
  /** Strength of the ambient swirl and of surface waves. */
  warp: number
  /** Radius multiplier of the field. */
  spread: number
  /** Brightness multiplier (before the pose's own brightness). */
  brightness: number
  /** Extra vertical field of view, degrees. */
  fov: number
  /** Extra camera roll, radians. */
  roll: number
}

export function createMotion(): Motion {
  return { speed: 0, phaseRate: 1, streak: 0, warp: 1, spread: 1, brightness: 1, fov: 0, roll: 0 }
}

export function fieldMotion({ mode, ramp, energy, pull, boost, exit }: MotionInput, out: Motion = createMotion()): Motion {
  const e = clamp(exit)
  const wake = lerp(0.2, 1, ramp)

  if (mode === 'intro') {
    out.speed = wake * energy * FIELD.energySpeed * 1.7
    out.phaseRate = 0.02 + 1.4 * energy
    out.streak = clamp(0.14 + 0.75 * energy)
    out.warp = 0.12 + 1.8 * energy
  } else {
    out.speed = wake * (FIELD.baseSpeed * (1 + boost) + (energy + pull) * FIELD.energySpeed)
    out.phaseRate = 1
    out.streak = clamp(0.22 + 0.55 * energy + 0.4 * pull + 0.25 * boost)
    out.warp = 1 + 1.6 * energy
  }

  // Leaving: rush past, fly apart, widen and roll, then fade the light out.
  const rush = smoothstep(0, 0.35, e)
  out.speed = out.speed * (1 + 9 * e * e) + FIELD.baseSpeed * 6 * rush
  out.streak = clamp(out.streak + 0.9 * e)
  out.warp += 2.2 * e
  out.spread = 1 + 2.2 * e * e
  out.brightness = 1 - smoothstep(0.6, 1, e)
  out.fov = 22 * smoothstep(0, 1, e)
  out.roll = 0.22 * e
  return out
}
