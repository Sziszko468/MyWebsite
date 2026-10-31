import { tri } from '../../../../content/trilingual'
import { seededRandom } from '../../../hero/heroMath'

/**
 * The generator's parameters: everything that makes one object, in one plain record. A seed turns
 * into a whole set of parameters deterministically (`paramsFromSeed`), so a code like CC-1A2B3C4
 * always makes the same object, and the same seed keeps the object's own noise when the sliders
 * adjust it afterwards.
 */

export const FORMS = ['bloom', 'knot', 'spire', 'shell', 'crystal'] as const
export type FormId = (typeof FORMS)[number]

export const MATERIAL_IDS = ['chrome', 'clay', 'glass', 'wire'] as const
export type GenMaterialId = (typeof MATERIAL_IDS)[number]

export const PALETTE_IDS = ['racing', 'cobalt', 'paper', 'mono'] as const
export type PaletteId = (typeof PALETTE_IDS)[number]

export interface GenParams {
  form: FormId
  /** 0..1: how finely the surface is built (the vertex count, within the tier's budget). */
  complexity: number
  /** 0..1: how thick or tall the form is. */
  depth: number
  /** 0..1: how far noise and twist push it off its ideal shape. */
  distortion: number
  /** 1..12: how many times its pattern repeats round the axis. */
  symmetry: number
  material: GenMaterialId
  /** 0.4..1.6 */
  light: number
  palette: PaletteId
  seed: number
}

export const GEN_DEFAULTS: Readonly<GenParams> = {
  form: 'knot',
  complexity: 0.6,
  depth: 0.45,
  distortion: 0.25,
  symmetry: 3,
  material: 'chrome',
  light: 1,
  palette: 'racing',
  seed: 2718281,
}

export const SYMMETRY_RANGE = { min: 1, max: 12 } as const

/** Colours of the room the object is lit in, as sRGB hex. */
export const PALETTES: Record<PaletteId, { red: number; blue: number; ink: number; tint: [number, number, number] }> = {
  racing: { red: 0xff161f, blue: 0x445cff, ink: 0xf4f0e8, tint: [0.9, 0.9, 0.95] },
  cobalt: { red: 0x445cff, blue: 0x9fb0ff, ink: 0xe8ecff, tint: [0.66, 0.74, 1] },
  paper: { red: 0xf4d9b0, blue: 0x9ca3b8, ink: 0xf4f0e8, tint: [1, 0.92, 0.8] },
  mono: { red: 0xe8e8e8, blue: 0x8c8c94, ink: 0xffffff, tint: [0.88, 0.88, 0.9] },
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Brings a parameter set inside its ranges (a typed seed or a saved set may carry anything). */
export function sanitizeParams(params: GenParams): GenParams {
  return {
    form: FORMS.includes(params.form) ? params.form : GEN_DEFAULTS.form,
    complexity: clamp(params.complexity, 0, 1),
    depth: clamp(params.depth, 0, 1),
    distortion: clamp(params.distortion, 0, 1),
    symmetry: Math.round(clamp(params.symmetry, SYMMETRY_RANGE.min, SYMMETRY_RANGE.max)),
    material: MATERIAL_IDS.includes(params.material) ? params.material : GEN_DEFAULTS.material,
    light: clamp(params.light, 0.4, 1.6),
    palette: PALETTE_IDS.includes(params.palette) ? params.palette : GEN_DEFAULTS.palette,
    seed: params.seed >>> 0,
  }
}

/** A whole parameter set from a seed. The same seed always gives the same set. */
export function paramsFromSeed(seed: number): GenParams {
  const s = seed >>> 0
  const random = seededRandom(s ^ 0x9e3779b9)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length) % list.length]
  // The clear materials are likelier than the wire frame, which is the odd one out.
  const material = pick<GenMaterialId>(['chrome', 'chrome', 'clay', 'glass', 'glass', 'wire'])
  return sanitizeParams({
    form: pick(FORMS),
    complexity: 0.4 + random() * 0.5,
    depth: 0.2 + random() * 0.7,
    distortion: 0.1 + random() * 0.65,
    symmetry: 2 + Math.floor(random() * 8),
    material,
    light: 0.85 + random() * 0.4,
    palette: pick(PALETTE_IDS),
    seed: s,
  })
}

/** A seed for "Generate": anything works as long as it is a whole number below 2^32. */
export function freshSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}

const CODE_PREFIX = 'CC-'

/** The share code of a seed: `CC-` and the seed in base 36, upper case. */
export function seedCode(seed: number): string {
  return `${CODE_PREFIX}${(seed >>> 0).toString(36).toUpperCase().padStart(7, '0')}`
}

