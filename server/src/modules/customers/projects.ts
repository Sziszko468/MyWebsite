import type { AppContext } from '../../context.ts'
import { HttpError, notFound } from '../../http/errors.ts'
import { newId, newReference } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import { getCustomer, recordAudit } from './accounts.ts'
import { progressOf, type Progress } from '../projectwork/progress.ts'
import { workSettings } from '../projectwork/settings.ts'
import type { ClientMailKind } from '../notifications/clientTemplates.ts'
import { queueClientMail } from './mail.ts'
import type { MilestoneStatus } from '../projectwork/model.ts'
import {
  canMoveProject,
  IMPORTANT_STATUSES,
  type DocumentRow,
  type MilestoneRow,
  type ProjectCategory,
  type ProjectEventRow,
  type ProjectEventType,
  type ProjectRow,
  type ProjectStatus,
} from './model.ts'

/**
 * The customer's projects. A project exists because the owner made it (`createProject`): never as a side effect of a request, a booking or an acceptance.
 * Every change the owner makes writes one line of the project's history in the same transaction, and that history (with the milestones and the documents the
 * owner chose to publish) is the only thing a customer's page is built from. The owner's private notes live in their own table and are not read by anything
 * that builds a customer's answer.
 */

export const refuse = (message: string, reason: string) => new HttpError(409, 'conflict', message, { details: { reason } })

/** `PRJ-7K3M9XQH`: random, so one reference says nothing about another. Uniqueness is the database's job; a clash (one in a trillion) is simply tried again. */
export function newProjectReference(app: Pick<AppContext, 'db'>): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reference = newReference('PRJ')
    if (!app.db.get('SELECT 1 FROM client_projects WHERE reference = ?', [reference])) return reference
  }
  throw new Error('Could not make a unique project reference.')
}

export const getProject = (app: Pick<AppContext, 'db'>, id: string): ProjectRow | undefined => app.db.get<ProjectRow>('SELECT * FROM client_projects WHERE id = ?', [id])

export function recordProjectEvent(
  app: Pick<AppContext, 'db' | 'clock'>,
  input: { projectId: string; type: ProjectEventType; adminId: string | null; actor?: 'admin' | 'customer' | 'system'; actorId?: string | null; from?: string | null; to?: string | null; milestoneId?: string | null; documentId?: string | null; taskId?: string | null; actionId?: string | null; subject?: string | null; visibility?: 'customer' | 'internal'; note?: string | null },
): number {
  const actor = input.actor ?? (input.adminId ? 'admin' : 'system')
  return app.db.run('INSERT INTO client_project_events (project_id, event_type, actor_type, actor_id, from_status, to_status, milestone_id, document_id, task_id, action_id, subject, visibility, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    input.projectId, input.type, actor, input.actorId ?? input.adminId, input.from ?? null, input.to ?? null, input.milestoneId ?? null, input.documentId ?? null, input.taskId ?? null, input.actionId ?? null, input.subject ?? null, input.visibility ?? 'customer', input.note ?? null, iso(app.clock.now()),
  ]).lastInsertRowid
}

/** Tells the project's customer about an event, in their language, unless they are switched off. Never throws. */
export function tell(app: AppContext, project: ProjectRow, kind: ClientMailKind, eventId: number): void {
  const customer = getCustomer(app, project.customer_id)
  if (!customer || customer.status === 'disabled') return
  queueClientMail(app, { kind, relatedType: 'client_project_event', relatedId: String(eventId), recipient: customer.email, language: customer.language })
}

// ---- the owner's work on a project ---------------------------------------------------------------------------------------------------

export interface NewProject {
  name: string
  category: ProjectCategory
  startedOn: string | null
  expectedOn: string | null
  quoteRequestId: string | null
  notify: boolean
}

/**
 * Makes a project for a customer. When it comes from a quote request, that request must already be linked to THIS customer and have an accepted quote:
 * accepting a quote does not make a project, the owner does, on purpose, here.
 */
