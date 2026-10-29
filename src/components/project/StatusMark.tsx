import { cx } from '../../utils/cx'
import styles from './StatusMark.module.scss'

export type Completion = 'done' | 'partial' | 'planned'

/**
 * How far something has come, in three states that never rely on colour alone: a filled square,
 * a half-filled one and an open dashed one, each with its word beside it.
 */
export function StatusMark({ status, label, className }: { status: Completion; label: string; className?: string }) {
  return (
    <span className={cx(styles.mark, styles[status], className)}>
      <span className={styles.shape} aria-hidden="true" />
      {label}
    </span>
  )
}
