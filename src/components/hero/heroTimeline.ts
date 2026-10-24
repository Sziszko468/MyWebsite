import { clamp, lerp, smoothstep } from './heroMath'

/**
 * The hero's choreography as a pure function of elapsed seconds, so the scene, the camera and
 * the lights stay in step and the whole thing can be unit-tested without WebGL.
 *
 *   ignition      lights and environment come up, the car idles
 *   launch        car and camera start to move together
 *   acceleration  stronger sense of speed, longer light streaks
 *   cruise        settles into a steady, continuous run
 *
 * The fifth state, the scroll transition, is driven by scroll position, not by time.
 */

export type HeroPhase = 'ignition' | 'launch' | 'acceleration' | 'cruise'

/** Seconds at which each phase ends. */
export const PHASE_END = { ignition: 1.2, launch: 3.2, acceleration: 5.8 } as const

export interface HeroState {
  phase: HeroPhase
  /** 0..1 — how much of the scene's lighting is on. */
  lights: number
  /** 0..1 — forward speed relative to the top speed; never fully zero, so the scene is alive. */
  speed: number
  /** 0..1 — how long the light streaks are drawn. */
  streak: number
  /** 0..1 — camera blend from the idle pose (close, high) to the speed pose (far, low, wide). */
  push: number
  /** 0..1 — rear squat while the car launches. */
  squat: number
}

export const IDLE_SPEED = 0.05
export const CRUISE_SPEED = 0.78

export function createHeroState(): HeroState {
  return { phase: 'ignition', lights: 0, speed: IDLE_SPEED, streak: 0.12, push: 0, squat: 0 }
}

const ease = (x: number) => smoothstep(0, 1, x)

export function sampleTimeline(elapsed: number, out: HeroState = createHeroState()): HeroState {
  const t = Math.max(0, elapsed)
  const { ignition, launch, acceleration } = PHASE_END

  out.lights = ease(t / ignition)

  if (t < ignition) {
    out.phase = 'ignition'
    out.speed = IDLE_SPEED
    out.streak = 0.12
    out.push = 0
    out.squat = 0
  } else if (t < launch) {
    const u = (t - ignition) / (launch - ignition)
    out.phase = 'launch'
    out.speed = lerp(IDLE_SPEED, 0.5, ease(u))
    out.streak = lerp(0.12, 0.4, ease(u))
    out.push = lerp(0, 0.45, ease(u))
    out.squat = smoothstep(0, 0.5, u) * (1 - smoothstep(0.5, 1, u))
  } else if (t < acceleration) {
    const u = (t - launch) / (acceleration - launch)
    out.phase = 'acceleration'
    out.speed = lerp(0.5, 1, ease(u))
    out.streak = lerp(0.4, 1, ease(u))
    out.push = lerp(0.45, 1, ease(u))
    out.squat = 0
  } else {
    const settle = smoothstep(0, 2, t - acceleration)
    out.phase = 'cruise'
    out.speed = lerp(1, CRUISE_SPEED, settle)
    out.streak = lerp(1, 0.6, settle)
    out.push = lerp(1, 0.72, settle)
    out.squat = 0
  }

  return out
}

/** The scroll transition: how the scene reacts as the hero scrolls out of view (progress 0..1). */
export function scrollTransition(progress: number) {
  const p = clamp(progress)
  const eased = p * p * (3 - 2 * p)
  return {
    /** Added to the speed, so the world rushes past as the visitor leaves. */
    speedBoost: 0.35 * eased,
    /** Overall scene brightness; fades towards the page colour. */
    brightness: 1 - 0.55 * eased,
    /** Camera moves forward and up, lifting away from the car. */
    dolly: -1.4 * eased,
    rise: 0.9 * eased,
  }
}
