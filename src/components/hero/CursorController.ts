import { clamp, damp } from './heroMath'
import { CURSOR, FIELD } from './velocityHeroConfig'

/**
 * Turns the visitor's pointer into the signals the scene consumes. Pure: no DOM, no WebGL, so
 * it can be driven from tests as well as from the hero.
 *
 * - `x`, `y`: the pointer position in hero space (-1..1, y up), eased towards the real pointer.
 *   The scene never sees a jump, however fast the mouse moves.
 * - `vx`, `vy`: velocity of that eased position, in screen units per second. It gives the
 *   direction and speed of the movement.
 * - `speed`, `heading`: how fast and in which direction (radians) the eased position is moving.
 * - `step`, `pathLength`: how far it moved in the last update, and in total since the start.
 * - `energy`: 0..1. Rises immediately with movement, drains away slowly once the pointer rests,
 *   so the graphic settles back to its calm state instead of snapping to it.
 * - `presence`: 0..1. Jumps to 1 on movement and fades over a second or two, so slow, careful
 *   movement can show finer detail than fast sweeps.
 * - `ripples`: a fixed ring of click waves (x, y, start time, strength), read by the shaders.
 */
export class CursorController {
  x = 0
  y = 0
  vx = 0
  vy = 0
  energy = 0
  presence = 0
  speed = 0
  heading = 0
  step = 0
  pathLength = 0
  /** Bumped whenever a ripple is added, so the renderer copies them only when they change. */
  rippleVersion = 0
  readonly ripples = new Float32Array(CURSOR.maxRipples * 4)

  private targetX = 0
  private targetY = 0
  private hasTarget = false
  private nextRipple = 0

  constructor() {
    for (let i = 0; i < CURSOR.maxRipples; i++) this.ripples[i * 4 + 2] = -1e4
  }

  /** The real pointer position in hero space. The first call places the eased position there directly. */
  setTarget(x: number, y: number): void {
    this.targetX = clamp(x, -1.2, 1.2)
    this.targetY = clamp(y, -1.2, 1.2)
    if (!this.hasTarget) {
      this.x = this.targetX
      this.y = this.targetY
      this.hasTarget = true
    }
  }

  /** Starts a click wave at a hero-space position. `now` is the same clock the shaders use. */
  ripple(x: number, y: number, now: number, strength = 1): void {
    const slot = this.nextRipple * 4
    this.ripples[slot] = clamp(x, -1.2, 1.2)
    this.ripples[slot + 1] = clamp(y, -1.2, 1.2)
    this.ripples[slot + 2] = now
    this.ripples[slot + 3] = strength
    this.nextRipple = (this.nextRipple + 1) % CURSOR.maxRipples
    this.rippleVersion += 1
  }

  update(dt: number): void {
    if (dt <= 0) return

    const previousX = this.x
    const previousY = this.y
    this.x = damp(this.x, this.targetX, CURSOR.positionHalfLife, dt)
    this.y = damp(this.y, this.targetY, CURSOR.positionHalfLife, dt)

    const max = CURSOR.maxVelocity
    this.vx = clamp(damp(this.vx, (this.x - previousX) / dt, CURSOR.velocityHalfLife, dt), -max, max)
    this.vy = clamp(damp(this.vy, (this.y - previousY) / dt, CURSOR.velocityHalfLife, dt), -max, max)

    this.step = Math.hypot(this.x - previousX, this.y - previousY)
    this.pathLength += this.step
    this.speed = Math.hypot(this.vx, this.vy)
    if (this.speed > 0.02) this.heading = Math.atan2(this.vy, this.vx)

    // Energy follows speed up at once and drains back slowly: the "settling" the visitor sees.
    const drive = Math.min(1, this.speed / CURSOR.velocityRef)
    this.energy = Math.max(drive, damp(this.energy, 0, CURSOR.energyHalfLife, dt))
    this.presence = this.speed > 0.05 ? 1 : damp(this.presence, 0, CURSOR.presenceHalfLife, dt)
  }

  /** Whether any click wave is still travelling at `now` (same clock as `ripple`). */
  hasActiveRipples(now: number): boolean {
    for (let i = 0; i < CURSOR.maxRipples; i++) {
      if (now - this.ripples[i * 4 + 2] < FIELD.rippleSeconds) return true
    }
    return false
  }

  /** Back to the calm state, keeping the position where it is. */
  rest(): void {
    this.targetX = this.x
    this.targetY = this.y
    this.vx = 0
    this.vy = 0
    this.energy = 0
    this.presence = 0
    this.speed = 0
    this.step = 0
  }

  /** True while anything is still moving or fading; false once the graphic has come to rest. */
  get settled(): boolean {
    return (
      this.energy < 0.002 &&
      this.presence < 0.04 &&
      Math.abs(this.targetX - this.x) < 0.001 &&
      Math.abs(this.targetY - this.y) < 0.001
    )
  }
}
