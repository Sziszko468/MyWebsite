import { useState } from 'react'
import * as endpoints from '../api/endpoints'
import type { Delivery, NotificationsData } from '../api/types'
import { AdminButton } from '../components/AdminButton'
import { DataList, type Column } from '../components/DataList'
import { SwitchField } from '../components/form'
import { Icon } from '../components/Icon'
import { DetailPanel, PageHeader } from '../components/layout'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { StatusBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import { describeError } from '../lib/errors'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import { cx } from '../../utils/cx'

/**
 * Which notifications exist, whether they will really be sent, and a switch for each automatic one. "Will be sent" is only
 * said when e-mail is configured and there is an address to send to; otherwise the page says what is missing instead.
 */
export function NotificationTypes({ data, canChange, onSaved }: { data: NotificationsData; canChange: boolean; onSaved: () => void }) {
  const t = useText()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const n = t.notifications

  const save = async (patch: Partial<NotificationsData['preferences']>) => {
    setBusy(true)
    try {
      await endpoints.notifications.savePreferences({ ...data.preferences, ...patch })
      toast.success(n.types.preferencesSaved)
      onSaved()
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.stack}>
      <ul className={page.items}>
        {data.types.map((type) => {
          const key = type.id
          const checked = key === 'new_inquiry' ? data.preferences.newInquiry : key === 'new_quote' ? data.preferences.newQuote : true
          return (
            <li key={key} className={page.item}>
              <span className={styles.spread}>
                <span className={page.itemTitle}>{n.types[key]}</span>
                <span className={cx(styles.badge, type.active ? styles.toneSuccess : styles.toneNeutral)}>{type.active ? n.types.active : data.integration.enabled ? (type.enabled ? n.types.inactive : n.types.switchedOff) : n.types.needsEmail}</span>
              </span>
              <span className={cx(styles.muted, styles.small)}>{n.types[`${key}Body` as 'new_inquiryBody']}</span>
              {type.automatic ? (
                <SwitchField label={checked ? t.common.on : t.common.off} checked={checked} disabled={!canChange || busy} onChange={(on) => void save(key === 'new_inquiry' ? { newInquiry: on } : { newQuote: on })} />
              ) : (
                <span className={styles.small}>{n.types.manual}</span>
              )}
            </li>
          )
        })}
      </ul>
      {!canChange && <p className={styles.hint}>{n.types.adminOnly}</p>}
    </div>
  )
}

export function NotificationsPage() {
  const t = useText()
  const language = useInterfaceLanguage()
  const toast = useToast()
  const session = useSession()
  const [retrying, setRetrying] = useState<string | null>(null)
  const resource = useResource((signal) => endpoints.notifications.overview(signal).then((answer) => answer.data), [])
  const n = t.notifications
  const data = resource.data

  const retry = async (delivery: Delivery) => {
    setRetrying(delivery.id)
    try {
      await endpoints.notifications.retry(delivery.id)
      toast.success(n.log.retried)
      window.setTimeout(resource.reload, 800)
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setRetrying(null)
    }
  }

  const kindLabel = (kind: string) => (n.log.kinds as Record<string, string>)[kind] ?? kind

  const columns: Column<Delivery>[] = [
    { key: 'when', header: n.log.columns.when, cell: (row) => formatDateTime(row.createdAt, language) },
    {
      key: 'kind',
      header: n.log.columns.kind,
      cell: (row) => (
        <span className={styles.cellMain}>
          <span className={styles.cellTitle}>{kindLabel(row.kind)}</span>
          {row.reference && <span className={cx(styles.muted, styles.small, styles.mono)}>{row.reference}</span>}
        </span>
      ),
    },
    { key: 'to', header: n.log.columns.to, cell: (row) => <span className={styles.cellTitle}>{row.recipient}</span> },
    {
      key: 'status',
      header: n.log.columns.status,
      cell: (row) => (
        <span className={styles.cellMain}>
          <StatusBadge kind="delivery" status={row.status} />
          {row.lastError && <span className={page.deliveryError}>{fill(n.log.lastFailure, { error: row.lastError })}</span>}
          {row.status === 'pending' && row.nextAttemptAt && <span className={cx(styles.muted, styles.small)}>{fill(n.log.nextAttempt, { when: formatDateTime(row.nextAttemptAt, language) })}</span>}
        </span>
      ),
    },
    { key: 'attempts', header: n.log.columns.attempts, cell: (row) => String(row.attempts) },
    {
      key: 'action',
      header: n.log.columns.action,
      cell: (row) =>
        row.status === 'failed' && session.can('requests:write') && data?.integration.enabled ? (
          <AdminButton onClick={() => void retry(row)} loading={retrying === row.id} loadingLabel={n.log.retrying}>
            <Icon name="refresh" />
            {n.log.retry}
          </AdminButton>
        ) : (
          t.common.noValue
        ),
    },
  ]

  return (
    <>
      <PageHeader title={n.title} lead={n.lead} />
      {resource.loading ? (
        <LoadingState />
      ) : resource.error || !data ? (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      ) : (
        <div className={styles.stackLg}>
          <DetailPanel title={n.integration.title}>
            {data.integration.enabled ? (
              <div className={styles.stack}>
                <p className={styles.row}>
                  <span className={cx(styles.badge, styles.toneSuccess)}>
                    <span className={styles.badgeDot} aria-hidden="true" />
                    {n.integration.available}
                  </span>
                </p>
                <dl className={styles.definitions}>
                  <dt>{n.integration.provider}</dt>
                  <dd>{(n.integration.providers as Record<string, string>)[data.integration.provider] ?? data.integration.provider}</dd>
                  <dt>{n.integration.sender}</dt>
                  <dd>{data.integration.senderConfigured ? n.integration.set : n.integration.notSet}</dd>
                  <dt>{n.integration.owner}</dt>
                  <dd>{data.integration.ownerAddressConfigured ? n.integration.set : n.integration.notSet}</dd>
                  <dt>{n.integration.language}</dt>
                  <dd>{(t.languages as Record<string, string>)[data.integration.ownerLanguage] ?? data.integration.ownerLanguage}</dd>
                </dl>
                {!data.integration.ownerAddressConfigured && <p className={cx(styles.notice, styles.noticeWarning)}>{n.integration.noOwner}</p>}
                <p className={styles.hint}>{n.integration.accepted}</p>
              </div>
            ) : (
              <div className={cx(styles.notice, styles.noticeWarning)} role="status">
                <Icon name="alert" />
                <div>
                  <strong>{n.integration.unavailable}</strong>
                  <p>{n.integration.unavailableBody}</p>
                </div>
              </div>
            )}
          </DetailPanel>

          <DetailPanel title={n.types.title}>
            <NotificationTypes data={data} canChange={session.can('system:write')} onSaved={resource.reload} />
          </DetailPanel>

          <section className={styles.stack} aria-labelledby="delivery-log">
            <h2 id="delivery-log" className={styles.sectionTitle}>
              {n.counts.title}
            </h2>
            <p className={styles.row}>
              <span className={cx(styles.badge, styles.toneWarning)}>
                {n.counts.pending}: {data.counts.pending}
              </span>
              <span className={cx(styles.badge, styles.toneSuccess)}>
                {n.counts.accepted}: {data.counts.accepted}
              </span>
              <span className={cx(styles.badge, data.counts.failed > 0 ? styles.toneDanger : styles.toneNeutral)}>
                {n.counts.failed}: {data.counts.failed}
              </span>
            </p>
            {data.deliveries.length === 0 ? (
              <EmptyState icon="mail" title={n.log.empty}>
                {n.log.emptyBody}
              </EmptyState>
            ) : (
              <DataList
                rows={data.deliveries}
                rowKey={(row) => row.id}
                columns={columns}
                caption={n.counts.title}
                card={(row) => (
                  <>
                    <div className={styles.listCardTop}>
                      <span className={styles.cellMain}>
                        <span className={styles.cellTitle}>{kindLabel(row.kind)}</span>
                        <span className={cx(styles.muted, styles.small)}>{row.recipient}</span>
                      </span>
                      <StatusBadge kind="delivery" status={row.status} />
                    </div>
                    <div className={styles.listCardMeta}>
                      {row.reference && <span className={styles.mono}>{row.reference}</span>}
                      <span>{formatDateTime(row.createdAt, language)}</span>
                      <span>{row.attempts}×</span>
                    </div>
                    {row.lastError && <span className={page.deliveryError}>{fill(n.log.lastFailure, { error: row.lastError })}</span>}
                    {row.status === 'failed' && session.can('requests:write') && data.integration.enabled && (
                      <AdminButton onClick={() => void retry(row)} loading={retrying === row.id} loadingLabel={n.log.retrying}>
                        <Icon name="refresh" />
                        {n.log.retry}
                      </AdminButton>
                    )}
                  </>
                )}
              />
            )}
          </section>
        </div>
      )}
    </>
  )
}
