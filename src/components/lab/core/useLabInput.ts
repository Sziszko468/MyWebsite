import { useEffect, type RefObject } from 'react'
import type { LabClock } from './labClock'
import type { LabPointer } from './LabPointer'

/** Elements inside a stage that handle their own input: a press on them is not a press on the stage. */
const OWN_INPUT = 'a, button, input, select, textarea, label, [role="switch"], [data-lab-ui]'

/** How far one press of an arrow key moves the virtual pointer, in stage units. */
const KEY_STEP = 0.1

/**
 * Feeds a stage element's pointer, touch, pen and keyboard input to a LabPointer. Nothing here
 * touches React state: the pointer object is mutated in place and the scene reads it every frame.
 *
 *  - mouse, pen and touch share one path (pointer events); a press captures the pointer, so a drag
 *    that leaves the stage still ends cleanly;
 *  - a click or tap is a pulse; so are Enter and Space on the focused stage;
 *  - the arrow keys move a virtual pointer, so the stage is usable without a mouse;
 *  - the element gets `data-touched` after the first interaction, so its hint can fade away in CSS.
 *
 * The stage's box is measured once per burst of movement, not per event.
 */
export function useLabInput(
  ref: RefObject<HTMLElement | null>,
  pointer: LabPointer,
  clock: LabClock,
  enabled = true,
): void {
  useEffect(() => {
    const element = ref.current
    if (!element || !enabled) return

    let rect: DOMRect | null = null
    const measure = () => (rect ??= element.getBoundingClientRect())
    const forgetBox = () => {
      rect = null
    }

    const toStage = (event: PointerEvent) => {
      const box = measure()
      const width = Math.max(box.width, 1)
      const height = Math.max(box.height, 1)
      return {
        x: ((event.clientX - box.left) / width) * 2 - 1,
        y: -(((event.clientY - box.top) / height) * 2 - 1),
      }
    }

    const markTouched = () => {
      if (element.dataset.touched !== 'true') element.dataset.touched = 'true'
    }

    const ownInput = (event: Event) => event.target instanceof Element && event.target.closest(OWN_INPUT) !== null

    const onMove = (event: PointerEvent) => {
      if (ownInput(event) && !pointer.down) {
        pointer.inside = false
        return
      }
      const { x, y } = toStage(event)
      pointer.touch = event.pointerType === 'touch'
      pointer.setTarget(x, y)
    }

    const onDown = (event: PointerEvent) => {
      if (ownInput(event)) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      forgetBox()
      const { x, y } = toStage(event)
      pointer.press(x, y, event.pointerType === 'touch')
      pointer.pulse(x, y, clock.t, 1)
      markTouched()
      try {
        element.setPointerCapture(event.pointerId)
      } catch {
        // The pointer may already be gone; the press still counted.
      }
    }

    const onUp = (event: PointerEvent) => {
      pointer.release()
      if (event.pointerType === 'touch') pointer.leave()
      try {
        element.releasePointerCapture(event.pointerId)
      } catch {
        // Nothing to release.
      }
    }

    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && !pointer.down) pointer.leave()
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.target !== element) return
      let dx = 0
      let dy = 0
      switch (event.key) {
        case 'ArrowLeft':
          dx = -KEY_STEP
          break
        case 'ArrowRight':
          dx = KEY_STEP
          break
        case 'ArrowUp':
          dy = KEY_STEP
          break
        case 'ArrowDown':
          dy = -KEY_STEP
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          pointer.touch = false
          pointer.inside = true
          pointer.pulse(pointer.x, pointer.y, clock.t, 1)
          markTouched()
          return
        default:
          return
      }
      event.preventDefault()
      pointer.touch = false
      pointer.setTarget(pointer.x + dx, pointer.y + dy)
      markTouched()
    }

    const onBlur = () => pointer.leave()

    element.addEventListener('pointermove', onMove, { passive: true })
    element.addEventListener('pointerdown', onDown)
    element.addEventListener('pointerup', onUp)
    element.addEventListener('pointercancel', onUp)
    element.addEventListener('pointerleave', onLeave)
    element.addEventListener('keydown', onKey)
    element.addEventListener('blur', onBlur)
    window.addEventListener('scroll', forgetBox, { passive: true })
    window.addEventListener('resize', forgetBox, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(forgetBox)
    observer?.observe(element)

    return () => {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerdown', onDown)
      element.removeEventListener('pointerup', onUp)
      element.removeEventListener('pointercancel', onUp)
      element.removeEventListener('pointerleave', onLeave)
      element.removeEventListener('keydown', onKey)
      element.removeEventListener('blur', onBlur)
      window.removeEventListener('scroll', forgetBox)
      window.removeEventListener('resize', forgetBox)
      observer?.disconnect()
      pointer.rest()
    }
  }, [ref, pointer, clock, enabled])
}
