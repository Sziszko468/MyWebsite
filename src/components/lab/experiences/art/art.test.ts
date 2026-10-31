import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PARAMS,
  FORMATIONS,
  PALETTE_IDS,
  RANGES,
  randomParams,
  rng,
  sanitizeParams,
  type ArtParams,
  type NumberKey,
} from './artParams'
import { POINTER_RADIUS, ParticleField, newPointer } from './artSim'

const params = (patch: Partial<ArtParams> = {}): ArtParams => ({ ...DEFAULT_PARAMS, count: 3000, ...patch })

function settle(field: ParticleField, p: ArtParams, seconds = 4) {
  for (let t = 0; t < seconds; t += 1 / 60) field.step(1 / 60, p, newPointer(), 1)
}

describe('the parameters', () => {
  it('clamp every number and refuse unknown choices, so a hostile file cannot reach the engine', () => {
    const wild = sanitizeParams({
      seed: 1e12,
      count: -5,
      speed: NaN,
      force: Infinity,
      gravity: 'x',
      turbulence: 99,
      palette: 'neon',
      formation: 'cube',
      distortion: -2,
      noise: 7,
      rotation: 1e9,
      scale: 0,
      pointer: 'explode',
    })
    for (const key of Object.keys(RANGES) as NumberKey[]) {
      expect(wild[key]).toBeGreaterThanOrEqual(RANGES[key].min)
      expect(wild[key]).toBeLessThanOrEqual(RANGES[key].max)
    }
    expect(wild.palette).toBe(DEFAULT_PARAMS.palette)
    expect(wild.formation).toBe(DEFAULT_PARAMS.formation)
    expect(wild.pointer).toBe(DEFAULT_PARAMS.pointer)
    expect(Number.isInteger(wild.seed) && Number.isInteger(wild.count)).toBe(true)
    expect(sanitizeParams(null)).toEqual(DEFAULT_PARAMS)
    expect(sanitizeParams(sanitizeParams(wild))).toEqual(wild)
  })

  it('make the same random composition from the same seed, and different ones from different seeds', () => {
    expect(randomParams(7)).toEqual(randomParams(7))
    const seeds = Array.from({ length: 40 }, (_, i) => JSON.stringify(randomParams(i + 1)))
    expect(new Set(seeds).size).toBe(40)
    const formations = new Set(Array.from({ length: 60 }, (_, i) => randomParams(i + 1).formation))
    const palettes = new Set(Array.from({ length: 60 }, (_, i) => randomParams(i + 1).palette))
    expect(formations.size).toBe(FORMATIONS.length)
    expect(palettes.size).toBe(PALETTE_IDS.length)
  })

  it('keep a random composition within what a phone can draw', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const p = randomParams(seed, 8000)
      expect(p.count).toBeLessThanOrEqual(8000)
      expect(p).toEqual(sanitizeParams(p))
    }
    const a = rng(1)
    const b = rng(1)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })
})

