/**
 * One IntersectionObserver per set of options, shared by everything that asks "is this on screen":
 * section reveals, kinetic headlines, scroll-linked elements. Dozens of reveals on a page cost one
 * observer, not dozens, and an element that is no longer watched costs nothing.
 *
 * Without IntersectionObserver (an old browser, a test) the callback is told once that the element
 * is in view, so content that waits for the observer is never left hidden.
 */

export interface InViewOptions {
  /** How much of the element must show before it counts as in view (0 to 1). */
  threshold?: number
  /** Grows or shrinks the viewport the element is measured against, e.g. `'0px 0px -6% 0px'`. */
  rootMargin?: string
}

type Listener = (entry: Pick<IntersectionObserverEntry, 'isIntersecting' | 'boundingClientRect' | 'target'>) => void

interface Pool {
  observer: IntersectionObserver
  listeners: Map<Element, Set<Listener>>
}

const pools = new Map<string, Pool>()

function poolFor({ threshold = 0.12, rootMargin = '0px' }: InViewOptions): Pool {
  const key = `${threshold}|${rootMargin}`
  let pool = pools.get(key)
  if (!pool) {
    const listeners = new Map<Element, Set<Listener>>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) for (const listener of [...(listeners.get(entry.target) ?? [])]) listener(entry)
      },
      { threshold, rootMargin },
    )
    pool = { observer, listeners }
    pools.set(key, pool)
  }
  return pool
}

/** Watches an element and returns the function that stops watching it. */
export function observeInView(element: Element, listener: Listener, options: InViewOptions = {}): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    listener({ isIntersecting: true, boundingClientRect: element.getBoundingClientRect(), target: element })
    return () => undefined
  }
  const pool = poolFor(options)
  let set = pool.listeners.get(element)
  if (!set) {
    set = new Set()
    pool.listeners.set(element, set)
    pool.observer.observe(element)
  }
  set.add(listener)

  return () => {
    const current = pool.listeners.get(element)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) {
      pool.listeners.delete(element)
      pool.observer.unobserve(element)
    }
  }
}

/** Calls back once, the first time the element is in view, then stops watching it. */
export function observeOnce(element: Element, callback: () => void, options?: InViewOptions): () => void {
  let stop = () => undefined as void
  stop = observeInView(
    element,
    (entry) => {
      if (!entry.isIntersecting) return
      stop()
      callback()
    },
    options,
  )
  return stop
}

/** For tests: how many observers and watched elements there are right now. */
export function inViewStats(): { observers: number; elements: number } {
  let elements = 0
  for (const pool of pools.values()) elements += pool.listeners.size
  return { observers: pools.size, elements }
}
