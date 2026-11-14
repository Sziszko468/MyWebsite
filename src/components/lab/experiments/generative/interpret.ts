import {
  ACCESSORY_TERMS,
  ACTION_POSE,
  ACTION_TERMS,
  BUILD_TERMS,
  COLOUR_TERMS,
  CONCEPT_TERMS,
  CONQUER_WORDS,
  HEAD_WORDS,
  LANGS,
  MADE_FROM,
  MATERIAL_TERMS,
  MOOD_TERMS,
  normalise,
  PROP_TERMS,
  ROLE_TERMS,
  SIZE_TERMS,
  STOP_WORDS,
  TURNED_INTO,
  VIBE_TERMS,
  type ActionId,
  type ColourId,
  type Lang,
  type RoleId,
  type VibeWord,
  type Words,
} from './lexicon'
import {
  CATEGORY,
  DEFAULT_LOOK,
  defaultSpec,
  isVehicle,
  MAX_PROMPT,
  type AccessoryId,
  type Build,
  type ConceptId,
  type Look,
  type MaterialId,
  type Mood,
  type ObjectSpec,
  type Pose,
  type PropId,
  type Size,
} from './spec'

export { MAX_PROMPT }

type Kind =
  | 'concept'
  | 'accessory'
  | 'prop'
  | 'role'
  | 'mood'
  | 'build'
  | 'size'
  | 'material'
  | 'colour'
  | 'vibe'
  | 'action'
  | 'madeFrom'
  | 'turnedInto'
  | 'head'
  | 'conquer'

interface Pattern {
  kind: Kind
  id: string
  words: string[]
  lang: Lang
  exact: boolean
  score: number
}

interface Hit {
  kind: Kind
  id: string
  start: number
  end: number
  score: number
  /** The word as written, for showing back. */
  word: string
  /** The Hungarian "-ból" ending: the thing something was made from. */
  source: boolean
}

function patternsOf(kind: Kind, id: string, words: Words): Pattern[] {
  const found: Pattern[] = []
  for (const lang of LANGS) {
    for (const raw of words[lang]) {
      const exact = raw.startsWith('=')
      const text = normalise(exact ? raw.slice(1) : raw)
      const parts = text.split(' ').filter(Boolean)
      if (parts.length === 0) continue
      found.push({ kind, id, words: parts, lang, exact, score: text.replace(/ /g, '').length + parts.length })
    }
  }
  return found
}

const PATTERNS: Pattern[] = (() => {
  const all: Pattern[] = []
  const add = (kind: Kind, table: Record<string, { words: Words; nlE?: string } | null>) => {
    for (const [id, term] of Object.entries(table)) {
      if (!term) continue
      all.push(...patternsOf(kind, id, term.words))
      // Dutch describing words take an -e before a "de" word, which is a different stem ("boos", "boze").
      if (term.nlE) all.push(...patternsOf(kind, id, { hu: [], en: [], nl: [term.nlE] }))
    }
  }
  add('concept', CONCEPT_TERMS)
  add('accessory', ACCESSORY_TERMS)
  add('prop', PROP_TERMS)
  add('role', ROLE_TERMS)
  add('mood', MOOD_TERMS)
  add('build', BUILD_TERMS)
  add('size', SIZE_TERMS)
  add('material', MATERIAL_TERMS)
  add('colour', COLOUR_TERMS)
  add('vibe', VIBE_TERMS)
  add('action', ACTION_TERMS)
  all.push(...patternsOf('madeFrom', 'madeFrom', MADE_FROM))
  all.push(...patternsOf('turnedInto', 'turnedInto', TURNED_INTO))
  all.push(...patternsOf('head', 'head', HEAD_WORDS))
  all.push(...patternsOf('conquer', 'conquer', CONQUER_WORDS))
  return all
})()

/** Whether one written word is one stem: the same word, or the stem with an ending (plural, case, suffix). */
export function matchWord(token: string, stem: string, lang: Lang, exact: boolean): boolean {
  if (token === stem) return true
  if (exact || !token.startsWith(stem)) return lang !== 'hu' && !exact && plural(token, stem)
  const tail = token.length - stem.length
  if (lang === 'hu') return stem.length >= 5 ? tail <= 8 : stem.length >= 3 ? tail <= 4 : false
  return stem.length >= 4 ? tail <= 3 : plural(token, stem)
}

