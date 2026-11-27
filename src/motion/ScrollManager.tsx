import { Component, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import { createScrollMemory, documentArrival, entryKeyOf, OWN_MOVE, readsOnLeave, restoreTarget, scrollAction, trackEntry } from './scrollRestoration'

/** How many frames to wait for a page that is still being drawn to become tall enough to scroll to a saved position (about two seconds at 60 Hz, less on a faster screen). */
const RESTORE_FRAMES = 120

interface LeaveWatchProps {
  entry: string
  /** Whether the window should be read as the previous entry is left (`readsOnLeave`). */
  read: boolean
  onLeave: (read: boolean) => void
}

/**
 * React asks this for a "snapshot" once the next page is ready and BEFORE it touches the document: the last moment at which the window still shows the entry being
 * left. An effect's cleanup is too late for that: by then the next page is there, and a shorter one has already pulled the scroll position back. Only a class can
 * ask for this moment. When the whole frame goes away instead, it is unmounted before the page that follows it in the tree is removed.
 */
class LeaveWatch extends Component<LeaveWatchProps> {
  getSnapshotBeforeUpdate(previous: LeaveWatchProps) {
    if (previous.entry !== this.props.entry) this.props.onLeave(this.props.read)
    return null
  }

  // React requires this beside getSnapshotBeforeUpdate; there is nothing to do after the change.
  componentDidUpdate() {}

  componentWillUnmount() {
    this.props.onLeave(true)
  }

  render() {
    return null
  }
}

/**
 * The page frame's scroll manager, in place of the browser's own restoration (which cannot work for
 * a page drawn by script and is switched off here).
 *
 * - A new page starts at the top, instantly, and so does a page opened by its address in a tab that has shown others.
 * - Back, Forward and a reload return to where that page was left: positions are recorded while the visitor
 *   scrolls (one passive listener, one reading per frame) under the history entry's own key, taken once
 *   more from the window itself as the entry is left, and restored once the page is tall enough; a page
 *   that is still drawing is waited for, for a moment, and then scrolled as far as it goes. Leaving it
 *   again during that wait keeps the saved position.
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
  const entry = entryKeyOf(location.key, location.pathname)
  const [memory] = useState(() => createScrollMemory())
  const previousPath = useRef<string | null>(null)
  const visit = useRef<ReturnType<typeof trackEntry> | null>(null)

  // The browser's restoration would fight this one.
  useEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  // Record the position under the current entry while the visitor scrolls. It is left through LeaveWatch below, before this effect is cleaned up.
  useEffect(() => {
    const tracked = trackEntry(entry, window, memory)
    visit.current = tracked
    return () => tracked.stop()
  }, [entry, memory])

  useEffect(() => {
    // The first page of a visit, opened by its address (not reloaded, not returned to): there is nothing of its own to restore.
    const fresh = previousPath.current === null && documentArrival() === 'navigate'
    const samePage = previousPath.current === path
    previousPath.current = path
    const action = scrollAction({ samePage, hash, navigation, fresh })
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
      const saved = memory.saved(entry)
      const wanted = restoreTarget(saved, document.documentElement.scrollHeight, window.innerHeight)
      if (!wanted) {
        window.scrollTo({ top: 0, behavior: 'instant' })
      } else {
        // Until the page is tall enough it waits at the top, so nothing is shown half way and nothing moves under the visitor when the rest of the page arrives.
        if (!wanted.reachable) window.scrollTo({ top: 0, behavior: 'instant' })
        let attempts = 0
        const waitingAt = window.scrollY
        // Until it is placed, the window does not show where the visitor was: leaving now must not write that over the saved position.
        memory.hold(entry, waitingAt)
        const place = () => {
          // The visitor moved the page themselves: leave it.
          if (Math.abs(window.scrollY - waitingAt) > OWN_MOVE) {
            memory.release()
            return
          }
          const target = restoreTarget(saved, document.documentElement.scrollHeight, window.innerHeight)
          if (target && (target.reachable || attempts >= RESTORE_FRAMES)) {
            memory.release()
            window.scrollTo({ top: target.y, behavior: 'instant' })
            return
          }
          if (attempts++ < RESTORE_FRAMES) frame = requestAnimationFrame(place)
        }
        place()
      }
    }
    return () => {
      cancelAnimationFrame(frame)
      memory.release()
    }
    // The key says which history entry this is; the path and the fragment say whether the page changed.
  }, [path, hash, navigation, entry, memory])

  return <LeaveWatch entry={entry} read={readsOnLeave({ navigation, key: location.key, hash })} onLeave={(read) => visit.current?.leave(read)} />
}
