import { useRef, useState } from 'react'
import { cx } from '../../utils/cx'
import * as endpoints from '../api/endpoints'
import type { GmailStatus } from '../api/types'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import { checkGmail, gmailErrorText, gmailState, runOnce, type GmailState } from '../lib/gmail'
import { useSession } from '../session/SessionProvider'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { Icon } from './Icon'
import { DetailPanel } from './layout'
import { ErrorState, LoadingState } from './states'
import { useToast } from './Toast'

/**
 * The Gmail connection, as one panel of the System tab: whether it is set up, which mailbox, whether the last check worked and,
 * if not, why in the administrator's own language; and a button that asks the server to check again. It shows the connection
 * and nothing else (no mail is read or sent), and it never has a secret to show: the server sends five fields (api/types.ts).
 */

const TONES: Record<GmailState, string> = {
  connected: styles.toneSuccess,
  failed: styles.toneDanger,
  not_checked: styles.toneWarning,
  not_configured: styles.toneNeutral,
}

/** A state as a word and a coloured dot: the word carries the meaning, the colour is only a quick scan. */
function Badge({ tone, children }: { tone: string; children: string }) {
  return (
    <span className={cx(styles.badge, tone)}>
      <span className={styles.badgeDot} aria-hidden="true" />
      {children}
    </span>
  )
}

export interface GmailPanelViewProps {
  status: GmailStatus
  /** A check is under way: the button is busy and presses do nothing. */
  checking: boolean
  /** The administrator may run a check (`system:write`). */
  canCheck: boolean
  onCheck: () => void
}

/** The panel for one status. Pure: the same props always give the same page, so every state can be looked at (and tested) on its own. */
export function GmailPanelView({ status, checking, canCheck, onCheck }: GmailPanelViewProps) {
  const t = useText()
  const language = useInterfaceLanguage()
  const g = t.settings.gmail
  const state = gmailState(status)

  const lastCheck =
    status.checkedAt === null
      ? state === 'not_configured'
        ? t.common.noValue
        : g.neverChecked
      : fill(state === 'connected' ? g.lastCheckOk : g.lastCheckFailed, { when: formatDateTime(status.checkedAt, language) })

  return (
    <DetailPanel title={g.title}>
      <div className={styles.stack} aria-busy={checking || undefined}>
        <p className={styles.hint}>{g.lead}</p>
        <dl className={styles.definitions}>
          <dt>{g.configuration}</dt>
          <dd>
            <Badge tone={status.configured ? styles.toneSuccess : styles.toneNeutral}>{status.configured ? g.configured : g.notConfigured}</Badge>
          </dd>
          <dt>{g.connection}</dt>
          <dd>
            <Badge tone={TONES[state]}>{state === 'connected' ? g.connected : state === 'failed' ? g.failed : state === 'not_checked' ? g.notChecked : g.notConfigured}</Badge>
          </dd>
          <dt>{g.mailbox}</dt>
          <dd>{status.accountEmail ?? <span className={styles.muted}>{g.noMailbox}</span>}</dd>
          <dt>{g.lastCheck}</dt>
          <dd>{lastCheck}</dd>
          {state === 'failed' && (
            <>
              <dt>{g.lastError}</dt>
              <dd>{gmailErrorText(t, status.lastError)}</dd>
            </>
          )}
        </dl>
        {state === 'not_configured' && (
          <p className={cx(styles.notice, styles.noticeWarning)} role="status">
            {g.notConfiguredHelp}
          </p>
        )}
        {state === 'not_checked' && <p className={styles.hint}>{g.notCheckedHelp}</p>}
        <div className={styles.formActions}>
          <AdminButton onClick={onCheck} disabled={!canCheck || !status.configured} loading={checking} loadingLabel={g.checking}>
            <Icon name="refresh" />
            {g.check}
          </AdminButton>
          {!canCheck && <span className={styles.hint}>{g.noPermission}</span>}
        </div>
      </div>
    </DetailPanel>
  )
}

/** The Gmail panel with its data: loads the status when the tab opens, and runs a check when the button is pressed. */
export function GmailPanel() {
  const t = useText()
  const toast = useToast()
  const session = useSession()
  const resource = useResource((signal) => endpoints.gmail.status(signal).then((answer) => answer.data), [])
  const [checking, setChecking] = useState(false)

  // The check that is under way, if any: a second press (or a key held down) sends nothing while the first one is running.
  const running = useRef<Promise<void> | null>(null)
  const check = async () => {
    setChecking(true)
    try {
      const outcome = await checkGmail(t, endpoints.gmail.check)
      if (outcome.status) resource.set(outcome.status)
      toast[outcome.tone](outcome.message)
    } finally {
      setChecking(false)
    }
  }

  if (resource.loading) return <LoadingState />
  if (resource.error || !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />
  return <GmailPanelView status={resource.data} checking={checking} canCheck={session.can('system:write')} onCheck={() => void runOnce(running, check)} />
}
