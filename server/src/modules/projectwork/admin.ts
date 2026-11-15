import { LANGUAGES, type Language } from '../../config.ts'
import type { AppContext, SessionInfo } from '../../context.ts'
import { notFound, validationFailed } from '../../http/errors.ts'
import { newId } from '../../lib/crypto.ts'
import { Fields } from '../../lib/validate.ts'
import { iso } from '../../lib/time.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { validDay } from '../customers/admin.ts'
import { getCustomer } from '../customers/accounts.ts'
import { getProject, recordProjectEvent } from '../customers/projects.ts'
import type { MilestoneRow, ProjectEventRow, ProjectRow } from '../customers/model.ts'
import {
  acceptAction,
  actionAdminView,
  actionIn,
  assignAction,
  cancelAction,
  editInstruction,
  requestChanges,
  startReview,
  type ActionAdminView,
} from './actions.ts'
import { addSuggestedCategories, createCategory, deleteCategory, listCategories, updateCategory, type CategoryView } from './categories.ts'
import {
  ACTION_TYPES,
  LIMITS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TASK_TRANSITIONS,
  isTaskStatus,
  type ActionRow,
  type ActionType,
  type ProjectWorkSettings,
  type TaskPriority,
  type TaskStatus,
} from './model.ts'
import { progressOf, type Progress } from './progress.ts'
import { saveWorkSettings, todayKey, workSettings } from './settings.ts'
import { addDependency, createTask, deleteTask, listTasks, moveTask, moveTasks, removeDependency, reorderTasks, taskOf, updateTask, type BulkResult, type NewTask, type TaskChanges, type TaskFilter, type TaskView } from './tasks.ts'

/**
 * The administration's side of the project work. Reading needs `clients:read`; everything that changes a task, a milestone or a customer action needs
 * `clients:projects` (an editor has it); the categories and the owner's notification choices are the administrator's (`clients:write`, `system:write`). The check is
 * HERE, in the business function, so no route can forget it. Every body is read field by field against a list of the fields that exist: a field that is not on the
 * list is refused, so a request cannot set what it has no business setting (an id, a creator, a revision, a completion time, a status through the wrong door).
 */

const ID = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : null)

function exact(body: Record<string, unknown>, known: readonly string[]): void {
  if (Object.keys(body).length === 0 || !Object.keys(body).every((key) => known.includes(key))) throw validationFailed({ body: 'invalid' })
}

function day(fields: Fields, name: string): string | null {
  return fields.text(name, { max: 10 }, (value) => (validDay(value) ? undefined : 'invalid'))
}

function flag(fields: Fields, body: Record<string, unknown>, name: string): boolean | undefined {
  if (!(name in body)) return undefined
  if (typeof body[name] !== 'boolean') {
    fields.fail(name, 'invalid')
    return undefined
  }
  return body[name] as boolean
}

function idField(fields: Fields, name: string): string | null {
  return fields.text(name, { max: 64 })
}

function revisionOf(fields: Fields, body: Record<string, unknown>): number | null {
  if (!('revision' in body)) return null
  const value = body.revision
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1_000_000) {
    fields.fail('revision', 'invalid')
    return null
  }
  return value
}

// ---- reading ---------------------------------------------------------------------------------------------------------------------------

export interface MilestoneWork extends MilestoneRow {
  tasks: number
  completedTasks: number
}

export interface Workspace {
  project: Pick<ProjectRow, 'id' | 'reference' | 'name' | 'status' | 'started_on' | 'expected_on'>
  customer: { id: string; email: string; name: string | null; language: Language }
  /** The day every date is compared with (the owner's zone, or UTC). */
  today: string
  /** Counted over everything the owner has recorded. */
  progress: Progress
  /** Counted over what the customer can see: the number the customer's page shows. */
  customerProgress: Progress
  tasks: TaskView[]
  /** Over the whole project, whatever filter the list was asked with. */
  counts: { tasks: number; needsReview: number; needsCustomer: number; overdue: number }
  milestones: MilestoneWork[]
  categories: CategoryView[]
  assignees: Array<{ id: string; email: string }>
  allowed: Record<TaskStatus, readonly TaskStatus[]>
}

