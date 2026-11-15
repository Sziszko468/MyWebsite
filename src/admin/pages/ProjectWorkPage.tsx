import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { TASK_PRIORITIES, TASK_STATUSES, work, type BulkResult, type MilestoneStatus, type Task, type TaskFilters, type TaskStatus, type Workspace } from '../api/work'
import { AdminButton } from '../components/AdminButton'
import { CheckField, SearchInput, SelectField } from '../components/form'
import { DetailPanel, PageHeader, TabPanel, Tabs } from '../components/layout'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { EMPTY_DRAFT, inputOf, TaskFields, type TaskDraft } from '../components/work/TaskFields'
import { MilestonesPanel } from '../components/work/MilestonesPanel'
import { TaskBoard } from '../components/work/TaskBoard'
import { TaskList } from '../components/work/TaskList'
import { dayText, Tag } from '../components/work/parts'
import { WorkSchedule } from '../components/work/WorkSchedule'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import w from '../styles/work.module.scss'

/**
 * The workspace of one client project (PROMPT 26): where it stands, a board, a list, a schedule, the milestones, and the e-mails the work wrote. The administration is
 * the source of truth: everything here is the server's; a move that is refused says why in words and changes nothing. A task is private until it is shared.
 */

const TABS = ['board', 'list', 'schedule', 'milestones', 'messages'] as const
type Tab = (typeof TABS)[number]

const isTab = (value: string | null): value is Tab => (TABS as readonly string[]).includes(value ?? '')

/** What a refusal's reason code says in words (the server sends the reason; the words live here, in both languages). */
export function useRefusal() {
  const t = useText().work
  const reasons: Record<string, string> = { ...t.task.refused, ...t.action.refused, ...t.milestones.refused }
  return (error: unknown): string => {
    if (error instanceof ApiError) {
      const reason = typeof error.details.reason === 'string' ? error.details.reason : ''
      if (reason === 'dependency_cycle' && Array.isArray(error.details.path)) return fill(t.task.cycle, { path: (error.details.path as string[]).join(' → ') })
      if (reason === 'self_dependency') return t.task.selfDependency
      if (reason === 'dependency_exists') return t.task.exists
      if (reason === 'blocked_by_dependency' && Array.isArray(error.details.blockedBy)) return `${t.task.refused.blocked_by_dependency} (${(error.details.blockedBy as Array<{ title: string }>).map((entry) => entry.title).join(', ')})`
      if (reasons[reason]) return reasons[reason]
      return error.message
    }
    return String(error)
  }
}

function Summary({ data }: { data: Workspace }) {
  const t = useText().work
  const language = useInterfaceLanguage()
  const measure = (progress: Workspace['progress']) => {
    if (progress.percent === null) return { number: '–', label: t.summary.empty, note: '' }
    const counted = progress.basis === 'tasks' ? { done: progress.tasks.completed, total: progress.tasks.total } : { done: progress.milestones.completed, total: progress.milestones.total }
    return { number: `${progress.percent}%`, label: `${fill(t.summary.counts, counted)} · ${progress.basis === 'tasks' ? t.summary.basisTasks : t.summary.basisMilestones}`, note: '' }
  }
  const owner = measure(data.progress)
  const customer = measure(data.customerProgress)
  return (
    <div className={styles.stack}>
      <ul className={w.summary} aria-label={t.summary.title}>
        <li>
          <span className={w.summaryNumber}>{owner.number}</span>
          <span className={w.summaryLabel}>
            {t.summary.progress}
            <br />
            {owner.label}
          </span>
          {data.progress.percent !== null && <progress className={w.bar} value={data.progress.percent} max={100} aria-label={t.summary.progress} />}
        </li>
        <li>
          <span className={w.summaryNumber}>{customer.number}</span>
          <span className={w.summaryLabel}>
            {t.summary.customerProgress}
            <br />
            {customer.label}
          </span>
          {data.customerProgress.percent !== null && <progress className={w.bar} value={data.customerProgress.percent} max={100} aria-label={t.summary.customerProgress} />}
        </li>
        <li>
          <span className={w.summaryNumber}>{data.counts.needsReview}</span>
          <span className={w.summaryLabel}>{fill(t.summary.needsReview, { count: data.counts.needsReview })}</span>
        </li>
        <li>
          <span className={w.summaryNumber}>{data.counts.needsCustomer}</span>
          <span className={w.summaryLabel}>{fill(t.summary.needsCustomer, { count: data.counts.needsCustomer })}</span>
        </li>
        <li>
          <span className={w.summaryNumber}>{data.counts.overdue}</span>
          <span className={w.summaryLabel}>{fill(t.summary.overdue, { count: data.counts.overdue })}</span>
        </li>
      </ul>
      <p className={w.hint}>
        {t.summary.note} {fill(t.summary.today, { date: dayText(data.today, language) })}
      </p>
    </div>
  )
}

