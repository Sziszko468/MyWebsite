import { describe, expect, it } from 'vitest'
import {
  LOOP_STEPS,
  STEPS_PER_BAR,
  TEMPO,
  clampTempo,
  dueSteps,
  midiToHz,
  patternAt,
  previewRaw,
  stepSeconds,
} from './rhythm'
import {
  FrameShaper,
  MIN_BEAT_GAP,
  SPECTRUM_BINS,
  WAVE_POINTS,
  binFrequency,
  createFrame,
  createRaw,
} from './soundAnalysis'

describe('the score', () => {
  it('repeats every four bars and is the same wherever it is read from', () => {
    for (let i = 0; i < LOOP_STEPS; i++) expect(patternAt(i)).toEqual(patternAt(i + LOOP_STEPS))
    expect(patternAt(-1)).toEqual(patternAt(LOOP_STEPS - 1))
    expect(patternAt(3.7)).toEqual(patternAt(3))
  })

  it('has a kick on every beat of every bar and a clap on two and four', () => {
    for (let bar = 0; bar < 4; bar++)
      for (const beat of [0, 4, 8, 12]) expect(patternAt(bar * STEPS_PER_BAR + beat).kick).toBe(true)
    for (let bar = 0; bar < 4; bar++)
      for (const beat of [4, 12]) expect(patternAt(bar * STEPS_PER_BAR + beat).snare).toBe(true)
  })

  it('is not every voice on every step', () => {
    const steps = Array.from({ length: LOOP_STEPS }, (_, i) => patternAt(i))
    expect(steps.some((s) => !s.kick)).toBe(true)
    expect(steps.some((s) => !s.snare)).toBe(true)
    expect(steps.some((s) => s.hat === 0)).toBe(true)
    expect(steps.filter((s) => s.bass !== null).length).toBeGreaterThan(8)
    expect(steps.filter((s) => s.arp !== null).length).toBeGreaterThan(20)
    expect(steps.some((s) => s.hat === 2)).toBe(true)
  })

  it('keeps its notes in a sensible range: a bass that is low and an arpeggio that is higher', () => {
    for (let i = 0; i < LOOP_STEPS; i++) {
      const { bass, arp } = patternAt(i)
      if (bass !== null) {
        expect(midiToHz(bass)).toBeGreaterThan(30)
        expect(midiToHz(bass)).toBeLessThan(160)
      }
      if (arp !== null) {
        expect(midiToHz(arp)).toBeGreaterThan(160)
        expect(midiToHz(arp)).toBeLessThan(1500)
      }
    }
    expect(midiToHz(69)).toBeCloseTo(440, 6)
    expect(midiToHz(57)).toBeCloseTo(220, 6)
  })

  it('has a fill in the last bar only', () => {
    expect(patternAt(14).kick).toBe(false)
    expect(patternAt(3 * STEPS_PER_BAR + 14).kick).toBe(true)
  })
})

describe('tempo', () => {
  it('lasts a quarter of a beat per step', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125, 9)
    expect(stepSeconds(60)).toBeCloseTo(0.25, 9)
  })

  it('stays within what the loop is written for', () => {
    expect(clampTempo(1)).toBe(TEMPO.min)
    expect(clampTempo(9999)).toBe(TEMPO.max)
    expect(clampTempo(118.4)).toBe(118)
    expect(clampTempo(NaN)).toBe(TEMPO.default)
  })
})

describe('the scheduler', () => {
  it('hands out every step once, in order, and none twice, however the timer wakes', () => {
    const state = { nextTime: 1, step: 0 }
    const seen: Array<{ time: number; step: number }> = []
    let now = 1
    for (let tick = 0; tick < 400; tick++) {
      now += 0.025 + (tick % 5) * 0.004
      seen.push(...dueSteps(state, now, 0.12, 120))
    }
    for (let i = 0; i < seen.length; i++) expect(seen[i].step).toBe(i % LOOP_STEPS)
    for (let i = 1; i < seen.length; i++) expect(seen[i].time - seen[i - 1].time).toBeCloseTo(0.125, 9)
  })

  it('looks ahead only as far as asked', () => {
    const state = { nextTime: 0, step: 0 }
    const due = dueSteps(state, 0, 0.1, 120)
    expect(due.map((s) => s.step)).toEqual([0])
    expect(state.nextTime).toBeCloseTo(0.125)
    expect(dueSteps(state, 0, 0.1, 120)).toEqual([])
  })

  it('follows a change of tempo from the next step on', () => {
    const state = { nextTime: 0, step: 0 }
    dueSteps(state, 0, 0.3, 120)
    const before = state.nextTime
    const faster = dueSteps(state, before, 0.4, 150)
    for (let i = 1; i < faster.length; i++) expect(faster[i].time - faster[i - 1].time).toBeCloseTo(stepSeconds(150), 9)
  })

  it('resumes from now after a long sleep instead of playing a burst of old steps', () => {
    const state = { nextTime: 1, step: 5 }
    const due = dueSteps(state, 60, 0.1, 120)
    expect(due.length).toBeLessThanOrEqual(2)
    expect(due[0].time).toBeGreaterThanOrEqual(60)
  })
})