const STATUS_LIST = (value: string | null): TaskStatus[] | undefined => {
  if (!value) return undefined
  const list = value.split(',').filter(isTaskStatus)
  return list.length ? [...new Set(list)] : undefined
}

function filterOf(query: URLSearchParams, session: SessionInfo): TaskFilter {
  const filter: TaskFilter = {}
  const status = STATUS_LIST(query.get('status'))
  if (status) filter.status = status
  const priority = (query.get('priority') ?? '').split(',').filter((entry): entry is TaskPriority => (TASK_PRIORITIES as readonly string[]).includes(entry))
  if (priority.length) filter.priority = [...new Set(priority)]
  const category = ID(query.get('category'))
  if (category) filter.categoryId = category
  const assignee = query.get('assignee')
  if (assignee === 'me') filter.assignee = session.userId
  else if (assignee === 'none') filter.assignee = 'none'
  else if (ID(assignee)) filter.assignee = assignee!
  const milestone = ID(query.get('milestone'))
  if (milestone) filter.milestoneId = milestone
  const q = (query.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, 100)
  if (q) filter.q = q
  const visible = query.get('visible')
  if (visible === 'yes') filter.customerVisible = true
  else if (visible === 'no') filter.customerVisible = false
  if (query.get('overdue') === '1') filter.overdue = true
  if (query.get('needsCustomer') === '1') filter.needsCustomer = true
  if (query.get('needsReview') === '1') filter.needsReview = true
  const sort = query.get('sort')
  if (sort === 'order' || sort === 'due' || sort === 'priority' || sort === 'updated' || sort === 'title') filter.sort = sort
  return filter
}

const assigneesOf = (app: AppContext): Array<{ id: string; email: string }> => app.db.all<{ id: string; email: string }>('SELECT id, email FROM admin_users ORDER BY email')

export function workspace(app: AppContext, session: SessionInfo | null, projectId: string, query: URLSearchParams): Workspace {
  const who = requirePermission(session, 'clients:read')
  const project = getProject(app, projectId)
  if (!project) throw notFound('The project')
  const customer = getCustomer(app, project.customer_id)
  if (!customer) throw notFound('The customer')
  const tasks = listTasks(app, { ...filterOf(query, who), projectId })
  const all = app.db.all<{ milestone_id: string; status: TaskStatus }>('SELECT milestone_id, status FROM project_tasks WHERE project_id = ? AND milestone_id IS NOT NULL', [projectId])
  const milestones = app.db.all<MilestoneRow>('SELECT * FROM client_milestones WHERE project_id = ? ORDER BY position', [projectId]).map((milestone) => ({
    ...milestone,
    tasks: all.filter((task) => task.milestone_id === milestone.id && task.status !== 'cancelled').length,
    completedTasks: all.filter((task) => task.milestone_id === milestone.id && task.status === 'completed').length,
  }))
  return {
    project: { id: project.id, reference: project.reference, name: project.name, status: project.status, started_on: project.started_on, expected_on: project.expected_on },
    customer: { id: customer.id, email: customer.email, name: customer.name, language: customer.language },
    today: todayKey(app),
    progress: progressOf(app, projectId, 'all'),
    customerProgress: progressOf(app, projectId, 'customer'),
    tasks,
    counts: {
      tasks: app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_tasks WHERE project_id = ?', [projectId])?.n ?? 0,
      needsReview: app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM project_customer_actions WHERE project_id = ? AND status IN ('submitted', 'under_review')", [projectId])?.n ?? 0,
      needsCustomer: app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM project_customer_actions a JOIN project_tasks t ON t.id = a.task_id WHERE a.project_id = ? AND a.status IN ('not_started', 'changes_requested') AND t.status NOT IN ('completed', 'cancelled')", [projectId])?.n ?? 0,
      overdue: app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM project_tasks WHERE project_id = ? AND status NOT IN ('completed', 'cancelled') AND due_on IS NOT NULL AND due_on < ?", [projectId, todayKey(app)])?.n ?? 0,
    },
    milestones,
    categories: listCategories(app),
    assignees: assigneesOf(app),
    allowed: TASK_TRANSITIONS,
  }
}

