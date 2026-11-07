import { describe, expect, it } from 'vitest'
import { MIN_SCALE, SCALE_STEP, stepScaleDown } from './framePacing'
import {
  FIRST_RESTORE_WAIT_SECONDS,
  MAX_FAILED_PROBES,
  PROBE_SECONDS,
  QualityGovernor,
  RESTORE_BACKOFF,
  stepScaleUp,
} from './qualityGovernor'

/** Feeds `seconds` of frames of `frameMs` each. Returns the second at which the governor first said "restore", or null. */
function run(governor: QualityGovernor, seconds: number, frameMs: number): number | null {
  const dt = frameMs / 1000
  let t = 0
  while (t < seconds) {
    t += dt
    if (governor.tick(dt)) return t
  }
  return null
}

describe('the quality governor', () => {
  it('asks for nothing while quality was never lowered', () => {
    const g = new QualityGovernor()
    expect(run(g, 120, 16.7)).toBeNull()
    expect(g.wantsRestore).toBe(false)
  })

  it('asks to restore one step after a steady stretch, not before', () => {
    const g = new QualityGovernor()
    g.lowered()
    const at = run(g, 60, 16.7)
    expect(at).not.toBeNull()
    expect(at!).toBeGreaterThanOrEqual(FIRST_RESTORE_WAIT_SECONDS)
    expect(at!).toBeLessThan(FIRST_RESTORE_WAIT_SECONDS + 2)
  })

  it('never asks while the frames are slow, however long it waits', () => {
    const g = new QualityGovernor()
    g.lowered()
    expect(run(g, 300, 40)).toBeNull()
  })

  it('starts counting again after one slow stretch', () => {
    const g = new QualityGovernor()
    g.lowered()
    expect(run(g, FIRST_RESTORE_WAIT_SECONDS - 3, 16.7)).toBeNull()
    expect(run(g, 3, 45)).toBeNull() // a hitch
    expect(run(g, FIRST_RESTORE_WAIT_SECONDS - 3, 16.7)).toBeNull() // the clock restarted
    expect(run(g, 6, 16.7)).not.toBeNull()
  })

  it('treats a pause (a hidden tab) as no measurement and as a restart of the wait', () => {
    const g = new QualityGovernor()
    g.lowered()
    run(g, FIRST_RESTORE_WAIT_SECONDS - 2, 16.7)
    expect(g.tick(5)).toBe(false) // five seconds in a background tab
    expect(g.secondsToNextAttempt).toBeCloseTo(FIRST_RESTORE_WAIT_SECONDS, 0)
  })

  it('waits twice as long after a step up that did not hold', () => {
    const g = new QualityGovernor()
    g.lowered()
    expect(run(g, 60, 16.7)).not.toBeNull()
    g.restored()
    run(g, 2, 16.7)
    g.lowered() // the watchdog took it back within the probe window
    expect(g.secondsToNextAttempt).toBeCloseTo(FIRST_RESTORE_WAIT_SECONDS * RESTORE_BACKOFF, 0)
    const at = run(g, 120, 16.7)
    expect(at!).toBeGreaterThanOrEqual(FIRST_RESTORE_WAIT_SECONDS * RESTORE_BACKOFF)
  })

  it('gives up for the visit after repeated failed attempts: at most a few stutters, never a loop', () => {
    const g = new QualityGovernor()
    g.lowered()
    let attempts = 0
    for (let round = 0; round < 10 && !g.gaveUp; round += 1) {
      if (run(g, 600, 16.7) === null) break
      attempts += 1
      g.restored()
      run(g, 1, 16.7)
      g.lowered()
    }
    expect(g.gaveUp).toBe(true)
    expect(attempts).toBe(MAX_FAILED_PROBES)
    expect(run(g, 3600, 16.7)).toBeNull()
  })

  it('treats a degrade long after a restore as a fresh one, not a failed attempt', () => {
    const g = new QualityGovernor()
    g.lowered()
    run(g, 60, 16.7)
    g.restored()
    run(g, PROBE_SECONDS + 5, 16.7)
    g.lowered()
    expect(g.gaveUp).toBe(false)
    expect(g.secondsToNextAttempt).toBeCloseTo(FIRST_RESTORE_WAIT_SECONDS, 0)
  })

  it('keeps asking, step by step, until everything is back, then stops', () => {
    const g = new QualityGovernor()
    g.lowered()
    let steps = 0
    for (let i = 0; i < 5; i += 1) {
      if (run(g, 120, 16.7) === null) break
      steps += 1
      if (steps < 3) g.restored()
      else g.settled()
    }
    expect(steps).toBe(3)
    expect(g.wantsRestore).toBe(false)
    expect(run(g, 120, 16.7)).toBeNull()
  })
})

describe('the resolution scale, up and down', () => {
  it('goes back up by the same step it went down, and stops at 1', () => {
    let scale = 1
    const down: number[] = []
    for (let next = stepScaleDown(scale); next !== null; next = stepScaleDown(scale)) {
      scale = next
      down.push(scale)
    }
    expect(down.length).toBeGreaterThan(0)
    expect(scale).toBeGreaterThanOrEqual(MIN_SCALE)
    const up: number[] = []
    for (let next = stepScaleUp(scale); next !== null; next = stepScaleUp(scale)) {
      scale = next
      up.push(scale)
    }
    expect(up).toHaveLength(down.length)
    expect(scale).toBe(1)
    expect(up[0]).toBeCloseTo(down[down.length - 1]! / SCALE_STEP, 5)
  })

  it('has nothing to restore at full resolution', () => {
    expect(stepScaleUp(1)).toBeNull()
  })
})
