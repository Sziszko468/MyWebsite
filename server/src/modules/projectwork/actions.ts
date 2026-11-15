import type { AppContext } from '../../context.ts'
import { notFound } from '../../http/errors.ts'
import { newId } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import { TERMINAL_STATUSES, type ProjectRow } from '../customers/model.ts'
import { queueClientMail } from '../customers/mail.ts'
import { getProject, recordProjectEvent, refuse, tell } from '../customers/projects.ts'
import {
  ACTION_TRANSITIONS,
  AWAITING_RESPONSE,
  AWAITING_REVIEW,
  FINISHED_TASK,
  OPEN_ACTION,
  canMoveAction,
  type ActionRow,
  type ActionStatus,
  type ActionType,
  type TaskRow,
} from './model.ts'
import { workSettings } from './settings.ts'
import { cancelActionOf, getTask, moveTask, taskOf } from './tasks.ts'

/**
 * A customer action is something the owner asks of the customer (words, a decision, a look at a deliverable) attached to one task, and the customer's answer to it.
 *
 *  - the customer's only move is to RESPOND; every other move is the owner's (pick it up, accept it, ask for changes, cancel it);
 *  - a response is never changed: a new one after a request for changes is the next revision, and every revision is kept;
 *  - every move is a row in `project_action_transitions` (who, from, to, when, and the words that went with it), in the same transaction as the move;
 *  - a request for changes MUST carry words for the customer; the owner's own note about a review is stored beside it and no customer's page reads that column;
 *  - there is no upload: the site has no private place for a file, so a response is text (docs/project-management/CUSTOMER_ACTIONS.md).
 */

export const actionOf = (app: Pick<AppContext, 'db'>, id: string): ActionRow | undefined => app.db.get<ActionRow>('SELECT * FROM project_customer_actions WHERE id = ?', [id])

/** An action through ITS project: another project's id answers "not found". */
export function actionIn(app: Pick<AppContext, 'db'>, projectId: string, actionId: string): ActionRow {
  const action = app.db.get<ActionRow>('SELECT * FROM project_customer_actions WHERE id = ? AND project_id = ?', [actionId, projectId])
  if (!action) throw notFound('The customer action')
  return action
}

function transition(app: Pick<AppContext, 'db' | 'clock'>, action: ActionRow, to: ActionStatus, actor: { type: 'admin' | 'customer' | 'system'; id: string | null }, notes: { customer?: string | null; internal?: string | null } = {}, revision = action.revision): void {
  app.db.run('INSERT INTO project_action_transitions (action_id, from_status, to_status, revision, actor_type, actor_id, customer_note, internal_note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    action.id, action.status, to, revision, actor.type, actor.id, notes.customer ?? null, notes.internal ?? null, iso(app.clock.now()),
  ])
}

/** A move that only the owner makes, written the one way: the conditional update (a stale screen or a double click changes nothing twice), the transition, the line of history. */
function ownerMove(
  app: AppContext,
  adminId: string,
  action: ActionRow,
  to: ActionStatus,
  type: 'action_under_review' | 'action_accepted' | 'action_changes_requested',
  notes: { customer?: string | null; internal?: string | null },
): { eventId: number; task: TaskRow } {
  if (!canMoveAction(action.status, to)) throw refuse(`A customer action that is "${action.status}" cannot move to "${to}".`, 'invalid_transition')
  const task = getTask(app, action.task_id)
  if (!task) throw notFound('The task')
  const now = iso(app.clock.now())
  const reviewing = to === 'accepted' || to === 'changes_requested'
  const result = app.db.run('UPDATE project_customer_actions SET status = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ? AND status = ? AND revision = ?', [
    to, reviewing ? now : action.reviewed_at, reviewing ? adminId : action.reviewed_by, now, action.id, action.status, action.revision,
  ])
  if (result.changes !== 1) throw refuse('The customer action was changed by someone else. Reload it and try again.', 'stale')
  transition(app, action, to, { type: 'admin', id: adminId }, notes)
  app.db.run('UPDATE client_projects SET updated_at = ? WHERE id = ?', [now, action.project_id])
  const eventId = recordProjectEvent(app, { projectId: action.project_id, type, adminId, taskId: task.id, actionId: action.id, subject: task.title, from: action.status, to, visibility: task.customer_visible === 1 ? 'customer' : 'internal', note: notes.customer ?? null })
  return { eventId, task }
}

