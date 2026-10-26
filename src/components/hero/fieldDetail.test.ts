import { describe, expect, it } from 'vitest'
import { GRID, RING_RADII, createGridGeometry, createRingGeometry, makeTrailSpecs, trailPoint } from './fieldGeometry'
import { FIELD } from './velocityHeroConfig'

// The geometry that the detailed intro adds to the engine: thin trails, a finer surface grid and
// concentric rings.

describe('fine trails', () => {
  const main = makeTrailSpecs(20)
  const fine = makeTrailSpecs(40, 13, true)

  it('are thinner than the main trails and reach further out', () => {
    expect(Math.max(...fine.map((spec) => spec.width))).toBeLessThan(Math.min(...main.map((spec) => spec.width)))
    expect(Math.max(...fine.map((spec) => spec.radius))).toBeGreaterThan(Math.max(...main.map((spec) => spec.radius)))
  })

  it('pulse more often and still lead with red', () => {
    const average = (specs: typeof main) => specs.reduce((sum, spec) => sum + spec.pitch, 0) / specs.length
    expect(average(fine)).toBeLessThan(average(main))
    expect(fine.filter((spec) => spec.kind === 0).length).toBeGreaterThan(fine.filter((spec) => spec.kind === 2).length)
  })

  it('leave the main trails exactly as they were', () => {
    expect(makeTrailSpecs(20)).toEqual(main)
    expect(makeTrailSpecs(20, 5, false)).toEqual(main)
  })

  it('run the same course as the main trails: near the camera at 0, far at 1', () => {
    expect(trailPoint(fine[0], 0).z).toBeCloseTo(-2, 6)
    expect(trailPoint(fine[0], 1).z).toBeCloseTo(-FIELD.depth, 6)
  })
})

describe('detailed surfaces', () => {
  const dense = createGridGeometry(undefined, 2)
  const axis = dense.getAttribute('aAxis').array as Float32Array
  const major = dense.getAttribute('aMajor').array as Float32Array

  it('has twice the lines over the same area', () => {
    const along = axis.filter((value) => value === 0).length / (GRID.segmentsZ * 2)
    expect(along).toBe((GRID.lines - 1) * 2 + 1)
    const across = axis.filter((value) => value === 1).length / (GRID.segmentsX * 2 * 2)
    expect(across).toBe(Math.floor(FIELD.depth / (GRID.crossSpacing / 2)))

    const position = dense.getAttribute('position').array as Float32Array
    let widest = 0
    for (let i = 0; i < axis.length; i++) if (axis[i] === 0) widest = Math.max(widest, Math.abs(position[i * 3]))
    expect(widest).toBeCloseTo(((GRID.lines - 1) / 2) * GRID.spacing, 3)
  })

  it('makes about a quarter of the lines strong and the rest fine', () => {
    const strong = major.filter((value) => value === 1).length / major.length
    expect(strong).toBeGreaterThan(0.2)
    expect(strong).toBeLessThan(0.32)
  })

  it('has every line strong at the standard detail, so the hero looks as it did', () => {
    const standard = createGridGeometry().getAttribute('aMajor').array as Float32Array
    expect(new Set(standard)).toEqual(new Set([1]))
  })

  it('keeps one flag per vertex', () => {
    expect(major.length).toBe(dense.getAttribute('position').count)
  })

  it('copes with a fractional detail, keeping the centre line and an odd count', () => {
    const geometry = createGridGeometry(undefined, 1.5)
    const along = (geometry.getAttribute('aAxis').array as Float32Array).filter((value) => value === 0).length / (GRID.segmentsZ * 2)
    expect(along).toBe(Math.round(((GRID.lines - 1) * 1.5) / 2) * 2 + 1)
    expect(along % 2).toBe(1)
  })
})

describe('rings', () => {
  const rows = 6
  const segments = 24
  const geometry = createRingGeometry(rows, segments)
  const position = geometry.getAttribute('position').array as Float32Array
  const ring = geometry.getAttribute('aRing').array as Float32Array

  it('is line segments in pairs: every family, every row, every segment', () => {
    expect(geometry.getAttribute('position').count).toBe(RING_RADII.length * rows * segments * 2)
    expect(geometry.getAttribute('aRing').count).toBe(geometry.getAttribute('position').count)
  })

  it('stores each ring at a depth offset inside the field, for the shader to wrap', () => {
    for (let i = 0; i < position.length / 3; i++) {
      expect(position[i * 3 + 2]).toBeGreaterThanOrEqual(0)
      expect(position[i * 3 + 2]).toBeLessThan(FIELD.depth)
    }
  })

  it('lies on ellipses at the four radii, 1.6 times wider than tall', () => {
    const radii = new Set<number>()
    for (let i = 0; i < position.length / 3; i++) {
      radii.add(Math.round(Math.hypot(position[i * 3] / 1.6, position[i * 3 + 1]) * 10) / 10)
    }
    expect([...radii].sort((a, b) => a - b)).toEqual([...RING_RADII])
  })

  it('carries the family (0..1) and a random value (0..1) on every vertex', () => {
    for (let i = 0; i < ring.length; i++) {
      expect(ring[i]).toBeGreaterThanOrEqual(0)
      expect(ring[i]).toBeLessThanOrEqual(1)
    }
    expect(new Set(Array.from(ring).filter((_, i) => i % 2 === 0)).size).toBe(RING_RADII.length)
  })

  it('closes each ring: the last segment ends where the first one starts', () => {
    const last = (segments - 1) * 2 + 1
    for (let axis = 0; axis < 3; axis++) expect(position[last * 3 + axis]).toBeCloseTo(position[axis], 4)
  })

  it('staggers the families so their rings do not line up in depth', () => {
    const firstZ = (family: number) => position[family * rows * segments * 2 * 3 + 2]
    const offsets = [0, 1, 2, 3].map(firstZ)
    expect(new Set(offsets).size).toBe(RING_RADII.length)
  })

  it('is identical on every build', () => {
    expect(Array.from(createRingGeometry(rows, segments).getAttribute('aRing').array)).toEqual(Array.from(ring))
  })
})
