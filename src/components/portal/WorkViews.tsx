import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import { useI18n } from '../../i18n/useI18n'
import { fetchTask, fetchWork, respondToTask, type ActionStatus, type PortalTask, type PortalTaskDetail, type ProjectDetail, type TaskStatus, type WorkProgress } from '../../portal/api'
import { usePortalText, type PortalWords } from '../../portal/text'
import { useLoad } from '../../portal/usePortal'
import { fill, formatDay, formatMoment } from '../../utils/format'
import { buildSchedule, type ScheduleInput } from '../../utils/schedule'
import { Button } from '../Button/Button'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import styles from './Portal.module.scss'
import { Load, PageHeader, StatusBadge } from './ui'
import work from './Work.module.scss'

/**
 * What the customer reads and does about the work on a project (PROMPT 26). Everything shown is what the server returned for THIS customer from tasks the owner
 * shared: the progress is the server's count (never a number computed or kept here), the schedule is drawn from the dates the server sent, and the one thing a customer
 * can do (answer a request) goes to one endpoint that names the project and the task and nothing else.
 */

const TASK_TONE: Record<TaskStatus, 'attention' | 'active' | 'done' | 'muted'> = { backlog: 'muted', planned: 'muted', in_progress: 'active', in_review: 'active', waiting_customer: 'attention', blocked: 'muted', completed: 'done', cancelled: 'muted' }

// ---- progress --------------------------------------------------------------------------------------------------------------------------

export function ProgressPanel({ progress }: { progress: WorkProgress }) {
  const words = usePortalText()
  const w = words.work.progress
  if (progress.percent === null) {
    return (
      <section className={work.progressPanel} aria-labelledby="progress-title">
        <h3 id="progress-title" className={styles.subTitle}>
          {w.emptyTitle}
        </h3>
        <p className={styles.muted}>{w.empty}</p>
      </section>
    )
  }
  const counted = progress.basis === 'tasks' ? { done: progress.tasks.completed, total: progress.tasks.total } : { done: progress.milestones.completed, total: progress.milestones.total }
  const overdue = progress.basis === 'tasks' ? progress.tasks.overdue : progress.milestones.overdue
  return (
    <section className={work.progressPanel} aria-labelledby="progress-title">
      <h3 id="progress-title" className={styles.subTitle}>
        {w.title}
      </h3>
      <div className={work.progressHead}>
        <span className={work.progressNumber}>{fill(w.percent, { percent: progress.percent })}</span>
        <span className={styles.muted}>{fill(progress.basis === 'tasks' ? w.basisTasks : w.basisMilestones, counted)}</span>
      </div>
      <progress className={work.bar} value={progress.percent} max={100} aria-label={fill(w.aria, { percent: progress.percent })} />
      {overdue > 0 && <p className={work.late}>{fill(w.overdue, { count: overdue })}</p>}
      <p className={work.fineprint}>{w.note}</p>
    </section>
  )
}

// ---- tasks -----------------------------------------------------------------------------------------------------------------------------

type Group = 'needsYou' | 'inProgress' | 'planned' | 'done' | 'stopped'

function groupOf(task: PortalTask): Group {
  if (task.status === 'cancelled') return 'stopped'
  if (task.status === 'completed') return 'done'
  if (task.action?.awaiting === 'you' && task.action.canRespond) return 'needsYou'
  if (task.status === 'backlog' || task.status === 'planned') return 'planned'
  return 'inProgress'
}

const ORDER: Group[] = ['needsYou', 'inProgress', 'planned', 'done', 'stopped']

function TaskRow({ reference, task }: { reference: string; task: PortalTask }) {
  const { lang } = useI18n()
  const words = usePortalText()
  const t = words.work.tasks
  const tone = TASK_TONE[task.status]
  const wanted = task.action?.awaiting === 'you' && task.action.canRespond
  return (
    <li className={work.task} data-attention={wanted} data-done={task.status === 'completed' || task.status === 'cancelled'}>
      <div className={work.taskHead}>
        <h4 className={work.taskTitle}>
          <LocalizedLink to={`/client-portal/projects/${reference}/tasks/${task.reference}`} className={work.taskLink}>
            {task.title}
          </LocalizedLink>
        </h4>
        <StatusBadge status={task.status} label={t.status[task.status]} tone={tone} />
      </div>
      <p className={work.taskMeta}>
        {task.dueOn && <span>{fill(t.due, { date: formatDay(task.dueOn, lang) })}</span>}
        {task.completedAt && <span>{fill(t.doneOn, { date: formatMoment(task.completedAt, lang) })}</span>}
        {!task.dueOn && !task.completedAt && <span>{t.noDates}</span>}
        {task.overdue && <span className={work.late}>{t.overdue}</span>}
        {task.milestone && <span>{`${t.milestone}: ${task.milestone.title}`}</span>}
        {wanted && <strong>{t.needsYouBadge}</strong>}
      </p>
      {task.waitingFor.length > 0 && <p className={work.taskNote}>{fill(t.waitingFor, { titles: task.waitingFor.map((entry) => entry.title).join(', ') })}</p>}
    </li>
  )
}