export function createProject(app: AppContext, adminId: string, customerId: string, input: NewProject): ProjectRow {
  const customer = getCustomer(app, customerId)
  if (!customer) throw notFound('The customer')
  if (customer.status === 'disabled') throw refuse('This account is switched off.', 'customer_disabled')
  return app.db.transaction(() => {
    let quoteId: string | null = null
    if (input.quoteRequestId) {
      if (!app.db.get('SELECT 1 FROM customer_links WHERE customer_id = ? AND quote_request_id = ?', [customerId, input.quoteRequestId])) throw refuse('That quote request is not linked to this customer.', 'request_not_linked')
      const accepted = app.db.get<{ id: string }>("SELECT id FROM quotes WHERE quote_request_id = ? AND status = 'accepted' ORDER BY version DESC LIMIT 1", [input.quoteRequestId])
      if (!accepted) throw refuse('That quote request has no accepted quote.', 'quote_not_accepted')
      quoteId = accepted.id
    }
    const now = iso(app.clock.now())
    const project: ProjectRow = {
      id: newId(), reference: newProjectReference(app), customer_id: customerId, quote_request_id: input.quoteRequestId, quote_id: quoteId, name: input.name, category: input.category,
      status: 'awaiting_start', started_on: input.startedOn, expected_on: input.expectedOn, completed_at: null, created_by: adminId, created_at: now, updated_at: now,
    }
    app.db.run('INSERT INTO client_projects (id, reference, customer_id, quote_request_id, quote_id, name, category, status, started_on, expected_on, completed_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)', [
      project.id, project.reference, project.customer_id, project.quote_request_id, project.quote_id, project.name, project.category, project.status, project.started_on, project.expected_on, adminId, now, now,
    ])
    const eventId = recordProjectEvent(app, { projectId: project.id, type: 'created', adminId, to: 'awaiting_start' })
    recordAudit(app, { customerId, type: 'project_created', actor: { type: 'admin', id: adminId }, detail: project.reference })
    if (input.notify) tell(app, project, 'client_project_created', eventId)
    return project
  })
}

export interface ProjectChanges {
  name?: string
  category?: ProjectCategory
  startedOn?: string | null
  expectedOn?: string | null
}

/** A change of name, category or dates. A change of dates is a line in the history; it is not e-mailed (a date moving is not news to ring someone about). */
export function updateProject(app: AppContext, adminId: string, projectId: string, changes: ProjectChanges): ProjectRow {
  return app.db.transaction(() => {
    const project = getProject(app, projectId)
    if (!project) throw notFound('The project')
    const next = {
      name: changes.name ?? project.name,
      category: changes.category ?? project.category,
      started_on: changes.startedOn === undefined ? project.started_on : changes.startedOn,
      expected_on: changes.expectedOn === undefined ? project.expected_on : changes.expectedOn,
    }
    app.db.run('UPDATE client_projects SET name = ?, category = ?, started_on = ?, expected_on = ?, updated_at = ? WHERE id = ?', [next.name, next.category, next.started_on, next.expected_on, iso(app.clock.now()), projectId])
    if (next.started_on !== project.started_on || next.expected_on !== project.expected_on) recordProjectEvent(app, { projectId, type: 'dates_changed', adminId })
    return getProject(app, projectId)!
  })
}

/**
 * Moves a project to another status. The move must be one the model allows (model.ts). The customer's words for it (a short note) go into the history; they
 * are e-mailed when the new status is an important one (the customer has something to do, or the project is paused or finished), or when the owner says so,
 * and not otherwise. A customer never changes a status: nothing in the portal's API does.
 */
export function changeStatus(app: AppContext, adminId: string, projectId: string, to: ProjectStatus, note: string | null, notify: boolean | null): ProjectRow {
  return app.db.transaction(() => {
    const project = getProject(app, projectId)
    if (!project) throw notFound('The project')
    if (!canMoveProject(project.status, to)) throw refuse(`A project that is "${project.status}" cannot move to "${to}".`, 'invalid_transition')
    const now = iso(app.clock.now())
    // The day work began is the day it first left "awaiting start" for a working phase, unless the owner already wrote one.
    const startedOn = project.started_on ?? (project.status === 'awaiting_start' && ['discovery', 'planning', 'design', 'development'].includes(to) ? now.slice(0, 10) : null)
    app.db.run('UPDATE client_projects SET status = ?, started_on = ?, completed_at = ?, updated_at = ? WHERE id = ?', [to, startedOn, to === 'completed' ? now : null, now, projectId])
    const eventId = recordProjectEvent(app, { projectId, type: 'status_changed', adminId, from: project.status, to, note })
    if (notify ?? (IMPORTANT_STATUSES.includes(to) && workSettings(app).statusChanged)) tell(app, project, 'client_project_status', eventId)
    return getProject(app, projectId)!
  })
}

