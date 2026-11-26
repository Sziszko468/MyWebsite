import { useSyncExternalStore } from 'react'
import { createStore } from '../utils/store'

/**
 * Whether something covers the whole page: the menu on a phone, the assistant on a phone. A live scene behind it cannot be seen, so it stops drawing until the
 * cover is gone. Whoever covers the page says so and releases it again; several covers count, and releasing one twice releases it once.
 */

const covers = createStore(0)

/** Says that the page is covered now. Call the returned function when it no longer is. */
export function coverPage(): () => void {
  covers.update((count) => count + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    covers.update((count) => Math.max(0, count - 1))
  }
}

export const pageCovered = (): boolean => covers.get() > 0
export const subscribeCover = (listener: () => void): (() => void) => covers.subscribe(listener)

export function useCovered(): boolean {
  return useSyncExternalStore(subscribeCover, pageCovered, () => false)
}
