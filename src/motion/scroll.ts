import { useEffect, useRef, type RefObject } from 'react'
import { observeInView } from './inView'

/**
 * Scroll-linked motion without hijacking the scroll. There is one passive scroll listener for the
 * whole page, shared by everything that follows the scroll position, and it exists only while at
 * least one such element is on screen. Each frame (one `requestAnimationFrame`, however many
 * elements) first reads every element's position, then writes every result, so nothing is laid out
 * twice. The scroll itself is never touched: nothing here calls preventDefault, scrollTo or
 * scroll-snap, and what moves is only a transform or an opacity set through a CSS variable.
 */

/** A subscriber reads (measures) first and returns what it will write, or nothing. */
export type ScrollReader = () => (() => void) | void

const readers = new Set<ScrollReader>()
let frame = 0
let attached = false

function run() {
  frame = 0
  const writes: Array<() => void> = []
  for (const read of readers) {
    const write = read()
    if (write) writes.push(write)
  }
  for (const write of writes) write()
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(run)
}

function attach() {
  if (attached) return
  attached = true
  window.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule, { passive: true })
}

function detach() {
  if (!attached) return
  attached = false
  window.removeEventListener('scroll', schedule)
  window.removeEventListener('resize', schedule)
  if (frame) cancelAnimationFrame(frame)
  frame = 0
}

/** Runs `read` on the next frame and on every scroll or resize frame until the returned function is called. */
export function subscribeScroll(read: ScrollReader): () => void {
  readers.add(read)
  attach()
  schedule()
  return () => {
    readers.delete(read)
    if (readers.size === 0) detach()
  }
}

/** For tests and the browser checks: how many things follow the scroll right now. */
export function scrollSubscribers(): number {
  return readers.size
}

/**
 * Where an element is in its pass through the viewport: 0 when its top edge enters at the bottom,
 * 1 when its bottom edge leaves at the top. Clamped, so an element outside the viewport sits at
 * one end.
 */
export function passProgress(top: number, height: number, viewport: number): number {
  const span = viewport + height
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, (viewport - top) / span))
}

/** The same pass as -1 (just entering) … 0 (centred) … 1 (just leaving), for movement that crosses the middle. */
export function passOffset(progress: number): number {
  return progress * 2 - 1
}

const round = (value: number) => Math.round(value * 1000) / 1000

/**
 * Writes `--sp` (0 to 1) and `--sp-c` (-1 to 1) on the element while it is on screen, and nothing
 * while it is not: the listener is attached only while the element is within a screen of view. CSS
 * decides what the numbers do (a parallax shift, the fill of a line, a fade), multiplied by
 * `--motion-intensity` and `--motion-parallax`, so reduced motion and touch screens scale it down
 * without any code here knowing. Under reduced motion nothing is subscribed at all.
 */
export function useScrollProgress<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let stopScroll: (() => void) | null = null
    let lastSp = -1
    const read: ScrollReader = () => {
      const box = element.getBoundingClientRect()
      const sp = round(passProgress(box.top, box.height, window.innerHeight))
      if (sp === lastSp) return
      return () => {
        lastSp = sp
        element.style.setProperty('--sp', String(sp))
        element.style.setProperty('--sp-c', String(round(passOffset(sp))))
      }
    }

    const stopWatching = observeInView(
      element,
      (entry) => {
        if (entry.isIntersecting && !stopScroll) stopScroll = subscribeScroll(read)
        else if (!entry.isIntersecting && stopScroll) {
          stopScroll()
          stopScroll = null
        }
      },
      { threshold: 0, rootMargin: '25% 0px 25% 0px' },
    )

    return () => {
      stopWatching()
      stopScroll?.()
      element.style.removeProperty('--sp')
      element.style.removeProperty('--sp-c')
    }
  }, [])

  return ref
}