function Filters({ filters, onChange, data }: { filters: TaskFilters; onChange: (next: TaskFilters) => void; data: Workspace }) {
  const t = useText().work
  const language = useInterfaceLanguage()
  const f = t.filters
  const set = (patch: TaskFilters) => onChange({ ...filters, ...patch })
  const active = Object.entries(filters).some(([key, value]) => key !== 'sort' && value)
  return (
    <form className={w.filters} role="search" aria-label={f.label} onSubmit={(event) => event.preventDefault()}>
      <SearchInput label={f.search} placeholder={f.searchPlaceholder} value={filters.q ?? ''} onSearch={(q) => set({ q: q || undefined })} />
      <SelectField label={f.status} value={filters.status ?? ''} onChange={(event) => set({ status: event.target.value || undefined })} options={[{ value: '', label: f.allStatuses }, ...TASK_STATUSES.map((value) => ({ value, label: t.statuses[value] }))]} />
      <SelectField label={f.priority} value={filters.priority ?? ''} onChange={(event) => set({ priority: event.target.value || undefined })} options={[{ value: '', label: f.allPriorities }, ...TASK_PRIORITIES.map((value) => ({ value, label: t.priorities[value] }))]} />
      <SelectField label={f.category} value={filters.category ?? ''} onChange={(event) => set({ category: event.target.value || undefined })} options={[{ value: '', label: f.allCategories }, ...data.categories.map((category) => ({ value: category.id, label: category.names[language] }))]} />
      <SelectField label={f.assignee} value={filters.assignee ?? ''} onChange={(event) => set({ assignee: event.target.value || undefined })} options={[{ value: '', label: f.anyone }, { value: 'me', label: f.me }, { value: 'none', label: f.unassigned }, ...data.assignees.map((user) => ({ value: user.id, label: user.email }))]} />
      <SelectField label={f.milestone} value={filters.milestone ?? ''} onChange={(event) => set({ milestone: event.target.value || undefined })} options={[{ value: '', label: f.allMilestones }, ...data.milestones.map((milestone) => ({ value: milestone.id, label: milestone.title }))]} />
      <SelectField label={f.visible} value={filters.visible ?? ''} onChange={(event) => set({ visible: event.target.value || undefined })} options={[{ value: '', label: f.allVisibility }, { value: 'yes', label: f.shared }, { value: 'no', label: f.private }]} />
      <SelectField label={f.sort} value={filters.sort ?? 'order'} onChange={(event) => set({ sort: event.target.value })} options={(['order', 'due', 'priority', 'updated', 'title'] as const).map((value) => ({ value, label: f.sorts[value] }))} />
      <div className={w.filterChecks}>
        <CheckField label={f.overdueOnly} checked={Boolean(filters.overdue)} onChange={(overdue) => set({ overdue: overdue || undefined })} />
        <CheckField label={f.needsCustomer} checked={Boolean(filters.needsCustomer)} onChange={(needsCustomer) => set({ needsCustomer: needsCustomer || undefined })} />
        <CheckField label={f.needsReview} checked={Boolean(filters.needsReview)} onChange={(needsReview) => set({ needsReview: needsReview || undefined })} />
        {active && (
          <AdminButton variant="text" onClick={() => onChange({ sort: filters.sort })}>
            {f.clear}
          </AdminButton>
        )}
      </div>
    </form>
  )
}

