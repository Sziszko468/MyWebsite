import type { Language } from '../../config.ts'

/**
 * The vocabulary of the project work (PROMPT 26): what a task, a customer action and a milestone can be, and which moves between statuses are allowed. The lists
 * are the ones in `0013_project_management.sql`; a test reads both and fails when they drift. The rules are documented in docs/project-management/TASK_WORKFLOW.md.
 */

// ---- tasks -----------------------------------------------------------------------------------------------------------------------------

export const TASK_STATUSES = ['backlog', 'planned', 'in_progress', 'in_review', 'waiting_customer', 'blocked', 'completed', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]
export const isTaskStatus = (value: unknown): value is TaskStatus => typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value)

export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

/** Finished, one way or the other. */
export const FINISHED_TASK: readonly TaskStatus[] = ['completed', 'cancelled']
/** A task in one of these does not hold up the tasks that depend on it. */
export const RESOLVED_TASK: readonly TaskStatus[] = ['completed', 'cancelled']
/** A task cannot be moved to one of these while something it depends on is still open. */
export const NEEDS_PREDECESSORS: readonly TaskStatus[] = ['in_progress', 'in_review', 'completed']

/**
 * Which status may follow which. An open task may go to any other status; a completed task can be reopened (to planned, in progress or in review) and a cancelled one
 * reinstated (to backlog or planned); nothing moves to the status it has. The rules that depend on other records (a task that waits for a dependency, a task with a
 * customer action still open) are checked next to this one, in tasks.ts.
 */
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  backlog: ['planned', 'in_progress', 'in_review', 'waiting_customer', 'blocked', 'completed', 'cancelled'],
  planned: ['backlog', 'in_progress', 'in_review', 'waiting_customer', 'blocked', 'completed', 'cancelled'],
  in_progress: ['backlog', 'planned', 'in_review', 'waiting_customer', 'blocked', 'completed', 'cancelled'],
  in_review: ['backlog', 'planned', 'in_progress', 'waiting_customer', 'blocked', 'completed', 'cancelled'],
  waiting_customer: ['backlog', 'planned', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled'],
  blocked: ['backlog', 'planned', 'in_progress', 'in_review', 'waiting_customer', 'completed', 'cancelled'],
  completed: ['planned', 'in_progress', 'in_review'],
  cancelled: ['backlog', 'planned'],
}
export const canMoveTask = (from: TaskStatus, to: TaskStatus): boolean => TASK_TRANSITIONS[from].includes(to)

export interface TaskRow {
  id: string
  reference: string
  project_id: string
  title: string
  description: string
  customer_description: string
  status: TaskStatus
  priority: TaskPriority
  category_id: string | null
  milestone_id: string | null
  start_on: string | null
  due_on: string | null
  completed_at: string | null
  assigned_to: string | null
  customer_visible: 0 | 1
  sort_order: number
  revision: number
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

// ---- customer actions ------------------------------------------------------------------------------------------------------------------

export const ACTION_TYPES = ['provide_content', 'answer_question', 'confirm_direction', 'review_deliverable', 'approve_stage', 'other'] as const
export type ActionType = (typeof ACTION_TYPES)[number]

export const ACTION_STATUSES = ['not_started', 'submitted', 'under_review', 'changes_requested', 'accepted', 'cancelled'] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]

/** The statuses in which the customer is the one who has to do something. */
export const AWAITING_RESPONSE: readonly ActionStatus[] = ['not_started', 'changes_requested']
/** The statuses in which the owner is the one who has to do something. */
export const AWAITING_REVIEW: readonly ActionStatus[] = ['submitted', 'under_review']
export const OPEN_ACTION: readonly ActionStatus[] = ['not_started', 'submitted', 'under_review', 'changes_requested']

/**
 * The life of an action. The customer's only move is to respond (`not_started` or `changes_requested` → `submitted`); everything else is the owner's: pick it up
 * (`under_review`), accept it, ask for changes (with words for the customer), or cancel it. `accepted` and `cancelled` are final.
 */
export const ACTION_TRANSITIONS: Readonly<Record<ActionStatus, readonly ActionStatus[]>> = {
  not_started: ['submitted', 'cancelled'],
  submitted: ['under_review', 'accepted', 'changes_requested', 'cancelled'],
  under_review: ['accepted', 'changes_requested', 'cancelled'],
  changes_requested: ['submitted', 'cancelled'],
  accepted: [],
  cancelled: [],
}
export const canMoveAction = (from: ActionStatus, to: ActionStatus): boolean => ACTION_TRANSITIONS[from].includes(to)

export interface ActionRow {
  id: string
  task_id: string
  project_id: string
  action_type: ActionType
  instruction: string
  status: ActionStatus
  revision: number
  submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ---- milestones ------------------------------------------------------------------------------------------------------------------------

export const MILESTONE_STATUSES = ['upcoming', 'in_progress', 'completed', 'delayed', 'cancelled'] as const
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

// ---- the owner's choices -----------------------------------------------------------------------------------------------------------------

/** What the owner has switched on. Written to `settings`; every default is the quiet choice: nothing is e-mailed that was not asked for. */
export interface ProjectWorkSettings {
  /** The customer is told when an action is given to them. */
  actionAssigned: boolean
  /** …when its date is near (`dueSoonDays` before). */
  actionDueSoon: boolean
  /** …when its date has passed. OFF unless the owner wants it: a reminder that a date was missed is a decision. */
  actionOverdue: boolean
  /** The owner is told when a customer responds. */
  responseSubmitted: boolean
  /** The customer is told that their response was accepted. */
  responseReviewed: boolean
  /** …and when changes are requested. */
  changesRequested: boolean
  /** The customer is told when a milestone they can see is completed. OFF unless the owner wants it: completing a milestone has always been silent, and stays so until it is switched on. */
  milestoneCompleted: boolean
  /** The customer is told of an important change of the PROJECT's status (the choice per change stays with the owner). */
  statusChanged: boolean
  /** How many days before the date a "due soon" reminder is sent. */
  dueSoonDays: number
}

export const DEFAULT_WORK_SETTINGS: ProjectWorkSettings = {
  actionAssigned: true,
  actionDueSoon: true,
  actionOverdue: false,
  responseSubmitted: true,
  responseReviewed: true,
  changesRequested: true,
  milestoneCompleted: false,
  statusChanged: true,
  dueSoonDays: 3,
}
export const WORK_SETTINGS_KEY = 'projectwork.settings'

export const LANGUAGE_LIST: readonly Language[] = ['hu', 'en', 'nl']

/** Limits on what the owner and the customer may write (the server enforces them; a screen's counters repeat them). */
export const LIMITS = { title: 160, description: 4000, customerDescription: 2000, instruction: 2000, response: 5000, note: 1000, category: 60, bulk: 100 } as const
