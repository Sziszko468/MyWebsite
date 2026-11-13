import { describe, expect, it } from 'vitest'
import { packages, type PackageId } from '../content/packages'
import { baseComparison, type Comparison, type FeatureLevel } from '../content/shop/comparison'
import { FINDER, FINDER_QUESTION_IDS, FINDER_THRESHOLD, LEVEL_WEIGHT, askedIds, fitOf, onLadder, percent, recommend, type FinderAnswers, type FinderCatalogue } from './recommend'

const catalogue: FinderCatalogue = {
  order: packages.map((pack) => pack.id),
  improving: packages.filter((pack) => pack.needs.includes('improve')).map((pack) => pack.id),
}

const copyOf = (): Comparison => JSON.parse(JSON.stringify(baseComparison)) as Comparison
const setLevel = (comparison: Comparison, feature: string, id: PackageId, level: FeatureLevel): void => {
  const found = comparison.features.find((entry) => entry.id === feature)
  if (!found) throw new Error(`no feature ${feature}`)
  found.levels[id] = level
}
const suggest = (answers: FinderAnswers, comparison: Comparison = baseComparison, from: FinderCatalogue = catalogue) => {
  const result = recommend(comparison, from, answers)
  if (result.kind !== 'package') throw new Error('expected a package')
  return result
}

