import { describe, expect, it } from 'vitest'
import { createRandom, planIdea, randomIdea, renderIdea, type IdeaPlan } from './ideas'
import { interpret } from './interpret'
import { ACTION_POSE, LANGS, ROLE_TERMS } from './lexicon'
import { STYLES } from './spec'

/** What reading an idea back must give, for the plan it was written from. */
function expectReadBack(plan: IdeaPlan, text: string, lang: string) {
  const result = interpret(text)
  const label = `${lang} ${plan.style}/${plan.shape}: "${text}" -> ${JSON.stringify(result.spec)}`
  expect(result.recognised, label).toBe(true)
  switch (plan.shape) {
    case 'ride':
      expect(result.spec.main, label).toBe(plan.main)
      expect(result.spec.vehicle, label).toBe(plan.other)
      break
    case 'head':
      expect(result.spec.main, label).toBe(plan.main)
      expect(result.spec.headOf, label).toBe(plan.other)
      break
    case 'made':
      expect(result.spec.kit, label).toBe(plan.main)
      expect(result.spec.main, label).toBe(plan.other)
      break
    case 'into':
      expect(result.spec.main, label).toBe(plan.main)
      expect(result.spec.kit, label).toBe(plan.other)
      break
    case 'wear':
      expect(result.spec.main, label).toBe(plan.main)
      expect(result.spec.accessories, label).toContain(plan.accessory)
      break
    case 'do':
      expect(result.spec.main, label).toBe(plan.main)
      expect(result.spec.pose, label).toBe(ACTION_POSE[plan.action!])
      break
    case 'conquer':
      expect(result.spec.main, label).toBe(plan.main)
      expect(result.spec.props, label).toContain('globe')
      break
    case 'job':
      expect(result.spec.main, label).toBe(plan.main)
      for (const item of ROLE_TERMS[plan.role!].accessories) expect(result.spec.accessories, label).toContain(item)
      break
  }
  const mood = plan.adjectives.find((a) => a.kind === 'mood')
  if (mood && plan.shape !== 'job') expect(result.spec.mood, label).toBe(mood.id)
  expect(result.unknown, label).toEqual([])
}

describe('random ideas', () => {
  for (const style of STYLES) {
    it(`${style}: every idea reads back as the thing it says, in every language`, { timeout: 60_000 }, () => {
      for (let seed = 1; seed <= 120; seed++) {
        const plan = planIdea(style, createRandom(seed * 7919))
        for (const lang of LANGS) expectReadBack(plan, renderIdea(plan, lang), lang)
      }
    })

    it(`${style}: is varied, and the same seed gives the same idea`, () => {
      const texts = new Set<string>()
      for (let seed = 1; seed <= 60; seed++) texts.add(randomIdea(style, 'en', seed).text)
      expect(texts.size).toBeGreaterThan(30)
      expect(randomIdea(style, 'hu', 99)).toEqual(randomIdea(style, 'hu', 99))
    })
  }

  it('draws a style when none is given, and every text ends with a full stop and starts with a capital', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 200; seed++) {
      for (const lang of LANGS) {
        const { text, plan } = randomIdea(null, lang, seed)
        seen.add(plan.style)
        expect(text).toMatch(/^\p{Lu}.*\.$/u)
        expect(text.length).toBeLessThan(120)
      }
    }
    expect(seen.size).toBe(STYLES.length)
  })

  it('says an before a vowel and a before a consonant, and a before UFO', () => {
    const plan = (main: 'ufo' | 'egg' | 'frog') => ({ style: 'absurd' as const, shape: 'do' as const, main, action: 'dance' as const, adjectives: [] })
    expect(renderIdea(plan('ufo'), 'en')).toBe('A dancing UFO.')
    expect(renderIdea(plan('egg'), 'en')).toBe('A dancing egg.')
    expect(renderIdea({ ...plan('egg'), shape: 'conquer', action: undefined }, 'en')).toBe('An egg trying to conquer the world.')
    expect(renderIdea({ ...plan('frog'), shape: 'conquer', action: undefined, adjectives: [{ kind: 'mood', id: 'angry' }] }, 'en')).toBe(
      'An angry frog trying to conquer the world.',
    )
  })

  it('writes Dutch describing words with and without an -e as the noun needs', () => {
    expect(renderIdea({ style: 'food', shape: 'conquer', main: 'egg', adjectives: [{ kind: 'mood', id: 'angry' }] }, 'nl')).toBe(
      'Een boos ei die de wereld wil veroveren.',
    )
    expect(
      renderIdea({ style: 'food', shape: 'conquer', main: 'frog', adjectives: [{ kind: 'mood', id: 'angry' }] }, 'nl'),
    ).toBe('Een boze kikker die de wereld wil veroveren.')
  })
})
