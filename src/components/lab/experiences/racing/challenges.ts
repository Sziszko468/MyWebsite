import type { TrackSamples } from './trackModel'

/**
 * Two driving challenges built on the track itself.
 *
 * Checkpoint Challenge: gates stand across the road at even distances round the lap; the clock
 * starts with a little time and every gate that is driven through adds the time the lap simulation
 * says that stretch needs, plus a margin. The run ends when the time is out or the last gate is passed.
 *
 * Precision Driving: pairs of cones make gates in a slalom down the first stretch after the line.
 * Hitting a cone or missing a gate costs seconds; the result is the clock plus the penalties.
 *
 * Both only read the car's place on the track (how far, how far to the side) and its footprint, so
 * they are rules over the same physics the free drive uses.
 */

// ── Checkpoint Challenge ───────────────────────────────────────────────────────────────

export interface Gate {
  /** Distance from the start of the run, m. */
  u: number
  x: number
  y: number
  z: number
  heading: number
  half: number
}

export interface CheckpointPlan {
  gates: Gate[]
  /** Seconds the clock starts with, and what each gate adds. */
  start: number
  bonus: number[]
}

export const CHECKPOINT_COUNT = 10
/** How much slower than the simulated pace the driver may be and still keep up. */
const MARGIN = 1.6

/** Seconds the simulation needs to cover the samples between two distances along the lap. */
function stretchTime(samples: TrackSamples, speed: Float32Array, from: number, to: number): number {
  let time = 0
  const steps = Math.max(1, Math.round((to - from) / samples.spacing))
  for (let k = 0; k < steps; k++) {
    const i = Math.floor(((from + k * samples.spacing) / samples.spacing) % samples.count)
    time += samples.spacing / Math.max(speed[i], 3)
  }
  return time
}

/** Where the gates stand and how much time each is worth, for a run that begins at `startS` metres along the lap. */
export function planCheckpoints(
  samples: TrackSamples,
  speed: Float32Array,
  startS: number,
  count = CHECKPOINT_COUNT,
): CheckpointPlan {
  const length = samples.length
  const gates: Gate[] = []
  const bonus: number[] = []
  let previous = 0
  for (let n = 1; n <= count; n++) {
    // The last gate stands just short of the line the run began at, where the distance would wrap.
    const u = n === count ? length - 15 : (length * n) / count
    const s = (startS + u) % length
    const i = Math.round(s / samples.spacing) % samples.count
    gates.push({
      u,
      x: samples.x[i],
      y: samples.y[i],
      z: samples.z[i],
      heading: Math.atan2(samples.tz[i], samples.tx[i]),
      half: samples.half[i],
    })
    bonus.push(Math.round((stretchTime(samples, speed, startS + previous, startS + u) * MARGIN + 1.5) * 10) / 10)
    previous = u
  }
  return { gates, start: Math.round((bonus[0] + 3) * 10) / 10, bonus }
}

export interface CheckpointRun {
  plan: CheckpointPlan
  next: number
  passed: number
  missed: number
  remaining: number
  finished: boolean
  won: boolean
  /** How far along the run the car was at the last update. */
  previous: number
}

export function newCheckpointRun(plan: CheckpointPlan): CheckpointRun {
  return { plan, next: 0, passed: 0, missed: 0, remaining: plan.start, finished: false, won: false, previous: 0 }
}

/** Points for a finished run: each gate is worth a hundred, and what is left of the clock a little. */
export function checkpointScore(run: CheckpointRun): number {
  return run.passed * 100 + (run.won ? Math.round(run.remaining * 10) : 0)
}

/**
 * Advances the run. `u` is how far the car has driven since the start of the run, `d` how far it
 * is from the centre line, sideways. `onGate` hears every gate that is passed (with its bonus) or missed.
 */
export function updateCheckpoints(
  run: CheckpointRun,
  dt: number,
  u: number,
  d: number,
  running: boolean,
  onGate: (index: number, passed: boolean, bonus: number) => void,
): void {
  if (run.finished || !running) {
    run.previous = u
    return
  }
  run.remaining -= dt
  const gate = run.plan.gates[run.next]
  // A jump back (the car was put back on the track) is not a crossing.
  if (gate && run.previous < gate.u && u >= gate.u && u - run.previous < 60) {
    const through = Math.abs(d) <= gate.half + 1
    if (through) {
      run.passed++
      run.remaining += run.plan.bonus[run.next]
    } else run.missed++
    onGate(run.next, through, through ? run.plan.bonus[run.next] : 0)
    run.next++
  }
  run.previous = u
  if (run.next >= run.plan.gates.length) {
    run.finished = true
    run.won = true
  } else if (run.remaining <= 0) {
    run.remaining = 0
    run.finished = true
  }
}

// ── Precision Driving ──────────────────────────────────────────────────────────────────

export interface Cone {
  x: number
  y: number
  z: number
  knocked: boolean
  /** The way it was sent, if it was hit. */
  pushX: number
  pushZ: number
}

