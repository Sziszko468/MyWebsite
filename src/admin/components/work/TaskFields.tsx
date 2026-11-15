import { TASK_PRIORITIES, TASK_STATUSES, type Category, type Task, type TaskInput, type TaskPriority, type TaskStatus, type WorkMilestone } from '../../api/work'
import { useInterfaceLanguage, useText } from '../../i18n'
import styles from '../../styles/ui.module.scss'
import { CheckField, SelectField, TextAreaField, TextField } from '../form'

/** The fields of a task, shared by the form that makes one and the form that edits one. What the customer will see is said next to the fields that decide it. */

export interface TaskDraft {
  title: string
  description: string
  customerDescription: string
  status: TaskStatus
  priority: TaskPriority
  categoryId: string
  milestoneId: string
  startOn: string
  dueOn: string
  assignedTo: string
  customerVisible: boolean
}

export const EMPTY_DRAFT: TaskDraft = { title: '', description: '', customerDescription: '', status: 'backlog', priority: 'normal', categoryId: '', milestoneId: '', startOn: '', dueOn: '', assignedTo: '', customerVisible: false }

export const draftOf = (task: Task): TaskDraft => ({
  title: task.title,
  description: task.description,
  customerDescription: task.customer_description,
  status: task.status,
  priority: task.priority,
  categoryId: task.category_id ?? '',
  milestoneId: task.milestone_id ?? '',
  startOn: task.start_on ?? '',
  dueOn: task.due_on ?? '',
  assignedTo: task.assigned_to ?? '',
  customerVisible: task.customer_visible === 1,
})

/** What is sent: an empty choice is `null` (clear it), never a blank string. */
export const inputOf = (draft: TaskDraft, withStatus: boolean): TaskInput => ({
  title: draft.title.trim(),
  description: draft.description.trim(),
  customerDescription: draft.customerDescription.trim(),
  ...(withStatus ? { status: draft.status } : {}),
  priority: draft.priority,
  categoryId: draft.categoryId || null,
  milestoneId: draft.milestoneId || null,
  startOn: draft.startOn || null,
  dueOn: draft.dueOn || null,
  assignedTo: draft.assignedTo || null,
  customerVisible: draft.customerVisible,
})

export function TaskFields({
  draft,
  onChange,
  errors,
  categories,
  milestones,
  assignees,
  withStatus,
  keepShared,
}: {
  draft: TaskDraft
  onChange: (draft: TaskDraft) => void
  errors: Record<string, string>
  categories: Category[]
  milestones: Array<Pick<WorkMilestone, 'id' | 'title'>>
  assignees: Array<{ id: string; email: string }>
  withStatus: boolean
  /** The task has an open customer action: it cannot be hidden. */
  keepShared?: boolean
}) {
  const t = useText().work
  const language = useInterfaceLanguage()
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => onChange({ ...draft, [key]: value })
  return (
    <div className={styles.stack}>
      <TextField label={t.form.title} value={draft.title} maxLength={160} required error={errors.title} onChange={(event) => set('title', event.target.value)} />
      <TextAreaField label={t.form.description} hint={t.form.descriptionHint} optional rows={4} maxLength={4000} value={draft.description} error={errors.description} onChange={(event) => set('description', event.target.value)} />
      <TextAreaField label={t.form.customerDescription} hint={t.form.customerDescriptionHint} optional rows={3} maxLength={2000} value={draft.customerDescription} error={errors.customerDescription} onChange={(event) => set('customerDescription', event.target.value)} />
      <div className={styles.formGrid}>
        {withStatus && <SelectField label={t.form.status} value={draft.status} onChange={(event) => set('status', event.target.value as TaskStatus)} options={TASK_STATUSES.filter((status) => status !== 'completed' && status !== 'cancelled').map((value) => ({ value, label: t.statuses[value] }))} />}
        <SelectField label={t.form.priority} value={draft.priority} onChange={(event) => set('priority', event.target.value as TaskPriority)} options={TASK_PRIORITIES.map((value) => ({ value, label: t.priorities[value] }))} />
        <SelectField
          label={t.form.category}
          value={draft.categoryId}
          error={errors.categoryId}
          onChange={(event) => set('categoryId', event.target.value)}
          options={[{ value: '', label: t.form.none }, ...categories.filter((category) => category.enabled || category.id === draft.categoryId).map((category) => ({ value: category.id, label: category.names[language] }))]}
        />
        <SelectField label={t.form.milestone} value={draft.milestoneId} error={errors.milestoneId} onChange={(event) => set('milestoneId', event.target.value)} options={[{ value: '', label: t.form.none }, ...milestones.map((milestone) => ({ value: milestone.id, label: milestone.title }))]} />
        <TextField label={t.form.start} type="date" optional value={draft.startOn} error={errors.startOn} onChange={(event) => set('startOn', event.target.value)} />
        <TextField label={t.form.due} type="date" optional value={draft.dueOn} error={errors.dueOn} onChange={(event) => set('dueOn', event.target.value)} />
        <SelectField label={t.form.assignee} value={draft.assignedTo} error={errors.assignedTo} onChange={(event) => set('assignedTo', event.target.value)} options={[{ value: '', label: t.form.nobody }, ...assignees.map((user) => ({ value: user.id, label: user.email }))]} />
      </div>
      <CheckField label={t.form.share} hint={keepShared ? t.form.actionOpen : t.form.shareHint} checked={draft.customerVisible} disabled={keepShared} onChange={(checked) => set('customerVisible', checked)} />
    </div>
  )
}
