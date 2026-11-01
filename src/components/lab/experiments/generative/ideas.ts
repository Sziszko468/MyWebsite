import {
  ACCESSORY_TERMS,
  ACTION_TERMS,
  BUILD_TERMS,
  COLOUR_TERMS,
  CONCEPT_TERMS,
  MATERIAL_TERMS,
  MOOD_TERMS,
  ROLE_TERMS,
  SIZE_TERMS,
  VIBE_TERMS,
  type ActionId,
  type ColourId,
  type Lang,
  type RoleId,
  type VibeWord,
} from './lexicon'
import { STYLES, type AccessoryId, type Build, type ConceptId, type MaterialId, type Mood, type Size, type StyleId } from './spec'

export { EXAMPLES, type Example } from './examples'

/** A small seeded random number generator (mulberry32): the same seed gives the same sequence. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Random = () => number
const pick = <T>(list: readonly T[], random: Random): T => list[Math.floor(random() * list.length) % list.length]

const FOODS: readonly ConceptId[] = ['banana', 'croissant', 'pizza', 'donut', 'burger', 'egg', 'avocado', 'cheese']
const ANIMALS: readonly ConceptId[] = ['frog', 'dinosaur', 'cat', 'duck', 'penguin', 'shark', 'cactus']
const THINGS: readonly ConceptId[] = ['fridge', 'coffeemachine', 'toaster', 'washer', 'tv', 'teapot', 'sneaker']
const BEINGS: readonly ConceptId[] = ['alien', 'ghost', 'snowman', 'pumpkin', 'person']
const VEHICLES: readonly ConceptId[] = ['sportscar', 'racecar', 'spaceship', 'rocket', 'ufo', 'bicycle']
const HEADS: readonly ConceptId[] = ['robot', 'person', 'alien', 'snowman', 'ghost']
const ANY_ACCESSORY: readonly AccessoryId[] = [
  'sunglasses',
  'crown',
  'tophat',
  'headphones',
  'cape',
  'bowtie',
  'tie',
  'chain',
  'medal',
  'helmet',
  'jetpack',
  'mustache',
  'wings',
  'scarf',
  'partyhat',
  'wizardhat',
  'chefhat',
]
const LUXURY_ACCESSORY: readonly AccessoryId[] = ['sunglasses', 'crown', 'chain', 'tophat', 'medal', 'bowtie']
const FUTURE_ACCESSORY: readonly AccessoryId[] = ['sunglasses', 'helmet', 'jetpack', 'headphones', 'wings']
const MOODS: readonly Mood[] = ['happy', 'sad', 'angry', 'surprised', 'sleepy', 'cool', 'scared', 'proud']
const ROLES: readonly RoleId[] = ['manager', 'astronaut', 'king', 'wizard', 'chef', 'boxer', 'dj', 'superhero', 'rockstar']
const ACTIONS: readonly ActionId[] = ['dance', 'fly', 'run', 'flex']

type Adjective =
  | { kind: 'mood'; id: Mood }
  | { kind: 'build'; id: Exclude<Build, 'normal'> }
  | { kind: 'size'; id: Exclude<Size, 'normal'> }
  | { kind: 'material'; id: Exclude<MaterialId, 'natural'> }
  | { kind: 'colour'; id: ColourId }
  | { kind: 'vibe'; id: VibeWord }

export type IdeaShape = 'ride' | 'head' | 'made' | 'into' | 'wear' | 'do' | 'conquer' | 'job'

/** An idea before it is put into words: the same plan can be said in each language. */
export interface IdeaPlan {
  style: StyleId
  shape: IdeaShape
  main: ConceptId
  /** The vehicle it drives or becomes (ride, into), the head it wears (head) or what it is made from (made: `main` is then the result). */
  other?: ConceptId
  accessory?: AccessoryId
  role?: RoleId
  action?: ActionId
  /** Describing words for the main thing, at most two. */
  adjectives: Adjective[]
  /** Describing words for the vehicle it becomes (into). */
  otherAdjectives?: Adjective[]
}

const adj = <K extends Adjective['kind']>(kind: K, id: Extract<Adjective, { kind: K }>['id']) => ({ kind, id }) as Adjective

