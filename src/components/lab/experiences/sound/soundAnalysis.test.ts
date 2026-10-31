import { describe, expect, it } from 'vitest'
import {
  AutoGain,
  BASS_BAND,
  BeatDetector,
  BytesReader,
  FrameShaper,
  Follower,
  HIGH_BAND,
  MAX_HZ,
  MIN_BEAT_GAP,
  MIN_HZ,
  SPECTRUM_BINS,
  WAVE_POINTS,
  alignedWave,
  bandEnergy,
  binFrequency,
  createFrame,
  createRaw,
  logBins,
  peakAbs,
  rms,
} from './soundAnalysis'

const RATE = 48_000
const BINS = 1024 // an analyser with fftSize 2048

/** A byte spectrum with a peak at `hz`, as wide as `width` bytes either side. */
function tone(hz: number, height = 255, width = 1): Uint8Array {
  const bytes = new Uint8Array(BINS)
  const centre = Math.round(hz / (RATE / 2 / BINS))
  for (let k = -width; k <= width; k++) if (centre + k >= 0 && centre + k < BINS) bytes[centre + k] = height
  return bytes
}

describe('where a frequency falls', () => {
  it('puts the bins in order of pitch, between the limits', () => {
    expect(binFrequency(0)).toBeGreaterThan(MIN_HZ)
    expect(binFrequency(SPECTRUM_BINS - 1)).toBeLessThan(MAX_HZ)
    for (let i = 1; i < SPECTRUM_BINS; i++) expect(binFrequency(i)).toBeGreaterThan(binFrequency(i - 1))
    // Equal steps in pitch: a constant ratio.
    const r = binFrequency(1) / binFrequency(0)
    expect(binFrequency(30) / binFrequency(29)).toBeCloseTo(r, 6)
  })

  it('finds a bass tone in the bass band and nowhere else', () => {
    const bytes = tone(70, 255, 2)
    expect(bandEnergy(bytes, RATE, BASS_BAND[0], BASS_BAND[1])).toBeGreaterThan(0.1)
    expect(bandEnergy(bytes, RATE, 150, 2500)).toBe(0)
    expect(bandEnergy(bytes, RATE, HIGH_BAND[0], HIGH_BAND[1])).toBe(0)
  })

  it('finds a high tone in the high band', () => {
    // A hi-hat is broad: it fills a good share of the band, not a single byte.
    const bytes = tone(8000, 200, 60)
    expect(bandEnergy(bytes, RATE, HIGH_BAND[0], HIGH_BAND[1])).toBeGreaterThan(0.1)
    expect(bandEnergy(bytes, RATE, BASS_BAND[0], BASS_BAND[1])).toBe(0)
  })

  it('is zero for nothing, and never NaN for odd input', () => {
    expect(bandEnergy(new Uint8Array(0), RATE, 30, 150)).toBe(0)
    expect(bandEnergy(new Uint8Array(512), 0, 30, 150)).toBe(0)
    expect(bandEnergy(new Uint8Array(512), RATE, 30, 150)).toBe(0)
    expect(bandEnergy(new Uint8Array(512).fill(255), RATE, 1e6, 2e6)).toBeLessThanOrEqual(1)
  })

  it('draws a log spectrum whose loudest bin is the one that holds the tone', () => {
    for (const hz of [60, 440, 3000, 9000]) {
      const out = new Float32Array(SPECTRUM_BINS)
      logBins(tone(hz, 255, 1), RATE, out)
      let best = 0
      for (let i = 1; i < out.length; i++) if (out[i] > out[best]) best = i
      expect(Math.abs(Math.log2(binFrequency(best) / hz)), `${hz} Hz`).toBeLessThan(0.5)
      for (const v of out) expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  it('fills even the narrow bass bins from the neighbouring bytes', () => {
    const out = new Float32Array(SPECTRUM_BINS)
    logBins(new Uint8Array(BINS).fill(255), RATE, out)
    for (const v of out) expect(v).toBeGreaterThan(0.99)
  })
})

describe('the waveform', () => {
  const sine = (cycles: number, n = 2048, phase = 0.4) =>
    Float32Array.from({ length: n }, (_, i) => Math.sin(phase + (i / n) * Math.PI * 2 * cycles))

  it('starts a steady tone at the same phase whatever the window began with', () => {
    const a = new Float32Array(WAVE_POINTS)
    const b = new Float32Array(WAVE_POINTS)
    alignedWave(sine(40, 2048, 0.4), a)
    alignedWave(sine(40, 2048, 2.2), b)
    // Both start near a rising zero crossing, so they begin close to zero going up.
    expect(Math.abs(a[0])).toBeLessThan(0.35)
    expect(Math.abs(b[0])).toBeLessThan(0.35)
    expect(a[1] - a[0]).toBeGreaterThan(-1e-6)
    expect(b[1] - b[0]).toBeGreaterThan(-1e-6)
  })

  it('copes with silence and with too little data', () => {
    const out = new Float32Array(WAVE_POINTS).fill(7)
    alignedWave(new Float32Array(2048), out)
    expect(out.every((v) => v === 0)).toBe(true)
    alignedWave([0.5], out)
    expect(out.every((v) => v === 0)).toBe(true)
  })

  it('measures loudness and peaks', () => {
    expect(rms(sine(10))).toBeCloseTo(Math.SQRT1_2, 2)
    expect(peakAbs(sine(10))).toBeCloseTo(1, 2)
    expect(rms([])).toBe(0)
  })
})

describe('the helpers that follow a sound', () => {
  it('a follower rises faster than it falls', () => {
    const f = new Follower(0.02, 0.5)
    for (let i = 0; i < 6; i++) f.step(1, 1 / 60)
    const risen = f.value
    expect(risen).toBeGreaterThan(0.5)
    for (let i = 0; i < 6; i++) f.step(0, 1 / 60)
    expect(f.value).toBeGreaterThan(risen * 0.6)
  })

  it('auto gain lifts a quiet input towards the range and leaves silence alone', () => {
    const quiet = new AutoGain(0.1)
    let gain = 1
    for (let i = 0; i < 60; i++) gain = quiet.update(0.3, 1 / 60)
    expect(0.3 * gain).toBeGreaterThan(0.85)
    const silent = new AutoGain(0.1)
    for (let i = 0; i < 600; i++) gain = silent.update(0.001, 1 / 60)
    expect(0.001 * gain).toBeLessThan(0.02)
  })

  it('auto gain forgets a loud moment slowly', () => {
    const g = new AutoGain(0.1, 4)
    g.update(1, 0.016)
    for (let i = 0; i < 60 * 12; i++) g.update(0.2, 1 / 60)
    expect(g.peak).toBeLessThan(0.4)
  })
})

describe('finding the beat', () => {
  /** A bass line with a hit every `period` seconds, for `seconds`. */
  function run(period: number, seconds: number, fps = 60) {
    const detector = new BeatDetector()
    const beats: number[] = []
    for (let i = 0; i < seconds * fps; i++) {
      const t = i / fps
      const since = t % period
      const bass = 0.08 + 0.85 * Math.exp(-since / 0.12)
      if (detector.step(bass, 1 / fps)) beats.push(t)
    }
    return beats
  }

  it('finds the hits of a steady beat and not much else', () => {
    const beats = run(0.5, 20)
    expect(beats.length).toBeGreaterThanOrEqual(36)
    expect(beats.length).toBeLessThanOrEqual(41)
  })

  it('never reports two beats closer than the minimum gap, however fast the music', () => {
    for (const period of [0.1, 0.15, 0.25, 0.3, 0.5]) {
      const beats = run(period, 20)
      for (let i = 1; i < beats.length; i++) expect(beats[i] - beats[i - 1]).toBeGreaterThanOrEqual(MIN_BEAT_GAP - 1e-9)
      // So at most three a second: nothing flashes faster than that.
      expect(beats.length / 20).toBeLessThanOrEqual(1 / MIN_BEAT_GAP + 0.01)
    }
  })

  it('hears nothing in a steady loud drone or in silence', () => {
    const drone = new BeatDetector()
    let hits = 0
    for (let i = 0; i < 600; i++) if (drone.step(0.7, 1 / 60) && i > 60) hits++
    expect(hits).toBe(0)
    const quiet = new BeatDetector()
    for (let i = 0; i < 600; i++) expect(quiet.step(0.05, 1 / 60)).toBe(false)
  })
})

describe('the frame the scene reads', () => {
  it('stays in range and finite through a long, odd input', () => {
    const shaper = new FrameShaper()
    const reader = new BytesReader()
    const raw = createRaw()
    const out = createFrame()
    const bytes = new Uint8Array(BINS)
    const samples = new Float32Array(2048)
    for (let frame = 0; frame < 1200; frame++) {
      for (let i = 0; i < BINS; i++)
        bytes[i] = (Math.sin(i * 0.1 + frame * 0.3) * 0.5 + 0.5) * (frame % 90 < 45 ? 255 : 3)
      for (let i = 0; i < samples.length; i++)
        samples[i] = Math.sin(i * 0.05 + frame) * (frame % 120 < 60 ? 0.9 : 0.001)
      reader.read(bytes, samples, RATE, 1 / 60, raw)
      shaper.shape(raw, out, 1 / 60, (frame % 11) / 10)
      for (const v of [out.level, out.bass, out.mid, out.high, out.beat]) {
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      for (const v of out.spectrum) expect(v >= 0 && v <= 1).toBe(true)
      for (const v of out.wave) expect(v >= -1 && v <= 1).toBe(true)
    }
  })

  it('reads a bass tone as bass and a hi-hat as highs', () => {
    const reader = new BytesReader()
    const raw = createRaw()
    const samples = new Float32Array(2048)
    for (let i = 0; i < 90; i++) reader.read(tone(65, 230, 2), samples, RATE, 1 / 60, raw)
    expect(raw.bass).toBeGreaterThan(0.6)
    expect(raw.mid).toBeLessThan(0.05)
    expect(raw.high).toBeLessThan(0.05)
    const highs = new BytesReader()
    for (let i = 0; i < 90; i++) highs.read(tone(9000, 230, 40), samples, RATE, 1 / 60, raw)
    expect(raw.high).toBeGreaterThan(0.5)
    expect(raw.bass).toBeLessThan(0.05)
  })

  it('does not turn silence into movement', () => {
    const reader = new BytesReader()
    const shaper = new FrameShaper()
    const raw = createRaw()
    const out = createFrame()
    for (let i = 0; i < 300; i++) {
      reader.read(new Uint8Array(BINS), new Float32Array(2048), RATE, 1 / 60, raw)
      shaper.shape(raw, out, 1 / 60, 0.4)
    }
    expect(out.level).toBeLessThan(0.01)
    expect(Math.max(...out.spectrum)).toBeLessThan(0.01)
    expect(out.beat).toBeLessThan(0.01)
  })

  it('lets a beat fade over about a quarter of a second, and slows the fall of the bass with Smoothing', () => {
    const run = (smoothing: number) => {
      const shaper = new FrameShaper()
      const raw = createRaw()
      const out = createFrame()
      raw.bass = 1
      for (let i = 0; i < 10; i++) shaper.shape(raw, out, 1 / 60, smoothing)
      raw.bass = 0
      let beat = 0
      for (let i = 0; i < 30; i++) {
        shaper.shape(raw, out, 1 / 60, smoothing)
        if (i === 14) beat = out.beat
      }
      return { bass: out.bass, beat }
    }
    const snappy = run(0)
    const flowing = run(1)
    expect(flowing.bass).toBeGreaterThan(snappy.bass * 2)
    // Half a second after the last beat the afterglow is mostly gone, but not gone at once.
    expect(snappy.beat).toBeLessThan(0.5)
  })

  it('resets cleanly', () => {
    const shaper = new FrameShaper()
    const raw = createRaw()
    raw.bass = 1
    raw.level = 1
    const out = createFrame()
    for (let i = 0; i < 20; i++) shaper.shape(raw, out, 1 / 60, 0.5)
    shaper.reset()
    raw.bass = 0
    raw.level = 0
    shaper.shape(raw, out, 1 / 60, 0.5)
    expect(out.bass).toBe(0)
    expect(out.level).toBe(0)
    expect(out.beat).toBe(0)
  })
})
