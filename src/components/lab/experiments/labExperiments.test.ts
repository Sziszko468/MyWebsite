import { describe, expect, it } from 'vitest'
import { icoSphereVertexCount } from '../core/resources'
import { cloneParams, easeMatter, MATTER_PARAMS, MATTERS } from './liquid/liquidMaterials'
import { buildGenerative, makeNoise, OBJECT_RADIUS } from './generative/genGeometry'
import {
  addSaved,
  FORMS,
  GEN_DEFAULTS,
  genText,
  MAX_SAVED,
  paramsFromSeed,
  parseSeedCode,
  sanitizeParams,
  seedCode,
  type GenParams,
  type SavedObject,
} from './generative/genParams'
import { generateShape, SHAPES } from './particles/particleShapes'
import { FlowField, ParticleSim, type ParticleForces } from './particles/particleSim'
import { fontSizeFor, layoutPhrase, MAX_LETTERS, PHRASES } from './type/typeLayout'
import { LetterField, MAX as MAX_FIELD_LETTERS } from './type/typeSim'
import { LAB_PROFILES } from '../core/labProfile'

const forces = (override: Partial<ParticleForces> = {}): ParticleForces => ({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  presence: 0,
  sign: 1,
  strength: 1,
  radius: 1.7,
  time: 0,
  ambient: 0,
  ...override,
})

describe('Particle Universe: shapes', () => {
  it.each(SHAPES)('%s is deterministic, finite and inside its box', (shape) => {
    const a = generateShape(shape, 3000)
    const b = generateShape(shape, 3000)
    expect(Array.from(a.slice(0, 60))).toEqual(Array.from(b.slice(0, 60)))
    for (let i = 0; i < a.length; i += 3) {
      expect(Number.isFinite(a[i] + a[i + 1] + a[i + 2])).toBe(true)
      expect(Math.abs(a[i])).toBeLessThan(5.2)
      expect(Math.abs(a[i + 1])).toBeLessThan(4)
      expect(Math.abs(a[i + 2])).toBeLessThan(4.2)
    }
  })

  it('give every shape its own cloud, and any prefix of a shape is the same shape', () => {
    const sphere = generateShape('sphere', 500)
    const ring = generateShape('ring', 500)
    expect(Array.from(sphere.slice(0, 30))).not.toEqual(Array.from(ring.slice(0, 30)))
    expect(Array.from(generateShape('wave', 200))).toEqual(Array.from(generateShape('wave', 800).slice(0, 600)))
  })
})

