import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../../i18n/config'
import { artifactText } from './artifacts/artifactText'
import { eggText } from './easter/eggText'
import { chromaticText } from './experiments/chromatic/chromaticControls'
import { liquidText } from './experiments/liquid/liquidControls'
import { MATTER_NAMES } from './experiments/liquid/liquidMaterials'
import { particleText } from './experiments/particles/particleControls'
import { spaceText } from './experiments/space/spaceControls'
import { typeText } from './experiments/type/typeControls'
import { pageText } from './page/pageText'

/** Every { hu, en, nl } triple inside a structure, with where it is. */
function triples(value: unknown, path: string, found: Array<[string, Record<string, string>]> = []) {
  if (typeof value !== 'object' || value === null) return found
  const record = value as Record<string, unknown>
  if (typeof record.hu === 'string' && typeof record.en === 'string' && typeof record.nl === 'string') {
    found.push([path, record as Record<string, string>])
    return found
  }
  for (const [key, child] of Object.entries(record)) triples(child, `${path}.${key}`, found)
  return found
}

const TABLES: Record<string, unknown> = {
  pageText,
  eggText,
  artifactText,
  typeText,
  liquidText,
  MATTER_NAMES,
  particleText,
  spaceText,
  chromaticText,
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('the Lab’s words, in every table', () => {
  for (const [name, table] of Object.entries(TABLES)) {
    it(`${name}: every text is there in every language, none empty, none a leftover`, () => {
      const all = triples(table, name)
      expect(all.length, name).toBeGreaterThan(3)
      for (const [path, text] of all) {
        for (const lang of LANGUAGES) {
          expect(text[lang].trim(), `${path}.${lang}`).not.toBe('')
          expect(text[lang], `${path}.${lang}`).not.toMatch(/TODO|lorem|undefined|\[object/i)
        }
      }
    })

    it(`${name}: the three languages ask for the same values (a {name} is in all of them or none)`, () => {
      for (const [path, text] of triples(table, name)) {
        expect(placeholders(text.hu), `${path}: hu vs en`).toEqual(placeholders(text.en))
        expect(placeholders(text.nl), `${path}: nl vs en`).toEqual(placeholders(text.en))
      }
    })
  }

  it('speaks the brief’s words: the headline and its supporting line in Hungarian, English and Dutch', () => {
    expect(pageText.hero.headline.en).toBe('ENTER THE EXPERIMENTAL SIDE')
    expect(pageText.hero.headline.hu).toBe('LÉPJ BE A KÍSÉRLETI DIGITÁLIS VILÁGBA')
    expect(pageText.hero.lead.en).toBe('Five interactive environments. Endless possibilities. One digital playground.')
    expect(pageText.hero.lead.hu).toBe('Öt interaktív élmény. Végtelen lehetőség. Egy digitális játszótér.')
    expect(pageText.hero.lead.nl).toBe('Vijf interactieve omgevingen. Eindeloze mogelijkheden. Één digitale speeltuin.')
    expect(pageText.closing.title.en).toBe('THE ONLY LIMIT IS WHAT YOU CAN IMAGINE.')
    expect(pageText.closing.cta.en.toUpperCase()).toBe('START EXPERIMENTING')
  })
})
