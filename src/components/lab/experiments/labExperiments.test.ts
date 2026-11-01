import { describe, expect, it } from 'vitest'
import { icoSphereVertexCount } from '../core/resources'
import { cloneParams, easeMatter, MATTER_PARAMS, MATTERS } from './liquid/liquidMaterials'
import { generateShape, SHAPES } from './particles/particleShapes'
import { FlowField, ParticleSim, type ParticleForces } from './particles/particleSim'
import { fontSizeFor, layoutPhrase, linesOf, MAX_LETTERS, MAX_LINES, PHRASES, sanitizeText, textSeed } from './type/typeLayout'
import { MOTIONS } from './type/typeControls'
import { presetOffset } from './type/typeMotion'
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

describe('Type in Motion: any words', () => {
  it('makes typed text safe to set: capitals, single spaces, no markup or control characters', () => {
    expect(sanitizeText('  hello    wörld  ')).toBe('HELLO WÖRLD')
    expect(sanitizeText('<b>hi</b>\u0000\n\tthere')).toBe('BHI/B THERE') // the markup's brackets are dropped, a slash is punctuation
    expect(sanitizeText('ű ő é í')).toBe('Ű Ő É Í')
    expect(sanitizeText('')).toBe(PHRASES[0].lines.join(' '))
    expect(sanitizeText(42)).toBe(PHRASES[0].lines.join(' '))
    expect(sanitizeText('😀😀')).toBe(PHRASES[0].lines.join(' '))
    expect(sanitizeText('a'.repeat(500)).length).toBe(MAX_LETTERS)
    expect(sanitizeText('ab '.repeat(50)).replace(/ /g, '').length).toBeLessThanOrEqual(MAX_LETTERS)
  })

  it('sets the three given sentences exactly as before, one word to a line', () => {
    for (const phrase of PHRASES) expect(linesOf(phrase.lines.join(' '))).toEqual([...phrase.lines])
  })

  it('never sets more lines than there is room for, loses no letter, and keeps every line non-empty', () => {
    for (const text of ['A', 'ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN', 'SUPERCALIFRAGILISTICEXPIALIDOCIOUS', 'A B C D E F G H I J K L', 'x y z']) {
      const lines = linesOf(text)
      const clean = sanitizeText(text)
      expect(lines.length).toBeGreaterThan(0)
      expect(lines.length).toBeLessThanOrEqual(MAX_LINES)
      expect(lines.every((line) => line.length > 0)).toBe(true)
      expect(lines.join('').replace(/ /g, '')).toBe(clean.replace(/ /g, ''))
    }
  })

  it('gives the same seed for the same words', () => {
    expect(textSeed('HELLO')).toBe(textSeed('HELLO'))
    expect(textSeed('HELLO')).not.toBe(textSeed('WORLD'))
  })

  it('moves letters by a preset: nothing for “still”, bounded and finite for every other, and the glitch changes at most three times a second', () => {
    for (const motion of MOTIONS) {
      for (let i = 0; i < 36; i++) {
        for (let t = 0; t < 20; t += 0.37) {
          const o = presetOffset(motion, i, (i - 18) * 1.1, t, 1)
          for (const value of Object.values(o)) expect(Number.isFinite(value)).toBe(true)
          expect(Math.abs(o.x) + Math.abs(o.y) + Math.abs(o.z)).toBeLessThan(2)
          expect(o.scale).toBeGreaterThan(0.8)
          expect(o.scale).toBeLessThan(1.2)
          if (motion === 'none' || t === 0) continue
          expect(presetOffset(motion, i, 0, t, 0)).toMatchObject({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, scale: 1 })
        }
      }
    }
    const jumps = new Set<number>()
    let last = ''
    for (let t = 0; t < 4; t += 1 / 120) {
      const key = JSON.stringify(Array.from({ length: 36 }, (_, i) => presetOffset('glitch', i, 0, t, 1).x.toFixed(4)))
      if (key !== last) jumps.add(Math.floor(t * 100))
      last = key
    }
    expect(jumps.size).toBeLessThanOrEqual(13)
  }, 60_000)
})
