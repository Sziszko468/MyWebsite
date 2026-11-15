import type { Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { notFound } from '../../http/errors.ts'
import { TERMINAL_STATUSES } from '../customers/model.ts'
import {
  AWAITING_RESPONSE,
  FINISHED_TASK,
  type ActionRow,
  type ActionStatus,
  type ActionType,
  type TaskRow,
  type TaskStatus,
} from './model.ts'
import { progressOf, type Progress } from './progress.ts'
import { todayKey } from './settings.ts'

/**
 * What a customer sees of the work on their project. Everything here starts from a project the SESSION'S customer owns and from tasks the owner has SHARED, and it is
 * built field by field: a task's `description`, its priority, its assignee, its tracker notes, an action's internal review notes and every task or milestone the owner
 * has not shared are not selected, so they cannot be returned by a mistake further on. Nothing in a request names a customer.
 */

export interface PortalTask {
  reference: string
  title: string
  /** The words the owner wrote for the customer (`customer_description`), never the internal description. */
  description: string
  status: TaskStatus
  startOn: string | null
  dueOn: string | null
  completedAt: string | null
  overdue: boolean
  category: Record<Language, string> | null
  milestone: { title: string } | null
  /** The shared tasks this one still waits for. A task the owner has not shared is not named. */
  waitingFor: Array<{ reference: string; title: string }>
  action: PortalAction | null
}

export interface PortalAction {
  type: ActionType
  instruction: string
  status: ActionStatus
  /** Who has to move it: `you` (answer it), `us` (it is being looked at), or nobody (it is finished). */
  awaiting: 'you' | 'us' | null
  /** The customer may send an answer now. */
  canRespond: boolean
  revision: number
  /** The latest request for changes, in the words the owner wrote for the customer. */
  changesRequested: string | null
}

export interface PortalWork {
  progress: Progress
  tasks: PortalTask[]
}

export interface PortalSubmission {
  revision: number
  response: string
  submittedAt: string
}

export interface PortalTaskDetail extends PortalTask {
  submissions: PortalSubmission[]
  /** What happened to the action, with the words for the customer only. */
  history: Array<{ at: string; to: ActionStatus; by: 'you' | 'us'; note: string | null }>
}

/** The project of THIS customer, by its reference. Anything else (another customer's, none) is the same "not found". */
function ownProject(app: Pick<AppContext, 'db'>, customerId: string, reference: string): { id: string; status: string } {
  const project = app.db.get<{ id: string; status: string }>('SELECT id, status FROM client_projects WHERE reference = ? AND customer_id = ?', [reference, customerId])
  if (!project) throw notFound('The project')
  return project
}

function build(app: Pick<AppContext, 'db' | 'clock'>, rows: Array<TaskRow & { milestone_title: string | null }>, projectClosed: boolean): PortalTask[] {
  if (rows.length === 0) return []
  const today = todayKey(app)
  const marks = rows.map(() => '?').join(', ')
  const ids = rows.map((row) => row.id)
  const actions = app.db.all<ActionRow>(`SELECT * FROM project_customer_actions WHERE task_id IN (${marks})`, ids)
  // Only the words written FOR the customer are selected; `internal_note` is not in the query.
  const notes = actions.length
    ? app.db.all<{ action_id: string; customer_note: string | null }>(`SELECT action_id, customer_note FROM project_action_transitions WHERE to_status = 'changes_requested' AND action_id IN (${actions.map(() => '?').join(', ')}) ORDER BY id`, actions.map((action) => action.id))
    : []
  const waiting = app.db.all<{ task_id: string; reference: string; title: string }>(
    `SELECT d.task_id, t.reference, t.title FROM project_task_dependencies d JOIN project_tasks t ON t.id = d.depends_on_id
     WHERE d.task_id IN (${marks}) AND t.customer_visible = 1 AND t.status NOT IN ('completed', 'cancelled') ORDER BY t.sort_order`,
    ids,
  )
  const names = app.db.all<{ category_id: string; language: Language; name: string }>('SELECT category_id, language, name FROM task_category_names')
  return rows.map((task) => {
    const action = actions.find((entry) => entry.task_id === task.id)
    const finished = FINISHED_TASK.includes(task.status)
    const own = task.category_id ? names.filter((entry) => entry.category_id === task.category_id) : []
    const pick = (lang: Language): string => own.find((entry) => entry.language === lang)?.name ?? own.find((entry) => entry.language === 'en')?.name ?? ''
    let view: PortalAction | null = null
    if (action) {
      const open = !finished && !projectClosed
      const awaitingYou = AWAITING_RESPONSE.includes(action.status)
      view = {
        type: action.action_type,
        instruction: action.instruction,
        status: action.status,
        awaiting: action.status === 'accepted' || action.status === 'cancelled' ? null : awaitingYou ? 'you' : 'us',
        canRespond: open && awaitingYou,
        revision: action.revision,
        changesRequested: action.status === 'changes_requested' ? ([...notes].reverse().find((entry) => entry.action_id === action.id)?.customer_note ?? null) : null,
      }
    }
    return {
      reference: task.reference,
      title: task.title,
      description: task.customer_description,
      status: task.status,
      startOn: task.start_on,
      dueOn: task.due_on,
      completedAt: task.completed_at,
      overdue: !finished && task.due_on !== null && task.due_on < today,
      category: own.length > 0 ? { hu: pick('hu'), en: pick('en'), nl: pick('nl') } : null,
      milestone: task.milestone_title ? { title: task.milestone_title } : null,
      waitingFor: waiting.filter((entry) => entry.task_id === task.id).map((entry) => ({ reference: entry.reference, title: entry.title })),
      action: view,
    }
  })
}

const TASK_SELECT = `SELECT t.*, CASE WHEN m.customer_visible = 1 THEN m.title END AS milestone_title FROM project_tasks t LEFT JOIN client_milestones m ON m.id = t.milestone_id`

export function portalWork(app: Pick<AppContext, 'db' | 'clock'>, customerId: string, projectReference: string): PortalWork {
  const project = ownProject(app, customerId, projectReference)
  const rows = app.db.all<TaskRow & { milestone_title: string | null }>(`${TASK_SELECT} WHERE t.project_id = ? AND t.customer_visible = 1 ORDER BY t.sort_order, t.created_at`, [project.id])
  return { progress: progressOf(app, project.id, 'customer'), tasks: build(app, rows, TERMINAL_STATUSES.includes(project.status as never)) }
}

export function portalTask(app: Pick<AppContext, 'db' | 'clock'>, customerId: string, projectReference: string, taskReference: string): PortalTaskDetail {
  const project = ownProject(app, customerId, projectReference)
  const row = app.db.get<TaskRow & { milestone_title: string | null }>(`${TASK_SELECT} WHERE t.project_id = ? AND t.reference = ? AND t.customer_visible = 1`, [project.id, taskReference])
  if (!row) throw notFound('The task')
  const [task] = build(app, [row], TERMINAL_STATUSES.includes(project.status as never))
  const action = app.db.get<{ id: string }>('SELECT id FROM project_customer_actions WHERE task_id = ?', [row.id])
  const submissions = action ? app.db.all<{ revision: number; response: string; submitted_at: string }>('SELECT revision, response, submitted_at FROM project_action_submissions WHERE action_id = ? ORDER BY revision', [action.id]) : []
  // The history is read column by column: `internal_note` is not in the query.
  const history = action
    ? app.db.all<{ created_at: string; to_status: ActionStatus; actor_type: string; customer_note: string | null }>('SELECT created_at, to_status, actor_type, customer_note FROM project_action_transitions WHERE action_id = ? ORDER BY id', [action.id])
    : []
  return {
    ...task!,
    submissions: submissions.map((entry) => ({ revision: entry.revision, response: entry.response, submittedAt: entry.submitted_at })),
    history: history.map((entry) => ({ at: entry.created_at, to: entry.to_status, by: entry.actor_type === 'customer' ? 'you' : 'us', note: entry.customer_note })),
  }
}

/** The customer's open requests across all their projects, most urgent first (the overview's "needs you"). */
export function openRequests(app: Pick<AppContext, 'db' | 'clock'>, customerId: string): Array<{ project: { reference: string; name: string }; task: { reference: string; title: string }; status: ActionStatus; dueOn: string | null; overdue: boolean }> {
  const today = todayKey(app)
  const rows = app.db.all<{ pref: string; pname: string; tref: string; title: string; status: ActionStatus; due_on: string | null }>(
    `SELECT p.reference AS pref, p.name AS pname, t.reference AS tref, t.title, a.status, t.due_on
     FROM project_customer_actions a JOIN project_tasks t ON t.id = a.task_id JOIN client_projects p ON p.id = a.project_id
     WHERE p.customer_id = ? AND t.customer_visible = 1 AND a.status IN ('not_started', 'changes_requested') AND t.status NOT IN ('completed', 'cancelled')
       AND p.status NOT IN (${TERMINAL_STATUSES.map(() => '?').join(', ')})
     ORDER BY (t.due_on IS NULL), t.due_on, a.created_at LIMIT 20`,
    [customerId, ...TERMINAL_STATUSES],
  )
  return rows.map((row) => ({ project: { reference: row.pref, name: row.pname }, task: { reference: row.tref, title: row.title }, status: row.status, dueOn: row.due_on, overdue: row.due_on !== null && row.due_on < today }))
}

/** The shared tasks that are due soon, for the overview's calendar of what is coming. */
export function upcomingTasks(app: Pick<AppContext, 'db' | 'clock'>, customerId: string): Array<{ project: { reference: string; name: string }; title: string; dueOn: string; overdue: boolean }> {
  const today = todayKey(app)
  const rows = app.db.all<{ pref: string; pname: string; title: string; due_on: string }>(
    `SELECT p.reference AS pref, p.name AS pname, t.title, t.due_on FROM project_tasks t JOIN client_projects p ON p.id = t.project_id
     WHERE p.customer_id = ? AND t.customer_visible = 1 AND t.due_on IS NOT NULL AND t.status NOT IN ('completed', 'cancelled') AND p.status NOT IN (${TERMINAL_STATUSES.map(() => '?').join(', ')})
     ORDER BY t.due_on, t.sort_order LIMIT 6`,
    [customerId, ...TERMINAL_STATUSES],
  )
  return rows.map((row) => ({ project: { reference: row.pref, name: row.pname }, title: row.title, dueOn: row.due_on, overdue: row.due_on < today }))
}
