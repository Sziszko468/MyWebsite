import { useEffect, useId, useRef } from 'react'
import { useLocalized } from '../core/useLabText'
import { useMedia } from '../experience/useMedia'
import { leaveFor, NFSU2, TRANSITION_MS, TRANSITION_REDUCED_MS } from './eggConfig'
import { eggText } from './eggText'
import styles from './RacingEgg.module.scss'

/**
 * The hidden racing experience: a red wipe with speed lines covers the screen, says where it is going,
 * and then takes the whole tab to the other site (nfsu2.xyz, which forbids being shown inside another
 * page, so there is no frame). There is nothing to click through: Escape during the transition stays
 * here, and Back from the other site brings the visitor to the Lab as it was.
 *
 * It is a dialog while it is up: the page behind does not scroll, the focus is on it and Tab stays put.
 */
export function RacingEggLayer({ open, onClose }: { open: boolean; onClose(): void }) {
  const t = useLocalized(eggText)
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const titleId = useId()
  const root = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
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

    const timer = window.setTimeout(() => leaveFor(NFSU2.url), reduced ? TRANSITION_REDUCED_MS : TRANSITION_MS)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
    }
    // Back from the other site may show this page as it was left, with the transition still up: put it away.
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) close.current()
    }
    document.addEventListener('keydown', onKey)
    window.addEventListener('pageshow', onShow)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('pageshow', onShow)
      document.body.style.overflow = overflow
      document.documentElement.style.overflow = rootOverflow
      previous?.focus?.()
    }
  }, [open, reduced])

  if (!open) return null
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
      onKeyDown={(event) => {
        if (event.key === 'Tab') event.preventDefault()
      }}
    >
      <div className={styles.intro}>
        <span className={styles.streaks} aria-hidden="true" />
        <h1 id={titleId} className={styles.title}>
          {t.intro}
        </h1>
        <p className={styles.note} role="status">
          {t.leaving}
        </p>
      </div>
    </div>
  )
}
