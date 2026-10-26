import { describe, expect, it } from 'vitest'
import { createMotion, fieldMotion, type MotionInput } from './fieldMotion'
import { FIELD } from './velocityHeroConfig'

const input = (overrides: Partial<MotionInput> = {}): MotionInput => ({
  mode: 'intro',
  ramp: 1,
  energy: 0,
  pull: 0,
  boost: 0,
  exit: 0,
  ...overrides,
})

describe('the intro at rest', () => {
  const rest = fieldMotion(input())

  it('does not move: no flow, an almost stopped clock, short calm streaks', () => {
    expect(rest.speed).toBe(0)
    expect(rest.phaseRate).toBeLessThan(0.05)
    expect(rest.streak).toBeLessThan(0.2)
    expect(rest.warp).toBeLessThan(0.2)
  })

  it('is unchanged by the scene having just appeared', () => {
    expect(fieldMotion(input({ ramp: 0 })).speed).toBe(0)
  })

  it('is not distorted or drawn apart', () => {
    expect(rest.spread).toBe(1)
    expect(rest.brightness).toBe(1)
    expect(rest.fov).toBe(0)
    expect(rest.roll).toBe(0)
  })
})

describe('the hero at rest', () => {
  it('keeps flowing, unlike the intro', () => {
    const hero = fieldMotion(input({ mode: 'hero' }))
    expect(hero.speed).toBeGreaterThanOrEqual(FIELD.baseSpeed)
    expect(hero.phaseRate).toBe(1)
  })

  it('starts slower while the scene is still waking up', () => {
    expect(fieldMotion(input({ mode: 'hero', ramp: 0 })).speed).toBeLessThan(fieldMotion(input({ mode: 'hero', ramp: 1 })).speed)
  })
})

describe('the intro under the pointer', () => {
  it('speeds up, lengthens the streaks and warps more as the pointer gets faster', () => {
    let previous = fieldMotion(input({ energy: 0 }))
    for (const energy of [0.2, 0.4, 0.6, 0.8, 1]) {
      const next = fieldMotion(input({ energy }))
      expect(next.speed, `speed at ${energy}`).toBeGreaterThan(previous.speed)
      expect(next.streak, `streak at ${energy}`).toBeGreaterThan(previous.streak)
      expect(next.warp, `warp at ${energy}`).toBeGreaterThan(previous.warp)
      expect(next.phaseRate, `clock at ${energy}`).toBeGreaterThan(previous.phaseRate)
      previous = next
    }
  })

  it('keeps the streak length within 0..1', () => {
    expect(fieldMotion(input({ energy: 1 })).streak).toBeLessThanOrEqual(1)
    expect(fieldMotion(input({ energy: 1, exit: 1 })).streak).toBeLessThanOrEqual(1)
  })
})

describe('the intro leaving', () => {
  const at = (exit: number) => fieldMotion(input({ exit, energy: 0.3 }))

  it('rushes past, ever faster, however still the pointer is', () => {
    expect(fieldMotion(input({ exit: 0.5 })).speed).toBeGreaterThan(0)
    let previous = at(0).speed
    for (const exit of [0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      const speed = at(exit).speed
      expect(speed, `speed at ${exit}`).toBeGreaterThan(previous)
      previous = speed
    }
  })

  it('flies the field apart towards the edges and widens and rolls the view', () => {
    expect(at(1).spread).toBeGreaterThan(at(0.5).spread)
    expect(at(0.5).spread).toBeGreaterThan(1)
    expect(at(1).fov).toBeGreaterThan(at(0.5).fov)
    expect(at(1).roll).toBeGreaterThan(at(0.5).roll)
  })

  it('keeps the light until late and then fades it out completely, without flashing', () => {
    expect(at(0.5).brightness).toBe(1)
    let previous = 1
    for (let exit = 0; exit <= 1; exit += 0.02) {
      const brightness = at(exit).brightness
      expect(brightness).toBeLessThanOrEqual(previous + 1e-9)
      previous = brightness
    }
    expect(at(1).brightness).toBe(0)
  })

  it('changes smoothly: no step between neighbouring moments', () => {
    let last = at(0)
    for (let exit = 0.01; exit <= 1; exit += 0.01) {
      const next = at(exit)
      expect(Math.abs(next.spread - last.spread)).toBeLessThan(0.1)
      expect(Math.abs(next.brightness - last.brightness)).toBeLessThan(0.1)
      expect(Math.abs(next.fov - last.fov)).toBeLessThan(1.5)
      last = { ...next }
    }
  })

  it('clamps an out-of-range exit', () => {
    expect(fieldMotion(input({ exit: 7 })).brightness).toBe(0)
    expect(fieldMotion(input({ exit: -3 })).spread).toBe(1)
  })
})

describe('fieldMotion', () => {
  it('writes into the object it is given, so a frame allocates nothing', () => {
    const out = createMotion()
    expect(fieldMotion(input({ energy: 1 }), out)).toBe(out)
    expect(out.speed).toBeGreaterThan(0)
  })
})
