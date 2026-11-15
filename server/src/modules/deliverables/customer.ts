import type { AppContext } from '../../context.ts'
import { notFound, validationFailed } from '../../http/errors.ts'
import { newId } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import { TERMINAL_STATUSES, type ProjectRow } from '../customers/model.ts'
import { refuse } from '../customers/projects.ts'
import { tellOwner } from './notify.ts'
import { LIMITS, type ApprovalRow, type CommentRow, type DeliverableRow, type VersionRow } from './model.ts'
import { approvalIn, closeApproval, currentVersion, recomputeReview, recordEvent, reopenThread, stale, touch } from './service.ts'

/**
 * What a customer may DO with a deliverable (PROMPT 27), and nothing else: write drafts of feedback on the current version (edit and delete them while they are drafts), send
 * them, follow up on a thread, reopen a resolved one, and decide an approval request (approve one exact version, ask for changes with an explanation, withdraw). Everything
 * starts from `ownDeliverable`: the project is the SESSION'S customer's and the deliverable was published; anything else is the same "not found" as something that does not
 * exist. Nothing here accepts a customer id, a project id, an author or a version from the browser: the version is always the current one, the author is always the session.
 */

export function ownDeliverable(app: Pick<AppContext, 'db'>, customerId: string, projectReference: string, deliverableReference: string): { deliverable: DeliverableRow; project: ProjectRow } {
  const deliverable = app.db.get<DeliverableRow>(
    `SELECT d.* FROM deliverables d JOIN client_projects p ON p.id = d.project_id
     WHERE p.reference = ? AND d.reference = ? AND p.customer_id = ? AND d.published_at IS NOT NULL`,
    [projectReference, deliverableReference, customerId],
  )
  if (!deliverable) throw notFound('The deliverable')
  const project = app.db.get<ProjectRow>('SELECT * FROM client_projects WHERE id = ?', [deliverable.project_id])!
  return { deliverable, project }
}

/** Feedback and decisions are for a published deliverable in a project that is not finished or cancelled. */
function open(deliverable: DeliverableRow, project: ProjectRow): void {
  if (deliverable.publication_state !== 'published') throw refuse('This deliverable is archived and can no longer be reviewed.', 'archived')
  if (TERMINAL_STATUSES.includes(project.status)) throw refuse('This project is closed.', 'project_closed')
}

export interface Position {
  x: number
  y: number
}

/** A position is two numbers in 0 to 1 (the share of the picture's width and height from its top left), both or neither. */
export function checkPosition(position: Position | null): Position | null {
  if (position === null) return null
  const { x, y } = position
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) throw validationFailed({ position: 'invalid' })
  // Four decimals are a hundredth of a percent: more is noise, and the same number is stored whatever size the picture is shown at.
  return { x: Math.round(x * 10_000) / 10_000, y: Math.round(y * 10_000) / 10_000 }
}

function ownDraft(app: Pick<AppContext, 'db'>, customerId: string, deliverable: DeliverableRow, commentId: string): CommentRow {
  const row = app.db.get<CommentRow>("SELECT * FROM deliverable_comments WHERE id = ? AND deliverable_id = ? AND author_type = 'customer' AND author_id = ? AND status = 'draft'", [commentId, deliverable.id, customerId])
  if (!row) throw notFound('The comment')
  return row
}

// ---- drafts ---------------------------------------------------------------------------------------------------------------------------

