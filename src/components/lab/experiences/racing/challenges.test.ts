import { describe, expect, it } from 'vitest'
import { createCarState, deriveCarParams, maxSteerAngle, newInput, placeCar, stepCar } from './carPhysics'
import { DEFAULT_SETUP } from './carSetup'
import {
  CHECKPOINT_COUNT,
  GAP_HALF,
  HIT_PENALTY,
  MISS_PENALTY,
  PRECISION_GATES,
  PRECISION_LIMIT,
  checkpointScore,
  newCheckpointRun,
  newPrecisionRun,
  planCheckpoints,
  planSlalom,
  precisionResult,
  slalomFits,
  updateCheckpoints,
  updatePrecision,
} from './challenges'
import { simulateLap } from './lapSim'
import { defaultTrack, gridSlot, sampleTrack } from './trackModel'

const DT = 1 / 120
const track = sampleTrack(defaultTrack())!
const params = deriveCarParams(DEFAULT_SETUP)
const estimate = simulateLap(track, params)
const slot = gridSlot(track, 6)
const startS = (() => {
  const car = createCarState()
  placeCar(car, track, slot.x, slot.z, slot.heading)
  return car.place.s
})()
const relative = (s: number) => (s - startS + track.length) % track.length

/** Follows the centre line at a share of the simulated pace, as the lap test does. */
function drive(pace: number, onStep: (car: ReturnType<typeof createCarState>, u: number) => boolean, limit = 240) {
  const car = createCarState()
  placeCar(car, track, slot.x, slot.z, slot.heading)
  const input = newInput()
  for (let t = 0; t < limit; t += DT) {
    const speed = Math.hypot(car.u, car.v)
    const look = 7 + speed * 0.38
    const target = (car.place.index + Math.round(look / track.spacing)) % track.count
    const bearing = Math.atan2(track.z[target] - car.z, track.x[target] - car.x) - car.psi
    const angle = Math.atan((2 * 3.4 * Math.sin(Math.atan2(Math.sin(bearing), Math.cos(bearing)))) / look)
    input.steer = Math.max(-1, Math.min(1, angle / maxSteerAngle(speed)))
    const ahead = (car.place.index + Math.round((20 + speed * 1.6) / track.spacing)) % track.count
    let want = Infinity
    for (let k = car.place.index; k !== ahead; k = (k + 1) % track.count) want = Math.min(want, estimate.speed[k])
    want *= pace
    input.throttle = Math.max(0, Math.min(1, (want - speed) / 4))
    input.brake = Math.max(0, Math.min(1, (speed - want) / 6))
    stepCar(car, input, params, track, DT)
    if (onStep(car, relative(car.place.s))) break
  }
  return car
}

describe('the Checkpoint Challenge', () => {
  const plan = planCheckpoints(track, estimate.speed, startS)

  it('puts ten gates evenly round the lap, with time for each worked out from the simulated pace', () => {
    expect(plan.gates).toHaveLength(CHECKPOINT_COUNT)
    expect(plan.gates[9].u).toBeCloseTo(track.length - 15, 3)
    for (let i = 1; i < plan.gates.length - 1; i++) {
      expect(plan.gates[i].u - plan.gates[i - 1].u).toBeCloseTo(track.length / CHECKPOINT_COUNT, 3)
    }
    for (const bonus of plan.bonus) {
      expect(bonus).toBeGreaterThan(3)
      expect(bonus).toBeLessThan(15)
    }
    // The whole budget is more than the simulated lap and not absurdly more.
    const total = plan.start + plan.bonus.reduce((sum, bonus) => sum + bonus, 0) - plan.bonus[0] / 2
    expect(total).toBeGreaterThan(estimate.lapTime)
    expect(total).toBeLessThan(estimate.lapTime * 2.5)
  })

  it('can be won by a driver who keeps up the pace, and lost by one who does not', () => {
    const good = newCheckpointRun(plan)
    drive(0.9, (car, u) => {
      updateCheckpoints(good, DT, u, car.place.d, true, () => undefined)
      return good.finished
    })
    expect(good.won).toBe(true)
    expect(good.passed).toBe(CHECKPOINT_COUNT)
    expect(checkpointScore(good)).toBeGreaterThanOrEqual(1000)

    const slow = newCheckpointRun(plan)
    drive(0.4, (car, u) => {
      updateCheckpoints(slow, DT, u, car.place.d, true, () => undefined)
      return slow.finished
    })
    expect(slow.won).toBe(false)
    expect(slow.passed).toBeLessThan(CHECKPOINT_COUNT)
    expect(slow.remaining).toBe(0)
  })

  it('counts a gate driven past outside the road as missed, and gives no time for it', () => {
    const run = newCheckpointRun(plan)
    const events: Array<[number, boolean, number]> = []
    updateCheckpoints(run, DT, plan.gates[0].u - 1, 0, true, () => undefined)
    updateCheckpoints(run, DT, plan.gates[0].u + 1, plan.gates[0].half + 4, true, (i, passed, bonus) =>
      events.push([i, passed, bonus]),
    )
    expect(events).toEqual([[0, false, 0]])
    expect(run.missed).toBe(1)
    expect(run.next).toBe(1)
  })

  it('does not take a jump back for a crossing, and does not run while waiting for the lights', () => {
    const run = newCheckpointRun(plan)
    updateCheckpoints(run, DT, plan.gates[0].u + 200, 0, true, () => undefined)
    expect(run.passed).toBe(0)
    const waiting = newCheckpointRun(plan)
    updateCheckpoints(waiting, 5, 0, 0, false, () => undefined)
    expect(waiting.remaining).toBe(plan.start)
  })
})

