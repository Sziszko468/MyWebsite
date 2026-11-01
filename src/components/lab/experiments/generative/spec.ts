/**
 * What a creation is, as plain data. A written description is read into an `ObjectSpec` (what the
 * object is) and a `Look` (how it is dressed: material, colour, scale, light, background, camera);
 * the composer builds three.js objects from the spec and a seed, and the look is applied to those
 * objects without rebuilding them. Everything here is a small closed vocabulary, so any value that
 * comes from outside (a saved work, a file, a URL) can be checked against it.
 */

/** The longest description the page reads. Anything beyond it is cut, so a pasted essay cannot stall the page. */
export const MAX_PROMPT = 240

export const STYLES = ['absurd', 'creatures', 'machines', 'luxury', 'food', 'animals', 'inventions', 'internet'] as const
export type StyleId = (typeof STYLES)[number]

export const MOODS = ['happy', 'sad', 'angry', 'surprised', 'sleepy', 'cool', 'scared', 'proud'] as const
export type Mood = (typeof MOODS)[number]

export const POSES = ['stand', 'dance', 'flex', 'drive', 'work', 'fly', 'run', 'sit', 'box'] as const
export type Pose = (typeof POSES)[number]

export const BUILDS = ['thin', 'normal', 'muscular', 'round'] as const
export type Build = (typeof BUILDS)[number]

export const SIZES = ['tiny', 'normal', 'giant'] as const
export type Size = (typeof SIZES)[number]

export const MATERIALS = ['natural', 'gold', 'chrome', 'glass', 'matte', 'neon', 'candy', 'wood'] as const
export type MaterialId = (typeof MATERIALS)[number]

export const ACCESSORIES = [
  'sunglasses',
  'glasses',
  'tophat',
  'crown',
  'helmet',
  'cap',
  'partyhat',
  'chefhat',
  'wizardhat',
  'tie',
  'bowtie',
  'gloves',
  'cape',
  'scarf',
  'headphones',
  'backpack',
  'wings',
  'mustache',
  'chain',
  'medal',
  'jetpack',
] as const
export type AccessoryId = (typeof ACCESSORIES)[number]

export const PROPS = [
  'coffee',
  'globe',
  'trophy',
  'money',
  'flag',
  'balloon',
  'laptop',
  'briefcase',
  'guitar',
  'flower',
  'cake',
] as const
export type PropId = (typeof PROPS)[number]

export const LIGHTS = ['studio', 'dramatic', 'neon', 'sunset', 'moon'] as const
export type LightId = (typeof LIGHTS)[number]

export const BACKGROUNDS = ['carbon', 'red', 'paper', 'sunset', 'grid', 'night'] as const
export type BackgroundId = (typeof BACKGROUNDS)[number]

export const CAMERAS = ['three-quarter', 'front', 'side', 'top', 'low', 'close'] as const
export type CameraAngle = (typeof CAMERAS)[number]

/** The things a description can be about, by the kind of thing they are. */
export type Category = 'food' | 'animal' | 'plant' | 'machine' | 'object' | 'being' | 'vehicle'

export const CONCEPTS = [
  // food
  'banana',
  'croissant',
  'pizza',
  'donut',
  'burger',
  'egg',
  'avocado',
  'cheese',
  // animals and plants
  'frog',
  'dinosaur',
  'cat',
  'duck',
  'penguin',
  'shark',
  'cactus',
  // machines and objects
  'robot',
  'fridge',
  'coffeemachine',
  'toaster',
  'washer',
  'tv',
  'teapot',
  'sneaker',
  // beings
  'alien',
  'ghost',
  'snowman',
  'pumpkin',
  'person',
  // vehicles
  'sportscar',
  'racecar',
  'spaceship',
  'rocket',
  'ufo',
  'bicycle',
] as const
export type ConceptId = (typeof CONCEPTS)[number]

export interface ObjectSpec {
  /** The thing the creation is about. */
  main: ConceptId
  /** Another thing used as its head ("a robot with a coffee machine for a head"). */
  headOf: ConceptId | null
  /** A vehicle the main thing is driving or riding. */
  vehicle: ConceptId | null
  /** A vehicle the main thing has been turned into ("a fridge transformed into a sports car"). */
  kit: ConceptId | null
  /** Smaller things standing beside it. */
  companions: ConceptId[]
  accessories: AccessoryId[]
  props: PropId[]
  mood: Mood
  pose: Pose
  build: Build
  /** The humour style it belongs to, if any: it changes small decorative choices. */
  vibe: StyleId | null
}

export interface Look {
  material: MaterialId
  /** `#rrggbb`, or null for the object's own colours. */
  colour: string | null
  /** 0.4 to 2.2. */
  scale: number
  /** Degrees, 0 to 359. */
  rotation: number
  spin: boolean
  lighting: LightId
  background: BackgroundId
  camera: CameraAngle
}

