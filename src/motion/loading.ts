import { lazy, useSyncExternalStore, type ComponentType, type LazyExoticComponent } from 'react'
import { createStore } from '../utils/store'

/**
 * One way to know that something is still arriving. Today that is a page's code (every route is its
 * own chunk); the loading bar reads it, and nothing else needs to know how. The count is real: it
 * goes up when a page's code is asked for and down when it has arrived or failed. There is no
 * progress percentage, because a dynamic import does not report one, and none is invented: the bar
 * says "loading", it does not say how much.
 */

const pending = createStore(0)

export const pendingCount = (): number => pending.get()

/** Runs a task and counts it as pending until it settles, whichever way it settles. */
export function track<T>(task: Promise<T>): Promise<T> {
  pending.update((count) => count + 1)
  const done = () => pending.update((count) => Math.max(0, count - 1))
  task.then(done, done)
  return task
}

/**
 * `lazy()` for a page: the same component, and while its code is on the way the loading bar knows.
 * With the router's transitions the old page stays on screen until the new one can replace it, so
 * without this a slow connection would look like a link that does nothing.
 */
// `any` is the type React's own `lazy` asks for: the props of the page are whatever the page declares.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRoute<T extends ComponentType<any>>(load: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  return lazy(() => track(load()))
}

/** How many things are arriving right now. */
export function usePendingCount(): number {
  return useSyncExternalStore(pending.subscribe, pending.get, () => 0)
}

/** How long the bar waits before it shows, so a fast load flashes nothing (ms). */
export const LOADING_DELAY_MS = 140
