import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { ACTION_TYPES, work, type ActionType, type TaskStatus } from '../api/work'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { CheckField, SelectField, TextAreaField } from '../components/form'
import { DetailPanel, PageHeader } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { ACTION_TONE, PRIORITY_TONE, Tag, taskPath, TASK_TONE } from '../components/work/parts'
import { draftOf, inputOf, TaskFields, type TaskDraft } from '../components/work/TaskFields'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import w from '../styles/work.module.scss'
import { useRefusal } from './ProjectWorkPage'

/**
 * One task of a client project: its status (the only way a status changes), what it says, what it waits for and what waits for it, the request made of the customer
 * and the customer's answers, the owner's private notes, and its whole history with the lines the customer can and cannot see told apart. The server decides every
 * rule; a refusal says why in words and changes nothing.
 */

export function TaskDetailPage() {
  const { id = '', taskId = '' } = useParams()
  const navigate = useNavigate()
  const t = useText()
  const wt = t.work
  const language = useInterfaceLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const refusal = useRefusal()
  const resource = useResource(async (signal) => ({ detail: await work.task(id, taskId, signal), space: await work.workspace(id, {}, signal) }), [id, taskId])
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<{ source: number; value: TaskDraft } | null>(null)
  const [next, setNext] = useState('')
  const [dependency, setDependency] = useState('')
  const [note, setNote] = useState('')
  const [give, setGive] = useState<{ actionType: ActionType; instruction: string }>({ actionType: 'provide_content', instruction: '' })
  const [reword, setReword] = useState<string | null>(null)
  const [review, setReview] = useState({ customerNote: '', internalNote: '', completeTask: false })

  async function run<T>(name: string, job: () => Promise<T>, done: string | null): Promise<T | null> {
    setBusy(name)
    setErrors({})
    try {
      const result = await job()
      if (done) toast.success(done)
      resource.reload()
      return result
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) setErrors(Object.fromEntries(Object.entries(error.fields).map(([field, code]) => [field, code === 'required' ? wt.form.required : code === 'tooLong' ? wt.form.tooLong : wt.form.invalid])))
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
  const { task, action } = detail
  const form = draft && draft.source === task.revision ? draft.value : draftOf(task)
  const workPath = `/client-projects/${id}/work`
  const others = space.tasks.filter((entry) => entry.id !== task.id && !task.dependsOn.includes(entry.id))
  const actionOpen = Boolean(action && ['not_started', 'submitted', 'under_review', 'changes_requested'].includes(action.status))

  return (
    <>
      <PageHeader
        title={task.title}
        lead={
          <span className={styles.rowTight}>
            <span className={styles.mono}>{task.reference}</span>
            <Tag tone={TASK_TONE[task.status]}>{wt.statuses[task.status]}</Tag>
            <Tag tone={PRIORITY_TONE[task.priority]}>{wt.priorities[task.priority]}</Tag>
          </span>
        }
        back={{ to: workPath, label: wt.task.back }}
      />
      <div className={styles.stackLg}>
        {task.blockedBy.length > 0 && (
          <div className={`${styles.notice} ${styles.noticeWarning}`} role="status">
            <strong>{wt.task.blockedBy}</strong>
            <ul className={w.links}>
              {task.blockedBy.map((entry) => (
                <li key={entry.id}>
                  <Link to={taskPath(id, entry.id)}>{entry.title}</Link> <Tag tone={TASK_TONE[entry.status]}>{wt.statuses[entry.status]}</Tag>
                </li>
              ))}
            </ul>
            <span>{wt.task.blockedHint}</span>
          </div>
        )}

        <DetailPanel title={wt.task.status}>
          <form
            className={styles.stack}
            onSubmit={(event) => {
              event.preventDefault()
              if (next) void run('move', () => work.move(id, task.id, next as TaskStatus, task.revision), wt.task.moved).then(() => setNext(''))
            }}
          >
            <SelectField label={wt.task.changeStatus} value={next} onChange={(event) => setNext(event.target.value)} options={[{ value: '', label: '–' }, ...detail.allowed.map((value) => ({ value, label: wt.statuses[value] }))]} />
            <div className={styles.formActions}>
              <AdminButton type="submit" variant="primary" disabled={!next} loading={busy === 'move'}>
                {wt.task.move}
              </AdminButton>
            </div>
          </form>
        </DetailPanel>

        <DetailPanel title={wt.form.save}>
          <form
            className={styles.stack}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void run('save', () => work.edit(id, task.id, { ...inputOf(form, false), revision: task.revision }), wt.form.saved).then(() => setDraft(null))
            }}
          >
            <TaskFields draft={form} onChange={(value) => setDraft({ source: task.revision, value })} errors={errors} categories={space.categories} milestones={space.milestones} assignees={space.assignees} withStatus={false} keepShared={actionOpen} />
            <div className={styles.formActions}>
              <AdminButton type="submit" variant="primary" loading={busy === 'save'}>
                {wt.form.save}
              </AdminButton>
            </div>
          </form>
        </DetailPanel>

        <DetailPanel title={wt.task.dependencies}>
          <div className={styles.stack}>
            <h3 className={styles.sectionTitle}>{wt.task.dependsOn}</h3>
            {detail.predecessors.length === 0 ? (
              <p className={styles.muted}>{wt.task.noDependencies}</p>
            ) : (
              <ul className={w.links}>
                {detail.predecessors.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      <Link to={taskPath(id, entry.id)}>{entry.title}</Link> <Tag tone={TASK_TONE[entry.status]}>{wt.statuses[entry.status]}</Tag>
                    </span>
                    <AdminButton variant="text" danger aria-label={fill(wt.task.removeLabel, { title: entry.title })} loading={busy === `undepend-${entry.id}`} onClick={() => void run(`undepend-${entry.id}`, () => work.undepend(id, task.id, entry.id), wt.form.saved)}>
                      {wt.task.remove}
                    </AdminButton>
                  </li>
                ))}
              </ul>
            )}
            <form
              className={styles.stack}
              onSubmit={(event) => {
                event.preventDefault()
                if (dependency) void run('depend', () => work.depend(id, task.id, dependency), wt.form.saved).then((done) => done && setDependency(''))
              }}
            >
              <SelectField label={wt.task.addDependency} value={dependency} onChange={(event) => setDependency(event.target.value)} options={[{ value: '', label: wt.task.choose }, ...others.map((entry) => ({ value: entry.id, label: `${entry.title} (${entry.reference})` }))]} />
              <div className={styles.formActions}>
                <AdminButton type="submit" disabled={!dependency} loading={busy === 'depend'}>
                  {wt.task.add}
                </AdminButton>
              </div>
            </form>
            <h3 className={styles.sectionTitle}>{wt.task.dependents}</h3>
            {detail.dependents.length === 0 ? (
              <p className={styles.muted}>{wt.task.noDependents}</p>
            ) : (
              <ul className={w.links}>
                {detail.dependents.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      <Link to={taskPath(id, entry.id)}>{entry.title}</Link> <Tag tone={TASK_TONE[entry.status]}>{wt.statuses[entry.status]}</Tag>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DetailPanel>

        <DetailPanel title={wt.action.title}>
          <div className={styles.stack}>
            <p className={w.hint}>{wt.action.lead}</p>
            {!action && task.customer_visible === 0 && <p className={`${styles.notice} ${styles.noticeWarning}`}>{wt.action.needsShared}</p>}
            {!action && task.customer_visible === 1 && (
              <form
                className={styles.stack}
                noValidate
                onSubmit={(event) => {
                  event.preventDefault()
                  void run('give', () => work.giveAction(id, task.id, { actionType: give.actionType, instruction: give.instruction.trim() }), wt.action.given).then((done) => done && setGive({ actionType: 'provide_content', instruction: '' }))
                }}
              >
                <p className={styles.muted}>{wt.action.none}</p>
                <SelectField label={wt.action.type} value={give.actionType} onChange={(event) => setGive({ ...give, actionType: event.target.value as ActionType })} options={ACTION_TYPES.map((value) => ({ value, label: wt.actionTypes[value] }))} />
                <TextAreaField label={wt.action.instruction} hint={wt.action.instructionHint} rows={4} maxLength={2000} value={give.instruction} error={errors.instruction} onChange={(event) => setGive({ ...give, instruction: event.target.value })} />
                <div className={styles.formActions}>
                  <AdminButton type="submit" variant="primary" loading={busy === 'give'}>
                    {wt.action.give}
                  </AdminButton>
                </div>
              </form>
            )}
            {action && (
              <>
                <p className={styles.rowTight}>
                  <Tag tone={ACTION_TONE[action.status]}>{wt.actionStatuses[action.status]}</Tag>
                  {action.awaiting && <span>{wt.action.awaiting[action.awaiting]}</span>}
                </p>
                <p>
                  <strong>{wt.actionTypes[action.action_type]}</strong>
                </p>
                {reword === null ? (
                  <>
                    <p className={w.answer}>{action.instruction}</p>
                    {(action.status === 'not_started' || action.status === 'changes_requested') && (
                      <div className={styles.formActions}>
                        <AdminButton variant="text" onClick={() => setReword(action.instruction)}>
                          {wt.action.reword}
                        </AdminButton>
                      </div>
                    )}
                  </>
                ) : (
                  <form
                    className={styles.stack}
                    noValidate
                    onSubmit={(event) => {
                      event.preventDefault()
                      void run('reword', () => work.rewordAction(id, action.id, { instruction: reword.trim() }), wt.action.reworded).then((done) => done && setReword(null))
                    }}
                  >
                    <TextAreaField label={wt.action.instruction} hint={wt.action.instructionHint} rows={4} maxLength={2000} value={reword} error={errors.instruction} onChange={(event) => setReword(event.target.value)} />
                    <div className={styles.formActions}>
                      <AdminButton type="submit" loading={busy === 'reword'}>
                        {wt.form.save}
                      </AdminButton>
                      <AdminButton variant="text" onClick={() => setReword(null)}>
                        {t.common.cancel}
                      </AdminButton>
                    </div>
                  </form>
                )}

                <h3 className={styles.sectionTitle}>{wt.action.answers}</h3>
                {action.submissions.length === 0 ? (
                  <p className={styles.muted}>{wt.action.noAnswers}</p>
                ) : (
                  <ol className={w.history}>
                    {action.submissions.map((entry) => (
                      <li key={entry.revision}>
                        <span className={w.hint}>
                          {fill(wt.action.answerNumber, { number: entry.revision })} · {formatDateTime(entry.submittedAt, language)}
                        </span>
                        <p className={w.answer}>{entry.response}</p>
                      </li>
                    ))}
                  </ol>
                )}

                {(action.status === 'submitted' || action.status === 'under_review') && (
                  <div className={w.reviewGrid}>
                    <form
                      className={styles.stack}
                      noValidate
                      onSubmit={(event) => {
                        event.preventDefault()
                        void run('accept', () => work.review(id, action.id, 'accept', { customerNote: review.customerNote.trim() || undefined, internalNote: review.internalNote.trim() || undefined, completeTask: review.completeTask }), wt.action.done).then((done) => done && setReview({ customerNote: '', internalNote: '', completeTask: false }))
                      }}
                    >
                      <h3 className={styles.sectionTitle}>{wt.action.accept}</h3>
                      <TextAreaField label={wt.action.acceptNote} optional rows={2} maxLength={1000} value={review.customerNote} onChange={(event) => setReview({ ...review, customerNote: event.target.value })} />
                      <TextAreaField label={wt.action.internalNote} hint={wt.action.internalHint} optional rows={2} maxLength={1000} value={review.internalNote} onChange={(event) => setReview({ ...review, internalNote: event.target.value })} />
                      <CheckField label={wt.action.complete} checked={review.completeTask} onChange={(completeTask) => setReview({ ...review, completeTask })} />
                      <div className={styles.formActions}>
                        <AdminButton type="submit" variant="primary" loading={busy === 'accept'}>
                          {wt.action.accept}
                        </AdminButton>
                        {action.status === 'submitted' && (
                          <AdminButton onClick={() => void run('review', () => work.review(id, action.id, 'review', { internalNote: review.internalNote.trim() || undefined }), wt.action.done)} loading={busy === 'review'}>
                            {wt.action.review}
                          </AdminButton>
                        )}
                      </div>
                    </form>
                    <form
                      className={styles.stack}
                      noValidate
                      onSubmit={(event) => {
                        event.preventDefault()
                        void run('changes', () => work.review(id, action.id, 'changes', { customerNote: review.customerNote.trim(), internalNote: review.internalNote.trim() || undefined }), wt.action.done).then((done) => done && setReview({ customerNote: '', internalNote: '', completeTask: false }))
                      }}
                    >
                      <h3 className={styles.sectionTitle}>{wt.action.changes}</h3>
                      <TextAreaField label={wt.action.changesNote} hint={wt.action.changesHint} rows={3} maxLength={1000} value={review.customerNote} error={errors.customerNote} onChange={(event) => setReview({ ...review, customerNote: event.target.value })} />
                      <div className={styles.formActions}>
                        <AdminButton type="submit" loading={busy === 'changes'}>
                          {wt.action.changes}
                        </AdminButton>
                      </div>
                    </form>
                  </div>
                )}

                {actionOpen && (
                  <div className={styles.formActions}>
                    <AdminButton
                      variant="text"
                      danger
                      loading={busy === 'cancel'}
                      onClick={async () => {
                        if (await confirm({ title: wt.action.cancelTitle, body: wt.action.cancelBody, confirmLabel: wt.action.cancel, danger: true })) void run('cancel', () => work.review(id, action.id, 'cancel', {}), wt.action.done)
                      }}
                    >
                      {wt.action.cancel}
                    </AdminButton>
                  </div>
                )}

                <h3 className={styles.sectionTitle}>{wt.action.history}</h3>
                <ol className={w.history}>
                  {action.transitions.map((entry) => (
                    <li key={entry.id}>
                      <span>
                        {wt.action.by[entry.actor]}
                        {entry.actorEmail ? ` (${entry.actorEmail})` : ''}: {wt.actionStatuses[entry.to]} <span className={w.hint}>· {formatDateTime(entry.at, language)}</span>
                      </span>
                      {entry.customerNote && (
                        <span className={w.hint}>
                          {wt.action.customerNote}: {entry.customerNote}
                        </span>
                      )}
                      {entry.internalNote && (
                        <span className={w.internalMark}>
                          {wt.action.private}: {entry.internalNote}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </DetailPanel>

        <DetailPanel title={wt.task.notes}>
          <p className={styles.muted}>{wt.task.notesNote}</p>
          {detail.notes.length === 0 ? (
            <p>{wt.task.noNotes}</p>
          ) : (
            <ul className={w.history}>
              {detail.notes.map((entry) => (
                <li key={entry.id}>
                  <span className={w.answer}>{entry.body}</span>
                  <span className={w.hint}>
                    {entry.authorEmail ?? '–'} · {formatDateTime(entry.createdAt, language)}
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
              void run('note', () => work.note(id, task.id, note.trim()), wt.form.saved).then((done) => done && setNote(''))
            }}
          >
            <TextAreaField label={wt.task.notes} rows={3} maxLength={2000} value={note} error={errors.body} onChange={(event) => setNote(event.target.value)} />
            <div className={styles.formActions}>
              <AdminButton type="submit" loading={busy === 'note'}>
                {wt.task.noteAdd}
              </AdminButton>
            </div>
          </form>
        </DetailPanel>

        <DetailPanel title={wt.task.history}>
          <p className={styles.muted}>{wt.task.historyNote}</p>
          <ol className={w.history}>
            {detail.history.map((entry) => (
              <li key={entry.id}>
                <span>
                  {(wt.events as Record<string, string>)[entry.event_type] ?? entry.event_type}
                  {entry.to_status ? ` · ${(wt.statuses as Record<string, string>)[entry.to_status] ?? (wt.actionStatuses as Record<string, string>)[entry.to_status] ?? entry.to_status}` : ''}
                  <span className={w.hint}>
                    {' '}
                    · {formatDateTime(entry.created_at, language)}
                    {entry.adminEmail ? ` · ${entry.adminEmail}` : ''}
                  </span>
                </span>
                <span className={w.internalMark}>{entry.visibility === 'internal' ? wt.task.internal : wt.task.visibleToCustomer}</span>
              </li>
            ))}
          </ol>
        </DetailPanel>

        <DetailPanel>
          <div className={styles.formActions}>
            <AdminButton
              variant="text"
              danger
              loading={busy === 'delete'}
              onClick={async () => {
                if (!(await confirm({ title: wt.task.deleteTitle, body: wt.task.deleteBody, confirmLabel: wt.task.delete, danger: true }))) return
                const done = await run('delete', async () => work.remove(id, task.id), wt.task.deleted)
                if (done !== null) void navigate(workPath)
              }}
            >
              {wt.task.delete}
            </AdminButton>
          </div>
        </DetailPanel>
      </div>
    </>
  )
}