const sizeOrBuild = (random: Random): Adjective =>
  random() < 0.5
    ? adj('size', pick(['tiny', 'giant'] as const, random))
    : adj('build', pick(['muscular', 'round', 'thin'] as const, random))

const mood = (random: Random): Adjective => adj('mood', pick(MOODS, random))

/** One idea in a style. The shapes are fixed and the words are drawn, so every result is odd but readable. */
export function planIdea(style: StyleId, random: Random): IdeaPlan {
  const base = { style, adjectives: [] as Adjective[] }
  switch (style) {
    case 'absurd': {
      const shape = pick(['wear', 'head', 'into', 'do'] as const, random)
      if (shape === 'head') return { ...base, shape, main: pick(HEADS, random), other: pick(THINGS, random), adjectives: [mood(random)] }
      if (shape === 'into')
        return {
          ...base,
          shape,
          main: pick(THINGS, random),
          other: pick(VEHICLES, random),
          adjectives: [mood(random)],
          otherAdjectives: [adj('vibe', pick(['futuristic', 'luxury'] as const, random))],
        }
      if (shape === 'do')
        return { ...base, shape, main: pick(THINGS, random), action: pick(ACTIONS, random), adjectives: [mood(random)] }
      return { ...base, shape, main: pick(THINGS, random), accessory: pick(ANY_ACCESSORY, random), adjectives: [mood(random)] }
    }
    case 'creatures': {
      const shape = pick(['head', 'wear', 'ride', 'job'] as const, random)
      const main = pick(BEINGS, random)
      if (shape === 'head')
        return { ...base, shape, main, other: pick([...ANIMALS, ...FOODS, ...THINGS], random), adjectives: [sizeOrBuild(random)] }
      if (shape === 'ride')
        return { ...base, shape, main, other: pick(VEHICLES, random), adjectives: [mood(random), sizeOrBuild(random)] }
      if (shape === 'job') return { ...base, shape, main, role: pick(ROLES, random), adjectives: [mood(random)] }
      return { ...base, shape, main, accessory: pick(ANY_ACCESSORY, random), adjectives: [sizeOrBuild(random), mood(random)] }
    }
    case 'machines': {
      const shape = pick(['into', 'made', 'head'] as const, random)
      if (shape === 'made')
        return {
          ...base,
          shape,
          main: pick(VEHICLES, random),
          other: pick(THINGS, random),
          adjectives: [],
          otherAdjectives: [adj('vibe', pick(['futuristic', 'luxury'] as const, random))],
        }
      if (shape === 'head') return { ...base, shape, main: 'robot', other: pick(THINGS, random), adjectives: [mood(random)] }
      return {
        ...base,
        shape,
        main: pick(THINGS, random),
        other: pick(VEHICLES, random),
        adjectives: [],
        otherAdjectives: [adj('vibe', 'futuristic')],
      }
    }
    case 'luxury': {
      const shape = pick(['wear', 'made', 'job', 'wear'] as const, random)
      if (shape === 'made')
        return {
          ...base,
          shape,
          main: pick(VEHICLES, random),
          other: pick(THINGS, random),
          adjectives: [],
          otherAdjectives: [adj('vibe', 'luxury')],
        }
      if (shape === 'job')
        return { ...base, shape, main: pick([...ANIMALS, ...FOODS], random), role: pick(['king', 'rockstar', 'manager'] as const, random), adjectives: [adj('vibe', 'luxury')] }
      return {
        ...base,
        shape,
        main: pick([...ANIMALS, ...FOODS], random),
        accessory: pick(LUXURY_ACCESSORY, random),
        adjectives: [adj('material', 'gold'), adj('vibe', 'luxury')],
      }
    }
    case 'food': {
      const shape = pick(['conquer', 'wear', 'ride', 'job'] as const, random)
      const main = pick(FOODS, random)
      if (shape === 'conquer') return { ...base, shape, main, adjectives: [adj('mood', 'angry')] }
      if (shape === 'ride') return { ...base, shape, main, other: pick(VEHICLES, random), adjectives: [adj('build', 'muscular'), adj('mood', 'angry')] }
      if (shape === 'job') return { ...base, shape, main, role: pick(['boxer', 'manager', 'wizard', 'chef'] as const, random), adjectives: [adj('mood', 'angry')] }
      return { ...base, shape, main, accessory: pick(['gloves', 'helmet', 'cape', 'sunglasses'] as const, random), adjectives: [adj('mood', 'angry')] }
    }
    case 'animals': {
      const shape = pick(['wear', 'ride', 'do', 'wear'] as const, random)
      const main = pick(ANIMALS, random)
      const future = adj('vibe', 'futuristic')
      const second: Adjective = random() < 0.5 ? adj('material', pick(['chrome', 'neon', 'glass'] as const, random)) : mood(random)
      if (shape === 'ride') return { ...base, shape, main, other: pick(['spaceship', 'rocket', 'ufo', 'racecar'] as const, random), adjectives: [future, second] }
      if (shape === 'do') return { ...base, shape, main, action: pick(ACTIONS, random), adjectives: [future, second] }
      return { ...base, shape, main, accessory: pick(FUTURE_ACCESSORY, random), adjectives: [future, second] }
    }
    case 'inventions': {
      const shape = pick(['made', 'into', 'head', 'wear'] as const, random)
      if (shape === 'made')
        return {
          ...base,
          shape,
          main: pick(VEHICLES, random),
          other: pick(THINGS, random),
          adjectives: [],
          otherAdjectives: [adj('size', pick(['tiny', 'giant'] as const, random))],
        }
      if (shape === 'into')
        return { ...base, shape, main: pick(THINGS, random), other: pick(VEHICLES, random), adjectives: [sizeOrBuild(random)], otherAdjectives: [] }
      if (shape === 'head') return { ...base, shape, main: pick(ANIMALS, random), other: pick(THINGS, random), adjectives: [sizeOrBuild(random)] }
      return {
        ...base,
        shape,
        main: pick(THINGS, random),
        accessory: pick(['wings', 'jetpack', 'headphones', 'cape'] as const, random),
        adjectives: [sizeOrBuild(random)],
      }
    }
    case 'internet': {
      const shape = pick(['job', 'do', 'wear', 'ride'] as const, random)
      const main = pick([...ANIMALS, ...FOODS], random)
      if (shape === 'job') return { ...base, shape, main, role: pick(['dj', 'rockstar', 'superhero', 'manager'] as const, random), adjectives: [adj('mood', 'cool')] }
      if (shape === 'do') return { ...base, shape, main, action: pick(['dance', 'flex'] as const, random), adjectives: [adj('build', 'muscular')] }
      if (shape === 'ride') return { ...base, shape, main, other: pick(VEHICLES, random), adjectives: [adj('mood', 'cool'), adj('build', 'muscular')] }
      return { ...base, shape, main, accessory: pick(['sunglasses', 'headphones', 'chain', 'cape'] as const, random), adjectives: [adj('mood', 'cool')] }
    }
  }
}