/** The seed in a code, with or without the prefix, in any case; `null` if it is not one. */
export function parseSeedCode(text: string): number | null {
  const cleaned = text.trim().toUpperCase().replace(/^CC-?/, '')
  if (!/^[0-9A-Z]{1,7}$/.test(cleaned)) return null
  const value = parseInt(cleaned, 36)
  return Number.isFinite(value) && value >= 0 && value <= 0xffffffff ? value : null
}

/** A saved object: its parameters and a small picture of it. */
export interface SavedObject {
  params: GenParams
  /** A data URL of a small picture, or '' if none could be taken. */
  picture: string
}

/** The most objects the collection keeps; saving another drops the oldest, so memory never piles up. */
export const MAX_SAVED = 6

/** The collection with one more object, newest last, never longer than MAX_SAVED. */
export function addSaved(collection: readonly SavedObject[], item: SavedObject): SavedObject[] {
  const without = collection.filter(
    (saved) => !(saved.params.seed === item.params.seed && sameShape(saved.params, item.params)),
  )
  return [...without, item].slice(-MAX_SAVED)
}

function sameShape(a: GenParams, b: GenParams): boolean {
  return (
    a.form === b.form &&
    a.complexity === b.complexity &&
    a.depth === b.depth &&
    a.distortion === b.distortion &&
    a.symmetry === b.symmetry &&
    a.material === b.material &&
    a.palette === b.palette &&
    a.light === b.light
  )
}

export const genText = {
  forms: {
    bloom: tri('Virág', 'Bloom', 'Bloem'),
    knot: tri('Csomó', 'Knot', 'Knoop'),
    spire: tri('Torony', 'Spire', 'Spits'),
    shell: tri('Kagyló', 'Shell', 'Schelp'),
    crystal: tri('Kristály', 'Crystal', 'Kristal'),
  },
  materials: {
    chrome: tri('Króm', 'Chrome', 'Chroom'),
    clay: tri('Agyag', 'Clay', 'Klei'),
    glass: tri('Üveg', 'Glass', 'Glas'),
    wire: tri('Drót', 'Wire', 'Draad'),
  },
  palettes: {
    racing: tri('Racing', 'Racing', 'Racing'),
    cobalt: tri('Kobalt', 'Cobalt', 'Kobalt'),
    paper: tri('Papír', 'Paper', 'Papier'),
    mono: tri('Mono', 'Mono', 'Mono'),
  },
  form: tri('Forma', 'Form', 'Vorm'),
  material: tri('Anyag', 'Material', 'Materiaal'),
  palette: tri('Színpaletta', 'Palette', 'Palet'),
  complexity: tri('Geometriai komplexitás', 'Geometric complexity', 'Geometrische complexiteit'),
  depth: tri('Mélység', 'Depth', 'Diepte'),
  distortion: tri('Torzulás', 'Distortion', 'Vervorming'),
  symmetry: tri('Szimmetria', 'Symmetry', 'Symmetrie'),
  light: tri('Fényintenzitás', 'Light intensity', 'Lichtsterkte'),
  seed: tri('Mag', 'Seed', 'Seed'),
  seedHelp: tri(
    'Ugyanaz a mag mindig ugyanazt az objektumot adja. Írj be egy kódot, vagy dobj újat.',
    'The same seed always gives the same object. Type a code, or roll a new one.',
    'Dezelfde seed geeft altijd hetzelfde object. Typ een code of gooi een nieuwe.',
  ),
  seedInvalid: tri(
    'Ez nem érvényes kód. Példa: CC-0AB12CD',
    'That is not a valid code. Example: CC-0AB12CD',
    'Dat is geen geldige code. Voorbeeld: CC-0AB12CD',
  ),
  apply: tri('Alkalmaz', 'Apply', 'Toepassen'),
  generate: tri('Generálás', 'Generate', 'Genereren'),
  save: tri('Mentés', 'Save', 'Bewaren'),
  fullView: tri('Teljes nézet', 'Full view', 'Volledig beeld'),
  closeFullView: tri('Kilépés a teljes nézetből', 'Leave the full view', 'Volledig beeld sluiten'),
  collection: tri('Mentett objektumok', 'Saved objects', 'Bewaarde objecten'),
  collectionEmpty: tri(
    'Még nincs mentett objektum. Legfeljebb hat fér el.',
    'Nothing saved yet. Up to six are kept.',
    'Nog niets bewaard. Er passen er maximaal zes.',
  ),
  open: tri('Megnyitás: {name}, {code}', 'Open {name}, {code}', 'Openen: {name}, {code}'),
  remove: tri(
    'Törlés a gyűjteményből: {name}',
    'Remove from the collection: {name}',
    'Verwijderen uit de collectie: {name}',
  ),
  saved: tri('Elmentve.', 'Saved.', 'Bewaard.'),
} as const
