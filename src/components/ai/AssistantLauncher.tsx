import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useAiConfig } from '../../ai/availability'
import { launcherText } from '../../content/ai/launcher'
import { useI18n } from '../../i18n/useI18n'
import { splitLanguage } from '../../i18n/paths'
import styles from './Launcher.module.scss'

/**
 * The floating button, on every public page. It is the only part of the assistant in the main bundle and it is small: it asks
 * (when the browser is idle) whether the assistant is available at all and draws nothing if it is not. The panel, the AI SDK's
 * client and the conversation load only when the button is pressed (or, to feel instant, when a pointer or the keyboard reaches
 * it). It lifts itself above the things that stand along the bottom edge (the cookie notice, the shop's sticky request bar) so
 * it never covers them, it keeps clear of the home indicator, and it stays out of the way on the Control Room page itself.
 */

const loadPanel = () => import('./AssistantPanel')
const AssistantPanel = lazy(loadPanel)

/** How far the button must rise to clear the fixed bars that currently sit along the bottom of the screen (marked `data-bottom-bar`). */
function useClearance(active: boolean): number {
  const [lift, setLift] = useState(0)
  useEffect(() => {
    if (!active) return
    let frame = 0
    const measure = () => {
      frame = 0
      let needed = 0
      for (const bar of document.querySelectorAll<HTMLElement>('[data-bottom-bar]')) {
        const style = getComputedStyle(bar)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        const box = bar.getBoundingClientRect()
        if (box.height === 0 || box.top >= window.innerHeight || box.bottom < window.innerHeight - 4) continue
        needed = Math.max(needed, window.innerHeight - box.top)
      }
      setLift((previous) => (Math.abs(previous - needed) < 1 ? previous : Math.round(needed)))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const mutations = new MutationObserver(schedule)
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-visible', 'inert', 'hidden', 'class', 'style'] })
    window.addEventListener('resize', schedule)
    document.addEventListener('transitionend', schedule, true)
    window.visualViewport?.addEventListener('resize', schedule)
    schedule()
    return () => {
      mutations.disconnect()
      window.removeEventListener('resize', schedule)
      document.removeEventListener('transitionend', schedule, true)
      window.visualViewport?.removeEventListener('resize', schedule)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [active])
  return lift
}

export function AssistantLauncher() {
  const { lang } = useI18n()
  const label = launcherText.open[lang]
  const { pathname } = useLocation()
  const { config } = useAiConfig()
  // The page the panel was opened on: moving to another page closes it (a modal panel must not stay over a page it was not opened on).
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const open = openedAt === pathname
  const button = useRef<HTMLButtonElement | null>(null)
  const here = splitLanguage(pathname).rest.replace(/\/+$/, '')
  const offered = Boolean(config?.available && config.languages.includes(lang)) && here !== '/control-room' && here !== '/privacy'
  const lift = useClearance(offered)

  const close = useCallback(() => {
    setOpenedAt(null)
    // The button is drawn again in the same render; focus goes back to it once it is.
    requestAnimationFrame(() => button.current?.focus({ preventScroll: true }))
  }, [])

  if (!offered) return null
  return (
    <>
      {!open && (
        <button
          ref={button}
          type="button"
          className={styles.launcher}
          style={{ '--assistant-lift': `${lift}px` } as React.CSSProperties}
          aria-haspopup="dialog"
          aria-label={label}
          title={label}
          onPointerEnter={() => void loadPanel()}
          onFocus={() => void loadPanel()}
          onClick={() => setOpenedAt(pathname)}
        >
          <span className={styles.mark} aria-hidden="true">
            <svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
              <path d="M5 8a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H15l-6 5v-5H8a3 3 0 0 1-3-3z" />
              <path d="M11 11.5h10M11 15.5h6" />
            </svg>
          </span>
          <span className={styles.led} aria-hidden="true" />
        </button>
      )}
      {open && (
        <Suspense fallback={null}>
          <AssistantPanel onClose={close} />
        </Suspense>
      )}
    </>
  )
}
