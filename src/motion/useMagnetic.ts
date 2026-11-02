import { useEffect, useRef, type RefObject } from 'react'
import { isMagnetic, magneticOffset } from './magnetic'

const FINE_POINTER = '(hover: hover) and (pointer: fine)'
const REDUCED = '(prefers-reduced-motion: reduce)'

/**
 * Lets a large call to action lean toward a mouse that is over it (`--mag-x`, `--mag-y`, which the
 * element's CSS turns into `translate`). It does nothing for a finger, a pen-less touch screen or
 * reduced motion, nothing for a control that is small, and it takes nothing away from the control:
 * the click target is the same, the focus ring is the same, the keyboard is untouched. The pull is
 * written once per frame, only while the pointer moves over the element, and removed the moment it
 * leaves (the CSS transition eases it back).
 */
export function useMagnetic<T extends HTMLElement>(enabled: boolean): RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    if (!window.matchMedia(FINE_POINTER).matches || window.matchMedia(REDUCED).matches) return

    let frame = 0
    let intensity = 1
    let x = 0
    let y = 0

    const write = () => {
      frame = 0
      const box = element.getBoundingClientRect()
      if (!isMagnetic(box)) return
      const pull = magneticOffset(x, y, box, intensity)
      element.style.setProperty('--mag-x', `${pull.x}px`)
      element.style.setProperty('--mag-y', `${pull.y}px`)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      x = event.clientX
      y = event.clientY
      if (!frame) frame = requestAnimationFrame(write)
    }
    const enter = () => {
      const value = Number.parseFloat(getComputedStyle(element).getPropertyValue('--motion-intensity'))
      intensity = Number.isFinite(value) ? value : 1
    }
    const reset = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      element.style.removeProperty('--mag-x')
      element.style.removeProperty('--mag-y')
    }

    element.addEventListener('pointerenter', enter)
    element.addEventListener('pointermove', move, { passive: true })
    element.addEventListener('pointerleave', reset)
    element.addEventListener('pointercancel', reset)
    return () => {
      reset()
      element.removeEventListener('pointerenter', enter)
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerleave', reset)
      element.removeEventListener('pointercancel', reset)
    }
  }, [enabled])

  return ref
}
