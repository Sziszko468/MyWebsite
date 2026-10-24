import { createHeroState, type HeroState } from './heroTimeline'

/**
 * Per-frame scene state, shared by reference. It changes every frame, so it lives in a plain
 * object that the render loop writes and the scene parts read, never in React state.
 */
export interface HeroRig {
  /** Seconds since the first rendered frame. */
  elapsed: number
  /** Choreography at `elapsed` (see heroTimeline.ts). */
  state: HeroState
  /** 0..1.35: timeline speed plus the scroll-transition boost. */
  speed: number
  /** Metres the world has moved past the car; the phase of every moving pattern. */
  travel: number
  /** 0..1 light impulse from a click, decaying. */
  pulse: number
  /** Smoothed hero scroll-out progress, 0..1. */
  scroll: number
}

export function createRig(): HeroRig {
  return { elapsed: 0, state: createHeroState(), speed: 0, travel: 0, pulse: 0, scroll: 0 }
}
