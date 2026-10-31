import { SPECTRUM_BINS, WAVE_POINTS, binFrequency, clamp01, type RawFrame } from './soundAnalysis'

/**
 * The built-in sound is a short loop written in code: four bars of a four-on-the-floor beat, a
 * bass line, a clap, hats and an arpeggio over Am - F - C - G. It is not a recording and not a
 * file: the engine plays it with oscillators and noise as it goes, so nothing is downloaded and
 * nothing has a licence. This file is the score, and the same score also drives the silent preview,
 * which draws what the loop would look like without making any sound.
 */

export const STEPS_PER_BAR = 16
export const BARS = 4
export const LOOP_STEPS = STEPS_PER_BAR * BARS

export const TEMPO = { min: 80, max: 150, default: 118 } as const

export interface Step {
  kick: boolean
  snare: boolean
  /** 0 none, 1 closed hat, 2 open hat. */
  hat: 0 | 1 | 2
  /** A MIDI note for the bass, or null. */
  bass: number | null
  /** A MIDI note for the arpeggio, or null. */
  arp: number | null
}

/** The bass note each bar is built on: A, F, C, G. */
const ROOTS = [33, 29, 36, 31]
/** The arpeggio's chord tones for each bar. */
const CHORDS = [
  [57, 60, 64, 69],
  [53, 57, 60, 65],
  [60, 64, 67, 72],
  [55, 59, 62, 67],
]
const BASS_STEPS = new Set([0, 3, 6, 10, 12])
const ARP_STEPS = new Set([0, 2, 3, 5, 7, 8, 10, 11, 13, 15])

