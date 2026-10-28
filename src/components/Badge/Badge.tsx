import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import styles from './Badge.module.scss'

/**
 * `live`: running and open to the public. `demo`: a working portfolio build that is not in
 * production. `in-progress`: being built. `concept`: an idea or a design, not built.
 */
export type ProjectStatus = 'live' | 'demo' | 'in-progress' | 'concept'

type BadgeProps = { className?: string } & (
  /** Project status: shows a status dot and the translated label. */
  | { status: ProjectStatus; children?: never }
  /** Category or any other neutral label. */
  | { status?: undefined; children: ReactNode }
)

const STATUS_STYLE: Record<ProjectStatus, string> = {
  live: styles.live,
  demo: styles.demo,
  'in-progress': styles.progress,
  concept: styles.concept,
}

export function Badge({ status, children, className }: BadgeProps) {
  const { t } = useI18n()

  if (status) {
    const labels: Record<ProjectStatus, string> = {
      live: t.status.live,
      demo: t.status.demo,
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
