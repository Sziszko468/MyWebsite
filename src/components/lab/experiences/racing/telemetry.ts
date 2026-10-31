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
    ready: false,
  }
}

export type RaceEvent =
  LapEvent | { type: 'collision'; speed: number } | { type: 'offtrack' } | { type: 'reset' } | { type: 'restart' }

/** What the player holds, from the keyboard (by key code) and from the on-screen buttons. */
export interface Controls {
  keys: Set<string>
  touch: { left: boolean; right: boolean; gas: boolean; brake: boolean; hand: boolean }
}

export function createControls(): Controls {
  return { keys: new Set(), touch: { left: false, right: false, gas: false, brake: false, hand: false } }
}
