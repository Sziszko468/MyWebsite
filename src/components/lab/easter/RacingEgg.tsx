import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useLocalized } from '../core/useLabText'
import { useMedia } from '../experience/useMedia'
import { NFSU2, TRANSITION_MS, TRANSITION_REDUCED_MS } from './eggConfig'
import { eggText } from './eggText'
import styles from './RacingEgg.module.scss'

/**
 * The hidden racing experience: a red wipe with speed lines covers the screen (the loading state), and then
 * says plainly what the other site is. nfsu2.xyz forbids being shown inside another page (it answers
 * `x-frame-options: DENY` and `frame-ancestors 'none'`, see eggConfig.ts) and this site does not try to get
 * around that: there is no frame. The screen offers OPEN NFSU2, which opens the site in a new tab, and a way
 * back to the Lab. Nothing leaves this page until the visitor chooses it. Escape closes the screen at any moment.
 *
 * It is a dialog while it is up: the page behind does not scroll, the focus is on it and Tab stays on its controls.
 */
export function RacingEggLayer({ open, onClose }: { open: boolean; onClose(): void }) {
  const t = useLocalized(eggText)
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)
  const openLink = useRef<HTMLAnchorElement>(null)
  const close = useRef(onClose)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    const rootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    root.current?.focus()

    const timer = window.setTimeout(() => setReady(true), reduced ? TRANSITION_REDUCED_MS : TRANSITION_MS)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      setReady(false)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      document.documentElement.style.overflow = rootOverflow
      previous?.focus?.()
    }
  }, [open, reduced])

  // The choices appear when the wipe is over; the focus goes to the first of them.
  useEffect(() => {
    if (open && ready) openLink.current?.focus()
  }, [open, ready])

  if (!open) return null

  // Tab goes round the layer's own controls (two, once the choices are there; none while the wipe plays).
  const keepFocusInside = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button')]
    if (controls.length === 0) return event.preventDefault()
    const first = controls[0]
    const last = controls[controls.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      ref={root}
      className={styles.layer}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-theme="dark"
      data-egg
      data-phase={ready ? 'ready' : 'wipe'}
      onKeyDown={keepFocusInside}
    >
      <div className={styles.intro}>
        <span className={styles.streaks} aria-hidden="true" />
        <div className={styles.content}>
          <h1 id={titleId} className={styles.title}>
            {ready ? t.readyTitle : t.intro}
          </h1>
          <p className={styles.note} role="status">
            {ready ? t.readyNote : t.leaving}
          </p>
          {ready ? (
            <div className={styles.actions}>
              {/* A new tab, with no referrer and no handle on this page: the other site is never told where the visitor came from. */}
              <a ref={openLink} className={styles.open} href={NFSU2.url} target="_blank" rel="noopener noreferrer">
                {t.open}
                <span className="visually-hidden"> {t.newTab}</span>
              </a>
              <button type="button" className={styles.back} onClick={onClose}>
                {t.back}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
