import type { MilestoneStatus, ProjectEventType, TaskStatus } from '../../portal/api'
import type { PortalWords } from '../../portal/text'
import { fill } from '../../utils/format'

/** The line a timeline or an activity list writes for one event, in the customer's language. */
export function eventText(entry: { type: ProjectEventType; toStatus: string | null; milestone: string | null; subject: string | null }, words: PortalWords): string {
  const title = entry.subject ?? entry.milestone
  const named = (text: string, status = '') => fill(text, { title: title ?? words.work.events.taskUnknown, status })
  const taskStatus = (status: string | null) => (status && status in words.work.tasks.status ? words.work.tasks.status[status as TaskStatus] : '')
  switch (entry.type) {
    case 'status_changed':
      return fill(words.events.status_changed, { status: entry.toStatus && entry.toStatus in words.status ? words.status[entry.toStatus as keyof typeof words.status] : '' })
    case 'milestone_added':
      return fill(words.events.milestone_added, { title: title ?? words.events.milestoneUnknown })
    case 'milestone_completed':
      return fill(words.events.milestone_completed, { title: title ?? words.events.milestoneUnknown })
    case 'milestone_status_changed':
      return fill(words.work.events.milestone_status_changed, { title: title ?? words.events.milestoneUnknown, status: entry.toStatus && entry.toStatus in words.work.milestones.status ? words.work.milestones.status[entry.toStatus as MilestoneStatus] : '' })
    case 'task_status_changed':
      return named(words.work.events.task_status_changed, taskStatus(entry.toStatus))
    case 'created':
    case 'dates_changed':
    case 'document_published':
    case 'feedback_requested':
    case 'update_posted':
      return words.events[entry.type]
    default:
      return named(words.work.events[entry.type])
  }
}
