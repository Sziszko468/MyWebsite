import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import * as endpoints from '../api/endpoints'
import type { Quotation, QuoteDetail, QuoteItem } from '../api/types'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { FullExperienceBrief } from '../components/FullExperienceBrief'
import { CheckField, SelectField, TextAreaField } from '../components/form'
import { Icon } from '../components/Icon'
import { InternalNotes } from '../components/InternalNotes'
import { DetailPanel, PageHeader } from '../components/layout'
import { QuoteStatusForm, type QuoteStatusChange } from '../components/QuoteStatusForm'
import { ErrorState, LoadingState } from '../components/states'
import { StatusBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, formatNumber, useInterfaceLanguage, useText } from '../i18n'
import type { AdminText } from '../i18n/en'
import { describeError } from '../lib/errors'
import { mailtoLink } from '../lib/links'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

/** The price a part had when the request was made: the approved figure stored with the item, or "on request". */
function priceText(t: AdminText, part: QuoteItem['snapshot']['plan'], language: 'hu' | 'en'): string {
  if (!part) return t.common.noValue
  if (part.price.kind === 'from') return fill(t.quotes.detail.priceFrom, { amount: formatNumber(part.price.amount, language), currency: part.price.currency })
  return part.price.kind === 'tbd' ? t.quotes.detail.priceTbd : t.quotes.detail.priceQuote
}

/** The names the request saved for a line (so it reads as the customer saw it), in the administrator's language where there is one. */
function savedName(names: unknown, language: string): string | null {
  if (typeof names !== 'object' || names === null) return null
  const map = names as Record<string, unknown>
  const value = map[language] ?? map.hu ?? map.en
  return typeof value === 'string' ? value : null
}

/**
 * One quote request, complete: who asked for what, the offers written for it (each version, what it is worth, what can be done with it), the questions
 * the customer asked on the quotation page, the e-mails about it and how they fared, and the history of every important step. Nothing here edits what the
 * customer submitted.
 */