export function createDraft(app: AppContext, customerId: string, projectReference: string, deliverableReference: string, input: { body: string; position: Position | null }): CommentRow {
  return app.db.transaction(() => {
    const { deliverable, project } = ownDeliverable(app, customerId, projectReference, deliverableReference)
    open(deliverable, project)
    const version = currentVersion(app, deliverable)
    if (!version) throw notFound('The deliverable')
    const position = checkPosition(input.position)
    // A position is on a picture: a version with no picture has none to point at.
    if (position && !version.image_url) throw validationFailed({ position: 'invalid' })
    const drafts = app.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM deliverable_comments WHERE deliverable_id = ? AND author_type = 'customer' AND status = 'draft'", [deliverable.id])!.n
    const all = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM deliverable_comments WHERE deliverable_id = ?', [deliverable.id])!.n
    if (drafts >= LIMITS.drafts || all >= LIMITS.comments) throw validationFailed({ body: 'tooMany' })
    const now = iso(app.clock.now())
    const id = newId()
    app.db.run(
      "INSERT INTO deliverable_comments (id, deliverable_id, version_id, parent_id, author_type, author_id, body, x, y, status, created_at, updated_at) VALUES (?, ?, ?, NULL, 'customer', ?, ?, ?, ?, 'draft', ?, ?)",
      [id, deliverable.id, version.id, customerId, input.body, position?.x ?? null, position?.y ?? null, now, now],
    )
    return app.db.get<CommentRow>('SELECT * FROM deliverable_comments WHERE id = ?', [id])!
  })
}

/** Changes a draft the customer wrote. Once it is sent it is never changed (the database refuses): they follow up instead. */
export function editDraft(app: AppContext, customerId: string, projectReference: string, deliverableReference: string, commentId: string, changes: { body?: string; position?: Position | null }): CommentRow {
  return app.db.transaction(() => {
    const { deliverable, project } = ownDeliverable(app, customerId, projectReference, deliverableReference)
    open(deliverable, project)
    const draft = ownDraft(app, customerId, deliverable, commentId)
    const version = app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE id = ?', [draft.version_id])!
    const position = changes.position === undefined ? (draft.x === null ? null : { x: draft.x, y: draft.y! }) : checkPosition(changes.position)
    if (position && !version.image_url) throw validationFailed({ position: 'invalid' })
    const result = app.db.run("UPDATE deliverable_comments SET body = ?, x = ?, y = ?, updated_at = ? WHERE id = ? AND status = 'draft'", [changes.body ?? draft.body, position?.x ?? null, position?.y ?? null, iso(app.clock.now()), commentId])
    if (result.changes !== 1) throw notFound('The comment')
    return app.db.get<CommentRow>('SELECT * FROM deliverable_comments WHERE id = ?', [commentId])!
  })
}

export function deleteDraft(app: AppContext, customerId: string, projectReference: string, deliverableReference: string, commentId: string): void {
  app.db.transaction(() => {
    const { deliverable } = ownDeliverable(app, customerId, projectReference, deliverableReference)
    ownDraft(app, customerId, deliverable, commentId)
    app.db.run("DELETE FROM deliverable_comments WHERE id = ? AND status = 'draft'", [commentId])
  })
}

// ---- sending ---------------------------------------------------------------------------------------------------------------------------

/**
 * Sends every draft the customer wrote on the CURRENT version, as one piece of feedback: from this moment each comment is final. One line of history, one message to the owner
 * (the outbox allows one per line). Drafts on an earlier version are not sent: the customer deletes them, or they stay as unsent drafts of that version.
 */
export function sendFeedback(app: AppContext, customerId: string, projectReference: string, deliverableReference: string): { sent: number } {
  return app.db.transaction(() => {
    const { deliverable, project } = ownDeliverable(app, customerId, projectReference, deliverableReference)
    open(deliverable, project)
    const version = currentVersion(app, deliverable)
    if (!version) throw notFound('The deliverable')
    const now = iso(app.clock.now())
    const result = app.db.run("UPDATE deliverable_comments SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE deliverable_id = ? AND version_id = ? AND author_type = 'customer' AND author_id = ? AND status = 'draft'", [now, now, deliverable.id, version.id, customerId])
    if (result.changes === 0) throw refuse('There is no feedback to send.', 'nothing_to_send')
    touch(app, deliverable.id, null, true)
    const eventId = recordEvent(app, { deliverableId: deliverable.id, versionId: version.id, versionNumber: version.number, type: 'feedback_submitted', actor: 'customer', actorId: customerId, subject: String(result.changes) })
    tellOwner(app, 'deliverable_feedback_admin', eventId)
    return { sent: result.changes }
  })
}

