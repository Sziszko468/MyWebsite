import { PALETTES, rng, type ArtParams, type Formation } from './artParams'

/**
 * The particles of the Generative Art Engine, simulated on the CPU in typed arrays that are also the
 * GPU's buffers. Each particle has a home on a shape (the formation); a spring pulls it there, the
 * pointer pushes or pulls it, turbulence stirs it, gravity weighs on it and a click throws it. The
 * numbers a piece is made of are the parameters; nothing here allocates while it runs.
 */

/** Spring strength towards a particle's home, and how fast its speed dies away, per second. */
const STIFFNESS = 3.2
const DAMPING = 2.2
const GRAVITY = 3
/** How far, in world units, the pointer reaches. */
export const POINTER_RADIUS = 2.4

export interface PointerState {
  x: number
  y: number
  z: number
  active: boolean
}

export function newPointer(): PointerState {
  return { x: 0, y: 0, z: 0, active: false }
}

function formationPoint(
  kind: Formation,
  i: number,
  n: number,
  a: number,
  b: number,
  c: number,
  scale: number,
  out: Float32Array,
  at: number,
): void {
  const R = 2.2 * scale
  let x = 0
  let y = 0
  let z = 0
  switch (kind) {
    case 'sphere': {
      // A spiral of points over the sphere keeps them evenly spread.
      const t = (i + 0.5) / n
      const phi = Math.acos(1 - 2 * t)
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5)
      const r = R * (0.92 + 0.16 * c)
      x = r * Math.sin(phi) * Math.cos(theta)
      y = r * Math.cos(phi)
      z = r * Math.sin(phi) * Math.sin(theta)
      break
    }
    case 'torus': {
      const u = a * Math.PI * 2
      const v = b * Math.PI * 2
      const tube = 0.75 * scale * (0.6 + 0.4 * c)
      const ring = R * 0.95
      x = (ring + tube * Math.cos(v)) * Math.cos(u)
      y = tube * Math.sin(v)
      z = (ring + tube * Math.cos(v)) * Math.sin(u)
      break
    }
    case 'spiral': {
      const t = (i + 0.5) / n
      const turns = 7
      const angle = t * Math.PI * 2 * turns
      const radius = R * (0.25 + 0.75 * t) + (c - 0.5) * 0.25
      x = radius * Math.cos(angle)
      z = radius * Math.sin(angle)
      y = (t - 0.5) * R * 1.6 + (b - 0.5) * 0.25
      break
    }
    case 'lattice': {
      const side = Math.max(2, Math.ceil(Math.cbrt(n)))
      const gx = i % side
      const gy = Math.floor(i / side) % side
      const gz = Math.floor(i / (side * side))
      const span = R * 1.7
      x = (gx / (side - 1) - 0.5) * span
      y = (gy / (side - 1) - 0.5) * span
      z = (gz / (side - 1) - 0.5) * span
      break
    }
    case 'wave': {
      const side = Math.max(2, Math.ceil(Math.sqrt(n)))
      const gx = i % side
      const gz = Math.floor(i / side)
      const span = R * 2.1
      x = (gx / (side - 1) - 0.5) * span
      z = (gz / (side - 1) - 0.5) * span
      y = Math.sin(x * 1.6) * Math.cos(z * 1.3) * R * 0.32 + (c - 0.5) * 0.08
      break
    }
    case 'galaxy': {
      const arms = 3
      const arm = i % arms
      const t = Math.pow(a, 0.7)
      const angle = t * 9 + (arm * Math.PI * 2) / arms
      const radius = R * 1.15 * t
      const scatter = (1 - t * 0.6) * 0.45
      x = radius * Math.cos(angle) + (b - 0.5) * scatter
      z = radius * Math.sin(angle) + (c - 0.5) * scatter
      y = rngCentre(b, c) * (1 - t) * 0.5
      break
    }
  }
  out[at] = x
  out[at + 1] = y
  out[at + 2] = z
}

