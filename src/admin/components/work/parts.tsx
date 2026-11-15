import { cx } from '../../../utils/cx'
import type { InterfaceLanguage } from '../../api/types'
import type { ActionStatus, MilestoneStatus, Task, TaskPriority, TaskStatus } from '../../api/work'
import styles from '../../styles/ui.module.scss'

/** Small things the work's screens share: a badge with a word and a dot, a calendar day as a person reads it, the refusal a server gave in words. */

type Tone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'neutral'

const TONE_CLASS: Record<Tone, string> = {
  accent: styles.toneAccent,
  info: styles.toneInfo,
  success: styles.toneSuccess,
  warning: styles.toneWarning,
  danger: styles.toneDanger,
  neutral: styles.toneNeutral,
}

export const TASK_TONE: Record<TaskStatus, Tone> = { backlog: 'neutral', planned: 'info', in_progress: 'info', in_review: 'warning', waiting_customer: 'warning', blocked: 'danger', completed: 'success', cancelled: 'neutral' }
export const PRIORITY_TONE: Record<TaskPriority, Tone> = { low: 'neutral', normal: 'neutral', high: 'warning', urgent: 'danger' }
export const ACTION_TONE: Record<ActionStatus, Tone> = { not_started: 'warning', submitted: 'accent', under_review: 'info', changes_requested: 'warning', accepted: 'success', cancelled: 'neutral' }
export const MILESTONE_TONE: Record<MilestoneStatus, Tone> = { upcoming: 'neutral', in_progress: 'info', completed: 'success', delayed: 'warning', cancelled: 'neutral' }

/** A word with a dot: the word carries the meaning, the colour is only a quick scan. */
export function Tag({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span className={cx(styles.badge, TONE_CLASS[tone])}>
      <span className={styles.badgeDot} aria-hidden="true" />
      {children}
    </span>
  )
}

const LOCALE: Record<InterfaceLanguage, string> = { hu: 'hu-HU', en: 'en-GB' }

/** A calendar day (`2026-11-05`) as a person reads it. A day has no zone, so it is formatted in UTC, which cannot shift it. */
export function dayText(day: string | null | undefined, language: InterfaceLanguage): string {
  if (!day) return '—'
  const date = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(LOCALE[language], { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

export const taskPath = (projectId: string, taskId: string): string => `/client-projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`

/** The tasks that need the owner's eyes: an answer waits for review. */
export const needsReview = (task: Task): boolean => task.action?.status === 'submitted' || task.action?.status === 'under_review'