export function addMilestone(app: AppContext, adminId: string, projectId: string, input: { title: string; dueOn: string | null; description?: string | null; customerVisible?: boolean }): MilestoneRow {
  return app.db.transaction(() => {
    if (!getProject(app, projectId)) throw notFound('The project')
    const position = (app.db.get<{ n: number }>('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM client_milestones WHERE project_id = ?', [projectId])?.n ?? 1)
    const visible = input.customerVisible !== false
    const row: MilestoneRow = { id: newId(), project_id: projectId, title: input.title, due_on: input.dueOn, completed_at: null, position, created_at: iso(app.clock.now()), description: input.description ?? null, status: 'upcoming', customer_visible: visible ? 1 : 0 }
    app.db.run('INSERT INTO client_milestones (id, project_id, title, due_on, completed_at, position, created_at, description, status, customer_visible) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)', [row.id, projectId, row.title, row.due_on, position, row.created_at, row.description, row.status, row.customer_visible])
    app.db.run('UPDATE client_projects SET updated_at = ? WHERE id = ?', [row.created_at, projectId])
    recordProjectEvent(app, { projectId, type: 'milestone_added', adminId, milestoneId: row.id, subject: row.title, visibility: visible ? 'customer' : 'internal' })
    return row
  })
}

export interface MilestoneChanges {
  title?: string
  description?: string | null
  dueOn?: string | null
  /** Any status but `completed` moves the milestone there; `completed` is the same as `done: true`. */
  status?: MilestoneStatus
  customerVisible?: boolean
  /** Kept from the first version of the portal: `true` completes the milestone. */
  done?: boolean
}

/**
 * Changes a milestone: its words, its date, whether the customer sees it, its status. A completed milestone stays completed and cannot be cancelled (the history already
 * says so); a cancelled one can be reinstated. Completing is the one change a customer is told about (when the milestone is one they can see and the owner has not
 * switched the message off). Completing a milestone never completes a task: the work and the date are two records.
 */
export function updateMilestone(app: AppContext, adminId: string, projectId: string, milestoneId: string, changes: MilestoneChanges): MilestoneRow {
  return app.db.transaction(() => {
    const milestone = app.db.get<MilestoneRow>('SELECT * FROM client_milestones WHERE id = ? AND project_id = ?', [milestoneId, projectId])
    if (!milestone) throw notFound('The milestone')
    const project = getProject(app, projectId)
    if (!project) throw notFound('The project')
    const now = iso(app.clock.now())
    const wantsStatus: MilestoneStatus | undefined = changes.done === true ? 'completed' : changes.status
    if (milestone.completed_at && (changes.done === false || (wantsStatus !== undefined && wantsStatus !== 'completed'))) throw refuse('A completed milestone cannot be reopened.', 'milestone_completed')
    const status: MilestoneStatus = wantsStatus ?? milestone.status
    const completing = status === 'completed' && !milestone.completed_at
    const visible = changes.customerVisible === undefined ? milestone.customer_visible === 1 : changes.customerVisible
    app.db.run('UPDATE client_milestones SET title = ?, description = ?, due_on = ?, status = ?, customer_visible = ?, completed_at = ? WHERE id = ?', [
      changes.title ?? milestone.title,
      changes.description === undefined ? milestone.description : changes.description,
      changes.dueOn === undefined ? milestone.due_on : changes.dueOn,
      status,
      visible ? 1 : 0,
      completing ? now : milestone.completed_at,
      milestoneId,
    ])
    app.db.run('UPDATE client_projects SET updated_at = ? WHERE id = ?', [now, projectId])
    const title = changes.title ?? milestone.title
    if (completing) {
      const eventId = recordProjectEvent(app, { projectId, type: 'milestone_completed', adminId, milestoneId, subject: title, visibility: visible ? 'customer' : 'internal' })
      if (visible && workSettings(app).milestoneCompleted) tell(app, project, 'client_milestone_completed', eventId)
    } else if (status !== milestone.status) {
      recordProjectEvent(app, { projectId, type: 'milestone_status_changed', adminId, milestoneId, subject: title, from: milestone.status, to: status, visibility: visible ? 'customer' : 'internal' })
    }
    return app.db.get<MilestoneRow>('SELECT * FROM client_milestones WHERE id = ?', [milestoneId])!
  })
}