/** More words after something was sent: a new, final comment in the thread (what was said before is kept as it was). Not for a resolved thread (reopen it first). */
export function followUp(app: AppContext, customerId: string, projectReference: string, deliverableReference: string, commentId: string, body: string): CommentRow {
  return app.db.transaction(() => {
    const { deliverable, project } = ownDeliverable(app, customerId, projectReference, deliverableReference)
    open(deliverable, project)
    const version = currentVersion(app, deliverable)
    if (!version) throw notFound('The deliverable')
    const target = app.db.get<CommentRow>("SELECT * FROM deliverable_comments WHERE id = ? AND deliverable_id = ? AND version_id = ? AND status <> 'draft'", [commentId, deliverable.id, version.id])
    if (!target) throw notFound('The comment')
    const root = target.parent_id ? app.db.get<CommentRow>('SELECT * FROM deliverable_comments WHERE id = ?', [target.parent_id])! : target
    if (root.status === 'resolved') throw refuse('This thread is resolved. Reopen it to add to it.', 'thread_resolved')
    const total = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM deliverable_comments WHERE deliverable_id = ?', [deliverable.id])!.n
    if (total >= LIMITS.comments) throw validationFailed({ body: 'tooMany' })
    const now = iso(app.clock.now())
    const id = newId()
    app.db.run("INSERT INTO deliverable_comments (id, deliverable_id, version_id, parent_id, author_type, author_id, body, status, submitted_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'customer', ?, ?, 'submitted', ?, ?, ?)", [id, deliverable.id, version.id, target.id, customerId, body, now, now, now])
    touch(app, deliverable.id, null, true)
    const eventId = recordEvent(app, { deliverableId: deliverable.id, versionId: version.id, versionNumber: version.number, commentId: id, type: 'follow_up_posted', actor: 'customer', actorId: customerId, note: body })
    tellOwner(app, 'deliverable_feedback_admin', eventId)
    return app.db.get<CommentRow>('SELECT * FROM deliverable_comments WHERE id = ?', [id])!
  })
}

export function reopen(app: AppContext, customerId: string, projectReference: string, deliverableReference: string, commentId: string): CommentRow {
  const { deliverable, project } = ownDeliverable(app, customerId, projectReference, deliverableReference)
  open(deliverable, project)
  return reopenThread(app, { type: 'customer', id: customerId }, deliverable, commentId)
}

// ---- the decision ------------------------------------------------------------------------------------------------------------------------

export interface Approve {
  /** The customer's own, explicit yes: exactly `true`. Opening a page, pressing anything else or sending nothing is never one. */
  confirm: unknown
  versionNumber: number
  checksum: string
  revision: number
}

/**
 * Approves ONE EXACT version. The request must be waiting (`requested`) and about the current published version; the customer must say which version they confirm (its number
 * AND the fingerprint of what they were shown), and the server refuses a mismatch (`version_mismatch`): a stale page, a replaced version or a tampered request approves nothing.
 * The move is one conditional UPDATE on the state and the revision, so two requests at once approve once; the database allows one approval per version.
 */