describe('Particle Universe: simulation', () => {
  it('starts at rest on its shape and stays there when nothing touches it', () => {
    const sim = new ParticleSim(2000, 'sphere')
    expect(sim.disorder()).toBe(0)
    for (let i = 0; i < 120; i++) sim.step(1 / 60, forces(), null)
    expect(sim.disorder()).toBeLessThan(1e-3)
  })

  it('attracts towards the pointer and repels away from it', () => {
    const near = (sign: 1 | -1) => {
      const sim = new ParticleSim(3000, 'sphere')
      for (let i = 0; i < 60; i++) sim.step(1 / 60, forces({ x: 2.4, y: 0, presence: 1, sign, strength: 2 }), null)
      let total = 0
      let count = 0
      for (let i = 0; i < sim.active; i++) {
        const d = Math.hypot(sim.positions[i * 3] - 2.4, sim.positions[i * 3 + 1])
        if (d < 3) {
          total += d
          count++
        }
      }
      return total / Math.max(count, 1)
    }
    expect(near(1)).toBeLessThan(near(-1))
  })

  it('blasts the cloud apart on a burst and lets it re-form over a couple of seconds', () => {
    const sim = new ParticleSim(3000, 'ring')
    sim.burst(0, 0, 1)
    for (let i = 0; i < 12; i++) sim.step(1 / 60, forces(), null)
    const scattered = sim.disorder()
    expect(scattered).toBeGreaterThan(0.5)
    for (let i = 0; i < 60 * 8; i++) sim.step(1 / 60, forces(), null)
    expect(sim.disorder()).toBeLessThan(0.05)
    expect(sim.loosen).toBe(0)
  })

  it('never produces a non-finite number, a runaway speed or a particle behind the camera', () => {
    const sim = new ParticleSim(2000, 'spiral')
    for (let burst = 0; burst < 6; burst++) {
      sim.burst(Math.sin(burst) * 3, Math.cos(burst) * 2, 2)
      for (let i = 0; i < 30; i++)
        sim.step(1 / 30, forces({ x: 1, y: 1, presence: 1, strength: 2, ambient: 1, time: i }), null)
    }
    for (let i = 0; i < sim.active; i++) {
      const at = i * 3
      expect(Number.isFinite(sim.positions[at] + sim.positions[at + 1] + sim.positions[at + 2])).toBe(true)
      expect(Math.hypot(sim.velocities[at], sim.velocities[at + 1], sim.velocities[at + 2])).toBeLessThanOrEqual(20.001)
      expect(sim.positions[at + 2]).toBeLessThanOrEqual(4)
      expect(sim.positions[at + 2]).toBeGreaterThanOrEqual(-7)
    }
  })

  it('changes density without moving the particles that stay, and starts the new ones at home', () => {
    const sim = new ParticleSim(1000, 'sphere')
    sim.setActive(300)
    expect(sim.active).toBe(300)
    const before = sim.positions.slice(0, 3)
    sim.burst(0, 0, 1)
    sim.step(1 / 60, forces(), null)
    sim.setActive(1000)
    expect(sim.active).toBe(1000)
    expect(sim.positions[999 * 3]).toBe(sim.targets[999 * 3])
    expect(sim.positions[0]).not.toBe(before[0])
    sim.setActive(0)
    expect(sim.active).toBe(1)
  })

  it('switches shape by sending particles to new homes', () => {
    const sim = new ParticleSim(800, 'sphere')
    sim.setShape('wave')
    expect(sim.currentShape).toBe('wave')
    expect(sim.disorder()).toBeGreaterThan(0.3)
    for (let i = 0; i < 60 * 8; i++) sim.step(1 / 60, forces(), null)
    expect(sim.disorder()).toBeLessThan(0.05)
  })
})

describe('Particle Universe: the flow field', () => {
  it('carries a splat of movement, spreads it and lets it die away', () => {
    const flow = new FlowField(32, 18)
    flow.setBounds(4, 2.25)
    const out = { x: 0, y: 0 }
    flow.splat(0, 0, 3, 0, 1, 1)
    flow.sample(0, 0, out)
    expect(out.x).toBeGreaterThan(0.5)
    for (let i = 0; i < 20; i++) flow.step(1 / 60)
    flow.sample(0.6, 0, out)
    expect(out.x).toBeGreaterThan(0)
    for (let i = 0; i < 60 * 8; i++) flow.step(1 / 60)
    expect(flow.peak).toBeLessThan(0.01)
    flow.splat(0, 0, 1, 1, 1, 1)
    flow.clear()
    expect(flow.peak).toBe(0)
  })

  it('reads safely outside its bounds', () => {
    const flow = new FlowField(16, 9)
    flow.setBounds(1, 1)
    flow.splat(0.5, 0.5, 1, 1, 0.5, 1)
    const out = { x: 0, y: 0 }
    flow.sample(50, -50, out)
    expect(Number.isFinite(out.x + out.y)).toBe(true)
  })
})