describe('the package finder', () => {
  it('asks only for features the comparison has, so the questions cannot drift from the matrix', () => {
    const known = new Set(baseComparison.features.map((feature) => feature.id))
    for (const question of FINDER) {
      expect(FINDER_QUESTION_IDS).toContain(question.id)
      for (const option of question.options) for (const id of option.asks) expect(known.has(id), `${question.id}/${option.id}: ${id}`).toBe(true)
    }
    // Every question has a way out and nothing is required but the first answer's content.
    for (const question of FINDER) expect(question.options.some((option) => option.id === 'unsure')).toBe(true)
  })

  it('suggests the smallest package that covers what was asked for', () => {
    expect(suggest({ scope: 'simple' }).primary.id).toBe('launch')
    expect(suggest({ scope: 'richer' }).primary.id).toBe('grow')
    expect(suggest({ scope: 'application' }).primary.id).toBe('build')
    // A simple website that also has to keep information needs the part behind the scenes: Launch and Grow only quote it.
    expect(suggest({ scope: 'simple', stored: 'yes' }).primary.id).toBe('build')
    expect(suggest({ scope: 'simple', stored: 'no' }).primary.id).toBe('launch')
  })

  it('computes the fit from the levels of the comparison: included 1, add-on ½, custom ¼, none 0', () => {
    expect(LEVEL_WEIGHT).toEqual({ included: 1, addon: 0.5, custom: 0.25, none: 0 })
    const features = baseComparison.features.filter((feature) => ['sections', 'components', 'database', 'quote'].includes(feature.id))
    // Launch: sections add-on (.5), components custom (.25), database custom (.25), quote included (1)
    expect(fitOf('launch', features).fit).toBeCloseTo((0.5 + 0.25 + 0.25 + 1) / 4)
    const launch = fitOf('launch', features)
    expect(launch.included.map((f) => f.id)).toEqual(['quote'])
    expect(launch.addon.map((f) => f.id)).toEqual(['sections'])
    expect(launch.custom.map((f) => f.id).sort()).toEqual(['components', 'database'])
    expect(launch.missing).toEqual([])
    expect(percent(0.8125)).toBe(81)
  })

  it('follows the administrator: edit the comparison and the suggestion changes', () => {
    const edited = copyOf()
    // Launch loses its contact section: 4 of 5 features is exactly the threshold, so it still fits…
    setLevel(edited, 'contact', 'launch', 'none')
    expect(suggest({ scope: 'simple' }, edited).primary.id).toBe('launch')
    // …and without the search settings too it fits 60 %, so the next package up is suggested.
    setLevel(edited, 'seo', 'launch', 'none')
    const result = suggest({ scope: 'simple' }, edited)
    expect(result.primary.id).toBe('grow')
    expect(result.ranking[0].id).toBe('grow')
    expect(percent(result.ranking.find((entry) => entry.id === 'launch')!.fit)).toBe(60)
    expect(FINDER_THRESHOLD).toBe(0.8)
  })

  it('ignores features the comparison no longer has, and says nothing when nothing is left to ask for', () => {
    const edited = copyOf()
    edited.features = edited.features.filter((feature) => feature.id !== 'seo')
    expect(suggest({ scope: 'simple' }, edited).asked.map((feature) => feature.id)).not.toContain('seo')
    edited.features = edited.features.filter((feature) => !['structure', 'responsive', 'navigation', 'contact', 'seo'].includes(feature.id))
    expect(recommend(edited, catalogue, { scope: 'simple' })).toEqual({ kind: 'none' })
  })

  it('says it cannot suggest when the answers ask for nothing', () => {
    expect(recommend(baseComparison, catalogue, {})).toEqual({ kind: 'none' })
    expect(recommend(baseComparison, catalogue, { scope: 'unsure', existing: 'yes', stored: 'unsure', support: 'no' })).toEqual({ kind: 'none' })
    expect(recommend(baseComparison, catalogue, { scope: 'not-an-option' })).toEqual({ kind: 'none' })
  })

  it('limits the choice to the packages for improving an existing website when the visitor has one', () => {
    expect(catalogue.improving).toEqual(['grow', 'care'])
    const result = suggest({ scope: 'simple', existing: 'yes' })
    expect(result.primary.id).toBe('grow')
    expect(result.limitedToImproving).toBe(true)
    expect(result.ranking.map((entry) => entry.id)).toEqual(['grow'])
    // "No" or "not sure" does not limit anything.
    expect(suggest({ scope: 'simple', existing: 'no' }).primary.id).toBe('launch')
    expect(suggest({ scope: 'simple', existing: 'unsure' }).limitedToImproving).toBe(false)
    // If the configuration leaves no package for improving, the whole ladder is considered instead of nothing.
    const none = suggest({ scope: 'simple', existing: 'yes' }, baseComparison, { ...catalogue, improving: [] })
    expect(none.primary.id).toBe('launch')
    expect(none.limitedToImproving).toBe(false)
  })

  it('keeps Care beside the ladder: never the build suggestion, "also worth a look" when looking after is asked for', () => {
    expect(onLadder(baseComparison, 'launch')).toBe(true)
    expect(onLadder(baseComparison, 'grow')).toBe(true)
    expect(onLadder(baseComparison, 'build')).toBe(true)
    expect(onLadder(baseComparison, 'care')).toBe(false)
    for (const scope of ['simple', 'richer', 'application']) expect(suggest({ scope }).primary.id).not.toBe('care')
    const withCare = suggest({ scope: 'simple', support: 'yes' })
    expect(withCare.primary.id).toBe('launch')
    expect(withCare.also?.id).toBe('care')
    expect(suggest({ scope: 'simple', support: 'no' }).also).toBeNull()
    // Only "look after it" asked for: the package beside the ladder is the suggestion, with nothing "also".
    const only = suggest({ support: 'yes' })
    expect(only.primary.id).toBe('care')
    expect(only.also).toBeNull()
  })

  it('leaves out a package that is not on offer', () => {
    expect(suggest({ scope: 'simple' }, baseComparison, { ...catalogue, unavailable: ['launch'] }).primary.id).toBe('grow')
    expect(suggest({ support: 'yes' }, baseComparison, { ...catalogue, unavailable: ['care'] }).primary.id).not.toBe('care')
  })

  it('shows every package considered, best first, ties in the ladder\'s order, with what each gives of what was asked for', () => {
    const result = suggest({ scope: 'richer' })
    expect(result.ranking.map((entry) => entry.id)).toEqual(['grow', 'build', 'launch'])
    expect(result.ranking[0].fit).toBe(1)
    const grow = result.primary
    expect(grow.missing).toEqual([])
    expect(grow.included.length).toBe(result.asked.length)
    // Each asked feature appears in exactly one bucket.
    for (const entry of result.ranking) expect(entry.included.length + entry.addon.length + entry.custom.length + entry.missing.length).toBe(result.asked.length)
  })

  it('reads answers: unknown questions and options are ignored, and the asked features are listed once', () => {
    expect(askedIds({ scope: 'simple', stored: 'yes' }).sort()).toEqual(['backend', 'contact', 'database', 'navigation', 'responsive', 'seo', 'structure', 'userflows'])
    expect(askedIds({ scope: 'richer', stored: 'yes' })).toEqual(expect.arrayContaining(['interactive', 'database']))
    expect(new Set(askedIds({ scope: 'application', stored: 'yes' })).size).toBe(askedIds({ scope: 'application', stored: 'yes' }).length)
    expect(askedIds({ scope: 'bogus', stored: 'bogus' } as FinderAnswers)).toEqual([])
  })
})
