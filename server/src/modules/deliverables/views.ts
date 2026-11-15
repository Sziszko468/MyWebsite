import type { AppContext } from '../../context.ts'
import { notFound } from '../../http/errors.ts'
import { TERMINAL_STATUSES } from '../customers/model.ts'
import {
  type ApprovalRow,
  type CommentRow,
  type DeliverableRow,
  type DeliverableType,
  type EventRow,
  type EventType,
  type PublicationState,
  type ReviewState,
  type VersionRow,
} from './model.ts'
import { hostOf, isEmbeddable } from './preview.ts'
import { currentVersion } from './service.ts'

/**
 * What is returned about a deliverable. Two shapes, built apart on purpose.
 *
 * THE CUSTOMER'S is built field by field from a deliverable the session's customer owns and that was published: the internal description, the administrators' ids and e-mail
 * addresses, the private notes, the other side's unsent drafts and every version that is only a draft are not selected, so they cannot be returned by a mistake further on. The
 * studio's words appear as "studio", never as a person. THE OWNER'S has everything except a customer's unsent drafts (those are the customer's own until sent).
 */

// ---- the customer's ----------------------------------------------------------------------------------------------------------------------

export interface PortalVersion {
  number: number
  title: string
  description: string
  publishedAt: string
  current: boolean
  /** The fingerprint of exactly what was published (the customer confirms it when approving). */
  checksum: string
  previewUrl: string | null
  previewHost: string | null
  /** The address is on the owner's list: the page may show it inside a sandboxed frame. Otherwise it is a link. */
  embeddable: boolean
  imageUrl: string | null
  /** What became of an approval request about this version, if one was decided. */
  outcome: 'approved' | 'changes_requested' | null
  /** A request about this very version is waiting for the customer. */
  awaiting: boolean
}

export interface PortalComment {
  id: string
  parentId: string | null
  author: 'you' | 'studio'
  body: string
  position: { x: number; y: number } | null
  /** The number of the marker on the picture (the same on screen and in the list); `null` for a comment with no position. */
  marker: number | null
  status: 'draft' | 'submitted' | 'resolved'
  createdAt: string
  /** Only an unsent draft the customer wrote is theirs to change. */
  editable: boolean
}

export interface PortalApproval {
  id: string
  versionNumber: number
  checksum: string
  note: string | null
  requestedAt: string
  revision: number
}

export interface PortalHistoryLine {
  id: number
  type: EventType
  at: string
  version: number | null
  by: 'you' | 'studio' | 'system'
  note: string | null
  /** The count of comments in a piece of feedback. */
  subject: string | null
}

export interface PortalDeliverableSummary {
  reference: string
  title: string
  type: DeliverableType
  archived: boolean
  reviewState: ReviewState
  currentVersion: number
  versionTitle: string
  publishedAt: string
  updatedAt: string
  /** A request for the customer's decision is waiting. */
  awaitingApproval: boolean
  /** Threads of the customer's that are sent and not resolved. */
  openThreads: number
  approvedAt: string | null
}

export interface PortalDeliverableDetail extends PortalDeliverableSummary {
  description: string
  task: { reference: string; title: string } | null
  versions: PortalVersion[]
  /** The version the comments are of (the current one unless another was asked for). */
  viewing: number
  comments: PortalComment[]
  approval: PortalApproval | null
  history: PortalHistoryLine[]
  can: { comment: boolean; decide: boolean; follow: boolean }
  /** Unsent drafts on the current version, and on versions that were replaced since. */
  drafts: { current: number; earlier: number }
}

const by = (event: EventRow): 'you' | 'studio' | 'system' => (event.actor_type === 'customer' ? 'you' : event.actor_type === 'admin' ? 'studio' : 'system')

