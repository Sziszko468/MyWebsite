import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { createFullscreenController, type FullscreenController, type FullscreenMode } from './fullscreen'

export interface FullscreenState {
  mode: FullscreenMode
  /** True in either mode. */
  active: boolean
  toggle: () => void
  exit: () => void
}

/** Marks the page while an experiment is laid over the viewport, so the page behind it cannot scroll. */
const EXPANDED_FLAG = 'data-lab-expanded'

/**
 * Full screen for the element `ref` points at (see `fullscreen.ts`). It adds what a controller
 * cannot know about the page: Escape leaves the expanded fallback (the browser does it for the
 * native mode), the page stops scrolling behind an expanded experiment, and everything is undone
 * when the experiment unmounts.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>): FullscreenState {
  const [mode, setMode] = useState<FullscreenMode>('off')
  const controller = useRef<FullscreenController | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const created = createFullscreenController(document, element, setMode)
    controller.current = created
    return () => {
      created.dispose()
      if (controller.current === created) controller.current = null
    }
  }, [ref])

  useEffect(() => {
    if (mode !== 'expanded') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) void controller.current?.exit()
    }
    document.addEventListener('keydown', onKey)
    document.documentElement.setAttribute(EXPANDED_FLAG, '')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.removeAttribute(EXPANDED_FLAG)
    }
  }, [mode])

  const toggle = useCallback(() => void controller.current?.toggle(), [])
  const exit = useCallback(() => void controller.current?.exit(), [])

  return { mode, active: mode !== 'off', toggle, exit }
}