/** The owner's tasks across all projects (what is mine, what is overdue, what waits for me to review). */
export function allTasks(app: AppContext, session: SessionInfo | null, query: URLSearchParams): { tasks: TaskView[]; today: string } {
  const who = requirePermission(session, 'clients:read')
  const filter = filterOf(query, who)
  const project = ID(query.get('project'))
  if (project) filter.projectId = project
  filter.limit = 300
  return { tasks: listTasks(app, filter), today: todayKey(app) }
}

export interface TaskDetail {
  task: TaskView
  action: ActionAdminView | null
  predecessors: Array<Pick<TaskView, 'id' | 'reference' | 'title' | 'status'>>
  dependents: Array<Pick<TaskView, 'id' | 'reference' | 'title' | 'status'>>
  notes: Array<{ id: string; body: string; createdAt: string; authorEmail: string | null }>
  history: Array<ProjectEventRow & { adminEmail: string | null }>
  allowed: readonly TaskStatus[]
}

export function taskDetail(app: AppContext, session: SessionInfo | null, projectId: string, taskId: string): TaskDetail {
  requirePermission(session, 'clients:read')
  taskOf(app, projectId, taskId)
  const [task] = listTasks(app, { projectId, ids: [taskId] })
  if (!task) throw notFound('The task')
  const brief = (ids: string[]) => listTasks(app, { projectId, ids }).map(({ id, reference, title, status }) => ({ id, reference, title, status }))
  const action = app.db.get<ActionRow>('SELECT * FROM project_customer_actions WHERE task_id = ?', [taskId])
  return {
    task,
    action: action ? actionAdminView(app, action) : null,
    predecessors: brief(task.dependsOn),
    dependents: brief(task.dependents),
    notes: app.db.all<{ id: string; body: string; created_at: string; email: string | null }>('SELECT n.id, n.body, n.created_at, u.email FROM client_project_notes n LEFT JOIN admin_users u ON u.id = n.author_id WHERE n.project_id = ? AND n.task_id = ? ORDER BY n.created_at DESC', [projectId, taskId]).map((row) => ({ id: row.id, body: row.body, createdAt: row.created_at, authorEmail: row.email })),
    history: app.db.all<ProjectEventRow & { admin_email: string | null }>("SELECT e.*, u.email AS admin_email FROM client_project_events e LEFT JOIN admin_users u ON e.actor_type = 'admin' AND u.id = e.actor_id WHERE e.project_id = ? AND e.task_id = ? ORDER BY e.id DESC", [projectId, taskId]).map(({ admin_email, ...event }) => ({ ...event, adminEmail: admin_email })),
    allowed: TASK_TRANSITIONS[task.status],
  }
}

// ---- tasks -----------------------------------------------------------------------------------------------------------------------------

const TASK_FIELDS = ['title', 'description', 'customerDescription', 'status', 'priority', 'categoryId', 'milestoneId', 'startOn', 'dueOn', 'assignedTo', 'customerVisible'] as const

export function addTask(app: AppContext, session: SessionInfo | null, projectId: string, body: Record<string, unknown>): { id: string; reference: string } {
  const who = requirePermission(session, 'clients:projects')
  exact(body, TASK_FIELDS)
  const fields = new Fields(body)
  const title = fields.text('title', { max: LIMITS.title, required: true })
  const description = fields.text('description', { max: LIMITS.description, multiline: true })
  const customerDescription = fields.text('customerDescription', { max: LIMITS.customerDescription, multiline: true })
  const status = fields.oneOf<TaskStatus>('status', TASK_STATUSES) ?? 'backlog'
  const priority = fields.oneOf<TaskPriority>('priority', TASK_PRIORITIES) ?? 'normal'
  const input: NewTask = {
    title: title ?? '',
    description: description ?? '',
    customerDescription: customerDescription ?? '',
    status,
    priority,
    categoryId: idField(fields, 'categoryId'),
    milestoneId: idField(fields, 'milestoneId'),
    startOn: day(fields, 'startOn'),
    dueOn: day(fields, 'dueOn'),
    assignedTo: idField(fields, 'assignedTo'),
    customerVisible: flag(fields, body, 'customerVisible') ?? false,
  }
  fields.done()
  const task = createTask(app, who.userId, projectId, input)
  audit(app, who, 'work.task_created', 'client_task', task.id)
  return { id: task.id, reference: task.reference }
}