// ---- the owner ---------------------------------------------------------------------------------------------------------------------------

export function assignAction(app: AppContext, adminId: string, projectId: string, taskId: string, input: { actionType: ActionType; instruction: string }): ActionRow {
  return app.db.transaction(() => {
    const project = getProject(app, projectId)
    if (!project) throw notFound('The project')
    const task = taskOf(app, projectId, taskId)
    if (TERMINAL_STATUSES.includes(project.status)) throw refuse('A finished or cancelled project cannot be given new customer actions.', 'project_closed')
    if (task.customer_visible !== 1) throw refuse('Share the task with the customer before asking something of them.', 'task_hidden')
    if (FINISHED_TASK.includes(task.status)) throw refuse('A completed or cancelled task cannot be given a customer action.', 'task_finished')
    if (app.db.get('SELECT 1 FROM project_customer_actions WHERE task_id = ?', [taskId])) throw refuse('This task already has a customer action.', 'action_exists')
    const now = iso(app.clock.now())
    const id = newId()
    app.db.run('INSERT INTO project_customer_actions (id, task_id, project_id, action_type, status, revision, created_by, created_at, updated_at, instruction) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)', [
      id, taskId, projectId, input.actionType, 'not_started', adminId, now, now, input.instruction,
    ])
    const action = actionOf(app, id)!
    // The first line of the action's history has no "from": it begins here.
    app.db.run('INSERT INTO project_action_transitions (action_id, from_status, to_status, revision, actor_type, actor_id, created_at) VALUES (?, NULL, ?, 0, ?, ?, ?)', [id, 'not_started', 'admin', adminId, now])
    app.db.run('UPDATE client_projects SET updated_at = ? WHERE id = ?', [now, projectId])
    app.db.run('UPDATE project_tasks SET revision = revision + 1, updated_at = ?, updated_by = ? WHERE id = ?', [now, adminId, taskId])
    const eventId = recordProjectEvent(app, { projectId, type: 'action_assigned', adminId, taskId, actionId: id, subject: task.title, to: 'not_started', visibility: 'customer' })
    if (workSettings(app).actionAssigned) tell(app, project, 'client_action_assigned', eventId)
    return action
  })
}

/** Reword what the customer is asked, while they have not answered it (before the first response, or after a request for changes). */
export function editInstruction(app: AppContext, adminId: string, projectId: string, actionId: string, input: { actionType?: ActionType; instruction?: string }): ActionRow {
  return app.db.transaction(() => {
    const action = actionIn(app, projectId, actionId)
    if (!AWAITING_RESPONSE.includes(action.status)) throw refuse('The customer action can only be reworded while the customer has not answered it.', 'invalid_transition')
    const now = iso(app.clock.now())
    app.db.run('UPDATE project_customer_actions SET action_type = ?, instruction = ?, updated_at = ? WHERE id = ?', [input.actionType ?? action.action_type, input.instruction ?? action.instruction, now, actionId])
    const task = getTask(app, action.task_id)
    recordProjectEvent(app, { projectId, type: 'task_edited', adminId, taskId: action.task_id, actionId, subject: task?.title ?? null, visibility: 'internal', note: 'action' })
    return actionOf(app, actionId)!
  })
}

export function startReview(app: AppContext, adminId: string, projectId: string, actionId: string, internalNote: string | null): ActionRow {
  return app.db.transaction(() => {
    ownerMove(app, adminId, actionIn(app, projectId, actionId), 'under_review', 'action_under_review', { internal: internalNote })
    return actionOf(app, actionId)!
  })
}

/**
 * Accepts the customer's response. The task is NOT completed by it unless the owner says so (`completeTask`): the work and the customer's part of it are two records, and
 * completing is one more decision, taken here only on request and refused as any completion is (a dependency still open refuses the whole acceptance).
 */
