import { del, get, patch, post, put, request } from './client'

/**
 * The project work's side of the administration (server/src/modules/projectwork/routes.ts): the tasks of a client project, what they wait for, the requests made of the
 * customer and the customer's answers, the categories and the choices about what is e-mailed. The server decides every rule (a status move, a dependency, a loop); the
 * screens here only ask and say what came back.
 */

export const TASK_STATUSES = ['backlog', 'planned', 'in_progress', 'in_review', 'waiting_customer', 'blocked', 'completed', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]
export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export const ACTION_TYPES = ['provide_content', 'answer_question', 'confirm_direction', 'review_deliverable', 'approve_stage', 'other'] as const
export type ActionType = (typeof ACTION_TYPES)[number]
export const ACTION_STATUSES = ['not_started', 'submitted', 'under_review', 'changes_requested', 'accepted', 'cancelled'] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]
export const MILESTONE_STATUSES = ['upcoming', 'in_progress', 'completed', 'delayed', 'cancelled'] as const
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]
export type Language = 'hu' | 'en' | 'nl'

export interface Progress {
  percent: number | null
  basis: 'tasks' | 'milestones' | null
  tasks: { total: number; completed: number; open: number; overdue: number }
  milestones: { total: number; completed: number; overdue: number }
  today: string
}

export interface Predecessor {
  id: string
  reference: string
  title: string
  status: TaskStatus
}

export interface TaskAction {
  id: string
  action_type: ActionType
  status: ActionStatus
  revision: number
  submitted_at: string | null
  reviewed_at: string | null
  instruction: string
}

export interface Task {
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
  created_at: string
  updated_at: string
  projectReference: string
  projectName: string
  assigneeEmail: string | null
  overdue: boolean
  blockedBy: Predecessor[]
  dependsOn: string[]
  dependents: string[]
  action: TaskAction | null
  /** Derived, never stored: the task has a request and the customer is the one who has to move it. */
  requiresCustomerAction: boolean
}

export interface Category {
  id: string
  code: string
  enabled: boolean
  sortOrder: number
  names: Record<Language, string>
  used: number
}

export interface WorkMilestone {
  id: string
  project_id: string
  title: string
  description: string | null
  due_on: string | null
  completed_at: string | null
  status: MilestoneStatus
  customer_visible: 0 | 1
  position: number
  tasks: number
  completedTasks: number
}

export interface Workspace {
  project: { id: string; reference: string; name: string; status: string; started_on: string | null; expected_on: string | null }
  customer: { id: string; email: string; name: string | null; language: Language }
  today: string
  progress: Progress
  customerProgress: Progress
  tasks: Task[]
  /** Over the whole project, whatever filter the list was asked with. */
  counts: { tasks: number; needsReview: number; needsCustomer: number; overdue: number }
  milestones: WorkMilestone[]
  categories: Category[]
  assignees: Array<{ id: string; email: string }>
  allowed: Record<TaskStatus, TaskStatus[]>
}

export interface ActionDetail {
  id: string
  task_id: string
  action_type: ActionType
  instruction: string
  status: ActionStatus
  revision: number
  submitted_at: string | null
  reviewed_at: string | null
  submissions: Array<{ revision: number; response: string; submittedAt: string }>
  transitions: Array<{ id: number; from: ActionStatus | null; to: ActionStatus; revision: number; actor: 'admin' | 'customer' | 'system'; actorEmail: string | null; customerNote: string | null; internalNote: string | null; at: string }>
  awaiting: 'customer' | 'owner' | null
  allowed: ActionStatus[]
}

export interface TaskDetail {
  task: Task
  action: ActionDetail | null
  predecessors: Array<Pick<Task, 'id' | 'reference' | 'title' | 'status'>>
  dependents: Array<Pick<Task, 'id' | 'reference' | 'title' | 'status'>>
  notes: Array<{ id: string; body: string; createdAt: string; authorEmail: string | null }>
  history: Array<{ id: number; event_type: string; actor_type: string; from_status: string | null; to_status: string | null; note: string | null; subject: string | null; visibility: 'customer' | 'internal'; created_at: string; adminEmail: string | null }>
  allowed: TaskStatus[]
}

export interface BulkResult {
  id: string
  ok: boolean
  reason?: string
}

export interface WorkSettings {
  actionAssigned: boolean
  actionDueSoon: boolean
  actionOverdue: boolean
  responseSubmitted: boolean
  responseReviewed: boolean
  changesRequested: boolean
  milestoneCompleted: boolean
  statusChanged: boolean
  dueSoonDays: number
}

export interface WorkDelivery {
  id: string
  kind: string
  to: 'customer' | 'owner'
  recipient: string
  status: string
  stage: 'queued' | 'sent' | 'delivered' | 'failed'
  createdAt: string
  acceptedAt: string | null
  deliveredAt: string | null
  error: string | null
}

export interface TaskFilters {
  status?: string
  priority?: string
  category?: string
  assignee?: string
  milestone?: string
  q?: string
  visible?: string
  overdue?: boolean
  needsCustomer?: boolean
  needsReview?: boolean
  sort?: string
}

export interface TaskInput {
  title?: string
  description?: string
  customerDescription?: string
  status?: TaskStatus
  priority?: TaskPriority
  categoryId?: string | null
  milestoneId?: string | null
  startOn?: string | null
  dueOn?: string | null
  assignedTo?: string | null
  customerVisible?: boolean
  revision?: number
}

