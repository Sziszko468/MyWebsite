import type { PackageId } from '../content/packages'
import type { Comparison, ComparisonFeature, FeatureLevel } from '../content/shop/comparison'
import { levelOf, tierOf } from './tiers'

/**
 * The package finder (PROMPT 20): "Not sure which package is right for you?".
 *
 * Rule-based and transparent. No AI, no hidden weights, nothing is sent and nothing is chosen for the visitor.
 *
 *  - Each answer **asks for features of the comparison** (by the ids of the comparison's rows, for example `contact`, `database`).
 *  - A package's **fit** is how much of what was asked for the comparison, **as the administrator configured it**, gives it:
 *    a feature it includes counts 1, an optional add-on ½, a custom service ¼ (it exists, but is quoted separately), and one
 *    it does not offer 0. Edit the comparison and the recommendation follows; nothing here knows what a package contains.
 *  - The suggestion is **the smallest package on the ladder that fits at least 80 %** of what was asked for; if none does, the one
 *    that fits most. "I already have a website or application" limits the choice to the packages that are for improving an existing
 *    one. Packages that stand beside the ladder (Care) are never the build suggestion; asking to have the result looked after
 *    adds them as "also worth a look".
 *
 * Everything is a plain function of the answers and the data, so the screen and the tests apply the very same rules.
 */

export const FINDER_THRESHOLD = 0.8

/** How much of a feature a level gives a package. */
export const LEVEL_WEIGHT: Record<FeatureLevel, number> = { included: 1, addon: 0.5, custom: 0.25, none: 0 }

export const FINDER_QUESTION_IDS = ['scope', 'existing', 'stored', 'support'] as const
export type FinderQuestionId = (typeof FINDER_QUESTION_IDS)[number]

export interface FinderOption {
  id: string
  /** The comparison's feature ids this answer asks for. */
  asks: readonly string[]
}
export interface FinderQuestion {
  id: FinderQuestionId
  options: readonly FinderOption[]
}

const PRESENCE = ['structure', 'responsive', 'navigation', 'contact', 'seo'] as const

/** The questions, with what each answer asks for. The words are in content/shop/finder.ts (and editable in the administration's texts). */
export const FINDER: readonly FinderQuestion[] = [
  {
    id: 'scope',
    options: [
      { id: 'simple', asks: [...PRESENCE] },
      { id: 'richer', asks: [...PRESENCE, 'sections', 'components', 'interactive', 'integrations'] },
      { id: 'application', asks: ['userflows', 'backend', 'database', 'architecture', 'integrations'] },
      { id: 'unsure', asks: [] },
    ],
  },
  {
    id: 'existing',
    options: [
      { id: 'yes', asks: [] },
      { id: 'no', asks: [] },
      { id: 'unsure', asks: [] },
    ],
  },
  {
    id: 'stored',
    options: [
      { id: 'yes', asks: ['userflows', 'backend', 'database'] },
      { id: 'no', asks: [] },
      { id: 'unsure', asks: [] },
    ],
  },
  {
    id: 'support',
    options: [
      { id: 'yes', asks: ['maintenance', 'fixes'] },
      { id: 'no', asks: [] },
      { id: 'unsure', asks: [] },
    ],
  },
]

/** What the visitor chose: the id of the option for each question they answered. */
export type FinderAnswers = Partial<Record<FinderQuestionId, string>>

export interface PackageFit {
  id: PackageId
  /** 0 to 1: the share of what was asked for that this package gives, by the levels above. */
  fit: number
  included: ComparisonFeature[]
  addon: ComparisonFeature[]
  custom: ComparisonFeature[]
  missing: ComparisonFeature[]
}

export type Recommendation =
  | { kind: 'none' }
  | {
      kind: 'package'
      /** The features that were asked for (those the comparison has), in the comparison's order. */
      asked: ComparisonFeature[]
      primary: PackageFit
      /** A package beside the ladder (Care) when the visitor asked for it to be looked after. */
      also: PackageFit | null
      /** Every package considered, best first, for the "how well each fits" list. */
      ranking: PackageFit[]
      /** True when "I already have one" limited the choice to packages for improving an existing website. */
      limitedToImproving: boolean
    }

const optionOf = (question: FinderQuestionId, answers: FinderAnswers): FinderOption | undefined => {
  const chosen = answers[question]
  return FINDER.find((entry) => entry.id === question)?.options.find((option) => option.id === chosen)
}