export function deleteMilestone(app: AppContext, projectId: string, milestoneId: string): void {
  const milestone = app.db.get<MilestoneRow>('SELECT * FROM client_milestones WHERE id = ? AND project_id = ?', [milestoneId, projectId])
  if (!milestone) throw notFound('The milestone')
  if (milestone.completed_at) throw refuse('A completed milestone is part of the history and cannot be removed.', 'milestone_completed')
  app.db.run('DELETE FROM client_milestones WHERE id = ?', [milestoneId])
}

/** Words the owner writes FOR the customer: an update, or a question that needs an answer ("feedback"). A question is e-mailed unless the owner says not to; an update only if the owner says so. */
export function postUpdate(app: AppContext, adminId: string, projectId: string, input: { kind: 'update' | 'feedback'; note: string; notify: boolean | null }): number {
  return app.db.transaction(() => {
    const project = getProject(app, projectId)
    if (!project) throw notFound('The project')
    app.db.run('UPDATE client_projects SET updated_at = ? WHERE id = ?', [iso(app.clock.now()), projectId])
    const eventId = recordProjectEvent(app, { projectId, type: input.kind === 'feedback' ? 'feedback_requested' : 'update_posted', adminId, note: input.note })
    if (input.notify ?? input.kind === 'feedback') tell(app, project, 'client_project_status', eventId)
    return eventId
  })
}

export function addNote(app: AppContext, adminId: string, projectId: string, body: string): string {
  if (!getProject(app, projectId)) throw notFound('The project')
  const id = newId()
  app.db.run('INSERT INTO client_project_notes (id, project_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)', [id, projectId, adminId, body, iso(app.clock.now())])
  return id
}

// ---- what a customer sees ------------------------------------------------------------------------------------------------------------

export interface PortalProject {
  reference: string
  name: string
  category: ProjectCategory
  status: ProjectStatus
  startedOn: string | null
  expectedOn: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  /** Counted from real milestones; `null` when the owner has set none (no percentage is ever made up). */
  milestones: { done: number; total: number } | null
  nextMilestone: { title: string; dueOn: string | null } | null
  /** Counted from the customer's own view of the tasks and milestones (progress.ts): `percent` is `null` when there is nothing to count. */
  progress: Progress
}

interface MilestoneCount {
  project_id: string
  total: number
  done: number
}

function toPortal(row: ProjectRow, counts: MilestoneCount | undefined, next: MilestoneRow | undefined, progress: Progress): PortalProject {
  return {
    reference: row.reference,
    name: row.name,
    category: row.category,
    status: row.status,
    startedOn: row.started_on,
    expectedOn: row.expected_on,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    milestones: counts && counts.total > 0 ? { done: counts.done, total: counts.total } : null,
    nextMilestone: next ? { title: next.title, dueOn: next.due_on } : null,
    progress,
  }
}

const nextOf = (app: Pick<AppContext, 'db'>, projectId: string): MilestoneRow | undefined =>
  app.db.get<MilestoneRow>("SELECT * FROM client_milestones WHERE project_id = ? AND completed_at IS NULL AND status <> 'cancelled' AND customer_visible = 1 ORDER BY (due_on IS NULL), due_on, position LIMIT 1", [projectId])

/** All of ONE customer's projects: their id comes from the session, and every row is selected by it. */
export function portalProjects(app: Pick<AppContext, 'db' | 'clock'>, customerId: string): PortalProject[] {
  const rows = app.db.all<ProjectRow>("SELECT * FROM client_projects WHERE customer_id = ? ORDER BY (status IN ('completed', 'cancelled')), updated_at DESC, id", [customerId])
  const counts = new Map(
    app.db
      .all<MilestoneCount>('SELECT m.project_id, COUNT(*) AS total, SUM(m.completed_at IS NOT NULL) AS done FROM client_milestones m JOIN client_projects p ON p.id = m.project_id WHERE p.customer_id = ? AND m.customer_visible = 1 AND m.status <> \'cancelled\' GROUP BY m.project_id', [customerId])
      .map((row) => [row.project_id, row]),
  )
  return rows.map((row) => toPortal(row, counts.get(row.id), nextOf(app, row.id), progressOf(app, row.id, 'customer')))
}