function summaryOf(app: Pick<AppContext, 'db'>, row: DeliverableRow): PortalDeliverableSummary {
  const version = app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE deliverable_id = ? AND number = ?', [row.id, row.current_version])!
  const approved = app.db.get<{ decided_at: string }>("SELECT decided_at FROM deliverable_approvals WHERE deliverable_id = ? AND state = 'approved' ORDER BY decided_at DESC LIMIT 1", [row.id])
  return {
    reference: row.reference,
    title: row.title,
    type: row.type,
    archived: row.publication_state === 'archived',
    reviewState: row.review_state,
    currentVersion: row.current_version,
    versionTitle: version.title,
    publishedAt: row.published_at!,
    updatedAt: row.updated_at,
    awaitingApproval: row.review_state === 'awaiting_customer',
    openThreads: app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM deliverable_comments WHERE deliverable_id = ? AND parent_id IS NULL AND author_type = 'customer' AND status = 'submitted'", [row.id])!.n,
    approvedAt: row.review_state === 'approved' ? (approved?.decided_at ?? null) : null,
  }
}

/** The customer's deliverables of ONE of their projects, newest first. Only what was published. */
export function portalDeliverables(app: Pick<AppContext, 'db'>, customerId: string, projectReference: string): PortalDeliverableSummary[] {
  const project = app.db.get<{ id: string }>('SELECT id FROM client_projects WHERE reference = ? AND customer_id = ?', [projectReference, customerId])
  if (!project) throw notFound('The project')
  return app.db.all<DeliverableRow>('SELECT * FROM deliverables WHERE project_id = ? AND published_at IS NOT NULL ORDER BY published_at DESC, rowid DESC', [project.id]).map((row) => summaryOf(app, row))
}

/** Every request the customer has to decide, across their projects: the overview's "waiting for your approval". */
export function portalAwaitingApproval(app: Pick<AppContext, 'db'>, customerId: string): Array<{ project: { reference: string; name: string }; deliverable: { reference: string; title: string }; version: number; requestedAt: string }> {
  return app.db
    .all<{ pref: string; pname: string; dref: string; dtitle: string; number: number; requested_at: string }>(
      `SELECT p.reference AS pref, p.name AS pname, d.reference AS dref, d.title AS dtitle, v.number, a.requested_at
       FROM deliverable_approvals a JOIN deliverables d ON d.id = a.deliverable_id JOIN client_projects p ON p.id = d.project_id JOIN deliverable_versions v ON v.id = a.version_id
       WHERE p.customer_id = ? AND a.state = 'requested' AND d.publication_state = 'published' AND d.published_at IS NOT NULL AND p.status NOT IN (${TERMINAL_STATUSES.map(() => '?').join(', ')})
       ORDER BY a.requested_at DESC LIMIT 20`,
      [customerId, ...TERMINAL_STATUSES],
    )
    .map((row) => ({ project: { reference: row.pref, name: row.pname }, deliverable: { reference: row.dref, title: row.dtitle }, version: row.number, requestedAt: row.requested_at }))
}

