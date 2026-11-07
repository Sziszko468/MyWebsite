import type { ReactNode } from 'react'
import styles from './Headline.module.scss'

/**
 * A headline of the offer set so that its last sentence (or, for a single sentence, its full stop) is Racing Red, as the site's
 * headlines are ("YOUR IDEA. BUILT FROM ZERO."). The words are the administrator's; this only decides where the colour starts.
 */
export function Headline({ text }: { text: string }): ReactNode {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean)
  if (parts.length > 1) {
    return (
      <>
        {parts[0]} <span className={styles.accent}>{parts.slice(1).join(' ')}</span>
      </>
    )
  }
  const stop = /[.!?]$/.test(text)
  return stop ? (
    <>
      {text.slice(0, -1)}
      <span className={styles.accent}>{text.slice(-1)}</span>
    </>
  ) : (
    text
  )
}