describe('Liquid Matter: the four states', () => {
  it('differ in light, geometry and flow, not only in colour', () => {
    expect(MATTER_PARAMS.chrome.metal).toBe(1)
    expect(MATTER_PARAMS.soft.metal).toBe(0)
    expect(MATTER_PARAMS.glass.glass).toBe(1)
    expect(MATTER_PARAMS.glass.quant).toBe(1)
    expect(MATTER_PARAMS.molten.molten).toBe(1)
    // A thick material follows slowly, a thin one at once; molten flows fastest.
    expect(MATTER_PARAMS.soft.response).toBeGreaterThan(MATTER_PARAMS.chrome.response)
    expect(MATTER_PARAMS.molten.noiseSpeed).toBeGreaterThan(MATTER_PARAMS.soft.noiseSpeed)
    expect(MATTERS).toHaveLength(4)
  })

  it('eases from one state to another and reports when it is still on the way', () => {
    const shown = cloneParams('chrome')
    expect(easeMatter(shown, MATTER_PARAMS.chrome, 1 / 60)).toBe(false)
    expect(easeMatter(shown, MATTER_PARAMS.molten, 1 / 60)).toBe(true)
    expect(shown.molten).toBeGreaterThan(0)
    expect(shown.molten).toBeLessThan(1)
    for (let i = 0; i < 60 * 6; i++) easeMatter(shown, MATTER_PARAMS.molten, 1 / 60)
    expect(shown.molten).toBeCloseTo(1, 2)
    expect(easeMatter(shown, MATTER_PARAMS.molten, 1 / 60)).toBe(false)
  })

  it('counts the vertices of an icosphere without building it', () => {
    expect(icoSphereVertexCount(1)).toBe(42)
    expect(icoSphereVertexCount(LAB_PROFILES.high.liquidDetail)).toBeLessThan(60_000)
  })
})

describe('Type in Motion: layout and letters', () => {
  // A fake font where every letter is 0.6 em wide, so the numbers can be checked by hand.
  const measure = (fontPx: number) => (text: string) => text.length * 0.6 * fontPx

  it('lays every letter of each sentence out once, left to right, line by line, without spaces', () => {
    for (const phrase of PHRASES) {
      const layout = layoutPhrase(phrase.lines, 100, measure(100))
      expect(layout.letters.map((letter) => letter.char).join('')).toBe(phrase.lines.join('').replace(/ /g, ''))
      expect(layout.letters.map((letter) => letter.index)).toEqual(layout.letters.map((_, i) => i))
      for (const letter of layout.letters) {
        expect(letter.x).toBeGreaterThanOrEqual(0)
        expect(letter.x + letter.width).toBeLessThanOrEqual(layout.width)
        expect(letter.y + letter.height).toBeLessThanOrEqual(layout.height)
      }
    }
    expect(MAX_LETTERS).toBeLessThanOrEqual(MAX_FIELD_LETTERS)
  })

  it('sets the longest line at the width asked for', () => {
    const px = fontSizeFor(['CREATE', 'WITHOUT'], 1000, 100, measure(100))
    expect(measure(px)('WITHOUT')).toBeCloseTo(1000)
  })

  const homes = (n: number) => Float32Array.from({ length: n * 2 }, (_, i) => (i % 2 === 0 ? (i / 2 - n / 2) * 1.5 : 0))
  const still: Parameters<LetterField['step']>[1] = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    presence: 0,
    radius: 3.4,
    strength: 1,
    broken: false,
  }

  it('starts assembled, scatters on a click and finds its way home', () => {
    const field = new LetterField()
    field.setLetters(homes(12), 12, false)
    expect(field.offset).toBe(0)
    field.scatter(0, 0, 1)
    for (let i = 0; i < 10; i++) field.step(1 / 60, still)
    expect(field.offset).toBeGreaterThan(1)
    for (let i = 0; i < 60 * 6; i++) field.step(1 / 60, still)
    expect(field.offset).toBeLessThan(0.02)
    expect(field.unrest).toBeLessThan(0.02)
  })

  it('arrives from a scattered start when a new sentence is loaded', () => {
    const field = new LetterField()
    field.setLetters(homes(10), 10, true)
    expect(field.offset).toBeGreaterThan(1)
    for (let i = 0; i < 60 * 6; i++) field.step(1 / 60, still)
    expect(field.offset).toBeLessThan(0.02)
  })

  it('tilts and lifts the letters near the pointer, and lets them go when it leaves', () => {
    const field = new LetterField()
    field.setLetters(homes(8), 8, false)
    for (let i = 0; i < 90; i++) field.step(1 / 60, { ...still, x: field.homes[0], y: 0, presence: 1, strength: 1 })
    expect(field.pose[2]).toBeGreaterThan(0.5)
    expect(Math.abs(field.pose[3]) + Math.abs(field.pose[4])).toBeGreaterThanOrEqual(0)
    for (let i = 0; i < 60 * 4; i++) field.step(1 / 60, still)
    expect(Math.abs(field.pose[2])).toBeLessThan(0.02)
  })

  it('breaks apart into separate offsets and reassembles', () => {
    const field = new LetterField()
    field.setLetters(homes(8), 8, false)
    for (let i = 0; i < 60 * 3; i++) field.step(1 / 60, { ...still, broken: true })
    expect(field.split).toBeGreaterThan(0.95)
    expect(field.offset).toBeGreaterThan(0.2)
    for (let i = 0; i < 60 * 5; i++) field.step(1 / 60, still)
    expect(field.split).toBeLessThan(0.02)
    expect(field.offset).toBeLessThan(0.02)
  })

  it('stays finite under a barrage', () => {
    const field = new LetterField()
    field.setLetters(homes(20), 20, true)
    for (let i = 0; i < 300; i++) {
      if (i % 20 === 0) field.scatter(Math.sin(i), Math.cos(i), 2, i)
      field.step(1 / 30, { ...still, x: Math.sin(i), y: 1, vx: 9, presence: 1, strength: 1.5, broken: i % 100 > 50 })
    }
    for (let i = 0; i < field.count * 6; i++) expect(Number.isFinite(field.pose[i])).toBe(true)
  })
})

