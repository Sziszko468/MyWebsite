import { Link, useNavigate, useParams } from 'react-router'
import * as endpoints from '../api/endpoints'
import type { InquiryDetail } from '../api/types'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { Icon } from '../components/Icon'
import { InternalNotes } from '../components/InternalNotes'
import { DetailPanel, PageHeader } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { StatusBadge } from '../components/StatusBadge'
import { StatusForm } from '../components/StatusForm'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import { describeError } from '../lib/errors'
import { mailtoLink } from '../lib/links'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

/** One inquiry: the message as it arrived, who sent it, and everything an administrator can do about it. */
export function InquiryDetailPage() {
  const t = useText()
  const language = useInterfaceLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const session = useSession()
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const resource = useResource((signal) => endpoints.inquiries.get(id, signal).then((answer) => answer.data), [id])
  const d = t.inquiries.detail
  const inquiry = resource.data
  const canWrite = session.can('requests:write')

  const apply = (data: InquiryDetail) => resource.set(data)
  const failed = (error: unknown) => toast.error(describeError(t, error))

  const changeStatus = async (change: { status: string; notify: boolean; note: string }) => {
    try {
      const answer = await endpoints.inquiries.update(id, { status: change.status, notify: change.notify, note: change.note || undefined })
      apply(answer.data)
      const outcome = answer.meta?.notification
      toast.success(outcome === 'queued' ? d.statusSavedEmailed : outcome === 'off' ? d.statusSavedNoEmail : d.statusSaved)
    } catch (error) {
      failed(error)
    }
  }

  const archive = async (archived: boolean) => {
    try {
      apply((await endpoints.inquiries.update(id, { archived })).data)
      toast.success(archived ? d.archived : d.restored)
    } catch (error) {
      failed(error)
    }
  }

  const remove = async () => {
    const yes = await confirm({ title: d.deleteTitle, body: d.deleteBody, danger: true })
    if (!yes) return
    try {
      await endpoints.inquiries.remove(id)
      toast.success(d.deleted)
      void navigate('/inquiries')
    } catch (error) {
      failed(error)
    }
  }

  const addNote = async (body: string) => {
    try {
      apply((await endpoints.inquiries.update(id, { addNote: body })).data)
      toast.success(t.notes.added)
    } catch (error) {
      failed(error)
      throw error
    }
  }

  if (resource.loading) return <LoadingState />
  if (resource.error || !inquiry) return <ErrorState level={1} error={resource.error} onRetry={resource.reload} />

  return (
    <>
      <PageHeader title={inquiry.subject} back={{ to: '/inquiries', label: d.back }} lead={<span className={styles.mono}>{inquiry.reference}</span>} actions={<StatusBadge kind="inquiry" status={inquiry.status} archived={inquiry.archived_at !== null} />} />
      {inquiry.archived_at && (
        <p className={styles.notice} role="status">
          {d.archivedNotice}
        </p>
      )}
      <div className={page.detail}>
        <div className={page.detailMain}>
          <DetailPanel title={d.message}>
            <p className={`${styles.prose} ${page.messageText}`}>{inquiry.message}</p>
          </DetailPanel>

          <DetailPanel title={d.contact}>
            <dl className={styles.definitions}>
              <dt>{t.common.name}</dt>
              <dd>{inquiry.name}</dd>
              <dt>{t.common.email}</dt>
              <dd>
                <a href={mailtoLink(inquiry.email, inquiry.subject, inquiry.reference)}>{inquiry.email}</a>
              </dd>
              <dt>{t.common.type}</dt>
              <dd>{(t.kinds as Record<string, string>)[inquiry.kind] ?? inquiry.kind}</dd>
              <dt>{d.language}</dt>
              <dd>{(t.languages as Record<string, string>)[inquiry.language] ?? inquiry.language}</dd>
              <dt>{d.received}</dt>
              <dd>{formatDateTime(inquiry.created_at, language)}</dd>
              <dt>{d.consent}</dt>
              <dd>{inquiry.consent_at ? formatDateTime(inquiry.consent_at, language) : d.noConsent}</dd>
            </dl>
          </DetailPanel>

          <DetailPanel title={d.relatedQuotes}>
            {inquiry.quotes.length === 0 ? (
              <p className={styles.muted}>{d.noRelatedQuotes}</p>
            ) : (
              <ul className={page.items}>
                {inquiry.quotes.map((quote) => (
                  <li key={quote.id} className={page.item}>
                    <span className={styles.spread}>
                      <Link className={page.itemTitle} to={`/quotes/${quote.id}`}>
                        {quote.reference}
                      </Link>
                      <StatusBadge kind="quote" status={quote.status} />
                    </span>
                    <span className={styles.muted}>{formatDateTime(quote.created_at, language)}</span>
                  </li>
                ))}
              </ul>
            )}
          </DetailPanel>

          <DetailPanel>
            <InternalNotes notes={inquiry.notes} canAdd={canWrite} onAdd={addNote} />
          </DetailPanel>
        </div>

        <div className={page.detailSide}>
          {canWrite && (
            <DetailPanel title={d.status}>
              <StatusForm
                key={inquiry.status}
                kind="inquiry"
                current={inquiry.status}
                statuses={session.meta.statuses.inquiry}
                emailEnabled={session.meta.emailEnabled}
                copy={{ heading: d.changeStatus, button: d.changeStatus, emailSender: d.emailSender, emailNote: d.emailNote, emailNoteHelp: d.emailNoteHelp, emailOff: d.emailOff }}
                onSubmit={changeStatus}
              />
            </DetailPanel>
          )}

          <DetailPanel title={d.actions}>
            <div className={page.actionList}>
              <AdminButton href={mailtoLink(inquiry.email, inquiry.subject, inquiry.reference)} className={page.wide}>
                <Icon name="mail" />
                {d.openMail}
              </AdminButton>
              {canWrite && (
                <AdminButton onClick={() => void archive(inquiry.archived_at === null)} className={page.wide}>
                  <Icon name="archive" />
                  {inquiry.archived_at === null ? d.archive : d.restore}
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
            <ActivityTimeline events={inquiry.activity} />
          </DetailPanel>
        </div>
      </div>
    </>
  )
}
