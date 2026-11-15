import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { DELIVERABLE_TYPES, deliverables, type Approval, type Comment, type DeliverableDetail, type DeliverableType, type Version } from '../api/deliverables'
import { work } from '../api/work'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { SelectField, TextAreaField, TextField } from '../components/form'
import { DetailPanel, PageHeader } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { Tag } from '../components/work/parts'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import w from '../styles/work.module.scss'
import { useFieldErrors } from './DeliverablesPage'

/**
 * One deliverable (PROMPT 27): what it is, its immutable versions (a draft can be prepared, previewed as the customer will see it and published; a published version is never
 * edited), the customer's feedback with the owner's replies, private notes, the request for approval of one exact version and every decision, and the whole history with the
 * lines the customer can and cannot see told apart. The server decides every rule; a refusal says why in words and changes nothing.
 */

const PUBLICATION_TONE = { draft: 'neutral', published: 'success', archived: 'neutral' } as const
const REVIEW_TONE = { not_submitted: 'neutral', awaiting_customer: 'warning', changes_requested: 'warning', approved: 'success', superseded: 'info' } as const
const VERSION_TONE = { draft: 'neutral', published: 'success', superseded: 'info' } as const
const APPROVAL_TONE = { requested: 'warning', approved: 'success', changes_requested: 'warning', cancelled: 'neutral', superseded: 'info' } as const

/** What a refusal's reason code says in words (the server sends the reason; the words live here, in both languages). */
function useRefusal() {
  const t = useText().deliverables
  return (error: unknown): string => {
    if (error instanceof ApiError) {
      const reason = typeof error.details.reason === 'string' ? error.details.reason : ''
      const known = (t.versions.refused as Record<string, string>)[reason]
      return known ?? error.message
    }
    return String(error)
  }
}

const shortCode = (checksum: string | null): string => (checksum ? checksum.slice(0, 12) : '–')
const percent = (value: number): number => Math.round(value * 1000) / 10

/** The thread of one root comment: the customer's words, any follow-ups, and the owner's replies, in the order they were written. */
export function Thread({ root, replies, busy, onReply, onResolve, onReopen, archived }: { root: Comment; replies: Comment[]; busy: string | null; onReply: (body: string) => Promise<boolean>; onResolve: () => void; onReopen: () => void; archived: boolean }) {
  const text = useText().deliverables
  const t = text.feedback
  const language = useInterfaceLanguage()
  const [writing, setWriting] = useState(false)
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const resolved = root.status === 'resolved'
  const where = root.marker !== null && root.x !== null && root.y !== null ? fill(t.position, { left: percent(root.x), top: percent(root.y) }) : null
  const send = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (!reply.trim()) return setError(text.form.required)
    setError('')
    if (await onReply(reply.trim())) {
      setReply('')
      setWriting(false)
    }
  }
  return (
    <li className={w.threadItem} data-resolved={resolved}>
      <p className={styles.rowTight}>
        <strong>{root.marker !== null ? fill(t.marker, { number: root.marker }) : t.general}</strong>
        <Tag tone={resolved ? 'success' : 'warning'}>{resolved ? t.resolved : t.open}</Tag>
        {where && <span className={w.hint}>{where}</span>}
      </p>
      <ul className={w.history}>
        {[root, ...replies].map((entry) => (
          <li key={entry.id}>
            <span className={w.hint}>
              {entry.author_type === 'admin' ? t.studio : t.customer} · {formatDateTime(entry.created_at, language)}
            </span>
            <span className={w.answer}>{entry.body}</span>
          </li>
        ))}
      </ul>
      {!archived && (
        <div className={styles.formActions}>
          {!writing && (
            <AdminButton variant="secondary" onClick={() => setWriting(true)}>
              {t.reply}
            </AdminButton>
          )}
          {resolved ? (
            <AdminButton variant="text" loading={busy === `reopen-${root.id}`} onClick={onReopen}>
              {t.reopen}
            </AdminButton>
          ) : (
            <AdminButton variant="text" loading={busy === `resolve-${root.id}`} onClick={onResolve}>
              {t.resolve}
            </AdminButton>
          )}
        </div>
      )}
      {writing && (
        <form className={styles.stack} noValidate onSubmit={(event) => void send(event)}>
          <TextAreaField label={t.replyLabel} rows={3} maxLength={2000} value={reply} error={error} onChange={(event) => setReply(event.target.value)} />
          <div className={styles.formActions}>
            <AdminButton type="submit" variant="primary" loading={busy === `reply-${root.id}`}>
              {t.replySend}
            </AdminButton>
            <AdminButton
              variant="text"
              onClick={() => {
                setWriting(false)
                setReply('')
                setError('')
              }}
            >
              {t.cancel}
            </AdminButton>
          </div>
        </form>
      )}
    </li>
  )
}

