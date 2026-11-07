import type { PackageId } from '../content/packages'
import type { Comparison, ComparisonFeature, FeatureLevel, TierInfo } from '../content/shop/comparison'

/**
 * What the tier comparison says, derived from its one source (content/shop/comparison.ts, laid over by the administration): which
 * features every package has, which a tier introduces, what a tier adds to the one it builds on, and how two packages differ.
 * Plain functions over data, so the progression the page tells is tested and cannot drift from the matrix.
 *
 * `order` is the display order of the packages (content/packages.ts, which the administration's order may change); a feature is
 * "introduced" at the first package in that order that includes it.
 */

export type { FeatureLevel }

export const levelOf = (feature: ComparisonFeature, id: PackageId): FeatureLevel => feature.levels[id] ?? 'none'
export const isIncluded = (feature: ComparisonFeature, id: PackageId): boolean => levelOf(feature, id) === 'included'

export function tierOf(comparison: Comparison, id: PackageId): TierInfo | undefined {
  return comparison.tiers.find((tier) => tier.package === id)
}

/** The first package, in display order, that includes the feature; `null` when none does (it is an add-on or a custom service everywhere). */
export function introducedAt(feature: ComparisonFeature, order: readonly PackageId[]): PackageId | null {
  return order.find((id) => isIncluded(feature, id)) ?? null
}

export type FeatureGroup =
  | { kind: 'every'; features: ComparisonFeature[] }
  | { kind: 'introduced'; tier: PackageId; features: ComparisonFeature[] }
  | { kind: 'other'; features: ComparisonFeature[] }

/**
 * The features in the groups the page reads in: what every package includes, then what each package introduces (in display
 * order), then what is only ever an add-on or a custom service. Empty groups are left out; the order inside a group is the
 * administration's order of the features.
 */
export function groupFeatures(comparison: Comparison, order: readonly PackageId[]): FeatureGroup[] {
  const every: ComparisonFeature[] = []
  const byTier = new Map<PackageId, ComparisonFeature[]>()
  const other: ComparisonFeature[] = []
  for (const feature of comparison.features) {
    if (order.length > 0 && order.every((id) => isIncluded(feature, id))) every.push(feature)
    else {
      const tier = introducedAt(feature, order)
      if (tier === null) other.push(feature)
      else byTier.set(tier, [...(byTier.get(tier) ?? []), feature])
    }
  }
  const groups: FeatureGroup[] = []
  if (every.length > 0) groups.push({ kind: 'every', features: every })
  for (const id of order) {
    const features = byTier.get(id)
    if (features) groups.push({ kind: 'introduced', tier: id, features })
  }
  if (other.length > 0) groups.push({ kind: 'other', features: other })
  return groups
}

/**
 * What a package adds to the one it builds on: the features it includes that the lower tier does not. For the start of a ladder
 * (or Care, which builds on nothing) it is simply everything the package includes. Each higher tier of the ladder therefore says,
 * in the matrix's own words, what the visitor gets for stepping up.
 */
export function addsOver(comparison: Comparison, id: PackageId): ComparisonFeature[] {
  const lower = tierOf(comparison, id)?.buildsOn ?? null
  return comparison.features.filter((feature) => isIncluded(feature, id) && (lower === null || !isIncluded(feature, lower)))
}

/** The features a package includes in all, in the administration's order. */
export const includedBy = (comparison: Comparison, id: PackageId): ComparisonFeature[] => comparison.features.filter((feature) => isIncluded(feature, id))

/** The package one step above (the one that builds on this one), or `null`. */
export function nextTier(comparison: Comparison, id: PackageId): PackageId | null {
  return comparison.tiers.find((tier) => tier.buildsOn === id)?.package ?? null
}

export interface PairRow {
  feature: ComparisonFeature
  left: FeatureLevel
  right: FeatureLevel
  /** The two packages treat the feature differently. */
  differs: boolean
}

/** Two packages side by side: every feature with both levels, the ones that differ marked. */
export function comparePair(comparison: Comparison, left: PackageId, right: PackageId): PairRow[] {
  return comparison.features.map((feature) => {
    const a = levelOf(feature, left)
    const b = levelOf(feature, right)
    return { feature, left: a, right: b, differs: a !== b }
  })
}

/** How many features of each level a package has, for a summary line. */
export function levelCounts(comparison: Comparison, id: PackageId): Record<FeatureLevel, number> {
  const counts: Record<FeatureLevel, number> = { included: 0, addon: 0, custom: 0, none: 0 }
  for (const feature of comparison.features) counts[levelOf(feature, id)] += 1
  return counts
}
