import { describe, expect, it } from 'vitest'
import { GRID, RING_RADII, createGridGeometry, createRibbonGeometry, createRingGeometry, makeTrailSpecs, trailPoint } from './fieldGeometry'
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
    // Twice the rows, each divided as before: more lines do not need a finer subdivision.
    const across = axis.filter((value) => value === 1).length / (GRID.segmentsX * 2)
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

describe('ribbons', () => {
  // Raw GL lines are one aliased pixel wide and crawl when they move; every line is drawn as a
  // ribbon instead. A segment becomes four vertices: each end twice, once for each side.
  const lines = createGridGeometry()
  const ribbons = createRibbonGeometry(lines)
  const segments = lines.getAttribute('position').count / 2
  const own = ribbons.getAttribute('position').array as Float32Array
  const far = ribbons.getAttribute('aOther').array as Float32Array
  const source = lines.getAttribute('position').array as Float32Array

  it('has four vertices and two triangles per segment', () => {
    expect(ribbons.getAttribute('position').count).toBe(segments * 4)
    expect(ribbons.getAttribute('aOther').count).toBe(segments * 4)
    expect(ribbons.getAttribute('aSide').count).toBe(segments * 4)
    expect(ribbons.getIndex()!.count).toBe(segments * 6)
    for (const i of ribbons.getIndex()!.array) expect(i).toBeLessThan(segments * 4)
  })

  it('gives each vertex its own end, the segment’s other end and a side', () => {
    for (let s = 0; s < segments; s += 97) {
      for (let corner = 0; corner < 4; corner++) {
        const vertex = s * 4 + corner
        const end = corner >> 1
        for (let axis = 0; axis < 3; axis++) {
          expect(own[vertex * 3 + axis]).toBe(source[(s * 2 + end) * 3 + axis])
          expect(far[vertex * 3 + axis]).toBe(source[(s * 2 + 1 - end) * 3 + axis])
        }
      }
    }
    const sides = ribbons.getAttribute('aSide').array as Float32Array
    expect(new Set(sides)).toEqual(new Set([-1, 1]))
  })

  it('has both sides of each end, so the quad spans the line', () => {
    const sides = ribbons.getAttribute('aSide').array as Float32Array
    for (let s = 0; s < segments; s += 211) {
      expect([sides[s * 4], sides[s * 4 + 1], sides[s * 4 + 2], sides[s * 4 + 3]]).toEqual([-1, 1, -1, 1])
    }
  })

  it('carries every other attribute over from the vertex’s own end', () => {
    const axisIn = lines.getAttribute('aAxis').array as Float32Array
    const axisOut = ribbons.getAttribute('aAxis').array as Float32Array
    const majorIn = lines.getAttribute('aMajor').array as Float32Array
    const majorOut = ribbons.getAttribute('aMajor').array as Float32Array
    for (let s = 0; s < segments; s += 53) {
      for (let corner = 0; corner < 4; corner++) {
        expect(axisOut[s * 4 + corner]).toBe(axisIn[s * 2 + (corner >> 1)])
        expect(majorOut[s * 4 + corner]).toBe(majorIn[s * 2 + (corner >> 1)])
      }
    }
  })

  it('works for the rings, whose attribute has two components', () => {
    const rings = createRingGeometry(4, 12)
    const converted = createRibbonGeometry(rings)
    expect(converted.getAttribute('aRing').itemSize).toBe(2)
    expect(converted.getAttribute('aRing').count).toBe(rings.getAttribute('position').count * 2)
  })
})