export function VersionCard({ version, current, deliverable, busy, onEdit, onPublish, errors }: { version: Version; current: boolean; deliverable: DeliverableDetail['deliverable']; busy: string | null; onEdit: (id: string, body: { title: string; customerDescription: string; previewUrl: string | null; imageUrl: string | null }) => Promise<boolean>; onPublish: (version: Version) => void; errors: Record<string, string> }) {
  const t = useText().deliverables
  const v = t.versions
  const language = useInterfaceLanguage()
  const [form, setForm] = useState<{ title: string; description: string; previewUrl: string; imageUrl: string } | null>(null)
  const isDraft = version.status === 'draft'
  const open = () => setForm({ title: version.title, description: version.customer_description, previewUrl: version.preview_url ?? '', imageUrl: version.image_url ?? '' })

  return (
    <li className={w.versionCard} data-current={current}>
      <p className={styles.rowTight}>
        <strong>{fill(v.number, { number: version.number })}</strong>
        <Tag tone={VERSION_TONE[version.status]}>{t.versionStatus[version.status]}</Tag>
        {current && <Tag tone="accent">{v.current}</Tag>}
      </p>
      {version.title && <p className={w.answer}>{version.title}</p>}
      {version.customer_description && <p className={w.answer}>{version.customer_description}</p>}
      <p className={w.hint}>
        {version.published_at ? fill(v.published, { date: formatDateTime(version.published_at, language) }) : v.draftNote}
        {version.checksum ? ` · ${fill(v.fingerprint, { code: shortCode(version.checksum) })}` : ''}
      </p>
      <ul className={w.links}>
        {version.preview_url && (
          <li>
            <a href={version.preview_url} target="_blank" rel="noopener noreferrer nofollow external">
              {v.openPreview}
              {version.previewHost ? ` (${version.previewHost})` : ''}
            </a>
          </li>
        )}
        {version.image_url && (
          <li>
            <span className={styles.mono}>{version.image_url}</span>
          </li>
        )}
      </ul>

      {isDraft && (
        <>
          <div className={w.previewBefore}>
            <h3 className={styles.sectionTitle}>{v.previewBefore}</h3>
            <p className={w.hint}>{v.previewBeforeNote}</p>
            <ul className={w.links}>
              <li>{version.preview_url ? (version.embeddable ? v.embeddable : v.linkOnly) : v.noAddress}</li>
              {version.image_url && <li>{v.picture}</li>}
              {version.title === '' && deliverable.type !== 'other' && <li className={w.hint}>{v.incomplete}</li>}
            </ul>
          </div>
          {form === null ? (
            <div className={styles.formActions}>
              <AdminButton variant="secondary" onClick={open}>
                {v.edit}
              </AdminButton>
              <AdminButton variant="primary" loading={busy === `publish-${version.id}`} onClick={() => onPublish(version)}>
                {v.publish}
              </AdminButton>
            </div>
          ) : (
            <form
              className={styles.stack}
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                // The form stays open until the server has accepted it, so a refused address is shown next to its field.
                void onEdit(version.id, { title: form.title.trim(), customerDescription: form.description.trim(), previewUrl: form.previewUrl.trim() || null, imageUrl: form.imageUrl.trim() || null }).then((ok) => ok && setForm(null))
              }}
            >
              <TextField label={v.editTitle} value={form.title} maxLength={160} error={errors.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              <TextAreaField label={v.editDescription} rows={3} maxLength={4000} value={form.description} error={errors.customerDescription} onChange={(event) => setForm({ ...form, description: event.target.value })} />
              <div className={styles.formGrid}>
                <TextField label={t.form.previewUrl} hint={t.form.previewHint} type="url" inputMode="url" optional value={form.previewUrl} maxLength={2000} error={errors.previewUrl} onChange={(event) => setForm({ ...form, previewUrl: event.target.value })} />
                <TextField label={t.form.imageUrl} hint={t.form.imageHint} type="url" inputMode="url" optional value={form.imageUrl} maxLength={2000} error={errors.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} />
              </div>
              <div className={styles.formActions}>
                <AdminButton type="submit" variant="primary" loading={busy === `edit-${version.id}`}>
                  {v.save}
                </AdminButton>
                <AdminButton variant="text" onClick={() => setForm(null)}>
                  {t.feedback.cancel}
                </AdminButton>
              </div>
            </form>
          )}
        </>
      )}
    </li>
  )
}

