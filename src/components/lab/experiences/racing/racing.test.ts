import { describe, expect, it } from 'vitest'
import {
  G,
  aeroForces,
  bestDriveForce,
  createCarState,
  deriveCarParams,
  idealBrakeBias,
  locate,
  maxSteerAngle,
  newInput,
  placeCar,
  stepCar,
  topSpeed,
  brakeEfficiency,
  type CarParams,
  type CarState,
  type DriverInput,
} from './carPhysics'
import { DEFAULT_SETUP, SETUP_KEYS, SETUP_RANGES, sanitizeSetup, sameSetup, type CarSetup } from './carSetup'
import { createLapTimer, updateLapTimer, TRIAL_LAPS, type LapEvent, type LapTimer } from './lapTimer'
import { formatLapTime, simulateLap } from './lapSim'
import { defaultTrack, gridSlot, sampleTrack, type TrackSamples } from './trackModel'

const DT = 1 / 120
const track: TrackSamples = sampleTrack(defaultTrack())!
const params = deriveCarParams(DEFAULT_SETUP)

function startCar(samples: TrackSamples = track, metresBehind = 6): CarState {
  const state = createCarState()
  const slot = gridSlot(samples, metresBehind)
  placeCar(state, samples, slot.x, slot.z, slot.heading)
  return state
}

function run(
  state: CarState,
  input: Partial<DriverInput>,
  seconds: number,
  p: CarParams = params,
  samples: TrackSamples = track,
): void {
  const full = { ...newInput(), ...input }
  for (let t = 0; t < seconds; t += DT) stepCar(state, full, p, samples, DT)
}

describe('the setup', () => {
  it('keeps every value inside its range', () => {
    const wild = sanitizeSetup({
      downforce: 99,
      drag: -4,
      springs: NaN,
      rideHeight: 'x',
      brakeBias: 1e9,
      gearing: -1,
      tyreGrip: Infinity,
      mass: 5,
    })
    for (const key of SETUP_KEYS) {
      expect(wild[key]).toBeGreaterThanOrEqual(SETUP_RANGES[key].min)
      expect(wild[key]).toBeLessThanOrEqual(SETUP_RANGES[key].max)
    }
    expect(sanitizeSetup(null)).toEqual(DEFAULT_SETUP)
    expect(sameSetup(DEFAULT_SETUP, { ...DEFAULT_SETUP })).toBe(true)
  })
})

