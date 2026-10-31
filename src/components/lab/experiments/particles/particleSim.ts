import { clamp, seededRandom } from '../../../hero/heroMath'
import { generateShape, type ShapeId } from './particleShapes'

/**
 * The particles' physics, on the CPU in typed arrays, with nothing allocated per frame. Plain code
 * (no DOM, no WebGL), so it is tested and its cost is known: each particle does a spring, one
 * pointer force, one bilinear read of the flow field and a few multiplications.
 *
 * Every particle has a home in the current shape and a spring pulling it there. On top of that:
 *   - the pointer pulls particles in or pushes them away, within a radius, fading to nothing at its edge;
 *   - the flow field carries the pointer's movement through them like a current;
 *   - a burst throws them outward and loosens the springs, which tighten again over a second or two,
 *     so the structure re-forms gradually instead of snapping back;
 *   - a slow ambient swirl keeps a resting cloud alive without moving it far from its shape.
 * Each particle has its own stiffness and weight, so they arrive at different times.
 */

export interface ParticleForces {
  /** Pointer position in the cloud's space. */
  x: number
  y: number
  /** Pointer velocity in the cloud's space, units per second. */
  vx: number
  vy: number
  /** 0..1: how present the pointer is. */
  presence: number
  /** +1 pulls particles towards the pointer, -1 pushes them away. */
  sign: 1 | -1
  /** The user's interaction strength, about 0.2..2. */
  strength: number
  /** Reach of the pointer's force, in the cloud's units. */
  radius: number
  /** Seconds on the Lab clock, for the ambient swirl. */
  time: number
  /** Scales the ambient swirl: 0 holds a resting cloud perfectly still. */
  ambient: number
}

/** A coarse grid of 2D velocities covering the cloud's view: the "fluid" the pointer stirs. */
export class FlowField {
  readonly cols: number
  readonly rows: number
  private field: Float32Array
  private scratch: Float32Array
  private halfWidth = 1
  private halfHeight = 1

  constructor(cols: number, rows: number) {
    this.cols = cols
    this.rows = rows
    this.field = new Float32Array(cols * rows * 2)
    this.scratch = new Float32Array(cols * rows * 2)
  }

  /** The cloud-space extent the grid covers: x in [-halfWidth, halfWidth], y likewise. */
  setBounds(halfWidth: number, halfHeight: number): void {
    this.halfWidth = Math.max(halfWidth, 0.01)
    this.halfHeight = Math.max(halfHeight, 0.01)
  }

  clear(): void {
    this.field.fill(0)
    this.scratch.fill(0)
  }

  /** Adds the pointer's velocity to the cells around it, with a soft Gaussian falloff. */
  splat(x: number, y: number, vx: number, vy: number, radius: number, amount: number): void {
    const { cols, rows, field } = this
    const cx = ((x / this.halfWidth) * 0.5 + 0.5) * (cols - 1)
    const cy = ((y / this.halfHeight) * 0.5 + 0.5) * (rows - 1)
    const rx = (radius / (this.halfWidth * 2)) * (cols - 1)
    const ry = (radius / (this.halfHeight * 2)) * (rows - 1)
    const x0 = Math.max(0, Math.floor(cx - rx * 2))
    const x1 = Math.min(cols - 1, Math.ceil(cx + rx * 2))
    const y0 = Math.max(0, Math.floor(cy - ry * 2))
    const y1 = Math.min(rows - 1, Math.ceil(cy + ry * 2))
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const dx = (i - cx) / Math.max(rx, 0.5)
        const dy = (j - cy) / Math.max(ry, 0.5)
        const weight = Math.exp(-(dx * dx + dy * dy)) * amount
        const at = (j * cols + i) * 2
        field[at] += vx * weight
        field[at + 1] += vy * weight
      }
    }
  }

  /** The current slows and spreads: a little diffusion each step and an exponential decay. */
  step(dt: number): void {
    const { cols, rows } = this
    const decay = Math.exp(-dt * 1.7)
    const mix = Math.min(0.5, dt * 14)
    const src = this.field
    const dst = this.scratch
    for (let j = 0; j < rows; j++) {
      const up = Math.max(j - 1, 0)
      const down = Math.min(j + 1, rows - 1)
      for (let i = 0; i < cols; i++) {
        const left = Math.max(i - 1, 0)
        const right = Math.min(i + 1, cols - 1)
        const at = (j * cols + i) * 2
        for (let c = 0; c < 2; c++) {
          const around =
            (src[(j * cols + left) * 2 + c] +
              src[(j * cols + right) * 2 + c] +
              src[(up * cols + i) * 2 + c] +
              src[(down * cols + i) * 2 + c]) *
            0.25
          dst[at + c] = (src[at + c] + (around - src[at + c]) * mix) * decay
        }
      }
    }
    this.field = dst
    this.scratch = src
  }

  /** Bilinear read of the current at a point, written to `out` (no allocation). */
  sample(x: number, y: number, out: { x: number; y: number }): void {
    const { cols, rows, field } = this
    const fx = clamp((x / this.halfWidth) * 0.5 + 0.5, 0, 1) * (cols - 1)
    const fy = clamp((y / this.halfHeight) * 0.5 + 0.5, 0, 1) * (rows - 1)
    const i = Math.min(Math.floor(fx), cols - 2)
    const j = Math.min(Math.floor(fy), rows - 2)
    const tx = fx - i
    const ty = fy - j
    const a = (j * cols + i) * 2
    const b = a + 2
    const c = a + cols * 2
    const d = c + 2
    const w00 = (1 - tx) * (1 - ty)
    const w10 = tx * (1 - ty)
    const w01 = (1 - tx) * ty
    const w11 = tx * ty
    out.x = field[a] * w00 + field[b] * w10 + field[c] * w01 + field[d] * w11
    out.y = field[a + 1] * w00 + field[b + 1] * w10 + field[c + 1] * w01 + field[d + 1] * w11
  }

  /** The strongest current anywhere, for tests and for deciding whether the field is at rest. */
  get peak(): number {
    let max = 0
    for (let i = 0; i < this.field.length; i++) max = Math.max(max, Math.abs(this.field[i]))
    return max
  }
}

