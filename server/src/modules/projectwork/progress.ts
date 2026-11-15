import type { AppContext } from '../../context.ts'
import { todayKey } from './settings.ts'

/**
 * How far a project is, counted from the records and from nothing else. The percentage is `completed ÷ not-cancelled` over the project's TASKS when it has any, over its
 * MILESTONES when it has milestones but no tasks, and `null` ("there is nothing to count yet") when it has neither: a project with no work recorded is not "0 % done", it is
 * not measurable. No endpoint accepts a number from anybody; there is nothing to set. The customer's progress counts only what the customer can see (a hidden task is not
 * in it, so the count cannot be used to find out how many there are); the owner's can be asked either way.
 */

export interface Progress {
  /** A whole number 0 to 100, or `null` when there is nothing to count. */
  percent: number | null
  /** What the percentage was counted from. */
  basis: 'tasks' | 'milestones' | null
  tasks: { total: number; completed: number; open: number; overdue: number }
  milestones: { total: number; completed: number; overdue: number }
  /** The day "overdue" was decided against (the same one the reminders use). */
  today: string
}

export function progressOf(app: Pick<AppContext, 'db' | 'clock'>, projectId: string, scope: 'all' | 'customer', today = todayKey(app)): Progress {
  const visible = scope === 'customer' ? ' AND customer_visible = 1' : ''
  const tasks = app.db.all<{ status: string; due_on: string | null }>(`SELECT status, due_on FROM project_tasks WHERE project_id = ? AND status <> 'cancelled'${visible}`, [projectId])
  const milestones = app.db.all<{ status: string; due_on: string | null }>(`SELECT status, due_on FROM client_milestones WHERE project_id = ? AND status <> 'cancelled'${visible}`, [projectId])
  const taskDone = tasks.filter((task) => task.status === 'completed').length
  const milestoneDone = milestones.filter((milestone) => milestone.status === 'completed').length
  const percent = tasks.length > 0 ? Math.round((100 * taskDone) / tasks.length) : milestones.length > 0 ? Math.round((100 * milestoneDone) / milestones.length) : null
  return {
    percent,
    basis: tasks.length > 0 ? 'tasks' : milestones.length > 0 ? 'milestones' : null,
    tasks: { total: tasks.length, completed: taskDone, open: tasks.length - taskDone, overdue: tasks.filter((task) => task.status !== 'completed' && task.due_on !== null && task.due_on < today).length },
    milestones: { total: milestones.length, completed: milestoneDone, overdue: milestones.filter((milestone) => milestone.status !== 'completed' && milestone.due_on !== null && milestone.due_on < today).length },
    today,
  }
}