export function ApprovalLine({ approval, versions, onCancel, busy }: { approval: Approval; versions: Version[]; onCancel: () => void; busy: string | null }) {
  const t = useText().deliverables
  const a = t.approval
  const language = useInterfaceLanguage()
  const number = versions.find((entry) => entry.id === approval.version_id)?.number ?? 0
  return (
    <li>
      <p className={styles.rowTight}>
        <strong>{fill(a.forVersion, { number })}</strong>
        <Tag tone={APPROVAL_TONE[approval.state]}>{t.approvalStates[approval.state]}</Tag>
      </p>
      <span className={w.hint}>{fill(a.requestedAt, { date: formatDateTime(approval.requested_at, language) })}</span>
      {approval.request_note && <span className={w.answer}>{approval.request_note}</span>}
      {approval.decided_at && <span className={w.hint}>{fill(a.decidedAt, { date: formatDateTime(approval.decided_at, language) })}</span>}
      {approval.confirmed_version !== null && <span>{fill(a.confirmed, { number: approval.confirmed_version, code: shortCode(approval.confirmed_checksum) })}</span>}
      {approval.decision_note && (
        <span className={w.answer}>
          <strong>{a.explanation}: </strong>
          {approval.decision_note}
        </span>
      )}
      {approval.closed_by && approval.state === 'cancelled' && <span className={w.hint}>{a.closedBy[approval.closed_by]}</span>}
      {approval.state === 'requested' && (
        <div className={styles.formActions}>
          <AdminButton variant="text" danger loading={busy === `cancel-${approval.id}`} onClick={onCancel}>
            {a.cancel}
          </AdminButton>
        </div>
      )}
    </li>
  )
}

