import { describe, expect, it } from 'vitest'
import { interpret, matchWord, MAX_PROMPT, seedFromText, tokenise } from './interpret'
import {
  ACCESSORY_TERMS,
  ACTION_POSE,
  ACTION_TERMS,
  BUILD_TERMS,
  COLOUR_TERMS,
  CONCEPT_TERMS,
  LANGS,
  MATERIAL_TERMS,
  MOOD_TERMS,
  normalise,
  PROP_TERMS,
  ROLE_TERMS,
  SIZE_TERMS,
  type ActionId,
  type Lang,
} from './lexicon'
import { ACCESSORIES, BUILDS, CONCEPTS, MATERIALS, MOODS, PROPS, SIZES } from './spec'

const SIZE_IDS = SIZES.filter((id) => id !== 'normal')
const BUILD_IDS = BUILDS.filter((id) => id !== 'normal')
import { EXAMPLES } from './ideas'

/** What each of the brief's eight examples must be understood as, in every language. */
const EXPECTED = [
  { main: 'banana', vehicle: 'racecar', build: 'muscular' },
  { main: 'robot', headOf: 'coffeemachine', mood: 'sad' },
  { main: 'sneaker', kit: 'spaceship', material: 'gold' },
  { main: 'croissant', mood: 'angry', props: ['globe', 'flag'] },
  { main: 'frog', material: 'gold', accessories: ['sunglasses'] },
  { main: 'dinosaur', accessories: ['tie'], size: 0.6, pose: 'work' },
  { main: 'fridge', kit: 'sportscar' },
  { main: 'cactus', pose: 'dance', accessories: ['gloves'] },
] as const

