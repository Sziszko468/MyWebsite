/**
 * Drift Challenge scoring. A drift is the car travelling at a clear angle to the way it points, fast
 * enough for it to mean something and still under control: points build up for as long as it lasts,
 * faster and sideways-er pays more, and holding it multiplies what the chain is worth. The chain
 * is banked when the car straightens out for a moment; a wall, leaving the track or a spin loses it.
 * Everything is computed from the car's real speed and sideslip, nothing is awarded for time spent.
 */
export const DRIFT_TIME = 60
/** The least speed, m/s, at which a slide counts. */
export const DRIFT_SPEED = 12
/** The angle, radians, between the way the car points and the way it moves, from which it counts and above which it is a spin. */
export const DRIFT_MIN_ANGLE = 0.17
export const DRIFT_MAX_ANGLE = 1.05
/** How long, s, the car must be out of the drift for the chain to be banked. */
const BANK_AFTER = 0.7
export const MAX_COMBO = 5

export interface DriftState {
  /** Points banked. */
  score: number
  /** Points in the chain being driven, not yet banked. */
  chain: number
  combo: number
  /** How long the chain has lasted, s. */
  slideTime: number
  calm: number
  drifting: boolean
  best: number
  remaining: number
  finished: boolean
}

export function newDrift(best = 0): DriftState {
  return {
    score: 0,
    chain: 0,
    combo: 1,
    slideTime: 0,
    calm: 0,
    drifting: false,
    best,
    remaining: DRIFT_TIME,
    finished: false,
  }
}

/** The angle between the way the car points and the way it moves. */
export function sideslip(forward: number, sideways: number): number {
  return Math.abs(Math.atan2(sideways, Math.max(forward, 0.1)))
}

/**
 * Advances the score by `dt` seconds. `angle` is the sideslip, `lost` is a wall hit or leaving the
 * track this step, `running` is whether the clock is going. `onBank` is told each chain that is banked.
 */
export function updateDrift(
  state: DriftState,
  dt: number,
  speed: number,
  angle: number,
  lost: boolean,
  running: boolean,
  onBank: (points: number) => void,
): void {
  if (state.finished || !running) return
  const sliding = speed > DRIFT_SPEED && angle > DRIFT_MIN_ANGLE && angle < DRIFT_MAX_ANGLE
  const bank = () => {
    if (state.chain > 0) {
      const points = Math.round(state.chain)
      state.score += points
      state.best = Math.max(state.best, state.score)
      onBank(points)
    }
    state.chain = 0
    state.slideTime = 0
    state.combo = 1
  }

  if (lost || (speed > DRIFT_SPEED && angle >= DRIFT_MAX_ANGLE)) {
    // A wall, the grass or a spin: what was being built is lost.
    state.chain = 0
    state.slideTime = 0
    state.combo = 1
    state.drifting = false
    state.calm = 0
  } else if (sliding) {
    state.drifting = true
    state.calm = 0
    state.slideTime += dt
    state.combo = Math.min(MAX_COMBO, 1 + Math.floor(state.slideTime / 1.5))
    state.chain += dt * speed * angle * 6 * state.combo
  } else {
    state.drifting = false
    state.calm += dt
    if (state.calm > BANK_AFTER) bank()
  }

  state.remaining = Math.max(0, state.remaining - dt)
  if (state.remaining === 0) {
    bank()
    state.finished = true
    state.drifting = false
  }
}
