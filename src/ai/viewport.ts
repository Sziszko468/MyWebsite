import { useEffect } from 'react'

/**
 * Keeps `--vvh` (the height of what is really visible) and `--vvt` (how far the visible area is scrolled) on an element, from the
 * visual viewport. On a phone the on-screen keyboard shrinks the visual viewport but not the layout one, so a panel sized with
 * `100dvh` would run under the keyboard and hide the input. Sized with `--vvh` it ends above the keyboard, the input stays
 * visible and the latest message stays in view. Without the API (an old browser) the variable is simply unset and CSS falls back
 * to `100dvh`.
 */
export function useVisualViewport(element: HTMLElement | null, active = true): void {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!element || !viewport || !active) return
    const apply = () => {
      element.style.setProperty('--vvh', `${Math.round(viewport.height)}px`)
      element.style.setProperty('--vvt', `${Math.round(viewport.offsetTop)}px`)
    }
    apply()
    viewport.addEventListener('resize', apply)
    viewport.addEventListener('scroll', apply)
    return () => {
      viewport.removeEventListener('resize', apply)
      viewport.removeEventListener('scroll', apply)
      element.style.removeProperty('--vvh')
      element.style.removeProperty('--vvt')
    }
  }, [element, active])
}