export function portalDeliverable(app: Pick<AppContext, 'db' | 'config'>, customerId: string, row: DeliverableRow, projectStatus: string, viewing: number | null): PortalDeliverableDetail {
  const versions = app.db.all<VersionRow>("SELECT * FROM deliverable_versions WHERE deliverable_id = ? AND status <> 'draft' ORDER BY number DESC", [row.id])
  const approvals = app.db.all<ApprovalRow>('SELECT * FROM deliverable_approvals WHERE deliverable_id = ? ORDER BY created_at, rowid', [row.id])
  const portalVersions: PortalVersion[] = versions.map((version) => {
    const own = approvals.filter((approval) => approval.version_id === version.id)
    const decided = [...own].reverse().find((approval) => approval.state === 'approved' || approval.state === 'changes_requested')
    return {
      number: version.number,
      title: version.title,
      description: version.customer_description,
      publishedAt: version.published_at!,
      current: version.number === row.current_version,
      checksum: version.checksum!,
      previewUrl: version.preview_url,
      previewHost: hostOf(version.preview_url),
      embeddable: isEmbeddable(version.preview_url, app.config.previewOrigins),
      imageUrl: version.image_url,
      outcome: decided ? (decided.state as 'approved' | 'changes_requested') : null,
      awaiting: own.some((approval) => approval.state === 'requested'),
    }
  })
  const shown = portalVersions.find((version) => version.number === viewing) ?? portalVersions.find((version) => version.current)!
  const shownRow = versions.find((version) => version.number === shown.number)!

  // The comments of the version being looked at: the customer's own (drafts included), the studio's replies, in the order they were made.
  const comments = app.db.all<CommentRow>(
    "SELECT * FROM deliverable_comments WHERE version_id = ? AND (status <> 'draft' OR (author_type = 'customer' AND author_id = ?)) ORDER BY created_at, rowid",
    [shownRow.id, customerId],
  )
  const markers = new Map<string, number>()
  for (const comment of comments) if (comment.parent_id === null && comment.x !== null) markers.set(comment.id, markers.size + 1)

  const open = approvals.find((approval) => approval.state === 'requested')
  const archived = row.publication_state === 'archived'
  const closed = TERMINAL_STATUSES.includes(projectStatus as never)
  const events = app.db.all<EventRow>("SELECT * FROM deliverable_events WHERE deliverable_id = ? AND visibility = 'customer' ORDER BY id DESC LIMIT 200", [row.id])
  const task = row.task_id ? app.db.get<{ reference: string; title: string }>('SELECT reference, title FROM project_tasks WHERE id = ? AND project_id = ? AND customer_visible = 1', [row.task_id, row.project_id]) : undefined
  const currentRow = currentVersion(app, row)
  const drafts = app.db.all<{ version_id: string }>("SELECT version_id FROM deliverable_comments WHERE deliverable_id = ? AND author_type = 'customer' AND author_id = ? AND status = 'draft'", [row.id, customerId])

  return {
    ...summaryOf(app, row),
    description: row.customer_description,
    task: task ?? null,
    versions: portalVersions,
    viewing: shown.number,
    comments: comments.map((comment) => ({
      id: comment.id,
      parentId: comment.parent_id,
      author: comment.author_type === 'customer' ? 'you' : 'studio',
      body: comment.body,
      position: comment.x === null ? null : { x: comment.x, y: comment.y! },
      marker: markers.get(comment.id) ?? null,
      status: comment.status,
      createdAt: comment.created_at,
      editable: comment.status === 'draft' && comment.author_type === 'customer' && shown.current && !archived && !closed,
    })),
    approval: open && currentRow && open.version_id === currentRow.id && !archived && !closed ? { id: open.id, versionNumber: currentRow.number, checksum: currentRow.checksum!, note: open.request_note, requestedAt: open.requested_at, revision: open.revision } : null,
    history: events.map((event) => ({ id: event.id, type: event.event_type, at: event.created_at, version: event.version_number, by: by(event), note: event.note, subject: event.subject })),
    can: { comment: !archived && !closed && shown.current, decide: !archived && !closed && Boolean(open), follow: !archived && !closed && shown.current },
    drafts: { current: drafts.filter((draft) => draft.version_id === currentRow?.id).length, earlier: drafts.filter((draft) => draft.version_id !== currentRow?.id).length },
  }
}

// ---- the owner's ---------------------------------------------------------------------------------------------------------------------

export interface AdminDeliverableRow {
  id: string
  reference: string
  title: string
  type: DeliverableType
  publicationState: PublicationState
  reviewState: ReviewState
  currentVersion: number
  versions: number
  hasDraft: boolean
  taskId: string | null
  lastCustomerActivityAt: string | null
  /** Threads the customer sent that are not resolved yet. */
  pendingFeedback: number
  awaitingApproval: boolean
  updatedAt: string
  revision: number
}

export function adminDeliverables(app: Pick<AppContext, 'db'>, projectId: string): AdminDeliverableRow[] {
  return app.db.all<DeliverableRow>('SELECT * FROM deliverables WHERE project_id = ? ORDER BY created_at DESC, rowid DESC', [projectId]).map((row) => ({
    id: row.id,
    reference: row.reference,
    title: row.title,
    type: row.type,
    publicationState: row.publication_state,
    reviewState: row.review_state,
    currentVersion: row.current_version,
    versions: app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM deliverable_versions WHERE deliverable_id = ?', [row.id])!.n,
    hasDraft: Boolean(app.db.get("SELECT 1 FROM deliverable_versions WHERE deliverable_id = ? AND status = 'draft'", [row.id])),
    taskId: row.task_id,
    lastCustomerActivityAt: row.last_customer_activity_at,
    pendingFeedback: app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM deliverable_comments WHERE deliverable_id = ? AND parent_id IS NULL AND author_type = 'customer' AND status = 'submitted'", [row.id])!.n,
    awaitingApproval: row.review_state === 'awaiting_customer',
    updatedAt: row.updated_at,
    revision: row.revision,
  }))
}

