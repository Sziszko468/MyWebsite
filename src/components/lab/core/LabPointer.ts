import { clamp, damp } from '../../hero/heroMath'

/** One click or tap on a stage, in stage space. */
export interface LabPulse {
  x: number
  y: number
  /** Seconds on the Lab clock when it started. */
  time: number
  strength: number
}

const MAX_PULSES = 4

/** Seconds for the eased position and velocity to cover half the distance to where they are going. */
const POSITION_HALF_LIFE = 0.07
const VELOCITY_HALF_LIFE = 0.08
/** Seconds for the energy to halve once the pointer rests. */
const ENERGY_HALF_LIFE = 0.55
/** Seconds for the presence to halve after the pointer left or stopped. */
const PRESENCE_HALF_LIFE = 0.5
/** Screen units per second that count as full energy. */
const VELOCITY_REFERENCE = 2.2
const MAX_VELOCITY = 8

/**
 * The visitor's pointer, finger or keyboard as the Lab's scenes see it. A scene never reads raw
 * events: it reads a position that eases towards the real one, a velocity measured on that eased
 * position, an `energy` that rises with movement and drains away once it stops, and a `presence`
 * that says whether anyone is there. Pure (no DOM, no WebGL), so it is driven from the page's
 * events and from tests alike. All positions are in stage space: -1..1 on both axes, y up.
 *
 * Mutated in place from event handlers and per frame, never copied into React state.
 */
export class LabPointer {
  x = 0
  y = 0
  vx = 0
  vy = 0
  speed = 0
  energy = 0
  /** 0..1: 1 while the pointer is over the stage or pressed, easing to 0 afterwards. */
  presence = 0
  /** Pressed: a mouse button, a finger or a pen is down on the stage. */
  down = false
  /** The pointer is over the stage (or a finger is on it). */
  inside = false
  /** The last input was a finger. */
  touch = false
  /** The viewer has interacted at least once (the stage hides its hint). */
  touched = false
  /** Drag since the last `takeDrag()`, in stage units; scenes turn it into rotation. */
  dragX = 0
  dragY = 0
  /** Bumped when a pulse is added, so a scene copies the pulses only when they changed. */
  pulseVersion = 0
  readonly pulses: LabPulse[] = Array.from({ length: MAX_PULSES }, () => ({ x: 0, y: 0, time: -1e4, strength: 0 }))

  /** Called after any input, so a stage that renders on demand knows it has work to do. */
  onActivity: (() => void) | null = null

  private targetX = 0
  private targetY = 0
  private hasTarget = false
  private nextPulse = 0
  private lastDownX = 0
  private lastDownY = 0

  /** Moves the real position. The first call places the eased position there directly. */
  setTarget(x: number, y: number): void {
    this.targetX = clamp(x, -1.4, 1.4)
    this.targetY = clamp(y, -1.4, 1.4)
    if (!this.hasTarget) {
      this.x = this.targetX
      this.y = this.targetY
      this.hasTarget = true
    }
    if (this.down) {
      this.dragX += this.targetX - this.lastDownX
      this.dragY += this.targetY - this.lastDownY
      this.lastDownX = this.targetX
      this.lastDownY = this.targetY
    }
    this.inside = true
    this.touched = true
    this.onActivity?.()
  }

  press(x: number, y: number, touch: boolean): void {
    this.touch = touch
    this.down = true
    this.setTarget(x, y)
    this.lastDownX = this.targetX
    this.lastDownY = this.targetY
    this.touched = true
    this.onActivity?.()
  }

  release(): void {
    this.down = false
    this.onActivity?.()
  }

  leave(): void {
    this.inside = false
    this.down = false
    this.onActivity?.()
  }

  /** Starts a pulse (a click, a tap, Enter). `time` is the Lab clock's seconds. */
  pulse(x: number, y: number, time: number, strength = 1): void {
    const slot = this.pulses[this.nextPulse]
    slot.x = clamp(x, -1.4, 1.4)
    slot.y = clamp(y, -1.4, 1.4)
    slot.time = time
    slot.strength = strength
    this.nextPulse = (this.nextPulse + 1) % MAX_PULSES
    this.pulseVersion += 1
    this.touched = true
    this.onActivity?.()
  }

  /** Returns the drag gathered since the last call and clears it. */
  takeDrag(out: { x: number; y: number }): void {
    out.x = this.dragX
    out.y = this.dragY
    this.dragX = 0
    this.dragY = 0
  }

  update(dt: number): void {
    if (dt <= 0) return

    const previousX = this.x
    const previousY = this.y
    this.x = damp(this.x, this.targetX, POSITION_HALF_LIFE, dt)
    this.y = damp(this.y, this.targetY, POSITION_HALF_LIFE, dt)

    this.vx = clamp(damp(this.vx, (this.x - previousX) / dt, VELOCITY_HALF_LIFE, dt), -MAX_VELOCITY, MAX_VELOCITY)
    this.vy = clamp(damp(this.vy, (this.y - previousY) / dt, VELOCITY_HALF_LIFE, dt), -MAX_VELOCITY, MAX_VELOCITY)
    this.speed = Math.hypot(this.vx, this.vy)

    const drive = Math.min(1, this.speed / VELOCITY_REFERENCE)
    this.energy = Math.max(drive, damp(this.energy, 0, ENERGY_HALF_LIFE, dt))

    const present = this.inside || this.down
    this.presence = present ? damp(this.presence, 1, 0.05, dt) : damp(this.presence, 0, PRESENCE_HALF_LIFE, dt)
  }

  /** The newest pulse still younger than `seconds` at `now`, or null. */
  newestPulse(now: number, seconds: number): LabPulse | null {
    let newest: LabPulse | null = null
    for (const pulse of this.pulses) {
      if (now - pulse.time < seconds && (!newest || pulse.time > newest.time)) newest = pulse
    }
    return newest
  }

  /** Whether any pulse is still younger than `seconds` at `now`. */
  hasPulses(now: number, seconds: number): boolean {
    return this.newestPulse(now, seconds) !== null
  }

  /** True once nothing is moving or fading any more: an on-demand stage may stop drawing. */
  get settled(): boolean {
    // Presence is steady when it is fully on (a pointer resting over the stage) or fully off.
    const steady = this.presence < 0.01 || this.presence > 0.99
    return (
      this.energy < 0.003 &&
      steady &&
      Math.abs(this.targetX - this.x) < 0.0008 &&
      Math.abs(this.targetY - this.y) < 0.0008 &&
      this.speed < 0.003
    )
  }

  /** Back to the calm state, keeping the position where it is. */
  rest(): void {
    this.targetX = this.x
    this.targetY = this.y
    this.vx = 0
    this.vy = 0
    this.speed = 0
    this.energy = 0
    this.presence = 0
    this.down = false
    this.inside = false
    this.dragX = 0
    this.dragY = 0
  }
}
