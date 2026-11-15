import type { AppContext } from '../../context.ts'
import { queueClientMail } from '../customers/mail.ts'
import { daysBetween, todayKey, workSettings } from './settings.ts'

/**
 * Reminders about the customer actions that wait for the customer: one "due soon" message when the date is near, and, only when the owner has switched it on, one
 * "overdue" message when it has passed. Both are decided by the day in the owner's zone (settings.ts), run with the daily maintenance, and are idempotent by
 * construction: a reminder is about ONE action on ONE date (`related_id` is `<action id>:<due date>`), the outbox allows one of each kind for it, and the pass looks
 * before it queues, so running it twice in a day, restarting the server or running it by hand makes no second message. A date that moves is a new date and gets its own.
 *
 * Nothing is sent for a task the customer cannot see, a task that is finished, an action that was answered, a project that is on hold, finished or cancelled, or a
 * customer who was switched off. A message that was queued and whose reason went away before it was sent is cancelled by the renderer (customers/mail.ts).
 */

export interface ReminderResult {
  dueSoon: number
  overdue: number
}

export function runWorkReminders(app: AppContext): ReminderResult {
  const settings = workSettings(app)
  const result: ReminderResult = { dueSoon: 0, overdue: 0 }
  if (!settings.actionDueSoon && !settings.actionOverdue) return result
  const today = todayKey(app)
  const rows = app.db.all<{ action_id: string; due_on: string; email: string; language: 'hu' | 'en' | 'nl' }>(
    `SELECT a.id AS action_id, t.due_on, c.email, c.language
     FROM project_customer_actions a JOIN project_tasks t ON t.id = a.task_id JOIN client_projects p ON p.id = a.project_id JOIN customers c ON c.id = p.customer_id
     WHERE a.status IN ('not_started', 'changes_requested') AND t.customer_visible = 1 AND t.status NOT IN ('completed', 'cancelled') AND t.due_on IS NOT NULL
       AND p.status NOT IN ('completed', 'cancelled', 'on_hold') AND c.status <> 'disabled'`,
  )
  for (const row of rows) {
    const days = daysBetween(today, row.due_on)
    const kind = days < 0 ? (settings.actionOverdue ? 'client_action_overdue' : null) : days <= settings.dueSoonDays ? (settings.actionDueSoon ? 'client_action_due_soon' : null) : null
    if (!kind) continue
    const relatedId = `${row.action_id}:${row.due_on}`
    if (app.db.get('SELECT 1 FROM email_deliveries WHERE related_type = ? AND related_id = ? AND kind = ?', ['client_action_reminder', relatedId, kind])) continue
    if (queueClientMail(app, { kind, relatedType: 'client_action_reminder', relatedId, recipient: row.email, language: row.language })) {
      if (kind === 'client_action_overdue') result.overdue += 1
      else result.dueSoon += 1
    }
  }
  return result
}
