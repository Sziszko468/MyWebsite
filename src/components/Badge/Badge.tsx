import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import styles from './Badge.module.scss'

export type ProjectStatus = 'live' | 'in-progress' | 'concept'

type BadgeProps = { className?: string } & (
  /** Project status: shows a status dot and the translated label. */
  | { status: ProjectStatus; children?: never }
  /** Category or any other neutral label. */
  | { status?: undefined; children: ReactNode }
)

const STATUS_STYLE: Record<ProjectStatus, string> = {
  live: styles.live,
  'in-progress': styles.progress,
  concept: styles.concept,
}

export function Badge({ status, children, className }: BadgeProps) {
  const { t } = useI18n()

  if (status) {
    const labels: Record<ProjectStatus, string> = {
      live: t.status.live,
      'in-progress': t.status.inProgress,
      concept: t.status.concept,
    }
    return (
      <span className={cx(styles.badge, STATUS_STYLE[status], className)}>
        <span className={styles.dot} aria-hidden="true" />
        {labels[status]}
      </span>
    )
  }

  return <span className={cx(styles.badge, className)}>{children}</span>
}
