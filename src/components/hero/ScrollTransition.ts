import { clamp, damp, smoothstep } from './heroMath'
import { SCROLL } from './velocityHeroConfig'

/**
 * Scroll position as a smooth signal. The raw value (how far the hero has scrolled out of view,
 * 0..1) is never applied directly: `progress` eases towards it, so a fast flick or a jump to an
 * anchor becomes a short glide instead of a snap, and `velocity` measures how fast it is moving.
 * Nothing here locks or intercepts scrolling; it only listens.
 */
export class ScrollTransition {
  progress = 0
  /** Progress units per second, eased. */
  velocity = 0

  private target = 0

  setTarget(raw: number): void {
    this.target = clamp(raw)
  }

  update(dt: number): void {
    if (dt <= 0) return
    const previous = this.progress
    this.progress = damp(this.progress, this.target, SCROLL.progressHalfLife, dt)
    this.velocity = damp(this.velocity, (this.progress - previous) / dt, SCROLL.velocityHalfLife, dt)
  }

  rest(): void {
    this.target = this.progress
    this.velocity = 0
  }

  get settled(): boolean {
    return Math.abs(this.target - this.progress) < 0.0005 && Math.abs(this.velocity) < 0.001
  }
}

/** How the scene is re-arranged at a given scroll progress. */
export interface ScrollPose {
  /** Camera roll, radians: the lines' direction turns as the hero leaves. */
  roll: number
  /** Camera pitch, radians. */
  pitch: number
  /** Extra image shift (+ is up): the focal point sinks towards the next section. */
  shiftY: number
  /** Added to the world speed (0..1 of the base speed). */
  speedBoost: number
  /** Overall brightness; fades towards the page colour. */
  brightness: number
}

export function createScrollPose(): ScrollPose {
  return { roll: 0, pitch: 0, shiftY: 0, speedBoost: 0, brightness: 1 }
}

/** The pose for scroll progress 0..1. Smooth everywhere, so it can follow an eased input. */
export function scrollPose(progress: number, out: ScrollPose = createScrollPose()): ScrollPose {
  const eased = smoothstep(0, 1, progress)
  out.roll = 0.42 * eased
  out.pitch = -0.26 * eased
  out.shiftY = -0.5 * eased
  out.speedBoost = 0.6 * eased
  out.brightness = 1 - 0.65 * eased * eased
  return out
}
