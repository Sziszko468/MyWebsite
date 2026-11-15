import type { AppContext } from '../../context.ts'
import { HttpError, notFound, validationFailed } from '../../http/errors.ts'
import { newId, newReference } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import { getProject, recordProjectEvent, refuse } from '../customers/projects.ts'
import { getCategory } from './categories.ts'
import {
  canMoveTask,
  FINISHED_TASK,
  LIMITS,
  NEEDS_PREDECESSORS,
  OPEN_ACTION,
  type ActionRow,
  type TaskPriority,
  type TaskRow,
  type TaskStatus,
} from './model.ts'
import { todayKey } from './settings.ts'

/**
 * The tasks of a project and what the owner may do with them. Every function here is one transaction: the change, the line of the project's history that records it
 * and anything the change must also change (cancelling a task closes its customer action) happen together or not at all. The permission is checked by the caller
 * (admin.ts); the rules that protect the data (a transition, a dependency, a cycle) are checked HERE, so no other caller can skip them.
 *
 * A task is PRIVATE until the owner shares it. What the customer sees of one is built in portal.ts from `title`, `customer_description` and the dates, never from
 * `description`, the assignee, the priority or the notes.
 */

export interface NewTask {
  title: string
  description: string
  customerDescription: string
  status: TaskStatus
  priority: TaskPriority
  categoryId: string | null
  milestoneId: string | null
  startOn: string | null
  dueOn: string | null
  assignedTo: string | null
  customerVisible: boolean
}

export type TaskChanges = Partial<Omit<NewTask, 'status'>>

export const getTask = (app: Pick<AppContext, 'db'>, id: string): TaskRow | undefined => app.db.get<TaskRow>('SELECT * FROM project_tasks WHERE id = ?', [id])

/** A task through ITS project: the id of another project's task answers "not found", the same as an id that does not exist. */
export function taskOf(app: Pick<AppContext, 'db'>, projectId: string, taskId: string): TaskRow {
  const task = app.db.get<TaskRow>('SELECT * FROM project_tasks WHERE id = ? AND project_id = ?', [taskId, projectId])
  if (!task) throw notFound('The task')
  return task
}

export function newTaskReference(app: Pick<AppContext, 'db'>): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reference = newReference('TSK')
    if (!app.db.get('SELECT 1 FROM project_tasks WHERE reference = ?', [reference])) return reference
  }
  throw new Error('Could not make a unique task reference.')
}

export const stale = (): HttpError => refuse('The task was changed by someone else. Reload it and try again.', 'stale')

// ---- what a task points at -------------------------------------------------------------------------------------------------------------------

function checkReferences(app: Pick<AppContext, 'db'>, projectId: string, input: { categoryId?: string | null; milestoneId?: string | null; assignedTo?: string | null }): void {
  if (input.categoryId) {
    const category = getCategory(app, input.categoryId)
    if (!category || category.enabled !== 1) throw validationFailed({ categoryId: 'invalid' })
  }
  if (input.milestoneId) {
    if (!app.db.get('SELECT 1 FROM client_milestones WHERE id = ? AND project_id = ?', [input.milestoneId, projectId])) throw validationFailed({ milestoneId: 'invalid' })
  }
  if (input.assignedTo) {
    if (!app.db.get('SELECT 1 FROM admin_users WHERE id = ?', [input.assignedTo])) throw validationFailed({ assignedTo: 'invalid' })
  }
}

function checkDates(startOn: string | null, dueOn: string | null): void {
  if (startOn && dueOn && startOn > dueOn) throw validationFailed({ dueOn: 'invalid' })
}

export interface Predecessor {
  id: string
  reference: string
  title: string
  status: TaskStatus
}

