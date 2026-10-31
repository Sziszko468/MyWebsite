import {
  BufferGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
} from 'three'
import { seededRandom } from '../../../hero/heroMath'
import type { GenParams } from './genParams'

/**
 * Builds the generated objects as plain geometry: no shaders, no scene, so it is tested for what
 * matters (vertex budget, finite numbers, determinism). Four of the five forms are parametric
 * surfaces on a grid (a superformula bloom, a torus-knot tube, a lobed spire and a spiralling
 * shell); the fifth is a faceted crystal made from a subdivided icosahedron. Each is a function
 * of the parameters and the seed alone, so the same set always builds the same object, and each
 * is scaled to the same size so the camera never has to chase it.
 */

/** Radius every generated object is scaled to. */
export const OBJECT_RADIUS = 1.35

const TAU = Math.PI * 2

/** A smooth 3D value noise in -1..1 that depends only on the seed. */
export function makeNoise(seed: number): (x: number, y: number, z: number) => number {
  const lattice = (ix: number, iy: number, iz: number): number => {
    let h =
      Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 2147483629) ^ Math.imul(seed | 0, 1274126177)
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    h ^= h >>> 16
    return ((h >>> 0) / 4294967295) * 2 - 1
  }
  const fade = (t: number) => t * t * (3 - 2 * t)
  const mix = (a: number, b: number, t: number) => a + (b - a) * t
  return (x, y, z) => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const iz = Math.floor(z)
    const fx = fade(x - ix)
    const fy = fade(y - iy)
    const fz = fade(z - iz)
    const x00 = mix(lattice(ix, iy, iz), lattice(ix + 1, iy, iz), fx)
    const x10 = mix(lattice(ix, iy + 1, iz), lattice(ix + 1, iy + 1, iz), fx)
    const x01 = mix(lattice(ix, iy, iz + 1), lattice(ix + 1, iy, iz + 1), fx)
    const x11 = mix(lattice(ix, iy + 1, iz + 1), lattice(ix + 1, iy + 1, iz + 1), fx)
    return mix(mix(x00, x10, fy), mix(x01, x11, fy), fz)
  }
}

type Surface = (u: number, v: number, out: number[]) => void

interface Grid {
  /** Quads round the u direction and along v. */
  nu: number
  nv: number
  wrapU: boolean
  wrapV: boolean
}

/** Number of vertices a grid has: shared seams are not repeated. */
export function gridVertexCount({ nu, nv, wrapU, wrapV }: Grid): number {
  return (wrapU ? nu : nu + 1) * (wrapV ? nv : nv + 1)
}

/** An indexed surface over a grid, with the seams shared so normals are smooth across them. */
function buildGrid(surface: Surface, grid: Grid): BufferGeometry {
  const cols = grid.wrapU ? grid.nu : grid.nu + 1
  const rows = grid.wrapV ? grid.nv : grid.nv + 1
  const positions = new Float32Array(cols * rows * 3)
  const point = [0, 0, 0]

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      surface(i / grid.nu, j / grid.nv, point)
      const at = (j * cols + i) * 3
      positions[at] = Number.isFinite(point[0]) ? point[0] : 0
      positions[at + 1] = Number.isFinite(point[1]) ? point[1] : 0
      positions[at + 2] = Number.isFinite(point[2]) ? point[2] : 0
    }
  }

  const indices: number[] = []
  for (let j = 0; j < grid.nv; j++) {
    const j1 = grid.wrapV ? (j + 1) % rows : j + 1
    for (let i = 0; i < grid.nu; i++) {
      const i1 = grid.wrapU ? (i + 1) % cols : i + 1
      const a = j * cols + i
      const b = j * cols + i1
      const c = j1 * cols + i
      const d = j1 * cols + i1
      indices.push(a, b, c, b, d, c)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(
    positions.length / 3 > 65535 ? new Uint32BufferAttribute(indices, 1) : new Uint16BufferAttribute(indices, 1),
  )
  return geometry
}

/** Makes the triangles face outwards: if most of them face the centre, the winding is turned round. */
function faceOutwards(geometry: BufferGeometry): void {
  geometry.computeVertexNormals()
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  let facing = 0
  for (let i = 0; i < position.count; i++) {
    facing += position.getX(i) * normal.getX(i) + position.getY(i) * normal.getY(i) + position.getZ(i) * normal.getZ(i)
  }
  const index = geometry.getIndex()
  if (facing < 0 && index) {
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1)
      index.setX(i + 1, index.getX(i + 2))
      index.setX(i + 2, b)
    }
    index.needsUpdate = true
    geometry.computeVertexNormals()
  }
}

