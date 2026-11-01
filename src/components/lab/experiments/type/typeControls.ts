import { tri } from '../../../../content/trilingual'
import { createHandoff } from '../../experience/handoff'
import { PHRASES } from './typeLayout'

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export interface TypeControls {
  /** Index into PHRASES. */
  phrase: number
  /** 0..1: how deep each letter is. */
  depth: number
  /** 0..1.5: how hard the pointer bends, tilts and lifts the letters. */
  distortion: number
  /** The letters are broken apart into their layers. */
  broken: boolean
  /** Bumped by the panel to scatter the letters, or to reset. */
  scatterVersion: number
  resetVersion: number
}

export const TYPE_DEFAULTS: Readonly<TypeControls> = {
  phrase: 0,
  depth: 0.55,
  distortion: 1,
  broken: false,
  scatterVersion: 0,
  resetVersion: 0,
}

export const TYPE_RANGES = {
  depth: { min: 0, max: 1 },
  distortion: { min: 0, max: 1.5 },
} as const

/** What is kept of a typographic composition: the sentence and the three settings that shape it. */
export interface TypeWork {
  version: 1
  /** Index into PHRASES. */
  phrase: number
  depth: number
  distortion: number
  broken: boolean
}

export function typeWork(controls: TypeControls): TypeWork {
  return {
    version: 1,
    phrase: controls.phrase,
    depth: controls.depth,
    distortion: controls.distortion,
    broken: controls.broken,
  }
}

const within = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

/**
 * Reads a kept composition from anything (an old version, a file, a damaged store). Null unless it
 * is recognisably one; the numbers are clamped to what the panel allows and the sentence must be one
 * of the installation's.
 */
export function sanitizeTypeWork(raw: unknown): TypeControls | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.version !== 1) return null
  const phrase = typeof r.phrase === 'number' && Number.isInteger(r.phrase) ? r.phrase : -1
  if (phrase < 0 || phrase >= PHRASES.length) return null
  return {
    ...TYPE_DEFAULTS,
    phrase,
    depth: within(r.depth, TYPE_RANGES.depth.min, TYPE_RANGES.depth.max, TYPE_DEFAULTS.depth),
    distortion: within(r.distortion, TYPE_RANGES.distortion.min, TYPE_RANGES.distortion.max, TYPE_DEFAULTS.distortion),
    broken: r.broken === true,
  }
}

/** A kept composition on its way to the page that shows it (see experience/handoff.ts). */
export const typeHandoff = createHandoff<TypeControls>()

export const typeText = {
  phrase: tri('Mondat', 'Sentence', 'Zin'),
  depth: tri('Mélység', 'Depth', 'Diepte'),
  distortion: tri('Torzítás', 'Distortion', 'Vervorming'),
  breakApart: tri('Bontás rétegekre', 'Break apart', 'Uiteenvallen'),
  reassemble: tri('Összerakás', 'Reassemble', 'Weer in elkaar'),
  scatter: tri('Szétszórás', 'Scatter', 'Verstrooien'),
  readAs: tri('A mondat: {text}', 'The sentence: {text}', 'De zin: {text}'),
} as const