const rngCentre = (b: number, c: number) => (b + c - 1) * 1.1

/** A cheap smooth warp field: what the distortion bends the shape by. */
function warp(x: number, y: number, z: number, amount: number, out: Float32Array, at: number): void {
  out[at] += Math.sin(y * 1.7 + z * 0.9) * amount
  out[at + 1] += Math.sin(z * 1.5 + x * 1.1) * amount
  out[at + 2] += Math.sin(x * 1.3 + y * 1.2) * amount
}

export class ParticleField {
  readonly capacity: number
  count = 0
  readonly position: Float32Array
  readonly velocity: Float32Array
  readonly home: Float32Array
  /** Three stable random numbers per particle. */
  readonly chance: Float32Array
  /** Palette index (0 to 2) and size factor per particle. */
  readonly colourIndex: Uint8Array
  readonly size: Float32Array
  angle = 0
  time = 0

  constructor(capacity: number) {
    this.capacity = capacity
    this.position = new Float32Array(capacity * 3)
    this.velocity = new Float32Array(capacity * 3)
    this.home = new Float32Array(capacity * 3)
    this.chance = new Float32Array(capacity * 3)
    this.colourIndex = new Uint8Array(capacity)
    this.size = new Float32Array(capacity)
  }

  /** Lays the particles out for a set of parameters, each at rest on its home. */
  build(params: ArtParams): void {
    this.count = Math.min(params.count, this.capacity)
    const random = rng(params.seed)
    for (let i = 0; i < this.count; i++) {
      this.chance[i * 3] = random()
      this.chance[i * 3 + 1] = random()
      this.chance[i * 3 + 2] = random()
      // Mostly the first colour, then the second, now and then the third: a palette has a main voice.
      const pick = random()
      this.colourIndex[i] = pick < 0.5 ? 0 : pick < 0.85 ? 1 : 2
    }
    this.retarget(params)
    this.position.set(this.home.subarray(0, this.count * 3))
    this.velocity.fill(0)
    this.angle = 0
  }

  /** Moves the homes (a new shape, scale or distortion) without throwing the particles back to rest. */
  retarget(params: ArtParams): void {
    const n = this.count
    for (let i = 0; i < n; i++) {
      const k = i * 3
      formationPoint(
        params.formation,
        i,
        n,
        this.chance[k],
        this.chance[k + 1],
        this.chance[k + 2],
        params.scale,
        this.home,
        k,
      )
      if (params.distortion > 0)
        warp(this.home[k], this.home[k + 1], this.home[k + 2], params.distortion * 0.9, this.home, k)
      this.size[i] = 0.55 + this.chance[k + 2] * (0.5 + params.noise * 1.1)
    }
  }

  /** A burst from a point: everything near it is thrown outwards, harder the closer it was. */
  impulse(x: number, y: number, z: number, strength: number): void {
    const reach = POINTER_RADIUS * 1.6
    for (let i = 0; i < this.count; i++) {
      const k = i * 3
      const dx = this.position[k] - x
      const dy = this.position[k + 1] - y
      const dz = this.position[k + 2] - z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (distance > reach) continue
      const push = (strength * (1 - distance / reach) * 9) / (distance + 0.35)
      this.velocity[k] += (dx / (distance + 0.001)) * push
      this.velocity[k + 1] += (dy / (distance + 0.001)) * push
      this.velocity[k + 2] += (dz / (distance + 0.001)) * push
    }
  }

