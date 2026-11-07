import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import * as endpoints from '../api/endpoints'
import type { QuoteDetail, QuoteItem } from '../api/types'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { FullExperienceBrief } from '../components/FullExperienceBrief'
import { SelectField } from '../components/form'
import { Icon } from '../components/Icon'
import { InternalNotes } from '../components/InternalNotes'
import { DetailPanel, PageHeader } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { StatusBadge } from '../components/StatusBadge'
import { StatusForm } from '../components/StatusForm'
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

/** One quote request: exactly what was submitted (nothing here edits it), its items with the prices they had, and what can be done about it. */
export function QuoteDetailPage() {
  const t = useText()
  const language = useInterfaceLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const session = useSession()
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const resource = useResource((signal) => endpoints.quotes.get(id, signal).then((answer) => answer.data), [id])
  const [choice, setChoice] = useState('')
  const d = t.quotes.detail
  const quote = resource.data
  const canWrite = session.can('requests:write')
  const word = (group: Record<string, string>, value: string | null) => (value ? (group[value] ?? value) : t.common.noValue)

  const apply = (data: QuoteDetail) => resource.set(data)
  const failed = (error: unknown) => toast.error(describeError(t, error))

  const changeStatus = async (change: { status: string; notify: boolean; note: string }) => {
    try {
      const answer = await endpoints.quotes.update(id, { status: change.status, notify: change.notify, note: change.note || undefined })
      apply(answer.data)
      const outcome = answer.meta?.notification
      toast.success(outcome === 'queued' ? d.statusSavedEmailed : outcome === 'off' ? d.statusSavedNoEmail : d.statusSaved)
    } catch (error) {
      failed(error)
    }
  }

  const link = async (inquiryId: string | null) => {
    try {
      apply((await endpoints.quotes.update(id, { inquiryId })).data)
      setChoice('')
      toast.success(inquiryId ? d.linked : d.unlinked)
    } catch (error) {
      failed(error)
    }
  }

  const archive = async (archived: boolean) => {
    try {
      apply((await endpoints.quotes.update(id, { archived })).data)
      toast.success(archived ? d.archived : d.restored)
    } catch (error) {
      failed(error)
    }
  }

  const remove = async () => {
    const yes = await confirm({ title: d.deleteTitle, body: d.deleteBody, danger: true })
    if (!yes) return
    try {
      await endpoints.quotes.remove(id)
      toast.success(d.deleted)
      void navigate('/quotes')
    } catch (error) {
      failed(error)
    }
  }

  const addNote = async (body: string) => {
    try {
      apply((await endpoints.quotes.update(id, { addNote: body })).data)
      toast.success(t.notes.added)
    } catch (error) {
      failed(error)
      throw error
    }
  }

  if (resource.loading) return <LoadingState />
  if (resource.error || !quote) return <ErrorState level={1} error={resource.error} onRetry={resource.reload} />

  const subject = `${quote.name}`
  const candidates = quote.candidates.filter((candidate) => candidate.id !== quote.inquiry_id)
  const sums = quote.pricing.fixed.map((sum) => `${formatNumber(sum.amount, language)} ${sum.currency}`).join(', ')

  return (
    <>
      <PageHeader title={subject} back={{ to: '/quotes', label: d.back }} lead={<span className={styles.mono}>{quote.reference}</span>} actions={<StatusBadge kind="quote" status={quote.status} archived={quote.archived_at !== null} />} />
      {quote.archived_at && (
        <p className={styles.notice} role="status">
          {d.archivedNotice}
        </p>
      )}
      <div className={page.detail}>
        <div className={page.detailMain}>
          <DetailPanel title={d.customer}>
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
              <dt>{t.common.phone}</dt>
              <dd>{quote.phone ? <a href={`tel:${quote.phone.replace(/[^\d+]/g, '')}`}>{quote.phone}</a> : t.common.noValue}</dd>
              <dt>{t.common.language}</dt>
              <dd>{(t.languages as Record<string, string>)[quote.language] ?? quote.language}</dd>
              <dt>{t.common.received}</dt>
              <dd>{formatDateTime(quote.created_at, language)}</dd>
            </dl>
          </DetailPanel>

          {quote.kind === 'full_experience' ? (
            <DetailPanel title={`${t.shop.quote.kind}: ${t.shop.quote.briefTitle}`}>
              <p className={styles.hint}>{t.shop.quote.noItems}</p>
              <FullExperienceBrief json={quote.brief_json} />
            </DetailPanel>
          ) : (
          <DetailPanel title={d.services}>
            <ul className={page.items}>
              {quote.items.map((item) => (
                <li key={item.need} className={page.item}>
                  <span className={page.itemTitle}>{word(t.needs, item.need)}</span>
                  <dl className={styles.definitions}>
                    <dt>{d.columns.service}</dt>
                    <dd>{item.service ?? t.common.noValue}</dd>
                    <dt>{d.columns.package}</dt>
                    <dd>
                      {word(t.plans, item.plan)} · {priceText(t, item.snapshot.plan, language)}
                    </dd>
                    <dt>{d.columns.addons}</dt>
                    <dd>
                      {item.extras.length === 0
                        ? d.noExtras
                        : item.extras.map((code) => `${code}: ${priceText(t, item.snapshot.extras.find((part) => part.code === code) ?? null, language)}`).join('; ')}
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>
            <p className={`${styles.hint} ${page.tabPanelGap}`}>{quote.pricing.fixed.length === 0 ? d.pricingNone : fill(d.pricingSome, { sums, quoted: quote.pricing.quotedParts })}</p>
          </DetailPanel>
          )}

          <DetailPanel title={d.project}>
            <dl className={styles.definitions}>
              <dt>{d.description}</dt>
              <dd className={styles.prose}>{quote.description}</dd>
              <dt>{d.objective}</dt>
              <dd>{word(t.objectives, quote.objective)}</dd>
              <dt>{d.timing}</dt>
              <dd>{word(t.timings, quote.timing)}</dd>
              <dt>{d.requirements}</dt>
              <dd className={styles.prose}>{quote.requirements ?? t.common.noValue}</dd>
              <dt>{d.references}</dt>
              <dd className={styles.prose}>{quote.reference_notes ?? t.common.noValue}</dd>
            </dl>
            <p className={`${styles.hint} ${page.tabPanelGap}`}>{d.budget}</p>
          </DetailPanel>

          <DetailPanel>
            <InternalNotes notes={quote.notes} canAdd={canWrite} onAdd={addNote} />
          </DetailPanel>
        </div>

        <div className={page.detailSide}>
          {canWrite && (
            <DetailPanel title={d.status}>
              <StatusForm
                key={quote.status}
                kind="quote"
                current={quote.status}
                statuses={session.meta.statuses.quote}
                emailEnabled={session.meta.emailEnabled}
                copy={{ heading: d.changeStatus, button: d.changeStatus, emailSender: d.emailSender, emailNote: d.emailNote, emailNoteHelp: d.emailNoteHelp, emailOff: d.emailOff }}
                onSubmit={changeStatus}
              />
            </DetailPanel>
          )}

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
              {session.can('requests:delete') && (
                <AdminButton danger onClick={() => void remove()} className={page.wide}>
                  <Icon name="trash" />
                  {d.delete}
                </AdminButton>
              )}
            </div>
          </DetailPanel>

          <DetailPanel>
            <ActivityTimeline events={quote.activity} />
          </DetailPanel>
        </div>
      </div>
    </>
  )
}