function Tasks({ reference, tasks }: { reference: string; tasks: PortalTask[] }) {
  const words = usePortalText()
  const t = words.work.tasks
  const groups = useMemo(() => ORDER.map((group) => ({ group, tasks: tasks.filter((task) => groupOf(task) === group) })).filter((entry) => entry.tasks.length > 0), [tasks])
  if (tasks.length === 0) return <p className={styles.muted}>{t.empty}</p>
  return (
    <div className={work.groups} aria-label={t.list} role="group">
      {groups.map(({ group, tasks: inGroup }) => (
        <div key={group} className={work.group}>
          <h3 className={work.groupTitle}>
            {t.groups[group]} <span className={styles.muted}>({inGroup.length})</span>
          </h3>
          <ul className={work.tasks}>
            {inGroup.map((task) => (
              <TaskRow key={task.reference} reference={reference} task={task} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

// ---- the schedule --------------------------------------------------------------------------------------------------------------------

function datesText(from: string, to: string, point: boolean, lang: ReturnType<typeof useI18n>['lang'], words: PortalWords): string {
  return point || from === to ? formatDay(from, lang) : fill(words.work.schedule.span, { from: formatDay(from, lang), to: formatDay(to, lang) })
}

export function ProjectSchedule({ reference, tasks, milestones, today }: { reference: string; tasks: PortalTask[]; milestones: ProjectDetail['milestoneList']; today: string }) {
  const { lang } = useI18n()
  const words = usePortalText()
  const s = words.work.schedule
  const schedule = useMemo(() => {
    const items: ScheduleInput[] = [
      ...tasks.map((task): ScheduleInput => ({ id: `t:${task.reference}`, title: task.title, startOn: task.startOn, dueOn: task.dueOn, done: task.status === 'completed', cancelled: task.status === 'cancelled', kind: 'task', meta: task.reference })),
      ...milestones.map((milestone): ScheduleInput => ({ id: `m:${milestone.id}`, title: milestone.title, startOn: null, dueOn: milestone.dueOn, done: milestone.status === 'completed' || milestone.completedAt !== null, cancelled: milestone.status === 'cancelled', kind: 'milestone' })),
    ]
    return buildSchedule(items, today)
  }, [tasks, milestones, today])
  if (!schedule.range && schedule.unscheduled.length === 0) return <p className={styles.muted}>{s.empty}</p>
  return (
    <div className={work.schedule}>
      <p className={styles.muted}>{s.lead}</p>
      {schedule.range && <p className={styles.muted}>{fill(s.range, { from: formatDay(schedule.range.from, lang), to: formatDay(schedule.range.to, lang) })}</p>}
      <ol className={work.scheduleRows} aria-label={s.chart}>
        {schedule.rows.map((row) => (
          <li key={row.id} className={work.scheduleRow}>
            <div className={work.scheduleText}>
              <span className={work.scheduleKind}>{s.kind[row.kind]}</span>
              {row.kind === 'task' && row.meta ? (
                <LocalizedLink to={`/client-portal/projects/${reference}/tasks/${row.meta}`} className={work.taskLink}>
                  {row.title}
                </LocalizedLink>
              ) : (
                <span>{row.title}</span>
              )}
              <span className={work.scheduleDates}>
                {datesText(row.from, row.to, row.point, lang, words)}
                {row.overdue ? ` · ${words.work.tasks.overdue}` : ''}
              </span>
            </div>
            <div className={work.track} aria-hidden="true">
              {schedule.ticks.map((tick) => (
                <span key={tick.at} className={work.tick} style={{ left: `${tick.left}%` }} />
              ))}
              {schedule.today !== null && <span className={work.todayLine} style={{ left: `${schedule.today}%` }} />}
              <span className={work.fill} data-kind={row.kind} data-done={row.done} data-overdue={row.overdue} style={{ left: `${row.left}%`, width: `${row.width}%` }} />
            </div>
          </li>
        ))}
      </ol>
      {schedule.today !== null && (
        <ul className={work.scheduleLegend}>
          <li>{`${s.today}: ${formatDay(today, lang)}`}</li>
        </ul>
      )}
      {schedule.unscheduled.length > 0 && (
        <div className={work.undated}>
          <h3 className={styles.subTitle}>{s.unscheduled}</h3>
          <ul className={styles.list}>
            {schedule.unscheduled.map((item) => (
              <li key={item.id} className={styles.milestoneRow}>
                <span>
                  <span className={work.scheduleKind}>{s.kind[item.kind ?? 'task']}</span> {item.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---- the work, inside the project's page ----------------------------------------------------------------------------------------------

export function ProjectWork({ reference, milestones }: { reference: string; milestones: ProjectDetail['milestoneList'] }) {
  const words = usePortalText()
  const { state, reload } = useLoad(() => fetchWork(reference), `work:${reference}`)
  return (
    <>
      <section className={styles.section} aria-labelledby="work-title">
        <h2 id="work-title" className={styles.sectionTitle}>
          {words.work.tasks.title}
        </h2>
        <Load state={state} onRetry={reload}>
          {(data) => (
            <>
              <ProgressPanel progress={data.progress} />
              <p className={styles.muted}>{words.work.tasks.lead}</p>
              <Tasks reference={reference} tasks={data.tasks} />
            </>
          )}
        </Load>
      </section>
      <section className={styles.section} aria-labelledby="schedule-title">
        <h2 id="schedule-title" className={styles.sectionTitle}>
          {words.work.schedule.title}
        </h2>
        <Load state={state} onRetry={reload}>
          {(data) => <ProjectSchedule reference={reference} tasks={data.tasks} milestones={milestones} today={data.progress.today} />}
        </Load>
      </section>
    </>
  )
}

// ---- one task and the answer -----------------------------------------------------------------------------------------------------------

const MAX_ANSWER = 5000
const MIN_ANSWER = 2

function AnswerForm({ reference, task, onSent, again }: { reference: string; task: string; onSent: () => void; again: boolean }) {
  const words = usePortalText()
  const f = words.work.action.form
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const trimmed = text.trim()
    const problem = trimmed.length === 0 ? f.errors.required : trimmed.length < MIN_ANSWER ? f.errors.tooShort : trimmed.length > MAX_ANSWER ? f.errors.tooLong : null
    if (problem) {
      setError(problem)
      field.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    const result = await respondToTask(reference, task, trimmed)
    setBusy(false)
    if (result.ok) {
      setText('')
      onSent()
      return
    }
    if (result.failure.kind === 'refused' && result.failure.status === 409) setError(f.errors.closed)
    else if (result.failure.kind === 'refused' && result.failure.status === 422) setError(f.errors.tooShort)
    else setError(f.errors.failed)
    field.current?.focus()
  }

  return (
    <form className={work.answerForm} onSubmit={(event) => void submit(event)} noValidate>
      <div className={work.field}>
        <label className={work.label} htmlFor="answer">
          {f.label}
        </label>
        <textarea
          id="answer"
          ref={field}
          className={work.textarea}
          value={text}
          rows={7}
          maxLength={MAX_ANSWER + 200}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'answer-hint answer-count answer-error' : 'answer-hint answer-count'}
          onChange={(event) => {
            setText(event.target.value)
            if (error) setError(null)
          }}
        />
        <p id="answer-hint" className={styles.muted}>
          {f.hint}
        </p>
        <p id="answer-count" className={work.counter}>
          {fill(f.count, { count: text.trim().length, max: MAX_ANSWER })}
        </p>
        {error && (
          <p id="answer-error" className={work.fieldError} role="alert">
            {error}
          </p>
        )}
      </div>
      <div className={styles.row}>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? f.sending : again ? f.sendAgain : f.send}
        </Button>
      </div>
    </form>
  )
}

/** Said when the answer went through, and moved to so a keyboard or screen-reader user hears it. */
function SentNotice({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <p ref={ref} className={work.sent} role="status" tabIndex={-1}>
      {text}
    </p>
  )
}

function awaitingLine(words: PortalWords, status: ActionStatus, awaiting: 'you' | 'us' | null): string {
  if (status === 'cancelled') return words.work.action.cancelled
  if (awaiting === 'you') return words.work.action.awaitingYou
  if (awaiting === 'us') return words.work.action.awaitingUs
  return words.work.action.finished
}

function TaskDetail({ reference, task, onSent, sent }: { reference: string; task: PortalTaskDetail; onSent: () => void; sent: boolean }) {
  const { lang } = useI18n()
  const words = usePortalText()
  const t = words.work.tasks
  const a = words.work.action
  const action = task.action
  return (
    <>
      <PageHeader eyebrow={task.category ? task.category[lang] : t.title} title={task.title} focusKey={task.reference}>
        <p className={styles.statusLine}>
          <StatusBadge status={task.status} label={t.status[task.status]} tone={TASK_TONE[task.status]} />
        </p>
      </PageHeader>
      <dl className={styles.facts}>
        <div>
          <dt>{t.reference}</dt>
          <dd className={styles.code}>{task.reference}</dd>
        </div>
        {task.startOn && (
          <div>
            <dt>{t.startLabel}</dt>
            <dd>{formatDay(task.startOn, lang)}</dd>
          </div>
        )}
        {task.dueOn && (
          <div>
            <dt>{t.dueLabel}</dt>
            <dd>
              {formatDay(task.dueOn, lang)}
              {task.overdue ? ` · ${t.overdue}` : ''}
            </dd>
          </div>
        )}
        {task.completedAt && (
          <div>
            <dt>{t.doneLabel}</dt>
            <dd>{formatMoment(task.completedAt, lang)}</dd>
          </div>
        )}
        {task.milestone && (
          <div>
            <dt>{t.milestone}</dt>
            <dd>{task.milestone.title}</dd>
          </div>
        )}
      </dl>

      <section className={styles.section} aria-labelledby="what-title">
        <h2 id="what-title" className={styles.sectionTitle}>
          {t.description}
        </h2>
        <p className={work.instruction}>{task.description || t.noDescription}</p>
        {task.waitingFor.length > 0 && <p className={styles.muted}>{fill(t.waitingFor, { titles: task.waitingFor.map((entry) => entry.title).join(', ') })}</p>}
      </section>

      {action && (
        <section className={work.requestCard} data-attention={action.canRespond} aria-labelledby="request-title">
          <h2 id="request-title" className={styles.sectionTitle}>
            {a.title}
          </h2>
          <p className={styles.statusLine}>
            <StatusBadge status={action.status} label={a.status[action.status]} tone={action.awaiting === 'you' ? 'attention' : action.status === 'accepted' ? 'done' : action.status === 'cancelled' ? 'muted' : 'active'} />
            <span>{awaitingLine(words, action.status, action.awaiting)}</span>
          </p>
          <p>
            <strong>{a.types[action.type]}</strong>
          </p>
          <p className={work.instruction}>{action.instruction}</p>
          {action.changesRequested && (
            <>
              <h3 className={styles.subTitle}>{a.changesTitle}</h3>
              <p className={work.changes}>{action.changesRequested}</p>
            </>
          )}
          {sent && <SentNotice text={a.form.sent} />}
          {action.canRespond && (
            <>
              <h3 className={styles.subTitle}>{a.form.title}</h3>
              <AnswerForm reference={reference} task={task.reference} onSent={onSent} again={action.status === 'changes_requested'} />
            </>
          )}
        </section>
      )}

      {task.submissions.length > 0 && (
        <section className={styles.section} aria-labelledby="answers-title">
          <h2 id="answers-title" className={styles.sectionTitle}>
            {a.answers}
          </h2>
          <ol className={work.answers}>
            {task.submissions.map((entry) => (
              <li key={entry.revision} className={work.answer}>
                <span className={work.answerHead}>
                  {fill(a.answerNumber, { number: entry.revision })} · {formatMoment(entry.submittedAt, lang)}
                </span>
                <p>{entry.response}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {task.history.length > 0 && (
        <section className={styles.section} aria-labelledby="history-title">
          <h2 id="history-title" className={styles.sectionTitle}>
            {a.history}
          </h2>
          <ol className={styles.timeline}>
            {task.history.map((entry, index) => (
              <li key={index}>
                <p className={styles.timelineLine}>
                  {a.by[entry.by]}: {a.status[entry.to]}
                </p>
                <p className={styles.timelineMeta}>{formatMoment(entry.at, lang)}</p>
                {entry.note && <p className={styles.timelineNote}>{entry.note}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}

export function TaskView() {
  const { reference = '', task = '' } = useParams()
  const words = usePortalText()
  const { state, reload } = useLoad(() => fetchTask(reference, task), `${reference}/${task}`)
  const [sent, setSent] = useState(false)
  return (
    <>
      <p className={styles.back}>
        <LocalizedLink to={`/client-portal/projects/${reference}`}>← {words.work.tasks.back}</LocalizedLink>
      </p>
      <Load state={state} onRetry={reload} heading>
        {(detail) => (
          <TaskDetail
            reference={reference}
            task={detail}
            sent={sent}
            onSent={() => {
              setSent(true)
              reload()
            }}
          />
        )}
      </Load>
    </>
  )
}