describe('the particles', () => {
  it('start on their homes, and every formation puts them somewhere different and bounded', () => {
    const shapes = new Set<string>()
    for (const formation of FORMATIONS) {
      const field = new ParticleField(4000)
      field.build(params({ formation }))
      expect(field.count).toBe(3000)
      let largest = 0
      let sum = 0
      for (let i = 0; i < field.count * 3; i++) {
        expect(Number.isFinite(field.position[i])).toBe(true)
        largest = Math.max(largest, Math.abs(field.position[i]))
        sum += field.position[i] * field.position[i]
      }
      expect(largest).toBeLessThan(6)
      shapes.add(sum.toFixed(1))
      expect(field.disturbance()).toBeLessThan(1e-4)
    }
    expect(shapes.size).toBe(FORMATIONS.length)
  })

  it('are the same every time for the same parameters, and move the same way', () => {
    const run = () => {
      const field = new ParticleField(4000)
      const p = params({ turbulence: 1, noise: 0.6 })
      field.build(p)
      settle(field, p, 2)
      return Array.from(field.position.subarray(0, 60))
    }
    expect(run()).toEqual(run())
  })

  it('stay inside the picture however hard they are stirred', () => {
    const field = new ParticleField(4000)
    const p = params({ turbulence: 2, gravity: 1, force: 3, speed: 3, noise: 1, distortion: 1 })
    field.build(p)
    const pointer = { x: 0.5, y: 0.2, z: 0, active: true }
    for (let t = 0; t < 12; t += 1 / 60) {
      field.step(1 / 60, p, pointer, 1)
      if (Math.round(t * 60) % 40 === 0) field.impulse(0, 0, 0, 3)
    }
    let largest = 0
    for (let i = 0; i < field.count * 3; i++) {
      expect(Number.isFinite(field.position[i])).toBe(true)
      largest = Math.max(largest, Math.abs(field.position[i]))
    }
    expect(largest).toBeLessThan(40)
  })

  it('are pushed away by the pointer in repel mode and drawn towards it in attract mode', () => {
    const near = (field: ParticleField, x: number, y: number, z: number) => {
      let sum = 0
      let n = 0
      for (let i = 0; i < field.count; i++) {
        const d = Math.hypot(field.position[i * 3] - x, field.position[i * 3 + 1] - y, field.position[i * 3 + 2] - z)
        if (d < POINTER_RADIUS * 0.8) {
          sum += d
          n++
        }
      }
      return { mean: sum / Math.max(n, 1), n }
    }
    const measure = (mode: 'repel' | 'attract') => {
      const field = new ParticleField(4000)
      const p = params({
        formation: 'sphere',
        pointer: mode,
        force: 2.5,
        turbulence: 0,
        noise: 0,
        distortion: 0,
        rotation: 0,
      })
      field.build(p)
      const pointer = { x: 2.2, y: 0, z: 0, active: true }
      const before = near(field, pointer.x, pointer.y, pointer.z).n
      for (let t = 0; t < 1.5; t += 1 / 60) field.step(1 / 60, p, pointer, 1)
      return { before, after: near(field, pointer.x, pointer.y, pointer.z).n, disturbed: field.disturbance() }
    }
    const repel = measure('repel')
    const attract = measure('attract')
    expect(repel.after).toBeLessThan(repel.before)
    expect(attract.after).toBeGreaterThan(attract.before * 0.9)
    expect(repel.disturbed).toBeGreaterThan(0.01)
    // With the pointer off, nothing is disturbed.
    const field = new ParticleField(4000)
    const p = params({ turbulence: 0, noise: 0, distortion: 0, rotation: 0 })
    field.build(p)
    settle(field, p, 2)
    expect(field.disturbance()).toBeLessThan(0.02)
  })

  it('are thrown by a click and come back to the shape afterwards', () => {
    const field = new ParticleField(4000)
    const p = params({ turbulence: 0, noise: 0, rotation: 0 })
    field.build(p)
    field.impulse(0, 0, 2.2, 2)
    let speed = 0
    for (let i = 0; i < field.count; i++)
      speed += Math.hypot(field.velocity[i * 3], field.velocity[i * 3 + 1], field.velocity[i * 3 + 2])
    expect(speed / field.count).toBeGreaterThan(0.05)
    for (let t = 0; t < 1; t += 1 / 60) field.step(1 / 60, p, newPointer(), 1)
    const scattered = field.disturbance()
    expect(scattered).toBeGreaterThan(0.05)
    settle(field, p, 8)
    expect(field.disturbance()).toBeLessThan(scattered * 0.25)
  })

  it('are weighed on by gravity, and held still when motion is turned all the way down', () => {
    const meanY = (gravity: number) => {
      const field = new ParticleField(4000)
      const p = params({ gravity, turbulence: 0, noise: 0, distortion: 0, rotation: 0 })
      field.build(p)
      settle(field, p, 5)
      let sum = 0
      for (let i = 0; i < field.count; i++) sum += field.position[i * 3 + 1]
      return sum / field.count
    }
    expect(meanY(1)).toBeLessThan(meanY(0) - 0.5)
    expect(meanY(-1)).toBeGreaterThan(meanY(0) + 0.5)
    const field = new ParticleField(4000)
    const p = params({ rotation: 2 })
    field.build(p)
    field.step(1 / 60, p, newPointer(), 0)
    expect(field.angle).toBe(0)
  })

  it('are painted in the palette, with the noise changing the brightness', () => {
    const field = new ParticleField(4000)
    const p = params({ palette: 'racing', noise: 0 })
    field.build(p)
    const out = new Float32Array(4000 * 3)
    field.paint(p, out)
    const reds = Array.from({ length: field.count }, (_, i) => out[i * 3] > 0.9 && out[i * 3 + 1] < 0.2).filter(
      Boolean,
    ).length
    expect(reds).toBeGreaterThan(field.count * 0.4)
    const flat = out[0]
    field.paint({ ...p, noise: 1 }, out)
    expect(out[0]).toBeLessThanOrEqual(flat + 1e-6)
  })
})