describe('Precision Driving', () => {
  const gates = () => planSlalom(track, startS)

  it('lays a slalom of cones that alternate sides and leave a gap to drive through', () => {
    const slalom = gates()
    expect(slalom).toHaveLength(PRECISION_GATES)
    expect(slalomFits(track, startS)).toBe(true)
    slalom.forEach((gate, i) => {
      expect(Math.sign(gate.centre)).toBe(i % 2 === 0 ? 1 : -1)
      expect(Math.hypot(gate.cones[0].x - gate.cones[1].x, gate.cones[0].z - gate.cones[1].z)).toBeCloseTo(
        GAP_HALF * 2,
        1,
      )
    })
  })

  /** A car that moves along the lap at a steady 30 m/s, a given distance from the centre line (as a function of how far it has gone). */
  function run(side: (u: number, gateCentres: number[]) => number) {
    const slalom = gates()
    const state = newPrecisionRun(slalom)
    const centres = slalom.map((gate) => gate.centre)
    for (let u = 0; u < 400 && !state.finished; u += 30 * DT) {
      const s = (startS + u) % track.length
      const i = Math.round(s / track.spacing) % track.count
      const j = (i + 1) % track.count
      const d = side(u, centres)
      const x = track.x[i] - track.tz[i] * d
      const z = track.z[i] + track.tx[i] * d
      const heading = Math.atan2(track.z[j] - track.z[i], track.x[j] - track.x[i])
      updatePrecision(
        state,
        DT,
        { x, z, heading, u, d },
        true,
        () => undefined,
        () => undefined,
      )
    }
    return state
  }

  it('is clean for a car that goes through the middle of every gap', () => {
    const state = run((u, centres) => {
      // Slide smoothly from gap to gap.
      const at = (u - 70) / 26
      const a = Math.max(0, Math.min(centres.length - 1, Math.floor(at)))
      const b = Math.min(centres.length - 1, a + 1)
      const f = Math.max(0, Math.min(1, at - a))
      return centres[a] + (centres[b] - centres[a]) * (f * f * (3 - 2 * f))
    })
    expect(state.finished).toBe(true)
    expect(state.hits).toBe(0)
    expect(state.missed).toBe(0)
    expect(state.clean).toBe(PRECISION_GATES)
    expect(precisionResult(state)).toBeCloseTo(state.time, 6)
  })

  it('hits cones when the car drives straight down the middle of the road, and each hit costs time', () => {
    const state = run(() => 0)
    expect(state.hits).toBeGreaterThanOrEqual(PRECISION_GATES)
    expect(precisionResult(state)).toBeCloseTo(state.time + state.hits * HIT_PENALTY + state.missed * MISS_PENALTY, 6)
    expect(state.gates.some((gate) => gate.result === 'hit')).toBe(true)
  })

  it('counts a gate that is driven round as missed', () => {
    const state = run(() => 9)
    expect(state.missed).toBe(PRECISION_GATES)
    expect(state.hits).toBe(0)
    expect(precisionResult(state)).toBeGreaterThan(PRECISION_GATES * MISS_PENALTY)
  })

  it('ends when the time is out, even with gates left', () => {
    const state = newPrecisionRun(gates())
    for (let t = 0; t < PRECISION_LIMIT + 1; t += 0.5) {
      updatePrecision(
        state,
        0.5,
        { x: 0, z: 0, heading: 0, u: 5, d: 0 },
        true,
        () => undefined,
        () => undefined,
      )
    }
    expect(state.finished).toBe(true)
    expect(state.timedOut).toBe(true)
  })
})