  /** Advances by `dt` seconds. `motion` scales how lively everything is (less when motion should be calm). */
  step(dt: number, params: ArtParams, pointer: PointerState, motion: number): void {
    const step = Math.min(dt, 0.05) * params.speed * motion
    if (step <= 0) return
    this.time += step
    this.angle += params.rotation * step
    const cos = Math.cos(this.angle)
    const sin = Math.sin(this.angle)
    const t = this.time
    const damp = Math.exp(-DAMPING * step)
    const pointerSign = params.pointer === 'repel' ? 1 : -1
    const forceScale = params.force * pointerSign
    const radiusSq = POINTER_RADIUS * POINTER_RADIUS
    const gravity = params.gravity * GRAVITY
    const turbulence = params.turbulence * 2.2
    const jitter = params.noise * 0.9
    const { position, velocity, home, chance } = this
    for (let i = 0; i < this.count; i++) {
      const k = i * 3
      let px = position[k]
      let py = position[k + 1]
      let pz = position[k + 2]
      // The home, turned with the shape.
      const hx = cos * home[k] + sin * home[k + 2]
      const hy = home[k + 1]
      const hz = -sin * home[k] + cos * home[k + 2]
      let ax = (hx - px) * STIFFNESS
      let ay = (hy - py) * STIFFNESS - gravity
      let az = (hz - pz) * STIFFNESS
      if (turbulence > 0) {
        ax += Math.sin(py * 1.3 + t * 0.9 + chance[k] * 2) * turbulence
        ay += Math.sin(pz * 1.1 + t * 0.7) * turbulence
        az += Math.sin(px * 1.2 + t * 1.1 + chance[k + 1] * 2) * turbulence
      }
      if (jitter > 0) {
        const wobble = Math.sin(t * 3 + chance[k + 2] * 40) * jitter
        ax += wobble
        az -= wobble
      }
      if (pointer.active && forceScale !== 0) {
        const dx = px - pointer.x
        const dy = py - pointer.y
        const dz = pz - pointer.z
        const distanceSq = dx * dx + dy * dy + dz * dz
        if (distanceSq < radiusSq) {
          const distance = Math.sqrt(distanceSq) + 0.05
          const falloff = 1 - distance / POINTER_RADIUS
          const push = (forceScale * falloff * falloff * 26) / (distance + 0.25)
          ax += (dx / distance) * push
          ay += (dy / distance) * push
          az += (dz / distance) * push
        }
      }
      let vx = (velocity[k] + ax * step) * damp
      let vy = (velocity[k + 1] + ay * step) * damp
      let vz = (velocity[k + 2] + az * step) * damp
      // A particle thrown very far is brought back: nothing leaves the picture for good.
      const speedSq = vx * vx + vy * vy + vz * vz
      if (speedSq > 900) {
        const limit = 30 / Math.sqrt(speedSq)
        vx *= limit
        vy *= limit
        vz *= limit
      }
      px += vx * step
      py += vy * step
      pz += vz * step
      velocity[k] = vx
      velocity[k + 1] = vy
      velocity[k + 2] = vz
      position[k] = px
      position[k + 1] = py
      position[k + 2] = pz
    }
  }

  /** Fills a colour buffer from a palette, with the noise setting varying each particle's brightness a little. */
  paint(params: ArtParams, out: Float32Array): void {
    const palette = PALETTES[params.palette].map((hex) => [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ])
    for (let i = 0; i < this.count; i++) {
      const colour = palette[this.colourIndex[i]]
      const shade = 1 - params.noise * 0.45 * this.chance[i * 3 + 1]
      out[i * 3] = colour[0] * shade
      out[i * 3 + 1] = colour[1] * shade
      out[i * 3 + 2] = colour[2] * shade
    }
  }

  /** Mean distance of the particles from their homes (turned as they are now): how disturbed the picture is. */
  disturbance(): number {
    const cos = Math.cos(this.angle)
    const sin = Math.sin(this.angle)
    let sum = 0
    for (let i = 0; i < this.count; i++) {
      const k = i * 3
      const hx = cos * this.home[k] + sin * this.home[k + 2]
      const hz = -sin * this.home[k] + cos * this.home[k + 2]
      sum += Math.hypot(hx - this.position[k], this.home[k + 1] - this.position[k + 1], hz - this.position[k + 2])
    }
    return sum / Math.max(this.count, 1)
  }
}
