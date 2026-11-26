import { useSyncExternalStore } from 'react'

/**
 * The visitor's wish for less motion, followed while the page is open. CSS answers it by itself (the tokens collapse); a script that moves something has to hear
 * about a change too, so an effect that depends on this value stops when the setting is switched on and starts again when it is switched off.
 */

export const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

const media = (): MediaQueryList | null => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED_MOTION) : null)

export function subscribeReducedMotion(listener: () => void): () => void {
  const list = media()
  if (!list) return () => undefined
  list.addEventListener('change', listener)
  return () => list.removeEventListener('change', listener)
}

export const prefersReducedMotion = (): boolean => media()?.matches ?? false

export function useReducedMotion(): boolean {
  // The server has no preference to read; the first effect runs in the browser, with the real one.
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false)
}
