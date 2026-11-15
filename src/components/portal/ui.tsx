import type { ReactNode } from 'react'
import type { Loaded } from '../../portal/usePortal'
import { failureText, useFocusHeading, usePortalText } from '../../portal/text'
import { Button } from '../Button/Button'
import styles from './Portal.module.scss'

export function PageHeader({ eyebrow, title, lead, focusKey, children }: { eyebrow?: string; title: string; lead?: string; focusKey: string; children?: ReactNode }) {
  const ref = useFocusHeading<HTMLHeadingElement>(focusKey)
  return (
    <header className={styles.pageHeader}>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 ref={ref} tabIndex={-1} className={styles.title}>
        {title}
      </h1>
      {lead && <p className={styles.lead}>{lead}</p>}
      {children}
    </header>
  )
}

/** Draws a loaded thing, or says plainly that it is loading or why it failed (with a way to try again). */
export function Load<T>({ state, onRetry, heading = false, children }: { state: Loaded<T>; onRetry: () => void; /** The page has no heading of its own until it has loaded: a failure then says its words as the page's heading. */ heading?: boolean; children: (data: T) => ReactNode }) {
  const words = usePortalText()
  const failedHeading = useFocusHeading<HTMLHeadingElement>(state.status === 'failed' ? 'failed' : 'ok')
  if (state.status === 'loading') {
    return (
      <p className={styles.loading} role="status">
        {words.common.loading}
      </p>
    )
  }
  if (state.status === 'failed') {
    return (
      <div className={styles.problem} role="alert">
        {heading ? (
          <h1 ref={failedHeading} tabIndex={-1} className={styles.title}>
            {failureText(state.failure, words)}
          </h1>
        ) : (
          <p>{failureText(state.failure, words)}</p>
        )}
        {state.failure.kind !== 'not_found' && (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {words.common.retry}
          </Button>
        )}
      </div>
    )
  }
  return <>{children(state.data)}</>
}

type Tone = 'attention' | 'active' | 'done' | 'muted'
const TONES: Record<string, Tone> = {
  waiting_customer: 'attention',
  awaiting_start: 'muted',
  discovery: 'active',
  planning: 'active',
  design: 'active',
  development: 'active',
  review: 'active',
  finalization: 'active',
  completed: 'done',
  on_hold: 'muted',
  cancelled: 'muted',
}

/** A status as a word with a mark: never colour alone. */
export function StatusBadge({ status, label }: { status: string; label: string }) {
  const tone = TONES[status] ?? 'muted'
  return (
    <span className={styles.badge} data-tone={tone}>
      <span className={styles.badgeMark} aria-hidden="true">
        {tone === 'done' ? '✓' : tone === 'attention' ? '!' : '●'}
      </span>
      {label}
    </span>
  )
}

/** Counted from real milestones only: one segment each (up to a dozen), and the words say the same. */
export function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const segments = total <= 12 ? Array.from({ length: total }, (_, index) => index < done) : null
  return (
    <div className={styles.progress}>
      {segments ? (
        <div className={styles.segments} aria-hidden="true">
          {segments.map((filled, index) => (
            <span key={index} data-filled={filled} />
          ))}
        </div>
      ) : (
        <progress className={styles.meter} value={done} max={total} aria-hidden="true" />
      )}
      <p className={styles.progressText}>{label}</p>
    </div>
  )
}
