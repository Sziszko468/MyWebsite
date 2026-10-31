import { describe, expect, it } from 'vitest'
import { DRIFT_TIME, MAX_COMBO, newDrift, sideslip, updateDrift } from './drift'
import { createCarState, deriveCarParams, placeCar, stepCar } from './carPhysics'
import { DEFAULT_SETUP } from './carSetup'
import { defaultTrack, gridSlot, sampleTrack } from './trackModel'

const DT = 1 / 120
const run = (
  state: ReturnType<typeof newDrift>,
  seconds: number,
  speed: number,
  angle: number,
  lost = false,
  banked: number[] = [],
) => {
  for (let t = 0; t < seconds; t += DT)
    updateDrift(state, DT, speed, angle, lost, true, (points) => banked.push(points))
  return banked
}

describe('drift scoring', () => {
  it('measures the angle between where the car points and where it goes', () => {
    expect(sideslip(30, 0)).toBe(0)
    expect(sideslip(30, 30)).toBeCloseTo(Math.PI / 4, 5)
    expect(sideslip(30, -30)).toBeCloseTo(Math.PI / 4, 5)
    expect(sideslip(0, 5)).toBeGreaterThan(1.4)
  })

  it('pays nothing for driving straight, or for sliding too slowly or too little', () => {
    const state = newDrift()
    run(state, 5, 40, 0.02)
    run(state, 5, 6, 0.5)
    run(state, 5, 40, 0.1)
    expect(state.score + state.chain).toBe(0)
  })

  it('builds a chain while the car slides and banks it when it straightens out', () => {
    const state = newDrift()
    const banked = run(state, 2, 30, 0.4)
    expect(state.chain).toBeGreaterThan(100)
    expect(state.drifting).toBe(true)
    expect(state.score).toBe(0)
    run(state, 1.2, 30, 0.02, false, banked)
    expect(banked).toHaveLength(1)
    expect(state.score).toBe(banked[0])
    expect(state.chain).toBe(0)
    expect(state.best).toBe(state.score)
  })

  it('pays more for holding it, more for speed and more for angle, up to a limit', () => {
    const short = newDrift()
    run(short, 1, 30, 0.4)
    const long = newDrift()
    run(long, 6, 30, 0.4)
    expect(long.combo).toBe(MAX_COMBO)
    expect(long.chain).toBeGreaterThan(short.chain * 6)
    const slow = newDrift()
    const fast = newDrift()
    run(slow, 1, 15, 0.4)
    run(fast, 1, 40, 0.4)
    expect(fast.chain).toBeGreaterThan(slow.chain * 2)
    const small = newDrift()
    const big = newDrift()
    run(small, 1, 30, 0.2)
    run(big, 1, 30, 0.6)
    expect(big.chain).toBeGreaterThan(small.chain * 2)
  })

  it('loses the chain to a wall or to a spin', () => {
    const wall = newDrift()
    run(wall, 2, 30, 0.4)
    run(wall, 0.05, 30, 0.4, true)
    expect(wall.chain).toBe(0)
    const banked: number[] = []
    run(wall, 2, 30, 0.02, false, banked)
    expect(banked).toHaveLength(0)
    const spin = newDrift()
    run(spin, 2, 30, 0.4)
    run(spin, 0.1, 30, 1.4)
    expect(spin.chain).toBe(0)
  })

  it('runs for a minute, banks what is left at the end and then stops scoring', () => {
    const state = newDrift(100)
    const banked: number[] = []
    run(state, DRIFT_TIME - 1, 30, 0.02, false, banked)
    run(state, 1.5, 30, 0.4, false, banked)
    expect(state.finished).toBe(true)
    expect(state.remaining).toBe(0)
    expect(banked.length).toBeGreaterThan(0)
    const score = state.score
    run(state, 3, 30, 0.4, false, banked)
    expect(state.score).toBe(score)
    expect(state.best).toBeGreaterThanOrEqual(score)
    // The clock only runs when it is told to.
    const waiting = newDrift()
    for (let t = 0; t < 2; t += DT) updateDrift(waiting, DT, 30, 0.4, false, false, () => undefined)
    expect(waiting.remaining).toBe(DRIFT_TIME)
  })

  it('can really be earned in the car: a short handbrake kick, then counter-steering, holds a slide that pays', () => {
    const track = sampleTrack(defaultTrack())!
    const params = deriveCarParams(DEFAULT_SETUP)
    const car = createCarState()
    const slot = gridSlot(track, 2)
    placeCar(car, track, slot.x, slot.z, slot.heading, 38)
    const state = newDrift()
    let held = 0
    let peak = 0
    for (let t = 0; t < 4; t += DT) {
      const kick = t > 0.3 && t < 0.45
      const beta = Math.atan2(car.v, Math.max(car.u, 0.1))
      // Steer into the slide to hold it: what a driver does with the wheel.
      const steer = kick ? 0.5 : t > 0.3 ? Math.max(-1, Math.min(1, 2.5 * beta)) : 0
      stepCar(car, { throttle: 1, brake: 0, steer, handbrake: kick }, params, track, DT)
      const angle = sideslip(car.u, car.v)
      if (angle > 0.17 && angle < 1.05) held += DT
      updateDrift(state, DT, Math.hypot(car.u, car.v), angle, car.outside || car.impact > 2.5, true, () => undefined)
      peak = Math.max(peak, state.chain)
    }
    // The slide lasts for seconds and is worth points, until the car runs off the road, which loses it.
    expect(held).toBeGreaterThan(1.2)
    expect(peak).toBeGreaterThan(40)
  })

  it('a hard kick spins the car instead, and a spin pays nothing', () => {
    const track = sampleTrack(defaultTrack())!
    const params = deriveCarParams(DEFAULT_SETUP)
    const car = createCarState()
    const slot = gridSlot(track, 2)
    placeCar(car, track, slot.x, slot.z, slot.heading, 45)
    const state = newDrift()
    for (let t = 0; t < 4; t += DT) {
      const turn = t > 0.4 && t < 1.6
      stepCar(car, { throttle: 0.6, brake: 0, steer: turn ? 0.8 : 0, handbrake: turn }, params, track, DT)
      updateDrift(
        state,
        DT,
        Math.hypot(car.u, car.v),
        sideslip(car.u, car.v),
        car.outside || car.impact > 2.5,
        true,
        () => undefined,
      )
    }
    expect(state.score).toBe(0)
  })
})