export function editTask(app: AppContext, session: SessionInfo | null, projectId: string, taskId: string, body: Record<string, unknown>): TaskDetail {
  const who = requirePermission(session, 'clients:projects')
  // `status` is not editable here: a status moves through its own door (the transition rules), never through an edit.
  exact(body, [...TASK_FIELDS.filter((key) => key !== 'status'), 'revision'])
  const fields = new Fields(body)
  const changes: TaskChanges = {}
  if ('title' in body) changes.title = fields.text('title', { max: LIMITS.title, required: true }) ?? undefined
  if ('description' in body) changes.description = fields.text('description', { max: LIMITS.description, multiline: true }) ?? ''
  if ('customerDescription' in body) changes.customerDescription = fields.text('customerDescription', { max: LIMITS.customerDescription, multiline: true }) ?? ''
  if ('priority' in body) changes.priority = fields.oneOf<TaskPriority>('priority', TASK_PRIORITIES, { required: true }) ?? undefined
  if ('categoryId' in body) changes.categoryId = idField(fields, 'categoryId')
  if ('milestoneId' in body) changes.milestoneId = idField(fields, 'milestoneId')
  if ('startOn' in body) changes.startOn = day(fields, 'startOn')
  if ('dueOn' in body) changes.dueOn = day(fields, 'dueOn')
  if ('assignedTo' in body) changes.assignedTo = idField(fields, 'assignedTo')
  const visible = flag(fields, body, 'customerVisible')
  if (visible !== undefined) changes.customerVisible = visible
  const revision = revisionOf(fields, body)
  fields.done()
  updateTask(app, who.userId, projectId, taskId, changes, revision)
  audit(app, who, 'work.task_edited', 'client_task', taskId)
  return taskDetail(app, session, projectId, taskId)
}

export function removeTask(app: AppContext, session: SessionInfo | null, projectId: string, taskId: string): void {
  const who = requirePermission(session, 'clients:projects')
  deleteTask(app, who.userId, projectId, taskId)
  audit(app, who, 'work.task_deleted', 'client_task', taskId)
}

export function setTaskStatus(app: AppContext, session: SessionInfo | null, projectId: string, taskId: string, body: Record<string, unknown>): TaskDetail {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['status', 'revision'])
  const fields = new Fields(body)
  const status = fields.oneOf<TaskStatus>('status', TASK_STATUSES, { required: true })
  const revision = revisionOf(fields, body)
  fields.done()
  moveTask(app, who.userId, projectId, taskId, status!, revision)
  audit(app, who, 'work.task_status', 'client_task', taskId, { status })
  return taskDetail(app, session, projectId, taskId)
}

export function setTasksStatus(app: AppContext, session: SessionInfo | null, projectId: string, body: Record<string, unknown>): BulkResult[] {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['ids', 'status'])
  const fields = new Fields(body)
  const status = fields.oneOf<TaskStatus>('status', TASK_STATUSES, { required: true })
  const ids = idList(fields, body, 'ids', LIMITS.bulk)
  fields.done()
  const results = moveTasks(app, who.userId, projectId, ids, status!)
  audit(app, who, 'work.tasks_status', 'client_project', projectId, { status, count: ids.length, moved: results.filter((entry) => entry.ok).length })
  return results
}

