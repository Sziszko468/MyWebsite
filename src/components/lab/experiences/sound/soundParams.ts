import { loadJson, saveJson } from '../../experience/persist'
import { createStore } from '../../experience/store'
import { TEMPO, clampTempo } from './rhythm'

/**
 * What a visitor can tune in the Sound Reactive World, and what is kept between visits: the
 * settings, and only the settings. The sound itself is never kept (there is nothing to keep: the
 * built-in loop is code, and the microphone is not recorded), and which source was last used is
 * not kept either, so the page always begins silent and never listens until it is told to.
 */

export type SoundPaletteId = 'racing' | 'ocean' | 'ember' | 'mono'
export const SOUND_PALETTE_IDS: readonly SoundPaletteId[] = ['racing', 'ocean', 'ember', 'mono']

/** Bass colour, highs colour, light colour. */
export const SOUND_PALETTES: Record<SoundPaletteId, readonly [string, string, string]> = {
  racing: ['#ff161f', '#445cff', '#f4f0e8'],
  ocean: ['#2fd5ff', '#6a5cff', '#e8f6ff'],
  ember: ['#ff6a2f', '#ffd166', '#fff1d6'],
  mono: ['#f4f0e8', '#9a9aa4', '#ffffff'],
}

/** The most particles the world may use on a device: a share of what its quality tier allows for particles. */
export const particleBudget = (tierParticles: number): number => Math.round(tierParticles * 0.6)

export const RANGES = {
  volume: { min: 0, max: 1, step: 0.01 },
  smoothing: { min: 0, max: 1, step: 0.01 },
  sensitivity: { min: 0.3, max: 3, step: 0.05 },
  geometry: { min: 0, max: 1.5, step: 0.05 },
  particles: { min: 0, max: 1.5, step: 0.05 },
  lights: { min: 0, max: 1.5, step: 0.05 },
  density: { min: 0.2, max: 1, step: 0.05 },
} as const

export interface SoundSettings {
  version: 1
  tempo: number
  volume: number
  smoothing: number
  sensitivity: number
  /** How strongly the bass shapes the central form. */
  geometry: number
  /** How strongly the spectrum moves the particles. */
  particles: number
  /** How strongly the high notes light the scene. */
  lights: number
  palette: SoundPaletteId
  /** The share of the device's particle budget in use. */
  density: number
  waveform: boolean
}

export const DEFAULT_SETTINGS: SoundSettings = {
  version: 1,
  tempo: TEMPO.default,
  volume: 0.6,
  smoothing: 0.4,
  sensitivity: 1,
  geometry: 1,
  particles: 1,
  lights: 1,
  palette: 'racing',
  density: 1,
  waveform: true,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const number = (raw: unknown, key: keyof typeof RANGES, fallback: number): number => {
  const { min, max } = RANGES[key]
  return typeof raw === 'number' && Number.isFinite(raw) ? clamp(raw, min, max) : fallback
}

/** Anything in, a valid set of settings out: unknown fields dropped, numbers clamped, the rest defaulted. */
export function sanitizeSettings(raw: unknown): SoundSettings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  return {
    version: 1,
    tempo: typeof r.tempo === 'number' ? clampTempo(r.tempo) : DEFAULT_SETTINGS.tempo,
    volume: number(r.volume, 'volume', DEFAULT_SETTINGS.volume),
    smoothing: number(r.smoothing, 'smoothing', DEFAULT_SETTINGS.smoothing),
    sensitivity: number(r.sensitivity, 'sensitivity', DEFAULT_SETTINGS.sensitivity),
    geometry: number(r.geometry, 'geometry', DEFAULT_SETTINGS.geometry),
    particles: number(r.particles, 'particles', DEFAULT_SETTINGS.particles),
    lights: number(r.lights, 'lights', DEFAULT_SETTINGS.lights),
    palette: SOUND_PALETTE_IDS.includes(r.palette as SoundPaletteId)
      ? (r.palette as SoundPaletteId)
      : DEFAULT_SETTINGS.palette,
    density: number(r.density, 'density', DEFAULT_SETTINGS.density),
    waveform: typeof r.waveform === 'boolean' ? r.waveform : DEFAULT_SETTINGS.waveform,
  }
}

const KEY = 'lab:sound:settings'

export function readSettings(): SoundSettings {
  return (
    loadJson(KEY, (raw) => (typeof raw === 'object' && raw !== null ? sanitizeSettings(raw) : null)) ?? DEFAULT_SETTINGS
  )
}

export function writeSettings(settings: SoundSettings): void {
  saveJson(KEY, settings, 2000)
}

export interface SoundUi {
  settings: SoundSettings
  /** The explanation before the microphone is asked for is on screen. */
  consent: boolean
  /** The last thing worth telling the visitor, and how serious it is. */
  message: string
  tone: 'info' | 'warning' | 'error'
}

export const sound = createStore<SoundUi>({ settings: DEFAULT_SETTINGS, consent: false, message: '', tone: 'info' })

export function patchSettings(patch: Partial<SoundSettings>): void {
  sound.set((state) => {
    const settings = sanitizeSettings({ ...state.settings, ...patch })
    writeSettings(settings)
    return { ...state, settings }
  })
}

export function resetSettings(): void {
  sound.set((state) => ({ ...state, settings: DEFAULT_SETTINGS }))
  writeSettings(DEFAULT_SETTINGS)
}

export function setConsent(consent: boolean): void {
  sound.set((state) => (state.consent === consent ? state : { ...state, consent }))
}

export function setMessage(message: string, tone: SoundUi['tone'] = 'info'): void {
  sound.set((state) => (state.message === message && state.tone === tone ? state : { ...state, message, tone }))
}

/** Loads what was kept into the store (once, when the page opens). */
export function loadSettings(): SoundSettings {
  const settings = readSettings()
  sound.set((state) => ({ ...state, settings }))
  return settings
}