export function QuoteDetailPage() {
  const t = useText()
  const q = t.quotation
  const language = useInterfaceLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const session = useSession()
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const resource = useResource((signal) => endpoints.quotes.get(id, signal).then((answer) => answer.data), [id])
  const [choice, setChoice] = useState('')
  const [revising, setRevising] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [reasonTried, setReasonTried] = useState(false)
  const [message, setMessage] = useState('')
  const [notifyMessage, setNotifyMessage] = useState(false)
  const d = t.quotes.detail
  const quote = resource.data
  const canWrite = session.can('requests:write')
  const word = (group: Record<string, string>, value: string | null) => (value ? (group[value] ?? value) : t.common.noValue)

  const apply = (data: QuoteDetail) => resource.set(data)
  const failed = (error: unknown) => toast.error(describeError(t, error))
  const run = async (work: () => Promise<void>) => {
    try {
      await work()
    } catch (error) {
      failed(error)
    }
  }

  const changeStatus = (change: QuoteStatusChange) =>
    run(async () => {
      const answer = await endpoints.quotes.update(id, { status: change.status, show: change.show || undefined, notify: change.notify || undefined, note: change.note || undefined, internalNote: change.internalNote || undefined })
      apply(answer.data)
      const outcome = answer.meta?.notification
      toast.success(outcome === 'queued' ? d.statusSavedEmailed : outcome === 'off' ? d.statusSavedNoEmail : d.statusSaved)
    })

  const cancelRequest = (): Promise<void> =>
    run(async () => {
      if (!(await confirm({ title: q.detail.cancelTitle, body: q.detail.cancelBody, danger: true }))) return
      apply((await endpoints.quotes.update(id, { status: 'cancelled' })).data)
      toast.success(d.statusSaved)
    })

  const link = (inquiryId: string | null) =>
    run(async () => {
      apply((await endpoints.quotes.update(id, { inquiryId })).data)
      setChoice('')
      toast.success(inquiryId ? d.linked : d.unlinked)
    })

  const archive = (archived: boolean) =>
    run(async () => {
      if (archived && !(await confirm({ title: q.detail.archiveTitle, body: q.detail.archiveBody }))) return
      apply((await endpoints.quotes.update(id, { archived })).data)
      toast.success(archived ? d.archived : d.restored)
    })

  const remove = () =>
    run(async () => {
      if (!(await confirm({ title: d.deleteTitle, body: d.deleteBody, danger: true }))) return
      await endpoints.quotes.remove(id)
      toast.success(d.deleted)
      void navigate('/quotes')
    })

  const addNote = async (body: string) => {
    try {
      apply((await endpoints.quotes.update(id, { addNote: body })).data)
      toast.success(t.notes.added)
    } catch (error) {
      failed(error)
      throw error
    }
  }

  const savePriority = (priority: string) =>
    run(async () => {
      apply((await endpoints.quotes.update(id, { priority })).data)
      toast.success(q.detail.savePriority)
    })

  const postUpdate = () =>
    run(async () => {
      const answer = await endpoints.quotes.update(id, { update: { message, notify: notifyMessage } })
      apply(answer.data)
      setMessage('')
      setNotifyMessage(false)
      toast.success(answer.meta?.notification === 'queued' ? q.detail.customerView.postedEmailed : q.detail.customerView.posted)
    })

  const resendConfirmation = () =>
    run(async () => {
      await endpoints.quotes.resendConfirmation(id)
      toast.success(q.detail.deliveries.confirmationResent)
      resource.reload()
    })

  const retryDelivery = (deliveryId: string) =>
    run(async () => {
      await endpoints.notifications.retry(deliveryId)
      toast.success(q.detail.deliveries.retried)
      resource.reload()
    })

  const startRevision = (from: Quotation) =>
    run(async () => {
      setReasonTried(true)
      if (reason.trim().length < 3) return
      const started = await endpoints.quotes.startQuotation(id, { from: from.id, reason: reason.trim() })
      toast.success(q.detail.quotations.started)
      void navigate(`/quotes/${id}/versions/${started.data.quotation.id}`)
    })

  const resendQuotation = (quotation: Quotation) =>
    run(async () => {
      await endpoints.quotations.resend(quotation.id)
      toast.success(q.detail.quotations.resent)
      resource.reload()
    })

  const withdraw = (quotation: Quotation) =>
    run(async () => {
      if (!(await confirm({ title: q.detail.quotations.withdrawTitle, body: q.detail.quotations.withdrawBody, danger: true }))) return
      await endpoints.quotations.withdraw(quotation.id)
      toast.success(q.detail.quotations.withdrawn)
      resource.reload()
    })

  if (resource.loading) return <LoadingState />
  if (resource.error || !quote) return <ErrorState level={1} error={resource.error} onRetry={resource.reload} />

  const candidates = quote.candidates.filter((candidate) => candidate.id !== quote.inquiry_id)
  const sums = quote.pricing.fixed.map((sum) => `${formatNumber(sum.amount, language)} ${sum.currency}`).join(', ')
  const typeWord = (q.types as Record<string, string>)[quote.request_type] ?? quote.request_type
  const sourceWord = (q.sources as Record<string, string>)[quote.source] ?? quote.source
  const hasDraft = quote.quotations.some((row) => row.status === 'draft')
  const lastQuotation = quote.quotations.at(-1)
  const cancellable = canWrite && quote.nextStatuses.includes('cancelled')
  const yesNo = (value: boolean) => (value ? q.detail.yes : q.detail.no)
  const moves = session.meta.quoteTransitions[quote.status] ?? []

  return (
    <>
      <PageHeader
        title={quote.name}
        back={{ to: '/quotes', label: d.back }}
        lead={<span className={styles.mono}>{quote.reference}</span>}
        actions={<StatusBadge kind="quote" status={quote.status} archived={quote.archived_at !== null} />}
      />
      {quote.archived_at && (
        <p className={styles.notice} role="status">
          {d.archivedNotice}
        </p>
      )}
      <div className={page.detail}>
        <div className={page.detailMain}>
          <DetailPanel title={q.detail.request}>
            <dl className={styles.definitions}>
              <dt>{t.common.name}</dt>
              <dd>{quote.name}</dd>
              <dt>{t.common.email}</dt>
              <dd>
                <a href={mailtoLink(quote.email, t.quotes.title, quote.reference)}>{quote.email}</a>
              </dd>
              {quote.company && (
                <>
                  <dt>{t.shop.quote.company}</dt>
                  <dd>{quote.company}</dd>
                </>
              )}
              {quote.website && (
                <>
                  <dt>{q.detail.website}</dt>
                  <dd>
                    <a href={quote.website} target="_blank" rel="noopener noreferrer nofollow">
                      {quote.website}
                    </a>
                  </dd>
                </>
              )}
              <dt>{t.common.phone}</dt>
              <dd>{quote.phone ? <a href={`tel:${quote.phone.replace(/[^\d+]/g, '')}`}>{quote.phone}</a> : t.common.noValue}</dd>
              <dt>{t.common.language}</dt>
              <dd>{(t.languages as Record<string, string>)[quote.language] ?? quote.language}</dd>
              <dt>{q.detail.type}</dt>
              <dd>{typeWord}</dd>
              <dt>{q.detail.source}</dt>
              <dd>{sourceWord}</dd>
              <dt>{t.common.received}</dt>
              <dd>{formatDateTime(quote.created_at, language)}</dd>
              <dt>{q.detail.consent}</dt>
              <dd>{quote.consent_at ? `${q.detail.yes} · ${formatDateTime(quote.consent_at, language)}` : q.detail.no}</dd>
              <dt>{q.detail.marketing}</dt>
              <dd>{yesNo(quote.marketing_consent_at !== null)}</dd>
              <dt>{q.detail.customerStatus}</dt>
              <dd>{word(t.status.quote as Record<string, string>, quote.customer_status)}</dd>
            </dl>
          </DetailPanel>

          {quote.kind === 'full_experience' ? (
            <DetailPanel title={`${t.shop.quote.kind}: ${t.shop.quote.briefTitle}`}>
              <p className={styles.hint}>{t.shop.quote.noItems}</p>
              <FullExperienceBrief json={quote.brief_json} />
            </DetailPanel>
          ) : (
            quote.items.length > 0 && (
              <DetailPanel title={d.services}>
                <ul className={page.items}>
                  {quote.items.map((item) => (
                    <li key={item.need} className={page.item}>
                      <span className={page.itemTitle}>{word(t.needs, item.need)}</span>
                      <dl className={styles.definitions}>
                        <dt>{d.columns.service}</dt>
                        <dd>{savedName(item.names.service, language) ?? item.service ?? t.common.noValue}</dd>
                        <dt>{d.columns.package}</dt>
                        <dd>
                          {savedName(item.names.package, language) ?? word(t.plans, item.plan)} · {priceText(t, item.snapshot.plan, language)}
                        </dd>
                        <dt>{d.columns.addons}</dt>
                        <dd>
                          {item.extras.length === 0
                            ? d.noExtras
                            : item.extras
                                .map((code) => {
                                  const saved = (item.names.extras as Array<{ code: string; names: unknown }> | undefined)?.find((extra) => extra.code === code)
                                  return `${savedName(saved?.names, language) ?? code}: ${priceText(t, item.snapshot.extras.find((part) => part.code === code) ?? null, language)}`
                                })
                                .join('; ')}
                        </dd>
                      </dl>
                    </li>
                  ))}
                </ul>
                <p className={`${styles.hint} ${page.tabPanelGap}`}>{quote.pricing.fixed.length === 0 ? d.pricingNone : fill(d.pricingSome, { sums, quoted: quote.pricing.quotedParts })}</p>
              </DetailPanel>
            )
          )}

          <DetailPanel title={d.project}>
            <dl className={styles.definitions}>
              <dt>{d.description}</dt>
              <dd className={styles.prose}>{quote.description}</dd>
              <dt>{q.detail.budget}</dt>
              <dd>{quote.budget_range ?? t.common.noValue}</dd>
              <dt>{d.objective}</dt>
              <dd>{word(t.objectives, quote.objective)}</dd>
              <dt>{d.timing}</dt>
              <dd>{word(t.timings, quote.timing)}</dd>
              <dt>{d.requirements}</dt>
              <dd className={styles.prose}>{quote.requirements ?? t.common.noValue}</dd>
              <dt>{d.references}</dt>
              <dd className={styles.prose}>{quote.reference_notes ?? t.common.noValue}</dd>
            </dl>
          </DetailPanel>

          <DetailPanel
            title={q.detail.quotations.title}
            actions={
              canWrite && quote.quotations.length === 0 ? (
                <AdminButton to={`/quotes/${id}/create`} variant="primary">
                  <Icon name="quote" />
                  {q.detail.quotations.create}
                </AdminButton>
              ) : undefined
            }
          >
            {!session.meta.quotationsReady && <p className={styles.notice}>{q.detail.quotations.notReady}</p>}
            {quote.quotations.length === 0 ? (
              <p className={styles.muted}>{q.detail.quotations.none}</p>
            ) : (
              <ul className={page.items}>
                {[...quote.quotations].reverse().map((row) => (
                  <li key={row.id} className={page.item}>
                    <div className={styles.spread}>
                      <span className={page.itemTitle}>
                        {fill(q.detail.quotations.version, { n: row.version })} · <span className={styles.mono}>{row.reference}</span>
                      </span>
                      <StatusBadge kind="quotation" status={row.status} />
                    </div>
                    <p>{row.title || t.common.noValue}</p>
                    <dl className={styles.definitions}>
                      <dt>{q.detail.quotations.total}</dt>
                      <dd>{row.view.pricing.total?.text ?? (row.pricing_mode === 'custom' ? q.detail.quotations.customPrice : t.common.noValue)}</dd>
                      {row.valid_until && (
                        <>
                          <dt>{q.detail.quotations.validUntil}</dt>
                          <dd>{row.valid_until}</dd>
                        </>
                      )}
                      {row.sent_at && (
                        <>
                          <dt />
                          <dd>{fill(q.detail.quotations.sent, { date: formatDateTime(row.sent_at, language) })}</dd>
                        </>
                      )}
                      {row.accepted_at && (
                        <>
                          <dt />
                          <dd>{fill(q.detail.quotations.accepted, { date: formatDateTime(row.accepted_at, language) })}</dd>
                        </>
                      )}
                      {row.declined_at && (
                        <>
                          <dt />
                          <dd>{fill(q.detail.quotations.declined, { date: formatDateTime(row.declined_at, language) })}</dd>
                        </>
                      )}
                    </dl>
                    {row.revision_reason && <p className={styles.hint}>{fill(q.detail.quotations.reason, { reason: row.revision_reason })}</p>}
                    {row.decline_reason && <p className={styles.hint}>{fill(q.detail.quotations.declineReason, { reason: row.decline_reason })}</p>}
                    <div className={page.actionList}>
                      <AdminButton to={`/quotes/${id}/versions/${row.id}`}>
                        <Icon name={row.status === 'draft' ? 'edit' : 'external'} />
                        {row.status === 'draft' ? q.detail.quotations.edit : q.detail.quotations.view}
                      </AdminButton>
                      {canWrite && row.status === 'sent' && (
                        <>
                          <AdminButton onClick={() => void resendQuotation(row)}>
                            <Icon name="mail" />
                            {q.detail.quotations.resend}
                          </AdminButton>
                          <AdminButton danger onClick={() => void withdraw(row)}>
                            {q.detail.quotations.withdraw}
                          </AdminButton>
                        </>
                      )}
                      {canWrite && !hasDraft && row === lastQuotation && ['sent', 'declined', 'withdrawn'].includes(row.status) && (
                        <AdminButton
                          onClick={() => {
                            setRevising(revising === row.id ? null : row.id)
                            setReason('')
                            setReasonTried(false)
                          }}
                        >
                          <Icon name="plus" />
                          {q.detail.quotations.newVersion}
                        </AdminButton>
                      )}
                    </div>
                    {revising === row.id && (
                      <div className={styles.stack}>
                        <p className={styles.hint}>{q.detail.quotations.newVersionHelp}</p>
                        <TextAreaField label={q.detail.quotations.reasonLabel} rows={2} value={reason} maxLength={500} error={reasonTried && reason.trim().length < 3 ? q.detail.quotations.reasonRequired : null} onChange={(event) => setReason(event.target.value)} />
                        <AdminButton variant="primary" onClick={() => void startRevision(row)}>
                          {q.detail.quotations.newVersionTitle}
                        </AdminButton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </DetailPanel>

          {quote.revisions.length > 0 && (
            <DetailPanel title={q.detail.revisions.title}>
              <p className={styles.hint}>{q.detail.revisions.note}</p>
              <ul className={page.items}>
                {quote.revisions.map((row) => (
                  <li key={row.id} className={page.item}>
                    <span className={styles.muted}>{formatDateTime(row.created_at, language)}</span>
                    <p className={styles.prose}>{row.message}</p>
                  </li>
                ))}
              </ul>
            </DetailPanel>
          )}

          <DetailPanel>
            <InternalNotes notes={quote.notes} canAdd={canWrite} onAdd={addNote} />
          </DetailPanel>

          <DetailPanel title={q.detail.history.title}>
            <p className={styles.hint}>{q.detail.history.help}</p>
            {quote.history.length === 0 ? (
              <p className={styles.muted}>{q.detail.history.none}</p>
            ) : (
              <ol className={page.items}>
                {quote.history.map((event) => (
                  <li key={event.id} className={page.item}>
                    <span className={page.itemTitle}>
                      {(q.detail.history.events as Record<string, string>)[event.type] ?? event.type}
                      {event.to && event.type === 'status_changed' ? `: ${word(t.status.quote as Record<string, string>, event.from)} → ${word(t.status.quote as Record<string, string>, event.to)}` : ''}
                    </span>
                    <span className={`${styles.muted} ${styles.small}`}>
                      {formatDateTime(event.at, language)} · {event.actor ?? (q.detail.history.actors as Record<string, string>)[event.actorType]}
                      {event.quoteReference ? ` · ${event.quoteReference}` : ''}
                      {event.summary ? ` · ${event.summary}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </DetailPanel>
        </div>

        <div className={page.detailSide}>
          {canWrite && (
            <DetailPanel title={d.status}>
              <QuoteStatusForm key={`${quote.status}-${quote.updated_at}`} current={quote.status} moves={moves} emailEnabled={session.meta.emailEnabled} onSubmit={changeStatus} />
            </DetailPanel>
          )}

          <DetailPanel title={q.detail.priority}>
            <SelectField label={q.detail.priority} value={quote.priority} disabled={!canWrite} onChange={(event) => void savePriority(event.target.value)} options={session.meta.quoteMeta.priorities.map((value) => ({ value, label: (q.priorities as Record<string, string>)[value] ?? value }))} />
          </DetailPanel>

          <DetailPanel title={q.detail.customerView.title}>
            <p className={styles.hint}>{q.detail.customerView.help}</p>
            <ul className={page.items}>
              {quote.customerUpdates.map((update) => (
                <li key={update.id} className={page.item}>
                  <span className={`${styles.muted} ${styles.small}`}>
                    {formatDateTime(update.created_at, language)} · {(q.detail.customerView.kinds as Record<string, string>)[update.kind] ?? update.kind}
                  </span>
                  {update.status && <span>{word(t.status.quote as Record<string, string>, update.status)}</span>}
                  {update.body && <p className={styles.prose}>{update.body}</p>}
                </li>
              ))}
            </ul>
            {canWrite && (
              <div className={styles.stack}>
                <TextAreaField label={q.detail.customerView.messageLabel} rows={3} value={message} maxLength={1000} onChange={(event) => setMessage(event.target.value)} />
                <CheckField label={q.detail.customerView.notify} checked={notifyMessage && session.meta.emailEnabled} disabled={!session.meta.emailEnabled} onChange={setNotifyMessage} />
                <AdminButton disabled={message.trim().length === 0} onClick={() => void postUpdate()}>
                  {q.detail.customerView.post}
                </AdminButton>
              </div>
            )}
          </DetailPanel>

          <DetailPanel title={d.relatedInquiry}>
            {quote.inquiry ? (
              <div className={styles.stack}>
                <p>
                  <Link to={`/inquiries/${quote.inquiry.id}`}>{quote.inquiry.subject}</Link>
                  <br />
                  <span className={`${styles.muted} ${styles.small} ${styles.mono}`}>{quote.inquiry.reference}</span>
                </p>
                {canWrite && (
                  <AdminButton onClick={() => void link(null)} className={page.wide}>
                    <Icon name="link" />
                    {d.unlink}
                  </AdminButton>
                )}
              </div>
            ) : (
              <div className={styles.stack}>
                <p className={styles.muted}>{d.noInquiry}</p>
                {canWrite &&
                  (candidates.length === 0 ? (
                    <p className={styles.hint}>{d.linkNone}</p>
                  ) : (
                    <>
                      <SelectField label={d.linkLabel} hint={d.linkHelp} value={choice} onChange={(event) => setChoice(event.target.value)} options={[{ value: '', label: d.linkChoose }, ...candidates.map((candidate) => ({ value: candidate.id, label: `${candidate.reference} · ${candidate.subject}` }))]} />
                      <AdminButton disabled={choice === ''} onClick={() => void link(choice)} className={page.wide}>
                        <Icon name="link" />
                        {d.link}
                      </AdminButton>
                    </>
                  ))}
              </div>
            )}
          </DetailPanel>

          <DetailPanel title={q.detail.deliveries.title}>
            <p className={styles.hint}>{q.detail.deliveries.help}</p>
            {quote.deliveries.length === 0 ? (
              <p className={styles.muted}>{q.detail.deliveries.none}</p>
            ) : (
              <ul className={page.items}>
                {quote.deliveries.map((delivery) => (
                  <li key={delivery.id} className={page.item}>
                    <div className={styles.spread}>
                      <span className={page.itemTitle}>{(q.detail.deliveries.kinds as Record<string, string>)[delivery.kind] ?? delivery.kind}</span>
                      <StatusBadge kind="delivery" status={delivery.status} />
                    </div>
                    <span className={`${styles.muted} ${styles.small}`}>
                      {q.detail.deliveries.to}: {delivery.recipient} · {q.detail.deliveries.tries}: {delivery.attempts} · {formatDateTime(delivery.createdAt, language)}
                    </span>
                    {delivery.lastError && <span className={`${styles.small} ${styles.error}`}>{delivery.lastError}</span>}
                    {canWrite && delivery.status === 'failed' && (
                      <AdminButton onClick={() => void retryDelivery(delivery.id)}>
                        <Icon name="refresh" />
                        {q.detail.deliveries.retry}
                      </AdminButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canWrite && session.meta.emailEnabled && (
              <AdminButton onClick={() => void resendConfirmation()} className={page.wide}>
                <Icon name="mail" />
                {q.detail.deliveries.resendConfirmation}
              </AdminButton>
            )}
          </DetailPanel>

          <DetailPanel title={d.actions}>
            <div className={page.actionList}>
              <AdminButton href={mailtoLink(quote.email, t.quotes.title, quote.reference)} className={page.wide}>
                <Icon name="mail" />
                {d.openMail}
              </AdminButton>
              <AdminButton href={endpoints.quotes.jsonUrl(quote.id)} download className={page.wide}>
                <Icon name="download" />
                {d.exportJson}
              </AdminButton>
              {canWrite && (
                <AdminButton onClick={() => void archive(quote.archived_at === null)} className={page.wide}>
                  <Icon name="archive" />
                  {quote.archived_at === null ? d.archive : d.restore}
                </AdminButton>
              )}
              {cancellable && (
                <AdminButton danger onClick={() => void cancelRequest()} className={page.wide}>
                  {t.status.quote.cancelled}
                </AdminButton>
              )}
              {session.can('requests:delete') && (
                <AdminButton danger onClick={() => void remove()} className={page.wide}>
                  <Icon name="trash" />
                  {d.delete}
                </AdminButton>
              )}
            </div>
          </DetailPanel>
        </div>
      </div>
    </>
  )
}