/** Centres the object on the origin and scales it to OBJECT_RADIUS. */
function fitToObjectRadius(geometry: BufferGeometry): void {
  geometry.computeBoundingSphere()
  const sphere = geometry.boundingSphere
  if (!sphere || sphere.radius < 1e-6) return
  geometry.translate(-sphere.center.x, -sphere.center.y, -sphere.center.z)
  geometry.scale(OBJECT_RADIUS / sphere.radius, OBJECT_RADIUS / sphere.radius, OBJECT_RADIUS / sphere.radius)
  geometry.computeBoundingSphere()
}

/** Grid resolution for a complexity and a vertex budget: `n` quads along the short side. */
function resolution(complexity: number, budget: number, vertexShare: number): number {
  const most = Math.sqrt(budget / vertexShare) - 2
  return Math.max(10, Math.floor(10 + (most - 10) * Math.pow(complexity, 1.15)))
}

function superformula(angle: number, m: number, n1: number, n2: number, n3: number): number {
  const a = Math.pow(Math.abs(Math.cos((m * angle) / 4)), n2)
  const b = Math.pow(Math.abs(Math.sin((m * angle) / 4)), n3)
  return Math.min(4, Math.max(0.15, Math.pow(a + b, -1 / n1)))
}

function buildBloom(params: GenParams, budget: number): BufferGeometry {
  const random = seededRandom(params.seed)
  const noise = makeNoise(params.seed)
  const latitudeLobes = 2 + Math.floor(random() * 4)
  const n1 = 0.4 + random() * 1.1
  const n2 = 0.7 + random() * 1.6
  const n3 = 0.7 + random() * 1.6
  const n = resolution(params.complexity, budget, 2)
  const height = 0.35 + 1.0 * params.depth

  return buildGrid(
    (u, v, out) => {
      const theta = u * TAU - Math.PI
      const phi = (v - 0.5) * Math.PI
      const r1 = superformula(theta, params.symmetry, n1, n2, n3)
      const r2 = superformula(phi, latitudeLobes, n1, n2, n3)
      let x = r1 * Math.cos(theta) * r2 * Math.cos(phi)
      let y = r2 * Math.sin(phi) * height
      let z = r1 * Math.sin(theta) * r2 * Math.cos(phi)
      const push = 1 + 0.45 * params.distortion * noise(x * 1.4, y * 1.4, z * 1.4)
      x *= push
      y *= push
      z *= push
      out[0] = x
      out[1] = y
      out[2] = z
    },
    { nu: n * 2, nv: n, wrapU: true, wrapV: false },
  )
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function buildKnot(params: GenParams, budget: number): BufferGeometry {
  const random = seededRandom(params.seed)
  const noise = makeNoise(params.seed)
  const p = Math.min(9, Math.max(2, params.symmetry))
  const partners = [2, 3, 4, 5, 7, 8].filter((q) => q !== p && gcd(p, q) === 1)
  const q = partners[Math.floor(random() * partners.length) % partners.length] ?? 3
  const tube = 0.2 + 0.38 * params.depth
  const n = resolution(params.complexity, budget, 1.5)
  const around = Math.max(6, Math.floor(n / 2))
  const delta = 1e-3

  const curve = (t: number, out: number[]) => {
    const radius = 2 + Math.cos(q * t)
    out[0] = radius * Math.cos(p * t)
    out[1] = radius * Math.sin(p * t)
    out[2] = Math.sin(q * t) * 1.2
  }

  const ahead = [0, 0, 0]
  const here = [0, 0, 0]
  const behind = [0, 0, 0]

  return buildGrid(
    (u, v, out) => {
      const t = u * TAU
      curve(t + delta, ahead)
      curve(t, here)
      curve(t - delta, behind)
      let tx = ahead[0] - behind[0]
      let ty = ahead[1] - behind[1]
      let tz = ahead[2] - behind[2]
      const tl = Math.hypot(tx, ty, tz) || 1
      tx /= tl
      ty /= tl
      tz /= tl
      // The curvature vector (second difference) with its tangent part removed is the normal.
      let ax = ahead[0] - 2 * here[0] + behind[0]
      let ay = ahead[1] - 2 * here[1] + behind[1]
      let az = ahead[2] - 2 * here[2] + behind[2]
      const along = ax * tx + ay * ty + az * tz
      ax -= along * tx
      ay -= along * ty
      az -= along * tz
      const al = Math.hypot(ax, ay, az) || 1
      const nx = ax / al
      const ny = ay / al
      const nz = az / al
      const bx = ty * nz - tz * ny
      const by = tz * nx - tx * nz
      const bz = tx * ny - ty * nx

      const swell = 1 + 0.45 * params.distortion * noise(Math.cos(t) * 1.6, Math.sin(t) * 1.6, t * 0.8)
      const radius = tube * swell
      const angle = v * TAU
      const cx = Math.cos(angle) * radius
      const cy = Math.sin(angle) * radius
      out[0] = here[0] + nx * cx + bx * cy
      out[1] = here[1] + ny * cx + by * cy
      out[2] = here[2] + nz * cx + bz * cy
    },
    { nu: n * 3, nv: around, wrapU: true, wrapV: true },
  )
}

function buildSpire(params: GenParams, budget: number): BufferGeometry {
  const random = seededRandom(params.seed)
  const noise = makeNoise(params.seed)
  const waves = 1 + random() * 1.6
  const phase = random()
  const twist = 0.4 + 3.2 * params.distortion
  const thickness = 0.35 + 0.8 * params.depth
  const n = resolution(params.complexity, budget, 2)

  return buildGrid(
    (u, v, out) => {
      const theta = u * TAU
      const y = (v - 0.5) * 3.4
      const base = Math.pow(Math.max(Math.sin(Math.PI * v), 0), 0.7)
      const profile = base * (0.55 + 0.45 * Math.cos(TAU * (v * waves + phase)))
      const lobes =
        1 + (0.12 + 0.3 * params.depth) * Math.sin(params.symmetry * theta + twist * y) * Math.pow(base, 0.5)
      let radius = thickness * profile * lobes
      const x0 = Math.cos(theta)
      const z0 = Math.sin(theta)
      radius *= 1 + 0.25 * params.distortion * noise(x0 * 1.5 + y, y * 1.5, z0 * 1.5)
      out[0] = radius * x0
      out[1] = y
      out[2] = radius * z0
    },
    { nu: n * 2, nv: n, wrapU: true, wrapV: false },
  )
}

function buildShell(params: GenParams, budget: number): BufferGeometry {
  const noise = makeNoise(params.seed)
  const turns = 2 + (params.symmetry - 1) * 0.25
  const section = 0.35 + 0.5 * params.depth
  const n = resolution(params.complexity, budget, 4)

  return buildGrid(
    (u, v, out) => {
      const around = u * TAU
      const along = v * turns * TAU
      const scale = 0.12 + 1.25 * Math.pow(v, 1.35)
      let radius = section * scale
      radius *=
        1 +
        0.22 * params.distortion * Math.sin(params.symmetry * 2 * around) +
        0.12 * params.distortion * noise(Math.cos(around) * 1.4, v * 3, Math.sin(around) * 1.4)
      const centre = scale + radius * Math.cos(around)
      out[0] = centre * Math.cos(along)
      out[1] = centre * Math.sin(along)
      out[2] = radius * Math.sin(around) - v * 0.9
    },
    { nu: n * 2, nv: n * 2, wrapU: true, wrapV: false },
  )
}

function buildCrystal(params: GenParams): BufferGeometry {
  const noise = makeNoise(params.seed)
  const detail = Math.round(params.complexity * 3)
  const geometry = new IcosahedronGeometry(1, detail)
  const position = geometry.getAttribute('position')
  const sector = TAU / Math.max(1, params.symmetry)
  const height = 0.55 + 1.05 * params.depth
  const strength = 0.12 + 0.75 * params.distortion

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const length = Math.hypot(x, y, z) || 1
    const dx = x / length
    const dy = y / length
    const dz = z / length
    // Fold the direction into one sector and mirror it, so the pattern repeats and the repeats mirror each other.
    const azimuth = Math.atan2(dz, dx)
    const within = ((azimuth % sector) + sector) % sector
    const folded = Math.abs(within - sector / 2)
    const ring = Math.sqrt(Math.max(0, 1 - dy * dy))
    const n = noise(Math.cos(folded) * ring * 2.2, dy * 2.2, Math.sin(folded) * ring * 2.2)
    const radius = 1 + strength * (n + 0.6 * Math.abs(n))
    position.setXYZ(i, dx * radius, dy * radius * height, dz * radius)
  }
  geometry.deleteAttribute('normal')
  geometry.deleteAttribute('uv')
  return geometry
}

export interface BuiltObject {
  geometry: BufferGeometry
  vertexCount: number
}

/**
 * The geometry of one generated object, within `vertexBudget` vertices. The caller owns the
 * result and must dispose it when it replaces or drops it.
 */
export function buildGenerative(params: GenParams, vertexBudget: number): BuiltObject {
  let geometry: BufferGeometry
  switch (params.form) {
    case 'knot':
      geometry = buildKnot(params, vertexBudget)
      break
    case 'spire':
      geometry = buildSpire(params, vertexBudget)
      break
    case 'shell':
      geometry = buildShell(params, vertexBudget)
      break
    case 'crystal':
      geometry = buildCrystal(params)
      break
    default:
      geometry = buildBloom(params, vertexBudget)
  }

  if (geometry.getIndex()) faceOutwards(geometry)
  fitToObjectRadius(geometry)
  if (!geometry.getAttribute('normal') || params.form === 'crystal') geometry.computeVertexNormals()
  return { geometry, vertexCount: geometry.getAttribute('position').count }
}
