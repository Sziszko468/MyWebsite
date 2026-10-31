import type { LapEvent, RacePhase } from './lapTimer'
import type { Surface } from './trackModel'

/**
 * What the scene tells the page, many times a second. A plain object the scene writes and the HUD
 * reads on its own timer: it never goes through React state, so a fast car does not re-render a page.
 */
export interface Telemetry {
  /** km/h. */
  speed: number
  rpm: number
  gear: number
  throttle: number
  brake: number
  steer: number
  /** Time on this lap, s. */
  time: number
  lap: number
  laps: number
  last: number | null
  best: number | null
  /** Gates passed on this lap and the lap's split times so far. */
  gates: number
  splits: number[]
  clean: boolean
  timing: boolean
  phase: RacePhase
  countdown: number
  /** Seconds since the lights went out: for the "GO" message. */
  sinceGo: number
  surface: Surface
  /** g forces. */
  lateralG: number
  longG: number
  slide: number
  /** Position, for the map: metres in plan and the heading. */
  x: number
  z: number
  psi: number
  /** Distance round the lap, 0 to 1. */
  fraction: number
  /** Replay of the last lap: playing, where it is, how long it is, how fast and whether it is paused. */
  replay: boolean
  replayTime: number
  replayDuration: number
  replayRate: number
  replayPaused: boolean
  /** Checkpoint Challenge: gates passed and missed, how many there are, seconds left, metres to the next gate. */
  ckptPassed: number
  ckptMissed: number
  ckptTotal: number
  ckptRemaining: number
  ckptDistance: number
  /** Precision Driving: the gate being driven, how many there are, cones hit, gates missed and the time with its penalties. */
  precGate: number
  precTotal: number
  precHits: number
  precMissed: number
  precTime: number
  /** Drift Challenge: banked points, the chain being driven, its multiplier, seconds left and the best score. */
  driftScore: number
  driftChain: number
  driftCombo: number
  driftRemaining: number
  driftBest: number
  /** The car is drifting at this moment. */
  driftOn: boolean
  /** Seconds the player is behind (positive) or ahead of (negative) the ghost at this point of the lap, or null. */
  ghostDelta: number | null
  /** Length of the lap the ghost drives, s, or null with no ghost. */
  ghostTime: number | null
  /** The car is ready to drive (the scene has built). */
  ready: boolean
}

export function createTelemetry(): Telemetry {
  return {
    speed: 0,
    rpm: 0,
    gear: 1,
    throttle: 0,
    brake: 0,
    steer: 0,
    time: 0,
    lap: 1,
    laps: 0,
    last: null,
    best: null,
    gates: 0,
    splits: [],
    clean: true,
    timing: false,
    phase: 'running',
    countdown: 0,
    sinceGo: 99,
    surface: 'asphalt',
    lateralG: 0,
    longG: 0,
    slide: 0,
    x: 0,
    z: 0,
    psi: 0,
    fraction: 0,
    replay: false,
    replayTime: 0,
    replayDuration: 0,
    replayRate: 1,
    replayPaused: false,
    ckptPassed: 0,
    ckptMissed: 0,
    ckptTotal: 0,
    ckptRemaining: 0,
    ckptDistance: 0,
    precGate: 0,
    precTotal: 0,
    precHits: 0,
    precMissed: 0,
    precTime: 0,
    driftScore: 0,
    driftChain: 0,
    driftCombo: 1,
    driftRemaining: 60,
    driftBest: 0,
    driftOn: false,
    ghostDelta: null,
    ghostTime: null,
    ready: false,
  }
}

export type RaceEvent =
  | LapEvent
  | { type: 'collision'; speed: number }
  | { type: 'offtrack' }
  | { type: 'reset' }
  | { type: 'restart' }
  | { type: 'ghost'; time: number }
  | { type: 'drift'; points: number }
  | { type: 'checkpoint'; index: number; total: number; passed: boolean; bonus: number }
  | { type: 'cone' }
  | { type: 'slalomGate'; index: number; total: number; result: 'clean' | 'hit' | 'missed' }
  | {
      type: 'challengeEnd'
      kind: 'checkpoint' | 'precision'
      won: boolean
      /** Points for the checkpoints, seconds (with penalties) for the slalom. */
      score: number
      record: boolean
      passed: number
      total: number
      hits: number
      missed: number
    }
  | { type: 'driftEnd'; score: number; record: boolean }

/** What the player holds, from the keyboard (by key code) and from the on-screen buttons. */
export interface Controls {
  keys: Set<string>
  touch: { left: boolean; right: boolean; gas: boolean; brake: boolean; hand: boolean }
}

export function createControls(): Controls {
  return { keys: new Set(), touch: { left: false, right: false, gas: false, brake: false, hand: false } }
}
