import { tri } from '../../../../content/trilingual'
import { createHandoff } from '../../experience/handoff'
import { PHRASES, sanitizeText } from './typeLayout'

export const FONTS = ['archivo', 'condensed', 'serif', 'mono'] as const
export type FontId = (typeof FONTS)[number]

export const MOTIONS = ['none', 'drift', 'wave', 'pulse', 'orbit', 'glitch'] as const
export type MotionId = (typeof MOTIONS)[number]

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export interface TypeControls {
  /** What is set in type: any words, up to the room the scene has. */
  text: string
  font: FontId
  /** How much of the view the sentence fills. */
  size: number
  /** The colour of the letters' faces as `#rrggbb`, or null for the theme's ink. */
  colour: string | null
  /** The way the letters move on their own. */
  motion: MotionId
  /** How fast things move: the letters' springs and the preset's time. */
  speed: number
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
  text: PHRASES[0].lines.join(' '),
  font: 'archivo',
  size: 1,
  colour: null,
  motion: 'drift',
  speed: 1,
  depth: 0.55,
  distortion: 1,
  broken: false,
  scatterVersion: 0,
  resetVersion: 0,
}

export const TYPE_RANGES = {
  size: { min: 0.4, max: 1.1 },
  speed: { min: 0.2, max: 2 },
  depth: { min: 0, max: 1 },
  distortion: { min: 0, max: 1.5 },
} as const

/** What is kept of a typographic composition: the words and everything that shapes them. */
export interface TypeWork {
  version: 2
  text: string
  font: FontId
  size: number
  colour: string | null
  motion: MotionId
  speed: number
  depth: number
  distortion: number
  broken: boolean
}

export function typeWork(controls: TypeControls): TypeWork {
  return {
    version: 2,
    text: controls.text,
    font: controls.font,
    size: controls.size,
    colour: controls.colour,
    motion: controls.motion,
    speed: controls.speed,
    depth: controls.depth,
    distortion: controls.distortion,
    broken: controls.broken,
  }
}

const within = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * Reads a kept composition from anything (an old version, a file, a damaged store). Null unless it is
 * recognisably one. Numbers are clamped to what the panel allows, the words are made safe to set, a font or a
 * motion must be one the page has, and a colour must be `#rrggbb`. Version 1 kept one of three sentences by number.
 */
export function sanitizeTypeWork(raw: unknown): TypeControls | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.version === 1) {
    const phrase = typeof r.phrase === 'number' && Number.isInteger(r.phrase) ? r.phrase : -1
    if (phrase < 0 || phrase >= PHRASES.length) return null
    return {
      ...TYPE_DEFAULTS,
      text: PHRASES[phrase].lines.join(' '),
      motion: 'none',
      depth: within(r.depth, TYPE_RANGES.depth.min, TYPE_RANGES.depth.max, TYPE_DEFAULTS.depth),
      distortion: within(r.distortion, TYPE_RANGES.distortion.min, TYPE_RANGES.distortion.max, TYPE_DEFAULTS.distortion),
      broken: r.broken === true,
    }
  }
  if (r.version !== 2 || typeof r.text !== 'string' || !r.text.trim()) return null
  const font = (FONTS as readonly unknown[]).includes(r.font) ? (r.font as FontId) : TYPE_DEFAULTS.font
  const motion = (MOTIONS as readonly unknown[]).includes(r.motion) ? (r.motion as MotionId) : TYPE_DEFAULTS.motion
  return {
    ...TYPE_DEFAULTS,
    text: sanitizeText(r.text),
    font,
    size: within(r.size, TYPE_RANGES.size.min, TYPE_RANGES.size.max, TYPE_DEFAULTS.size),
    colour: typeof r.colour === 'string' && HEX.test(r.colour) ? r.colour.toLowerCase() : null,
    motion,
    speed: within(r.speed, TYPE_RANGES.speed.min, TYPE_RANGES.speed.max, TYPE_DEFAULTS.speed),
    depth: within(r.depth, TYPE_RANGES.depth.min, TYPE_RANGES.depth.max, TYPE_DEFAULTS.depth),
    distortion: within(r.distortion, TYPE_RANGES.distortion.min, TYPE_RANGES.distortion.max, TYPE_DEFAULTS.distortion),
    broken: r.broken === true,
  }
}

/** A kept composition on its way to the page that shows it (see experience/handoff.ts). */
export const typeHandoff = createHandoff<TypeControls>()

export const typeText = {
  text: tri('Szöveg', 'Text', 'Tekst'),
  textHelp: tri(
    'Írj bármit, legfeljebb {max} betűt. A szavak külön sorba kerülnek.',
    'Type anything, up to {max} letters. The words are set one to a line.',
    'Typ iets, maximaal {max} letters. De woorden komen elk op een eigen regel.',
  ),
  presets: tri('Kész mondatok', 'Ready-made sentences', 'Kant-en-klare zinnen'),
  font: tri('Betűtípus', 'Typeface', 'Lettertype'),
  fonts: {
    archivo: tri('Széles', 'Wide', 'Breed'),
    condensed: tri('Keskeny', 'Condensed', 'Smal'),
    serif: tri('Talpas', 'Serif', 'Serif'),
    mono: tri('Fix szélességű', 'Mono', 'Mono'),
  },
  size: tri('Betűméret', 'Text size', 'Tekstgrootte'),
  colour: tri('Betűszín', 'Letter colour', 'Letterkleur'),
  themeInk: tri('Téma színe', 'Theme colour', 'Themakleur'),
  motion: tri('Mozgás', 'Motion', 'Beweging'),
  motions: {
    none: tri('Áll', 'Still', 'Stil'),
    drift: tri('Lebegés', 'Drift', 'Zweven'),
    wave: tri('Hullám', 'Wave', 'Golf'),
    pulse: tri('Lüktetés', 'Pulse', 'Puls'),
    orbit: tri('Keringés', 'Orbit', 'Baan'),
    glitch: tri('Hiba', 'Glitch', 'Glitch'),
  },
  speed: tri('Animáció sebessége', 'Animation speed', 'Animatiesnelheid'),
  depth: tri('3D mélység', '3D extrusion', '3D-extrusie'),
  distortion: tri('Torzítás', 'Distortion', 'Vervorming'),
  breakApart: tri('Bontás rétegekre', 'Break apart', 'Uiteenvallen'),
  reassemble: tri('Összerakás', 'Reassemble', 'Weer in elkaar'),
  scatter: tri('Szétszórás', 'Scatter', 'Verstrooien'),
  randomise: tri('Véletlen stílus', 'Random style', 'Willekeurige stijl'),
  readAs: tri('A mondat: {text}', 'The sentence: {text}', 'De zin: {text}'),
} as const
