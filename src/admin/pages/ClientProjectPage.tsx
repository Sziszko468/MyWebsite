import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { cx } from '../../utils/cx'
import { ApiError } from '../api/client'
import { clientProjects as api, PROJECT_CATEGORIES, type ProjectView } from '../api/clients'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { CheckField, SelectField, TextAreaField, TextField } from '../components/form'
import { DetailPanel, PageHeader } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

/** One customer's project: its status (the only way a status changes), its dates, its milestones, what the customer is told, and the owner's private notes. */
export function ClientProjectPage() {
  const { id = '' } = useParams()
  const t = useText()
  const p = t.clients.project
  const language = useInterfaceLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const resource = useResource((signal) => api.get(id, signal), [id])
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [status, setStatus] = useState({ status: '', note: '', notify: false, notifyTouched: false })
  const [details, setDetails] = useState<{ name: string; category: string; startedOn: string; expectedOn: string } | null>(null)
  const [milestone, setMilestone] = useState({ title: '', dueOn: '' })
  const [update, setUpdate] = useState({ kind: 'update' as 'update' | 'feedback', note: '', notify: false })
  const [note, setNote] = useState('')

  async function run(name: string, work: () => Promise<unknown>, done: string, after?: () => void) {
    setBusy(name)
    setErrors({})
    try {
      await work()
      toast.success(done)
      after?.()
      resource.reload()
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) setErrors(Object.fromEntries(Object.entries(error.fields).map(([field, code]) => [field, code === 'required' ? p.required : p.invalid])))
      else toast.error(error instanceof ApiError ? error.message : String(error))
    } finally {
      setBusy(null)
    }
  }

  if (resource.loading) return <LoadingState />
  if (resource.error && !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />
  const data: ProjectView = resource.data!
  const project = data.project
  const form = details ?? { name: project.name, category: project.category, startedOn: project.started_on ?? '', expectedOn: project.expected_on ?? '' }

  const submitStatus = (event: FormEvent) => {
    event.preventDefault()
    if (!status.status) return
    void run('status', () => api.status(id, { status: status.status, note: status.note.trim() || undefined, notify: status.notifyTouched ? status.notify : undefined }), p.statusDone, () => setStatus({ status: '', note: '', notify: false, notifyTouched: false }))
  }

  return (
    <>
      <PageHeader title={project.name} lead={<span className={styles.mono}>{project.reference}</span>} back={{ to: `/clients/${project.customer_id}`, label: `${p.back}: ${data.customer.name || data.customer.email}` }} actions={
        <>
          <AdminButton variant="primary" to={`/client-projects/${project.id}/work`}>
            {t.work.open}
          </AdminButton>
          <AdminButton variant="secondary" to={`/communications?customerId=${project.customer_id}&projectId=${project.id}`}>
            {t.communications.title}
          </AdminButton>
          <AdminButton variant="secondary" to={`/client-projects/${project.id}/deliverables`}>
            {t.deliverables.open}
          </AdminButton>
        </>
      } />
      <div className={styles.stackLg}>
        <DetailPanel title={p.statusTitle}>
          <p>
            <strong>{p.status}:</strong> {p.statuses[project.status]}
            {data.quoteRequestReference && <span className={styles.muted}> · {p.request}: <span className={styles.mono}>{data.quoteRequestReference}</span></span>}
          </p>
          <form className={styles.stack} onSubmit={submitStatus}>
            <SelectField label={p.status} value={status.status} onChange={(event) => setStatus({ ...status, status: event.target.value })} options={[{ value: '', label: '–' }, ...data.allowedStatuses.map((value) => ({ value, label: p.statuses[value] }))]} />
            <TextAreaField label={p.statusNote} optional rows={3} maxLength={500} value={status.note} onChange={(event) => setStatus({ ...status, note: event.target.value })} />
            <CheckField label={p.statusNotify} checked={status.notifyTouched ? status.notify : false} onChange={(notify) => setStatus({ ...status, notify, notifyTouched: true })} />
            <div className={styles.formActions}>
              <AdminButton type="submit" variant="primary" disabled={!status.status} loading={busy === 'status'}>
                {p.statusSubmit}
              </AdminButton>
            </div>
          </form>
        </DetailPanel>

        <DetailPanel title={p.details}>
          <form
            className={styles.stack}
            onSubmit={(event) => {
              event.preventDefault()
              void run('details', () => api.edit(id, { name: form.name.trim(), category: form.category, startedOn: form.startedOn || null, expectedOn: form.expectedOn || null }), p.saved, () => setDetails(null))
            }}
            noValidate
          >
            <div className={styles.formGrid}>
              <TextField label={p.new.name} value={form.name} error={errors.name} onChange={(event) => setDetails({ ...form, name: event.target.value })} required />
              <SelectField label={p.new.category} value={form.category} onChange={(event) => setDetails({ ...form, category: event.target.value })} options={PROJECT_CATEGORIES.map((category) => ({ value: category, label: p.categories[category] }))} />
              <TextField label={p.new.started} type="date" optional value={form.startedOn} error={errors.startedOn} onChange={(event) => setDetails({ ...form, startedOn: event.target.value })} />
              <TextField label={p.new.expected} type="date" optional value={form.expectedOn} error={errors.expectedOn} onChange={(event) => setDetails({ ...form, expectedOn: event.target.value })} />
            </div>
            <div className={styles.formActions}>
              <AdminButton type="submit" loading={busy === 'details'}>
                {p.save}
              </AdminButton>
            </div>
          </form>
        </DetailPanel>

        <DetailPanel title={p.milestones}>
          {data.milestones.length === 0 ? (
            <p className={styles.muted}>{p.noMilestones}</p>
          ) : (
            <ul className={styles.stack}>
              {data.milestones.map((entry) => (
                <li key={entry.id} className={styles.spread}>
                  <span>
                    {entry.completed_at ? '✓ ' : '○ '}
                    {entry.title}
                    {entry.customer_visible === 0 && <span className={styles.muted}> · {t.work.milestones.hidden}</span>}
                    {entry.due_on && <span className={styles.muted}> · {entry.due_on}</span>}
                  </span>
                  <span className={styles.row}>
                    {!entry.completed_at && (
                      <AdminButton variant="text" onClick={() => void run(`done-${entry.id}`, () => api.doneMilestone(id, entry.id), p.saved)} loading={busy === `done-${entry.id}`}>
                        {p.milestoneDone}
                      </AdminButton>
                    )}
                    {!entry.completed_at && (
                      <AdminButton
                        variant="text"
                        danger
                        onClick={async () => {
                          if (await confirm({ title: p.milestoneRemove, body: p.deleteMilestoneConfirm, confirmLabel: p.milestoneRemove, danger: true })) void run(`remove-${entry.id}`, () => api.removeMilestone(id, entry.id), p.saved)
                        }}
                      >
                        {p.milestoneRemove}
                      </AdminButton>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form
            className={styles.stack}
            onSubmit={(event) => {
              event.preventDefault()
              void run('milestone', () => api.addMilestone(id, { title: milestone.title.trim(), dueOn: milestone.dueOn || undefined }), p.saved, () => setMilestone({ title: '', dueOn: '' }))
            }}
            noValidate
          >
            <div className={styles.formGrid}>
              <TextField label={p.milestoneTitle} value={milestone.title} error={errors.title} onChange={(event) => setMilestone({ ...milestone, title: event.target.value })} />
              <TextField label={p.milestoneDue} type="date" optional value={milestone.dueOn} error={errors.dueOn} onChange={(event) => setMilestone({ ...milestone, dueOn: event.target.value })} />
            </div>
            <div className={styles.formActions}>
              <AdminButton type="submit" loading={busy === 'milestone'}>
                {p.milestoneAdd}
              </AdminButton>
            </div>
          </form>
        </DetailPanel>

        <DetailPanel title={p.updates}>
          <form
            className={styles.stack}
            onSubmit={(event) => {
              event.preventDefault()
              void run('update', () => api.update(id, { kind: update.kind, note: update.note.trim(), notify: update.notify ? true : undefined }), p.posted, () => setUpdate({ kind: 'update', note: '', notify: false }))
            }}
            noValidate
          >
            <SelectField label={p.updateKind} value={update.kind} onChange={(event) => setUpdate({ ...update, kind: event.target.value as 'update' | 'feedback' })} options={[{ value: 'update', label: p.kinds.update }, { value: 'feedback', label: p.kinds.feedback }]} />
            <TextAreaField label={p.updateNote} rows={3} maxLength={1000} value={update.note} error={errors.note} onChange={(event) => setUpdate({ ...update, note: event.target.value })} />
            <CheckField label={p.updateNotify} checked={update.notify} onChange={(notify) => setUpdate({ ...update, notify })} />
            <div className={styles.formActions}>
              <AdminButton type="submit" variant="primary" loading={busy === 'update'}>
                {p.updateSubmit}
              </AdminButton>
            </div>
          </form>
        </DetailPanel>

        <DetailPanel title={p.notes}>
          <p className={styles.muted}>{p.notesNote}</p>
          {data.notes.length === 0 ? (
            <p>{p.noNotes}</p>
          ) : (
            <ul className={styles.stack}>
              {data.notes.map((entry) => (
                <li key={entry.id}>
                  <p className={page.messageText}>{entry.body}</p>
                  <span className={cx(styles.muted, styles.small)}>{entry.authorEmail ?? '–'} · {formatDateTime(entry.createdAt, language)}</span>
                </li>
              ))}
            </ul>
          )}
          <form
            className={styles.stack}
            onSubmit={(event) => {
              event.preventDefault()
              void run('note', () => api.note(id, note.trim()), p.saved, () => setNote(''))
            }}
            noValidate
          >
            <TextAreaField label={p.notes} rows={3} maxLength={2000} value={note} error={errors.body} onChange={(event) => setNote(event.target.value)} />
            <div className={styles.formActions}>
              <AdminButton type="submit" loading={busy === 'note'}>
                {p.noteAdd}
              </AdminButton>
            </div>
          </form>
        </DetailPanel>

        <DetailPanel title={p.timeline}>
          <ol className={styles.timeline}>
            {data.events.map((event) => (
              <li key={event.id} className={styles.timelineItem}>
                <span className={styles.timelineWhen}>{formatDateTime(event.created_at, language)}</span>
                <span>
                  {t.work.events[event.event_type]}
                  {event.subject ? ` · ${event.subject}` : ''}
                  {event.to_status && event.event_type === 'status_changed' ? ` · ${p.statuses[event.to_status as keyof typeof p.statuses]}` : ''}
                  {event.visibility === 'internal' ? <span className={cx(styles.muted, styles.small)}> · {t.work.task.internal}</span> : null}
                  {event.adminEmail ? <span className={cx(styles.muted, styles.small)}> · {event.adminEmail}</span> : null}
                  {event.note ? <span className={page.messageText}>{event.note}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </DetailPanel>

        <DetailPanel title={p.documents}>
          <p className={cx(styles.notice, styles.noticeWarning)}>{p.documentsNote}</p>
          {data.documents.length === 0 && <p className={styles.muted}>{p.noDocuments}</p>}
        </DetailPanel>
      </div>
    </>
  )
}