const base = '/api/admin/client-projects'
const enc = encodeURIComponent
const data = async <T>(promise: Promise<{ data: T }>): Promise<T> => (await promise).data

/** `del` (client.ts) is for answers with no body; these deletes answer with the record that is left. */
const del2 = <T>(path: string) => request<T>('DELETE', path)

const query = (filters: TaskFilters) => ({ ...filters, overdue: filters.overdue ? 1 : undefined, needsCustomer: filters.needsCustomer ? 1 : undefined, needsReview: filters.needsReview ? 1 : undefined })

export const work = {
  workspace: (id: string, filters: TaskFilters, signal?: AbortSignal) => data(get<Workspace>(`${base}/${enc(id)}/work`, { query: query(filters), signal })),
  allTasks: (filters: TaskFilters & { project?: string }, signal?: AbortSignal) => data(get<{ tasks: Task[]; today: string }>('/api/admin/work/tasks', { query: query(filters), signal })),
  task: (id: string, taskId: string, signal?: AbortSignal) => data(get<TaskDetail>(`${base}/${enc(id)}/tasks/${enc(taskId)}`, { signal })),
  create: (id: string, body: TaskInput) => data(post<{ id: string; reference: string }>(`${base}/${enc(id)}/tasks`, body)),
  edit: (id: string, taskId: string, body: TaskInput) => data(patch<TaskDetail>(`${base}/${enc(id)}/tasks/${enc(taskId)}`, body)),
  remove: (id: string, taskId: string) => del(`${base}/${enc(id)}/tasks/${enc(taskId)}`),
  move: (id: string, taskId: string, status: TaskStatus, revision?: number) => data(post<TaskDetail>(`${base}/${enc(id)}/tasks/${enc(taskId)}/status`, { status, revision })),
  moveMany: (id: string, ids: string[], status: TaskStatus) => data(post<BulkResult[]>(`${base}/${enc(id)}/tasks/bulk-status`, { ids, status })),
  reorder: (id: string, ids: string[]) => data(post<{ ok: true }>(`${base}/${enc(id)}/tasks/reorder`, { ids })),
  depend: (id: string, taskId: string, dependsOnId: string) => data(post<TaskDetail>(`${base}/${enc(id)}/tasks/${enc(taskId)}/dependencies`, { dependsOnId })),
  undepend: (id: string, taskId: string, dependsOnId: string) => data(del2<TaskDetail>(`${base}/${enc(id)}/tasks/${enc(taskId)}/dependencies/${enc(dependsOnId)}`)),
  note: (id: string, taskId: string, text: string) => data(post<{ id: string }>(`${base}/${enc(id)}/tasks/${enc(taskId)}/notes`, { body: text })),
  giveAction: (id: string, taskId: string, body: { actionType: ActionType; instruction: string }) => data(post<TaskDetail>(`${base}/${enc(id)}/tasks/${enc(taskId)}/action`, body)),
  rewordAction: (id: string, actionId: string, body: { actionType?: ActionType; instruction?: string }) => data(patch<TaskDetail>(`${base}/${enc(id)}/actions/${enc(actionId)}`, body)),
  review: (id: string, actionId: string, move: 'review' | 'accept' | 'changes' | 'cancel', body: { customerNote?: string; internalNote?: string; completeTask?: boolean } = {}) => data(post<TaskDetail>(`${base}/${enc(id)}/actions/${enc(actionId)}/${move}`, body)),
  addMilestone: (id: string, body: { title: string; description?: string; dueOn?: string; customerVisible?: boolean }) => data(post<WorkMilestone>(`${base}/${enc(id)}/milestones`, body)),
  editMilestone: (id: string, milestoneId: string, body: { title?: string; description?: string | null; dueOn?: string | null; status?: MilestoneStatus; customerVisible?: boolean }) => data(patch<WorkMilestone>(`${base}/${enc(id)}/milestones/${enc(milestoneId)}`, body)),
  removeMilestone: (id: string, milestoneId: string) => del(`${base}/${enc(id)}/milestones/${enc(milestoneId)}`),
  deliveries: (id: string, signal?: AbortSignal) => data(get<WorkDelivery[]>(`${base}/${enc(id)}/work-notifications`, { signal })),
  categories: (signal?: AbortSignal) => data(get<Category[]>('/api/admin/task-categories', { signal })),
  addCategory: (body: { code: string; names: Record<Language, string> }) => data(post<Category[]>('/api/admin/task-categories', body)),
  editCategory: (id: string, body: { names?: Record<Language, string>; enabled?: boolean; sortOrder?: number }) => data(patch<Category[]>(`/api/admin/task-categories/${enc(id)}`, body)),
  removeCategory: async (id: string) => data(del2<Category[]>(`/api/admin/task-categories/${enc(id)}`)),
  suggestCategories: () => data(post<{ added: number; categories: Category[] }>('/api/admin/task-categories/suggested')),
  settings: (signal?: AbortSignal) => data(get<WorkSettings>('/api/admin/work-settings', { signal })),
  saveSettings: (body: Partial<WorkSettings>) => data(put<WorkSettings>('/api/admin/work-settings', body)),
}
