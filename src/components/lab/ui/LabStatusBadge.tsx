import { statusLabels, type LabStatus } from '../../../content/lab'
import { cx } from '../../../utils/cx'
import { useI18n } from '../../../i18n/useI18n'
import styles from './LabStatusBadge.module.scss'

/** An experiment's state in words and a dot whose shape differs by state, so colour is never the only signal. */
export function LabStatusBadge({ status, className }: { status: LabStatus; className?: string }) {
  const { lang } = useI18n()
  return (
    <span className={cx(styles.badge, styles[status === 'in-progress' ? 'progress' : status], className)}>
      <span className={styles.dot} aria-hidden="true" />
      {statusLabels[status][lang]}
    </span>
  )
}
