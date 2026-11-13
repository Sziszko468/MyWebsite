import type { ExtraId } from '../content/services/addons'
import type { NeedId, PlanId } from '../content/services/ids'
import {
  EMPTY_CART,
  clearCart,
  extrasLostBy,
  findLine,
  parseCart,
  removeLine,
  restoreLine,
  setNeeds,
  setPlan,
  toggleExtra,
  upsertLine,
  type Cart,
  type CartLine,
} from './cart'
import { track } from '../analytics/tracker'
import { createStore } from './store'

/**
 * The visitor's cart, shared by the whole site and kept in this browser (localStorage) so it
 * survives a reload and a visit to another page. It holds only the choices (which services, which
 * package, which add-ons): never a name, an address or a message, which stay in memory until they
 * are sent (inquiryStore.ts). Reading and writing storage can fail (private windows, blocked
 * site data, a full disk), so every access is guarded and the cart then simply lives in memory.
 */

export const CART_STORAGE_KEY = 'cc-shop-cart-v1'

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readStored(): Cart {
  try {
    const raw = storage()?.getItem(CART_STORAGE_KEY)
    return raw ? parseCart(JSON.parse(raw)) : EMPTY_CART
  } catch {
    return EMPTY_CART
  }
}

export const cartStore = createStore<Cart>(readStored())

let written = JSON.stringify(cartStore.get())
let saved = storage() !== null
/** Whether the cart is being kept in this browser (so the page may say "saved") or lives in memory only (a private window, blocked site data). */
export const isCartSaved = (): boolean => saved
cartStore.subscribe(() => {
  const next = JSON.stringify(cartStore.get())
  if (next === written) return
  written = next
  try {
    const where = storage()
    where?.setItem(CART_STORAGE_KEY, next)
    saved = where !== null
  } catch {
    // The cart stays in memory; the page must not claim it was saved.
    saved = false
  }
})

// Another tab changed the cart: follow it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== CART_STORAGE_KEY && event.key !== null) return
    written = event.newValue ?? JSON.stringify(EMPTY_CART)
    try {
      cartStore.update(() => (event.newValue ? parseCart(JSON.parse(event.newValue)) : EMPTY_CART))
    } catch {
      cartStore.update(() => EMPTY_CART)
    }
  })
}

/** What just happened to the cart, for the announcement and the "undo". Not persisted. */
export interface CartNotice {
  seq: number
  kind: 'added' | 'updated' | 'removed' | 'cleared' | 'extrasDropped'
  need: NeedId | null
  /** For `removed`: the line and where it was, so it can be put back. */
  undo: { line: CartLine; index: number } | null
  /** For `extrasDropped`: the add-ons a package change took off because the new package does not list them. */
  dropped: readonly ExtraId[]
}

export const noticeStore = createStore<CartNotice | null>(null)
let sequence = 0
const announce = (kind: CartNotice['kind'], need: NeedId | null, undo: CartNotice['undo'] = null, dropped: readonly ExtraId[] = []) =>
  noticeStore.update(() => ({ seq: ++sequence, kind, need, undo, dropped }))

export const cartActions = {
  /** Puts a service in the cart with these choices; if it is already there, they replace the old ones. */
  add(need: NeedId, choices: { plan?: PlanId | null; extras?: readonly ExtraId[] } = {}) {
    const existed = findLine(cartStore.get(), need) !== undefined
    cartStore.update((cart) => upsertLine(cart, { need, ...choices }))
    announce(existed ? 'updated' : 'added', need)
    if (choices.plan) track('package_selected', { need, plan: choices.plan })
  },
  remove(need: NeedId) {
    const cart = cartStore.get()
    const line = findLine(cart, need)
    if (!line) return
    const index = cart.lines.indexOf(line)
    cartStore.update((current) => removeLine(current, need))
    announce('removed', need, { line, index })
  },
  undoRemove() {
    const undo = noticeStore.get()?.undo
    if (!undo) return
    cartStore.update((cart) => restoreLine(cart, undo.line, undo.index))
    announce('updated', undo.line.need)
  },
  setPlan(need: NeedId, plan: PlanId | null) {
    const before = findLine(cartStore.get(), need)
    const lost = before ? extrasLostBy(before, plan) : []
    cartStore.update((cart) => setPlan(cart, need, plan))
    // A package that does not list an add-on takes it off the line: say so, never silently.
    if (lost.length > 0) announce('extrasDropped', need, null, lost)
    if (plan) track('package_selected', { need, plan })
  },
  toggleExtra(need: NeedId, extra: ExtraId, on?: boolean) {
    const had = findLine(cartStore.get(), need)?.extras.includes(extra) ?? false
    cartStore.update((cart) => toggleExtra(cart, need, extra, on))
    if (!had && findLine(cartStore.get(), need)?.extras.includes(extra)) track('addon_selected', { need, extra })
  },
  setNeeds: (needs: readonly NeedId[], planFor?: (need: NeedId) => PlanId | null) =>
    cartStore.update((cart) => setNeeds(cart, needs, planFor)),
  clear() {
    if (cartStore.get().lines.length === 0) return
    cartStore.update(clearCart)
    announce('cleared', null)
  },
  /** Forgets any pending "undo": it only makes sense right after the removal. */
  dismissNotice: () => noticeStore.update(() => null),
}