describe('the silent preview', () => {
  const raw = createRaw()

  it('stays inside 0..1 and finite at every tempo, for a long time', () => {
    for (const bpm of [TEMPO.min, 100, TEMPO.default, 130, TEMPO.max]) {
      for (let t = 0; t < 40; t += 0.037) {
        previewRaw(t, bpm, raw)
        for (const v of [raw.level, raw.bass, raw.mid, raw.high]) {
          expect(Number.isFinite(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
        expect(raw.spectrum.length).toBe(SPECTRUM_BINS)
        expect(raw.wave.length).toBe(WAVE_POINTS)
        for (const v of raw.spectrum) expect(v >= 0 && v <= 1).toBe(true)
        for (const v of raw.wave) expect(v >= -1 && v <= 1).toBe(true)
      }
    }
  })

  it('shows the bass right after a kick and less of it just before the next', () => {
    const length = stepSeconds(TEMPO.default)
    previewRaw(length * 4 + 0.01, TEMPO.default, raw)
    const after = raw.bass
    previewRaw(length * 4 + length * 3.9, TEMPO.default, raw)
    expect(after).toBeGreaterThan(0.8)
    expect(raw.bass).toBeLessThan(after * 0.6)
  })

  it('puts the energy of a kick in the low bins and that of a hat in the high ones', () => {
    const length = stepSeconds(TEMPO.default)
    const peakOf = (t: number) => {
      previewRaw(t, TEMPO.default, raw)
      let best = 0
      for (let i = 1; i < raw.spectrum.length; i++) if (raw.spectrum[i] > raw.spectrum[best]) best = i
      return binFrequency(best)
    }
    // Step 16 is a kick and a closed hat's neighbour; the open hat sits on step 18 (s % 4 === 2).
    expect(peakOf(length * 16 + 0.005)).toBeLessThan(150)
    previewRaw(length * 18 + 0.005, TEMPO.default, raw)
    let highSum = 0
    let lowSum = 0
    for (let i = 0; i < SPECTRUM_BINS; i++)
      if (binFrequency(i) > 5000) highSum += raw.spectrum[i]
      else lowSum += raw.spectrum[i] * 0.1
    expect(highSum).toBeGreaterThan(lowSum)
  })

  it('is the same every time it is asked for the same moment', () => {
    const a = createRaw()
    const b = createRaw()
    previewRaw(7.321, 124, a)
    previewRaw(7.321, 124, b)
    expect(Array.from(a.spectrum)).toEqual(Array.from(b.spectrum))
    expect(Array.from(a.wave)).toEqual(Array.from(b.wave))
  })

  it('gives the beat detector a beat per kick, about as many as the tempo says', () => {
    for (const bpm of [90, 118, 140]) {
      const shaper = new FrameShaper()
      const out = createFrame()
      let beats = 0
      const seconds = 30
      for (let i = 0; i < seconds * 60; i++) {
        previewRaw(i / 60, bpm, raw)
        shaper.shape(raw, out, 1 / 60, 0.4)
        if (out.beatHit) beats++
      }
      const expected = (bpm / 60) * seconds
      expect(beats, `${bpm} bpm`).toBeGreaterThan(expected * 0.8)
      expect(beats, `${bpm} bpm`).toBeLessThan(expected * 1.25)
      expect(beats / seconds).toBeLessThanOrEqual(1 / MIN_BEAT_GAP + 0.01)
    }
  })
})