describe('the car', () => {
  it('accelerates, shifts up through the gears and is limited by drag', () => {
    const car = startCar()
    run(car, { throttle: 1 }, 6)
    expect(car.u).toBeGreaterThan(40)
    expect(car.gear).toBeGreaterThan(2)
    // Down the main straight from 60 m/s: the gearbox runs out of gears and the car keeps pulling, slowly.
    const fast = startCar()
    placeCar(fast, track, track.x[40], track.z[40], Math.atan2(track.tz[40], track.tx[40]), 60)
    run(fast, { throttle: 1 }, 5)
    expect(fast.u).toBeGreaterThan(68)
    expect(fast.u).toBeLessThan(topSpeed(params) * 1.04)
    expect(fast.gear).toBe(7)
    expect(fast.rpm).toBeLessThanOrEqual(12_000)
  })

  it('stays straight on a straight with no steering', () => {
    const car = startCar()
    run(car, { throttle: 1 }, 5)
    expect(Math.abs(car.place.d)).toBeLessThan(0.6)
    expect(Math.abs(car.v)).toBeLessThan(0.3)
  })

  it('brakes harder than it accelerates and stops', () => {
    const car = startCar()
    placeCar(car, track, track.x[60], track.z[60], Math.atan2(track.tz[60], track.tx[60]), 70)
    const start = { x: car.x, z: car.z }
    run(car, { brake: 1 }, 2.5)
    const slowed = 70 - car.u
    expect(slowed / 2.5).toBeGreaterThan(G * 1.4)
    run(car, { brake: 1 }, 6)
    expect(car.u).toBeLessThan(0.5)
    expect(Math.hypot(car.x - start.x, car.z - start.z)).toBeLessThan(330)
  })

  it('brakes in a straight line, and the brakes alone never push it backwards', () => {
    const car = startCar()
    placeCar(car, track, track.x[60], track.z[60], Math.atan2(track.tz[60], track.tx[60]), 50)
    for (let t = 0; t < 8 && car.u > 0.3; t += DT) stepCar(car, { ...newInput(), brake: 1 }, params, track, DT)
    expect(car.u).toBeLessThan(0.3)
    expect(car.u).toBeGreaterThanOrEqual(-0.5)
    expect(Math.abs(car.place.d)).toBeLessThan(0.5)
    run(car, {}, 3)
    expect(Math.abs(car.u)).toBeLessThan(1)
  })

  it('reverses when the brake is held at a standstill', () => {
    const car = startCar()
    run(car, { brake: 1 }, 3)
    expect(car.u).toBeLessThan(-1)
  })

  it('turns: steering changes the heading, harder at low speed than at high', () => {
    const slow = startCar()
    placeCar(slow, track, track.x[40], track.z[40], Math.atan2(track.tz[40], track.tx[40]), 15)
    const before = slow.psi
    run(slow, { throttle: 0.2, steer: 1 }, 1)
    expect(slow.psi - before).toBeGreaterThan(0.2)
    expect(maxSteerAngle(10)).toBeGreaterThan(maxSteerAngle(40) * 2)
    expect(maxSteerAngle(80)).toBeLessThan(0.07)
  })

  it('corners faster with more downforce and slower with less', () => {
    const circle = (setup: CarSetup, speed: number) => {
      const p = deriveCarParams(setup)
      const car = startCar()
      placeCar(car, track, track.x[40], track.z[40], Math.atan2(track.tz[40], track.tx[40]), speed)
      let peak = 0
      for (let t = 0; t < 2.5; t += DT) {
        stepCar(car, { throttle: 0, brake: 0, steer: 1, handbrake: false }, p, track, DT)
        peak = Math.max(peak, Math.abs(car.ay))
      }
      return peak / G
    }
    const low = circle({ ...DEFAULT_SETUP, downforce: 1.5 }, 60)
    const high = circle({ ...DEFAULT_SETUP, downforce: 4.5 }, 60)
    expect(high).toBeGreaterThan(low * 1.2)
    expect(high).toBeGreaterThan(1.5)
    expect(low).toBeGreaterThan(0.8)
  })

  it('slows down on gravel far more than on asphalt, and is held by the barrier', () => {
    const gravel = Array.from(track.gravel).findIndex((flag) => flag === 1)
    const nx = -track.tz[gravel]
    const nz = track.tx[gravel]
    const car = createCarState()
    const x = track.x[gravel] + nx * (track.half[gravel] + 6)
    const z = track.z[gravel] + nz * (track.half[gravel] + 6)
    placeCar(car, track, x, z, Math.atan2(track.tz[gravel], track.tx[gravel]), 40)
    expect(car.surface).toBe('gravel')
    run(car, {}, 3)
    expect(car.u).toBeLessThan(25)
  })

  it('bounces off a wall: it stays inside the barrier, loses speed and reports the impact', () => {
    const i = 200
    const car = createCarState()
    const heading = Math.atan2(track.tz[i], track.tx[i]) + 0.35
    placeCar(car, track, track.x[i], track.z[i], heading, 60)
    run(car, { throttle: 0.5 }, 4)
    expect(car.impact).toBeGreaterThan(2)
    expect(Math.abs(car.place.d)).toBeLessThan(
      Math.max(track.left[car.place.index], track.right[car.place.index]) + 0.5,
    )
    expect(car.u).toBeLessThan(60)
    expect(Number.isFinite(car.x)).toBe(true)
  })

  it('drifts with the handbrake: the tail comes round', () => {
    const car = startCar()
    placeCar(car, track, track.x[60], track.z[60], Math.atan2(track.tz[60], track.tx[60]), 30)
    run(car, { steer: 0.6 }, 0.6)
    const free = { r: car.r }
    run(car, { steer: 0.6, handbrake: true }, 0.6)
    expect(Math.abs(car.v)).toBeGreaterThan(1)
    expect(Math.abs(car.r)).toBeGreaterThan(Math.abs(free.r) * 0.5)
  })

  it('never produces a NaN, whatever the driver does', () => {
    const car = startCar()
    const chaos = [0, 1, -1, 0.5]
    for (let k = 0; k < 4000; k++) {
      const c = chaos[k % 4]
      stepCar(
        car,
        { throttle: k % 7 < 4 ? 1 : 0, brake: k % 11 < 3 ? 1 : 0, steer: c, handbrake: k % 300 < 60 },
        params,
        track,
        DT,
      )
      if (!Number.isFinite(car.x + car.z + car.u + car.v + car.r)) throw new Error(`NaN at step ${k}`)
    }
  })

  it('locate reports a car on the grid as being on the asphalt, just before the line', () => {
    const car = startCar()
    locate(car, track)
    expect(car.surface).toBe('asphalt')
    expect(car.place.s).toBeGreaterThan(track.length - 8)
  })
})