/** The describing word, in a language; Dutch needs to know whether the noun after it is a "het" word. */
function describe(a: Adjective, lang: Lang, het: boolean): string {
  const term = (() => {
    switch (a.kind) {
      case 'mood':
        return MOOD_TERMS[a.id]
      case 'build':
        return BUILD_TERMS[a.id]!
      case 'size':
        return SIZE_TERMS[a.id]!
      case 'material':
        return MATERIAL_TERMS[a.id]!
      case 'colour':
        return COLOUR_TERMS[a.id]
      case 'vibe':
        return VIBE_TERMS[a.id]
    }
  })()
  if (lang === 'nl') return het ? term.names.nl : term.nlE
  return term.names[lang]
}

const startsWithVowel = (word: string) => /^[aeiou]/i.test(word) && !/^ufo/i.test(word)

function noun(id: ConceptId, lang: Lang): string {
  return CONCEPT_TERMS[id].names[lang]
}

/** "a muscular banana", "an angry croissant", "een gespierde banaan", "egy izmos banán". */
function phrase(id: ConceptId, adjectives: readonly Adjective[], lang: Lang, extra: string[] = []): string {
  const het = !!CONCEPT_TERMS[id].nlHet
  const words = [...extra, ...adjectives.map((a) => describe(a, lang, het)), noun(id, lang)]
  const first = words[0]
  if (lang === 'hu') return `egy ${words.join(' ')}`
  if (lang === 'nl') return `een ${words.join(' ')}`
  return `${startsWithVowel(first) ? 'an' : 'a'} ${words.join(' ')}`
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The accessory as it is said after "wearing" / "met" / "rajta". */
function accessoryPhrase(id: AccessoryId, lang: Lang): string {
  const term = ACCESSORY_TERMS[id]
  const name = term.names[lang]
  if (lang === 'hu' || term.plural) return name
  if (lang === 'nl') return `een ${name}`
  return `${startsWithVowel(name) ? 'an' : 'a'} ${name}`
}

/** An idea put into words. Every word comes from the vocabulary the reader uses, so the page understands what it says. */
export function renderIdea(plan: IdeaPlan, lang: Lang): string {
  const { main, other, accessory, role, action } = plan
  const het = !!CONCEPT_TERMS[main].nlHet
  const doing = action ? ACTION_TERMS[action].ing[lang] : null
  const ing = doing ? (lang === 'nl' && het ? doing.replace(/e$/, '') : doing) : null
  const subject = phrase(main, plan.adjectives, lang, ing ? [ing] : [])
  const otherAdjectives = plan.otherAdjectives ?? []
  let text: string
  switch (plan.shape) {
    case 'ride': {
      const vehicle = other!
      text =
        lang === 'hu'
          ? `${subject}, aki ${CONCEPT_TERMS[vehicle].huAcc} vezet`
          : lang === 'nl'
            ? `${subject} die ${phrase(vehicle, [], lang)} bestuurt`
            : `${subject} driving ${phrase(vehicle, [], lang)}`
      break
    }
    case 'head':
      text =
        lang === 'hu'
          ? `${subject} ${noun(other!, lang)} fejjel`
          : lang === 'nl'
            ? `${subject} met ${phrase(other!, [], lang)} als hoofd`
            : `${subject} with ${phrase(other!, [], lang)} for a head`
      break
    case 'made': {
      const kit = phrase(main, otherAdjectives, lang)
      text =
        lang === 'hu'
          ? `${kit}, amely ${noun(other!, lang)} alapanyagból készült`
          : lang === 'nl'
            ? `${kit} gemaakt van ${phrase(other!, [], lang)}`
            : `${kit} made from ${phrase(other!, [], lang)}`
      break
    }
    case 'into': {
      const target = phrase(other!, otherAdjectives, lang)
      text =
        lang === 'hu'
          ? `${subject}, amiből ${target} lett`
          : lang === 'nl'
            ? `${subject} omgebouwd tot ${target}`
            : `${subject} transformed into ${target}`
      break
    }
    case 'wear': {
      const item = accessoryPhrase(accessory!, lang)
      text = lang === 'hu' ? `${subject}, rajta ${item}` : lang === 'nl' ? `${subject} met ${item}` : `${subject} wearing ${item}`
      break
    }
    case 'conquer':
      text =
        lang === 'hu'
          ? `${subject}, aki meg akarja hódítani a világot`
          : lang === 'nl'
            ? `${subject} die de wereld wil veroveren`
            : `${subject} trying to conquer the world`
      break
    case 'job': {
      const as = ROLE_TERMS[role!].as[lang]
      text =
        lang === 'hu'
          ? `${subject}, aki ${as} dolgozik`
          : lang === 'nl'
            ? `${subject} die als ${as} werkt`
            : `${subject} working as ${as}`
      break
    }
    case 'do':
      text = subject
      break
  }
  return `${capital(text)}.`
}

/** A new idea, in a style (or a drawn one), in a language. The same seed gives the same idea. */
export function randomIdea(style: StyleId | null, lang: Lang, seed: number): { text: string; plan: IdeaPlan } {
  const random = createRandom(seed)
  const chosen = style ?? pick(STYLES, random)
  const plan = planIdea(chosen, random)
  return { text: renderIdea(plan, lang), plan }
}