export interface SlalomGate {
  u: number
  /** Sideways position of the middle of the gap, m. */
  centre: number
  cones: [Cone, Cone]
  result: 'pending' | 'clean' | 'hit' | 'missed'
}

export const PRECISION_GATES = 8
/** Half the width of the gap between the two cones of a gate. */
export const GAP_HALF = 2.2
const SPACING = 26
const FIRST = 70
const CONE_RADIUS = 0.24
/** Seconds added for a cone that is hit and for a gate that is missed. */
export const HIT_PENALTY = 2
export const MISS_PENALTY = 3
/** The run is over after this long. */
export const PRECISION_LIMIT = 90

export function planSlalom(samples: TrackSamples, startS: number, count = PRECISION_GATES): SlalomGate[] {
  const gates: SlalomGate[] = []
  for (let n = 0; n < count; n++) {
    const u = FIRST + n * SPACING
    const s = (startS + u) % samples.length
    const i = Math.round(s / samples.spacing) % samples.count
    const room = Math.max(0, samples.half[i] - GAP_HALF - 0.7)
    const centre = Math.min(2.6, room) * (n % 2 === 0 ? 1 : -1)
    const cone = (side: number): Cone => {
      const d = centre + side * GAP_HALF
      return {
        x: samples.x[i] - samples.tz[i] * d,
        y: samples.y[i],
        z: samples.z[i] + samples.tx[i] * d,
        knocked: false,
        pushX: 0,
        pushZ: 0,
      }
    }
    gates.push({ u, centre, cones: [cone(-1), cone(1)], result: 'pending' })
  }
  return gates
}

export interface PrecisionRun {
  gates: SlalomGate[]
  next: number
  hits: number
  missed: number
  clean: number
  time: number
  finished: boolean
  /** The run ran out of time before the last gate. */
  timedOut: boolean
  previous: number
}

export function newPrecisionRun(gates: SlalomGate[]): PrecisionRun {
  return { gates, next: 0, hits: 0, missed: 0, clean: 0, time: 0, finished: false, timedOut: false, previous: 0 }
}

/** The clock plus the penalties: what the run is judged on, in seconds. */
export const precisionResult = (run: PrecisionRun): number =>
  run.time + run.hits * HIT_PENALTY + run.missed * MISS_PENALTY

/**
 * Advances the run. The car is the segment from its tail to its nose, `reach` metres each way along
 * its heading, and a cone is hit when it comes within the car's half width of that segment.
 */
export function updatePrecision(
  run: PrecisionRun,
  dt: number,
  car: { x: number; z: number; heading: number; u: number; d: number },
  running: boolean,
  onHit: (cone: Cone) => void,
  onGate: (index: number, result: SlalomGate['result']) => void,
): void {
  if (run.finished || !running) {
    run.previous = car.u
    return
  }
  run.time += dt
  const cos = Math.cos(car.heading)
  const sin = Math.sin(car.heading)
  const tailX = car.x - cos * 2.2
  const tailZ = car.z - sin * 2.2
  const length = 4.5
  // Only the gates near the car can be touched.
  for (let g = Math.max(0, run.next - 1); g < Math.min(run.gates.length, run.next + 2); g++) {
    for (const cone of run.gates[g].cones) {
      if (cone.knocked) continue
      const t = Math.max(0, Math.min(1, ((cone.x - tailX) * cos + (cone.z - tailZ) * sin) / length))
      const nearX = tailX + cos * length * t
      const nearZ = tailZ + sin * length * t
      if (Math.hypot(cone.x - nearX, cone.z - nearZ) < 0.95 + CONE_RADIUS) {
        cone.knocked = true
        cone.pushX = cos
        cone.pushZ = sin
        onHit(cone)
      }
    }
  }
  const gate = run.gates[run.next]
  if (gate && run.previous < gate.u && car.u >= gate.u && car.u - run.previous < 60) {
    const hit = gate.cones.some((cone) => cone.knocked)
    const through = Math.abs(car.d - gate.centre) <= GAP_HALF + 0.5
    gate.result = hit ? 'hit' : through ? 'clean' : 'missed'
    if (hit) run.hits += gate.cones.filter((cone) => cone.knocked).length
    else if (through) run.clean++
    if (!hit && !through) run.missed++
    onGate(run.next, gate.result)
    run.next++
  }
  run.previous = car.u
  if (run.next >= run.gates.length) run.finished = true
  else if (run.time >= PRECISION_LIMIT) {
    run.finished = true
    run.timedOut = true
  }
}

/** Cones need a track at least this wide to leave a gap and room beside it. */
export const SLALOM_MIN_HALF = GAP_HALF + 1.5
export const slalomFits = (samples: TrackSamples, startS: number): boolean => {
  for (let n = 0; n < PRECISION_GATES; n++) {
    const s = (startS + FIRST + n * SPACING) % samples.length
    const i = Math.round(s / samples.spacing) % samples.count
    if (samples.half[i] < SLALOM_MIN_HALF || Math.abs(samples.curv[i]) > 1 / 120) return false
  }
  return true
}