export function patternAt(index: number): Step {
  const n = ((Math.floor(index) % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS
  const bar = Math.floor(n / STEPS_PER_BAR)
  const s = n % STEPS_PER_BAR
  const lastBar = bar === BARS - 1
  const kick = s % 4 === 0 || (lastBar && s === 14)
  const snare = s === 4 || s === 12 || (lastBar && s === 15)
  const hat = s % 4 === 2 ? 2 : s % 2 === 0 ? 1 : bar % 2 === 1 && s >= 8 ? 1 : 0
  const bass = BASS_STEPS.has(s) ? ROOTS[bar] + (s === 10 || s === 6 ? 12 : 0) : null
  const arp = ARP_STEPS.has(s) ? CHORDS[bar][(s * 3 + bar) % 4] + (s % 8 >= 4 ? 12 : 0) : null
  return { kick, snare, hat, bass, arp }
}

export const midiToHz = (note: number): number => 440 * Math.pow(2, (note - 69) / 12)

/** Seconds in one sixteenth. */
export const stepSeconds = (bpm: number): number => 60 / bpm / 4

export function clampTempo(bpm: number): number {
  return Number.isFinite(bpm) ? Math.min(TEMPO.max, Math.max(TEMPO.min, Math.round(bpm))) : TEMPO.default
}

/**
 * The steps that fall due. `state.nextTime` is when the next step sounds; every step that starts
 * before `now + ahead` is handed back (and the state moves past it), so a timer that wakes up
 * regularly keeps the music in time even when it wakes a little late. If the page has been asleep
 * (a hidden tab) the music resumes from `now` rather than playing a burst of old steps.
 */
export function dueSteps(
  state: { nextTime: number; step: number },
  now: number,
  ahead: number,
  bpm: number,
): Array<{ time: number; step: number }> {
  const due: Array<{ time: number; step: number }> = []
  if (state.nextTime < now - 0.25) state.nextTime = now + 0.03
  const length = stepSeconds(clampTempo(bpm))
  while (state.nextTime < now + ahead) {
    due.push({ time: state.nextTime, step: state.step })
    state.nextTime += length
    state.step = (state.step + 1) % LOOP_STEPS
  }
  return due
}

// ── The silent preview ─────────────────────────────────────────────────────────────────

const gauss = (x: number, mu: number, sigma: number): number => Math.exp(-0.5 * ((x - mu) / sigma) ** 2)
const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
/** A repeatable stand-in for noise. */
const hash = (a: number, b: number): number => {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return v - Math.floor(v)
}

interface Envelopes {
  kick: number
  snare: number
  hatClosed: number
  hatOpen: number
  bass: number
  bassNote: number
  arp: number
  arpNote: number
}

function envelopes(t: number, bpm: number): Envelopes {
  const length = stepSeconds(bpm)
  const current = Math.floor(t / length)
  const e: Envelopes = { kick: 0, snare: 0, hatClosed: 0, hatOpen: 0, bass: 0, bassNote: 33, arp: 0, arpNote: 57 }
  let bassSeen = false
  let arpSeen = false
  for (let k = 0; k < 14; k++) {
    const index = current - k
    if (index < 0) break
    const age = t - index * length
    const step = patternAt(index)
    if (step.kick) e.kick = Math.max(e.kick, Math.exp(-age / 0.17))
    if (step.snare) e.snare = Math.max(e.snare, Math.exp(-age / 0.13))
    if (step.hat === 1) e.hatClosed = Math.max(e.hatClosed, Math.exp(-age / 0.05))
    if (step.hat === 2) e.hatOpen = Math.max(e.hatOpen, Math.exp(-age / 0.16))
    if (step.bass !== null && !bassSeen) {
      bassSeen = true
      e.bassNote = step.bass
      e.bass = Math.exp(-age / 0.28)
    }
    if (step.arp !== null && !arpSeen) {
      arpSeen = true
      e.arpNote = step.arp
      e.arp = Math.exp(-age / 0.13)
    }
  }
  return e
}

/**
 * What the loop would look like at time `t`, without a sound: the strength of each voice at that
 * moment, laid out as the bands, the spectrum and the waveform an analyser would have shown for it.
 * It is a drawing of the score, not a measurement of anything; the page says so.
 */
export function previewRaw(t: number, bpm: number, out: RawFrame): void {
  const tempo = clampTempo(bpm)
  const e = envelopes(Math.max(0, t), tempo)
  const hats = Math.max(e.hatClosed, e.hatOpen)

  out.bass = clamp01(e.kick * 0.95 + e.bass * 0.45)
  out.mid = clamp01(e.snare * 0.8 + e.arp * 0.6 + e.bass * 0.15)
  out.high = clamp01(e.hatClosed * 0.7 + e.hatOpen * 0.85 + e.arp * 0.25 + e.snare * 0.3)
  out.level = clamp01(0.05 + e.kick * 0.5 + e.snare * 0.3 + hats * 0.2 + e.bass * 0.3 + e.arp * 0.25)

  const bassOct = Math.log2(midiToHz(e.bassNote))
  const arpOct = Math.log2(midiToHz(e.arpNote))
  const kickOct = Math.log2(58)
  const level = out.level
  for (let i = 0; i < SPECTRUM_BINS; i++) {
    const f = binFrequency(i)
    const o = Math.log2(f)
    let v = e.kick * gauss(o, kickOct, 0.42)
    v += e.bass * (0.75 * gauss(o, bassOct, 0.22) + 0.3 * gauss(o, bassOct + 1, 0.22))
    v +=
      e.snare * 0.85 * smooth(Math.log2(1100), Math.log2(2300), o) * (1 - smooth(Math.log2(6500), Math.log2(11000), o))
    v += hats * 0.9 * smooth(Math.log2(5200), Math.log2(8000), o)
    v += e.arp * (0.85 * gauss(o, arpOct, 0.2) + 0.45 * gauss(o, arpOct + 1, 0.2) + 0.22 * gauss(o, arpOct + 1.58, 0.2))
    v += 0.025 * (1 + Math.sin(i * 1.7 + t * 3)) * (0.3 + level)
    out.spectrum[i] = clamp01(v)
  }

  const noiseFrame = Math.floor(t * 60)
  for (let i = 0; i < WAVE_POINTS; i++) {
    const x = i / (WAVE_POINTS - 1)
    let w = e.kick * 0.8 * Math.sin(Math.PI * 2 * 1.2 * x) * (1 - 0.3 * x)
    w += e.bass * 0.35 * Math.sin(Math.PI * 2 * 2.4 * x)
    w += e.arp * 0.4 * Math.sin(Math.PI * 2 * (5 + (e.arpNote % 12) / 6) * x)
    w += hats * 0.22 * (hash(i, noiseFrame) * 2 - 1)
    w += e.snare * 0.3 * (hash(i + 400, noiseFrame) * 2 - 1)
    out.wave[i] = Math.max(-1, Math.min(1, w))
  }
}
