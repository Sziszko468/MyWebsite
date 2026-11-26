/**
 * Where each history entry was scrolled to, so Back and Forward return to the same spot instead of
 * the top (or wherever the browser guesses once the page is drawn by script). The positions are
 * kept for this tab only (sessionStorage, guarded: it can be blocked), by the router's per-entry
 * key, and only the most recent ones. The decisions are plain functions so they are tested
 * without a browser.
 */

import { pageKeyOf } from './navigation'

const STORAGE_KEY = 'cc:scroll-positions'
export const MAX_REMEMBERED = 60

export type PositionMap = Record<string, number>

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function readPositions(store: Pick<Storage, 'getItem'> | null = storage()): PositionMap {
  try {
    const raw = store?.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value >= 0))
  } catch {
    return {}
  }
}

/** Adds a position and drops the oldest beyond the cap (an object keeps insertion order, so a re-set moves to the end). */
export function remember(positions: PositionMap, key: string, y: number, max = MAX_REMEMBERED): PositionMap {
  const next = { ...positions }
  delete next[key]
  next[key] = Math.max(0, Math.round(y))
  const keys = Object.keys(next)
  for (const old of keys.slice(0, Math.max(0, keys.length - max))) delete next[old]
  return next
}

export function writePositions(positions: PositionMap, store: Pick<Storage, 'setItem'> | null = storage()): void {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(positions))
  } catch {
    // Not remembered; Back then starts at the top, which is what it did before.
  }
}

/**
 * Where to scroll to, given what was remembered and how tall the page is now: never past the end
 * (a page that has not finished drawing is shorter than it will be, and the caller tries again).
 */
export function restoreTarget(saved: number | undefined, pageHeight: number, viewport: number): { y: number; reachable: boolean } | null {
  if (saved === undefined) return null
  const max = Math.max(0, pageHeight - viewport)
  return { y: Math.min(saved, max), reachable: saved <= max + 1 }
}

/**
 * The key a history entry's position is kept under. Every page opened by its address gets the router's same first key, so that one is told apart by its page:
 * otherwise the position left on one page would be given to the next page opened in the same tab.
 */
export const entryKeyOf = (key: string, pathname: string): string => (key === 'default' ? `default ${pageKeyOf(pathname)}` : key)

/** How the document itself was reached: typed or followed from elsewhere (`navigate`), reloaded, or returned to. Unknown counts as `navigate`. */
export function documentArrival(timing: Pick<Performance, 'getEntriesByType'> | undefined = typeof performance === 'undefined' ? undefined : performance): string {
  const entry = timing?.getEntriesByType('navigation')[0] as { type?: string } | undefined
  return entry?.type ?? 'navigate'
}

/** What a navigation should do about the scroll position. */
export type ScrollAction = 'keep' | 'top' | 'restore' | 'hash'

/**
 * `hash`: the address names an element. `restore`: Back or Forward to a page that was left at some
 * position, or a reload. `keep`: the same page in another language stays where it is. Anything else starts at the top,
 * and so does a page that was opened afresh by its address (`fresh`): the router calls that a POP too.
 */
export function scrollAction(input: { samePage: boolean; hash: string; navigation: 'POP' | 'PUSH' | 'REPLACE'; fresh?: boolean }): ScrollAction {
  if (input.hash) return 'hash'
  if (input.samePage) return 'keep'
  return input.navigation === 'POP' && !input.fresh ? 'restore' : 'top'
}
