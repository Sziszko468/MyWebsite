import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import type { CustomParams, ShapeKind } from './studioDoc'

/**
 * The shapes of the studio, built once per kind and shared: a hundred cubes are one geometry on
 * the GPU. Sizes are all about one unit across, so an object's scale is its size in the grid.
 * `detail` (1 high, lower for weaker devices) only changes how finely curved shapes are cut.
 */

/** A prism that can twist and taper: the studio's one parametric "custom geometry". */
export function buildCustomGeometry(custom: CustomParams): BufferGeometry {
  const { sides, twist, taper, slices } = custom
  const twistRadians = (twist * Math.PI) / 180
  const positions: number[] = []

  const corner = (slice: number, k: number): [number, number, number] => {
    const t = slice / slices
    const radius = 0.5 * (1 + (taper - 1) * t)
    const angle = (k / sides) * Math.PI * 2 + twistRadians * t
    return [Math.cos(angle) * radius, t - 0.5, Math.sin(angle) * radius]
  }

  for (let slice = 0; slice < slices; slice++) {
    for (let k = 0; k < sides; k++) {
      const a = corner(slice, k)
      const b = corner(slice, (k + 1) % sides)
      const c = corner(slice + 1, k)
      const d = corner(slice + 1, (k + 1) % sides)
      positions.push(...a, ...c, ...b, ...b, ...c, ...d)
    }
  }
  // Caps: a fan round the middle of each end (the top is a point when the shape tapers to nothing).
  for (let k = 0; k < sides; k++) {
    const b0 = corner(0, k)
    const b1 = corner(0, (k + 1) % sides)
    positions.push(0, -0.5, 0, ...b1, ...b0)
    if (taper > 0.01) {
      const t0 = corner(slices, k)
      const t1 = corner(slices, (k + 1) % sides)
      positions.push(0, 0.5, 0, ...t0, ...t1)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

export function buildPrimitive(kind: ShapeKind, custom: CustomParams, detail = 1): BufferGeometry {
  const radial = Math.max(12, Math.round(48 * detail))
  const rings = Math.max(8, Math.round(32 * detail))
  switch (kind) {
    case 'sphere':
      return new SphereGeometry(0.5, radial, rings)
    case 'cylinder':
      return new CylinderGeometry(0.5, 0.5, 1, radial, 1)
    case 'cone':
      return new ConeGeometry(0.5, 1, radial, 1)
    case 'torus':
      return new TorusGeometry(0.5, 0.15, Math.max(8, Math.round(24 * detail)), Math.max(16, Math.round(64 * detail)))
    case 'plane':
      return new PlaneGeometry(1, 1)
    case 'custom':
      return buildCustomGeometry(custom)
    default:
      return new BoxGeometry(1, 1, 1)
  }
}

/** The geometry for an object, shared between objects of the same kind and parameters. */
export class GeometryCache {
  private readonly geometries = new Map<string, BufferGeometry>()

  private readonly detail: number

  constructor(detail = 1) {
    this.detail = detail
  }

  get(kind: ShapeKind, custom: CustomParams): BufferGeometry {
    const key = kind === 'custom' ? `custom:${custom.sides}:${custom.twist}:${custom.taper}:${custom.slices}` : kind
    let geometry = this.geometries.get(key)
    if (!geometry) {
      geometry = buildPrimitive(kind, custom, this.detail)
      geometry.computeBoundingBox()
      this.geometries.set(key, geometry)
      // A custom shape being dragged through values would otherwise leave every in-between geometry behind.
      if (kind === 'custom') this.pruneCustom(key)
    }
    return geometry
  }

  private pruneCustom(keep: string): void {
    const customKeys = [...this.geometries.keys()].filter((key) => key.startsWith('custom:') && key !== keep)
    // Keep a few recent ones: undo can bring a recent shape back.
    for (const key of customKeys.slice(0, Math.max(0, customKeys.length - 6))) {
      this.geometries.get(key)?.dispose()
      this.geometries.delete(key)
    }
  }

  get size(): number {
    return this.geometries.size
  }

  dispose(): void {
    for (const geometry of this.geometries.values()) geometry.dispose()
    this.geometries.clear()
  }
}
