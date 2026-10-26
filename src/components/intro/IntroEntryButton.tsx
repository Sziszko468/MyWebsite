import type { Ref } from 'react'
import styles from './IntroEntryButton.module.scss'

/**
 * The intro's entry control: a real HTML button, so it is focusable, named by its text and
 * activated by Enter and Space. It is deliberately not a big coloured button but an underlined
 * line of text with an arrow, in keeping with the editorial type around it. The arrow is
 * decoration; the accessible name is the label. It does not depend on WebGL.
 */
export function IntroEntryButton({ label, ref }: { label: string; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={ref} type="button" className={styles.button} data-intro-enter>
      <span className={styles.label}>{label}</span>
      <svg className={styles.arrow} viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
        <path d="M4 12 12 4M5.5 4H12v6.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
      </svg>
    </button>
  )
}
