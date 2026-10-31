import { seededRandom as rng } from '../../../hero/heroMath'
import {
  LIGHT_RIGS,
  MATERIAL_PRESETS,
  MAX_OBJECTS,
  POSITION_LIMIT,
  SCALE_MAX,
  SCALE_MIN,
  addObject,
  emptyDoc,
  materialFromPreset,
  setLighting,
  updateObject,
  type MaterialPreset,
  type ShapeKind,
  type StudioDoc,
  type Vec3,
} from './studioDoc'

/**
 * The Model Studio's procedural generator: a composition of primitives made from a few numbers.
 * Complexity is how many pieces there are, variation how different they are from each other, scale
 * how big, rotation how far they are turned, distortion how far they are stretched out of shape,
 * symmetry how many times the arrangement is repeated round the middle, and the seed decides every
 * random choice, so the same numbers always give the same model.
 *
 * Generated pieces are named "Gen …": generating again replaces them and leaves everything the
 * visitor made by hand where it is.
 */
export interface GenParams {
  seed: number
  complexity: number
  variation: number
  scale: number
  rotation: number
  distortion: number
  symmetry: number
}

export const SYMMETRIES = [1, 2, 3, 4, 6] as const

export const GEN_RANGES = {
  seed: { min: 1, max: 99_999, step: 1 },
  complexity: { min: 2, max: 14, step: 1 },
  variation: { min: 0, max: 1, step: 0.02 },
  scale: { min: 0.5, max: 2, step: 0.05 },
  rotation: { min: 0, max: 1, step: 0.02 },
  distortion: { min: 0, max: 1, step: 0.02 },
} as const

export const GEN_DEFAULTS: Readonly<GenParams> = {
  seed: 7,
  complexity: 6,
  variation: 0.5,
  scale: 1,
  rotation: 0.4,
  distortion: 0.3,
  symmetry: 3,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function sanitizeGen(raw: Partial<GenParams>): GenParams {
  const value = (key: keyof typeof GEN_RANGES, fallback: number) => {
    const given = raw[key]
    const { min, max } = GEN_RANGES[key]
    return clamp(typeof given === 'number' && Number.isFinite(given) ? given : fallback, min, max)
  }
  return {
    seed: Math.round(value('seed', GEN_DEFAULTS.seed)),
    complexity: Math.round(value('complexity', GEN_DEFAULTS.complexity)),
    variation: value('variation', GEN_DEFAULTS.variation),
    scale: value('scale', GEN_DEFAULTS.scale),
    rotation: value('rotation', GEN_DEFAULTS.rotation),
    distortion: value('distortion', GEN_DEFAULTS.distortion),
    symmetry: (SYMMETRIES as readonly number[]).includes(raw.symmetry ?? 0)
      ? (raw.symmetry as number)
      : GEN_DEFAULTS.symmetry,
  }
}

const KINDS: readonly ShapeKind[] = ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'custom']
const PAINTS: readonly string[] = ['#ff161f', '#445cff', '#f4f0e8', '#17171b', '#d4a73c']
/** What a composition is mostly made of: solid finishes, with glass only as an occasional accent. */
const SOLID: readonly MaterialPreset[] = MATERIAL_PRESETS.filter((preset) => preset !== 'digital-glass')
const GENERATED = 'Gen '

/** What the generator names its pieces, so a later run can find them. */
export const isGenerated = (name: string): boolean => name.startsWith(GENERATED)

/** The doc without the pieces an earlier generation made. */
export function withoutGenerated(doc: StudioDoc): StudioDoc {
  const objects = doc.objects.filter((object) => !isGenerated(object.name))
  const selected = objects.some((object) => object.id === doc.selectedId) ? doc.selectedId : null
  return { ...doc, objects, selectedId: selected }
}

