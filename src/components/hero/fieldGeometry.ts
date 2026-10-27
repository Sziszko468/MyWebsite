import {
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Vector3,
} from 'three'
import { seededRandom } from './heroMath'
import { FIELD } from './velocityHeroConfig'

// All the field's geometry is built once and never touched again: every motion and every
// reaction to the visitor happens in the vertex shaders (see fieldShaders.ts).

// ── Streaks ────────────────────────────────────────────────────────────

/**
 * One quad, instanced. Each instance carries (angle, radius, depth offset, random) and the
 * shader places it in a tunnel around the view axis, flowing towards the camera.
 */
export function createStreakGeometry(count: number, seed = 3): InstancedBufferGeometry {
  const random = seededRandom(seed)
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(12), 3))
  // x: side of the streak, y: 0 at the tail and 1 at the head.
  geometry.setAttribute('aCorner', new Float32BufferAttribute([-1, 0, 1, 0, -1, 1, 1, 1], 2))
  geometry.setIndex([0, 1, 2, 2, 1, 3])

  const seeds = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    seeds[i * 4] = random() * Math.PI * 2
    seeds[i * 4 + 1] = 2.4 + 28 * Math.pow(random(), 0.75)
    seeds[i * 4 + 2] = random() * FIELD.depth
    seeds[i * 4 + 3] = random()
  }
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4))
  geometry.instanceCount = count
  return geometry
}

// ── Trails ─────────────────────────────────────────────────────────────

export interface TrailSpec {
  /** Distance from the view axis, world units. */
  radius: number
  /** Where around the axis the trail starts, radians. */
  phase: number
  /** How far it winds around the axis over its length, in turns (negative winds the other way). */
  turns: number
  wobble: number
  wobblePhase: number
  /** 0 red, 1 ink, 2 blue. */
  kind: 0 | 1 | 2
  /** How fast its light pulses move relative to the world, and the distance between pulses. */
  rate: number
  pitch: number
  /** Width in pixels at mid distance. */
  width: number
}

/**
 * `fine` trails are the thin ones: hair-width, spread out to the edges of the field, winding
 * more, with their light pulses closer together. They are added to the main trails to give the
 * field a finer grain.
 */
export function makeTrailSpecs(count: number, seed = 5, fine = false): TrailSpec[] {
  const random = seededRandom(seed)
  return Array.from({ length: count }, (_, index) => {
    // Red leads; ink and blue are the supporting colours.
    const pick = (index + random() * 0.5) / count
    if (fine) {
      return {
        radius: 2.5 + 27 * Math.pow(random(), 1.1),
        phase: random() * Math.PI * 2,
        turns: (0.1 + random() * 0.85) * (random() < 0.5 ? -1 : 1),
        wobble: 0.08 + random() * 0.32,
        wobblePhase: random() * Math.PI * 2,
        kind: pick < 0.5 ? 0 : pick < 0.8 ? 1 : 2,
        rate: 0.6 + random() * 2,
        pitch: 14 + random() * 30,
        width: 0.7 + random() * 0.8,
      }
    }
    return {
      radius: 3.5 + 15 * Math.pow(random(), 1.3),
      phase: random() * Math.PI * 2,
      turns: (0.15 + random() * 0.5) * (random() < 0.5 ? -1 : 1),
      wobble: 0.1 + random() * 0.2,
      wobblePhase: random() * Math.PI * 2,
      kind: pick < 0.55 ? 0 : pick < 0.8 ? 1 : 2,
      rate: 0.8 + random() * 1.6,
      pitch: 28 + random() * 40,
      width: 1.6 + random() * 2.6,
    }
  })
}

/** A point on a trail at `s` (0 near the camera .. 1 at the far end). */
export function trailPoint(spec: TrailSpec, s: number, out: Vector3 = new Vector3()): Vector3 {
  const angle = spec.phase + spec.turns * s * Math.PI * 2
  const radius = spec.radius * (1 + spec.wobble * Math.sin(s * 6 + spec.wobblePhase))
  return out.set(Math.cos(angle) * radius * 1.6, Math.sin(angle) * radius, -(2 + s * (FIELD.depth - 2)))
}