function idList(fields: Fields, body: Record<string, unknown>, name: string, max: number): string[] {
  const value = body[name]
  if (!Array.isArray(value)) {
    fields.fail(name, 'required')
    return []
  }
  if (value.length > max) {
    fields.fail(name, 'tooMany')
    return []
  }
  const ids = value.map(ID)
  if (ids.some((id) => id === null)) {
    fields.fail(name, 'invalid')
    return []
  }
  return ids as string[]
}

export function reorder(app: AppContext, session: SessionInfo | null, projectId: string, body: Record<string, unknown>): { ok: true } {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['ids'])
  const fields = new Fields(body)
  const ids = idList(fields, body, 'ids', 500)
  fields.done()
  reorderTasks(app, who.userId, projectId, ids)
  return { ok: true }
}

export function addTaskDependency(app: AppContext, session: SessionInfo | null, projectId: string, taskId: string, body: Record<string, unknown>): TaskDetail {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['dependsOnId'])
  const fields = new Fields(body)
  const other = fields.text('dependsOnId', { max: 64, required: true })
  fields.done()
  addDependency(app, who.userId, projectId, taskId, other!)
  audit(app, who, 'work.dependency_added', 'client_task', taskId)
  return taskDetail(app, session, projectId, taskId)
}

export function removeTaskDependency(app: AppContext, session: SessionInfo | null, projectId: string, taskId: string, dependsOnId: string): TaskDetail {
  const who = requirePermission(session, 'clients:projects')
  removeDependency(app, who.userId, projectId, taskId, dependsOnId)
  audit(app, who, 'work.dependency_removed', 'client_task', taskId)
  return taskDetail(app, session, projectId, taskId)
}

export function addTaskNote(app: AppContext, session: SessionInfo | null, projectId: string, taskId: string, body: Record<string, unknown>): { id: string } {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['body'])
  const fields = new Fields(body)
  const text = fields.text('body', { max: LIMITS.note * 2, multiline: true, required: true })
  fields.done()
  return app.db.transaction(() => {
    const task = taskOf(app, projectId, taskId)
    const id = newId()
    app.db.run('INSERT INTO client_project_notes (id, project_id, author_id, body, created_at, task_id) VALUES (?, ?, ?, ?, ?, ?)', [id, projectId, who.userId, text, iso(app.clock.now()), taskId])
    // The line says that a note exists, never what it says; it is the administration's own.
    recordProjectEvent(app, { projectId, type: 'note_added', adminId: who.userId, taskId, subject: task.title, visibility: 'internal' })
    return { id }
  })
}

// ---- customer actions ------------------------------------------------------------------------------------------------------------------

export function giveAction(app: AppContext, session: SessionInfo | null, projectId: string, taskId: string, body: Record<string, unknown>): TaskDetail {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['actionType', 'instruction'])
  const fields = new Fields(body)
  const actionType = fields.oneOf<ActionType>('actionType', ACTION_TYPES, { required: true })
  const instruction = fields.text('instruction', { max: LIMITS.instruction, min: 3, multiline: true, required: true })
  fields.done()
  const action = assignAction(app, who.userId, projectId, taskId, { actionType: actionType!, instruction: instruction! })
  audit(app, who, 'work.action_assigned', 'client_action', action.id)
  return taskDetail(app, session, projectId, taskId)
}

export function rewordAction(app: AppContext, session: SessionInfo | null, projectId: string, actionId: string, body: Record<string, unknown>): TaskDetail {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['actionType', 'instruction'])
  const fields = new Fields(body)
  const input: { actionType?: ActionType; instruction?: string } = {}
  if ('actionType' in body) input.actionType = fields.oneOf<ActionType>('actionType', ACTION_TYPES, { required: true }) ?? undefined
  if ('instruction' in body) input.instruction = fields.text('instruction', { max: LIMITS.instruction, min: 3, multiline: true, required: true }) ?? undefined
  fields.done()
  const action = editInstruction(app, who.userId, projectId, actionId, input)
  audit(app, who, 'work.action_edited', 'client_action', actionId)
  return taskDetail(app, session, projectId, action.task_id)
}

