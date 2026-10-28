import { describe, expect, it } from 'vitest'
import { FramePacer, MAX_DRAWN_HZ, MIN_SCALE, SCALE_STEP, stepScaleDown } from './framePacing'

/** Simulates a display of `hz` with `jitterMs` of timing noise and returns what the pacer drew. */
function simulate(hz: number, jitterMs = 0, seconds = 20) {
  let seed = 4242
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return (seed / 4294967296 - 0.5) * 2 * jitterMs
  }
  const pacer = new FramePacer()
  let now = 0
  let drawn = 0
  const gaps: number[] = []
  let lastDrawn = Number.NaN
  while (now < seconds * 1000) {
    now += 1000 / hz + noise()
    if (pacer.tick(now)) {
      drawn += 1
      // The first moments, before the pacer has measured the screen, draw every frame by design.
      if (!Number.isNaN(lastDrawn) && now > 1000) gaps.push(now - lastDrawn)
      lastDrawn = now
    }
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const spread = Math.max(...gaps) - Math.min(...gaps)
  return { fps: drawn / seconds, mean, spread, pacer }
}

describe('the frame pacer', () => {
  it('draws every frame on screens up to about 100 Hz, jitter included', () => {
    for (const hz of [24, 30, 50, 60, 75, 90, 100]) {
      expect(simulate(hz).fps, `${hz} Hz`).toBeGreaterThan(hz - 1)
      expect(simulate(hz, 1.5).fps, `${hz} Hz with jitter`).toBeGreaterThan(hz - 2)
    }
  })

  it('draws every second frame on 120, 144 and 165 Hz screens', () => {
    expect(simulate(120).fps).toBeCloseTo(60, 0)
    expect(simulate(144).fps).toBeCloseTo(72, 0)
    expect(simulate(165).fps).toBeCloseTo(82.5, 0)
    expect(simulate(144, 1).pacer.every()).toBe(2)
  })

  it('draws every third frame on a 240 Hz screen', () => {
    expect(simulate(240).fps).toBeCloseTo(80, 0)
    expect(simulate(240).pacer.every()).toBe(3)
  })

  it('never draws more than about 100 frames a second, on any screen', () => {
    for (const hz of [60, 90, 100, 120, 144, 165, 240, 360]) {
      expect(simulate(hz).fps, `${hz} Hz`).toBeLessThanOrEqual(MAX_DRAWN_HZ + 1)
    }
  })

  it('keeps the rhythm even: the gap between drawn frames is constant, so nothing stutters', () => {
    for (const hz of [60, 90, 120, 144, 240]) {
      const { mean, spread } = simulate(hz)
      expect(spread, `${hz} Hz`).toBeLessThan(0.5)
      expect(mean).toBeGreaterThan(0)
    }
    // With the timing noise a real screen has, the gaps stay within a frame of each other.
    for (const hz of [60, 120, 144]) {
      expect(simulate(hz, 1).spread, `${hz} Hz with jitter`).toBeLessThan(1000 / hz + 2.5)
    }
  })

  it('draws from the first frame, before it knows the screen', () => {
    const pacer = new FramePacer()
    expect(pacer.tick(0)).toBe(true)
    expect(pacer.every()).toBe(1)
  })

  it('is not fooled by a hitch or a pause', () => {
    const pacer = new FramePacer()
    let now = 0
    for (let i = 0; i < 40; i++) pacer.tick((now += 6.94)) // a 144 Hz screen
    expect(pacer.every()).toBe(2)
    pacer.tick((now += 400)) // the tab was in the background
    pacer.tick((now += 120)) // a long frame
    for (let i = 0; i < 10; i++) pacer.tick((now += 6.94))
    expect(pacer.every()).toBe(2)
  })

  it('does not slow a slow device down further', () => {
    const { fps, pacer } = simulate(30, 3)
    expect(pacer.every()).toBe(1)
    expect(fps).toBeGreaterThan(28)
  })

  it('follows a screen whose rate changes, for instance a window dragged between monitors', () => {
    const pacer = new FramePacer()
    let now = 0
    for (let i = 0; i < 60; i++) pacer.tick((now += 6.94))
    expect(pacer.every()).toBe(2)
    for (let i = 0; i < 60; i++) pacer.tick((now += 16.67))
    expect(pacer.every()).toBe(1)
  })
})

describe('adaptive resolution', () => {
  it('steps down by a fixed factor', () => {
    expect(stepScaleDown(1)).toBeCloseTo(SCALE_STEP, 9)
    expect(stepScaleDown(SCALE_STEP)).toBeCloseTo(SCALE_STEP * SCALE_STEP, 9)
  })

  it('stops at its floor and hands over to the quality tier', () => {
    let scale: number | null = 1
    const steps: number[] = []
    while (scale !== null) {
      steps.push(scale)
      scale = stepScaleDown(scale)
    }
    expect(steps.length).toBeGreaterThanOrEqual(2)
    expect(steps.length).toBeLessThanOrEqual(5)
    expect(steps.at(-1)!).toBeGreaterThanOrEqual(MIN_SCALE)
    expect(stepScaleDown(steps.at(-1)!)).toBeNull()
  })
})
