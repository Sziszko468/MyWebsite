import { cx } from '../../utils/cx'
import { statusLabel, useText } from '../i18n'
import styles from '../styles/ui.module.scss'

type Kind = 'inquiry' | 'quote' | 'delivery' | 'availability'

const TONES: Record<string, string> = {
  // inquiries
  new: styles.toneAccent,
  in_progress: styles.toneInfo,
  waiting_client: styles.toneWarning,
  completed: styles.toneSuccess,
  // quote requests
  in_review: styles.toneInfo,
  quoted: styles.toneWarning,
  accepted: styles.toneSuccess,
  declined: styles.toneNeutral,
  closed: styles.toneSuccess,
  // deliveries
  pending: styles.toneWarning,
  sending: styles.toneInfo,
  failed: styles.toneDanger,
  cancelled: styles.toneNeutral,
  // availability
  active: styles.toneSuccess,
  disabled: styles.toneNeutral,
}

/**
 * A status as a word and a coloured dot: the word is what carries the meaning (colour alone never does), the colour is
 * a quick scan. A status the application does not know is shown as it is, in a neutral tone, never hidden.
 */
export function StatusBadge({ kind, status, archived = false }: { kind: Kind; status: string; archived?: boolean }) {
  const t = useText()
  const label =
    kind === 'availability' ? (status === 'active' ? t.common.active : status === 'disabled' ? t.common.disabled : status) : kind === 'delivery' ? ((t.status.delivery as Record<string, string>)[status] ?? status) : statusLabel(t, kind, status)
  return (
    <span className={styles.rowTight}>
      <span className={cx(styles.badge, TONES[status] ?? styles.toneNeutral)}>
        <span className={styles.badgeDot} aria-hidden="true" />
        {label}
      </span>
      {archived && <span className={cx(styles.badge, styles.toneNeutral)}>{t.status.archived}</span>}
    </span>
  )
}