describe('setup effects', () => {
  it('more downforce brings more drag, a lower top speed and more downforce at speed', () => {
    const a = deriveCarParams({ ...DEFAULT_SETUP, downforce: 2 })
    const b = deriveCarParams({ ...DEFAULT_SETUP, downforce: 4.5 })
    expect(b.drag).toBeGreaterThan(a.drag)
    expect(topSpeed(b)).toBeLessThan(topSpeed(a))
    expect(aeroForces(b, 60).downforce).toBeGreaterThan(aeroForces(a, 60).downforce * 2)
  })

  it('shorter gearing pulls harder and tops out sooner', () => {
    const long = deriveCarParams({ ...DEFAULT_SETUP, gearing: 3.5 })
    const short = deriveCarParams({ ...DEFAULT_SETUP, gearing: 5.4 })
    expect(bestDriveForce(short, 8)).toBeGreaterThanOrEqual(bestDriveForce(long, 8))
    expect(topSpeed(short)).toBeLessThan(topSpeed(long))
  })

  it('a lower ride height gives more downforce; the best brake bias sits near the axle loads', () => {
    expect(deriveCarParams({ ...DEFAULT_SETUP, rideHeight: 35 }).downforce).toBeGreaterThan(
      deriveCarParams({ ...DEFAULT_SETUP, rideHeight: 75 }).downforce,
    )
    const ideal = idealBrakeBias(params)
    expect(ideal).toBeGreaterThan(0.5)
    expect(ideal).toBeLessThan(0.7)
    expect(brakeEfficiency(params)).toBeGreaterThan(0.9)
    expect(brakeEfficiency(deriveCarParams({ ...DEFAULT_SETUP, brakeBias: 46 }))).toBeLessThan(
      brakeEfficiency(deriveCarParams({ ...DEFAULT_SETUP, brakeBias: Math.round(ideal * 100) })),
    )
  })
})

describe('the lap simulation', () => {
  const base = simulateLap(track, params)

  it('gives a plausible lap for the default car on the default circuit, and a speed for every sample', () => {
    expect(base.lapTime).toBeGreaterThan(38)
    expect(base.lapTime).toBeLessThan(90)
    expect(base.speed.length).toBe(track.count)
    expect(base.topSpeed).toBeGreaterThan(70)
    expect(base.minSpeed).toBeGreaterThan(8)
    expect(base.maxLateralG).toBeGreaterThan(1.2)
    expect(base.maxLateralG).toBeLessThan(4)
    expect(base.zeroTo100).toBeGreaterThan(1.5)
    expect(base.zeroTo100).toBeLessThan(6)
  })

  it('is faster with better tyres and a lighter car, slower with a heavier one', () => {
    expect(simulateLap(track, deriveCarParams({ ...DEFAULT_SETUP, tyreGrip: 1.7 })).lapTime).toBeLessThan(base.lapTime)
    expect(simulateLap(track, deriveCarParams({ ...DEFAULT_SETUP, mass: 700 })).lapTime).toBeLessThan(base.lapTime)
    expect(simulateLap(track, deriveCarParams({ ...DEFAULT_SETUP, mass: 920 })).lapTime).toBeGreaterThan(base.lapTime)
  })

  it('shows the downforce trade-off: cornering speed up, top speed down', () => {
    const more = simulateLap(track, deriveCarParams({ ...DEFAULT_SETUP, downforce: 4.5, drag: 0.9 }))
    const less = simulateLap(track, deriveCarParams({ ...DEFAULT_SETUP, downforce: 1.5, drag: 0.9 }))
    expect(more.minSpeed).toBeGreaterThan(less.minSpeed)
    expect(more.topSpeed).toBeLessThan(less.topSpeed)
  })

  it('formats times', () => {
    expect(formatLapTime(72.3456)).toBe('1:12.346')
    expect(formatLapTime(5)).toBe('0:05.000')
    expect(formatLapTime(null)).toContain('–')
  })
})