/** Every trail as one ribbon strip in a single geometry, so all of them cost one draw call. */
export function createTrailGeometry(specs: readonly TrailSpec[], segments: number, seed = 9): BufferGeometry {
  const random = seededRandom(seed)
  const vertices = specs.length * (segments + 1) * 2
  const position = new Float32Array(vertices * 3)
  const previous = new Float32Array(vertices * 3)
  const next = new Float32Array(vertices * 3)
  const side = new Float32Array(vertices)
  const along = new Float32Array(vertices)
  const trailSeed = new Float32Array(vertices)
  const info = new Float32Array(vertices * 4)
  const indices: number[] = []

  const here = new Vector3()
  const before = new Vector3()
  const after = new Vector3()
  const step = 1 / segments

  specs.forEach((spec, trail) => {
    const seedValue = random()
    const base = trail * (segments + 1) * 2

    for (let j = 0; j <= segments; j++) {
      const s = j * step
      trailPoint(spec, s, here)
      trailPoint(spec, Math.max(0, s - step), before)
      trailPoint(spec, Math.min(1, s + step), after)

      for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
        const v = base + j * 2 + sideIndex
        here.toArray(position, v * 3)
        before.toArray(previous, v * 3)
        after.toArray(next, v * 3)
        side[v] = sideIndex === 0 ? -1 : 1
        along[v] = s
        trailSeed[v] = seedValue
        info[v * 4] = spec.rate
        info[v * 4 + 1] = spec.pitch
        info[v * 4 + 2] = spec.width
        info[v * 4 + 3] = spec.kind
      }

      if (j < segments) {
        const a = base + j * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('aPrev', new Float32BufferAttribute(previous, 3))
  geometry.setAttribute('aNext', new Float32BufferAttribute(next, 3))
  geometry.setAttribute('aSide', new Float32BufferAttribute(side, 1))
  geometry.setAttribute('aS', new Float32BufferAttribute(along, 1))
  geometry.setAttribute('aSeed', new Float32BufferAttribute(trailSeed, 1))
  geometry.setAttribute('aInfo', new Float32BufferAttribute(info, 4))
  geometry.setIndex(indices)
  return geometry
}

// ── Surfaces ───────────────────────────────────────────────────────────

export interface GridOptions {
  /** Lines that run along the flow. */
  lines: number
  spacing: number
  segmentsZ: number
  /** Distance between the lines that run across the flow, and how finely each is divided. */
  crossSpacing: number
  segmentsX: number
}

export const GRID: GridOptions = { lines: 31, spacing: 1.8, segmentsZ: 56, crossSpacing: 5, segmentsX: 48 }

/**
 * A grid as line segments. Lines that run along the flow are laid out in world space; lines
 * across it store their offset in `position.z` and are wrapped and scrolled by the shader.
 *
 * `detail` multiplies the number of lines in both directions over the same area. Above 1 only
 * every fourth line is a "major" one (`aMajor` = 1) and the rest are fainter, so a dense grid
 * reads as a ruled surface rather than a wall of lines. At 1 every line is major.
 */
export function createGridGeometry({ lines, spacing, segmentsZ, crossSpacing, segmentsX }: GridOptions = GRID, detail = 1): BufferGeometry {
  const positions: number[] = []
  const axis: number[] = []
  const major: number[] = []

  // An odd count keeps a line on the centre and the strong lines symmetric about it.
  const count = Math.round(((lines - 1) * detail) / 2) * 2 + 1
  const step = ((lines - 1) * spacing) / (count - 1)
  const cross = crossSpacing / detail
  // More lines do not need a finer subdivision: the waves they ride are long.
  const divisions = segmentsX
  const half = ((count - 1) / 2) * step
  const isMajor = (index: number) => (detail <= 1 || index % 4 === 0 ? 1 : 0)

  for (let k = 0; k < count; k++) {
    const x = (k - (count - 1) / 2) * step
    const strong = isMajor(Math.abs(Math.round(k - (count - 1) / 2)))
    for (let j = 0; j < segmentsZ; j++) {
      positions.push(x, 0, -FIELD.depth + (j / segmentsZ) * FIELD.depth, x, 0, -FIELD.depth + ((j + 1) / segmentsZ) * FIELD.depth)
      axis.push(0, 0)
      major.push(strong, strong)
    }
  }

  const rows = Math.floor(FIELD.depth / cross)
  for (let m = 0; m < rows; m++) {
    const z = m * cross
    const strong = isMajor(m)
    for (let j = 0; j < divisions; j++) {
      positions.push(-half + (j / divisions) * 2 * half, 0, z, -half + ((j + 1) / divisions) * 2 * half, 0, z)
      axis.push(1, 1)
      major.push(strong, strong)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aAxis', new Float32BufferAttribute(axis, 1))
  geometry.setAttribute('aMajor', new Float32BufferAttribute(major, 1))
  return geometry
}

// ── Ribbons ────────────────────────────────────────────────────────────

/**
 * Turns a geometry of line segments (pairs of vertices) into one of quads, for drawing the lines
 * as screen-space ribbons (see RIBBON in fieldShaders.ts). Every segment becomes four vertices:
 * each end twice, once for each side. A vertex carries its own end as `position`, the segment's
 * other end as `aOther` and the side (-1 or 1) as `aSide`; every other attribute of the source is
 * copied from the vertex's own end.
 */
export function createRibbonGeometry(lines: BufferGeometry): BufferGeometry {
  const source = lines.getAttribute('position')
  const segments = source.count / 2
  const quads = segments * 4

  const position = new Float32Array(quads * 3)
  const other = new Float32Array(quads * 3)
  const side = new Float32Array(quads)
  const extras = Object.entries(lines.attributes)
    .filter(([name]) => name !== 'position')
    .map(([name, attribute]) => ({ name, size: attribute.itemSize, from: attribute.array as ArrayLike<number>, to: new Float32Array(quads * attribute.itemSize) }))
  const index = new Uint32Array(segments * 6)

  for (let s = 0; s < segments; s++) {
    for (let corner = 0; corner < 4; corner++) {
      const vertex = s * 4 + corner
      const own = s * 2 + (corner >> 1)
      const far = s * 2 + (1 - (corner >> 1))
      for (let axis = 0; axis < 3; axis++) {
        position[vertex * 3 + axis] = source.array[own * 3 + axis]
        other[vertex * 3 + axis] = source.array[far * 3 + axis]
      }
      side[vertex] = corner & 1 ? 1 : -1
      for (const extra of extras) {
        for (let k = 0; k < extra.size; k++) extra.to[vertex * extra.size + k] = extra.from[own * extra.size + k]
      }
    }
    const base = s * 4
    index.set([base, base + 1, base + 2, base + 2, base + 1, base + 3], s * 6)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('aOther', new Float32BufferAttribute(other, 3))
  geometry.setAttribute('aSide', new Float32BufferAttribute(side, 1))
  for (const extra of extras) geometry.setAttribute(extra.name, new Float32BufferAttribute(extra.to, extra.size))
  geometry.setIndex(new BufferAttribute(index, 1))
  return geometry
}

// ── Rings ──────────────────────────────────────────────────────────────

/** Radii of the concentric ring families, world units. The x extent is 1.6 times wider, like the trails. */
export const RING_RADII = [7.5, 12, 18, 27] as const

/**
 * Rings in planes across the flow, in four concentric families whose rows are staggered, as line
 * segments. Like the surfaces' cross lines they store their depth offset in `position.z` for the
 * shader to wrap and scroll; `aRing` holds the family (0..1) and one random value per ring.
 */
export function createRingGeometry(rows: number, segments = 72, seed = 21): BufferGeometry {
  const random = seededRandom(seed)
  const positions: number[] = []
  const info: number[] = []
  const spacing = FIELD.depth / rows

  RING_RADII.forEach((radius, family) => {
    const kind = family / (RING_RADII.length - 1)
    for (let m = 0; m < rows; m++) {
      const z = (m + family / RING_RADII.length) * spacing
      const rnd = random()
      for (let j = 0; j < segments; j++) {
        const a0 = (j / segments) * Math.PI * 2
        const a1 = ((j + 1) / segments) * Math.PI * 2
        positions.push(Math.cos(a0) * radius * 1.6, Math.sin(a0) * radius, z, Math.cos(a1) * radius * 1.6, Math.sin(a1) * radius, z)
        info.push(kind, rnd, kind, rnd)
      }
    }
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aRing', new Float32BufferAttribute(info, 2))
  return geometry
}

// ── Dust ───────────────────────────────────────────────────────────────

export function createDustGeometry(count: number, seed = 11): BufferGeometry {
  const random = seededRandom(seed)
  const position = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    position[i * 3] = (random() * 2 - 1) * 38
    position[i * 3 + 1] = (random() * 2 - 1) * 22
    position[i * 3 + 2] = random() * FIELD.depth
    seeds[i] = random()
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1))
  return geometry
}

// ── Pointer beam ───────────────────────────────────────────────────────

/** A single quad for the pointer's light beam; the shader places it in screen space. */
export function createBeamGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(12), 3))
  // x: side, y: 0 at the pointer and 1 at the tail.
  geometry.setAttribute('aCorner', new Float32BufferAttribute([-1, 0, 1, 0, -1, 1, 1, 1], 2))
  geometry.setIndex([0, 1, 2, 2, 1, 3])
  return geometry
}

