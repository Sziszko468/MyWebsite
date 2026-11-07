import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CORE_QUESTIONS, finalizeComparison, finalizeOffer, move, newFeature, newId, newOption, newQuestion, newTitled, removeAt, replaceAt, type ComparisonDoc, type OfferDoc } from './shop'

// The documents the backend is seeded with (`npm run catalog:seed-export`): what the administrator's editors receive on the first day.
// Read as a file, not imported from the website's content, because the administration takes nothing from the website but its shared parts
// (isolation.test.ts).
const seed = JSON.parse(readFileSync(new URL('../../../server/seed/shop.seed.json', import.meta.url), 'utf8')) as { comparison: ComparisonDoc; fullExperience: OfferDoc }
const offer = (): OfferDoc => structuredClone(seed.fullExperience)
const comparison = (): ComparisonDoc => structuredClone(seed.comparison)

describe('the shop editors\' ids', () => {
  it('makes a readable id from an English title, unique among the taken ones', () => {
    expect(newId('Web application', [], 'x')).toBe('web-application')
    expect(newId('Web application', ['web-application'], 'x')).toBe('web-application-2')
    expect(newId('Áramlás & Ütem!', [], 'x')).toBe('aramlas-utem')
    expect(newId('', [], 'new-option')).toBe('new-option')
    expect(newId('x'.repeat(80), [], 'x').length).toBeLessThanOrEqual(40)
  })

  it('gives a brand-new item an id from its English text when saved, and never changes an id that was already chosen', () => {
    const doc = offer()
    const question = newQuestion(doc.configurator.questions.map((q) => q.id))
    question.title.en = 'Which platforms?'
    question.options[0].label.en = 'iOS'
    question.options[1].label.en = 'Android'
    doc.configurator.questions.push(question)
    doc.stages.push({ ...newTitled(doc.stages.map((s) => s.id), 'stage'), title: { hu: 'a', en: 'Hand-over', nl: 'c' } })
    const saved = finalizeOffer(doc)
    expect(saved.configurator.questions.at(-1)!.id).toBe('which-platforms')
    expect(saved.configurator.questions.at(-1)!.options.map((o) => o.id)).toEqual(['ios', 'android'])
    expect(saved.stages.at(-1)!.id).toBe('hand-over')
    // The ids the seed chose are untouched, including the core questions' (`stage` is one, and the editor's placeholders look nothing like it).
    expect(saved.configurator.questions.slice(0, 6).map((q) => q.id)).toEqual([...CORE_QUESTIONS])
    expect(saved.stages.slice(0, -1).map((s) => s.id)).toEqual(doc.stages.slice(0, -1).map((s) => s.id))
    expect(saved.configurator.questions[1].options.map((o) => o.id)).toEqual(doc.configurator.questions[1].options.map((o) => o.id))
  })

  it('leaves a new item with no English text on its placeholder, and two new ones apart', () => {
    const doc = comparison()
    doc.features.push(newFeature(doc.features.map((f) => f.id), doc.tiers.map((t) => t.package)))
    doc.features.push(newFeature(doc.features.map((f) => f.id), doc.tiers.map((t) => t.package)))
    expect(doc.features.at(-1)!.id).not.toBe(doc.features.at(-2)!.id)
    expect(finalizeComparison(doc).features.slice(-2).map((f) => f.id)).toEqual(doc.features.slice(-2).map((f) => f.id))
    doc.features.at(-1)!.name.en = 'A new thing'
    expect(finalizeComparison(doc).features.at(-1)!.id).toBe('a-new-thing')
    expect(newOption(['new-option']).id).toBe('new-option-2')
  })

  it('moves, replaces and removes without changing the list it was given', () => {
    const list = ['a', 'b', 'c']
    expect(move(list, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(move(list, 2, 0)).toEqual(['c', 'a', 'b'])
    expect(move(list, 1, 5)).toEqual(list)
    expect(replaceAt(list, 1, 'x')).toEqual(['a', 'x', 'c'])
    expect(removeAt(list, 0)).toEqual(['b', 'c'])
    expect(list).toEqual(['a', 'b', 'c'])
  })
})
