/**
 * What the Sound Reactive World knows about a sound, and how it comes to know it. Pure numbers
 * (no Web Audio, no DOM): the engine hands in the bytes an analyser produced and gets back one small
 * frame the scene reads: how loud, how much bass, mids and highs, whether a beat has just landed, a
 * spectrum on a logarithmic scale and a stable picture of the waveform. The same shaping is applied
 * to the real sources (the built-in loop, the microphone) and to the silent preview, so they look
 * alike and only the source differs.
 */

/** Bars in the spectrum the scene draws, spaced like the ear hears: equal steps in pitch. */
export const SPECTRUM_BINS = 48
/** Points in the waveform. */
export const WAVE_POINTS = 128

export const MIN_HZ = 30
export const MAX_HZ = 14_000
export const BASS_BAND: readonly [number, number] = [30, 150]
export const MID_BAND: readonly [number, number] = [150, 2500]
export const HIGH_BAND: readonly [number, number] = [2500, 14_000]

/**
 * No two beats are reported closer than this: a pulse of light that repeated faster than three times
 * a second could trouble people who are sensitive to flashing, however fast the music is.
 */
export const MIN_BEAT_GAP = 0.34

export interface AudioFrame {
  /** 0..1: how loud it is overall. */
  level: number
  bass: number
  mid: number
  high: number
  /** A beat landed in this very frame. */
  beatHit: boolean
  /** 0..1: 1 at a beat, fading over about a quarter of a second. */
  beat: number
  /** SPECTRUM_BINS values, 0..1, low pitch first. */
  spectrum: Float32Array
  /** WAVE_POINTS values, -1..1. */
  wave: Float32Array
}

export function createFrame(): AudioFrame {
  return {
    level: 0,
    bass: 0,
    mid: 0,
    high: 0,
    beatHit: false,
    beat: 0,
    spectrum: new Float32Array(SPECTRUM_BINS),
    wave: new Float32Array(WAVE_POINTS),
  }
}

/** What a source gives before the shaping: the same fields, without the beat. */
export type RawFrame = Pick<AudioFrame, 'level' | 'bass' | 'mid' | 'high' | 'spectrum' | 'wave'>

export function createRaw(): RawFrame {
  return {
    level: 0,
    bass: 0,
    mid: 0,
    high: 0,
    spectrum: new Float32Array(SPECTRUM_BINS),
    wave: new Float32Array(WAVE_POINTS),
  }
}

export const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value)

/** The centre of a spectrum bin, in Hz. */
export function binFrequency(index: number, bins: number = SPECTRUM_BINS): number {
  return MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, (index + 0.5) / bins)
}

/** The mean of the bytes (0..255) between two frequencies, as 0..1. `bytes` is an analyser's frequency data. */
export function bandEnergy(bytes: ArrayLike<number>, sampleRate: number, low: number, high: number): number {
  const count = bytes.length
  if (count === 0 || sampleRate <= 0) return 0
  const binHz = sampleRate / 2 / count
  const first = Math.min(count - 1, Math.max(0, Math.floor(low / binHz)))
  const last = Math.min(count - 1, Math.max(first, Math.ceil(high / binHz)))
  let sum = 0
  for (let i = first; i <= last; i++) sum += bytes[i]
  return sum / ((last - first + 1) * 255)
}

/**
 * Fills `out` with the spectrum on a logarithmic scale: each bin takes the strongest byte between
 * its edges (a narrow low bin, which falls between two bytes, takes the nearer ones' blend).
 */