/** The ids of the features the answers ask for, once each. */
export function askedIds(answers: FinderAnswers, questions: readonly FinderQuestionId[] = FINDER_QUESTION_IDS): string[] {
  const ids = new Set<string>()
  for (const question of questions) for (const id of optionOf(question, answers)?.asks ?? []) ids.add(id)
  return [...ids]
}

/** Whether a package stands on the ladder: it builds on another, or another builds on it. Care stands beside it. */
export function onLadder(comparison: Comparison, id: PackageId): boolean {
  const tier = tierOf(comparison, id)
  if (!tier) return false
  return tier.buildsOn !== null || comparison.tiers.some((other) => other.buildsOn === id)
}

export function fitOf(id: PackageId, features: readonly ComparisonFeature[]): PackageFit {
  const fit: PackageFit = { id, fit: 0, included: [], addon: [], custom: [], missing: [] }
  let sum = 0
  for (const feature of features) {
    const level = levelOf(feature, id)
    sum += LEVEL_WEIGHT[level]
    if (level === 'included') fit.included.push(feature)
    else if (level === 'addon') fit.addon.push(feature)
    else if (level === 'custom') fit.custom.push(feature)
    else fit.missing.push(feature)
  }
  fit.fit = features.length === 0 ? 0 : sum / features.length
  return fit
}

export interface FinderCatalogue {
  /** Display order of the packages (the website's, as the administrator ordered them). */
  order: readonly PackageId[]
  /** Which packages are for improving an existing website or application. */
  improving: readonly PackageId[]
  /** Packages not on offer right now. */
  unavailable?: readonly PackageId[]
}

const byId = (comparison: Comparison, ids: readonly string[]): ComparisonFeature[] =>
  comparison.features.filter((feature) => ids.includes(feature.id))

/** The suggestion for these answers, from this comparison. `null`-free: a visitor who asked for nothing gets `{ kind: 'none' }`. */
export function recommend(comparison: Comparison, catalogue: FinderCatalogue, answers: FinderAnswers): Recommendation {
  const unavailable = new Set(catalogue.unavailable ?? [])
  const offered = catalogue.order.filter((id) => !unavailable.has(id) && tierOf(comparison, id) !== undefined)
  const ladder = offered.filter((id) => onLadder(comparison, id))
  const beside = offered.filter((id) => !onLadder(comparison, id))

  const buildAsked = byId(comparison, askedIds(answers, ['scope', 'stored']))
  const supportAsked = byId(comparison, askedIds(answers, ['support']))
  if (buildAsked.length === 0 && supportAsked.length === 0) return { kind: 'none' }

  const improvingOnly = optionOf('existing', answers)?.id === 'yes'
  const narrowed = improvingOnly ? ladder.filter((id) => catalogue.improving.includes(id)) : ladder
  // If the configuration leaves nothing that fits "improving", the whole ladder is considered rather than nothing.
  const limitedToImproving = improvingOnly && narrowed.length > 0
  const pool = narrowed.length > 0 ? narrowed : ladder.length > 0 ? ladder : offered

  let primary: PackageFit
  let ranking: PackageFit[]
  let asked: ComparisonFeature[]
  if (buildAsked.length > 0) {
    asked = buildAsked
    const fits = pool.map((id) => fitOf(id, buildAsked))
    // The smallest package (first in the ladder's order) that fits well enough; otherwise the one that fits most (the earlier one on a tie).
    primary = fits.find((entry) => entry.fit >= FINDER_THRESHOLD) ?? fits.reduce((best, entry) => (entry.fit > best.fit ? entry : best), fits[0])
    ranking = [...fits].sort((a, b) => b.fit - a.fit || pool.indexOf(a.id) - pool.indexOf(b.id))
  } else {
    // Only "look after it" was asked: the packages beside the ladder are the candidates.
    asked = supportAsked
    const fits = (beside.length > 0 ? beside : offered).map((id) => fitOf(id, supportAsked))
    primary = fits.reduce((best, entry) => (entry.fit > best.fit ? entry : best), fits[0])
    ranking = [...fits].sort((a, b) => b.fit - a.fit)
  }
  if (!primary) return { kind: 'none' }

  let also: PackageFit | null = null
  if (buildAsked.length > 0 && supportAsked.length > 0) {
    const candidates = beside.filter((id) => id !== primary.id).map((id) => fitOf(id, supportAsked)).filter((entry) => entry.fit >= FINDER_THRESHOLD)
    also = candidates.sort((a, b) => b.fit - a.fit)[0] ?? null
  }
  return { kind: 'package', asked, primary, also, ranking, limitedToImproving }
}

/** The fit as a whole percentage for display. */
export const percent = (fit: number): number => Math.round(fit * 100)
