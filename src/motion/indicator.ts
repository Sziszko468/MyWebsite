import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * One marker that glides to the chosen item of a row (the header's red line under the current page, the pill behind the current language). The row gets the item's
 * box as custom properties relative to itself (`--ind-x`, `--ind-y` in px; `--ind-w`, `--ind-h` unitless, for a scale) and `data-indicator="on"`; its stylesheet
 * moves one element with a transform, so nothing is laid out again. Until the marker is placed, and wherever this does not run, the row marks the current item by its
 * own style, so the current one is shown either way.
 */

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** The item's box inside its row, in whole pixels; `null` for an item that has no size (hidden, or not drawn). */
export function indicatorBox(row: Box, item: Box): { x: number; y: number; width: number; height: number } | null {
  if (item.width <= 0 || item.height <= 0) return null
  return { x: Math.round(item.left - row.left), y: Math.round(item.top - row.top), width: Math.max(1, Math.round(item.width)), height: Math.max(1, Math.round(item.height)) }
}

export function placeIndicator(row: HTMLElement, item: Element | null): void {
  const box = item ? indicatorBox(row.getBoundingClientRect(), item.getBoundingClientRect()) : null
  if (!box) {
    row.dataset.indicator = 'none'
    return
  }
  row.style.setProperty('--ind-x', `${box.x}px`)
  row.style.setProperty('--ind-y', `${box.y}px`)
  row.style.setProperty('--ind-w', String(box.width))
  row.style.setProperty('--ind-h', String(box.height))
  row.dataset.indicator = 'on'
}

/**
 * Keeps a row's marker on the first element that matches `selector` (a list of selectors, tried in order, so "the one being opened" can come before "the current
 * one"). Placed after layout, again whenever `key` changes, when the row changes size (a menu opening counts) and when the fonts arrive. The first placement is
 * instant; `data-ready` lets every later one glide.
 */
export function useSlidingIndicator<T extends HTMLElement>(selectors: readonly string[], key: string, enabled = true): RefObject<T | null> {
  const row = useRef<T | null>(null)
  const list = selectors.join('\n')

  useLayoutEffect(() => {
    const element = row.current
    if (!enabled || !element) return

    let alive = true
    const place = () => {
      if (!alive) return
      let item: Element | null = null
      for (const selector of list.split('\n')) {
        item = element.querySelector(selector)
        if (item) break
      }
      placeIndicator(element, item)
    }

    place()
    const ready = requestAnimationFrame(() => {
      element.dataset.ready = ''
    })
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    resize?.observe(element)
    void document.fonts?.ready.then(place)
    return () => {
      alive = false
      cancelAnimationFrame(ready)
      resize?.disconnect()
    }
  }, [enabled, list, key])

  return row
}
