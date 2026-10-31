import {
  G,
  createCarState,
  deriveCarParams,
  newInput,
  placeCar,
  stepCar,
  type CarParams,
  type DriverInput,
} from './carPhysics'
import type { CarSetup } from './carSetup'
import { Turtle, sampleTrack, type TrackSamples } from './trackModel'

/**
 * The Performance Lab's bench tests. They run the Racing Experience's own physics, step by step,
 * on a straight and on a wide circle, and report what the car did. The numbers are what this game's
 * simulation produces for the setup: they are not measurements of a real car and they are not a
 * wind tunnel. Nothing here is typed in; if a setting changes the result, it is because it changes
 * the simulation.
 */
export interface BenchResult {
  /** Seconds from a standstill to 100 and to 200 km/h, or null if it did not get there. */
  zeroTo100: number | null
  zeroTo200: number | null
  /** Speed reached after the run, km/h. */
  topSpeed: number
  /** Metres to stop from 200 km/h with full braking. */
  braking: number
  /** The most sideways acceleration reached at full steering lock, in g. */
  cornering: number
  /** Whether the car slid (the tyres past their limit) during the cornering test. */
  slid: boolean
}

const STEP = 1 / 120
let straight: TrackSamples | null = null
let circle: TrackSamples | null = null

function straightTrack(): TrackSamples {
  if (!straight) {
    const turtle = new Turtle(0, 0, 0, 0, 30).begin().straight(3600)
    straight = sampleTrack({ version: 1, name: 'bench', closed: false, start: 0, points: turtle.points })!
  }
  return straight
}

function circleTrack(): TrackSamples {
  if (!circle) {
    const turtle = new Turtle(0, 0, 0, 0, 30).begin().arc(110, 360, 'right')
    circle = sampleTrack({ version: 1, name: 'bench', closed: true, start: 0, points: turtle.points.slice(0, -1) })!
  }
  return circle
}

function accelerate(params: CarParams): Pick<BenchResult, 'zeroTo100' | 'zeroTo200' | 'topSpeed'> {
  const track = straightTrack()
  const car = createCarState()
  placeCar(car, track, track.x[2], track.z[2], 0)
  const input: DriverInput = { ...newInput(), throttle: 1 }
  let zeroTo100: number | null = null
  let zeroTo200: number | null = null
  let time = 0
  while (time < 40 && car.place.s < track.length - 80) {
    stepCar(car, input, params, track, STEP)
    time += STEP
    const kmh = car.u * 3.6
    if (zeroTo100 === null && kmh >= 100) zeroTo100 = time
    if (zeroTo200 === null && kmh >= 200) zeroTo200 = time
  }
  return { zeroTo100, zeroTo200, topSpeed: car.u * 3.6 }
}

function brake(params: CarParams): number {
  const track = straightTrack()
  const car = createCarState()
  placeCar(car, track, track.x[2], track.z[2], 0, 200 / 3.6)
  const startX = car.x
  const input: DriverInput = { ...newInput(), brake: 1 }
  for (let time = 0; time < 20 && car.u > 0.5; time += STEP) stepCar(car, input, params, track, STEP)
  return car.x - startX
}

function corner(params: CarParams): { g: number; slid: boolean } {
  const track = circleTrack()
  let peak = 0
  let slid = false
  for (const speed of [20, 30, 40, 50, 60]) {
    const car = createCarState()
    placeCar(car, track, track.x[0], track.z[0], Math.atan2(track.tz[0], track.tx[0]), speed)
    for (let time = 0; time < 2.4; time += STEP) {
      // Hold the speed, steer as far as the wheel goes.
      const hold = Math.max(0, Math.min(1, (speed - car.u) / 3 + 0.25))
      stepCar(car, { throttle: hold, brake: 0, steer: 1, handbrake: false }, params, track, STEP)
      if (car.impact > 1 || car.outside) break
      if (time > 0.8) peak = Math.max(peak, Math.abs(car.ay) / G)
      if (car.slide > 0.5) slid = true
    }
  }
  return { g: peak, slid }
}

export function runBench(setup: CarSetup): BenchResult {
  const params = deriveCarParams(setup)
  const run = accelerate(params)
  const turn = corner(params)
  return { ...run, braking: brake(params), cornering: turn.g, slid: turn.slid }
}
