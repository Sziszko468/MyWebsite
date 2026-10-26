import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import {
  GRID,
  createDustGeometry,
  createGridGeometry,
  createStreakGeometry,
  createTrailGeometry,
  makeTrailSpecs,
  trailPoint,
} from './fieldGeometry'
import { FIELD } from './velocityHeroConfig'

describe('streaks', () => {
  const count = 500
  const geometry = createStreakGeometry(count)

  it('is one instanced quad with one seed per instance', () => {
    expect(geometry.instanceCount).toBe(count)
    expect(geometry.getAttribute('aCorner').count).toBe(4)
    expect(geometry.getIndex()!.count).toBe(6)
    expect(geometry.getAttribute('aSeed').count).toBe(count)
  })

  it('places instances in a tunnel clear of the view axis, within the field depth', () => {
    const seeds = geometry.getAttribute('aSeed').array as Float32Array
    for (let i = 0; i < count; i++) {
      const [angle, radius, depth, random] = [seeds[i * 4], seeds[i * 4 + 1], seeds[i * 4 + 2], seeds[i * 4 + 3]]
      expect(angle).toBeGreaterThanOrEqual(0)
      expect(angle).toBeLessThanOrEqual(Math.PI * 2)
      expect(radius).toBeGreaterThanOrEqual(2.4)
      expect(radius).toBeLessThanOrEqual(30.4)
      expect(depth).toBeGreaterThanOrEqual(0)
      expect(depth).toBeLessThanOrEqual(FIELD.depth)
      expect(random).toBeGreaterThanOrEqual(0)
      expect(random).toBeLessThan(1)
    }
  })

  it('is identical on every build', () => {
    const again = createStreakGeometry(count)
    expect(Array.from(again.getAttribute('aSeed').array)).toEqual(Array.from(geometry.getAttribute('aSeed').array))
  })
})

describe('trails', () => {
  const specs = makeTrailSpecs(20)

  it('leads with red and keeps blue as the supporting colour', () => {
    const count = (kind: number) => specs.filter((spec) => spec.kind === kind).length
    expect(count(0)).toBeGreaterThan(count(1))
    expect(count(0)).toBeGreaterThan(count(2))
    expect(count(2)).toBeGreaterThan(0)
  })

  it('runs from near the camera to the far end of the field', () => {
    const near = trailPoint(specs[0], 0)
    const far = trailPoint(specs[0], 1)
    expect(near.z).toBeCloseTo(-2, 6)
    expect(far.z).toBeCloseTo(-FIELD.depth, 6)
  })

  it('is smooth: consecutive samples are close together', () => {
    for (const spec of specs) {
      let previous = trailPoint(spec, 0)
      for (let s = 0.01; s <= 1; s += 0.01) {
        const point = trailPoint(spec, s)
        expect(point.distanceTo(previous)).toBeLessThan(6)
        previous = point
      }
    }
  })

  it('builds every trail into one strip geometry', () => {
    const segments = 24
    const geometry = createTrailGeometry(specs, segments)
    const vertices = specs.length * (segments + 1) * 2
    expect(geometry.getAttribute('position').count).toBe(vertices)
    expect(geometry.getIndex()!.count).toBe(specs.length * segments * 6)
    for (const name of ['aPrev', 'aNext', 'aSide', 'aS', 'aSeed', 'aInfo']) {
      expect(geometry.getAttribute(name).count, name).toBe(vertices)
    }
    const sides = geometry.getAttribute('aSide').array as Float32Array
    expect(new Set(sides)).toEqual(new Set([-1, 1]))
    const index = geometry.getIndex()!.array
    for (const i of index) expect(i).toBeLessThan(vertices)
  })

  it('links each sample to its neighbours so the ribbon can be widened on screen', () => {
    const geometry = createTrailGeometry(specs.slice(0, 1), 10)
    const position = geometry.getAttribute('position').array as Float32Array
    const previous = geometry.getAttribute('aPrev').array as Float32Array
    const next = geometry.getAttribute('aNext').array as Float32Array
    // Sample 5: its previous point is sample 4 and its next point is sample 6.
    const at = (array: Float32Array, sample: number) => new Vector3().fromArray(array, sample * 2 * 3)
    expect(at(previous, 5).distanceTo(at(position, 4))).toBeLessThan(1e-4)
    expect(at(next, 5).distanceTo(at(position, 6))).toBeLessThan(1e-4)
  })
})

describe('surfaces', () => {
  const geometry = createGridGeometry()
  const axis = geometry.getAttribute('aAxis').array as Float32Array

  it('has line segments in pairs', () => {
    expect(geometry.getAttribute('position').count % 2).toBe(0)
    expect(axis.length).toBe(geometry.getAttribute('position').count)
  })

  it('has lines along the flow and lines across it', () => {
    const along = axis.filter((value) => value === 0).length
    const across = axis.filter((value) => value === 1).length
    expect(along).toBe(GRID.lines * GRID.segmentsZ * 2)
    expect(across).toBe(Math.floor(FIELD.depth / GRID.crossSpacing) * GRID.segmentsX * 2)
  })

  it('stores the cross lines as offsets inside the field depth, for the shader to wrap', () => {
    const position = geometry.getAttribute('position').array as Float32Array
    for (let i = 0; i < axis.length; i++) {
      if (axis[i] === 1) {
        expect(position[i * 3 + 2]).toBeGreaterThanOrEqual(0)
        expect(position[i * 3 + 2]).toBeLessThan(FIELD.depth)
      } else {
        expect(position[i * 3 + 2]).toBeGreaterThanOrEqual(-FIELD.depth - 1e-4)
        expect(position[i * 3 + 2]).toBeLessThanOrEqual(1e-4)
      }
    }
  })
})

describe('dust', () => {
  const geometry = createDustGeometry(300)

  it('has one seed per mote, all inside the volume', () => {
    expect(geometry.getAttribute('aSeed').count).toBe(300)
    const position = geometry.getAttribute('position').array as Float32Array
    for (let i = 0; i < 300; i++) {
      expect(Math.abs(position[i * 3])).toBeLessThanOrEqual(38)
      expect(Math.abs(position[i * 3 + 1])).toBeLessThanOrEqual(22)
      expect(position[i * 3 + 2]).toBeGreaterThanOrEqual(0)
      expect(position[i * 3 + 2]).toBeLessThanOrEqual(FIELD.depth)
    }
  })
})