function plural(token: string, stem: string): boolean {
  return stem.length >= 2 && stem.length < 4 && (token === `${stem}s` || token === `${stem}es` || token === `${stem}en`)
}

/** Splits into lower-case words without accents. Digits and symbols separate words. */
export function tokenise(text: string): string[] {
  return normalise(text.slice(0, MAX_PROMPT))
    .split(/[^\p{L}]+/u)
    .filter(Boolean)
}

function findHits(tokens: string[], original: string[]): Hit[] {
  const candidates: Hit[] = []
  for (let i = 0; i < tokens.length; i++) {
    for (const pattern of PATTERNS) {
      const length = pattern.words.length
      if (i + length > tokens.length) continue
      let ok = true
      for (let k = 0; k < length && ok; k++) ok = matchWord(tokens[i + k], pattern.words[k], pattern.lang, pattern.exact)
      if (!ok) continue
      const last = tokens[i + length - 1]
      candidates.push({
        kind: pattern.kind,
        id: pattern.id,
        start: i,
        end: i + length,
        // Prefer the longer stem, and a match with no leftover ending over one with a long ending.
        score: pattern.score * 10 - Math.max(0, last.length - pattern.words[length - 1].length),
        word: original.slice(i, i + length).join(' '),
        source: length === 1 && /bol$/.test(last) && !/bol$/.test(pattern.words[0]),
      })
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.start - b.start)
  const taken = new Array<boolean>(tokens.length).fill(false)
  const chosen: Hit[] = []
  for (const hit of candidates) {
    let free = true
    for (let k = hit.start; k < hit.end; k++) if (taken[k]) free = false
    if (!free) continue
    for (let k = hit.start; k < hit.end; k++) taken[k] = true
    chosen.push(hit)
  }
  return chosen.sort((a, b) => a.start - b.start)
}

export type UnderstoodRole =
  | 'subject'
  | 'head'
  | 'vehicle'
  | 'kit'
  | 'companion'
  | 'accessory'
  | 'prop'
  | 'mood'
  | 'pose'
  | 'build'
  | 'size'
  | 'material'
  | 'colour'
  | 'style'

export interface Understood {
  role: UnderstoodRole
  id: string
  /** What the visitor wrote that this came from. */
  word: string
}

export interface Interpretation {
  text: string
  spec: ObjectSpec
  look: Look
  understood: Understood[]
  /** Words that were not understood (and are not small linking words). */
  unknown: string[]
  /** False when not one thing was recognised: the object is then a made-up creature and the page says so. */
  recognised: boolean
  /** Things that were understood but could not all fit (a fourth thing in a description). */
  ignored: string[]
}

/** A small number that is the same for the same text, in every browser. */
export function seedFromText(text: string): number {
  let h = 2166136261
  for (const char of normalise(text.trim())) {
    h ^= char.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 1_000_000
}

const MYSTERY: readonly ConceptId[] = ['alien', 'ghost', 'pumpkin', 'snowman', 'egg', 'cactus', 'person']
const MOOD_FALLBACK: readonly Mood[] = ['surprised', 'happy', 'scared', 'sleepy', 'cool']

const hex = (id: ColourId) => COLOUR_TERMS[id].hex

/** Reads a description into what to build. It never throws and never returns an empty object. */
export function interpret(rawText: string): Interpretation {
  const text = rawText.slice(0, MAX_PROMPT)
  const tokens = tokenise(text)
  // The words as written (accents kept), for showing back.
  const written = text.split(/[^\p{L}]+/u).filter(Boolean)
  const shown = written.length === tokens.length ? written : tokens
  const hits = findHits(tokens, shown)
  const understood: Understood[] = []
  const ignored: string[] = []
  const note = (role: UnderstoodRole, id: string, word: string) => {
    if (!understood.some((item) => item.role === role && item.id === id)) understood.push({ role, id, word })
  }

  const concepts = hits.filter((hit) => hit.kind === 'concept')
  const vehicles = concepts.filter((hit) => isVehicle(hit.id as ConceptId))
  const bodies = concepts.filter((hit) => !isVehicle(hit.id as ConceptId))
  const madeFrom = hits.find((hit) => hit.kind === 'madeFrom')
  const turnedInto = hits.find((hit) => hit.kind === 'turnedInto')
  const headWord = hits.find((hit) => hit.kind === 'head')
  const fusion = !!(madeFrom || turnedInto || concepts.some((hit) => hit.source))

  let main: Hit | null = null
  let headOf: Hit | null = null
  let vehicle: Hit | null = null
  let kit: Hit | null = null
  const rest: Hit[] = []

  if (bodies.length >= 2 && headWord) {
    const byDistance = [...bodies].sort(
      (a, b) =>
        Math.min(Math.abs(a.start - headWord.start), Math.abs(a.end - headWord.end)) -
        Math.min(Math.abs(b.start - headWord.start), Math.abs(b.end - headWord.end)),
    )
    headOf = byDistance[0]
    main = bodies.find((hit) => hit !== headOf) ?? null
    rest.push(...bodies.filter((hit) => hit !== headOf && hit !== main), ...vehicles)
  } else if (bodies.length >= 1 && vehicles.length >= 1 && fusion) {
    main = bodies.find((hit) => hit.source) ?? bodies[0]
    kit = vehicles[0]
    rest.push(...bodies.filter((hit) => hit !== main), ...vehicles.slice(1))
  } else if (bodies.length >= 1 && vehicles.length >= 1) {
    main = bodies[0]
    vehicle = vehicles[0]
    rest.push(...bodies.slice(1), ...vehicles.slice(1))
  } else if (bodies.length >= 2 && fusion) {
    // One thing turned into another: the result is the second, or the first when it says what it was made from.
    const target = madeFrom && !turnedInto ? bodies[0] : bodies[bodies.length - 1]
    main = target
    rest.push(...bodies.filter((hit) => hit !== target))
  } else if (bodies.length >= 1) {
    main = bodies[0]
    rest.push(...bodies.slice(1))
  } else if (vehicles.length >= 2 && fusion) {
    const target = madeFrom && !turnedInto ? vehicles[1] : vehicles[0]
    main = target
    kit = vehicles.find((hit) => hit !== target) ?? null
    rest.push(...vehicles.filter((hit) => hit !== target && hit !== kit))
  } else if (vehicles.length >= 1) {
    main = vehicles[0]
    rest.push(...vehicles.slice(1))
  }

  const recognisedAny = main !== null
  const seed = seedFromText(text)
  const mainId: ConceptId = main ? (main.id as ConceptId) : MYSTERY[seed % MYSTERY.length]
  const spec = defaultSpec(mainId)

  if (main) note('subject', main.id, main.word)
  if (headOf) {
    spec.headOf = headOf.id as ConceptId
    note('head', headOf.id, headOf.word)
  }
  if (vehicle) {
    spec.vehicle = vehicle.id as ConceptId
    note('vehicle', vehicle.id, vehicle.word)
  }
  if (kit) {
    spec.kit = kit.id as ConceptId
    note('kit', kit.id, kit.word)
  }
  for (const hit of rest) {
    if (spec.companions.length < 2 && hit.id !== mainId) {
      spec.companions.push(hit.id as ConceptId)
      note('companion', hit.id, hit.word)
    } else ignored.push(hit.word)
  }

  const accessories: AccessoryId[] = []
  const props: PropId[] = []
  const addAccessory = (id: AccessoryId, word: string, show = true) => {
    if (accessories.includes(id)) return
    accessories.push(id)
    if (show) note('accessory', id, word)
  }
  const addProp = (id: PropId, word: string, show = true) => {
    if (props.includes(id)) return
    props.push(id)
    if (show) note('prop', id, word)
  }
  for (const hit of hits) {
    if (hit.kind === 'accessory') addAccessory(hit.id as AccessoryId, hit.word)
    if (hit.kind === 'prop') addProp(hit.id as PropId, hit.word)
  }

  // A job brings its clothes, its tools and its way of standing.
  let rolePose: Pose | null = null
  let roleMood: Mood | null = null
  for (const hit of hits.filter((item) => item.kind === 'role')) {
    const role = ROLE_TERMS[hit.id as RoleId]
    for (const id of role.accessories) addAccessory(id, hit.word, false)
    for (const id of role.props) addProp(id, hit.word, false)
    rolePose ??= role.pose
    roleMood ??= role.mood ?? null
    understood.push({ role: 'style', id: `role:${hit.id}`, word: hit.word })
  }

  const conquer = hits.find((hit) => hit.kind === 'conquer')
  if (conquer) {
    addProp('globe', conquer.word, false)
    addProp('flag', conquer.word, false)
  }

  const moods = hits.filter((hit) => hit.kind === 'mood')
  const moodHit = moods[moods.length - 1]
  spec.mood = moodHit
    ? (moodHit.id as Mood)
    : (roleMood ?? (conquer ? 'proud' : accessories.includes('sunglasses') ? 'cool' : spec.mood))
  if (moodHit) note('mood', moodHit.id, moodHit.word)
  else if (!recognisedAny) spec.mood = MOOD_FALLBACK[seed % MOOD_FALLBACK.length]

  const buildHit = hits.find((hit) => hit.kind === 'build')
  if (buildHit) {
    spec.build = buildHit.id as Build
    note('build', buildHit.id, buildHit.word)
  }

  const actionHit = hits.find((hit) => hit.kind === 'action' && hit.id !== 'drive') ?? null
  const driveHit = hits.find((hit) => hit.kind === 'action' && hit.id === 'drive') ?? null
  if (spec.vehicle) {
    spec.pose = 'drive'
    note('pose', 'drive', driveHit?.word ?? spec.vehicle)
  } else if (actionHit) {
    spec.pose = ACTION_POSE[actionHit.id as ActionId]
    note('pose', spec.pose, actionHit.word)
  } else if (rolePose) {
    spec.pose = rolePose
  } else if (accessories.includes('gloves')) {
    spec.pose = 'box'
  } else if (conquer) {
    spec.pose = 'flex'
  } else if (driveHit && isVehicle(mainId)) {
    spec.pose = 'stand'
  }

  const sizeHit = hits.find((hit) => hit.kind === 'size')
  const size: Size = sizeHit ? (sizeHit.id as Size) : 'normal'
  if (sizeHit) note('size', sizeHit.id, sizeHit.word)

  const vibes = hits.filter((hit) => hit.kind === 'vibe').map((hit) => hit.id as VibeWord)
  for (const hit of hits.filter((item) => item.kind === 'vibe')) note('style', hit.id, hit.word)
  if (vibes.includes('luxury')) {
    spec.vibe = 'luxury'
    if (!accessories.includes('crown')) addAccessory('chain', '', false)
  }
  if (vibes.includes('corporate')) {
    addAccessory('tie', '', false)
    addProp('briefcase', '', false)
  }
  if (vibes.includes('futuristic') && CATEGORY[mainId] === 'animal') spec.vibe = 'animals'
  if (!spec.vibe && CATEGORY[mainId] === 'food' && spec.mood === 'angry') spec.vibe = 'food'

  spec.accessories = accessories.slice(0, 6)
  spec.props = props.slice(0, 3)
  for (const dropped of accessories.slice(6)) ignored.push(dropped)

  // How it is dressed.
  const look: Look = { ...DEFAULT_LOOK }
  const materialHit = hits.find((hit) => hit.kind === 'material')
  const colourHit = hits.find((hit) => hit.kind === 'colour')
  if (materialHit) {
    look.material = materialHit.id as MaterialId
    note('material', materialHit.id, materialHit.word)
  } else if (vibes.includes('luxury')) look.material = 'gold'
  else if (vibes.includes('futuristic')) look.material = 'chrome'
  if (colourHit) {
    look.colour = hex(colourHit.id as ColourId)
    note('colour', colourHit.id, colourHit.word)
  }
  look.scale = size === 'tiny' ? 0.6 : size === 'giant' ? 1.7 : 1
  if (vibes.includes('futuristic')) look.lighting = 'neon'
  else if (vibes.includes('luxury') || spec.mood === 'angry') look.lighting = 'dramatic'
  else if (spec.mood === 'sad' || spec.mood === 'sleepy') look.lighting = 'moon'
  look.background =
    look.lighting === 'neon' || look.lighting === 'moon' ? 'night' : look.lighting === 'dramatic' ? 'red' : 'carbon'

  const used = new Set<number>()
  for (const hit of hits) for (let k = hit.start; k < hit.end; k++) used.add(k)
  const unknown = tokens.filter((token, index) => !used.has(index) && !STOP_WORDS.has(token) && token.length > 1)

  return { text, spec, look, understood, unknown: unknown.slice(0, 8), recognised: recognisedAny, ignored }
}