/** Adds a generated composition to a doc (replacing an earlier generated one), as far as there is room. */
export function generate(doc: StudioDoc, input: Partial<GenParams>): StudioDoc {
  const params = sanitizeGen(input)
  const random = rng(params.seed * 40503)
  let result = withoutGenerated(doc)
  const room = MAX_OBJECTS - result.objects.length
  const pieces = Math.max(0, Math.min(params.complexity, Math.floor(room / params.symmetry)))
  const first = KINDS[Math.floor(random() * KINDS.length)]
  const finish = SOLID[Math.floor(random() * SOLID.length)]

  for (let p = 0; p < pieces; p++) {
    // The first piece sits near the middle and is the biggest and highest; each next one is further out,
    // smaller and lower, so a composition reads as one thing rather than a heap.
    const outward = p / Math.max(pieces, 1)
    // Low variation: the pieces are alike; high: each is its own thing.
    const kind = random() < params.variation ? KINDS[Math.floor(random() * KINDS.length)] : first
    const preset: MaterialPreset =
      random() < params.variation ? MATERIAL_PRESETS[Math.floor(random() * MATERIAL_PRESETS.length)] : finish
    const colour = PAINTS[Math.floor(random() * PAINTS.length)]
    const reach = (0.6 + (outward + (random() * 0.6) / Math.max(pieces, 1)) * 2.8) * params.scale
    const angle = random() * Math.PI * 2
    const height = (0.4 + (1 - outward) * 1.8 + random() * 0.8) * params.scale
    const base = (0.3 + random() * 0.6 * (0.4 + params.variation)) * params.scale * (1 - 0.45 * outward)
    const stretch = (): number => 1 + (random() - 0.5) * 2 * params.distortion * 1.3
    const size: Vec3 = [base * stretch(), base * stretch(), base * stretch()]
    const turn = Math.PI * params.rotation
    const spin: Vec3 = [
      (random() - 0.5) * 2 * turn,
      random() * Math.PI * 2 * params.rotation,
      (random() - 0.5) * 2 * turn,
    ]

    for (let k = 0; k < params.symmetry; k++) {
      const around = (k / params.symmetry) * Math.PI * 2
      const at = angle + around
      const object: Vec3 = [Math.cos(at) * reach, height, Math.sin(at) * reach]
      result = addObject(result, kind)
      const id = result.selectedId!
      result = updateObject(result, id, {
        name: `${GENERATED}${p + 1}.${k + 1}`,
        position: object.map((v) => clamp(v, -POSITION_LIMIT, POSITION_LIMIT)) as Vec3,
        rotation: [spin[0], spin[1] - around, spin[2]],
        scale: size.map((v) => clamp(v, SCALE_MIN, SCALE_MAX)) as Vec3,
        material: {
          ...materialFromPreset(preset),
          ...(preset === 'racing-red' || preset === 'ceramic' ? { color: colour } : {}),
        },
      })
    }
  }
  return result
}

/** A random set of generator numbers for a seed: the RANDOMIZE button. */
export function randomGen(seed: number): GenParams {
  const random = rng(seed * 69069)
  return sanitizeGen({
    seed,
    complexity: 3 + Math.floor(random() * 9),
    variation: 0.2 + random() * 0.7,
    scale: 0.7 + random() * 0.9,
    rotation: random() * 0.9,
    distortion: random() * 0.8,
    symmetry: SYMMETRIES[Math.floor(random() * SYMMETRIES.length)],
  })
}

/**
 * "Create Something Unexpected": a whole new scene from one number: a floor, a generated composition,
 * and a light set up differently from the last time. Every choice comes from the seed.
 */
export function unexpected(seed: number): StudioDoc {
  const random = rng(seed * 31337)
  let doc = emptyDoc()
  doc = addObject(doc, 'plane')
  doc = updateObject(doc, doc.selectedId!, {
    name: 'Floor',
    position: [0, 0, 0],
    scale: [14, 14, 14],
    material: materialFromPreset('matte-black'),
  })
  doc = generate(doc, randomGen(seed))
  doc = setLighting(doc, {
    rig: LIGHT_RIGS[Math.floor(random() * LIGHT_RIGS.length)],
    intensity: 0.8 + random() * 0.7,
    azimuth: Math.round(random() * 360),
    elevation: 25 + Math.round(random() * 45),
  })
  return { ...doc, selectedId: null }
}
