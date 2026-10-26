import { createMotion, type Motion } from './fieldMotion'
import { createScrollPose, type ScrollPose } from './ScrollTransition'

/**
 * Per-frame scene state, shared by reference. It changes every frame, so it lives in a plain
 * object that the render loop writes and the scene parts read, never in React state.
 */
export interface HeroRig {
  /** Seconds since the first rendered frame. */
  elapsed: number
  /** 0..1: the scene lighting up and reaching speed after it appears. */
  intro: number
  /** World units moved past the camera; the phase of every flowing pattern. */
  travel: number
  /** Clock of the ambient motion; slow or still when nothing is happening. */
  phase: number
  /** Current world speed, units per second. */
  speed: number
  /** The intro's exit progress, 0..1 (0 for the hero). */
  exit: number
  /** What the field is doing this frame (see fieldMotion.ts). */
  motion: Motion
  /** The scene's arrangement for the current (eased) scroll progress. */
  pose: ScrollPose
}

export function createRig(): HeroRig {
  return { elapsed: 0, intro: 0, travel: 0, phase: 0, speed: 0, exit: 0, motion: createMotion(), pose: createScrollPose() }
}
