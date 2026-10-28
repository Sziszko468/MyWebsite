import type { ServicePrice } from '../components/ServiceCard/ServiceCard'

/**
 * The collaboration packages, in this order. The words (description, audience, what is included)
 * live in the dictionaries under `home.packages.items.<id>`.
 *
 * Prices are configuration, never copy. Until a real figure is decided, a package asks for a
 * quote; to publish one, set `{ kind: 'from', amount: 1200, currency: 'EUR' }`. No price, deadline
 * or result is promised anywhere else.
 */

export type PackageId = 'launch' | 'grow' | 'build' | 'care'

export interface ServicePackage {
  id: PackageId
  /** The package's name: a proper noun, shown as is in every language. */
  name: string
  price: ServicePrice
  /** The package given the most weight on the page. */
  featured: boolean
}

export const packages: readonly ServicePackage[] = [
  { id: 'launch', name: 'Launch', price: { kind: 'quote' }, featured: false },
  { id: 'grow', name: 'Grow', price: { kind: 'quote' }, featured: false },
  { id: 'build', name: 'Build', price: { kind: 'quote' }, featured: true },
  { id: 'care', name: 'Care', price: { kind: 'quote' }, featured: false },
]