function Deliveries({ id }: { id: string }) {
  const t = useText().work
  const language = useInterfaceLanguage()
  const resource = useResource((signal) => work.deliveries(id, signal), [id])
  if (resource.loading) return <LoadingState />
  if (resource.error && !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />
  const rows = resource.data ?? []
  return (
    <div className={w.fit}>
      <p className={w.hint}>{t.messages.lead}</p>
      {rows.length === 0 ? (
        <p className={styles.muted}>{t.messages.empty}</p>
      ) : (
        <div className={w.listWrap} tabIndex={0} role="region" aria-label={t.messages.title}>
          <table className={w.listTable}>
            <caption className={styles.srOnly}>{t.messages.title}</caption>
            <thead>
              <tr>
                <th scope="col">{t.messages.columns.when}</th>
                <th scope="col">{t.messages.columns.kind}</th>
                <th scope="col">{t.messages.columns.to}</th>
                <th scope="col">{t.messages.columns.stage}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt, language)}</td>
                  <td>{(t.messages.kinds as Record<string, string>)[row.kind] ?? row.kind}</td>
                  <td>{row.to === 'owner' ? t.messages.toOwner : t.messages.toCustomer}</td>
                  <td>
                    <Tag tone={row.stage === 'delivered' ? 'success' : row.stage === 'failed' ? 'danger' : row.stage === 'sent' ? 'info' : 'warning'}>{t.messages.stages[row.stage]}</Tag>
                    {row.error && row.stage === 'failed' && <span className={w.hint}> · {row.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function ProjectWorkPage() {
  const { id = '' } = useParams()
  const t = useText()
  const wt = t.work
  const toast = useToast()
  const refusal = useRefusal()
  const [params, setParams] = useSearchParams()
  const tab: Tab = isTab(params.get('tab')) ? (params.get('tab') as Tab) : 'board'
  const [filters, setFilters] = useState<TaskFilters>({ sort: 'order' })
  const resource = useResource((signal) => work.workspace(id, filters, signal), [id, JSON.stringify(filters)])
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<TaskDraft>(EMPTY_DRAFT)

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
      if (error instanceof ApiError && error.details.reason === 'stale') resource.reload()
      return null
    } finally {
      setBusy(null)
    }
  }

  if (resource.loading) return <LoadingState />
  if (resource.error && !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />
  const data = resource.data!
  const filtered = Object.entries(filters).some(([key, value]) => key !== 'sort' && value)
  const tabs = TABS.map((value) => ({ id: value, label: wt.tabs[value], attention: value === 'board' && data.counts.needsReview > 0, attentionLabel: fill(wt.summary.needsReview, { count: data.counts.needsReview }) }))

  const move = (task: Task, status: TaskStatus) => void run(`move-${task.id}`, () => work.move(id, task.id, status, task.revision), wt.board.moved)
  const reorder = (ids: string[]) => void run('reorder', () => work.reorder(id, ids), wt.board.reordered)
  const moveMany = async (ids: string[], status: TaskStatus): Promise<BulkResult[]> => (await run('bulk', () => work.moveMany(id, ids, status), null)) ?? []

  return (
    <>
      <PageHeader
        title={`${wt.title}: ${data.project.name}`}
        lead={<span className={styles.mono}>{data.project.reference}</span>}
        back={{ to: `/client-projects/${data.project.id}`, label: wt.back }}
        actions={
          <>
            <AdminButton variant="primary" onClick={() => setCreating((open) => !open)} aria-expanded={creating}>
              {creating ? wt.new.cancel : wt.new.open}
            </AdminButton>
            <AdminButton variant="secondary" to={`/client-projects/${data.project.id}/deliverables`}>
              {t.deliverables.open}
            </AdminButton>
            <AdminButton variant="secondary" to="/work/settings">
              {wt.settings.title}
            </AdminButton>
          </>
        }
      />
      <div className={styles.stackLg}>
        <Summary data={data} />

        {creating && (
          <DetailPanel title={wt.new.title}>
            <form
              className={styles.stack}
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                void run('create', () => work.create(id, inputOf(draft, true)), wt.new.created).then((created) => {
                  if (created) {
                    setDraft(EMPTY_DRAFT)
                    setCreating(false)
                  }
                })
              }}
            >
              <TaskFields draft={draft} onChange={setDraft} errors={errors} categories={data.categories} milestones={data.milestones} assignees={data.assignees} withStatus />
              <div className={styles.formActions}>
                <AdminButton type="submit" variant="primary" loading={busy === 'create'}>
                  {wt.new.create}
                </AdminButton>
              </div>
            </form>
          </DetailPanel>
        )}

        {(tab === 'board' || tab === 'list' || tab === 'schedule' || filtered) && <Filters filters={filters} onChange={setFilters} data={data} />}

        <div className={w.fit}>
          <Tabs tabs={tabs} value={tab} onChange={(next) => setParams({ tab: next }, { replace: true })} label={wt.tabs.label} idBase="work" />

          <TabPanel id="board" idBase="work" active={tab === 'board'}>
            <p className={w.hint} role="status">
              {fill(wt.filters.results, { count: data.tasks.length })}
            </p>
            {data.tasks.length === 0 ? <EmptyState icon="inbox" title={filtered ? wt.filters.noResults : wt.board.empty} /> : <TaskBoard projectId={data.project.id} tasks={data.tasks} allowed={data.allowed} onMove={move} onReorder={reorder} />}
          </TabPanel>

          <TabPanel id="list" idBase="work" active={tab === 'list'}>
            <p className={w.hint} role="status">
              {fill(wt.filters.results, { count: data.tasks.length })}
            </p>
            {data.tasks.length === 0 ? <EmptyState icon="inbox" title={filtered ? wt.filters.noResults : wt.board.empty} /> : <TaskList projectId={data.project.id} tasks={data.tasks} onBulk={moveMany} busy={busy === 'bulk'} />}
          </TabPanel>

          <TabPanel id="schedule" idBase="work" active={tab === 'schedule'}>
            <WorkSchedule projectId={data.project.id} tasks={data.tasks} milestones={data.milestones} today={data.today} />
          </TabPanel>

          <TabPanel id="milestones" idBase="work" active={tab === 'milestones'}>
            <MilestonesPanel
              milestones={data.milestones}
              busy={busy}
              errors={errors}
              onAdd={async (fresh) =>
                (await run('add-milestone', () => work.addMilestone(id, { title: fresh.title.trim(), description: fresh.description.trim() || undefined, dueOn: fresh.dueOn || undefined, customerVisible: fresh.customerVisible }), wt.milestones.saved)) !== null
              }
              onSave={(milestoneId, edit) =>
                void run(`save-${milestoneId}`, () => work.editMilestone(id, milestoneId, { title: edit.title.trim(), description: edit.description.trim() || null, dueOn: edit.dueOn || null, status: edit.status as MilestoneStatus, customerVisible: edit.customerVisible }), wt.milestones.saved)
              }
              onRemove={async (milestone) => {
                await run(`remove-${milestone.id}`, () => work.removeMilestone(id, milestone.id), wt.milestones.saved)
              }}
            />
          </TabPanel>

          <TabPanel id="messages" idBase="work" active={tab === 'messages'}>
            <Deliveries id={id} />
          </TabPanel>
        </div>
      </div>
    </>
  )
}

