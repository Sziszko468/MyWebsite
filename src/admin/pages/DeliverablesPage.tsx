import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { DELIVERABLE_TYPES, deliverables, type DeliverableRow, type DeliverableType } from '../api/deliverables'
import { work } from '../api/work'
import { AdminButton } from '../components/AdminButton'
import { SelectField, TextAreaField, TextField } from '../components/form'
import { DetailPanel, PageHeader } from '../components/layout'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { Tag } from '../components/work/parts'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import w from '../styles/work.module.scss'

/**
 * The deliverables of one client project (PROMPT 27): the list, with the state of each, its current version, the customer's last activity and what is waiting for the owner, and the
 * form that makes a new one. A deliverable is a draft (nobody else sees it) until a version of it is published; the page says what the customer can see.
 */

const PUBLICATION_TONE = { draft: 'neutral', published: 'success', archived: 'neutral' } as const
const REVIEW_TONE = { not_submitted: 'neutral', awaiting_customer: 'warning', changes_requested: 'warning', approved: 'success', superseded: 'info' } as const

/** What a refused request says, field by field, in the administrator's language. */
export function useFieldErrors() {
  const t = useText().deliverables.form
  return (error: ApiError): Record<string, string> => Object.fromEntries(Object.entries(error.fields).map(([field, code]) => [field, code === 'required' ? t.required : code === 'tooLong' ? t.tooLong : code === 'invalidUrl' ? t.invalidUrl : t.invalid]))
}

