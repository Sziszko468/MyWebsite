import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { LANGUAGES } from '../../i18n/config'
import { cx } from '../../utils/cx'
import * as endpoints from '../api/endpoints'
import type { CheckState, Delivery, NotificationPreferences, NotificationsData } from '../api/types'
import { AdminButton } from '../components/AdminButton'
import { DataList, type Column } from '../components/DataList'
import { FilterDropdown, SwitchField, TextAreaField } from '../components/form'
import { Icon } from '../components/Icon'
import { DetailPanel, PageHeader } from '../components/layout'
import { Pagination } from '../components/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { StatusBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import { describeError } from '../lib/errors'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

const CHECK_TONE: Record<CheckState, string> = { verified: styles.toneSuccess, not_verified: styles.toneDanger, unknown: styles.toneWarning, not_applicable: styles.toneNeutral }
const PREFERENCE_OF = { new_inquiry: 'newInquiry', new_quote: 'newQuote', confirm_inquiry: 'confirmInquiry', confirm_quote: 'confirmQuote' } as const

/**
 * Which notifications exist, whether they will really be sent, and a switch for each automatic one. "Will be sent" is only
 * said when e-mail is configured and there is an address to send to; otherwise the page says what is missing instead.
 */
export function NotificationTypes({ data, canChange, onSaved }: { data: NotificationsData; canChange: boolean; onSaved: () => void }) {
  const t = useText()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const n = t.notifications

  const save = async (patch: Partial<NotificationPreferences>) => {
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
          const preference = key === 'status_update' ? null : PREFERENCE_OF[key]
          const checked = preference ? data.preferences[preference] : true
          return (
            <li key={key} className={page.item}>
              <span className={styles.spread}>
                <span className={page.itemTitle}>{n.types[key]}</span>
                <span className={cx(styles.badge, type.active ? styles.toneSuccess : styles.toneNeutral)}>{type.active ? n.types.active : data.integration.enabled ? (type.enabled ? n.types.inactive : n.types.switchedOff) : n.types.needsEmail}</span>
              </span>
              <span className={cx(styles.muted, styles.small)}>{n.types[`${key}Body` as 'new_inquiryBody']}</span>
              {preference ? <SwitchField label={checked ? t.common.on : t.common.off} checked={checked} disabled={!canChange || busy} onChange={(on) => void save({ [preference]: on })} /> : <span className={styles.small}>{n.types.manual}</span>}
            </li>
          )
        })}
      </ul>
      {!canChange && <p className={styles.hint}>{n.types.adminOnly}</p>}
    </div>
  )
}

/** The optional sentence for the confirmations, per language. Empty means the confirmation says nothing about timing. */
function ResponseNotes({ data, canChange, onSaved }: { data: NotificationsData; canChange: boolean; onSaved: () => void }) {
  const t = useText()
  const toast = useToast()
  const n = t.notifications.confirmations
  const [notes, setNotes] = useState(data.preferences.responseNote)
  const [busy, setBusy] = useState(false)
  const changed = LANGUAGES.some((language) => notes[language] !== data.preferences.responseNote[language])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await endpoints.notifications.savePreferences({ ...data.preferences, responseNote: notes })
      toast.success(n.saved)
      onSaved()
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.stack} onSubmit={submit}>
      <p className={styles.hint}>{n.help}</p>
      <div>
        <h3 className={styles.cardTitleTight}>{n.noteTitle}</h3>
        <p className={styles.hint}>{n.noteHelp}</p>
      </div>
      {LANGUAGES.map((language) => (
        <TextAreaField key={language} label={fill(n.noteLabel, { language: (t.languages as Record<string, string>)[language] ?? language })} value={notes[language]} maxLength={data.responseNoteMax} rows={2} disabled={!canChange} onChange={(event) => setNotes({ ...notes, [language]: event.target.value })} />
      ))}
      {canChange && (
        <div className={styles.formActions}>
          <AdminButton type="submit" variant="secondary" loading={busy} loadingLabel={t.common.saving} disabled={!changed}>
            {n.save}
          </AdminButton>
        </div>
      )}
    </form>
  )
}

