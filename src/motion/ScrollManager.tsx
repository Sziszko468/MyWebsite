import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { readPositions, remember, restoreTarget, scrollAction, writePositions, type PositionMap } from './scrollRestoration'

/** How many frames to wait for a page that is still being drawn to become tall enough to scroll to a saved position. */
const RESTORE_FRAMES = 40

/**
 * The page frame's scroll manager, in place of the browser's own restoration (which cannot work for
 * a page drawn by script and is switched off here).
 *
 * - A new page starts at the top, instantly.
 * - Back and Forward return to where that page was left: positions are recorded while the visitor
 *   scrolls (one passive listener, one write per frame) under the history entry's own key, and
 *   restored once the page is tall enough; a page that is still drawing is waited for, for a
 *   moment, and then scrolled as far as it goes.
 * - The same page in another language stays where it is.
 * - An address with a #fragment scrolls to that element once the page has drawn it (the browser
 *   itself cannot, because the page is drawn by script after it has looked for the target).
 *
 * It never scrolls while the visitor is scrolling: a restore that finds the page already moved by
 * the visitor (a wheel, a touch, a key) gives up.
 */
export function ScrollManager({ path, hash }: { path: string; hash: string }) {
  const location = useLocation()
  const navigation = useNavigationType()
  const positions = useRef<PositionMap | null>(null)
  const previousPath = useRef<string | null>(null)
  // The entry the page is on, set in the commit itself (a layout effect), so a scroll event that the
  // browser fires because the new page is shorter than the old one is not recorded against the old entry.
  const currentKey = useRef(location.key)
  useLayoutEffect(() => {
    currentKey.current = location.key
  }, [location.key])

  // The browser's restoration would fight this one.
  useEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  // Record the position under the current entry while the visitor scrolls.
  useEffect(() => {
    positions.current ??= readPositions()
    let frame = 0
    const key = location.key
    const save = () => {
      frame = 0
      if (currentKey.current !== key) return
      positions.current = remember(positions.current ?? {}, key, window.scrollY)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(save)
    }
    const flush = () => {
      if (frame) cancelAnimationFrame(frame)
      save()
      writePositions(positions.current ?? {})
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', flush)
      // Leaving the entry: remember where it was left, but not the top a new page is about to scroll to.
      if (frame) cancelAnimationFrame(frame)
      writePositions(positions.current ?? {})
    }
  }, [location.key])

  useEffect(() => {
    const samePage = previousPath.current === path
    previousPath.current = path
    const action = scrollAction({ samePage, hash, navigation })
    let frame = 0

    if (action === 'top') {
      window.scrollTo({ top: 0, behavior: 'instant' })
    } else if (action === 'hash') {
      const id = decodeURIComponent(hash.slice(1))
      let attempts = 0
      const seek = () => {
        const target = document.getElementById(id)
        if (target) target.scrollIntoView({ block: 'start' })
        else if (attempts++ < 30) frame = requestAnimationFrame(seek)
      }
      seek()
    } else if (action === 'restore') {
      const saved = (positions.current ?? readPositions())[location.key]
      const wanted = restoreTarget(saved, document.documentElement.scrollHeight, window.innerHeight)
      if (!wanted) {
        window.scrollTo({ top: 0, behavior: 'instant' })
      } else {
        let attempts = 0
        let placed = window.scrollY
        const place = () => {
          // The visitor moved the page themselves: leave it.
          if (Math.abs(window.scrollY - placed) > 2 && attempts > 0) return
          const target = restoreTarget(saved, document.documentElement.scrollHeight, window.innerHeight)
          if (target) {
            window.scrollTo({ top: target.y, behavior: 'instant' })
            placed = window.scrollY
            if (target.reachable) return
          }
          if (attempts++ < RESTORE_FRAMES) frame = requestAnimationFrame(place)
        }
        place()
      }
    }
    return () => cancelAnimationFrame(frame)
    // The key says which history entry this is; the path and the fragment say whether the page changed.
  }, [path, hash, navigation, location.key])

  return null
}