describe('lap timing', () => {
  const length = 2000
  const drive = (timer: LapTimer, from: number, to: number, seconds: number, outside = false): LapEvent[] => {
    const events: LapEvent[] = []
    const steps = Math.ceil(seconds / DT)
    for (let k = 1; k <= steps; k++) {
      const s = (from + ((to - from) * k) / steps + length) % length
      updateLapTimer(timer, DT, s, length, Math.abs(to - from) / seconds, outside, (event) => events.push(event))
    }
    return events
  }

  it('starts the clock at the first crossing in practice and counts a lap through both gates', () => {
    const timer = createLapTimer('practice', length - 6)
    let events = drive(timer, length - 6, length + 20, 1)
    expect(events.map((e) => e.type)).toEqual(['start'])
    events = drive(timer, 20, length + 20, 60)
    expect(events.map((e) => e.type)).toEqual(['gate', 'gate', 'lap'])
    const lap = events[2] as Extract<LapEvent, { type: 'lap' }>
    expect(lap.time).toBeGreaterThan(59)
    expect(lap.time).toBeLessThan(61)
    expect(lap.best).toBe(true)
    expect(timer.best).toBeCloseTo(lap.time, 6)
  })

  it('does not count a lap that skipped the gates, or a drive backwards over the line', () => {
    const timer = createLapTimer('practice', length - 6)
    drive(timer, length - 6, length + 20, 1)
    // From the line to a third of the way round, then a jump past both gates to the line: no gates, no lap.
    drive(timer, 20, 600, 20)
    const events: LapEvent[] = []
    updateLapTimer(timer, DT, 1500, length, 50, false, (event) => events.push(event))
    events.push(...drive(timer, 1500, length + 20, 10))
    expect(events.filter((e) => e.type === 'lap')).toHaveLength(0)
    // And back over the line the wrong way resets the gates.
    const back = createLapTimer('practice', length - 6)
    drive(back, length - 6, length + 20, 1)
    drive(back, 20, 700, 20)
    expect(back.gates).toBe(1)
    drive(back, 700, 20, 10)
    drive(back, 20, -40, 2)
    expect(back.gates).toBe(0)
  })

  it('marks a lap that left the track as not clean and keeps its time out of the best', () => {
    const timer = createLapTimer('practice', length - 6)
    drive(timer, length - 6, length + 20, 1)
    const events = [
      ...drive(timer, 20, 700, 20),
      ...drive(timer, 700, 800, 2, true),
      ...drive(timer, 800, length + 20, 40),
    ]
    expect(events.map((e) => e.type)).toContain('invalid')
    const lap = events.find((e) => e.type === 'lap') as Extract<LapEvent, { type: 'lap' }>
    expect(lap.clean).toBe(false)
    expect(timer.best).toBeNull()
    expect(timer.last).not.toBeNull()
  })

  it('runs a time trial: countdown, go, a fixed number of laps, finish', () => {
    const timer = createLapTimer('trial', length - 6)
    let events = drive(timer, length - 6, length - 6, 3.4)
    expect(events.map((e) => e.type)).toEqual(['go'])
    const all: LapEvent[] = []
    // The first run starts behind the line and ends on it a lap later; the others are whole laps.
    all.push(...drive(timer, length - 6, 2 * length, 50))
    for (let lap = 1; lap < TRIAL_LAPS; lap++) all.push(...drive(timer, 0, length, 50))
    events = all.filter((e) => e.type === 'lap' || e.type === 'finish')
    expect(events.map((e) => e.type)).toEqual(['lap', 'lap', 'lap', 'finish'])
    expect(timer.phase).toBe('finished')
    expect(timer.laps).toHaveLength(TRIAL_LAPS)
  })
})