/**
 * What has been verified about the set-up, one line per question put to the provider, the DNS, Cloudflare or the log of real
 * messages, each with when it was asked. "Verified" is only what an answer proved; a setting being present is not shown as a
 * working set-up. The findings are the server's own English sentences (they name records and addresses of the domain).
 */
function Checks({ data, canRun, canTest, onDone }: { data: NotificationsData; canRun: boolean; canTest: boolean; onDone: () => void }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const toast = useToast()
  const [running, setRunning] = useState(false)
  const [testing, setTesting] = useState(false)
  const n = t.notifications.checks

  const run = async () => {
    setRunning(true)
    try {
      await endpoints.notifications.runChecks()
      toast.success(n.ran)
      onDone()
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setRunning(false)
    }
  }

  const test = async () => {
    setTesting(true)
    try {
      await endpoints.notifications.sendTest()
      toast.success(n.testQueued)
      window.setTimeout(onDone, 1200)
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className={styles.stack}>
      <p className={styles.hint}>{n.lead}</p>
      <div className={page.rowActions}>
        {canRun && (
          <AdminButton variant="primary" onClick={() => void run()} loading={running} loadingLabel={n.running}>
            <Icon name="refresh" />
            {n.run}
          </AdminButton>
        )}
        {canTest && data.integration.enabled && data.integration.ownerAddressConfigured && (
          <AdminButton onClick={() => void test()} loading={testing} loadingLabel={n.testing}>
            <Icon name="mail" />
            {n.test}
          </AdminButton>
        )}
      </div>
      {canTest && data.integration.enabled && <p className={styles.hint}>{n.testHelp}</p>}
      {data.checks === null ? (
        <p className={styles.muted} role="status">
          {n.never}
        </p>
      ) : (
        <>
          <p className={cx(styles.muted, styles.small)}>{fill(n.checkedAt, { when: formatDateTime(data.checks.checkedAt, language) })}</p>
          <ul className={page.items}>
            {data.checks.checks.map((check) => {
              const item = n.items[check.id]
              return (
                <li key={check.id} className={page.item}>
                  <span className={styles.spread}>
                    <span className={page.itemTitle}>{item.title}</span>
                    <span className={cx(styles.badge, CHECK_TONE[check.state])}>
                      <span className={styles.badgeDot} aria-hidden="true" />
                      {n.states[check.state]}
                    </span>
                  </span>
                  <span className={cx(styles.muted, styles.small)}>{item.help}</span>
                  <span className={cx(styles.small, page.finding)}>
                    {n.finding}: {check.detail}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

export function NotificationsPage() {
  const t = useText()
  const language = useInterfaceLanguage()
  const toast = useToast()
  const session = useSession()
  const [params, setParams] = useSearchParams()
  const [retrying, setRetrying] = useState<string | null>(null)
  const status = params.get('status') ?? ''
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const resource = useResource((signal) => endpoints.notifications.overview({ status, page: pageNumber > 1 ? pageNumber : undefined }, signal).then((answer) => answer.data), [status, pageNumber])
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

  const change = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }

  const kindLabel = (kind: string) => (n.log.kinds as Record<string, string>)[kind] ?? kind
  const errorSentence = (code: string | null) => (code ? (n.log.errors as Record<string, string>)[code] : undefined)
  const recordLink = (row: Delivery) => (row.relatedId ? (row.relatedType === 'inquiry' ? `/inquiries/${row.relatedId}` : `/quotes/${row.relatedId}`) : null)
  const canRetry = (row: Delivery) => row.status === 'failed' && session.can('requests:write') && Boolean(data?.integration.enabled)

  /** What happened to a message, said once: its state, why it failed in words, the provider's own (masked) reason, when it arrived. */
  const stateCell = (row: Delivery) => (
    <span className={styles.cellMain}>
      <StatusBadge kind="delivery" status={row.retrying ? 'retrying' : row.status} />
      {errorSentence(row.errorCode) && <span className={page.deliveryError}>{errorSentence(row.errorCode)}</span>}
      {row.lastError && <span className={cx(styles.muted, styles.small, page.deliveryError)}>{fill(n.log.lastFailure, { error: row.lastError })}</span>}
      {row.status === 'delivered' && row.deliveredAt && <span className={cx(styles.muted, styles.small)}>{fill(n.log.deliveredAt, { when: formatDateTime(row.deliveredAt, language) })}</span>}
      {row.status === 'accepted' && row.providerEvent === 'email.delivery_delayed' && <span className={cx(styles.muted, styles.small)}>{n.log.delayed}</span>}
      {row.retrying && row.nextAttemptAt && <span className={cx(styles.muted, styles.small)}>{fill(n.log.nextAttempt, { when: formatDateTime(row.nextAttemptAt, language) })}</span>}
    </span>
  )

  const referenceOf = (row: Delivery) => {
    const link = recordLink(row)
    if (!row.reference) return null
    return link ? (
      <Link className={cx(styles.cellLink, styles.muted, styles.small, styles.mono)} to={link}>
        {row.reference}
      </Link>
    ) : (
      <span className={cx(styles.muted, styles.small, styles.mono)}>{row.reference}</span>
    )
  }

  const columns: Column<Delivery>[] = [
    { key: 'when', header: n.log.columns.when, cell: (row) => formatDateTime(row.createdAt, language) },
    {
      key: 'kind',
      header: n.log.columns.kind,
      cell: (row) => (
        <span className={styles.cellMain}>
          <span className={styles.cellTitle}>{kindLabel(row.kind)}</span>
          {referenceOf(row)}
        </span>
      ),
    },
    { key: 'to', header: n.log.columns.to, cell: (row) => <span className={styles.cellTitle}>{row.recipient}</span> },
    { key: 'status', header: n.log.columns.status, cell: stateCell },
    { key: 'attempts', header: n.log.columns.attempts, cell: (row) => String(row.attempts) },
    {
      key: 'action',
      header: n.log.columns.action,
      cell: (row) =>
        canRetry(row) ? (
          <AdminButton onClick={() => void retry(row)} loading={retrying === row.id} loadingLabel={n.log.retrying}>
            <Icon name="refresh" />
            {n.log.retry}
          </AdminButton>
        ) : (
          t.common.noValue
        ),
    },
  ]

  const filterOptions = ['all', 'problem', 'retrying', 'pending', 'accepted', 'delivered', 'bounced', 'complained', 'failed', 'cancelled'].map((value) => ({ value: value === 'all' ? '' : value, label: (n.log.filters as Record<string, string>)[value] }))

  return (
    <>
      <PageHeader title={n.title} lead={n.lead} />
      {resource.loading && !data ? (
        <LoadingState />
      ) : resource.error || !data ? (
        <ErrorState error={resource.error} onRetry={resource.reload} />
      ) : (
        <div className={styles.stackLg}>
          <DetailPanel title={n.integration.title}>
            {data.integration.paused ? (
              <div className={cx(styles.notice, styles.noticeWarning)} role="status">
                <Icon name="alert" />
                <div>
                  <strong>{n.integration.paused}</strong>
                  <p>{n.integration.pausedBody}</p>
                </div>
              </div>
            ) : data.integration.enabled ? (
              <div className={styles.stack}>
                <p className={styles.row}>
                  <span className={cx(styles.badge, styles.toneInfo)}>
                    <span className={styles.badgeDot} aria-hidden="true" />
                    {n.integration.available}
                  </span>
                </p>
                <p className={styles.hint}>{n.integration.configuredNotVerified}</p>
                <dl className={styles.definitions}>
                  <dt>{n.integration.provider}</dt>
                  <dd>{(n.integration.providers as Record<string, string>)[data.integration.provider] ?? data.integration.provider}</dd>
                  <dt>{n.integration.sender}</dt>
                  <dd>{data.integration.senderConfigured ? n.integration.set : n.integration.notSet}</dd>
                  <dt>{n.integration.replyTo}</dt>
                  <dd>{data.integration.replyTo ?? n.integration.notSet}</dd>
                  <dt>{n.integration.owner}</dt>
                  <dd>{data.integration.ownerAddressConfigured ? n.integration.set : n.integration.notSet}</dd>
                  <dt>{n.integration.language}</dt>
                  <dd>{(t.languages as Record<string, string>)[data.integration.ownerLanguage] ?? data.integration.ownerLanguage}</dd>
                  {data.integration.provider === 'resend' && (
                    <>
                      <dt>{n.integration.webhook}</dt>
                      <dd>{data.integration.webhookSecretSet ? n.integration.set : n.integration.notSet}</dd>
                    </>
                  )}
                </dl>
                {!data.integration.ownerAddressConfigured && <p className={cx(styles.notice, styles.noticeWarning)}>{n.integration.noOwner}</p>}
                {!data.integration.replyTo && <p className={cx(styles.notice, styles.noticeWarning)}>{n.integration.noReplyTo}</p>}
                <p className={styles.hint}>{n.integration.sentMeans}</p>
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

          <DetailPanel title={n.checks.title}>
            <Checks data={data} canRun={session.can('system:read')} canTest={session.can('system:write')} onDone={resource.reload} />
          </DetailPanel>

          <DetailPanel title={n.types.title}>
            <NotificationTypes data={data} canChange={session.can('system:write')} onSaved={resource.reload} />
          </DetailPanel>

          <DetailPanel title={n.confirmations.title}>
            <ResponseNotes key={JSON.stringify(data.preferences.responseNote)} data={data} canChange={session.can('system:write')} onSaved={resource.reload} />
          </DetailPanel>

          <section className={styles.stack} aria-labelledby="delivery-log">
            <h2 id="delivery-log" className={styles.sectionTitle}>
              {n.counts.title}
            </h2>
            <p className={styles.row}>
              <span className={cx(styles.badge, styles.toneWarning)}>
                {n.counts.pending}: {data.counts.pending}
              </span>
              <span className={cx(styles.badge, styles.toneInfo)}>
                {n.counts.sent}: {data.counts.sent}
              </span>
              <span className={cx(styles.badge, styles.toneSuccess)}>
                {n.counts.delivered}: {data.counts.delivered}
              </span>
              <span className={cx(styles.badge, data.counts.bounced > 0 ? styles.toneDanger : styles.toneNeutral)}>
                {n.counts.bounced}: {data.counts.bounced}
              </span>
              <span className={cx(styles.badge, data.counts.failed > 0 ? styles.toneDanger : styles.toneNeutral)}>
                {n.counts.failed}: {data.counts.failed}
              </span>
            </p>
            <FilterDropdown label={n.log.filter} value={status} options={filterOptions} onChange={(value) => change({ status: value || null, page: null })} />
            {data.deliveries.length === 0 ? (
              status ? (
                <EmptyState icon="search" title={n.log.emptyFiltered} />
              ) : (
                <EmptyState icon="mail" title={n.log.empty}>
                  {n.log.emptyBody}
                </EmptyState>
              )
            ) : (
              <>
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
                        <StatusBadge kind="delivery" status={row.retrying ? 'retrying' : row.status} />
                      </div>
                      <div className={styles.listCardMeta}>
                        {referenceOf(row)}
                        <span>{formatDateTime(row.createdAt, language)}</span>
                        <span>{row.attempts}×</span>
                      </div>
                      {errorSentence(row.errorCode) && <span className={page.deliveryError}>{errorSentence(row.errorCode)}</span>}
                      {row.lastError && <span className={cx(styles.muted, styles.small, page.deliveryError)}>{fill(n.log.lastFailure, { error: row.lastError })}</span>}
                      {row.status === 'delivered' && row.deliveredAt && <span className={cx(styles.muted, styles.small)}>{fill(n.log.deliveredAt, { when: formatDateTime(row.deliveredAt, language) })}</span>}
                      {canRetry(row) && (
                        <AdminButton onClick={() => void retry(row)} loading={retrying === row.id} loadingLabel={n.log.retrying}>
                          <Icon name="refresh" />
                          {n.log.retry}
                        </AdminButton>
                      )}
                    </>
                  )}
                />
                <Pagination page={data.paging.page} pageSize={data.paging.pageSize} total={data.paging.total} onPage={(next) => change({ page: next > 1 ? String(next) : null })} />
              </>
            )}
          </section>
        </div>
      )}
    </>
  )
}
