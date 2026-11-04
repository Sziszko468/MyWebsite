import { createElement, type ReactNode } from 'react'
import { cx } from '../../utils/cx'
import { fill, useText } from '../i18n'
import { describeError, errorReference } from '../lib/errors'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { Icon, type IconName } from './Icon'

/**
 * The three states every screen has besides having something to show. Each is announced (the loading one politely, the
 * error one at once), each says what happened in a sentence, and the error offers the way out: trying again.
 */

export function LoadingState({ label }: { label?: string }) {
  const t = useText()
  return (
    <div className={styles.skeleton} role="status" aria-live="polite" aria-busy="true">
      <span className={styles.srOnly}>{label ?? t.states.loading}</span>
      <span className={styles.skeletonLine} aria-hidden="true" />
      <span className={styles.skeletonLine} aria-hidden="true" />
      <span className={styles.skeletonLine} aria-hidden="true" />
    </div>
  )
}

/**
 * The heading of a state follows the page: `2` under the page's title (the default, also inside a panel), `1` when the
 * state IS the page (a record that could not be loaded has no page header of its own).
 */
type Level = 1 | 2 | 3
const heading = (level: Level, text: string) => createElement(`h${level}`, { className: styles.stateTitle }, text)

export function EmptyState({ icon = 'inbox', title, children, action, level = 2 }: { icon?: IconName; title?: string; children?: ReactNode; action?: ReactNode; level?: Level }) {
  return (
    <div className={styles.state}>
      <Icon name={icon} className={styles.stateIcon} />
      {title && heading(level, title)}
      {children && <p className={styles.stateBody}>{children}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry, title, level = 2 }: { error: unknown; onRetry?: () => void; title?: string; level?: Level }) {
  const t = useText()
  const reference = errorReference(error)
  return (
    <div className={cx(styles.state, styles.stateError)} role="alert">
      <Icon name="alert" className={styles.stateIcon} />
      {heading(level, title ?? t.states.errorTitle)}
      <p className={styles.stateBody}>
        {describeError(t, error)}
        {reference && (
          <>
            <br />
            <span className={styles.small}>{fill(t.states.requestId, { id: reference })}</span>
          </>
        )}
      </p>
      {onRetry && (
        <AdminButton variant="secondary" onClick={onRetry}>
          {t.common.retry}
        </AdminButton>
      )}
    </div>
  )
}
