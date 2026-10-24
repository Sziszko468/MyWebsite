import { describe, expect, it } from 'vitest'
import { createLoft, createRibbon, createWall, trackCurve, trackLength, type LoftSection } from './heroGeometry'
import { seededRandom } from './heroMaterials'

function attribute(geometry: ReturnType<typeof createRibbon>, name: string): Float32Array {
  return geometry.getAttribute(name).array as Float32Array
}

describe('track ribbons', () => {
  const samples = 60
  const geometry = createRibbon(trackCurve, { samples, offset: 0, halfWidth: 4.5, y: 0.02 })

  it('has two vertices per sample and two triangles per segment', () => {
    expect(geometry.getAttribute('position').count).toBe((samples + 1) * 2)
    expect(geometry.getIndex()!.count).toBe(samples * 6)
  })

  it('measures distance along the track in metres, increasing away from the camera', () => {
    const uv = attribute(geometry, 'uv')
    expect(uv[1]).toBe(0)
    expect(uv[(samples * 2) * 2 + 1]).toBeCloseTo(trackLength, 3)
    for (let i = 1; i <= samples; i++) expect(uv[i * 4 + 1]).toBeGreaterThan(uv[(i - 1) * 4 + 1])
  })

  it('is as wide as asked and follows the ground', () => {
    const position = attribute(geometry, 'position')
    for (let i = 0; i <= samples; i++) {
      const left = i * 6
      const right = i * 6 + 3
      const width = Math.hypot(position[right] - position[left], position[right + 2] - position[left + 2])
      expect(width).toBeCloseTo(9, 1)
      expect(position[left + 1]).toBeCloseTo(0.02, 6)
    }
  })

  it('curves: the path leaves the straight line by a visible margin', () => {
    const position = attribute(geometry, 'position')
    const xs = Array.from({ length: samples + 1 }, (_, i) => (position[i * 6] + position[i * 6 + 3]) / 2)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(8)
  })

  it('offsets a ribbon sideways by the requested amount', () => {
    const shifted = createRibbon(trackCurve, { samples, offset: 4.5, halfWidth: 0.2, y: 0 })
    const a = attribute(geometry, 'position')
    const b = attribute(shifted, 'position')
    // At the start of the track, where it runs straight, the shift is purely in x.
    const centreX = (a[0] + a[3]) / 2
    const shiftedX = (b[0] + b[3]) / 2
    expect(shiftedX - centreX).toBeCloseTo(4.5, 1)
  })
})

describe('barriers', () => {
  it('stand up from the ground to the given height', () => {
    const wall = createWall(trackCurve, 20, 7, 0.7)
    const position = attribute(wall, 'position')
    for (let i = 0; i <= 20; i++) {
      expect(position[i * 6 + 1]).toBe(0)
      expect(position[i * 6 + 4]).toBeCloseTo(0.7, 6)
    }
  })
})

describe('lofted bodies', () => {
  const sections: LoftSection[] = [
    { z: 2, w: 0.7, yBottom: 0.2, yTop: 0.7, n: 3, taper: 0.7 },
    { z: 0, w: 1, yBottom: 0.1, yTop: 0.8, n: 3, taper: 0.6 },
    { z: -2, w: 0.2, yBottom: 0.1, yTop: 0.3, n: 2.4, taper: 0.9 },
  ]
  const radial = 24
  const geometry = createLoft(sections, radial)
  const position = geometry.getAttribute('position').array as Float32Array
  const index = geometry.getIndex()!.array

  it('contains only finite coordinates', () => {
    for (const value of position) expect(Number.isFinite(value)).toBe(true)
  })

  it('references only existing vertices', () => {
    const count = position.length / 3
    for (const i of index) expect(i).toBeLessThan(count)
  })

  it('stays within the sections it was given', () => {
    let maxX = 0
    let minY = Infinity
    let maxY = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (let i = 0; i < position.length; i += 3) {
      maxX = Math.max(maxX, Math.abs(position[i]))
      minY = Math.min(minY, position[i + 1])
      maxY = Math.max(maxY, position[i + 1])
      minZ = Math.min(minZ, position[i + 2])
      maxZ = Math.max(maxZ, position[i + 2])
    }
    expect(maxX).toBeLessThanOrEqual(1 + 1e-6)
    expect(minY).toBeGreaterThanOrEqual(0.1 - 1e-6)
    expect(maxY).toBeLessThanOrEqual(0.8 + 1e-6)
    expect(minZ).toBe(-2)
    expect(maxZ).toBe(2)
  })

  it('has outward-facing surfaces: side normals point away from the centre line', () => {
    const normal = geometry.getAttribute('normal').array as Float32Array
    // Middle ring, the vertex on the +x side (theta = 0).
    const vertex = radial * 1
    expect(normal[vertex * 3]).toBeGreaterThan(0.5)
    // ...and on the -x side (theta = pi).
    expect(normal[(vertex + radial / 2) * 3]).toBeLessThan(-0.5)
  })
})

describe('seededRandom', () => {
  it('repeats exactly for the same seed and differs between seeds', () => {
    const a = seededRandom(7)
    const b = seededRandom(7)
    const c = seededRandom(8)
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    expect([c(), c(), c()]).not.toEqual(first)
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})
