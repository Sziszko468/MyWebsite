import { progressOf } from '../../../projectwork/progress.ts'
import { todayKey } from '../../../projectwork/settings.ts'
import { listTasks } from '../../../projectwork/tasks.ts'
import { cut, LIMITS, likeOf, NOT_FOUND, pageOf } from '../model.ts'
import { inScope, scopeClause, scopeIds } from '../scope.ts'
import { link, listed, type ReadCtx } from './common.ts'

/**
 * Projects (the client projects of the project management) for the admin assistant. Permission: `clients:read`. Everything returned is a stored fact or a figure calculated
 * from stored facts, and the field names say which: `status` is the stored status, `progress.calculated…` is counted from the tasks and milestones, `derived` is a rule
 * applied to stored fields. Internal notes, the assignees' e-mail addresses and the customer's contact details are not returned.
 */

const NEED = 'clients:read'

interface ProjectRow {
  id: string
  reference: string
  customer_id: string
  quote_request_id: string | null
  name: string
  category: string
  status: string
  started_on: string | null
  expected_on: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  customer_name: string | null
  customer_company: string | null
  customer_language: string
}

// The fixed select list and joins (a constant of this file, never built from input).
const columns = `SELECT p.id, p.reference, p.customer_id, p.quote_request_id, p.name, p.category, p.status, p.started_on, p.expected_on, p.completed_at, p.created_at, p.updated_at,
       c.name AS customer_name, c.company AS customer_company, c.language AS customer_language
  FROM client_projects p JOIN customers c ON c.id = p.customer_id`

export interface ProjectSearch {
  query?: string | undefined
  status?: string | undefined
  limit?: number | undefined
  page?: number | undefined
}

