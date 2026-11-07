import { describe, expect, it } from 'vitest'
import { LANGUAGES, type Language } from '../../i18n/config'
import { localize, type Trilingual } from '../trilingual'
import { baseComparison } from './comparison'
import { baseFullExperience, CORE_QUESTION_IDS } from './fullExperience'

/**
 * The words the Shop 3.0 content adds: the tier comparison and the FULL EXPERIENCE offer. The same rules as for every other text of
 * the shop (content/services/services.test.ts) apply: no price, no discount, no guarantee, no superlative, no testimonial and no
 * popularity claim - the packages are starting points for a quote, and FULL EXPERIENCE is a custom quote, never a package with a price.
 * (The `tiers` and `experience` interface texts are part of `shopText`, which that file already checks.)
 */

/** Every text of the two documents with where it came from, in one language. */
function texts(lang: Language): Array<{ where: string; text: string; wish?: boolean }> {
  const out: Array<{ where: string; text: string; wish?: boolean }> = []
  const add = (where: string, value: Trilingual, wish = false) => out.push({ where, text: localize(value, lang), wish })

  for (const tier of baseComparison.tiers) add(`comparison tier ${tier.package} label`, tier.label)
  for (const feature of baseComparison.features) {
    add(`comparison ${feature.id} name`, feature.name)
    add(`comparison ${feature.id} description`, feature.description)
  }

  const fx = baseFullExperience
  for (const [key, value] of Object.entries(fx.hero)) add(`full experience hero ${key}`, value)
  add('full experience teaser title', fx.teaser.title)
  add('full experience teaser text', fx.teaser.text)
  add('full experience price label', fx.priceLabel)
  for (const stage of fx.stages) {
    add(`full experience stage ${stage.id} title`, stage.title)
    add(`full experience stage ${stage.id} text`, stage.text)
  }
  for (const component of fx.components) {
    add(`full experience component ${component.id} title`, component.title)
    add(`full experience component ${component.id} text`, component.text)
  }
  for (const entry of fx.faq) {
    add(`full experience faq ${entry.id} question`, entry.question)
    add(`full experience faq ${entry.id} answer`, entry.answer)
  }
  add('full experience configurator intro', fx.configurator.intro)
  for (const question of fx.configurator.questions) {
    add(`full experience question ${question.id} title`, question.title)
    add(`full experience question ${question.id} help`, question.help)
    for (const option of question.options) {
      // What the visitor would like ("Within 1 month") is a wish they state, not a time the studio promises.
      add(`full experience question ${question.id} option ${option.id} label`, option.label, question.id === 'timeline')
      add(`full experience question ${question.id} option ${option.id} hint`, option.hint)
    }
  }
  return out
}

const FIGURE = /[€$£]\s*\d|\d\s*(€|eur\b|euro|ft\b|huf\b|forint|usd|\$|£|%)/i
const TIMED = /\d+\s*([-–]\s*\d+\s*)?(days?|weeks?|months?|nap\b|hét\b|hónap|dagen|dag\b|weken|maand)/i
const ABSOLUTE =
  /guarantee|garanci|garantie|unlimited|korlátlan|onbeperkt|most popular|legnépszerűbb|populairst|best[- ]seller|\bsale\b|discount|kedvezmény|korting|\bakció|legjobb|\bbeste\b|100\s?%|certified|tanúsít|gecertificeerd|testimonial|getuigenis|\bvélemény|\breviews\b|klantbeoordeling/i

describe('what the tier comparison and the FULL EXPERIENCE offer say', () => {
  it.each(LANGUAGES)('quotes no price, discount or percentage in %s', (lang) => {
    for (const { where, text } of texts(lang)) expect(text, `${lang}: ${where}`).not.toMatch(FIGURE)
  })

  it.each(LANGUAGES)('promises no length of time in %s (only the visitor’s own wish may name one)', (lang) => {
    for (const { where, text, wish } of texts(lang)) if (!wish) expect(text, `${lang}: ${where}`).not.toMatch(TIMED)
  })

  it.each(LANGUAGES)('makes no guarantee, no “unlimited”, no superlative, no testimonial and no popularity claim in %s', (lang) => {
    for (const { where, text } of texts(lang)) expect(text, `${lang}: ${where}`).not.toMatch(ABSOLUTE)
  })

  it('has every text in all three languages: a description, hint or help may be left out, but then in every language', () => {
    const OPTIONAL = /description|hint|help$/
    const byLanguage = LANGUAGES.map((lang) => texts(lang))
    byLanguage[0]!.forEach(({ where }, index) => {
      const filled = byLanguage.map((list) => list[index]!.text.trim() !== '')
      if (OPTIONAL.test(where)) expect(new Set(filled).size, where).toBe(1)
      else expect(filled, where).toEqual([true, true, true])
    })
  })

  it('keeps the price of FULL EXPERIENCE a label, not a number', () => {
    for (const lang of LANGUAGES) {
      const label = localize(baseFullExperience.priceLabel, lang)
      expect(label, lang).not.toMatch(/\d/)
      expect(label.trim(), lang).not.toBe('')
    }
  })

  it('uses the words of the brief for the FULL EXPERIENCE headline and its two buttons', () => {
    const { headline, primaryCta, secondaryCta } = baseFullExperience.hero
    expect(headline.en).toBe('YOUR IDEA. BUILT FROM ZERO.')
    expect(headline.hu).toBe('AZ ÖTLETEDTŐL A KÉSZ DIGITÁLIS TERMÉKIG.')
    expect(primaryCta.en).toBe('Start Your Project')
    expect(secondaryCta.en).toBe('Explore What’s Included')
  })

  it('asks the six core questions, and lets the visitor say “not sure yet” to the ones that are about money, time and scope', () => {
    const ids = baseFullExperience.configurator.questions.map((question) => question.id)
    expect(ids).toEqual([...CORE_QUESTION_IDS])
    const budget = baseFullExperience.configurator.questions.find((question) => question.id === 'budget')
    expect(budget?.required).toBe(false)
    expect(budget?.options.some((option) => option.unsure)).toBe(true)
    for (const question of baseFullExperience.configurator.questions) {
      expect(question.options.length, question.id).toBeGreaterThan(1)
      expect(new Set(question.options.map((option) => option.id)).size, question.id).toBe(question.options.length)
    }
  })

  it('shows no budget range of its own: the owner sets the ranges in the administration', () => {
    const budget = baseFullExperience.configurator.questions.find((question) => question.id === 'budget')
    for (const option of budget?.options ?? []) for (const lang of LANGUAGES) expect(localize(option.label, lang), `${lang}:${option.id}`).not.toMatch(/\d/)
  })

  it('gives the comparison the four packages of the shop, each with a label in every language', () => {
    expect(baseComparison.tiers.map((tier) => tier.package)).toEqual(['launch', 'grow', 'build', 'care'])
    for (const tier of baseComparison.tiers) for (const lang of LANGUAGES) expect(localize(tier.label, lang).trim(), `${lang}:${tier.package}`).not.toBe('')
  })
})