describe('reading a description', () => {
  it('has the eight examples of the brief in every language', () => {
    expect(EXAMPLES).toHaveLength(8)
    for (const example of EXAMPLES) for (const lang of LANGS) expect(example[lang].length).toBeGreaterThan(10)
  })

  for (const lang of LANGS) {
    describe(`in ${lang}`, () => {
      it.each(EXPECTED.map((expected, index) => [index, expected] as const))('example %i is understood', (index, e) => {
        const text = EXAMPLES[index][lang]
        const result = interpret(text)
        const label = `${text} -> ${JSON.stringify(result.spec)} ${JSON.stringify(result.understood)}`
        expect(result.recognised, label).toBe(true)
        expect(result.spec.main, label).toBe(e.main)
        if ('vehicle' in e) expect(result.spec.vehicle, label).toBe(e.vehicle)
        if ('kit' in e) expect(result.spec.kit, label).toBe(e.kit)
        if ('headOf' in e) expect(result.spec.headOf, label).toBe(e.headOf)
        if ('mood' in e) expect(result.spec.mood, label).toBe(e.mood)
        if ('build' in e) expect(result.spec.build, label).toBe(e.build)
        if ('pose' in e) expect(result.spec.pose, label).toBe(e.pose)
        if ('material' in e) expect(result.look.material, label).toBe(e.material)
        if ('size' in e) expect(result.look.scale, label).toBe(e.size)
        if ('props' in e) for (const prop of e.props) expect(result.spec.props, label).toContain(prop)
        if ('accessories' in e) for (const item of e.accessories) expect(result.spec.accessories, label).toContain(item)
      })
    })
  }

  it('reads every concept, accessory, prop and mood by each of its own names, in each language', () => {
    for (const lang of LANGS) {
      for (const id of CONCEPTS) {
        const result = interpret(CONCEPT_TERMS[id].names[lang])
        const found = [result.spec.main, result.spec.kit, result.spec.vehicle].includes(id)
        expect(found, `${lang} ${id} "${CONCEPT_TERMS[id].names[lang]}" -> ${result.spec.main}`).toBe(true)
      }
      for (const id of ACCESSORIES) {
        const result = interpret(`${CONCEPT_TERMS.cat.names[lang]} ${ACCESSORY_TERMS[id].names[lang]}`)
        expect(result.spec.accessories, `${lang} ${id}`).toContain(id)
      }
      for (const id of PROPS) {
        const result = interpret(`${CONCEPT_TERMS.cat.names[lang]} ${PROP_TERMS[id].names[lang]}`)
        expect(result.spec.props, `${lang} ${id}`).toContain(id)
      }
      for (const id of SIZE_IDS) {
        const term = SIZE_TERMS[id]
        if (term) expect(interpret(`${term.names[lang]} ${CONCEPT_TERMS.cat.names[lang]}`).look.scale, `${lang} ${id}`).not.toBe(1)
      }
      for (const id of BUILD_IDS) {
        const term = BUILD_TERMS[id]
        if (term) expect(interpret(`${term.names[lang]} ${CONCEPT_TERMS.cat.names[lang]}`).spec.build, `${lang} ${id}`).toBe(id)
      }
      for (const id of MATERIALS) {
        const term = MATERIAL_TERMS[id]
        if (term) expect(interpret(`${term.names[lang]} ${CONCEPT_TERMS.cat.names[lang]}`).look.material, `${lang} ${id}`).toBe(id)
      }
      for (const [id, term] of Object.entries(COLOUR_TERMS)) {
        expect(interpret(`${term.names[lang]} ${CONCEPT_TERMS.cat.names[lang]}`).look.colour, `${lang} ${id}`).toBe(term.hex)
      }
      for (const [id, term] of Object.entries(ROLE_TERMS)) {
        const result = interpret(`${CONCEPT_TERMS.cat.names[lang]} ${term.names[lang]}`)
        for (const item of term.accessories) expect(result.spec.accessories, `${lang} ${id}`).toContain(item)
      }
      for (const [id, term] of Object.entries(ACTION_TERMS)) {
        if (id === 'drive') continue
        expect(interpret(`${term.ing[lang]} ${CONCEPT_TERMS.cat.names[lang]}`).spec.pose, `${lang} ${id}`).toBe(ACTION_POSE[id as ActionId])
      }
      for (const id of MOODS) {
        const result = interpret(`${MOOD_TERMS[id].names[lang]} ${CONCEPT_TERMS.cat.names[lang]}`)
        expect(result.spec.mood, `${lang} ${id}`).toBe(id)
      }
    }
  })

  it('understands endings: Hungarian cases and plurals in English and Dutch', () => {
    expect(interpret('bananokkal').spec.main).toBe('banana')
    expect(interpret('banánnal').spec.main).toBe('banana')
    expect(interpret('Bananas').spec.main).toBe('banana')
    expect(interpret('twee kikkers').spec.main).toBe('frog')
    expect(interpret('hűtőszekrényből').spec.main).toBe('fridge')
    expect(interpret('KAKTUSZ').spec.main).toBe('cactus')
  })

  it('takes the accent off, so writing without accents works', () => {
    expect(interpret('szomoru robot kavefozo fejjel').spec.headOf).toBe('coffeemachine')
    expect(normalise('Árvíztűrő tükörfúrógép')).toBe('arvizturo tukorfurogep')
  })

  it('does not take a short word from inside a longer one', () => {
    expect(interpret('carpet').recognised).toBe(false)
    expect(interpret('category').recognised).toBe(false)
    expect(interpret('catalog').recognised).toBe(false)
    expect(interpret('a basement').recognised).toBe(false)
    expect(interpret('cheeseburger').spec.main).toBe('burger')
  })

  it('tells a made-from from a transformed-into, whatever the order', () => {
    expect(interpret('a sneaker turned into a spaceship').spec).toMatchObject({ main: 'sneaker', kit: 'spaceship' })
    expect(interpret('a spaceship made from a sneaker').spec).toMatchObject({ main: 'sneaker', kit: 'spaceship' })
    expect(interpret('an angry cat in a rocket').spec).toMatchObject({ main: 'cat', vehicle: 'rocket', pose: 'drive' })
    expect(interpret('a ufo').spec).toMatchObject({ main: 'ufo', vehicle: null, kit: null })
  })

  it('keeps the thing a head is put on apart from the head', () => {
    const a = interpret('a robot with a frog for a head').spec
    expect(a).toMatchObject({ main: 'robot', headOf: 'frog' })
    const b = interpret('a frog with a robot head').spec
    expect(b).toMatchObject({ main: 'frog', headOf: 'robot' })
  })

  it('lets a job bring its own tools, and an explicit word win over it', () => {
    const boss = interpret('a penguin manager').spec
    expect(boss.accessories).toEqual(expect.arrayContaining(['tie', 'glasses']))
    expect(boss.props).toContain('briefcase')
    expect(boss.pose).toBe('work')
    expect(interpret('a dancing manager penguin').spec.pose).toBe('dance')
    expect(interpret('a king duck').spec.accessories).toContain('crown')
  })

  it('makes luxury gold and futuristic chrome unless a material is said', () => {
    expect(interpret('a luxury cat').look.material).toBe('gold')
    expect(interpret('a luxury glass cat').look.material).toBe('glass')
    expect(interpret('a futuristic cat').look).toMatchObject({ material: 'chrome', lighting: 'neon' })
    expect(interpret('a red cat').look).toMatchObject({ colour: '#e0202c', material: 'natural' })
  })

  it('says it did not understand, and still makes something', () => {
    const result = interpret('qwerty zxcvb')
    expect(result.recognised).toBe(false)
    expect(result.unknown).toEqual(['qwerty', 'zxcvb'])
    expect(CONCEPTS).toContain(result.spec.main)
    expect(interpret('').recognised).toBe(false)
    expect(interpret('   ').spec.main).toBeDefined()
  })

  it('lists words it did not understand next to those it did', () => {
    const result = interpret('a sad robot with sprockets')
    expect(result.recognised).toBe(true)
    expect(result.unknown).toEqual(['sprockets'])
  })

  it('puts a third and fourth thing beside the first, up to two, and says what it left out', () => {
    const result = interpret('a cat, a frog, a duck and a penguin')
    expect(result.spec.main).toBe('cat')
    expect(result.spec.companions).toEqual(['frog', 'duck'])
    expect(result.ignored).toEqual(['penguin'])
  })

  it('gives the same answer for the same words, and a different seed for different words', () => {
    expect(interpret('a happy frog')).toEqual(interpret('a happy frog'))
    expect(seedFromText('a happy frog')).toBe(seedFromText('A  happy frog'.replace('  ', ' ')))
    expect(seedFromText('a happy frog')).not.toBe(seedFromText('a sad frog'))
  })

  it('cuts a pasted essay, and never hangs on one', () => {
    const essay = 'robot '.repeat(5000)
    const started = Date.now()
    const result = interpret(essay)
    expect(Date.now() - started).toBeLessThan(500)
    expect(result.text.length).toBeLessThanOrEqual(MAX_PROMPT)
    expect(tokenise(essay).length).toBeLessThanOrEqual(MAX_PROMPT)
  })

  it('survives odd input: symbols, markup, huge unicode and control characters', () => {
    for (const text of ['<script>alert(1)</script>', '🦖🍌🚀', '\u0000\u0001robot', 'ROBOT\n\nFROG', '😀'.repeat(300), '...']) {
      const result = interpret(text)
      expect(CONCEPTS).toContain(result.spec.main)
    }
  })

  it('matches stems the way the rules say', () => {
    const lang: Lang = 'hu'
    expect(matchWord('banant', 'banan', lang, false)).toBe(true)
    expect(matchWord('bananfa', 'banan', lang, false)).toBe(true)
    expect(matchWord('fejjel', 'fej', lang, false)).toBe(true)
    expect(matchWord('salat', 'sal', lang, true)).toBe(false)
    expect(matchWord('cats', 'cat', 'en', false)).toBe(true)
    expect(matchWord('carpet', 'car', 'en', false)).toBe(false)
  })
})