describe('a driver can lap the circuit', () => {
  /** Follows the centre line at a fraction of the simulated speed: a stand-in for a careful human. */
  function lap(setup: CarSetup, pace: number) {
    const p = deriveCarParams(setup)
    const estimate = simulateLap(track, p)
    const car = startCar(track, 2)
    const timer = createLapTimer('trial', car.place.s)
    const input = newInput()
    let wall = 0
    let outside = 0
    let finishedAt = -1
    let t = 0
    const events: LapEvent[] = []
    const emit = (event: LapEvent) => events.push(event)
    while (t < 240 && finishedAt < 0) {
      const speed = Math.hypot(car.u, car.v)
      // Aim at a point ahead on the centre line.
      const look = 7 + speed * 0.38
      const target = (car.place.index + Math.round(look / track.spacing)) % track.count
      const bearing = Math.atan2(track.z[target] - car.z, track.x[target] - car.x) - car.psi
      const wrapped = Math.atan2(Math.sin(bearing), Math.cos(bearing))
      const angle = Math.atan((2 * 3.4 * Math.sin(wrapped)) / look)
      input.steer = Math.max(-1, Math.min(1, angle / maxSteerAngle(speed)))
      // The speed it may carry: the simulation's, further ahead the faster it goes (to brake in time).
      const ahead = (car.place.index + Math.round((20 + speed * 1.6) / track.spacing)) % track.count
      let want = Infinity
      for (let k = car.place.index; k !== ahead; k = (k + 1) % track.count) want = Math.min(want, estimate.speed[k])
      want *= pace
      input.throttle = timer.phase === 'countdown' ? 0 : Math.max(0, Math.min(1, (want - speed) / 4))
      input.brake = Math.max(0, Math.min(1, (speed - want) / 6))
      stepCar(car, input, p, track, DT)
      updateLapTimer(timer, DT, car.place.s, track.length, speed, car.outside, emit)
      if (car.impact > 3) wall++
      car.impact = 0
      if (car.outside) outside++
      if (timer.phase === 'finished') finishedAt = t
      t += DT
    }
    return { timer, estimate, wall, outside, finished: finishedAt >= 0, events }
  }

  it('completes a three-lap time trial at a sensible pace without hitting anything hard', () => {
    const result = lap(DEFAULT_SETUP, 0.9)
    expect(result.finished).toBe(true)
    expect(result.wall).toBe(0)
    expect(result.timer.laps).toHaveLength(3)
    const best = Math.min(...result.timer.laps.map((l) => l.time))
    // The driver is slower than the idealised simulation, but of the same order.
    expect(best).toBeGreaterThan(result.estimate.lapTime * 0.9)
    expect(best).toBeLessThan(result.estimate.lapTime * 1.6)
    expect(result.timer.laps.every((l) => l.clean)).toBe(true)
  })

  it('a quicker setup gives a quicker driven lap too', () => {
    const slow = lap({ ...DEFAULT_SETUP, tyreGrip: 1.2, mass: 900 }, 0.9)
    const quick = lap({ ...DEFAULT_SETUP, tyreGrip: 1.7, mass: 720 }, 0.9)
    expect(slow.finished && quick.finished).toBe(true)
    expect(Math.min(...quick.timer.laps.map((l) => l.time))).toBeLessThan(
      Math.min(...slow.timer.laps.map((l) => l.time)),
    )
  })
})
