import { useEffect, useRef, useState, type RefObject } from 'react'
import { clamp } from './heroMath'

/**
 * Live input for the scene. These values change many times a second, so they live in a plain
 * mutable object that the render loop reads, never in React state.
 */
export interface HeroInputs {
  /** Cursor position, -1..1 on each axis (y up). Stays 0 on touch screens. */
  pointerX: number
  pointerY: number
  /** How far the hero has scrolled out of view, 0..1. */
  scroll: number
  /** performance.now()/1000 of the last click on the hero; -Infinity before the first. */
  pulseAt: number
}

export function createHeroInputs(): HeroInputs {
  return { pointerX: 0, pointerY: 0, scroll: 0, pulseAt: -Infinity }
}

const INTERACTIVE = 'a, button, input, select, textarea, [role="button"]'

/**
 * Owns the inputs object, wires cursor, scroll and click to it and reports whether the hero is
 * on screen. Listeners are passive, write to a ref and are removed on unmount.
 */
export function useHeroInputs(section: RefObject<HTMLElement | null>): { inputs: RefObject<HeroInputs>; inView: boolean } {
  const inputs = useRef<HeroInputs>(createHeroInputs())
  const [inView, setInView] = useState(true)
  const initial = useRef(true)

  useEffect(() => {
    const element = section.current
    if (!element) return

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      inputs.current.pointerX = clamp((event.clientX / window.innerWidth) * 2 - 1, -1, 1)
      inputs.current.pointerY = clamp(1 - (event.clientY / window.innerHeight) * 2, -1, 1)
    }

    const onScroll = () => {
      const rect = element.getBoundingClientRect()
      inputs.current.scroll = clamp(-rect.top / Math.max(rect.height, 1))
    }

    // A click on empty hero space sends a light impulse; links and buttons are left alone.
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return
      inputs.current.pulseAt = performance.now() / 1000
    }

    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0 })
    observer.observe(element)

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    element.addEventListener('pointerdown', onPointerDown, { passive: true })
    if (initial.current) {
      initial.current = false
      onScroll()
    }

    return () => {
      observer.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('scroll', onScroll)
      element.removeEventListener('pointerdown', onPointerDown)
    }
  }, [section])

  return { inputs, inView }
}