export function DeliverablesPage() {
  const { id = '' } = useParams()
  const t = useText().deliverables
  const language = useInterfaceLanguage()
  const toast = useToast()
  const navigate = useNavigate()
  const fieldErrors = useFieldErrors()
  const resource = useResource((signal) => deliverables.list(id, signal), [id])
  const tasks = useResource((signal) => work.workspace(id, {}, signal), [id])
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState({ title: '', type: 'website_preview' as DeliverableType, customerDescription: '', internalDescription: '', taskId: '', versionTitle: '', versionDescription: '', previewUrl: '', imageUrl: '' })

  if (resource.loading) return <LoadingState />
  if (resource.error && !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />
  const { deliverables: rows, previewOrigins } = resource.data!
  const projectName = tasks.data?.project.name ?? ''

  async function create(event: { preventDefault: () => void }) {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const made = await deliverables.create(id, {
        title: draft.title.trim(),
        type: draft.type,
        customerDescription: draft.customerDescription.trim() || undefined,
        internalDescription: draft.internalDescription.trim() || undefined,
        taskId: draft.taskId || null,
        versionTitle: draft.versionTitle.trim() || undefined,
        versionDescription: draft.versionDescription.trim() || undefined,
        previewUrl: draft.previewUrl.trim() || null,
        imageUrl: draft.imageUrl.trim() || null,
      })
      toast.success(t.new.created)
      void navigate(`/client-projects/${id}/deliverables/${made.id}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) setErrors(fieldErrors(error))
      else toast.error(error instanceof ApiError ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const row = (entry: DeliverableRow) => (
    <tr key={entry.id}>
      <td>
        <div className={styles.cellMain}>
          <Link to={`/client-projects/${id}/deliverables/${entry.id}`} className={styles.cellLink}>
            <span className={styles.cellTitle}>{entry.title}</span>
          </Link>
          <span className={styles.mono}>{entry.reference}</span>
          <span className={w.hint}>{t.types[entry.type]}</span>
        </div>
      </td>
      <td>
        <Tag tone={PUBLICATION_TONE[entry.publicationState]}>{t.publication[entry.publicationState]}</Tag>
      </td>
      <td>
        <Tag tone={REVIEW_TONE[entry.reviewState]}>{t.review[entry.reviewState]}</Tag>
      </td>
      <td>
        {fill(t.list.version, { number: entry.currentVersion })}
        <br />
        <span className={w.hint}>
          {fill(t.list.versions, { count: entry.versions })}
          {entry.hasDraft ? ` · ${t.list.hasDraft}` : ''}
        </span>
      </td>
      <td>{entry.lastCustomerActivityAt ? formatDateTime(entry.lastCustomerActivityAt, language) : t.list.never}</td>
      <td>{entry.pendingFeedback > 0 ? fill(t.list.pending, { count: entry.pendingFeedback }) : t.list.none}</td>
    </tr>
  )

  return (
    <>
      <PageHeader
        title={`${t.title}${projectName ? `: ${projectName}` : ''}`}
        lead={t.lead}
        back={{ to: `/client-projects/${id}/work`, label: t.back }}
        actions={
          <AdminButton variant="primary" onClick={() => setCreating((open) => !open)} aria-expanded={creating}>
            {creating ? t.new.cancel : t.new.open}
          </AdminButton>
        }
      />
      <div className={styles.stackLg}>
        {creating && (
          <DetailPanel title={t.new.title}>
            <form className={styles.stack} noValidate onSubmit={(event) => void create(event)}>
              <TextField label={t.form.title} value={draft.title} maxLength={160} required error={errors.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              <div className={styles.formGrid}>
                <SelectField label={t.form.type} value={draft.type} error={errors.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as DeliverableType })} options={DELIVERABLE_TYPES.map((value) => ({ value, label: t.types[value] }))} />
                <SelectField label={t.form.task} value={draft.taskId} error={errors.taskId} onChange={(event) => setDraft({ ...draft, taskId: event.target.value })} options={[{ value: '', label: t.form.noTask }, ...(tasks.data?.tasks ?? []).map((task) => ({ value: task.id, label: `${task.title} (${task.reference})` }))]} />
              </div>
              <p className={w.hint}>{t.form.typeHint}</p>
              <TextAreaField label={t.form.customerDescription} hint={t.form.customerDescriptionHint} optional rows={3} maxLength={4000} value={draft.customerDescription} error={errors.customerDescription} onChange={(event) => setDraft({ ...draft, customerDescription: event.target.value })} />
              <TextAreaField label={t.form.internalDescription} hint={t.form.internalHint} optional rows={3} maxLength={4000} value={draft.internalDescription} error={errors.internalDescription} onChange={(event) => setDraft({ ...draft, internalDescription: event.target.value })} />
              <TextField label={t.form.versionTitle} optional value={draft.versionTitle} maxLength={160} error={errors.versionTitle} onChange={(event) => setDraft({ ...draft, versionTitle: event.target.value })} />
              <TextAreaField label={t.form.versionDescription} optional rows={3} maxLength={4000} value={draft.versionDescription} error={errors.versionDescription} onChange={(event) => setDraft({ ...draft, versionDescription: event.target.value })} />
              <div className={styles.formGrid}>
                <TextField label={t.form.previewUrl} hint={t.form.previewHint} type="url" inputMode="url" optional value={draft.previewUrl} maxLength={2000} error={errors.previewUrl} onChange={(event) => setDraft({ ...draft, previewUrl: event.target.value })} />
                <TextField label={t.form.imageUrl} hint={t.form.imageHint} type="url" inputMode="url" optional value={draft.imageUrl} maxLength={2000} error={errors.imageUrl} onChange={(event) => setDraft({ ...draft, imageUrl: event.target.value })} />
              </div>
              <div className={styles.formActions}>
                <AdminButton type="submit" variant="primary" loading={busy}>
                  {t.new.create}
                </AdminButton>
              </div>
            </form>
          </DetailPanel>
        )}

        {rows.length === 0 ? (
          <EmptyState icon="inbox" title={t.empty}>
            {t.emptyBody}
          </EmptyState>
        ) : (
          <div className={w.listWrap} tabIndex={0} role="region" aria-label={t.list.caption}>
            <table className={w.listTable}>
              <caption className={styles.srOnly}>{t.list.caption}</caption>
              <thead>
                <tr>
                  <th scope="col">{t.list.columns.deliverable}</th>
                  <th scope="col">{t.list.columns.state}</th>
                  <th scope="col">{t.list.columns.review}</th>
                  <th scope="col">{t.list.columns.version}</th>
                  <th scope="col">{t.list.columns.activity}</th>
                  <th scope="col">{t.list.columns.pending}</th>
                </tr>
              </thead>
              <tbody>{rows.map(row)}</tbody>
            </table>
          </div>
        )}

        <DetailPanel title={t.origins.title}>
          {previewOrigins.length === 0 ? (
            <p className={styles.muted}>{t.origins.none}</p>
          ) : (
            <>
              <p>{t.origins.some}</p>
              <ul className={w.links}>
                {previewOrigins.map((origin) => (
                  <li key={origin}>
                    <span className={styles.mono}>{origin}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className={w.hint}>{t.origins.note}</p>
        </DetailPanel>
      </div>
    </>
  )
}
