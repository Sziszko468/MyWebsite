import type { Currency, ExtraRecord, PackageRecord, Price, VatMode } from '../catalog/repository.ts'

/**
 * What a quote request is worth. The server is the only place a price is ever read from: the request carries
 * ids (a package code, add-on codes) and nothing else, and the prices come from the approved catalogue at the
 * moment the request arrives. Nothing here invents a figure: a part has a price only if the catalogue
 * publishes one (`from`); every other part is quoted. With every price `quote` today the totals are empty and
 * the answer says only that the price comes with the quote, the same as the website's cart.
 */

export interface PricedPart {
  code: string
  price: Price
  vat: VatMode
}

/** What is stored with an item: the approved prices it was requested at. */
export interface PriceSnapshot {
  plan: PricedPart | null
  extras: PricedPart[]
}

export function snapshot(plan: PackageRecord | null, extras: readonly ExtraRecord[]): PriceSnapshot {
  return {
    plan: plan ? { code: plan.code, price: plan.price, vat: plan.vat } : null,
    extras: extras.map((extra) => ({ code: extra.code, price: extra.price, vat: extra.vat })),
  }
}

export interface FixedTotal {
  currency: Currency
  amount: number
  vat: VatMode | 'mixed'
}

export interface Totals {
  /** Sums of the published starting prices, per currency. Empty while nothing is published. */
  fixed: FixedTotal[]
  /** How many parts have no published price: they are priced in the quote. */
  quotedParts: number
}

export function totalsOf(items: readonly PriceSnapshot[]): Totals {
  const sums = new Map<Currency, { amount: number; vats: Set<VatMode> }>()
  let quotedParts = 0
  const add = (part: PricedPart) => {
    if (part.price.kind !== 'from') {
      quotedParts += 1
      return
    }
    const sum = sums.get(part.price.currency) ?? { amount: 0, vats: new Set<VatMode>() }
    sum.amount += part.price.amount
    sum.vats.add(part.vat)
    sums.set(part.price.currency, sum)
  }
  for (const item of items) {
    // A custom project (no plan) is always quoted.
    if (item.plan) add(item.plan)
    else quotedParts += 1
    for (const extra of item.extras) add(extra)
  }
  return {
    fixed: [...sums.entries()].map(([currency, sum]) => ({ currency, amount: sum.amount, vat: sum.vats.size === 1 ? [...sum.vats][0] : 'mixed' })),
    quotedParts,
  }
}
