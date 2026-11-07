import type { PackageId } from '../packages'

/**
 * The vocabulary the shop is built on: which services exist, what a visitor may say they need, and
 * which plan they can pick for it. Everything else (the cart, the configurator, the search, the
 * request that is sent) speaks in these ids, so a rename happens here once.
 */

/** The four service categories, each with a product page of its own. */
export const SERVICE_IDS = ['website', 'webapp', 'ui', 'integrations'] as const
export type ServiceId = (typeof SERVICE_IDS)[number]

/**
 * What a visitor can say they need (step 1 of the configurator). The first, second, fourth and
 * fifth are the services; `improve` is an existing website to be developed further (it leads to
 * the website service page); `unsure` is "not sure yet" and belongs to no service.
 */
export const NEED_IDS = ['website', 'webapp', 'improve', 'ui', 'integrations', 'unsure'] as const
export type NeedId = (typeof NEED_IDS)[number]

/** The packages, in the order the shop shows them. */
export const PACKAGE_IDS = ['launch', 'grow', 'build', 'care'] as const satisfies ReadonlyArray<PackageId>

/** A package, or a project that fits none of them (step 2 of the configurator). */
export const PLAN_IDS = [...PACKAGE_IDS, 'custom'] as const satisfies ReadonlyArray<PackageId | 'custom'>
export type PlanId = (typeof PLAN_IDS)[number]

export const isServiceId = (value: unknown): value is ServiceId => SERVICE_IDS.some((id) => id === value)
export const isNeedId = (value: unknown): value is NeedId => NEED_IDS.some((id) => id === value)
export const isPlanId = (value: unknown): value is PlanId => PLAN_IDS.some((id) => id === value)

/** The service page a need leads to; `null` for "not sure yet", which has none. */
export function serviceOfNeed(need: NeedId): ServiceId | null {
  if (need === 'improve') return 'website'
  if (need === 'unsure') return null
  return need
}
