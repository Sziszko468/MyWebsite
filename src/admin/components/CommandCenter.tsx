import { cx } from '../../utils/cx'
import type { OperationsData } from '../api/types'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import { backupErrorText, formatBytes, sendingState } from '../lib/operations'
import styles from '../styles/ui.module.scss'
import { DetailPanel } from './layout'

/**
 * The Operations part of the System page: one panel per thing an operator checks first. Every panel is a pure view over the data the
 * server sends (`operations` in `GET /api/admin/system`), so each state can be drawn, and tested, on its own. They show facts and
 * times; a secret, a path or a customer's address is not in the data to begin with.
 */

type Tone = 'success' | 'danger' | 'warning' | 'neutral' | 'info'
const TONES: Record<Tone, string> = { success: styles.toneSuccess, danger: styles.toneDanger, warning: styles.toneWarning, neutral: styles.toneNeutral, info: styles.toneInfo }

/** A state as a word and a coloured dot: the word carries the meaning, the colour is a quick scan. */
function Badge({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span className={cx(styles.badge, TONES[tone])}>
      <span className={styles.badgeDot} aria-hidden="true" />
      {children}
    </span>
  )
}

const BACKUP_TONES: Record<OperationsData['backup']['state'], Tone> = { ok: 'success', running: 'info', stale: 'danger', never: 'warning', disabled: 'neutral' }

export function BackupPanel({ backup }: { backup: OperationsData['backup'] }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const o = t.settings.operations
  const b = o.backup
  const success = backup.lastSuccess
  const attempt = backup.lastAttempt
  const how = attempt ? (b.triggers as Record<string, string>)[attempt.trigger] : ''
  return (
    <DetailPanel title={b.title}>
      <div className={styles.stack}>
        <dl className={styles.definitions}>
          <dt>{b.title}</dt>
          <dd>
            <Badge tone={BACKUP_TONES[backup.state]}>{b.states[backup.state]}</Badge>
          </dd>
          <dt>{b.latest}</dt>
          <dd>{success ? `${formatDateTime(success.finishedAt, language)} · ${fill(b.age, { hours: success.ageHours })}` : b.none}</dd>
          {success && (
            <>
              <dt>{b.contents}</dt>
              <dd>{fill(b.contentsValue, { files: success.fileCount, size: formatBytes(success.totalBytes, language) })}</dd>
              {success.folder && (
                <>
                  <dt>{b.folder}</dt>
                  <dd>{success.folder}</dd>
                </>
              )}
              <dt>{b.encryption}</dt>
              <dd>{success.encrypted ? b.encrypted : b.notEncrypted}</dd>
              {success.databaseSha256 && (
                <>
                  <dt>{b.databaseHash}</dt>
                  <dd>
                    <code className={styles.muted}>{success.databaseSha256}</code>
                  </dd>
                </>
              )}
              {success.manifestSha256 && (
                <>
                  <dt>{b.manifestHash}</dt>
                  <dd>
                    <code className={styles.muted}>{success.manifestSha256}</code>
                  </dd>
                </>
              )}
            </>
          )}
          {attempt && (
            <>
              <dt>{b.attempt}</dt>
              <dd>
                {attempt.status === 'running'
                  ? fill(b.attemptRunning, { when: formatDateTime(attempt.startedAt, language) })
                  : attempt.status === 'success'
                    ? fill(b.attemptSucceeded, { when: formatDateTime(attempt.finishedAt ?? attempt.startedAt, language), how })
                    : fill(b.attemptFailed, { when: formatDateTime(attempt.finishedAt ?? attempt.startedAt, language), reason: backupErrorText(t, attempt.errorCategory), how })}
              </dd>
            </>
          )}
        </dl>
        {backup.enabled && backup.state === 'stale' && (
          <p className={cx(styles.notice, styles.noticeDanger)} role="status">
            {fill(b.staleWarning, { hours: backup.staleAfterHours })}
          </p>
        )}
        {backup.enabled && backup.state === 'never' && (
          <p className={cx(styles.notice, styles.noticeWarning)} role="status">
            {b.neverWarning}
          </p>
        )}
        {!backup.enabled && <p className={styles.hint}>{b.disabledHelp}</p>}
      </div>
    </DetailPanel>
  )
}

