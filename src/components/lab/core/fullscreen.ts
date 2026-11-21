/**
 * Full screen for an experiment, without a dependency and without a failure mode that traps the
 * visitor.
 *
 * Two modes, one way out:
 *
 *  - `native`: the browser's Fullscreen API on the experiment's own element (so the panel, the dock
 *    and the way out are inside it). Escape and the browser's own controls leave it, and the
 *    controller notices.
 *  - `expanded`: the same element laid over the viewport by CSS. It is what an iPhone's Safari
 *    (which has no Fullscreen API for ordinary elements) gets, and what any browser gets when it
 *    refuses the request (a permissions policy, a missing user gesture). Escape leaves it too.
 *
 * The controller touches only the few members of `document` and the element that it names, so a
 * test can stand a fake in for both. It owns one listener and removes it in `dispose`, which also
 * leaves the native mode: an experiment that unmounts (the visitor followed a link) never leaves
 * the browser in full screen with nothing to show.
 */

export type FullscreenMode = 'off' | 'native' | 'expanded'

export interface FullscreenDocument {
  readonly fullscreenEnabled?: boolean
  readonly fullscreenElement: Element | null
  exitFullscreen?: () => Promise<void>
  addEventListener: (type: 'fullscreenchange', listener: () => void) => void
  removeEventListener: (type: 'fullscreenchange', listener: () => void) => void
}

export interface FullscreenTarget {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>
}

export interface FullscreenController {
  readonly mode: () => FullscreenMode
  /** Whether the browser offers the real thing here (the fallback is always there). */
  readonly native: () => boolean
  enter: () => Promise<void>
  exit: () => Promise<void>
  toggle: () => Promise<void>
  dispose: () => void
}

export function createFullscreenController(
  doc: FullscreenDocument,
  element: FullscreenTarget & Element,
  onChange: (mode: FullscreenMode) => void,
): FullscreenController {
  let mode: FullscreenMode = 'off'
  let disposed = false

  const set = (next: FullscreenMode) => {
    if (disposed || next === mode) return
    mode = next
    onChange(next)
  }

  const nativeAvailable = () => doc.fullscreenEnabled === true && typeof element.requestFullscreen === 'function'

  const onNativeChange = () => {
    if (doc.fullscreenElement === element) set('native')
    // The browser left it (Escape, its own button): the same as our own exit.
    else if (mode === 'native') set('off')
  }
  doc.addEventListener('fullscreenchange', onNativeChange)

  const enter = async () => {
    if (mode !== 'off' || disposed) return
    if (nativeAvailable()) {
      try {
        await element.requestFullscreen?.({ navigationUI: 'hide' })
        // `fullscreenchange` normally got here first; this covers a browser that fires it late.
        if (!disposed && mode === 'off') set('native')
        return
      } catch {
        // Refused: the fallback below is the same experience with the viewport as the screen.
      }
    }
    set('expanded')
  }

  const exit = async () => {
    if (mode === 'off') return
    if (mode === 'native' && doc.fullscreenElement === element) {
      try {
        await doc.exitFullscreen?.()
      } catch {
        // Already gone.
      }
    }
    set('off')
  }

  return {
    mode: () => mode,
    native: nativeAvailable,
    enter,
    exit,
    toggle: () => (mode === 'off' ? enter() : exit()),
    dispose: () => {
      if (disposed) return
      doc.removeEventListener('fullscreenchange', onNativeChange)
      if (mode === 'native' && doc.fullscreenElement === element) doc.exitFullscreen?.().catch(() => undefined)
      disposed = true
    },
  }
}
