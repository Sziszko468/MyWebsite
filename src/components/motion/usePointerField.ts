import { useEffect, useRef, type RefObject } from 'react'
import { formatVar, pointerVars } from './pointerField'

/**
 * Lets an element's CSS follow the pointer. While a mouse or pen is over the element it writes
 * --mx and --my (pixels) and --px and --py (-1..1) on it, and sets data-pointer="active"; on
 * leaving, it resets them and the attribute goes, so styles ease back by their own transitions.
 *
 * What counts is decided per event, not once at mount: a finger never drives it (its events say
 * so), and under reduced motion it does nothing, even if the setting changes while the page is
 * open. A touch screen therefore only ever sees the CSS's rest values. Writes are batched to one
 * per frame, and the element's box is measured once per move burst, not per event.
 */
export function usePointerField<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let rect: DOMRect | null = null
    let clientX = 0
    let clientY = 0

    const write = () => {
      frame = 0
      rect ??= element.getBoundingClientRect()
      const v = pointerVars(rect, clientX, clientY)
      element.style.setProperty('--mx', `${formatVar(v.x, 1)}px`)
      element.style.setProperty('--my', `${formatVar(v.y, 1)}px`)
      element.style.setProperty('--px', formatVar(v.px))
      element.style.setProperty('--py', formatVar(v.py))
    }

    const reset = () => {
      cancelAnimationFrame(frame)
      frame = 0
      rect = null
      delete element.dataset.pointer
      element.style.removeProperty('--mx')
      element.style.removeProperty('--my')
      element.style.removeProperty('--px')
      element.style.removeProperty('--py')
    }

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return
      if (reduced.matches) return
      if (element.dataset.pointer !== 'active') element.dataset.pointer = 'active'
      clientX = event.clientX
      clientY = event.clientY
      if (!frame) frame = requestAnimationFrame(write)
    }

    const forgetBox = () => {
      rect = null
    }

    element.addEventListener('pointermove', onMove, { passive: true })
    element.addEventListener('pointerleave', reset)
    window.addEventListener('scroll', forgetBox, { passive: true })
    window.addEventListener('resize', forgetBox, { passive: true })
    return () => {
      reset()
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerleave', reset)
      window.removeEventListener('scroll', forgetBox)
      window.removeEventListener('resize', forgetBox)
    }
  }, [])

  return ref
}