export function acceptAction(app: AppContext, adminId: string, projectId: string, actionId: string, input: { customerNote: string | null; internalNote: string | null; completeTask: boolean }): ActionRow {
  return app.db.transaction(() => {
    const action = actionIn(app, projectId, actionId)
    const project = getProject(app, projectId)!
    const { eventId, task } = ownerMove(app, adminId, action, 'accepted', 'action_accepted', { customer: input.customerNote, internal: input.internalNote })
    if (task.status === 'waiting_customer') followTask(app, task, 'in_progress')
    if (input.completeTask) moveTask(app, adminId, projectId, task.id, 'completed')
    if (task.customer_visible === 1 && workSettings(app).responseReviewed) tell(app, project, 'client_action_reviewed', eventId)
    return actionOf(app, actionId)!
  })
}

/** Asks the customer to change their response. The words for the customer are REQUIRED (the customer must be able to see what to change); the owner's own note is separate and private. */
export function requestChanges(app: AppContext, adminId: string, projectId: string, actionId: string, input: { customerNote: string; internalNote: string | null }): ActionRow {
  return app.db.transaction(() => {
    const action = actionIn(app, projectId, actionId)
    const project = getProject(app, projectId)!
    const { eventId, task } = ownerMove(app, adminId, action, 'changes_requested', 'action_changes_requested', { customer: input.customerNote, internal: input.internalNote })
    if (task.status === 'in_review') followTask(app, task, 'waiting_customer')
    if (task.customer_visible === 1 && workSettings(app).changesRequested) tell(app, project, 'client_action_changes_requested', eventId)
    return actionOf(app, actionId)!
  })
}

export function cancelAction(app: AppContext, adminId: string, projectId: string, actionId: string, internalNote: string | null): ActionRow {
  return app.db.transaction(() => {
    const action = actionIn(app, projectId, actionId)
    if (!canMoveAction(action.status, 'cancelled')) throw refuse(`A customer action that is "${action.status}" cannot be cancelled.`, 'invalid_transition')
    cancelActionOf(app, adminId, action, internalNote ?? 'Cancelled by the administration.')
    return actionOf(app, actionId)!
  })
}

/**
 * Where a task goes by itself because of an action: it was waiting for the customer and the customer answered (so it is back in the owner's hands), or it was being
 * reviewed and the owner asked for changes (so it waits for the customer again). It is a line of the task's history like any other move, written by the system; it
 * goes round the dependency rule on purpose (a customer's answer never fails because of the owner's own plan).
 */
function followTask(app: Pick<AppContext, 'db' | 'clock'>, task: TaskRow, to: TaskRow['status']): void {
  if (task.status === to || FINISHED_TASK.includes(task.status)) return
  const now = iso(app.clock.now())
  const result = app.db.run('UPDATE project_tasks SET status = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND status = ?', [to, now, task.id, task.status])
  if (result.changes !== 1) return
  recordProjectEvent(app, { projectId: task.project_id, type: 'task_status_changed', adminId: null, actor: 'system', taskId: task.id, subject: task.title, from: task.status, to, visibility: task.customer_visible === 1 ? 'customer' : 'internal' })
}

// ---- the customer ------------------------------------------------------------------------------------------------------------------------

export interface ResponseResult {
  revision: number
}

/**
 * A customer's answer. The customer is whoever owns the project (the session decided that; nothing in the request names a customer) and the task must be one they
 * can see, so a reference that belongs to someone else, to a hidden task or to no task at all answers the same "not found". The move is one conditional update: a double
 * click, a second tab or a retried request finds the action already submitted and changes nothing a second time.
 */
