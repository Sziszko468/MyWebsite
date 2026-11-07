import { describe, expect, it } from 'vitest'
import { basePackages, type PackageId } from '../content/packages'
import { baseComparison, FEATURE_LEVELS } from '../content/shop/comparison'
import { addsOver, comparePair, groupFeatures, includedBy, introducedAt, levelCounts, levelOf, nextTier } from './tiers'

const ORDER = basePackages.map((pack) => pack.id)
const feature = (id: string) => baseComparison.features.find((candidate) => candidate.id === id)!
const ids = (list: readonly { id: string }[]) => list.map((item) => item.id)

describe('the website\'s own tier comparison', () => {
  it('has one tier per package, in display order, with a label in every language', () => {
    expect(baseComparison.tiers.map((tier) => tier.package)).toEqual(ORDER)
    for (const tier of baseComparison.tiers) for (const lang of ['hu', 'en', 'nl'] as const) expect(tier.label[lang].trim(), `${tier.package} ${lang}`).not.toBe('')
  })

  it('makes Launch -> Grow -> Build a ladder and lets Care stand beside it', () => {
    const builds = Object.fromEntries(baseComparison.tiers.map((tier) => [tier.package, tier.buildsOn]))
    expect(builds).toEqual({ launch: null, grow: 'launch', build: 'grow', care: null })
    expect(nextTier(baseComparison, 'launch')).toBe('grow')
    expect(nextTier(baseComparison, 'build')).toBeNull()
  })

  it('names every feature in every language, with unique ids and a level for every package', () => {
    const seen = new Set<string>()
    for (const row of baseComparison.features) {
      expect(seen.has(row.id), row.id).toBe(false)
      seen.add(row.id)
      for (const lang of ['hu', 'en', 'nl'] as const) expect(row.name[lang].trim(), `${row.id} ${lang}`).not.toBe('')
      for (const id of ORDER) expect(FEATURE_LEVELS, `${row.id} ${id}`).toContain(levelOf(row, id))
    }
    expect(baseComparison.features.length).toBeGreaterThanOrEqual(15)
  })

  it('uses all four levels, so the legend is never about something the page does not show', () => {
    const used = new Set(baseComparison.features.flatMap((row) => ORDER.map((id) => levelOf(row, id))))
    expect([...used].sort()).toEqual([...FEATURE_LEVELS].sort())
  })

  it('is built only from what the packages already say: an included cell of a package that has the matching line, an add-on cell only where the package lists the add-on', () => {
    // The add-ons a feature stands for, where it is an optional extra of a package (content/packages.ts `extras`).
    const addonOf: Record<string, string> = { sections: 'pages', interactive: 'motion', languages: 'languages', performance: 'performance', maintenance: 'care', fixes: 'care' }
    for (const row of baseComparison.features) {
      for (const pack of basePackages) {
        if (levelOf(row, pack.id) === 'addon') expect(pack.extras, `${row.id} on ${pack.id} is an add-on the package does not list`).toContain(addonOf[row.id])
      }
    }
    // A "custom service" is something a package can be asked for beyond its list: every package except Care lists custom functionality.
    for (const row of baseComparison.features) {
      for (const pack of basePackages) {
        if (levelOf(row, pack.id) === 'custom' && pack.id !== 'care') expect(pack.extras, `${row.id} on ${pack.id}`).toContain('custom')
      }
    }
  })
})

describe('the progression', () => {
  it('finds what every package includes, and says nothing false about it', () => {
    const groups = groupFeatures(baseComparison, ORDER)
    expect(groups[0].kind).toBe('every')
    expect(ids(groups[0].features)).toEqual(['quote'])
    for (const row of groups[0].features) for (const id of ORDER) expect(levelOf(row, id)).toBe('included')
  })

  it('groups each feature where it is first included, in display order, and the rest as add-on or custom only', () => {
    const groups = groupFeatures(baseComparison, ORDER)
    const introduced = groups.filter((group) => group.kind === 'introduced').map((group) => (group.kind === 'introduced' ? group.tier : null))
    expect(introduced).toEqual(['launch', 'grow', 'build', 'care'])
    const at = (tier: PackageId) => ids(groups.find((group) => group.kind === 'introduced' && group.tier === tier)!.features)
    expect(at('grow')).toEqual(expect.arrayContaining(['components', 'interactive', 'integrations', 'sections']))
    expect(at('build')).toEqual(expect.arrayContaining(['userflows', 'backend', 'database', 'architecture']))
    expect(at('care')).toEqual(expect.arrayContaining(['maintenance', 'fixes', 'performance']))
    // The same feature is never in two groups.
    const all = groups.flatMap((group) => ids(group.features))
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(baseComparison.features.length)
    expect(groups.at(-1)!.kind).toBe('other')
    expect(ids(groups.at(-1)!.features)).toEqual(['languages', 'newfeatures'])
  })

  it('introduces a feature at the first package that includes it, whatever order the packages are shown in', () => {
    expect(introducedAt(feature('backend'), ORDER)).toBe('build')
    expect(introducedAt(feature('backend'), ['care', 'build', 'grow', 'launch'])).toBe('build')
    expect(introducedAt(feature('maintenance'), ['care', 'launch'])).toBe('care')
    expect(introducedAt(feature('newfeatures'), ORDER)).toBeNull()
  })

  it('says what each step up adds, in the matrix\'s own rows', () => {
    expect(ids(addsOver(baseComparison, 'launch'))).toEqual(ids(includedBy(baseComparison, 'launch')))
    const grow = ids(addsOver(baseComparison, 'grow'))
    expect(grow).toEqual(expect.arrayContaining(['sections', 'components', 'interactive', 'integrations']))
    expect(grow).not.toContain('responsive') // Launch already has it
    const build = ids(addsOver(baseComparison, 'build'))
    expect(build).toEqual(expect.arrayContaining(['userflows', 'backend', 'database', 'architecture']))
    expect(build).not.toContain('sections')
    // Care builds on nothing: what it adds is everything it includes.
    expect(ids(addsOver(baseComparison, 'care'))).toEqual(ids(includedBy(baseComparison, 'care')))
  })

  it('gives every higher tier something to say for itself', () => {
    for (const id of ['grow', 'build'] as const) expect(addsOver(baseComparison, id).length, id).toBeGreaterThan(2)
  })

  it('compares two packages row by row and marks the differences', () => {
    const rows = comparePair(baseComparison, 'launch', 'grow')
    expect(rows).toHaveLength(baseComparison.features.length)
    expect(rows.find((row) => row.feature.id === 'responsive')).toMatchObject({ left: 'included', right: 'included', differs: false })
    expect(rows.find((row) => row.feature.id === 'components')).toMatchObject({ left: 'custom', right: 'included', differs: true })
    expect(comparePair(baseComparison, 'build', 'build').every((row) => !row.differs)).toBe(true)
  })

  it('counts levels for a summary', () => {
    const counts = levelCounts(baseComparison, 'build')
    expect(counts.included + counts.addon + counts.custom + counts.none).toBe(baseComparison.features.length)
    expect(counts.included).toBe(includedBy(baseComparison, 'build').length)
  })
})
