import {
  AERO_FRONT,
  AIR,
  BRAKE_FORCE,
  FRONT_WEIGHT,
  G,
  bestDriveForce,
  brakeEfficiency,
  rollingResistance,
  topSpeed,
  type CarParams,
} from './carPhysics'
import type { TrackSamples } from './trackModel'

/**
 * A quick estimate of a lap, for comparing setups. A point mass drives the track's centre line at
 * the fastest speed the tyres, the engine and the brakes allow at each point (a "quasi-steady
 * state" lap: corners are taken at the grip limit, then the straights are filled with the best
 * acceleration and the braking zones with the best braking). It uses the same car numbers as the
 * Racing Experience, but it is a much simpler model than the one you drive: there is no driver, no
 * transient behaviour, no tyre warm-up and no racing line. It says which of two setups is faster
 * on this track; it does not predict a real lap time and it is not a measurement.
 */
export interface LapEstimate {
  /** Estimated lap time, s. */
  lapTime: number
  /** Speed at each sample, m/s. */
  speed: Float32Array
  topSpeed: number
  minSpeed: number
  /** Highest cornering acceleration the profile asks for, in g. */
  maxLateralG: number
  /** Hardest braking in the profile, in g. */
  maxBrakingG: number
  averageSpeed: number
  /** Time to reach 100 km/h from a standing start in a straight line, s. */
  zeroTo100: number
}

export function simulateLap(track: TrackSamples, params: CarParams): LapEstimate {
  const n = track.count
  const ds = track.spacing
  const m = params.mass
  const mu = params.mu
  const vTop = topSpeed(params)
  const downPerSquare = (0.5 * AIR * params.downforce) / m
  const dragPerSquare = (0.5 * AIR * params.drag) / m
  const roll = rollingResistance(params) / m
  const brakeEff = brakeEfficiency(params)
  const reach = params.cgHeight / params.wheelbase

  // Grip available sideways at a speed, m/s².
  const gripAt = (v: number) => mu * (G + downPerSquare * v * v)

  const limit = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const kappa = Math.abs(track.curv[i])
    // v² κ = μ (g + k v²)  →  v² = μ g / (κ − μ k)
    const margin = kappa - mu * downPerSquare
    limit[i] = margin > 1e-9 ? Math.min(vTop, Math.sqrt((mu * G) / margin)) : vTop
  }

  const speed = Float32Array.from(limit)
  const lateral = (v: number, i: number) => v * v * Math.abs(track.curv[i])
  const circle = (v: number, i: number) => {
    const ratio = lateral(v, i) / gripAt(v)
    return ratio >= 1 ? 0 : Math.sqrt(1 - ratio * ratio)
  }

  // What the car can add to its speed in a step, m/s² (positive accelerating, negative braking).
  const accelerate = (v: number, i: number) => {
    const rearShare = 1 - FRONT_WEIGHT
    // Traction: the rear tyres, with the weight the acceleration moves onto them.
    const tractionAcc =
      (mu * (G * rearShare + downPerSquare * v * v * (1 - AERO_FRONT))) / Math.max(0.3, 1 - mu * reach)
    const drive = bestDriveForce(params, Math.max(v, 1)) / m
    const pushed = Math.min(drive, tractionAcc) * circle(v, i)
    return pushed - dragPerSquare * v * v - roll - G * track.slope[i]
  }
  const brake = (v: number, i: number) => {
    const tyres = gripAt(v) * brakeEff * circle(v, i)
    const system = BRAKE_FORCE * G
    return Math.min(tyres, system) + dragPerSquare * v * v + roll + G * track.slope[i]
  }

  const closed = track.closed
  const laps = closed ? 2 : 1
  // Forward: no faster than the engine and tyres can reach from the point before.
  for (let step = 0; step < n * laps; step++) {
    const i = step % n
    const j = (i + 1) % n
    if (!closed && j === 0) break
    const next = Math.sqrt(Math.max(0, speed[i] * speed[i] + 2 * accelerate(speed[i], i) * ds))
    if (next < speed[j]) speed[j] = next
  }
  // Backward: no faster than the brakes can bring it down to the point ahead.
  for (let step = 0; step < n * laps; step++) {
    const j = (n - 1 - (step % n) + 1) % n
    const i = (j - 1 + n) % n
    if (!closed && j === 0) break
    const allowed = Math.sqrt(speed[j] * speed[j] + 2 * brake(speed[j], i) * ds)
    if (allowed < speed[i]) speed[i] = allowed
  }

  let time = 0
  let sum = 0
  let top = 0
  let low = Infinity
  let maxLat = 0
  let maxBrake = 0
  const steps = closed ? n : n - 1
  for (let i = 0; i < steps; i++) {
    const j = (i + 1) % n
    const average = Math.max((speed[i] + speed[j]) / 2, 0.5)
    time += ds / average
    sum += speed[i]
    top = Math.max(top, speed[i])
    low = Math.min(low, speed[i])
    maxLat = Math.max(maxLat, lateral(speed[i], i) / G)
    const decel = (speed[i] * speed[i] - speed[j] * speed[j]) / (2 * ds)
    maxBrake = Math.max(maxBrake, decel / G)
  }

  // A standing start on the flat: integrate the best acceleration to 100 km/h.
  let v = 0.5
  let zeroTo100 = 0
  const target = 100 / 3.6
  while (v < target && zeroTo100 < 30) {
    const drive = bestDriveForce(params, Math.max(v, 1)) / m
    const traction =
      (mu * (G * (1 - FRONT_WEIGHT) + downPerSquare * v * v * (1 - AERO_FRONT))) / Math.max(0.3, 1 - mu * reach)
    const a = Math.min(drive, traction) - dragPerSquare * v * v - roll
    v += Math.max(a, 0.5) * 0.01
    zeroTo100 += 0.01
  }

  return {
    lapTime: time,
    speed,
    topSpeed: top,
    minSpeed: low,
    maxLateralG: maxLat,
    maxBrakingG: maxBrake,
    averageSpeed: sum / steps,
    zeroTo100,
  }
}

/** Formats a time as m:ss.mmm. */
export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '–:––.–––'
  const whole = Math.max(0, seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole - minutes * 60
  return `${minutes}:${rest.toFixed(3).padStart(6, '0')}`
}