export function logBins(bytes: ArrayLike<number>, sampleRate: number, out: Float32Array): void {
  const count = bytes.length
  const bins = out.length
  if (count === 0 || sampleRate <= 0) {
    out.fill(0)
    return
  }
  const binHz = sampleRate / 2 / count
  for (let i = 0; i < bins; i++) {
    const low = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, i / bins)
    const high = MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, (i + 1) / bins)
    const a = low / binHz
    const b = high / binHz
    if (b - a < 1) {
      // Narrower than one byte: blend the two nearest, by where the bin's centre falls.
      const centre = (a + b) / 2
      const lower = Math.min(count - 1, Math.max(0, Math.floor(centre)))
      const upper = Math.min(count - 1, lower + 1)
      const t = centre - Math.floor(centre)
      out[i] = (bytes[lower] * (1 - t) + bytes[upper] * t) / 255
    } else {
      let peak = 0
      const end = Math.min(count - 1, Math.ceil(b))
      for (let k = Math.max(0, Math.floor(a)); k <= end; k++) if (bytes[k] > peak) peak = bytes[k]
      out[i] = peak / 255
    }
  }
}

/**
 * The waveform, held still: it starts at a rising zero crossing near the beginning of the window, so
 * a steady tone draws as a steady picture instead of crawling. `samples` are the analyser's -1..1 floats.
 */
export function alignedWave(samples: ArrayLike<number>, out: Float32Array): void {
  const n = samples.length
  const points = out.length
  if (n < 2) {
    out.fill(0)
    return
  }
  let start = 0
  const search = Math.floor(n / 3)
  for (let i = 1; i < search; i++) {
    if (samples[i - 1] < 0 && samples[i] >= 0) {
      start = i
      break
    }
  }
  const window = Math.max(points, Math.min(n - start, points * 6))
  for (let i = 0; i < points; i++) {
    const at = Math.min(n - 1, start + Math.floor((i * window) / points))
    out[i] = samples[at]
  }
}

export function rms(samples: ArrayLike<number>): number {
  const n = samples.length
  if (n === 0) return 0
  let sum = 0
  for (let i = 0; i < n; i++) sum += samples[i] * samples[i]
  return Math.sqrt(sum / n)
}

export function peakAbs(samples: ArrayLike<number>): number {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i])
    if (v > peak) peak = v
  }
  return peak
}

/** Eases towards a target, quickly up and slowly down: how a meter behaves. Times are time constants, in seconds. */
export class Follower {
  value = 0
  private readonly attack: number
  private release: number

  constructor(attack: number, release: number) {
    this.attack = attack
    this.release = release
  }

  setRelease(seconds: number): void {
    this.release = seconds
  }

  step(target: number, dt: number): number {
    const tau = target > this.value ? this.attack : this.release
    const k = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau)
    this.value += (target - this.value) * k
    return this.value
  }
}

/**
 * Brings any input to a usable size: a quiet microphone and a loud track both end up using the
 * range. The peak is remembered and fades slowly; below `floor` nothing is amplified, so silence
 * and room noise are not blown up into movement.
 */
export class AutoGain {
  peak: number
  private readonly floor: number
  private readonly halfLife: number
  private readonly target: number

  constructor(floor = 0.12, halfLife = 6, target = 0.9) {
    this.floor = floor
    this.halfLife = halfLife
    this.target = target
    this.peak = floor
  }

  update(value: number, dt: number): number {
    this.peak = Math.max(value, this.floor, this.peak * Math.pow(0.5, dt / this.halfLife))
    return this.target / this.peak
  }
}

/**
 * Finds beats in the bass: an onset is the bass rising clearly above its own recent average, and
 * never twice within MIN_BEAT_GAP.
 */
export class BeatDetector {
  private average = 0
  private since = 99

  step(bass: number, dt: number): boolean {
    this.since += dt
    const hit = bass > 0.28 && bass > this.average * 1.35 + 0.06 && this.since >= MIN_BEAT_GAP
    if (hit) this.since = 0
    // The average follows the bass over about half a second, rising and falling alike.
    this.average += (bass - this.average) * (1 - Math.exp(-dt / 0.5))
    return hit
  }

  reset(): void {
    this.average = 0
    this.since = 99
  }
}