export function DatabasePanel({ migrations, disk }: { migrations: OperationsData['migrations']; disk: OperationsData['disk'] }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const d = t.settings.operations.database
  const snapshots = migrations.snapshots
  return (
    <DetailPanel title={d.title}>
      <div className={styles.stack}>
        <dl className={styles.definitions}>
          <dt>{d.schema}</dt>
          <dd>{migrations.pending > 0 ? fill(d.schemaPending, { current: migrations.current, latest: migrations.latest, pending: migrations.pending }) : fill(d.schemaValue, { current: migrations.current, latest: migrations.latest })}</dd>
          <dt>{d.snapshots}</dt>
          <dd>
            {snapshots.enabled ? fill(d.snapshotsOn, { count: snapshots.count, days: snapshots.retentionDays }) : d.snapshotsOff}
            {snapshots.enabled && snapshots.newestAt ? ` · ${fill(d.newest, { when: formatDateTime(snapshots.newestAt, language) })}` : ''}
          </dd>
          {disk.databaseBytes !== null && (
            <>
              <dt>{d.file}</dt>
              <dd>{formatBytes(disk.databaseBytes, language)}</dd>
            </>
          )}
          <dt>{d.disk}</dt>
          <dd>
            {disk.available && disk.freeBytes !== null && disk.totalBytes !== null && disk.freePercent !== null ? (
              <>
                <Badge tone={disk.low ? 'danger' : 'success'}>{fill(d.diskValue, { free: formatBytes(disk.freeBytes, language), total: formatBytes(disk.totalBytes, language), percent: disk.freePercent.toLocaleString(language === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: 1 }) })}</Badge>
              </>
            ) : (
              d.diskUnknown
            )}
          </dd>
        </dl>
        {disk.low && (
          <p className={cx(styles.notice, styles.noticeDanger)} role="status">
            {d.diskLow}
          </p>
        )}
      </div>
    </DetailPanel>
  )
}

export function EmailPanel({ email }: { email: OperationsData['email'] }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const o = t.settings.operations
  const e = o.email
  const sending = sendingState(email)
  const yesNo = (value: boolean) => (value ? o.yes : o.no)
  const checks = email.checks
  const states = checks?.states ?? {}
  const needsAttention = email.provider !== 'none' && (checks === null || checks.items.some((item) => item.state === 'not_verified' || item.state === 'unknown'))
  return (
    <DetailPanel title={e.title}>
      <div className={styles.stack}>
        <dl className={styles.definitions}>
          <dt>{e.provider}</dt>
          <dd>{email.provider}</dd>
          <dt>{e.sending}</dt>
          <dd>
            <Badge tone={sending === 'on' ? 'success' : sending === 'paused' ? 'warning' : 'neutral'}>{e.sendingStates[sending]}</Badge>
          </dd>
          <dt>{e.setup}</dt>
          <dd>{fill(e.setupValue, { from: yesNo(email.fromSet), replyTo: yesNo(email.replyToSet), notify: yesNo(email.notifyToSet) })}</dd>
          <dt>{e.deliveries}</dt>
          <dd>{fill(e.deliveriesValue, { ...email.deliveries })}</dd>
          {email.lastFailureAt && (
            <>
              <dt>{e.lastFailure}</dt>
              <dd>{formatDateTime(email.lastFailureAt, language)}</dd>
            </>
          )}
          <dt>{e.checks}</dt>
          <dd>{checks ? fill(e.checksValue, { when: formatDateTime(checks.checkedAt, language), verified: states.verified ?? 0, notVerified: states.not_verified ?? 0, unknown: states.unknown ?? 0 }) : e.checksNotRun}</dd>
        </dl>
        {needsAttention && (
          <p className={cx(styles.notice, styles.noticeWarning)} role="status">
            {e.warning}
          </p>
        )}
      </div>
    </DetailPanel>
  )
}

