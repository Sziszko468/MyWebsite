/**
 * A very small shared store: one value, readable synchronously, with subscribers. React reads it
 * with useSyncExternalStore; the shop's cart and the request's answers each have one, so a choice
 * made on a service page is there on the cart page, in the header and after a language switch, and
 * the loading bar's count of pages still arriving is one too, without a provider above the router
 * or a library.
 */

export interface Store<T> {
  get(): T
  /** Replaces the value with what the updater returns. The same value (identity) notifies nobody. */
  update(updater: (current: T) => T): void
  subscribe(listener: () => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    update(updater) {
      const next = updater(value)
      if (Object.is(next, value)) return
      value = next
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