export const SCALE_RANGE = { min: 0.4, max: 2.2 } as const

export const DEFAULT_LOOK: Readonly<Look> = {
  material: 'natural',
  colour: null,
  scale: 1,
  rotation: 0,
  spin: true,
  lighting: 'studio',
  background: 'carbon',
  camera: 'three-quarter',
}

export function defaultSpec(main: ConceptId): ObjectSpec {
  return {
    main,
    headOf: null,
    vehicle: null,
    kit: null,
    companions: [],
    accessories: [],
    props: [],
    mood: 'happy',
    pose: 'stand',
    build: 'normal',
    vibe: null,
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null =>
  typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : null

const many = <T extends string>(list: readonly T[], value: unknown, max: number): T[] => {
  if (!Array.isArray(value)) return []
  const found: T[] = []
  for (const item of value) {
    const id = oneOf(list, item)
    if (id && !found.includes(id)) found.push(id)
    if (found.length >= max) break
  }
  return found
}

/** Accepts only a spec; anything that is not one gives null. Unknown fields are dropped, unknown ids refused. */
export function sanitizeSpec(raw: unknown): ObjectSpec | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const main = oneOf(CONCEPTS, r.main)
  if (!main) return null
  const spec = defaultSpec(main)
  spec.headOf = oneOf(CONCEPTS, r.headOf)
  spec.vehicle = oneOf(CONCEPTS, r.vehicle)
  spec.kit = oneOf(CONCEPTS, r.kit)
  spec.companions = many(CONCEPTS, r.companions, 2)
  spec.accessories = many(ACCESSORIES, r.accessories, 8)
  spec.props = many(PROPS, r.props, 3)
  spec.mood = oneOf(MOODS, r.mood) ?? spec.mood
  spec.pose = oneOf(POSES, r.pose) ?? spec.pose
  spec.build = oneOf(BUILDS, r.build) ?? spec.build
  spec.vibe = oneOf(STYLES, r.vibe)
  return spec
}

/** Same for a look: numbers are clamped, ids checked, a colour must be `#rrggbb`. */
export function sanitizeLook(raw: unknown): Look {
  const look: Look = { ...DEFAULT_LOOK }
  if (typeof raw !== 'object' || raw === null) return look
  const r = raw as Record<string, unknown>
  look.material = oneOf(MATERIALS, r.material) ?? look.material
  look.colour = typeof r.colour === 'string' && HEX.test(r.colour) ? r.colour.toLowerCase() : null
  const scale = typeof r.scale === 'number' && Number.isFinite(r.scale) ? r.scale : look.scale
  look.scale = Math.min(SCALE_RANGE.max, Math.max(SCALE_RANGE.min, scale))
  const rotation = typeof r.rotation === 'number' && Number.isFinite(r.rotation) ? r.rotation : 0
  look.rotation = ((Math.round(rotation) % 360) + 360) % 360
  look.spin = typeof r.spin === 'boolean' ? r.spin : look.spin
  look.lighting = oneOf(LIGHTS, r.lighting) ?? look.lighting
  look.background = oneOf(BACKGROUNDS, r.background) ?? look.background
  look.camera = oneOf(CAMERAS, r.camera) ?? look.camera
  return look
}

export const sameLook = (a: Look, b: Look): boolean =>
  a.material === b.material &&
  a.colour === b.colour &&
  a.scale === b.scale &&
  a.rotation === b.rotation &&
  a.spin === b.spin &&
  a.lighting === b.lighting &&
  a.background === b.background &&
  a.camera === b.camera

/** Which kind of thing each concept is. Vehicles can carry a character or be built onto another thing. */
export const CATEGORY: Record<ConceptId, Category> = {
  banana: 'food',
  croissant: 'food',
  pizza: 'food',
  donut: 'food',
  burger: 'food',
  egg: 'food',
  avocado: 'food',
  cheese: 'food',
  frog: 'animal',
  dinosaur: 'animal',
  cat: 'animal',
  duck: 'animal',
  penguin: 'animal',
  shark: 'animal',
  cactus: 'plant',
  robot: 'machine',
  fridge: 'machine',
  coffeemachine: 'machine',
  toaster: 'machine',
  washer: 'machine',
  tv: 'machine',
  teapot: 'object',
  sneaker: 'object',
  alien: 'being',
  ghost: 'being',
  snowman: 'being',
  pumpkin: 'being',
  person: 'being',
  sportscar: 'vehicle',
  racecar: 'vehicle',
  spaceship: 'vehicle',
  rocket: 'vehicle',
  ufo: 'vehicle',
  bicycle: 'vehicle',
}

export const isVehicle = (id: ConceptId): boolean => CATEGORY[id] === 'vehicle'