/** What a task still waits for: the tasks it depends on that are neither completed nor cancelled. */
export function openPredecessors(app: Pick<AppContext, 'db'>, taskId: string): Predecessor[] {
  return app.db.all<Predecessor>(
    `SELECT t.id, t.reference, t.title, t.status FROM project_task_dependencies d JOIN project_tasks t ON t.id = d.depends_on_id
     WHERE d.task_id = ? AND t.status NOT IN ('completed', 'cancelled') ORDER BY t.sort_order, t.created_at`,
    [taskId],
  )
}

const actionOf = (app: Pick<AppContext, 'db'>, taskId: string): ActionRow | undefined => app.db.get<ActionRow>('SELECT * FROM project_customer_actions WHERE task_id = ?', [taskId])

// ---- create, edit, delete ---------------------------------------------------------------------------------------------------------------

export function createTask(app: AppContext, adminId: string, projectId: string, input: NewTask): TaskRow {
  return app.db.transaction(() => {
    if (!getProject(app, projectId)) throw notFound('The project')
    if (FINISHED_TASK.includes(input.status)) throw refuse('A task starts open; complete or cancel it afterwards.', 'invalid_initial_status')
    checkReferences(app, projectId, input)
    checkDates(input.startOn, input.dueOn)
    const now = iso(app.clock.now())
    const id = newId()
    const order = app.db.get<{ n: number }>('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM project_tasks WHERE project_id = ?', [projectId])?.n ?? 1
    app.db.run(
      `INSERT INTO project_tasks (id, reference, project_id, title, description, customer_description, status, priority, category_id, milestone_id, start_on, due_on, completed_at,
         assigned_to, customer_visible, sort_order, revision, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [id, newTaskReference(app), projectId, input.title, input.description, input.customerDescription, input.status, input.priority, input.categoryId, input.milestoneId, input.startOn, input.dueOn, input.assignedTo, input.customerVisible ? 1 : 0, order, adminId, adminId, now, now],
    )
    app.db.run('UPDATE client_projects SET updated_at = ? WHERE id = ?', [now, projectId])
    recordProjectEvent(app, { projectId, type: 'task_created', adminId, taskId: id, subject: input.title, visibility: input.customerVisible ? 'customer' : 'internal' })
    if (input.assignedTo) recordProjectEvent(app, { projectId, type: 'task_assigned', adminId, taskId: id, subject: input.title, visibility: 'internal', note: adminEmail(app, input.assignedTo) })
    return getTask(app, id)!
  })
}

const adminEmail = (app: Pick<AppContext, 'db'>, id: string | null): string | null => (id ? (app.db.get<{ email: string }>('SELECT email FROM admin_users WHERE id = ?', [id])?.email ?? null) : null)

/**
 * Changes what a task says, never its status (that is `moveTask`'s). `expectedRevision` is the revision the screen last read: a task that has been changed since is
 * refused (`stale`) instead of overwritten. Hiding a task from the customer is refused while a customer action on it is open, because the customer would be asked for
 * something they can no longer see.
 */
export function updateTask(app: AppContext, adminId: string, projectId: string, taskId: string, changes: TaskChanges, expectedRevision: number | null): TaskRow {
  return app.db.transaction(() => {
    const task = taskOf(app, projectId, taskId)
    if (expectedRevision !== null && expectedRevision !== task.revision) throw stale()
    checkReferences(app, projectId, changes)
    checkDates(changes.startOn === undefined ? task.start_on : changes.startOn, changes.dueOn === undefined ? task.due_on : changes.dueOn)
    const becomesHidden = changes.customerVisible === false && task.customer_visible === 1
    const becomesVisible = changes.customerVisible === true && task.customer_visible === 0
    if (becomesHidden) {
      const action = actionOf(app, taskId)
      if (action && OPEN_ACTION.includes(action.status)) throw refuse('A task with an open customer action must stay visible to the customer.', 'action_open')
    }
    // One fixed statement writes every editable column (the ones that did not change with the value they had): there is no SQL built from a request.
    const next = {
      title: changes.title ?? task.title,
      description: changes.description ?? task.description,
      customerDescription: changes.customerDescription ?? task.customer_description,
      priority: changes.priority ?? task.priority,
      categoryId: changes.categoryId === undefined ? task.category_id : changes.categoryId,
      milestoneId: changes.milestoneId === undefined ? task.milestone_id : changes.milestoneId,
      startOn: changes.startOn === undefined ? task.start_on : changes.startOn,
      dueOn: changes.dueOn === undefined ? task.due_on : changes.dueOn,
      assignedTo: changes.assignedTo === undefined ? task.assigned_to : changes.assignedTo,
      customerVisible: changes.customerVisible === undefined ? task.customer_visible : changes.customerVisible ? 1 : 0,
    }
    const before = {
      title: task.title,
      description: task.description,
      customerDescription: task.customer_description,
      priority: task.priority,
      categoryId: task.category_id,
      milestoneId: task.milestone_id,
      startOn: task.start_on,
      dueOn: task.due_on,
      assignedTo: task.assigned_to,
      customerVisible: task.customer_visible,
    }
    const changed = (Object.keys(next) as Array<keyof typeof next>).filter((key) => next[key] !== before[key])
    if (changed.length === 0) return task
    const now = iso(app.clock.now())
    const result = app.db.run(
      `UPDATE project_tasks SET title = ?, description = ?, customer_description = ?, priority = ?, category_id = ?, milestone_id = ?, start_on = ?, due_on = ?, assigned_to = ?, customer_visible = ?,
         revision = revision + 1, updated_by = ?, updated_at = ? WHERE id = ? AND revision = ?`,
      [next.title, next.description, next.customerDescription, next.priority, next.categoryId, next.milestoneId, next.startOn, next.dueOn, next.assignedTo, next.customerVisible, adminId, now, taskId, task.revision],
    )
    if (result.changes !== 1) throw stale()
    app.db.run('UPDATE client_projects SET updated_at = ? WHERE id = ?', [now, projectId])
    const title = changes.title ?? task.title
    // Sharing a task is the one edit a customer's timeline shows: from their side the task appears. Every other edit is the administration's own line.
    if (becomesVisible) recordProjectEvent(app, { projectId, type: 'task_created', adminId, taskId, subject: title, visibility: 'customer' })
    recordProjectEvent(app, { projectId, type: 'task_edited', adminId, taskId, subject: title, visibility: 'internal', note: changed.join(', ') })
    if (changed.includes('assignedTo')) recordProjectEvent(app, { projectId, type: 'task_assigned', adminId, taskId, subject: title, visibility: 'internal', note: adminEmail(app, changes.assignedTo ?? null) })
    return getTask(app, taskId)!
  })
}

/**
 * Removes a task nobody has worked on: not a finished one and not one the customer has responded to (those are history; cancel them instead). The line that says it
 * was removed stays; its dependencies and its (unanswered) action go with it.
 */
export function deleteTask(app: AppContext, adminId: string, projectId: string, taskId: string): void {
  app.db.transaction(() => {
    const task = taskOf(app, projectId, taskId)
    if (task.status === 'completed') throw refuse('A completed task is part of the history and cannot be removed; cancel it instead.', 'task_completed')
    const answered = app.db.get('SELECT 1 FROM project_action_submissions s JOIN project_customer_actions a ON a.id = s.action_id WHERE a.task_id = ?', [taskId])
    if (answered) throw refuse('A customer has responded to this task; it is part of the history and cannot be removed. Cancel it instead.', 'has_responses')
    app.db.run('DELETE FROM project_tasks WHERE id = ?', [taskId])
    app.db.run('UPDATE client_projects SET updated_at = ? WHERE id = ?', [iso(app.clock.now()), projectId])
    recordProjectEvent(app, { projectId, type: 'task_edited', adminId, taskId, subject: task.title, visibility: 'internal', note: 'deleted' })
  })
}

// ---- status ----------------------------------------------------------------------------------------------------------------------------

/**
 * Moves a task to another status. Besides the table of allowed moves (model.ts): a task cannot be started, reviewed or completed while something it depends on is
 * still open (the answer names what), a task with an open customer action cannot be completed until the action is accepted or cancelled, and cancelling a task
 * cancels its open customer action with it. Completing a task never completes another: what depends on it is only released from waiting.
 */
export function moveTask(app: AppContext, adminId: string, projectId: string, taskId: string, to: TaskStatus, expectedRevision: number | null = null): TaskRow {
  return app.db.transaction(() => {
    const task = taskOf(app, projectId, taskId)
    if (expectedRevision !== null && expectedRevision !== task.revision) throw stale()
    if (!canMoveTask(task.status, to)) throw refuse(`A task that is "${task.status}" cannot move to "${to}".`, 'invalid_transition')
    if (NEEDS_PREDECESSORS.includes(to)) {
      const waiting = openPredecessors(app, taskId)
      if (waiting.length > 0) throw new HttpError(409, 'conflict', 'This task waits for other tasks that are not finished.', { details: { reason: 'blocked_by_dependency', blockedBy: waiting.map((entry) => ({ reference: entry.reference, title: entry.title, status: entry.status })) } })
    }
    const action = actionOf(app, taskId)
    if (to === 'completed' && action && OPEN_ACTION.includes(action.status)) throw refuse('The customer action of this task must be accepted or cancelled before the task is completed.', 'action_open')
    const now = iso(app.clock.now())
    const result = app.db.run('UPDATE project_tasks SET status = ?, completed_at = ?, revision = revision + 1, updated_by = ?, updated_at = ? WHERE id = ? AND status = ? AND revision = ?', [to, to === 'completed' ? now : null, adminId, now, taskId, task.status, task.revision])
    if (result.changes !== 1) throw stale()
    app.db.run('UPDATE client_projects SET updated_at = ? WHERE id = ?', [now, projectId])
    const visibility = task.customer_visible === 1 ? 'customer' : 'internal'
    const type = to === 'completed' ? 'task_completed' : to === 'cancelled' ? 'task_cancelled' : 'task_status_changed'
    recordProjectEvent(app, { projectId, type, adminId, taskId, subject: task.title, from: task.status, to, visibility })
    // Cancelling the task closes what it asked of the customer: an action nobody will review is not left open.
    if (to === 'cancelled' && action && OPEN_ACTION.includes(action.status)) cancelActionOf(app, adminId, action, 'The task was cancelled.')
    return getTask(app, taskId)!
  })
}

/** Cancels an action as part of something else (a task being cancelled). The transition and the line of history are written here so they cannot be forgotten. */
export function cancelActionOf(app: AppContext, adminId: string, action: ActionRow, internalNote: string): void {
  const now = iso(app.clock.now())
  app.db.run("UPDATE project_customer_actions SET status = 'cancelled', reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?", [now, adminId, now, action.id])
  app.db.run('INSERT INTO project_action_transitions (action_id, from_status, to_status, revision, actor_type, actor_id, customer_note, internal_note, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)', [action.id, action.status, 'cancelled', action.revision, 'admin', adminId, internalNote, now])
  const task = getTask(app, action.task_id)
  recordProjectEvent(app, { projectId: action.project_id, type: 'action_cancelled', adminId, taskId: action.task_id, actionId: action.id, subject: task?.title ?? null, from: action.status, to: 'cancelled', visibility: task?.customer_visible === 1 ? 'customer' : 'internal' })
}

export interface BulkResult {
  id: string
  ok: boolean
  /** Why it did not move (the same reasons a single move gives); absent when it did. */
  reason?: string
}

/** Moves several tasks to one status. Each task is its own transaction: one that cannot move (a dependency, a rule) does not stop the others, and the answer says which. */
export function moveTasks(app: AppContext, adminId: string, projectId: string, ids: string[], to: TaskStatus): BulkResult[] {
  if (ids.length === 0 || ids.length > LIMITS.bulk) throw validationFailed({ ids: ids.length === 0 ? 'required' : 'tooMany' })
  if (new Set(ids).size !== ids.length) throw validationFailed({ ids: 'duplicate' })
  return ids.map((id) => {
    try {
      moveTask(app, adminId, projectId, id, to)
      return { id, ok: true }
    } catch (error) {
      if (error instanceof HttpError) {
        const reason = typeof error.details?.reason === 'string' ? error.details.reason : error.code === 'not_found' ? 'not_found' : error.code
        return { id, ok: false, reason }
      }
      throw error
    }
  })
}

/**
 * Puts the tasks in the order given. Only the tasks named are rearranged, among the places they already held: a task left out keeps its own place, so a filtered board
 * can reorder what it shows without disturbing what it hides.
 */
export function reorderTasks(app: AppContext, adminId: string, projectId: string, ids: string[]): void {
  app.db.transaction(() => {
    if (ids.length === 0 || ids.length > 500) throw validationFailed({ ids: ids.length === 0 ? 'required' : 'tooMany' })
    if (new Set(ids).size !== ids.length) throw validationFailed({ ids: 'duplicate' })
    const rows = ids.map((id) => taskOf(app, projectId, id))
    const places = rows.map((row) => row.sort_order).sort((a, b) => a - b)
    // Equal places (two tasks that were never ordered) are spread so the new order is a real one.
    const now = iso(app.clock.now())
    ids.forEach((id, index) => {
      const place = places[index]! + (places.filter((value, position) => position < index && value === places[index]).length)
      app.db.run('UPDATE project_tasks SET sort_order = ?, updated_by = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND project_id = ?', [place, adminId, now, id, projectId])
    })
    app.db.run('UPDATE client_projects SET updated_at = ? WHERE id = ?', [now, projectId])
  })
}

// ---- dependencies ----------------------------------------------------------------------------------------------------------------------

/** The tasks, from `from`, that it waits for through any number of steps, as a path ending at `to`; `null` when `to` is not upstream of `from`. */
function upstreamPath(app: Pick<AppContext, 'db'>, from: string, to: string): string[] | null {
  const parent = new Map<string, string | null>([[from, null]])
  const queue = [from]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === to) {
      const path: string[] = []
      for (let at: string | null = current; at !== null; at = parent.get(at) ?? null) path.unshift(at)
      return path
    }
    for (const next of app.db.all<{ depends_on_id: string }>('SELECT depends_on_id FROM project_task_dependencies WHERE task_id = ?', [current])) {
      if (!parent.has(next.depends_on_id)) {
        parent.set(next.depends_on_id, current)
        queue.push(next.depends_on_id)
      }
    }
  }
  return null
}

/**
 * Says that `taskId` cannot start before `dependsOnId` is done. Refused: a task on itself, a pair that already exists, a task of another project, and anything that would
 * make a loop (the answer names the loop). Adding a dependency never moves a task: one that has already started shows what it now waits for and stays where it is.
 */
export function addDependency(app: AppContext, adminId: string, projectId: string, taskId: string, dependsOnId: string): void {
  app.db.transaction(() => {
    const task = taskOf(app, projectId, taskId)
    if (taskId === dependsOnId) throw refuse('A task cannot depend on itself.', 'self_dependency')
    const other = taskOf(app, projectId, dependsOnId)
    if (app.db.get('SELECT 1 FROM project_task_dependencies WHERE task_id = ? AND depends_on_id = ?', [taskId, dependsOnId])) throw refuse('This dependency already exists.', 'dependency_exists')
    const loop = upstreamPath(app, dependsOnId, taskId)
    if (loop) {
      const titles = [task.title, ...loop.map((id) => getTask(app, id)?.title ?? id)]
      throw new HttpError(409, 'conflict', `That would make a loop: ${titles.join(' → ')}.`, { details: { reason: 'dependency_cycle', path: titles } })
    }
    const now = iso(app.clock.now())
    app.db.run('INSERT INTO project_task_dependencies (task_id, depends_on_id, created_at) VALUES (?, ?, ?)', [taskId, dependsOnId, now])
    app.db.run('UPDATE project_tasks SET revision = revision + 1, updated_by = ?, updated_at = ? WHERE id = ?', [adminId, now, taskId])
    recordProjectEvent(app, { projectId, type: 'dependency_added', adminId, taskId, subject: task.title, visibility: 'internal', note: other.title })
  })
}

export function removeDependency(app: AppContext, adminId: string, projectId: string, taskId: string, dependsOnId: string): void {
  app.db.transaction(() => {
    const task = taskOf(app, projectId, taskId)
    const other = taskOf(app, projectId, dependsOnId)
    const result = app.db.run('DELETE FROM project_task_dependencies WHERE task_id = ? AND depends_on_id = ?', [taskId, dependsOnId])
    if (result.changes === 0) throw notFound('The dependency')
    const now = iso(app.clock.now())
    app.db.run('UPDATE project_tasks SET revision = revision + 1, updated_by = ?, updated_at = ? WHERE id = ?', [adminId, now, taskId])
    recordProjectEvent(app, { projectId, type: 'dependency_removed', adminId, taskId, subject: task.title, visibility: 'internal', note: other.title })
  })
}

// ---- reading ---------------------------------------------------------------------------------------------------------------------------

export interface TaskFilter {
  projectId?: string
  ids?: string[]
  status?: TaskStatus[]
  priority?: TaskPriority[]
  categoryId?: string
  /** An admin user id, or `none` for the tasks nobody has. */
  assignee?: string
  milestoneId?: string
  q?: string
  customerVisible?: boolean
  overdue?: boolean
  /** Only tasks whose customer action waits for the customer. */
  needsCustomer?: boolean
  /** Only tasks whose customer action has an answer waiting for the owner's review. */
  needsReview?: boolean
  sort?: 'order' | 'due' | 'priority' | 'updated' | 'title'
  limit?: number
}

const SORTS: Record<NonNullable<TaskFilter['sort']>, string> = {
  order: 't.project_id, t.sort_order, t.created_at',
  due: '(t.due_on IS NULL), t.due_on, t.sort_order',
  priority: "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, (t.due_on IS NULL), t.due_on, t.sort_order",
  updated: 't.updated_at DESC',
  title: 't.title COLLATE NOCASE',
}

export const likeOf = (value: string): string => `%${value.replace(/[\\%_]/g, (character) => `\\${character}`).toLowerCase()}%`

export interface TaskView extends TaskRow {
  projectReference: string
  projectName: string
  assigneeEmail: string | null
  overdue: boolean
  blockedBy: Predecessor[]
  dependsOn: string[]
  dependents: string[]
  action: (Pick<ActionRow, 'id' | 'action_type' | 'status' | 'revision' | 'submitted_at' | 'reviewed_at'> & { instruction: string }) | null
  /** Derived, never stored: the task has an action and the customer is the one who has to move it. */
  requiresCustomerAction: boolean
}

export function listTasks(app: Pick<AppContext, 'db' | 'clock'>, filter: TaskFilter = {}): TaskView[] {
  const where: string[] = []
  const params: Array<string | number> = []
  const today = todayKey(app)
  if (filter.projectId) {
    where.push('t.project_id = ?')
    params.push(filter.projectId)
  }
  if (filter.ids) {
    if (filter.ids.length === 0) return []
    where.push(`t.id IN (${filter.ids.map(() => '?').join(', ')})`)
    params.push(...filter.ids)
  }
  if (filter.status?.length) {
    where.push(`t.status IN (${filter.status.map(() => '?').join(', ')})`)
    params.push(...filter.status)
  }
  if (filter.priority?.length) {
    where.push(`t.priority IN (${filter.priority.map(() => '?').join(', ')})`)
    params.push(...filter.priority)
  }
  if (filter.categoryId) {
    where.push('t.category_id = ?')
    params.push(filter.categoryId)
  }
  if (filter.assignee === 'none') where.push('t.assigned_to IS NULL')
  else if (filter.assignee) {
    where.push('t.assigned_to = ?')
    params.push(filter.assignee)
  }
  if (filter.milestoneId) {
    where.push('t.milestone_id = ?')
    params.push(filter.milestoneId)
  }
  if (filter.q) {
    where.push("(LOWER(t.title) LIKE ? ESCAPE '\\' OR LOWER(t.reference) LIKE ? ESCAPE '\\')")
    params.push(likeOf(filter.q), likeOf(filter.q))
  }
  if (filter.customerVisible !== undefined) where.push(filter.customerVisible ? 't.customer_visible = 1' : 't.customer_visible = 0')
  if (filter.overdue) {
    where.push("t.status NOT IN ('completed', 'cancelled') AND t.due_on IS NOT NULL AND t.due_on < ?")
    params.push(today)
  }
  if (filter.needsCustomer) where.push("EXISTS (SELECT 1 FROM project_customer_actions a WHERE a.task_id = t.id AND a.status IN ('not_started', 'changes_requested') AND t.status NOT IN ('completed', 'cancelled'))")
  if (filter.needsReview) where.push("EXISTS (SELECT 1 FROM project_customer_actions a WHERE a.task_id = t.id AND a.status IN ('submitted', 'under_review'))")
  const limit = Math.min(Math.max(filter.limit ?? 500, 1), 1000)
  const rows = app.db.all<TaskRow & { project_reference: string; project_name: string; assignee_email: string | null }>(
    `SELECT t.*, p.reference AS project_reference, p.name AS project_name, u.email AS assignee_email
     FROM project_tasks t JOIN client_projects p ON p.id = t.project_id LEFT JOIN admin_users u ON u.id = t.assigned_to
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${SORTS[filter.sort ?? 'order']} LIMIT ?`,
    [...params, limit],
  )
  if (rows.length === 0) return []
  // The relations of the tasks listed, read once for all of them.
  const marks = rows.map(() => '?').join(', ')
  const ids = rows.map((row) => row.id)
  const edges = app.db.all<{ task_id: string; depends_on_id: string; status: TaskStatus; reference: string; title: string }>(
    `SELECT d.task_id, d.depends_on_id, t.status, t.reference, t.title FROM project_task_dependencies d JOIN project_tasks t ON t.id = d.depends_on_id WHERE d.task_id IN (${marks})`,
    ids,
  )
  const dependents = app.db.all<{ depends_on_id: string; task_id: string }>(`SELECT depends_on_id, task_id FROM project_task_dependencies WHERE depends_on_id IN (${marks})`, ids)
  const actions = app.db.all<ActionRow>(`SELECT * FROM project_customer_actions WHERE task_id IN (${marks})`, ids)
  return rows.map(({ project_reference, project_name, assignee_email, ...task }) => {
    const mine = edges.filter((edge) => edge.task_id === task.id)
    const action = actions.find((entry) => entry.task_id === task.id)
    const finished = FINISHED_TASK.includes(task.status)
    return {
      ...task,
      projectReference: project_reference,
      projectName: project_name,
      assigneeEmail: assignee_email,
      overdue: !finished && task.due_on !== null && task.due_on < today,
      blockedBy: mine.filter((edge) => edge.status !== 'completed' && edge.status !== 'cancelled').map((edge) => ({ id: edge.depends_on_id, reference: edge.reference, title: edge.title, status: edge.status })),
      dependsOn: mine.map((edge) => edge.depends_on_id),
      dependents: dependents.filter((edge) => edge.depends_on_id === task.id).map((edge) => edge.task_id),
      action: action ? { id: action.id, action_type: action.action_type, status: action.status, revision: action.revision, submitted_at: action.submitted_at, reviewed_at: action.reviewed_at, instruction: action.instruction } : null,
      requiresCustomerAction: !finished && action !== undefined && (action.status === 'not_started' || action.status === 'changes_requested'),
    }
  })
}
