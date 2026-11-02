import { useMemo, useSyncExternalStore } from 'react'
import { common } from '../content/shop/common'
import { localize } from '../content/trilingual'
import { useI18n } from '../i18n/useI18n'
import type { Cart } from './cart'
import { cartStore, noticeStore, type CartNotice } from './cartStore'
import { inquiryStore, type InquiryState } from './inquiryStore'
import { priceCart, type CartPricing } from './pricing'

/**
 * The cart, live: any component that uses it re-renders when the cart changes anywhere on the site.
 * The page is never rendered on a server in production; the "server" snapshot is the store itself so
 * that a page can be rendered to markup in tests with a cart in it.
 */
export function useCart(): Cart {
  return useSyncExternalStore(cartStore.subscribe, cartStore.get, cartStore.get)
}

export function useCartPricing(): CartPricing {
  const cart = useCart()
  return useMemo(() => priceCart(cart), [cart])
}

export function useCartNotice(): CartNotice | null {
  return useSyncExternalStore(noticeStore.subscribe, noticeStore.get, noticeStore.get)
}

export function useInquiry(): InquiryState {
  return useSyncExternalStore(inquiryStore.subscribe, inquiryStore.get, inquiryStore.get)
}

/** The shop's shared words (names, price wording, announcements) in the visitor's language: small enough for the header. */
export function useCommonText() {
  const { lang } = useI18n()
  return useMemo(() => localize(common, lang), [lang])
}