type Review = 'review' | 'accept' | 'changes' | 'cancel'

/** The owner's moves on a customer's response, each through one door: pick it up, accept, ask for changes (with words for the customer), cancel. */
export function reviewAction(app: AppContext, session: SessionInfo | null, projectId: string, actionId: string, move: Review, body: Record<string, unknown>): TaskDetail {
  const who = requirePermission(session, 'clients:projects')
  const known = move === 'accept' ? ['customerNote', 'internalNote', 'completeTask'] : move === 'changes' ? ['customerNote', 'internalNote'] : ['internalNote']
  if (Object.keys(body).length > 0) exact(body, known)
  const fields = new Fields(body)
  const internalNote = fields.text('internalNote', { max: LIMITS.note, multiline: true })
  const customerNote = fields.text('customerNote', { max: LIMITS.note, min: move === 'changes' ? 3 : undefined, multiline: true, required: move === 'changes' })
  const completeTask = flag(fields, body, 'completeTask') ?? false
  fields.done()
  const existing = actionIn(app, projectId, actionId)
  if (move === 'review') startReview(app, who.userId, projectId, actionId, internalNote)
  else if (move === 'accept') acceptAction(app, who.userId, projectId, actionId, { customerNote, internalNote, completeTask })
  else if (move === 'changes') requestChanges(app, who.userId, projectId, actionId, { customerNote: customerNote!, internalNote })
  else cancelAction(app, who.userId, projectId, actionId, internalNote)
  audit(app, who, `work.action_${move}`, 'client_action', actionId)
  return taskDetail(app, session, projectId, existing.task_id)
}

// ---- milestones (the fields the project work adds) --------------------------------------------------------------------------------------

export const MILESTONE_FIELDS = ['title', 'description', 'dueOn', 'status', 'customerVisible', 'done'] as const

// ---- the categories ----------------------------------------------------------------------------------------------------------------------

function namesOf(fields: Fields, body: Record<string, unknown>): Record<Language, string> | undefined {
  const raw = body.names
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fields.fail('names', 'required')
    return undefined
  }
  const out = {} as Record<Language, string>
  for (const lang of LANGUAGES) {
    const value = (raw as Record<string, unknown>)[lang]
    const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
    if (!text) fields.fail(`names.${lang}`, 'required')
    else if (text.length > LIMITS.category) fields.fail(`names.${lang}`, 'tooLong')
    out[lang] = text
  }
  return out
}

export function readCategories(app: AppContext, session: SessionInfo | null): CategoryView[] {
  requirePermission(session, 'clients:read')
  return listCategories(app)
}

export function addCategory(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): CategoryView[] {
  const who = requirePermission(session, 'clients:write')
  exact(body, ['code', 'names'])
  const fields = new Fields(body)
  const code = fields.text('code', { max: 40, min: 2, required: true })
  const names = namesOf(fields, body)
  fields.done()
  const id = createCategory(app, { code: code!, names: names! })
  audit(app, who, 'work.category_created', 'task_category', id)
  return listCategories(app)
}

export function editCategory(app: AppContext, session: SessionInfo | null, id: string, body: Record<string, unknown>): CategoryView[] {
  const who = requirePermission(session, 'clients:write')
  exact(body, ['names', 'enabled', 'sortOrder'])
  const fields = new Fields(body)
  const changes: Parameters<typeof updateCategory>[2] = {}
  if ('names' in body) changes.names = namesOf(fields, body)
  const enabled = flag(fields, body, 'enabled')
  if (enabled !== undefined) changes.enabled = enabled
  if ('sortOrder' in body) {
    if (typeof body.sortOrder !== 'number' || !Number.isInteger(body.sortOrder) || body.sortOrder < -100_000 || body.sortOrder > 100_000) fields.fail('sortOrder', 'invalid')
    else changes.sortOrder = body.sortOrder
  }
  fields.done()
  updateCategory(app, id, changes)
  audit(app, who, 'work.category_edited', 'task_category', id)
  return listCategories(app)
}

