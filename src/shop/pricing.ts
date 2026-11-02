import { getPackage } from '../content/packages'
import type { ServicePrice, VatMode } from '../content/pricing'
import { getAddon, type ExtraId } from '../content/services/addons'
import type { PlanId } from '../content/services/ids'
import type { Cart, CartLine } from './cart'

/**
 * What the cart is worth. Nothing here invents a figure: a part has a price only if the content
 * publishes one (a `from` price in content/packages.ts or content/services/addons.ts); every
 * other part is priced in the quote. So today the cart shows no total at all, and the day the
 * owner publishes a price, the same code shows the sum, per currency, next to the parts that are
 * still quoted. The prices are read through `PriceSource`, so the tests can supply published ones.
 */

export interface PricePart {
  price: ServicePrice
  vat: VatMode
}

export interface PriceSource {
  plan(id: Exclude<PlanId, 'custom'>): PricePart
  addon(id: ExtraId): PricePart
}

export const contentPrices: PriceSource = {
  plan: (id) => {
    const { price, vat } = getPackage(id)
    return { price, vat }
  },
  addon: (id) => {
    const { price, vat } = getAddon(id)
    return { price, vat }
  },
}

/** `fixed`: a published price, shown and added up. `quote`: no published price; it comes with the quote. */
export type PriceClass = 'fixed' | 'quote'

export const priceClass = (price: ServicePrice): PriceClass => (price.kind === 'from' ? 'fixed' : 'quote')

export interface PricedPart extends PricePart {
  class: PriceClass
}

export interface LinePricing {
  need: CartLine['need']
  /** The plan's price; `null` for a custom project or while no plan is chosen: those are quoted. */
  plan: PricedPart | null
  /** The line is a fixed-price product only when its plan has a published price. */
  class: PriceClass
  extras: ReadonlyArray<PricedPart & { id: ExtraId }>
}

export interface FixedTotal {
  currency: 'EUR' | 'HUF'
  /** The sum of the published prices in this currency (they are starting prices, so it reads "from"). */
  amount: number
  /** One VAT wording when every part agrees, `mixed` when they do not. */
  vat: VatMode | 'mixed'
}

export interface CartPricing {
  lines: readonly LinePricing[]
  /** One total per currency; empty while nothing has a published price. */
  fixed: readonly FixedTotal[]
  fixedLines: number
  quotedLines: number
  addons: number
  /** Everything whose price comes with the quote: quoted lines and quoted add-ons. */
  quotedItems: number
}

function part(source: PricePart): PricedPart {
  return { ...source, class: priceClass(source.price) }
}

export function priceLine(line: CartLine, source: PriceSource = contentPrices): LinePricing {
  const plan = line.plan && line.plan !== 'custom' ? part(source.plan(line.plan)) : null
  return {
    need: line.need,
    plan,
    class: plan?.class ?? 'quote',
    extras: line.extras.map((id) => ({ id, ...part(source.addon(id)) })),
  }
}

export function priceCart(cart: Cart, source: PriceSource = contentPrices): CartPricing {
  const lines = cart.lines.map((line) => priceLine(line, source))
  const totals = new Map<FixedTotal['currency'], { amount: number; vats: Set<VatMode> }>()

  const add = (priced: PricedPart | null) => {
    if (!priced || priced.price.kind !== 'from') return
    const entry = totals.get(priced.price.currency) ?? { amount: 0, vats: new Set<VatMode>() }
    entry.amount += priced.price.amount
    entry.vats.add(priced.vat)
    totals.set(priced.price.currency, entry)
  }
  for (const line of lines) {
    add(line.plan)
    line.extras.forEach(add)
  }

  const fixed = [...totals].map(([currency, { amount, vats }]): FixedTotal => ({
    currency,
    amount,
    vat: vats.size === 1 ? [...vats][0] : 'mixed',
  }))

  const fixedLines = lines.filter((line) => line.class === 'fixed').length
  const quotedLines = lines.length - fixedLines
  const extras = lines.flatMap((line) => line.extras)
  return {
    lines,
    fixed,
    fixedLines,
    quotedLines,
    addons: extras.length,
    quotedItems: quotedLines + extras.filter((extra) => extra.class === 'quote').length,
  }
}