describe('Generative Objects: parameters and codes', () => {
  it('makes the same parameters from the same seed, and different ones from another', () => {
    expect(paramsFromSeed(12345)).toEqual(paramsFromSeed(12345))
    expect(paramsFromSeed(12345)).not.toEqual(paramsFromSeed(54321))
    expect(paramsFromSeed(7).seed).toBe(7)
  })

  it('always stays inside its ranges', () => {
    for (let seed = 1; seed < 400; seed += 7) {
      const p = paramsFromSeed(seed * 7919)
      expect(FORMS).toContain(p.form)
      expect(p.symmetry).toBeGreaterThanOrEqual(1)
      expect(p.symmetry).toBeLessThanOrEqual(12)
      for (const value of [p.complexity, p.depth, p.distortion]) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })

  it('turns a seed into a code and back, in any case and with or without the prefix', () => {
    for (const seed of [0, 1, 2718281, 4294967295, 123456789]) {
      const code = seedCode(seed)
      expect(code).toMatch(/^CC-[0-9A-Z]{7}$/)
      expect(parseSeedCode(code)).toBe(seed)
      expect(parseSeedCode(code.toLowerCase())).toBe(seed)
      expect(parseSeedCode(code.slice(3))).toBe(seed)
    }
    for (const bad of ['', 'CC-', 'hello world', 'CC-ZZZZZZZZZ', '<script>']) expect(parseSeedCode(bad), bad).toBeNull()
  })

  it('repairs parameters that are out of range', () => {
    const wild = {
      ...GEN_DEFAULTS,
      complexity: 9,
      depth: -3,
      symmetry: 99.4,
      light: 0,
      form: 'nope',
      material: 'x',
      palette: 'y',
      seed: -1,
    } as unknown as GenParams
    const clean = sanitizeParams(wild)
    expect(clean.complexity).toBe(1)
    expect(clean.depth).toBe(0)
    expect(clean.symmetry).toBe(12)
    expect(clean.light).toBe(0.4)
    expect(clean.form).toBe(GEN_DEFAULTS.form)
    expect(clean.seed).toBe(4294967295)
  })

  it('keeps at most six saved objects, newest last, and never the same one twice', () => {
    let collection: SavedObject[] = []
    for (let seed = 1; seed <= 10; seed++)
      collection = addSaved(collection, { params: paramsFromSeed(seed), picture: '' })
    expect(collection).toHaveLength(MAX_SAVED)
    expect(collection[collection.length - 1].params.seed).toBe(10)
    expect(collection[0].params.seed).toBe(5)
    const again = addSaved(collection, { params: paramsFromSeed(10), picture: 'x' })
    expect(again).toHaveLength(MAX_SAVED)
    expect(again[again.length - 1].picture).toBe('x')
  })

  it('has every word in all three languages', () => {
    const missing: string[] = []
    const walk = (value: unknown, path: string) => {
      if (typeof value !== 'object' || value === null) return
      const record = value as Record<string, unknown>
      if (typeof record.hu === 'string') {
        for (const lang of ['hu', 'en', 'nl']) if (!(record[lang] as string)?.trim()) missing.push(`${path}.${lang}`)
        return
      }
      for (const [key, child] of Object.entries(record)) walk(child, `${path}.${key}`)
    }
    walk(genText, 'genText')
    expect(missing).toEqual([])
  })
})

describe('Generative Objects: geometry', () => {
  const budget = 20_000

  it.each(FORMS)('%s stays inside the vertex budget, finite, centred and the same size', (form) => {
    for (const complexity of [0, 0.5, 1]) {
      const params: GenParams = { ...GEN_DEFAULTS, form, complexity, seed: 99 }
      const { geometry, vertexCount } = buildGenerative(params, budget)
      expect(vertexCount, `${form} at ${complexity}`).toBeLessThanOrEqual(budget)
      expect(vertexCount).toBeGreaterThan(20)
      const position = geometry.getAttribute('position')
      const normal = geometry.getAttribute('normal')
      expect(normal.count).toBe(position.count)
      for (let i = 0; i < position.count; i++) {
        expect(Number.isFinite(position.getX(i) + position.getY(i) + position.getZ(i))).toBe(true)
        expect(Number.isFinite(normal.getX(i) + normal.getY(i) + normal.getZ(i))).toBe(true)
      }
      geometry.computeBoundingSphere()
      expect(geometry.boundingSphere?.radius).toBeCloseTo(OBJECT_RADIUS, 1)
      geometry.dispose()
    }
  })

  it('is deterministic and changes with the seed and with each parameter', () => {
    const first = (params: GenParams) => {
      const { geometry } = buildGenerative(params, budget)
      const out = Array.from(geometry.getAttribute('position').array.slice(0, 90))
      geometry.dispose()
      return out
    }
    const base: GenParams = { ...GEN_DEFAULTS, form: 'bloom', seed: 5 }
    expect(first(base)).toEqual(first(base))
    expect(first(base)).not.toEqual(first({ ...base, seed: 6 }))
    expect(first(base)).not.toEqual(first({ ...base, symmetry: 8 }))
    expect(first(base)).not.toEqual(first({ ...base, distortion: 0.9 }))
    expect(first(base)).not.toEqual(first({ ...base, depth: 0.1 }))
  })

  it('gets more detailed with complexity, within the budget, and never past a smaller one', () => {
    const count = (complexity: number, limit: number) => {
      const built = buildGenerative({ ...GEN_DEFAULTS, form: 'spire', complexity }, limit)
      built.geometry.dispose()
      return built.vertexCount
    }
    expect(count(1, budget)).toBeGreaterThan(count(0, budget))
    expect(count(1, 5000)).toBeLessThanOrEqual(5000)
    expect(count(1, budget)).toBeGreaterThan(count(1, 5000))
  })

  it('faces its triangles outwards', () => {
    const { geometry } = buildGenerative({ ...GEN_DEFAULTS, form: 'knot', seed: 3 }, budget)
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    let outward = 0
    for (let i = 0; i < position.count; i++)
      outward +=
        position.getX(i) * normal.getX(i) + position.getY(i) * normal.getY(i) + position.getZ(i) * normal.getZ(i)
    expect(outward).toBeGreaterThan(0)
    geometry.dispose()
  })

  it('has a noise that is smooth, bounded and seeded', () => {
    const noise = makeNoise(4)
    expect(noise(0.3, 0.4, 0.5)).toBe(noise(0.3, 0.4, 0.5))
    expect(makeNoise(5)(0.3, 0.4, 0.5)).not.toBe(noise(0.3, 0.4, 0.5))
    for (let i = 0; i < 200; i++) expect(Math.abs(noise(i * 0.37, i * 0.11, i * 0.73))).toBeLessThanOrEqual(1)
    expect(Math.abs(noise(1.2, 2.3, 3.4) - noise(1.2001, 2.3, 3.4))).toBeLessThan(0.01)
  })
})
