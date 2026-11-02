import { ADDON_IDS, addonsFor, isExtraId, type ExtraId } from '../content/services/addons'
import { NEED_IDS, isNeedId, isPlanId, type NeedId, type PlanId } from '../content/services/ids'

/**
 * The cart: what the visitor has chosen, as plain data, and the operations on it. Every function
 * returns a new cart and none touches the browser, so the cart's rules are tested without one
 * (shop.test.ts) and the store (cartStore.ts) only has to keep and share the result.
 *
 * A line is one need (a service, an existing website to improve, "not sure yet") with a plan
 * (one of the four packages, or a custom project) and the add-ons put on it. A need appears once:
 * adding it again edits the line it already has. An add-on can only sit on a line it applies to.
 */

export interface CartLine {
  need: NeedId
  /** `null` until the visitor has chosen: the cart shows the line, but asking for a quote needs a plan. */
  plan: PlanId | null
  extras: readonly ExtraId[]
}

export interface Cart {
  lines: readonly CartLine[]
}

export const EMPTY_CART: Cart = { lines: [] }

export const findLine = (cart: Cart, need: NeedId): CartLine | undefined => cart.lines.find((line) => line.need === need)
export const hasLine = (cart: Cart, need: NeedId): boolean => findLine(cart, need) !== undefined
export const isLineComplete = (line: CartLine): boolean => line.plan !== null
export const isCartComplete = (cart: Cart): boolean => cart.lines.length > 0 && cart.lines.every(isLineComplete)

/** The add-ons that can sit on a need, once each and in catalogue order. */
export function normalizeExtras(need: NeedId, extras: readonly unknown[]): ExtraId[] {
  const allowed = new Set(addonsFor(need).map((addon) => addon.id))
  const wanted = new Set(extras.filter(isExtraId).filter((id) => allowed.has(id)))
  return ADDON_IDS.filter((id) => wanted.has(id))
}

function replace(cart: Cart, need: NeedId, change: (line: CartLine) => CartLine): Cart {
  const current = findLine(cart, need)
  if (!current) return cart
  const next = change(current)
  return next === current ? cart : { lines: cart.lines.map((line) => (line === current ? next : line)) }
}

/** Adds the need as a line, or replaces the line it already has with these choices. */
export function upsertLine(cart: Cart, line: { need: NeedId; plan?: PlanId | null; extras?: readonly ExtraId[] }): Cart {
  const next: CartLine = { need: line.need, plan: line.plan ?? null, extras: normalizeExtras(line.need, line.extras ?? []) }
  if (hasLine(cart, line.need)) return replace(cart, line.need, () => next)
  return { lines: [...cart.lines, next] }
}

export function removeLine(cart: Cart, need: NeedId): Cart {
  return hasLine(cart, need) ? { lines: cart.lines.filter((line) => line.need !== need) } : cart
}

/** Puts a removed line back where it was (the cart's "undo"). */
export function restoreLine(cart: Cart, line: CartLine, index: number): Cart {
  if (hasLine(cart, line.need)) return cart
  const lines = [...cart.lines]
  lines.splice(Math.min(Math.max(index, 0), lines.length), 0, { ...line, extras: normalizeExtras(line.need, line.extras) })
  return { lines }
}

export function setPlan(cart: Cart, need: NeedId, plan: PlanId | null): Cart {
  return replace(cart, need, (line) => (line.plan === plan ? line : { ...line, plan }))
}

export function toggleExtra(cart: Cart, need: NeedId, extra: ExtraId, on?: boolean): Cart {
  return replace(cart, need, (line) => {
    const has = line.extras.includes(extra)
    const wanted = on ?? !has
    if (wanted === has) return line
    return { ...line, extras: normalizeExtras(need, wanted ? [...line.extras, extra] : line.extras.filter((id) => id !== extra)) }
  })
}

/**
 * Makes the cart hold exactly these needs: the lines it already has keep their plan and add-ons,
 * new ones start empty (with `planFor`, when it names a plan for them), the others go. This is what
 * the configurator's first step does with its choices.
 */
export function setNeeds(cart: Cart, needs: readonly NeedId[], planFor?: (need: NeedId) => PlanId | null): Cart {
  const wanted = NEED_IDS.filter((id) => needs.includes(id))
  const kept = cart.lines.filter((line) => wanted.includes(line.need))
  const added = wanted.filter((need) => !hasLine(cart, need)).map((need): CartLine => ({ need, plan: planFor?.(need) ?? null, extras: [] }))
  const lines = [...kept, ...added]
  return lines.length === cart.lines.length && lines.every((line, i) => line === cart.lines[i]) ? cart : { lines }
}

export const clearCart = (cart: Cart): Cart => (cart.lines.length === 0 ? cart : EMPTY_CART)

/** How many add-ons the cart holds in all. */
export const countExtras = (cart: Cart): number => cart.lines.reduce((sum, line) => sum + line.extras.length, 0)

/**
 * Reads a cart back from storage or another tab. Anything that is not a valid line is dropped
 * quietly (an old save with a renamed id must not break the shop); a need is kept once.
 */
export function parseCart(raw: unknown): Cart {
  if (typeof raw !== 'object' || raw === null || !('lines' in raw) || !Array.isArray(raw.lines)) return EMPTY_CART
  const lines: CartLine[] = []
  for (const entry of raw.lines as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue
    const { need, plan, extras } = entry as Record<string, unknown>
    if (!isNeedId(need) || lines.some((line) => line.need === need)) continue
    lines.push({
      need,
      plan: isPlanId(plan) ? plan : null,
      extras: normalizeExtras(need, Array.isArray(extras) ? extras : []),
    })
  }
  return lines.length > 0 ? { lines } : EMPTY_CART
}