/** Seconds a beat takes to fade from 1. */
const BEAT_FADE = 0.25

/**
 * Turns what a source gave into the frame the scene reads: smooth it (quick to rise, slower to fall,
 * the slowness set by the visitor's Smoothing), find the beats and keep the beat's afterglow.
 */
export class FrameShaper {
  private readonly bass = new Follower(0.02, 0.2)
  private readonly mid = new Follower(0.02, 0.2)
  private readonly high = new Follower(0.015, 0.14)
  private readonly level = new Follower(0.03, 0.25)
  private readonly spectrum = new Float32Array(SPECTRUM_BINS)
  private readonly beats = new BeatDetector()
  private glow = 0

  /** `smoothing` 0..1: 0 follows every wiggle, 1 is slow and flowing. */
  shape(raw: RawFrame, out: AudioFrame, dt: number, smoothing: number): void {
    const release = 0.06 + clamp01(smoothing) * 0.6
    this.bass.setRelease(release)
    this.mid.setRelease(release)
    this.high.setRelease(release * 0.75)
    this.level.setRelease(release * 1.2)

    out.beatHit = this.beats.step(raw.bass, dt)
    this.glow = out.beatHit ? 1 : this.glow * Math.exp(-dt / BEAT_FADE)
    out.beat = this.glow

    out.bass = this.bass.step(clamp01(raw.bass), dt)
    out.mid = this.mid.step(clamp01(raw.mid), dt)
    out.high = this.high.step(clamp01(raw.high), dt)
    out.level = this.level.step(clamp01(raw.level), dt)

    const up = 1 - Math.exp(-dt / 0.025)
    const down = 1 - Math.exp(-dt / release)
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const target = clamp01(raw.spectrum[i])
      const k = target > this.spectrum[i] ? up : down
      this.spectrum[i] += (target - this.spectrum[i]) * k
      out.spectrum[i] = this.spectrum[i]
    }
    // The waveform is shown as it is: smoothing it would flatten it.
    out.wave.set(raw.wave)
  }

  reset(): void {
    this.beats.reset()
    this.glow = 0
    this.spectrum.fill(0)
    for (const f of [this.bass, this.mid, this.high, this.level]) f.value = 0
  }
}

/**
 * Reads an analyser's data (what the Web Audio API hands over: bytes for the spectrum, floats for
 * the waveform) into a raw frame, sizing it with an automatic gain per kind of data.
 */
export class BytesReader {
  private readonly spectrumGain = new AutoGain(0.14, 6, 0.9)
  private readonly waveGain = new AutoGain(0.03, 5, 0.85)

  read(bytes: ArrayLike<number>, samples: ArrayLike<number>, sampleRate: number, dt: number, out: RawFrame): void {
    const bass = bandEnergy(bytes, sampleRate, BASS_BAND[0], BASS_BAND[1])
    const mid = bandEnergy(bytes, sampleRate, MID_BAND[0], MID_BAND[1])
    const high = bandEnergy(bytes, sampleRate, HIGH_BAND[0], HIGH_BAND[1])
    // One gain for all three, so their balance is the sound's own.
    const gain = this.spectrumGain.update(Math.max(bass, mid, high), dt)
    out.bass = clamp01(bass * gain)
    out.mid = clamp01(mid * gain)
    out.high = clamp01(high * gain)

    logBins(bytes, sampleRate, out.spectrum)
    for (let i = 0; i < out.spectrum.length; i++) out.spectrum[i] = clamp01(out.spectrum[i] * gain * 0.9)

    const loudness = rms(samples)
    const waveScale = this.waveGain.update(peakAbs(samples), dt)
    out.level = clamp01(Math.sqrt(loudness * waveScale * 0.9) * 1.1)
    alignedWave(samples, out.wave)
    for (let i = 0; i < out.wave.length; i++) out.wave[i] = Math.max(-1, Math.min(1, out.wave[i] * waveScale))
  }
}