export function AssistantPanel({ assistant }: { assistant: OperationsData['assistant'] }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const o = t.settings.operations
  const a = o.assistant
  const reason = assistant.unavailableReason ? (a.reasons as Record<string, string>)[assistant.unavailableReason] : null
  return (
    <DetailPanel title={a.title}>
      <dl className={styles.definitions}>
        <dt>{a.model}</dt>
        <dd>{assistant.model}</dd>
        <dt>{a.key}</dt>
        <dd>{assistant.apiKeySet ? a.keySet : a.keyMissing}</dd>
        <dt>{a.verification}</dt>
        <dd>
          <Badge tone={assistant.verification === 'verified' ? 'success' : assistant.verification === 'unverified' ? 'neutral' : 'danger'}>{a.states[assistant.verification]}</Badge>
        </dd>
        {assistant.verifiedAt && (
          <>
            <dt>{a.verifiedAt}</dt>
            <dd>{formatDateTime(assistant.verifiedAt, language)}</dd>
          </>
        )}
        <dt>{a.available}</dt>
        <dd>
          {assistant.available ? o.yes : o.no}
          {reason ? ` · ${reason}` : ''}
        </dd>
      </dl>
    </DetailPanel>
  )
}

export function NetworkPanel({ network }: { network: OperationsData['network'] }) {
  const t = useText()
  const n = t.settings.operations.network
  const verdict = n.verdicts[network.verdict]
  return (
    <DetailPanel title={n.title}>
      <div className={styles.stack}>
        <dl className={styles.definitions}>
          <dt>{n.clientIp}</dt>
          <dd>
            <strong>{network.clientIp}</strong>
          </dd>
          <dt>{n.socket}</dt>
          <dd>{network.socketAddress}</dd>
          <dt>{n.forwarded}</dt>
          <dd>{network.forwardedFor.length > 0 ? network.forwardedFor.join(', ') : n.none}</dd>
          <dt>{n.cloudflare}</dt>
          <dd>{network.cloudflareConnectingIp ?? n.none}</dd>
          <dt>{n.trustProxy}</dt>
          <dd>{network.trustProxy}</dd>
          <dt>{n.measured}</dt>
          <dd>{network.measuredTrustProxy ?? n.none}</dd>
        </dl>
        <p className={cx(styles.notice, network.verdict === 'differs_from_cloudflare_header' ? styles.noticeWarning : undefined)} role="status">
          {verdict}
        </p>
        <p className={styles.hint}>{n.help}</p>
      </div>
    </DetailPanel>
  )
}

export function DeploymentPanel({ deployment }: { deployment: OperationsData['deployment'] }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const d = t.settings.operations.deployment
  return (
    <DetailPanel title={d.title}>
      <dl className={styles.definitions}>
        <dt>{d.commit}</dt>
        <dd>{deployment.commit ? <code title={deployment.commit}>{deployment.shortCommit}</code> : <span className={styles.muted}>{d.unknown}</span>}</dd>
        {deployment.service && (
          <>
            <dt>{d.service}</dt>
            <dd>{deployment.service}</dd>
          </>
        )}
        <dt>{d.environment}</dt>
        <dd>{deployment.environment}</dd>
        <dt>{d.started}</dt>
        <dd>{formatDateTime(deployment.startedAt, language)}</dd>
      </dl>
    </DetailPanel>
  )
}

/** The whole Operations part, as the top of the System tab. */
export function CommandCenter({ data }: { data: OperationsData }) {
  const t = useText()
  const o = t.settings.operations
  return (
    <div className={styles.stackLg}>
      <div>
        <h2 className={styles.cardTitleTight}>{o.title}</h2>
        <p className={styles.hint}>{o.lead}</p>
      </div>
      <BackupPanel backup={data.backup} />
      <DatabasePanel migrations={data.migrations} disk={data.disk} />
      <EmailPanel email={data.email} />
      <AssistantPanel assistant={data.assistant} />
      <NetworkPanel network={data.network} />
      <DeploymentPanel deployment={data.deployment} />
    </div>
  )
}
