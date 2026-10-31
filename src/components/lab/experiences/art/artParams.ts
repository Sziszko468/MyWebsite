import { createStore } from '../../experience/store'
import { loadJson, saveJson } from '../../experience/persist'

/**
 * The Generative Art Engine's one document: a handful of numbers and choices that fully describe a
 * piece. The same parameters always make the same piece (the seed decides every random choice), so a
 * work can be saved as a few hundred bytes, shared as a file and made again. Every value that comes in
 * from a file or storage is clamped to its range first.
 */
export type Formation = 'sphere' | 'torus' | 'spiral' | 'lattice' | 'wave' | 'galaxy'
export type PaletteId = 'racing' | 'ember' | 'ocean' | 'mono' | 'acid'
export type PointerMode = 'repel' | 'attract'

export const FORMATIONS: readonly Formation[] = ['sphere', 'torus', 'spiral', 'lattice', 'wave', 'galaxy']
export const PALETTE_IDS: readonly PaletteId[] = ['racing', 'ember', 'ocean', 'mono', 'acid']
export const POINTER_MODES: readonly PointerMode[] = ['repel', 'attract']

export const PALETTES: Record<PaletteId, readonly [string, string, string]> = {
  racing: ['#ff161f', '#445cff', '#f4f0e8'],
  ember: ['#ff6a2f', '#ffd166', '#c0392b'],
  ocean: ['#2fd5ff', '#445cff', '#e8f6ff'],
  mono: ['#f4f0e8', '#9a9aa4', '#55555f'],
  acid: ['#b6ff2f', '#ff2fd5', '#2ff0ff'],
}

export interface ArtParams {
  version: 1
  seed: number
  count: number
  speed: number
  force: number
  gravity: number
  turbulence: number
  palette: PaletteId
  formation: Formation
  distortion: number
  noise: number
  rotation: number
  scale: number
  pointer: PointerMode
}

export type NumberKey =
  'seed' | 'count' | 'speed' | 'force' | 'gravity' | 'turbulence' | 'distortion' | 'noise' | 'rotation' | 'scale'

export interface Range {
  min: number
  max: number
  step: number
}

export const RANGES: Record<NumberKey, Range> = {
  seed: { min: 1, max: 99_999, step: 1 },
  count: { min: 2000, max: 40_000, step: 1000 },
  speed: { min: 0.2, max: 3, step: 0.05 },
  force: { min: 0, max: 3, step: 0.05 },
  gravity: { min: -1, max: 1, step: 0.05 },
  turbulence: { min: 0, max: 2, step: 0.05 },
  distortion: { min: 0, max: 1, step: 0.02 },
  noise: { min: 0, max: 1, step: 0.02 },
  rotation: { min: -2, max: 2, step: 0.05 },
  scale: { min: 0.5, max: 2, step: 0.05 },
}

export const DEFAULT_PARAMS: Readonly<ArtParams> = {
  version: 1,
  seed: 2026,
  count: 16_000,
  speed: 1,
  force: 1.4,
  gravity: 0,
  turbulence: 0.35,
  palette: 'racing',
  formation: 'torus',
  distortion: 0.25,
  noise: 0.35,
  rotation: 0.25,
  scale: 1,
  pointer: 'repel',
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function number(raw: unknown, key: NumberKey): number {
  const { min, max } = RANGES[key]
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : DEFAULT_PARAMS[key]
  const clamped = clamp(value, min, max)
  return key === 'seed' || key === 'count' ? Math.round(clamped) : clamped
}

/** Brings any record (a file, storage) to parameters inside their ranges; what is not understood becomes the default. */
export function sanitizeParams(raw: unknown): ArtParams {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    version: 1,
    seed: number(r.seed, 'seed'),
    count: number(r.count, 'count'),
    speed: number(r.speed, 'speed'),
    force: number(r.force, 'force'),
    gravity: number(r.gravity, 'gravity'),
    turbulence: number(r.turbulence, 'turbulence'),
    palette: PALETTE_IDS.includes(r.palette as PaletteId) ? (r.palette as PaletteId) : DEFAULT_PARAMS.palette,
    formation: FORMATIONS.includes(r.formation as Formation) ? (r.formation as Formation) : DEFAULT_PARAMS.formation,
    distortion: number(r.distortion, 'distortion'),
    noise: number(r.noise, 'noise'),
    rotation: number(r.rotation, 'rotation'),
    scale: number(r.scale, 'scale'),
    pointer: POINTER_MODES.includes(r.pointer as PointerMode) ? (r.pointer as PointerMode) : DEFAULT_PARAMS.pointer,
  }
}

/** A small deterministic random number generator (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A new random composition: every choice comes from the seed, so the same seed is the same piece, and
 * the counts stay inside what a phone can draw (`maxCount`).
 */
export function randomParams(seed: number, maxCount: number = RANGES.count.max): ArtParams {
  const random = rng(seed * 2654435761)
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]
  const between = (key: NumberKey, low = 0, high = 1) => {
    const { min, max } = RANGES[key]
    return min + (max - min) * (low + (high - low) * random())
  }
  return sanitizeParams({
    seed,
    count: Math.min(maxCount, Math.round(between('count', 0.25, 0.9) / 1000) * 1000),
    speed: between('speed', 0.15, 0.7),
    force: between('force', 0.25, 0.8),
    gravity: random() < 0.6 ? 0 : between('gravity', 0.3, 0.7),
    turbulence: between('turbulence', 0, 0.7),
    palette: pick(PALETTE_IDS),
    formation: pick(FORMATIONS),
    distortion: between('distortion', 0, 0.8),
    noise: between('noise', 0.1, 0.8),
    rotation: between('rotation', 0.2, 0.8),
    scale: between('scale', 0.2, 0.7),
    pointer: random() < 0.75 ? 'repel' : 'attract',
  })
}

// ── The working state and saving ───────────────────────────────────────────────────────

export interface ArtState {
  params: ArtParams
  paused: boolean
  message: string
}

const KEY = 'lab:art:current'
const SAVED = 'lab:art:saved'

export const art = createStore<ArtState>({
  params: loadJson(KEY, (raw) => sanitizeParams(raw)) ?? { ...DEFAULT_PARAMS },
  paused: false,
  message: '',
})

let timer = 0
export function setParams(next: ArtParams, message = ''): void {
  const params = sanitizeParams(next)
  art.set((state) => ({ ...state, params, message }))
  window.clearTimeout(timer)
  timer = window.setTimeout(() => saveJson(KEY, params), 300)
}

export function patchParams(patch: Partial<ArtParams>): void {
  setParams({ ...art.get().params, ...patch })
}

export function setPaused(paused: boolean): void {
  art.set((state) => ({ ...state, paused }))
}

export function setMessage(message: string): void {
  art.set((state) => ({ ...state, message }))
}

/** One saved piece in this browser, apart from the working one. */
export function saveSlot(params: ArtParams): boolean {
  return saveJson(SAVED, params).ok
}

export function readSlot(): ArtParams | null {
  return loadJson(SAVED, (raw) => (typeof raw === 'object' && raw !== null ? sanitizeParams(raw) : null))
}