const SPRING = 5.2
const DAMPING = 2.3
const POINTER_FORCE = 24
const FLOW_FORCE = 1.35
const MAX_SPEED = 20
/** Particles stay within this depth range, so a burst never throws one through the camera. */
const DEPTH_MIN = -7
const DEPTH_MAX = 4
/** Seconds for the springs to tighten again after a burst or a change of shape. */
const LOOSEN_SECONDS = 1.6

export class ParticleSim {
  readonly capacity: number
  readonly positions: Float32Array
  readonly velocities: Float32Array
  readonly targets: Float32Array
  /** 0..1 per particle: how fast it moves, smoothed. Drives its colour. */
  readonly heat: Float32Array
  /** Per particle: size, depth layer (0 back .. 1 front), colour tone and a random. Static. */
  readonly seeds: Float32Array

  /** 0..1: how loose the springs are right now. A burst sets it to 1; it drains back to 0. */
  loosen = 0
  /** How many particles are alive. Fewer than capacity when the density is lowered. */
  active: number

  private shape: ShapeId
  private readonly current = { x: 0, y: 0 }

  constructor(capacity: number, shape: ShapeId) {
    this.capacity = capacity
    this.active = capacity
    this.shape = shape
    this.positions = new Float32Array(capacity * 3)
    this.velocities = new Float32Array(capacity * 3)
    this.heat = new Float32Array(capacity)
    this.seeds = new Float32Array(capacity * 4)
    this.targets = generateShape(shape, capacity)

    const random = seededRandom(5)
    for (let i = 0; i < capacity; i++) {
      const layer = random()
      this.seeds[i * 4] = 0.6 + Math.pow(random(), 2.2) * 1.0
      this.seeds[i * 4 + 1] = layer
      this.seeds[i * 4 + 2] = random()
      this.seeds[i * 4 + 3] = random()
    }
    this.settle()
  }

  get currentShape(): ShapeId {
    return this.shape
  }

  /** Puts every particle on its home, still. */
  settle(): void {
    this.positions.set(this.targets)
    this.velocities.fill(0)
    this.heat.fill(0)
    this.loosen = 0
  }

  /** Re-forms the cloud as another shape: the particles fly to their new homes, loosely. */
  setShape(shape: ShapeId): void {
    if (shape === this.shape) return
    this.shape = shape
    this.targets.set(generateShape(shape, this.capacity))
    this.loosen = Math.max(this.loosen, 0.7)
  }

  /** Changes how many particles are alive. The ones that come back start on their homes, so none pops in from the middle of nowhere. */
  setActive(count: number): void {
    const next = Math.max(1, Math.min(this.capacity, Math.round(count)))
    if (next > this.active) {
      for (let i = this.active; i < next; i++) {
        const at = i * 3
        this.positions[at] = this.targets[at]
        this.positions[at + 1] = this.targets[at + 1]
        this.positions[at + 2] = this.targets[at + 2]
        this.velocities[at] = this.velocities[at + 1] = this.velocities[at + 2] = 0
        this.heat[i] = 0
      }
    }
    this.active = next
  }