export interface TimelineEntry {
  id: number
  type: ProjectEventType
  at: string
  /** A project status on a project line; a task or action status on a task or action line (`type` says which). */
  fromStatus: string | null
  toStatus: string | null
  /** The words the owner wrote for the customer with this event, if any. */
  note: string | null
  /** The title of the milestone the event is about, if it still exists. */
  milestone: string | null
  /** The title of the task, milestone or action the event is about, as it was at the time. */
  subject: string | null
}

export interface PortalDocument {
  id: string
  title: string
  kind: DocumentRow['kind']
  fileName: string | null
  mimeType: string | null
  sizeBytes: number | null
  publishedAt: string
}

export interface PortalProjectDetail extends PortalProject {
  milestoneList: Array<{ id: string; title: string; description: string | null; status: MilestoneRow['status']; dueOn: string | null; completedAt: string | null }>
  /** Newest first. */
  timeline: TimelineEntry[]
  documents: PortalDocument[]
  /** The customer's own quote request this project came from, if it is linked to them. */
  request: { reference: string } | null
}

/** One of THIS customer's projects, by its reference: `null` for one that does not exist and for one that belongs to anybody else (the same answer). */
export function portalProject(app: Pick<AppContext, 'db' | 'clock'>, customerId: string, reference: string): PortalProjectDetail | null {
  const row = app.db.get<ProjectRow>('SELECT * FROM client_projects WHERE customer_id = ? AND reference = ?', [customerId, reference])
  if (!row) return null
  const milestones = app.db.all<MilestoneRow>('SELECT * FROM client_milestones WHERE project_id = ? AND customer_visible = 1 ORDER BY position', [row.id])
  const counted = milestones.filter((milestone) => milestone.status !== 'cancelled')
  const done = counted.filter((milestone) => milestone.completed_at).length
  const events = app.db.all<ProjectEventRow & { milestone_title: string | null }>(
    'SELECT e.*, m.title AS milestone_title FROM client_project_events e LEFT JOIN client_milestones m ON m.id = e.milestone_id LEFT JOIN project_tasks t ON t.id = e.task_id WHERE e.project_id = ? AND e.visibility = \'customer\' AND (m.id IS NULL OR m.customer_visible = 1) AND (e.task_id IS NULL OR t.customer_visible = 1) ORDER BY e.id DESC',
    [row.id],
  )
  const documents = app.db.all<DocumentRow>('SELECT * FROM client_documents WHERE project_id = ? AND published_at IS NOT NULL ORDER BY published_at DESC', [row.id])
  const request = row.quote_request_id ? app.db.get<{ reference: string }>('SELECT q.reference FROM quote_requests q JOIN customer_links l ON l.quote_request_id = q.id WHERE q.id = ? AND l.customer_id = ?', [row.quote_request_id, customerId]) : undefined
  return {
    ...toPortal(row, { project_id: row.id, total: counted.length, done }, nextOf(app, row.id), progressOf(app, row.id, 'customer')),
    milestoneList: milestones.map((milestone) => ({ id: milestone.id, title: milestone.title, description: milestone.description, status: milestone.status, dueOn: milestone.due_on, completedAt: milestone.completed_at })),
    timeline: events.map((event) => ({ id: event.id, type: event.event_type, at: event.created_at, fromStatus: event.from_status, toStatus: event.to_status, note: event.note, milestone: event.milestone_title, subject: event.subject })),
    documents: documents.map((doc) => ({ id: doc.id, title: doc.title, kind: doc.kind, fileName: doc.file_name, mimeType: doc.mime_type, sizeBytes: doc.size_bytes, publishedAt: doc.published_at! })),
    request: request ?? null,
  }
}

/** Every published document across the customer's projects. */
export const portalDocuments = (app: Pick<AppContext, 'db'>, customerId: string): Array<PortalDocument & { project: { reference: string; name: string } }> =>
  app.db
    .all<DocumentRow & { project_reference: string; project_name: string }>(
      'SELECT d.*, p.reference AS project_reference, p.name AS project_name FROM client_documents d JOIN client_projects p ON p.id = d.project_id WHERE p.customer_id = ? AND d.published_at IS NOT NULL ORDER BY d.published_at DESC',
      [customerId],
    )
    .map((doc) => ({ id: doc.id, title: doc.title, kind: doc.kind, fileName: doc.file_name, mimeType: doc.mime_type, sizeBytes: doc.size_bytes, publishedAt: doc.published_at!, project: { reference: doc.project_reference, name: doc.project_name } }))