export function searchProjects(ctx: ReadCtx, input: ProjectSearch) {
  ctx.access.need(NEED)
  const conditions: string[] = ['1 = 1']
  const params: Array<string | number> = []
  if (input.status) {
    conditions.push('p.status = ?')
    params.push(input.status)
  }
  if (input.query) {
    const like = likeOf(input.query)
    conditions.push("(p.reference LIKE ? ESCAPE '!' OR p.name LIKE ? ESCAPE '!' OR c.name LIKE ? ESCAPE '!' OR c.company LIKE ? ESCAPE '!')")
    params.push(like, like, like, like)
  }
  const restricted = scopeClause(scopeIds(ctx.scope, 'project'), 'p.id')
  const where = `${conditions.join(' AND ')}${restricted.sql}`
  const all = [...params, ...restricted.params]
  const page = pageOf(input)
  const total = ctx.app.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM client_projects p JOIN customers c ON c.id = p.customer_id WHERE ${where}`, all)?.n ?? 0
  const rows = ctx.app.db.all<ProjectRow>(`${columns} WHERE ${where} ORDER BY p.updated_at DESC, p.id LIMIT ? OFFSET ?`, [...all, page.limit, page.offset])
  return listed(
    ctx,
    rows.map((row) => {
      const progress = progressOf(ctx.app, row.id, 'all')
      return {
        reference: row.reference,
        name: cut(row.name, LIMITS.titleChars),
        status: row.status,
        category: row.category,
        startedOn: row.started_on,
        expectedOn: row.expected_on,
        updatedAt: row.updated_at,
        customer: { name: cut(row.customer_name, 80), company: cut(row.customer_company, 80) },
        calculatedProgress: { percent: progress.percent, basis: progress.basis, openTasks: progress.tasks.open, overdueTasks: progress.tasks.overdue },
        link: link.project(row.reference, row.id),
      }
    }),
    total,
    page,
  )
}

export function projectByReference(ctx: ReadCtx, reference: string | undefined): ProjectRow {
  ctx.access.need(NEED)
  const ref = reference ?? (ctx.scope.type === 'project' ? ctx.scope.ref : null)
  if (!ref) throw NOT_FOUND()
  const row = ctx.app.db.get<ProjectRow>(`${columns} WHERE p.reference = ?`, [ref])
  if (!row || !inScope(ctx.scope, 'project', row.id)) throw NOT_FOUND()
  return row
}

interface MilestoneRow {
  id: string
  title: string
  due_on: string | null
  completed_at: string | null
  status: string
  customer_visible: number
}

export function projectDetails(ctx: ReadCtx, reference: string | undefined) {
  const project = projectByReference(ctx, reference)
  const { app } = ctx
  const today = todayKey(app)
  const milestones = app.db.all<MilestoneRow>('SELECT id, title, due_on, completed_at, status, customer_visible FROM client_milestones WHERE project_id = ? ORDER BY position LIMIT 40', [project.id])
  const all = app.db.all<{ milestone_id: string; status: string }>('SELECT milestone_id, status FROM project_tasks WHERE project_id = ? AND milestone_id IS NOT NULL', [project.id])
  // The 40 tasks that matter first (by due date): a result is context the administrator pays for, and `total` says how many there are.
  const tasks = listTasks(app, { projectId: project.id, sort: 'due', limit: 40 })
  const everyone = progressOf(app, project.id, 'all', today)
  const customerSees = progressOf(app, project.id, 'customer', today)
  const quote = project.quote_request_id ? app.db.get<{ reference: string }>('SELECT reference FROM quote_requests WHERE id = ?', [project.quote_request_id]) : undefined
  const totalTasks = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_tasks WHERE project_id = ?', [project.id])?.n ?? 0
  const titleOf = new Map(milestones.map((row) => [row.id, row.title]))
  return {
    basis: 'actual' as const,
    today,
    reference: project.reference,
    name: cut(project.name, LIMITS.titleChars),
    category: project.category,
    status: project.status,
    startedOn: project.started_on,
    expectedOn: project.expected_on,
    completedAt: project.completed_at,
    updatedAt: project.updated_at,
    customer: { name: cut(project.customer_name, 80), company: cut(project.customer_company, 80), language: project.customer_language },
    quoteRequestReference: quote?.reference ?? null,
    progress: {
      calculatedFromAllWork: { percent: everyone.percent, basis: everyone.basis, tasks: everyone.tasks, milestones: everyone.milestones },
      shownToCustomer: { percent: customerSees.percent, basis: customerSees.basis, tasks: customerSees.tasks, milestones: customerSees.milestones },
    },
    milestones: milestones.map((row) => ({
      title: cut(row.title, LIMITS.titleChars),
      dueOn: row.due_on,
      status: row.status,
      done: row.completed_at !== null || row.status === 'completed',
      customerVisible: row.customer_visible === 1,
      overdue: row.due_on !== null && row.due_on < today && row.status !== 'completed' && row.status !== 'cancelled' && row.completed_at === null,
      tasks: all.filter((task) => task.milestone_id === row.id && task.status !== 'cancelled').length,
      completedTasks: all.filter((task) => task.milestone_id === row.id && task.status === 'completed').length,
    })),
    tasks: {
      total: totalTasks,
      shown: tasks.length,
      items: tasks.map((task) => ({
        reference: task.reference,
        title: cut(task.title, LIMITS.titleChars),
        status: task.status,
        priority: task.priority,
        dueOn: task.due_on,
        overdue: task.overdue,
        blocked: task.status === 'blocked' || task.blockedBy.length > 0,
        blockedBy: task.blockedBy.map((other) => other.reference),
        waitingForCustomer: task.requiresCustomerAction,
        customerVisible: task.customer_visible === 1,
        milestone: task.milestone_id ? (titleOf.get(task.milestone_id) ?? null) : null,
      })),
    },
    link: link.project(project.reference, project.id),
  }
}

/** Rules applied to stored fields: what is incomplete, late, blocked or missing. The assistant explains these; it does not add to them. */
export function summarizeProject(ctx: ReadCtx, reference: string | undefined) {
  const details = projectDetails(ctx, reference)
  const { app } = ctx
  const project = projectByReference(ctx, details.reference)
  const events = app.db.all<{ event_type: string; created_at: string }>('SELECT event_type, created_at FROM client_project_events WHERE project_id = ? ORDER BY created_at DESC LIMIT 8', [project.id])
  const pending = pendingActions(ctx, details.reference)
  const open = details.tasks.items.filter((task) => task.status !== 'completed' && task.status !== 'cancelled')
  const missing: string[] = []
  if (!project.started_on) missing.push('started_on')
  if (!project.expected_on) missing.push('expected_on')
  if (details.milestones.length === 0) missing.push('milestones')
  if (details.tasks.total === 0) missing.push('tasks')
  if (open.length > 0 && open.every((task) => task.dueOn === null)) missing.push('task_due_dates')
  if (details.tasks.total > 0 && !details.tasks.items.some((task) => task.customerVisible)) missing.push('nothing_visible_to_customer')
  return {
    ...details,
    derived: {
      basis: 'derived_from_stored_fields' as const,
      incompleteMilestones: details.milestones.filter((milestone) => !milestone.done && milestone.status !== 'cancelled').map((milestone) => ({ title: milestone.title, dueOn: milestone.dueOn, status: milestone.status, overdue: milestone.overdue })),
      overdueTasks: details.tasks.items.filter((task) => task.overdue).map((task) => ({ reference: task.reference, title: task.title, dueOn: task.dueOn, status: task.status })),
      blockedTasks: details.tasks.items.filter((task) => task.blocked).map((task) => ({ reference: task.reference, title: task.title, blockedBy: task.blockedBy, status: task.status })),
      waitingForCustomer: pending.customerActions.length,
      awaitingYourReview: pending.awaitingReview.length,
      missingInformation: missing,
      recentActivity: events.map((event) => ({ type: event.event_type, at: event.created_at })),
    },
  }
}

export function projectRisks(ctx: ReadCtx, reference: string | undefined) {
  const details = projectDetails(ctx, reference)
  const today = details.today
  const risks: Array<{ code: string; severity: 'high' | 'medium' | 'low'; evidence: Record<string, unknown> }> = []
  const overdue = details.tasks.items.filter((task) => task.overdue)
  const blocked = details.tasks.items.filter((task) => task.blocked)
  const lateMilestones = details.milestones.filter((milestone) => milestone.overdue)
  const open = details.tasks.items.filter((task) => task.status !== 'completed' && task.status !== 'cancelled')
  const finished = details.status === 'completed' || details.status === 'cancelled'
  if (overdue.length > 0) risks.push({ code: 'overdue_tasks', severity: 'high', evidence: { count: overdue.length, references: overdue.slice(0, 10).map((task) => task.reference) } })
  if (blocked.length > 0) risks.push({ code: 'blocked_tasks', severity: 'high', evidence: { count: blocked.length, references: blocked.slice(0, 10).map((task) => task.reference) } })
  if (lateMilestones.length > 0) risks.push({ code: 'milestones_past_due', severity: 'high', evidence: { count: lateMilestones.length, titles: lateMilestones.slice(0, 5).map((milestone) => milestone.title) } })
  if (!finished && details.expectedOn !== null && details.expectedOn < today) risks.push({ code: 'expected_date_passed', severity: 'high', evidence: { expectedOn: details.expectedOn, today } })
  const waiting = details.tasks.items.filter((task) => task.waitingForCustomer)
  if (waiting.length > 0) risks.push({ code: 'waiting_for_customer', severity: waiting.some((task) => task.overdue) ? 'high' : 'medium', evidence: { count: waiting.length, references: waiting.slice(0, 10).map((task) => task.reference) } })
  if (!finished && details.expectedOn === null) risks.push({ code: 'no_expected_date', severity: 'medium', evidence: {} })
  if (!finished && details.tasks.total === 0) risks.push({ code: 'no_tasks_recorded', severity: 'medium', evidence: {} })
  if (!finished && open.length > 0 && open.every((task) => task.dueOn === null)) risks.push({ code: 'open_tasks_without_due_dates', severity: 'low', evidence: { count: open.length } })
  return { basis: 'derived_from_stored_fields' as const, today, project: { reference: details.reference, status: details.status }, risks, noRiskRulesTriggered: risks.length === 0, link: details.link }
}

export function pendingActions(ctx: ReadCtx, reference: string | undefined) {
  const project = projectByReference(ctx, reference)
  const { app } = ctx
  const actions = app.db.all<{ task_reference: string; task_title: string; task_status: string; due_on: string | null; action_type: string; status: string; instruction: string; submitted_at: string | null }>(
    `SELECT t.reference AS task_reference, t.title AS task_title, t.status AS task_status, t.due_on, a.action_type, a.status, a.instruction, a.submitted_at
       FROM project_customer_actions a JOIN project_tasks t ON t.id = a.task_id
      WHERE a.project_id = ? AND a.status IN ('not_started', 'changes_requested', 'submitted', 'under_review') ORDER BY t.due_on IS NULL, t.due_on LIMIT 25`,
    [project.id],
  )
  const approvals = app.db.all<{ reference: string; title: string; requested_at: string }>(
    `SELECT d.reference, d.title, ap.requested_at FROM deliverable_approvals ap JOIN deliverables d ON d.id = ap.deliverable_id WHERE d.project_id = ? AND ap.state = 'requested' ORDER BY ap.requested_at LIMIT 15`,
    [project.id],
  )
  const changes = app.db.all<{ reference: string; title: string }>("SELECT reference, title FROM deliverables WHERE project_id = ? AND review_state = 'changes_requested' LIMIT 15", [project.id])
  const today = todayKey(app)
  const item = (row: (typeof actions)[number]) => ({ taskReference: row.task_reference, task: cut(row.task_title, LIMITS.titleChars), actionType: row.action_type, status: row.status, dueOn: row.due_on, overdue: row.due_on !== null && row.due_on < today, instruction: cut(row.instruction, 200), submittedAt: row.submitted_at })
  return {
    basis: 'actual' as const,
    today,
    project: { reference: project.reference, name: cut(project.name, LIMITS.titleChars) },
    customerActions: actions.filter((row) => row.status === 'not_started' || row.status === 'changes_requested').map(item),
    awaitingReview: actions.filter((row) => row.status === 'submitted' || row.status === 'under_review').map(item),
    deliverablesAwaitingCustomerApproval: approvals.map((row) => ({ reference: row.reference, title: cut(row.title, LIMITS.titleChars), requestedAt: row.requested_at })),
    deliverablesWithChangesRequested: changes.map((row) => ({ reference: row.reference, title: cut(row.title, LIMITS.titleChars) })),
    link: link.project(project.reference, project.id),
  }
}