  /** Throws the particles outward from a point in the cloud's space, with a random push in depth, and loosens the springs. */
  burst(x: number, y: number, strength: number): void {
    const { positions, velocities, seeds } = this
    for (let i = 0; i < this.active; i++) {
      const at = i * 3
      const dx = positions[at] - x
      const dy = positions[at + 1] - y
      const dz = positions[at + 2]
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001
      const push = (strength * 11) / (0.9 + distance * 0.55)
      const weight = 0.55 + seeds[i * 4 + 3] * 0.9
      velocities[at] += (dx / distance) * push * weight
      velocities[at + 1] += (dy / distance) * push * weight
      velocities[at + 2] += (dz / distance + (seeds[i * 4 + 2] - 0.5) * 1.2) * push * weight * 0.4
    }
    this.loosen = 1
  }

  /** Advances the particles by `dt` seconds. */
  step(dt: number, forces: ParticleForces, flow: FlowField | null): void {
    if (dt <= 0) return
    const { positions, velocities, targets, heat, seeds } = this
    const loose = this.loosen
    this.loosen = Math.max(0, this.loosen - dt / LOOSEN_SECONDS)
    const spring = SPRING * (1 - 0.88 * loose * loose)
    const damping = Math.exp(-DAMPING * dt * (1 - 0.35 * loose))
    const radius = forces.radius
    const radiusSquared = radius * radius
    const pointerGain = POINTER_FORCE * forces.strength * forces.presence * forces.sign
    const flowGain = FLOW_FORCE * forces.strength
    const time = forces.time
    const swirl = 0.34 * forces.ambient
    const heatRise = Math.min(1, dt * 9)
    const out = this.current

    for (let i = 0; i < this.active; i++) {
      const at = i * 3
      const seedAt = i * 4
      const stiffness = 0.65 + seeds[seedAt + 3] * 0.8
      const px = positions[at]
      const py = positions[at + 1]
      const pz = positions[at + 2]

      let ax = (targets[at] - px) * spring * stiffness
      let ay = (targets[at + 1] - py) * spring * stiffness
      let az = (targets[at + 2] - pz) * spring * stiffness

      // The pointer: strongest at its centre, nothing beyond the radius.
      const dx = px - forces.x
      const dy = py - forces.y
      const d2 = dx * dx + dy * dy
      if (d2 < radiusSquared && pointerGain !== 0) {
        const distance = Math.sqrt(d2) + 0.0001
        const falloff = 1 - distance / radius
        const f = falloff * falloff * pointerGain * (0.55 + 0.9 * seeds[seedAt + 3])
        ax -= (dx / distance) * f
        ay -= (dy / distance) * f
        // Attracted particles also come towards the pointer's plane; repelled ones are pushed back from it.
        az -= (pz / (Math.abs(pz) + 0.5)) * f * 0.25
      }

      if (flow) {
        flow.sample(px, py, out)
        const response = 0.5 + seeds[seedAt + 1] * 0.9
        ax += out.x * flowGain * response
        ay += out.y * flowGain * response
      }

      if (swirl > 0) {
        const phase = seeds[seedAt + 2] * 6.2832
        ax += Math.sin(py * 1.3 + time * 0.6 + phase) * swirl
        ay += Math.cos(px * 1.1 - time * 0.5 + phase) * swirl
        az += Math.sin((px + py) * 0.9 + time * 0.4 + phase) * swirl * 0.7
      }

      let vx = (velocities[at] + ax * dt) * damping
      let vy = (velocities[at + 1] + ay * dt) * damping
      let vz = (velocities[at + 2] + az * dt) * damping
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz)
      if (speed > MAX_SPEED) {
        const k = MAX_SPEED / speed
        vx *= k
        vy *= k
        vz *= k
      }
      velocities[at] = vx
      velocities[at + 1] = vy
      velocities[at + 2] = vz
      positions[at] = px + vx * dt
      positions[at + 1] = py + vy * dt
      positions[at + 2] = clamp(pz + vz * dt, DEPTH_MIN, DEPTH_MAX)

      heat[i] += (Math.min(1, speed / 7) - heat[i]) * heatRise
    }
  }

  /** The mean distance of the live particles from their homes: how far the cloud is from its shape. */
  disorder(): number {
    let total = 0
    for (let i = 0; i < this.active; i++) {
      const at = i * 3
      total += Math.hypot(
        this.positions[at] - this.targets[at],
        this.positions[at + 1] - this.targets[at + 1],
        this.positions[at + 2] - this.targets[at + 2],
      )
    }
    return total / Math.max(this.active, 1)
  }
}
