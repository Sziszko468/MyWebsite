import { useEffect, useRef, useState } from 'react'
import type { FullscreenState } from '../core/useFullscreen'
import { useLabText } from '../core/useLabText'
import styles from './LabFullscreen.module.scss'

function EnterIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ExitIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M8 3v5H3M17 8h-5V3M12 17v-5h5M3 12h5v5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The full-screen switch of an experiment: one button whose name says what pressing it does, and a
 * polite status line that says what just happened (the browser's own exit, Escape, goes through the
 * same state, so the line and the button are never out of step).
 */
export function LabFullscreen({ state }: { state: FullscreenState }) {
  const { text } = useLabText()
  const [announcement, setAnnouncement] = useState('')
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setAnnouncement(state.active ? text.fullscreen.entered : text.fullscreen.left)
  }, [state.active, text.fullscreen.entered, text.fullscreen.left])

  const label = state.active ? text.fullscreen.exit : text.fullscreen.enter

  return (
    <>
      <button
        type="button"
        className={styles.button}
        data-active={state.active}
        data-fullscreen-mode={state.mode}
        aria-label={label}
        title={label}
        onClick={state.toggle}
      >
        {state.active ? <ExitIcon /> : <EnterIcon />}
        <span className={styles.word} aria-hidden="true">
          {state.active ? text.fullscreen.exitShort : text.fullscreen.enterShort}
        </span>
      </button>
      <p className="visually-hidden" role="status">
        {announcement}
      </p>
    </>
  )
}