export function removeCategory(app: AppContext, session: SessionInfo | null, id: string): CategoryView[] {
  const who = requirePermission(session, 'clients:write')
  deleteCategory(app, id)
  audit(app, who, 'work.category_deleted', 'task_category', id)
  return listCategories(app)
}

export function suggestedCategories(app: AppContext, session: SessionInfo | null): { added: number; categories: CategoryView[] } {
  const who = requirePermission(session, 'clients:write')
  const added = addSuggestedCategories(app)
  audit(app, who, 'work.categories_suggested', 'task_category', null, { added })
  return { added, categories: listCategories(app) }
}

// ---- the owner's notification choices -------------------------------------------------------------------------------------------------

export function readWorkSettings(app: AppContext, session: SessionInfo | null): ProjectWorkSettings {
  requirePermission(session, 'clients:read')
  return workSettings(app)
}

export function writeWorkSettings(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): ProjectWorkSettings {
  const who = requirePermission(session, 'system:write')
  const current = workSettings(app)
  exact(body, Object.keys(current))
  const next = { ...current }
  const fields = new Fields(body)
  for (const key of Object.keys(current) as Array<keyof ProjectWorkSettings>) {
    if (!(key in body)) continue
    if (key === 'dueSoonDays') {
      const value = body[key]
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 30) fields.fail(key, 'invalid')
      else next.dueSoonDays = value
    } else if (typeof body[key] !== 'boolean') fields.fail(key, 'invalid')
    else next[key] = body[key] as boolean
  }
  fields.done()
  saveWorkSettings(app, next, who.userId)
  audit(app, who, 'work.settings', 'system', null)
  return next
}

// ---- what was sent and what was only queued ------------------------------------------------------------------------------------------

export interface WorkDelivery {
  id: string
  kind: string
  to: 'customer' | 'owner'
  recipient: string
  status: string
  /** `queued` (waiting or being sent), `sent` (the provider took it), `delivered`, or `failed`: the same four words the owner already knows from the e-mail log. */
  stage: 'queued' | 'sent' | 'delivered' | 'failed'
  createdAt: string
  acceptedAt: string | null
  deliveredAt: string | null
  error: string | null
}

const STAGE: Record<string, WorkDelivery['stage']> = { pending: 'queued', sending: 'queued', accepted: 'sent', delivered: 'delivered', bounced: 'failed', complained: 'failed', failed: 'failed', cancelled: 'failed' }

export function workDeliveries(app: AppContext, session: SessionInfo | null, projectId: string): WorkDelivery[] {
  requirePermission(session, 'clients:read')
  if (!getProject(app, projectId)) throw notFound('The project')
  const rows = app.db.all<{ id: string; kind: string; recipient: string; status: string; created_at: string; accepted_at: string | null; delivered_at: string | null; last_error: string | null }>(
    `SELECT d.id, d.kind, d.recipient, d.status, d.created_at, d.accepted_at, d.delivered_at, d.last_error FROM email_deliveries d
     WHERE d.kind LIKE 'client_%' AND d.kind NOT IN ('client_sign_in', 'client_activate', 'client_register', 'client_email_change', 'client_security_notice', 'client_deletion_requested_admin')
       AND ((d.related_type = 'client_project_event' AND d.related_id IN (SELECT CAST(e.id AS TEXT) FROM client_project_events e WHERE e.project_id = ?))
         OR (d.related_type = 'client_action_reminder' AND EXISTS (SELECT 1 FROM project_customer_actions a WHERE a.project_id = ? AND d.related_id LIKE a.id || ':%')))
     ORDER BY d.created_at DESC LIMIT 100`,
    [projectId, projectId],
  )
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    to: row.kind === 'client_action_submitted_admin' ? 'owner' : 'customer',
    recipient: row.recipient,
    status: row.status,
    stage: STAGE[row.status] ?? 'queued',
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    deliveredAt: row.delivered_at,
    error: row.last_error,
  }))
}
