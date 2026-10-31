import { seededRandom } from '../../../hero/heroMath'

/**
 * The letters' physics: each letter is a rigid body with six springs (three of position, three of
 * rotation) pulling it to where it belongs. Plain arrays and no allocation per step, so it is
 * tested on its own.
 *
 * The pointer tilts and lifts the letters near it and pushes them a little aside, which is what
 * makes the type feel like objects in a room. A scatter throws every letter and loosens the
 * springs, which tighten again over a second or so, so the sentence assembles itself back. Broken
 * apart, each letter settles on its own offset (a little aside, a little forward, a little
 * turned) and its layers pull apart; reassembling sends everything home.
 */

export const DOF = 6
export const MAX = 24

const SPRING = 34
const DAMPING = 6.4
const LOOSEN_SECONDS = 1.4

export interface TypeForces {
  /** Pointer in the text plane, in the same units as the letters' homes. */
  x: number
  y: number
  vx: number
  vy: number
  /** 0..1 */
  presence: number
  /** Reach of the pointer, in the same units. */
  radius: number
  /** 0..1.5: how hard the pointer tilts and lifts the letters. */
  strength: number
  /** The letters are broken apart: each rests on its own offset. */
  broken: boolean
}

export class LetterField {
  count = 0
  /** Per letter: x, y, z, rotX, rotY, rotZ, as offsets from its home. */
  readonly pose = new Float32Array(MAX * DOF)
  private readonly velocity = new Float32Array(MAX * DOF)
  private readonly target = new Float32Array(DOF)
  /** Where each letter's centre belongs: x, y. */
  readonly homes = new Float32Array(MAX * 2)
  /** Each letter's resting offset when the sentence is broken apart. */
  private readonly rest = new Float32Array(MAX * DOF)
  /** 0..1: how far the layers have pulled apart. */
  split = 0
  /** 0..1: how loose the springs are. A scatter sets it to 1. */
  loosen = 0

  /** Sets the sentence's letters, optionally starting them thrown about so they assemble into place. */
  setLetters(homes: ArrayLike<number>, count: number, scattered: boolean, seed = 3): void {
    this.count = Math.min(count, MAX)
    this.homes.fill(0)
    for (let i = 0; i < this.count * 2; i++) this.homes[i] = homes[i]
    const random = seededRandom(seed * 977 + 13)
    for (let i = 0; i < this.count; i++) {
      const at = i * DOF
      for (let k = 0; k < DOF; k++) this.velocity[at + k] = 0
      if (scattered) {
        this.pose[at] = (random() - 0.5) * 16
        this.pose[at + 1] = (random() - 0.5) * 9
        this.pose[at + 2] = random() * 5 - 1
        this.pose[at + 3] = (random() - 0.5) * 5
        this.pose[at + 4] = (random() - 0.5) * 5
        this.pose[at + 5] = (random() - 0.5) * 5
      } else {
        for (let k = 0; k < DOF; k++) this.pose[at + k] = 0
      }
      // The offsets used while broken apart: modest, so the sentence stays a sentence.
      this.rest[at] = (random() - 0.5) * 0.5
      this.rest[at + 1] = (random() - 0.5) * 0.4
      this.rest[at + 2] = 0.2 + random() * 0.9
      this.rest[at + 3] = (random() - 0.5) * 0.55
      this.rest[at + 4] = (random() - 0.5) * 0.55
      this.rest[at + 5] = (random() - 0.5) * 0.45
    }
    this.loosen = scattered ? 1 : 0
    this.split = 0
  }

  /** Throws every letter away from a point and loosens the springs. */
  scatter(cx: number, cy: number, strength: number, seed = 1): void {
    const random = seededRandom(seed * 7919 + this.count)
    for (let i = 0; i < this.count; i++) {
      const at = i * DOF
      const dx = this.homes[i * 2] + this.pose[at] - cx
      const dy = this.homes[i * 2 + 1] + this.pose[at + 1] - cy
      const distance = Math.hypot(dx, dy) + 0.5
      const push = (strength * 16) / (1 + distance * 0.18)
      this.velocity[at] += (dx / distance) * push * (0.6 + random() * 0.8)
      this.velocity[at + 1] += (dy / distance) * push * (0.6 + random() * 0.8) + (random() - 0.3) * strength * 3
      this.velocity[at + 2] += (1 + random() * 3) * strength * 4
      this.velocity[at + 3] += (random() - 0.5) * 11 * strength
      this.velocity[at + 4] += (random() - 0.5) * 11 * strength
      this.velocity[at + 5] += (random() - 0.5) * 9 * strength
    }
    this.loosen = 1
  }

  step(dt: number, forces: TypeForces): void {
    if (dt <= 0) return
    const { pose, velocity, rest, homes } = this
    const loose = this.loosen
    this.loosen = Math.max(0, this.loosen - dt / LOOSEN_SECONDS)
    const spring = SPRING * (1 - 0.9 * loose * loose)
    const damping = Math.exp(-DAMPING * dt * (1 - 0.4 * loose))
    const reach2 = forces.radius * forces.radius
    const broken = forces.broken
    this.split += ((broken ? 1 : 0) - this.split) * Math.min(1, dt * 4.5)

    for (let i = 0; i < this.count; i++) {
      const at = i * DOF
      const hx = homes[i * 2] + pose[at]
      const hy = homes[i * 2 + 1] + pose[at + 1]
      const dx = hx - forces.x
      const dy = hy - forces.y
      const near = Math.exp(-(dx * dx + dy * dy) / reach2) * forces.presence * forces.strength
      const distance = Math.hypot(dx, dy) + 0.0001

      // Where each spring is pulling to: home (or the broken-apart offset), shifted by the pointer.
      const targets = this.target
      targets[0] = (broken ? rest[at] : 0) + (dx / distance) * near * 0.3
      targets[1] = (broken ? rest[at + 1] : 0) + (dy / distance) * near * 0.22
      targets[2] = (broken ? rest[at + 2] : 0) + near * 1.6
      targets[3] = (broken ? rest[at + 3] : 0) + (dy / forces.radius) * near * 0.62
      targets[4] = (broken ? rest[at + 4] : 0) - (dx / forces.radius) * near * 0.62
      targets[5] = (broken ? rest[at + 5] : 0) + Math.max(-0.5, Math.min(0.5, forces.vx * 0.25)) * near
      for (let k = 0; k < DOF; k++) {
        const v = (velocity[at + k] + (targets[k] - pose[at + k]) * spring * dt) * damping
        velocity[at + k] = v
        pose[at + k] += v * dt
      }
    }
  }

  /** How restless the letters are: the fastest any of them is moving (plus any loosening), for deciding whether an on-demand canvas may stop. */
  get unrest(): number {
    let fastest = 0
    for (let i = 0; i < this.count * DOF; i++) fastest = Math.max(fastest, Math.abs(this.velocity[i]))
    return fastest + this.loosen
  }

  /** How far the letters are from their (non-broken) homes: the largest offset. */
  get offset(): number {
    let worst = 0
    for (let i = 0; i < this.count; i++) {
      worst = Math.max(worst, Math.hypot(this.pose[i * DOF], this.pose[i * DOF + 1], this.pose[i * DOF + 2]))
    }
    return worst
  }
}
