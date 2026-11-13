import { describe, expect, it } from 'vitest'
import { shopText } from '../../content/shop'
import { LANGUAGES } from '../../i18n/config'
import { SIZE_BASIS, SIZE_LIMITS, SIZE_POINTS, estimateSize } from './estimate'
import { baseFullExperience } from '../../content/shop/fullExperience'

describe('the project size guide', () => {
  it('names the size from a few points: a kind of project, a system that exists, the parts chosen, and how complex it is said to be', () => {
    expect(estimateSize({ type: ['business-site'], components: ['frontend'], complexity: ['simple'] })).toEqual({ level: 'basic', points: 0 })
    expect(estimateSize({ type: ['shop-site'], components: ['multilingual', 'admin'], complexity: ['simple'] })).toEqual({ level: 'moderate', points: 3 })
    expect(estimateSize({ type: ['web-app'], stage: ['idea'], components: ['backend', 'database', 'auth'], complexity: ['medium'] })).toEqual({ level: 'advanced', points: 7 })
    expect(estimateSize({ type: ['portal'], stage: ['extension'], components: ['auth', 'admin', 'database', 'api', 'payments'], complexity: ['complex'] })).toEqual({ level: 'custom', points: 3 + 1 + 1 + 1 + 1 + 1 + 2 + 4 })
    expect(SIZE_LIMITS).toEqual({ basic: 2, moderate: 6, advanced: 11 })
  })

  it('has edges exactly where the table says, and a custom digital product is custom whatever else was chosen', () => {
    const at = (points: number) => estimateSize({ complexity: points >= 4 ? ['complex'] : ['medium'], components: Array.from({ length: Math.max(0, points - (points >= 4 ? 4 : 2)) }, (_, i) => ['backend', 'database', 'auth', 'admin', 'api', 'multilingual', 'interactive', 'mobile'][i]) })
    expect(at(2)).toEqual({ level: 'basic', points: 2 })
    expect(at(3)).toEqual({ level: 'moderate', points: 3 })
    expect(at(6)).toEqual({ level: 'moderate', points: 6 })
    expect(at(7)).toEqual({ level: 'advanced', points: 7 })
    expect(at(11)).toEqual({ level: 'advanced', points: 11 })
    expect(at(12)).toEqual({ level: 'custom', points: 12 })
    expect(estimateSize({ type: ['custom'], complexity: ['simple'] })?.level).toBe('custom')
  })

  it('shows nothing until there is something to base it on, and counts nothing for "not sure", unknown answers or repeats', () => {
    expect(estimateSize({})).toBeNull()
    expect(estimateSize({ stage: ['redevelopment'], budget: ['fixed'], timeline: ['month'] })).toBeNull()
    expect(estimateSize({ type: ['unsure'], complexity: ['unsure'] })).toBeNull()
    expect(estimateSize({ type: ['business-site'] })).toEqual({ level: 'basic', points: 0 })
    expect(estimateSize({ components: ['backend', 'backend', 'invented'], mood: ['calm'] })).toEqual({ level: 'basic', points: 1 })
    expect(estimateSize({ complexity: ['unsure'], components: ['payments'] })).toEqual({ level: 'basic', points: 2 })
  })

  it('only knows ids the shop\'s own configurator has, so the table cannot drift from the questions', () => {
    for (const [question, options] of Object.entries(SIZE_POINTS)) {
      const found = baseFullExperience.configurator.questions.find((entry) => entry.id === question)
      expect(found, question).toBeDefined()
      for (const id of Object.keys(options)) expect(found!.options.map((option) => option.id), `${question}/${id}`).toContain(id)
    }
    for (const question of SIZE_BASIS) expect(baseFullExperience.configurator.questions.map((entry) => entry.id)).toContain(question)
  })

  it('says in every language that it is a rough guide and not a quote, and has no price, time or promise in its words', () => {
    const words = shopText.experience.start.size
    for (const language of LANGUAGES) {
      expect(words.note[language].length).toBeGreaterThan(40)
      const all = [words.title, words.note, ...Object.values(words.levels).flatMap((level) => [level.name, level.text])].map((entry) => entry[language]).join(' ')
      expect(all, language).not.toMatch(/\d|€|EUR|HUF|\bFt\b|garan|guarantee|garantie|nap\b|hét\b|days?\b|weeks?\b|dagen|weken/i)
    }
    expect(Object.keys(words.levels)).toEqual(['basic', 'moderate', 'advanced', 'custom'])
  })
})