export function approve(app: AppContext, customerId: string, projectReference: string, deliverableReference: string, approvalId: string, input: Approve): ApprovalRow {
  return app.db.transaction(() => {
    const { deliverable, project } = ownDeliverable(app, customerId, projectReference, deliverableReference)
    open(deliverable, project)
    if (input.confirm !== true) throw validationFailed({ confirm: 'consentRequired' })
    const approval = approvalIn(app, deliverable, approvalId)
    if (approval.state !== 'requested') throw refuse('This request was already decided, withdrawn or replaced.', approval.state === 'superseded' ? 'superseded' : 'invalid_transition')
    if (input.revision !== approval.revision) throw stale()
    const version = app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE id = ?', [approval.version_id])!
    const current = currentVersion(app, deliverable)
    if (!current || current.id !== version.id || version.status !== 'published') throw refuse('This version was replaced by a newer one.', 'superseded')
    if (input.versionNumber !== version.number || input.checksum !== version.checksum) throw refuse('The version you confirmed is not the one this request is about.', 'version_mismatch')
    const now = iso(app.clock.now())
    const result = app.db.run("UPDATE deliverable_approvals SET state = 'approved', decided_at = ?, decided_by_customer = ?, confirmed_version = ?, confirmed_checksum = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND state = 'requested' AND revision = ?", [now, customerId, version.number, version.checksum, now, approvalId, approval.revision])
    if (result.changes !== 1) throw refuse('This request was already decided, withdrawn or replaced.', 'invalid_transition')
    recomputeReview(app, deliverable.id)
    touch(app, deliverable.id, null, true)
    const eventId = recordEvent(app, { deliverableId: deliverable.id, versionId: version.id, versionNumber: version.number, approvalId, type: 'approval_approved', actor: 'customer', actorId: customerId, from: 'requested', to: 'approved' })
    tellOwner(app, 'deliverable_approved_admin', eventId)
    return app.db.get<ApprovalRow>('SELECT * FROM deliverable_approvals WHERE id = ?', [approvalId])!
  })
}

/** Asks for changes to the version the request is about, with an explanation the owner will read (required). Final for that request. */
export function requestChanges(app: AppContext, customerId: string, projectReference: string, deliverableReference: string, approvalId: string, input: { explanation: string; revision: number }): ApprovalRow {
  return app.db.transaction(() => {
    const { deliverable, project } = ownDeliverable(app, customerId, projectReference, deliverableReference)
    open(deliverable, project)
    const approval = approvalIn(app, deliverable, approvalId)
    if (approval.state !== 'requested') throw refuse('This request was already decided, withdrawn or replaced.', approval.state === 'superseded' ? 'superseded' : 'invalid_transition')
    if (input.revision !== approval.revision) throw stale()
    const version = app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE id = ?', [approval.version_id])!
    const current = currentVersion(app, deliverable)
    if (!current || current.id !== version.id) throw refuse('This version was replaced by a newer one.', 'superseded')
    const now = iso(app.clock.now())
    const result = app.db.run("UPDATE deliverable_approvals SET state = 'changes_requested', decided_at = ?, decided_by_customer = ?, decision_note = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND state = 'requested' AND revision = ?", [now, customerId, input.explanation, now, approvalId, approval.revision])
    if (result.changes !== 1) throw refuse('This request was already decided, withdrawn or replaced.', 'invalid_transition')
    recomputeReview(app, deliverable.id)
    touch(app, deliverable.id, null, true)
    const eventId = recordEvent(app, { deliverableId: deliverable.id, versionId: version.id, versionNumber: version.number, approvalId, type: 'approval_changes_requested', actor: 'customer', actorId: customerId, from: 'requested', to: 'changes_requested', note: input.explanation })
    tellOwner(app, 'deliverable_changes_requested_admin', eventId)
    return app.db.get<ApprovalRow>('SELECT * FROM deliverable_approvals WHERE id = ?', [approvalId])!
  })
}

/** The customer withdraws a request nobody has decided yet (they are not ready to decide). A decided request cannot be withdrawn. */
export function withdraw(app: AppContext, customerId: string, projectReference: string, deliverableReference: string, approvalId: string, revision: number): ApprovalRow {
  const { deliverable, project } = ownDeliverable(app, customerId, projectReference, deliverableReference)
  open(deliverable, project)
  return closeApproval(app, { type: 'customer', id: customerId }, deliverable, approvalId, revision)
}