export interface AdminDeliverableDetail {
  deliverable: DeliverableRow
  versions: Array<VersionRow & { embeddable: boolean; previewHost: string | null }>
  comments: Array<CommentRow & { adminEmail: string | null; marker: number | null }>
  notes: Array<{ id: string; versionId: string | null; commentId: string | null; body: string; createdAt: string; authorEmail: string | null }>
  approvals: ApprovalRow[]
  events: Array<EventRow & { adminEmail: string | null }>
  task: { id: string; reference: string; title: string } | null
  /** The origins the owner allows to be embedded: said here so the screen can tell a link from a frame. */
  previewOrigins: readonly string[]
}

export function adminDeliverable(app: Pick<AppContext, 'db' | 'config'>, row: DeliverableRow): AdminDeliverableDetail {
  const versions = app.db.all<VersionRow>('SELECT * FROM deliverable_versions WHERE deliverable_id = ? ORDER BY number DESC', [row.id])
  // A customer's unsent drafts are theirs alone and are not shown to the owner.
  const comments = app.db.all<CommentRow & { admin_email: string | null }>(
    `SELECT c.*, u.email AS admin_email FROM deliverable_comments c LEFT JOIN admin_users u ON c.author_type = 'admin' AND u.id = c.author_id
     WHERE c.deliverable_id = ? AND c.status <> 'draft' ORDER BY c.created_at, c.rowid`,
    [row.id],
  )
  const markers = new Map<string, number>()
  const perVersion = new Map<string, number>()
  for (const comment of comments) {
    if (comment.parent_id !== null || comment.x === null) continue
    const next = (perVersion.get(comment.version_id) ?? 0) + 1
    perVersion.set(comment.version_id, next)
    markers.set(comment.id, next)
  }
  return {
    deliverable: row,
    versions: versions.map((version) => ({ ...version, embeddable: isEmbeddable(version.preview_url, app.config.previewOrigins), previewHost: hostOf(version.preview_url) })),
    comments: comments.map(({ admin_email, ...comment }) => ({ ...comment, adminEmail: admin_email, marker: markers.get(comment.id) ?? null })),
    notes: app.db
      .all<{ id: string; version_id: string | null; comment_id: string | null; body: string; created_at: string; email: string | null }>(
        'SELECT n.id, n.version_id, n.comment_id, n.body, n.created_at, u.email FROM deliverable_internal_notes n LEFT JOIN admin_users u ON u.id = n.author_id WHERE n.deliverable_id = ? ORDER BY n.created_at DESC',
        [row.id],
      )
      .map((note) => ({ id: note.id, versionId: note.version_id, commentId: note.comment_id, body: note.body, createdAt: note.created_at, authorEmail: note.email })),
    approvals: app.db.all<ApprovalRow>('SELECT * FROM deliverable_approvals WHERE deliverable_id = ? ORDER BY created_at DESC, rowid DESC', [row.id]),
    events: app.db
      .all<EventRow & { admin_email: string | null }>("SELECT e.*, u.email AS admin_email FROM deliverable_events e LEFT JOIN admin_users u ON e.actor_type = 'admin' AND u.id = e.actor_id WHERE e.deliverable_id = ? ORDER BY e.id DESC LIMIT 500", [row.id])
      .map(({ admin_email, ...event }) => ({ ...event, adminEmail: admin_email })),
    task: row.task_id ? (app.db.get<{ id: string; reference: string; title: string }>('SELECT id, reference, title FROM project_tasks WHERE id = ?', [row.task_id]) ?? null) : null,
    previewOrigins: app.config.previewOrigins,
  }
}