export function DeliverablePage() {
  const { id = '', deliverableId = '' } = useParams()
  const navigate = useNavigate()
  const t = useText()
  const dt = t.deliverables
  const language = useInterfaceLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const refusal = useRefusal()
  const fieldErrors = useFieldErrors()
  const resource = useResource(async (signal) => ({ detail: await deliverables.get(id, deliverableId, signal), space: await work.workspace(id, {}, signal) }), [id, deliverableId])
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<{ source: number; title: string; type: DeliverableType; customerDescription: string; internalDescription: string; taskId: string } | null>(null)
  const [note, setNote] = useState('')
  const [askNote, setAskNote] = useState('')

  async function run<T>(name: string, job: () => Promise<T>, done: string | null): Promise<T | null> {
    setBusy(name)
    setErrors({})
    try {
      const result = await job()
      if (done) toast.success(done)
      resource.reload()
      return result
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) setErrors(fieldErrors(error))
      else toast.error(refusal(error))
      if (error instanceof ApiError && error.details.reason === 'stale') {
        setDraft(null)
        resource.reload()
      }
      return null
    } finally {
      setBusy(null)
    }
  }

  if (resource.loading) return <LoadingState />
  if (resource.error && !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />
  const { detail, space } = resource.data!
  const { deliverable, versions, comments, approvals, events } = detail
  const archived = deliverable.publication_state === 'archived'
  const published = deliverable.published_at !== null
  const listPath = `/client-projects/${id}/deliverables`
  const form = draft && draft.source === deliverable.revision ? draft : { source: deliverable.revision, title: deliverable.title, type: deliverable.type, customerDescription: deliverable.customer_description, internalDescription: deliverable.internal_description, taskId: deliverable.task_id ?? '' }
  const newest = [...versions].sort((a, b) => b.number - a.number)
  const hasDraft = versions.some((entry) => entry.status === 'draft')
  const open = approvals.find((entry) => entry.state === 'requested')
  const currentApproved = approvals.some((entry) => entry.state === 'approved' && versions.find((v) => v.id === entry.version_id)?.number === deliverable.current_version)
  const canAsk = published && !archived && !open && !currentApproved
  const numberOf = (versionId: string) => versions.find((entry) => entry.id === versionId)?.number ?? 0

  const replyTo = async (commentId: string, body: string): Promise<boolean> => (await run(`reply-${commentId}`, () => deliverables.reply(id, deliverableId, commentId, body), dt.feedback.replied)) !== null

  const publish = async (version: Version) => {
    if (!(await confirm({ title: fill(dt.versions.publishTitle, { number: version.number }), body: dt.versions.publishBody, confirmLabel: dt.versions.publish }))) return
    void run(`publish-${version.id}`, () => deliverables.publish(id, deliverableId, version.id), dt.versions.published2)
  }

  // Comments per version: the roots in the order they were written, each with its replies.
  const roots = comments.filter((entry) => entry.parent_id === null)
  const byVersion = newest.map((version) => ({ version, roots: roots.filter((entry) => entry.version_id === version.id) })).filter((entry) => entry.roots.length > 0)

  return (
    <>
      <PageHeader
        title={deliverable.title}
        lead={
          <span className={styles.rowTight}>
            <span className={styles.mono}>{deliverable.reference}</span>
            <Tag tone={PUBLICATION_TONE[deliverable.publication_state]}>{dt.publication[deliverable.publication_state]}</Tag>
            <Tag tone={REVIEW_TONE[deliverable.review_state]}>{dt.review[deliverable.review_state]}</Tag>
            <span>{dt.types[deliverable.type]}</span>
          </span>
        }
        back={{ to: listPath, label: dt.backToList }}
      />
      <div className={styles.stackLg}>
        <div className={`${styles.notice} ${archived ? styles.noticeWarning : ''}`} role="status">
          <strong>{dt.detail.customerSees}</strong>
          <span>{archived ? dt.detail.archivedNote : published ? fill(dt.detail.visibleAs, { number: deliverable.current_version }) : dt.detail.notVisible}</span>
          {detail.task && <span>{fill(dt.detail.task, { title: detail.task.title })}</span>}
        </div>

        <DetailPanel title={dt.detail.edit}>
          <form
            className={styles.stack}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void run('save', () => deliverables.edit(id, deliverableId, { title: form.title.trim(), type: form.type, customerDescription: form.customerDescription.trim(), internalDescription: form.internalDescription.trim(), taskId: form.taskId || null, revision: deliverable.revision }), dt.form.saved).then(() => setDraft(null))
            }}
          >
            <TextField label={dt.form.title} value={form.title} maxLength={160} required error={errors.title} disabled={archived} onChange={(event) => setDraft({ ...form, title: event.target.value })} />
            <div className={styles.formGrid}>
              <SelectField label={dt.form.type} value={form.type} disabled={published || archived} error={errors.type} onChange={(event) => setDraft({ ...form, type: event.target.value as DeliverableType })} options={DELIVERABLE_TYPES.map((value) => ({ value, label: dt.types[value] }))} />
              <SelectField label={dt.form.task} value={form.taskId} disabled={archived} error={errors.taskId} onChange={(event) => setDraft({ ...form, taskId: event.target.value })} options={[{ value: '', label: dt.form.noTask }, ...space.tasks.map((task) => ({ value: task.id, label: `${task.title} (${task.reference})` }))]} />
            </div>
            <p className={w.hint}>{dt.form.typeHint}</p>
            <TextAreaField label={dt.form.customerDescription} hint={dt.form.customerDescriptionHint} optional rows={3} maxLength={4000} value={form.customerDescription} disabled={archived} error={errors.customerDescription} onChange={(event) => setDraft({ ...form, customerDescription: event.target.value })} />
            <TextAreaField label={dt.form.internalDescription} hint={dt.form.internalHint} optional rows={3} maxLength={4000} value={form.internalDescription} disabled={archived} error={errors.internalDescription} onChange={(event) => setDraft({ ...form, internalDescription: event.target.value })} />
            {!archived && (
              <div className={styles.formActions}>
                <AdminButton type="submit" variant="primary" loading={busy === 'save'}>
                  {dt.form.save}
                </AdminButton>
              </div>
            )}
          </form>
        </DetailPanel>

        <DetailPanel title={dt.versions.title}>
          <div className={styles.stack}>
            <p className={w.hint}>{dt.versions.lead}</p>
            <ul className={w.versionList}>
              {newest.map((version) => (
                <VersionCard
                  key={`${version.id}-${version.status}`}
                  version={version}
                  current={version.number === deliverable.current_version && version.status !== 'draft'}
                  deliverable={deliverable}
                  busy={busy}
                  errors={errors}
                  onEdit={async (versionId, body) => (await run(`edit-${versionId}`, () => deliverables.editVersion(id, deliverableId, versionId, body), dt.form.saved)) !== null}
                  onPublish={(entry) => void publish(entry)}
                />
              ))}
            </ul>
            {!archived && !hasDraft && (
              <div className={styles.formActions}>
                <AdminButton variant="secondary" loading={busy === 'newVersion'} onClick={() => void run('newVersion', () => deliverables.newVersion(id, deliverableId), dt.versions.newVersionDone)}>
                  {dt.versions.newVersion}
                </AdminButton>
              </div>
            )}
          </div>
        </DetailPanel>

        <DetailPanel title={dt.feedback.title}>
          <div className={styles.stack}>
            <p className={w.hint}>{dt.feedback.lead}</p>
            {byVersion.length === 0 ? (
              <p>{dt.feedback.none}</p>
            ) : (
              byVersion.map(({ version, roots: list }) => (
                <section key={version.id} aria-label={fill(dt.feedback.version, { number: version.number })} className={styles.stack}>
                  <h3 className={styles.sectionTitle}>{fill(dt.feedback.version, { number: version.number })}</h3>
                  <ul className={w.threads}>
                    {list.map((root) => (
                      <Thread
                        key={root.id}
                        root={root}
                        replies={comments.filter((entry) => entry.parent_id === root.id)}
                        busy={busy}
                        archived={archived}
                        onReply={(body) => replyTo(root.id, body)}
                        onResolve={() => void run(`resolve-${root.id}`, () => deliverables.resolve(id, deliverableId, root.id), dt.feedback.resolvedDone)}
                        onReopen={() => void run(`reopen-${root.id}`, () => deliverables.reopen(id, deliverableId, root.id), dt.feedback.reopened)}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </DetailPanel>

        <DetailPanel title={dt.approval.title}>
          <div className={styles.stack}>
            <p className={w.hint}>{dt.approval.lead}</p>
            {canAsk && (
              <form
                className={styles.stack}
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  void run('ask', () => deliverables.requestApproval(id, deliverableId, askNote.trim() || undefined), dt.approval.asked).then((done) => done && setAskNote(''))
                }}
              >
                <TextAreaField label={dt.approval.note} optional rows={2} maxLength={1000} value={askNote} error={errors.note} onChange={(event) => setAskNote(event.target.value)} />
                <div className={styles.formActions}>
                  <AdminButton type="submit" variant="primary" loading={busy === 'ask'}>
                    {dt.approval.request}
                  </AdminButton>
                </div>
              </form>
            )}
            <h3 className={styles.sectionTitle}>{dt.approval.history}</h3>
            <p className={w.hint}>{dt.approval.historyNote}</p>
            {approvals.length === 0 ? (
              <p>{dt.approval.none}</p>
            ) : (
              <ol className={w.history}>
                {[...approvals].reverse().map((approval) => (
                  <ApprovalLine
                    key={approval.id}
                    approval={approval}
                    versions={versions}
                    busy={busy}
                    onCancel={async () => {
                      if (await confirm({ title: dt.approval.cancelTitle, body: dt.approval.cancelBody, confirmLabel: dt.approval.cancel, danger: true })) void run(`cancel-${approval.id}`, () => deliverables.cancelApproval(id, deliverableId, approval.id), dt.approval.cancelled)
                    }}
                  />
                ))}
              </ol>
            )}
          </div>
        </DetailPanel>

        <DetailPanel title={dt.notes.title}>
          <p className={styles.muted}>{dt.notes.lead}</p>
          {detail.notes.length === 0 ? (
            <p>{dt.notes.none}</p>
          ) : (
            <ul className={w.history}>
              {detail.notes.map((entry) => (
                <li key={entry.id}>
                  <span className={w.answer}>{entry.body}</span>
                  <span className={w.hint}>
                    {entry.authorEmail ?? '–'} · {formatDateTime(entry.createdAt, language)}
                    {entry.versionId ? ` · ${fill(dt.feedback.version, { number: numberOf(entry.versionId) })}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <form
            className={styles.stack}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void run('note', () => deliverables.note(id, deliverableId, { body: note.trim() }), dt.notes.added).then((done) => done && setNote(''))
            }}
          >
            <TextAreaField label={dt.notes.label} rows={3} maxLength={2000} value={note} error={errors.body} onChange={(event) => setNote(event.target.value)} />
            <div className={styles.formActions}>
              <AdminButton type="submit" loading={busy === 'note'}>
                {dt.notes.add}
              </AdminButton>
            </div>
          </form>
        </DetailPanel>

        <DetailPanel title={dt.history.title}>
          <p className={styles.muted}>{dt.history.lead}</p>
          <ol className={w.history}>
            {events.map((entry) => (
              <li key={entry.id}>
                <span>
                  {(dt.history.types as Record<string, string>)[entry.event_type] ?? entry.event_type}
                  {entry.version_number ? ` · ${fill(dt.feedback.version, { number: entry.version_number })}` : ''}
                  <span className={w.hint}>
                    {' '}
                    · {dt.history.by[entry.actor_type]}
                    {entry.adminEmail ? ` (${entry.adminEmail})` : ''} · {formatDateTime(entry.created_at, language)}
                  </span>
                </span>
                {entry.note && entry.visibility === 'customer' && <span className={w.hint}>{entry.note}</span>}
                <span className={w.internalMark}>{entry.visibility === 'internal' ? dt.history.internal : dt.history.visible}</span>
              </li>
            ))}
          </ol>
        </DetailPanel>

        <DetailPanel>
          <div className={styles.formActions}>
            {published && !archived && (
              <AdminButton
                variant="text"
                danger
                loading={busy === 'archive'}
                onClick={async () => {
                  if (await confirm({ title: dt.detail.archiveTitle, body: dt.detail.archiveBody, confirmLabel: dt.detail.archive, danger: true })) void run('archive', () => deliverables.archive(id, deliverableId), dt.detail.archived)
                }}
              >
                {dt.detail.archive}
              </AdminButton>
            )}
            {!published && (
              <AdminButton
                variant="text"
                danger
                loading={busy === 'delete'}
                onClick={async () => {
                  if (!(await confirm({ title: dt.detail.deleteTitle, body: dt.detail.deleteBody, confirmLabel: dt.detail.delete, danger: true }))) return
                  const done = await run('delete', async () => deliverables.remove(id, deliverableId), dt.detail.deleted)
                  if (done !== null) void navigate(listPath)
                }}
              >
                {dt.detail.delete}
              </AdminButton>
            )}
          </div>
        </DetailPanel>
      </div>
    </>
  )
}