export function respondToAction(app: AppContext, customerId: string, projectReference: string, taskReference: string, response: string): ResponseResult {
  return app.db.transaction(() => {
    const found = app.db.get<{ task_id: string; action_id: string }>(
      `SELECT t.id AS task_id, a.id AS action_id FROM project_tasks t
       JOIN client_projects p ON p.id = t.project_id JOIN project_customer_actions a ON a.task_id = t.id
       WHERE p.reference = ? AND t.reference = ? AND p.customer_id = ? AND t.customer_visible = 1`,
      [projectReference, taskReference, customerId],
    )
    if (!found) throw notFound('The task')
    const action = actionOf(app, found.action_id)!
    const task = getTask(app, found.task_id)!
    const project = getProject(app, action.project_id) as ProjectRow
    if (!AWAITING_RESPONSE.includes(action.status)) throw refuse('This request does not need an answer right now.', 'not_awaiting_response')
    if (FINISHED_TASK.includes(task.status) || TERMINAL_STATUSES.includes(project.status)) throw refuse('This request is closed.', 'task_finished')
    const now = iso(app.clock.now())
    const revision = action.revision + 1
    const moved = app.db.run("UPDATE project_customer_actions SET status = 'submitted', revision = ?, submitted_at = ?, updated_at = ? WHERE id = ? AND status = ? AND revision = ?", [revision, now, now, action.id, action.status, action.revision])
    if (moved.changes !== 1) throw refuse('This request does not need an answer right now.', 'not_awaiting_response')
    app.db.run('INSERT INTO project_action_submissions (id, action_id, revision, response, customer_id, submitted_at) VALUES (?, ?, ?, ?, ?, ?)', [newId(), action.id, revision, response, customerId, now])
    transition(app, action, 'submitted', { type: 'customer', id: customerId }, {}, revision)
    app.db.run('UPDATE client_projects SET updated_at = ? WHERE id = ?', [now, project.id])
    const eventId = recordProjectEvent(app, { projectId: project.id, type: 'action_submitted', adminId: null, actor: 'customer', actorId: customerId, taskId: task.id, actionId: action.id, subject: task.title, from: action.status, to: 'submitted', visibility: 'customer' })
    if (task.status === 'waiting_customer') followTask(app, task, 'in_review')
    const to = app.config.email.notifyTo
    if (to && workSettings(app).responseSubmitted) queueClientMail(app, { kind: 'client_action_submitted_admin', relatedType: 'client_project_event', relatedId: String(eventId), recipient: to, language: app.config.email.notifyLanguage })
    return { revision }
  })
}

// ---- reading (the owner's view: everything) -------------------------------------------------------------------------------------------

export interface ActionAdminView extends ActionRow {
  submissions: Array<{ revision: number; response: string; submittedAt: string; customerId: string | null }>
  transitions: Array<{ id: number; from: ActionStatus | null; to: ActionStatus; revision: number; actor: 'admin' | 'customer' | 'system'; actorEmail: string | null; customerNote: string | null; internalNote: string | null; at: string }>
  awaiting: 'customer' | 'owner' | null
  allowed: readonly ActionStatus[]
}

export function actionAdminView(app: Pick<AppContext, 'db'>, action: ActionRow): ActionAdminView {
  const submissions = app.db.all<{ revision: number; response: string; submitted_at: string; customer_id: string | null }>('SELECT revision, response, submitted_at, customer_id FROM project_action_submissions WHERE action_id = ? ORDER BY revision', [action.id])
  const transitions = app.db.all<{ id: number; from_status: ActionStatus | null; to_status: ActionStatus; revision: number; actor_type: 'admin' | 'customer' | 'system'; email: string | null; customer_note: string | null; internal_note: string | null; created_at: string }>(
    `SELECT x.id, x.from_status, x.to_status, x.revision, x.actor_type, u.email, x.customer_note, x.internal_note, x.created_at
     FROM project_action_transitions x LEFT JOIN admin_users u ON x.actor_type = 'admin' AND u.id = x.actor_id WHERE x.action_id = ? ORDER BY x.id`,
    [action.id],
  )
  return {
    ...action,
    submissions: submissions.map((entry) => ({ revision: entry.revision, response: entry.response, submittedAt: entry.submitted_at, customerId: entry.customer_id })),
    transitions: transitions.map((entry) => ({ id: entry.id, from: entry.from_status, to: entry.to_status, revision: entry.revision, actor: entry.actor_type, actorEmail: entry.email, customerNote: entry.customer_note, internalNote: entry.internal_note, at: entry.created_at })),
    awaiting: AWAITING_RESPONSE.includes(action.status) ? 'customer' : AWAITING_REVIEW.includes(action.status) ? 'owner' : null,
    allowed: ACTION_TRANSITIONS[action.status].filter((to) => to !== 'submitted'),
  }
}

export const isOpenAction = (status: ActionStatus): boolean => OPEN_ACTION.includes(status)
