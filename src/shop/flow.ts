import { getPackage, packages } from '../content/packages'
import type { NeedId, PlanId } from '../content/services/ids'
import { isCartComplete, type Cart } from './cart'
import type { StepId } from './inquiry'

/**
 * Where the request builder opens, depending on how the visitor got there. Coming from a service
 * page's "Request a quote" the choices are made and the next open question is the package; coming
 * from the cart's "Proceed" the cart is the plan, so only the project's details are left.
 */
export function startStep(cart: Cart, from: 'service' | 'cart'): StepId {
  if (cart.lines.length === 0) return 'need'
  if (!isCartComplete(cart)) return 'plan'
  return from === 'cart' ? 'details' : 'extras'
}

/** The packages that suit a need, in package order (the cart and the builder mark them "suggested"). */
export function suggestedPlans(need: NeedId): PlanId[] {
  return packages.filter((pkg) => pkg.needs.includes(need)).map((pkg) => pkg.id)
}

/**
 * The plan a visitor who arrived with a package in mind gets on a need they pick: the package if it
 * suits that need, "custom" if that was the plan they came with, otherwise none (they choose).
 */
export function planForNeed(need: NeedId, pending: PlanId | null): PlanId | null {
  if (pending === null) return null
  if (pending === 'custom') return 'custom'
  return getPackage(pending).needs.includes(need) ? pending : null
}
