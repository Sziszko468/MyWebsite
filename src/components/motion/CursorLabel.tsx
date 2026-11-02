import { useEffect, useRef } from 'react'
import { labelFor, placeLabel } from '../../motion/cursorLabel'
import styles from './CursorLabel.module.scss'

const FINE_POINTER = '(hover: hover) and (pointer: fine)'
const REDUCED = '(prefers-reduced-motion: reduce)'

/**
 * A small label that follows the mouse over the things that say what a click does (a project, a
 * service, a Lab experience: any element with `data-cursor="Open"`). It is an addition: the native
 * cursor stays, text can be selected, forms can be filled, and the label takes no input, is hidden
 * from assistive technology (the link it labels already has its name) and is not in the tab order.
 * It exists only for a mouse (a fine pointer that can hover); a touch screen never gets one, and
 * neither does reduced motion (the label is a moving thing). It goes away over a text field, while a
 * button is held (a selection or a drag is starting), while the page scrolls and when the pointer
 * leaves the window. One listener, one write per frame.
 */
export function CursorLabel() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (!window.matchMedia(FINE_POINTER).matches || window.matchMedia(REDUCED).matches) return

    let frame = 0
    let x = 0
    let y = 0
    let text: string | null = null
    let held = false
    let shown = false

    const hide = () => {
      if (!shown) return
      shown = false
      delete element.dataset.visible
    }
    const write = () => {
      frame = 0
      if (!text || held) return hide()
      if (element.textContent !== text) element.textContent = text
      const box = element.getBoundingClientRect()
      const at = placeLabel({ x, y }, { width: box.width, height: box.height }, { width: window.innerWidth, height: window.innerHeight })
      element.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`
      if (!shown) {
        shown = true
        element.dataset.visible = ''
      }
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(write)
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      x = event.clientX
      y = event.clientY
      text = labelFor(event.target instanceof Element ? event.target : null)
      if (text) schedule()
      else hide()
    }
    const down = () => {
      held = true
      hide()
    }
    const up = () => {
      held = false
    }
    const away = () => {
      text = null
      hide()
    }

    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerdown', down, { passive: true })
    document.addEventListener('pointerup', up, { passive: true })
    document.addEventListener('scroll', away, { passive: true, capture: true })
    document.documentElement.addEventListener('pointerleave', away)
    window.addEventListener('blur', away)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('scroll', away, { capture: true })
      document.documentElement.removeEventListener('pointerleave', away)
      window.removeEventListener('blur', away)
    }
  }, [])

  return <div ref={ref} className={styles.label} aria-hidden="true" />
}
