import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from 'three'
import { TRACK_PATH } from './velocityHeroConfig'

/** The track's centre line. Built once and shared by the surface, the markings and every light streak. */
export const trackCurve = new CatmullRomCurve3(
  TRACK_PATH.map(([x, y, z]) => new Vector3(x, y, z)),
  false,
  'centripetal',
)

export const trackLength = trackCurve.getLength()

const point = new Vector3()
const tangent = new Vector3()

export interface RibbonOptions {
  /** Number of segments along the curve. */
  samples: number
  /** Lateral offset of the ribbon's centre from the curve (metres, + is right of travel). */
  offset: number
  /** Half of the ribbon's width, metres. */
  halfWidth: number
  /** Height above the ground, metres. */
  y: number
}

/**
 * A flat strip that follows the track. `uv.x` runs across (0 left .. 1 right) and `uv.y` is the
 * distance along the track in metres, so shaders can place dashes and pulses in real units.
 */
export function createRibbon(curve: CatmullRomCurve3, { samples, offset, halfWidth, y }: RibbonOptions): BufferGeometry {
  const length = curve.getLength()
  const positions = new Float32Array((samples + 1) * 2 * 3)
  const normals = new Float32Array((samples + 1) * 2 * 3)
  const uvs = new Float32Array((samples + 1) * 2 * 2)
  const indices: number[] = []

  for (let i = 0; i <= samples; i++) {
    const u = i / samples
    curve.getPointAt(u, point)
    curve.getTangentAt(u, tangent)
    // Right of travel, flat on the ground.
    const rx = -tangent.z
    const rz = tangent.x
    const norm = Math.hypot(rx, rz) || 1

    for (let side = 0; side < 2; side++) {
      const lateral = offset + (side === 0 ? -halfWidth : halfWidth)
      const k = (i * 2 + side) * 3
      positions[k] = point.x + (rx / norm) * lateral
      positions[k + 1] = point.y + y
      positions[k + 2] = point.z + (rz / norm) * lateral
      normals[k + 1] = 1
      uvs[(i * 2 + side) * 2] = side
      uvs[(i * 2 + side) * 2 + 1] = u * length
    }

    if (i < samples) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return geometry
}

/** A vertical strip standing on the ground along one side of the track (a low barrier). */
export function createWall(curve: CatmullRomCurve3, samples: number, offset: number, height: number): BufferGeometry {
  const length = curve.getLength()
  const positions = new Float32Array((samples + 1) * 2 * 3)
  const uvs = new Float32Array((samples + 1) * 2 * 2)
  const indices: number[] = []

  for (let i = 0; i <= samples; i++) {
    const u = i / samples
    curve.getPointAt(u, point)
    curve.getTangentAt(u, tangent)
    const norm = Math.hypot(tangent.x, tangent.z) || 1
    const x = point.x + (-tangent.z / norm) * offset
    const z = point.z + (tangent.x / norm) * offset

    for (let level = 0; level < 2; level++) {
      const k = (i * 2 + level) * 3
      positions[k] = x
      positions[k + 1] = level * height
      positions[k + 2] = z
      uvs[(i * 2 + level) * 2] = level
      uvs[(i * 2 + level) * 2 + 1] = u * length
    }

    if (i < samples) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export interface LoftSection {
  /** Position along the car's length (+z is the rear). */
  z: number
  /** Half width. */
  w: number
  yBottom: number
  yTop: number
  /** Cross-section shape: 2 is an ellipse, higher is squarer. */
  n: number
  /** How much narrower the top is than the bottom (1 = no taper). */
  taper: number
}

const signedPow = (value: number, exponent: number) => Math.sign(value) * Math.pow(Math.abs(value), exponent)

/**
 * Lofts a smooth body through cross-sections that run from the rear (largest z) to the nose.
 * The rear is closed with a flat panel; the nose tapers to a point.
 */
export function createLoft(sections: readonly LoftSection[], radial: number): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []

  const ring = (section: LoftSection) => {
    const start = positions.length / 3
    const mid = (section.yBottom + section.yTop) / 2
    const e = 2 / section.n
    for (let j = 0; j < radial; j++) {
      const theta = (j / radial) * Math.PI * 2
      const ex = signedPow(Math.cos(theta), e)
      const ey = signedPow(Math.sin(theta), e)
      const upper = ey > 0
      const taper = upper ? 1 + (section.taper - 1) * ey : 1
      positions.push(section.w * ex * taper, mid + (upper ? section.yTop - mid : mid - section.yBottom) * ey, section.z)
    }
    return start
  }

  const rings = sections.map(ring)
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < radial; j++) {
      const j1 = (j + 1) % radial
      const a = rings[k] + j
      const b = rings[k] + j1
      const c = rings[k + 1] + j
      const d = rings[k + 1] + j1
      indices.push(a, c, b, b, c, d)
    }
  }

  // Rear panel on its own vertices, so its edge stays crisp.
  const first = sections[0]
  const panelStart = positions.length / 3
  for (let j = 0; j < radial; j++) {
    const base = (rings[0] + j) * 3
    positions.push(positions[base], positions[base + 1], positions[base + 2])
  }
  const centre = positions.length / 3
  positions.push(0, (first.yBottom + first.yTop) / 2, first.z)
  for (let j = 0; j < radial; j++) indices.push(centre, panelStart + j, panelStart + ((j + 1) % radial))

  // Nose cap.
  const last = sections[sections.length - 1]
  const tip = positions.length / 3
  positions.push(0, (last.yBottom + last.yTop) / 2, last.z)
  const lastRing = rings[rings.length - 1]
  for (let j = 0; j < radial; j++) indices.push(tip, lastRing + ((j + 1) % radial), lastRing + j)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}
