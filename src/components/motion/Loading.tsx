import { useEffect, useState } from 'react'
import { LOADING_DELAY_MS, usePendingCount } from '../../motion/loading'
import { useCommonText } from '../../shop/hooks'
import { cx } from '../../utils/cx'
import styles from './Loading.module.scss'

/**
 * The page-level loading indicator: a slim line along the top that sweeps while a page's code is on
 * its way (motion/loading.ts). It shows only if the wait is longer than a blink, never covers
 * content, takes no input and is announced politely ("Loading…") instead of by motion alone. Under
 * reduced motion the line stands still but is still there: a status is not decoration.
 */
export function LoadingBar() {
  const pending = usePendingCount() > 0
  const [shown, setShown] = useState(false)
  const common = useCommonText()

  useEffect(() => {
    if (!pending) {
      // Hiding is not a state update in an effect: it is the timer's cleanup, so the bar goes when the wait ends.
      return
    }
    const timer = setTimeout(() => setShown(true), LOADING_DELAY_MS)
    return () => {
      clearTimeout(timer)
      setShown(false)
    }
  }, [pending])

  return (
    <div className={styles.bar} data-active={shown || undefined} role="status" aria-live="polite">
      <span className={styles.line} aria-hidden="true" />
      <span className="visually-hidden">{shown ? common.loading : ''}</span>
    </div>
  )
}

/**
 * A small spinner for a button or a panel that waits for something real (a form being sent). It
 * inherits the colour of its text and is a quarter of a ring that turns; under reduced motion it
 * pulses instead of turning, because a waiting state must stay visible. It carries no text: the
 * element that owns it says what is happening (aria-busy, and a label such as "Sending…").
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx(styles.spinner, className)} viewBox="0 0 20 20" width="1em" height="1em" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.25" />
      <path d="M10 2.5a7.5 7.5 0 0 1 7.5 7.5" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  )
}
