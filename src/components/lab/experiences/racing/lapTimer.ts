/**
 * Lap timing for the Racing Experience: the start/finish line, two sector gates, a clean-lap check
 * and the two modes. In Practice the clock starts the first time the car crosses the line and runs
 * lap after lap; in Time Trial a countdown ends in a standing start and a fixed number of laps. A lap
 * counts only if the car passed both gates in order (so driving backwards over the line, or
 * cutting the course, earns nothing) and a lap that left the track is kept but not counted as best.
 */
export type RaceMode = 'practice' | 'trial' | 'drift' | 'checkpoint' | 'precision'

export const TRIAL_LAPS = 3
export const COUNTDOWN = 3.2

export type RacePhase = 'countdown' | 'running' | 'finished'

export interface LapTimer {
  mode: RaceMode
  phase: RacePhase
  /** Seconds left of the countdown. */
  countdown: number
  /** The clock is running (in Practice, from the first crossing of the line). */
  timing: boolean
  /** Time on the current lap, s. */
  time: number
  /** 1-based number of the lap being driven. */
  lap: number
  /** Gates passed on this lap, 0 to 2. */
  gates: number
  /** Current lap is still clean. */
  clean: boolean
  last: number | null
  best: number | null
  /** Every completed lap, with whether it was clean. */
  laps: Array<{ time: number; clean: boolean }>
  /** Time of the whole trial, s. */
  total: number
  /** Seconds since the car last crossed the line, or -1 before the first crossing: the clock of a ghost. */
  sinceLine: number
  /** Distance along the track at the previous update. */
  previous: number
  /** Gate times of the current lap, s. */
  splits: number[]
}

export type LapEvent =
  | { type: 'go' }
  | { type: 'start' }
  | { type: 'gate'; gate: number; time: number }
  | { type: 'lap'; time: number; clean: boolean; best: boolean; lap: number }
  | { type: 'invalid' }
  | { type: 'finish'; total: number }

export function createLapTimer(mode: RaceMode, startS: number, best: number | null = null): LapTimer {
  return {
    mode,
    // Practice starts at once; the timed modes start from the lights.
    phase: mode === 'practice' ? 'running' : 'countdown',
    countdown: mode === 'practice' ? 0 : COUNTDOWN,
    timing: false,
    time: 0,
    lap: 1,
    gates: 0,
    clean: true,
    last: null,
    best,
    laps: [],
    total: 0,
    sinceLine: -1,
    previous: startS,
    splits: [],
  }
}

/** Whether the car may drive: the lights are out. */
export const canDrive = (timer: LapTimer): boolean => timer.phase !== 'countdown'

/**
 * Advances the timer. `s` is how far the car is along the track, `length` the track's length,
 * `speed` its speed (used to place the moment of crossing between two frames) and `outside`
 * whether the car is off the track. Events are handed to `emit` as they happen.
 */
export function updateLapTimer(
  timer: LapTimer,
  dt: number,
  s: number,
  length: number,
  speed: number,
  outside: boolean,
  emit: (event: LapEvent) => void,
): void {
  if (timer.phase === 'countdown') {
    timer.countdown -= dt
    if (timer.countdown <= 0) {
      timer.phase = 'running'
      timer.timing = true
      timer.time = -timer.countdown
      timer.countdown = 0
      emit({ type: 'go' })
    }
    timer.previous = s
    return
  }
  if (timer.phase === 'finished') {
    timer.previous = s
    return
  }

  if (timer.timing) {
    timer.time += dt
    timer.total += dt
  }
  if (timer.sinceLine >= 0) timer.sinceLine += dt

  // Moved forward over the line (the distance wraps from near the end to near the start).
  const crossed = timer.previous > length * 0.7 && s < length * 0.3
  const wentBack = timer.previous < length * 0.3 && s > length * 0.7

  if (timer.timing && !crossed && !wentBack) {
    const gate = timer.gates + 1
    const at = (gate * length) / 3
    if (gate <= 2 && s >= at && s < at + length * 0.2 && timer.previous < at + length * 0.2) {
      timer.gates = gate
      timer.splits.push(timer.time)
      emit({ type: 'gate', gate, time: timer.time })
    }
  }
  if (wentBack) timer.gates = 0

  if (timer.timing && outside && timer.clean) {
    timer.clean = false
    emit({ type: 'invalid' })
  }

  if (crossed) {
    // Where between the two frames the car crossed: the metres it was past the line over its speed.
    const overshoot = Math.min(dt, s / Math.max(speed, 1))
    if (timer.timing || timer.phase === 'running') timer.sinceLine = overshoot
    if (!timer.timing) {
      timer.timing = true
      timer.time = overshoot
      timer.total = overshoot
      timer.gates = 0
      timer.clean = true
      timer.splits.length = 0
      emit({ type: 'start' })
    } else if (timer.gates >= 2) {
      const time = timer.time - overshoot
      const clean = timer.clean
      const best = clean && (timer.best === null || time < timer.best)
      if (best) timer.best = time
      timer.last = time
      timer.laps.push({ time, clean })
      emit({ type: 'lap', time, clean, best, lap: timer.lap })
      if (timer.mode === 'trial' && timer.laps.length >= TRIAL_LAPS) {
        timer.phase = 'finished'
        timer.timing = false
        timer.total -= overshoot
        emit({ type: 'finish', total: timer.total })
      } else {
        timer.lap++
        timer.time = overshoot
        timer.gates = 0
        timer.clean = true
        timer.splits.length = 0
      }
    }
  }
  timer.previous = s
}
