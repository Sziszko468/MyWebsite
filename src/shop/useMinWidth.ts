import { useSyncExternalStore } from 'react'

/**
 * Whether the viewport is at least `rem` wide, live. The shop draws some things in two different markups (the tier comparison is a
 * table from `md` and a package switcher below it), because a table squeezed onto a phone is the thing the brief rules out; a
 * stylesheet cannot choose between two markups, so this does. With no browser (a test rendering to markup) it says "wide".
 */
export function useMinWidth(rem: number): boolean {
  const query = `(min-width: ${rem}rem)`
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => true,
  )
}
