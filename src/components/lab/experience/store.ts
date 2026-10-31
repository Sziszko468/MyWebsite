import { useSyncExternalStore } from 'react'

/**
 * A tiny external store: one value, subscribers, no React inside. The experiences keep their
 * documents (a model, a track, a car setup) in stores rather than in component state, so a
 * scene and a panel can read the same thing, a pointer drag can change it dozens of times a
 * second without re-rendering the page around it, and one experience can hand its value to
 * another (the Track Architect's track is the Racing Experience's track).
 */
export interface Store<T> {
  get(): T
  set(next: T | ((previous: T) => T)): void
  subscribe(listener: () => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === 'function' ? (next as (previous: T) => T)(value) : next
      if (Object.is(resolved, value)) return
      value = resolved
      for (const listener of [...listeners]) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** Reads a store in a component and re-renders it when the selected part changes. The selector must return a stable value (not a fresh object each call). */
export function useStore<T, S>(store: Store<T>, select: (value: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  )
}
