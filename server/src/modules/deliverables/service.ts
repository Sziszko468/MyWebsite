import type { AppContext } from '../../context.ts'
import { HttpError, notFound, validationFailed } from '../../http/errors.ts'
import { newId, newReference, sha256Hex } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import { TERMINAL_STATUSES } from '../customers/model.ts'
import { getProject, refuse } from '../customers/projects.ts'
import { tellCustomer } from './notify.ts'
import {
  REQUIRES,
  type ApprovalRow,
  type CommentRow,
  type DeliverableRow,
  type DeliverableType,
  type EventRow,
  type EventType,
  type ReviewState,
  type VersionRow,
} from './model.ts'
import { isEmbeddable, parsePreviewUrl } from './preview.ts'

/**
 * The deliverables of a project, from the owner's side, and the rules every side shares. Every function is ONE transaction: the change, the line of history that records it and
 * everything it must also change (a pending approval is superseded when a new version is published; the review state follows) happen together or not at all. The permission is
 * checked by the caller (admin.ts); the rules that protect the data are checked HERE, and again by the database (triggers and CHECKs in migration 0014), so no other caller can
 * skip them.
 *
 * What is promised: a published version is never changed (a change is a new version); version numbers rise by one; an approval is about one exact published version and is never
 * given by opening or viewing; nothing unpublished is ever visible to a customer; the owner's private notes live in their own table.
 */

export const getDeliverable = (app: Pick<AppContext, 'db'>, id: string): DeliverableRow | undefined => app.db.get<DeliverableRow>('SELECT * FROM deliverables WHERE id = ?', [id])

/** A deliverable through ITS project: the id of another project's deliverable answers "not found", the same as an id that does not exist. */
export function deliverableIn(app: Pick<AppContext, 'db'>, projectId: string, id: string): DeliverableRow {
  const row = app.db.get<DeliverableRow>('SELECT * FROM deliverables WHERE id = ? AND project_id = ?', [id, projectId])
  if (!row) throw notFound('The deliverable')
  return row
}

export const versionByNumber = (app: Pick<AppContext, 'db'>, deliverableId: string, number: number): VersionRow | undefined =>
  app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE deliverable_id = ? AND number = ?', [deliverableId, number])

export function versionIn(app: Pick<AppContext, 'db'>, deliverable: DeliverableRow, versionId: string): VersionRow {
  const row = app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE id = ? AND deliverable_id = ?', [versionId, deliverable.id])
  if (!row) throw notFound('The version')
  return row
}

/** The newest version of any status (the draft being prepared, if there is one). */
export const latestVersion = (app: Pick<AppContext, 'db'>, deliverableId: string): VersionRow | undefined =>
  app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE deliverable_id = ? ORDER BY number DESC LIMIT 1', [deliverableId])

/** The version the customer is asked about: the newest PUBLISHED one. */
export const currentVersion = (app: Pick<AppContext, 'db'>, deliverable: DeliverableRow): VersionRow | undefined => {
  const version = versionByNumber(app, deliverable.id, deliverable.current_version)
  return version && version.status === 'published' ? version : undefined
}

export const newDeliverableReference = (app: Pick<AppContext, 'db'>): string => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reference = newReference('DLV')
    if (!app.db.get('SELECT 1 FROM deliverables WHERE reference = ?', [reference])) return reference
  }
  throw new Error('Could not make a unique deliverable reference.')
}

export const stale = (): HttpError => refuse('This deliverable was changed by someone else. Reload it and try again.', 'stale')

// ---- the history -----------------------------------------------------------------------------------------------------------------------

export interface NewEvent {
  deliverableId: string
  versionId?: string | null
  versionNumber?: number | null
  commentId?: string | null
  approvalId?: string | null
  type: EventType
  actor: 'admin' | 'customer' | 'system'
  actorId?: string | null
  from?: string | null
  to?: string | null
  subject?: string | null
  note?: string | null
  visibility?: 'customer' | 'internal'
}

export function recordEvent(app: Pick<AppContext, 'db' | 'clock'>, e: NewEvent): number {
  return app.db.run(
    'INSERT INTO deliverable_events (deliverable_id, version_id, version_number, comment_id, approval_id, event_type, actor_type, actor_id, from_state, to_state, subject, note, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [e.deliverableId, e.versionId ?? null, e.versionNumber ?? null, e.commentId ?? null, e.approvalId ?? null, e.type, e.actor, e.actorId ?? null, e.from ?? null, e.to ?? null, e.subject ?? null, e.note ?? null, e.visibility ?? 'customer', iso(app.clock.now())],
  ).lastInsertRowid
}

export const eventOf = (app: Pick<AppContext, 'db'>, id: number): EventRow | undefined => app.db.get<EventRow>('SELECT * FROM deliverable_events WHERE id = ?', [id])

/** Puts the deliverable's `updated_at`, `revision` and (when asked) the customer's last activity forward. */
export function touch(app: Pick<AppContext, 'db' | 'clock'>, deliverableId: string, adminId: string | null, customerActivity = false): void {
  const now = iso(app.clock.now())
  app.db.run('UPDATE deliverables SET revision = revision + 1, updated_at = ?, updated_by = COALESCE(?, updated_by), last_customer_activity_at = CASE WHEN ? = 1 THEN ? ELSE last_customer_activity_at END WHERE id = ?', [now, adminId, customerActivity ? 1 : 0, now, deliverableId])
}

// ---- the review state ----------------------------------------------------------------------------------------------------------------

/**
 * The one rule for `review_state`, recomputed in the same transaction as every approval step (so it can never drift):
 *  - the current version has a request waiting → `awaiting_customer`;
 *  - else the newest DECIDED approval of the current version → `approved` or `changes_requested`;
 *  - else (nothing decided about the current version): if an EARLIER version was ever asked about or decided → `superseded` (a newer version replaced what was reviewed);
 *    otherwise `not_submitted`.
 * A cancelled or withdrawn request decides nothing.
 */
export function recomputeReview(app: Pick<AppContext, 'db'>, deliverableId: string): ReviewState {
  const deliverable = getDeliverable(app, deliverableId)!
  const current = currentVersion(app, deliverable)
  let state: ReviewState = 'not_submitted'
  if (current) {
    const own = app.db.all<{ state: string }>('SELECT state FROM deliverable_approvals WHERE version_id = ? ORDER BY created_at DESC, rowid DESC', [current.id])
    if (own.some((row) => row.state === 'requested')) state = 'awaiting_customer'
    else {
      const decided = own.find((row) => row.state === 'approved' || row.state === 'changes_requested')
      if (decided) state = decided.state as ReviewState
      else if (app.db.get('SELECT 1 FROM deliverable_approvals WHERE deliverable_id = ? AND version_id <> ? AND state IN (\'approved\', \'changes_requested\', \'superseded\')', [deliverableId, current.id])) state = 'superseded'
    }
  }
  app.db.run('UPDATE deliverables SET review_state = ? WHERE id = ?', [state, deliverableId])
  return state
}

// ---- creating and editing ---------------------------------------------------------------------------------------------------------

export interface VersionContent {
  title: string
  customerDescription: string
  previewUrl: string | null
  imageUrl: string | null
}

/** Checks the two addresses of a version: https, a registered-looking host; the picture's origin must be one the owner allows (nothing else could be shown). */
export function checkAddresses(app: Pick<AppContext, 'config'>, content: Pick<VersionContent, 'previewUrl' | 'imageUrl'>): { previewUrl: string | null; imageUrl: string | null } {
  const out: { previewUrl: string | null; imageUrl: string | null } = { previewUrl: null, imageUrl: null }
  if (content.previewUrl) {
    const parsed = parsePreviewUrl(content.previewUrl)
    if (!parsed.ok) throw validationFailed({ previewUrl: 'invalidUrl' })
    out.previewUrl = parsed.value.url
  }
  if (content.imageUrl) {
    const parsed = parsePreviewUrl(content.imageUrl)
    if (!parsed.ok) throw validationFailed({ imageUrl: 'invalidUrl' })
    if (!isEmbeddable(parsed.value.url, app.config.previewOrigins)) throw validationFailed({ imageUrl: 'invalid' })
    out.imageUrl = parsed.value.url
  }
  return out
}

function checkTask(app: Pick<AppContext, 'db'>, projectId: string, taskId: string | null): void {
  if (taskId && !app.db.get('SELECT 1 FROM project_tasks WHERE id = ? AND project_id = ?', [taskId, projectId])) throw validationFailed({ taskId: 'invalid' })
}

export interface NewDeliverable {
  title: string
  type: DeliverableType
  customerDescription: string
  internalDescription: string
  taskId: string | null
  version: VersionContent
}

export function createDeliverable(app: AppContext, adminId: string, projectId: string, input: NewDeliverable): { deliverable: DeliverableRow; version: VersionRow } {
  return app.db.transaction(() => {
    const project = getProject(app, projectId)
    if (!project) throw notFound('The project')
    if (TERMINAL_STATUSES.includes(project.status)) throw refuse('A finished or cancelled project cannot be given a new deliverable.', 'project_closed')
    checkTask(app, projectId, input.taskId)
    const addresses = checkAddresses(app, input.version)
    const now = iso(app.clock.now())
    const id = newId()
    const versionId = newId()
    app.db.run(
      `INSERT INTO deliverables (id, reference, project_id, task_id, title, customer_description, internal_description, type, publication_state, review_state, current_version, revision, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'not_submitted', 1, 1, ?, ?, ?, ?)`,
      [id, newDeliverableReference(app), projectId, input.taskId, input.title, input.customerDescription, input.internalDescription, input.type, adminId, adminId, now, now],
    )
    app.db.run(
      "INSERT INTO deliverable_versions (id, deliverable_id, number, title, customer_description, preview_url, image_url, status, created_by, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, 'draft', ?, ?)",
      [versionId, id, input.version.title || input.title, input.version.customerDescription, addresses.previewUrl, addresses.imageUrl, adminId, now],
    )
    recordEvent(app, { deliverableId: id, versionId, versionNumber: 1, type: 'deliverable_created', actor: 'admin', actorId: adminId, subject: input.title, visibility: 'internal' })
    return { deliverable: getDeliverable(app, id)!, version: versionByNumber(app, id, 1)! }
  })
}

export interface DeliverableChanges {
  title?: string
  customerDescription?: string
  internalDescription?: string
  taskId?: string | null
  type?: DeliverableType
}

/** Edits the deliverable's own words and its task. The type can change only while nothing was published. `expectedRevision` is the revision the screen last read. */
export function updateDeliverable(app: AppContext, adminId: string, projectId: string, id: string, changes: DeliverableChanges, expectedRevision: number | null): DeliverableRow {
  return app.db.transaction(() => {
    const row = deliverableIn(app, projectId, id)
    if (expectedRevision !== null && expectedRevision !== row.revision) throw stale()
    if (changes.type !== undefined && changes.type !== row.type && row.published_at) throw refuse('The type of a deliverable that was published cannot change.', 'type_locked')
    if (changes.taskId !== undefined) checkTask(app, projectId, changes.taskId)
    const next = {
      title: changes.title ?? row.title,
      customer_description: changes.customerDescription ?? row.customer_description,
      internal_description: changes.internalDescription ?? row.internal_description,
      task_id: changes.taskId === undefined ? row.task_id : changes.taskId,
      type: changes.type ?? row.type,
    }
    const changed = (Object.keys(next) as Array<keyof typeof next>).filter((key) => next[key] !== row[key])
    if (changed.length === 0) return row
    const now = iso(app.clock.now())
    const result = app.db.run('UPDATE deliverables SET title = ?, customer_description = ?, internal_description = ?, task_id = ?, type = ?, revision = revision + 1, updated_by = ?, updated_at = ? WHERE id = ? AND revision = ?', [next.title, next.customer_description, next.internal_description, next.task_id, next.type, adminId, now, id, row.revision])
    if (result.changes !== 1) throw stale()
    recordEvent(app, { deliverableId: id, type: 'deliverable_edited', actor: 'admin', actorId: adminId, subject: next.title, note: changed.join(', '), visibility: 'internal' })
    return getDeliverable(app, id)!
  })
}

/** Edits the DRAFT version. A published version is never edited (409 `version_published`): a change is a new version. */
export function updateVersion(app: AppContext, adminId: string, projectId: string, id: string, versionId: string, changes: Partial<VersionContent>): VersionRow {
  return app.db.transaction(() => {
    const deliverable = deliverableIn(app, projectId, id)
    const version = versionIn(app, deliverable, versionId)
    if (version.status !== 'draft') throw refuse('A published version is never changed. Make a new version instead.', 'version_published')
    // An address is checked only when it is being changed, so an old draft is not refused for a rule that came later.
    const addresses = checkAddresses(app, { previewUrl: changes.previewUrl ?? null, imageUrl: changes.imageUrl ?? null })
    const next = {
      title: changes.title ?? version.title,
      customer_description: changes.customerDescription ?? version.customer_description,
      preview_url: changes.previewUrl === undefined ? version.preview_url : addresses.previewUrl,
      image_url: changes.imageUrl === undefined ? version.image_url : addresses.imageUrl,
    }
    app.db.run('UPDATE deliverable_versions SET title = ?, customer_description = ?, preview_url = ?, image_url = ? WHERE id = ?', [next.title, next.customer_description, next.preview_url, next.image_url, versionId])
    touch(app, id, adminId)
    recordEvent(app, { deliverableId: id, versionId, versionNumber: version.number, type: 'version_edited', actor: 'admin', actorId: adminId, subject: next.title, visibility: 'internal' })
    return app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE id = ?', [versionId])!
  })
}

/** Starts the next version as a draft, with the newest version's content as the starting point. Refused while a draft exists, or while the deliverable is not published or is archived. */
export function createVersion(app: AppContext, adminId: string, projectId: string, id: string): VersionRow {
  return app.db.transaction(() => {
    const deliverable = deliverableIn(app, projectId, id)
    if (deliverable.publication_state === 'archived') throw refuse('An archived deliverable cannot be given a new version.', 'archived')
    const latest = latestVersion(app, id)!
    if (latest.status === 'draft') throw refuse('A version is already being prepared.', 'draft_exists')
    const now = iso(app.clock.now())
    const versionId = newId()
    app.db.run(
      "INSERT INTO deliverable_versions (id, deliverable_id, number, title, customer_description, preview_url, image_url, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)",
      [versionId, id, latest.number + 1, latest.title, latest.customer_description, latest.preview_url, latest.image_url, adminId, now],
    )
    touch(app, id, adminId)
    recordEvent(app, { deliverableId: id, versionId, versionNumber: latest.number + 1, type: 'version_created', actor: 'admin', actorId: adminId, visibility: 'internal' })
    return app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE id = ?', [versionId])!
  })
}

/** The fingerprint of exactly what a customer is shown for a version: the SHA-256 of its reference, number, words and addresses. */
export const checksumOf = (deliverable: Pick<DeliverableRow, 'reference'>, version: Pick<VersionRow, 'number' | 'title' | 'customer_description' | 'preview_url' | 'image_url'>): string =>
  sha256Hex(JSON.stringify([deliverable.reference, version.number, version.title, version.customer_description, version.preview_url, version.image_url]))

/**
 * Publishes a draft version. From here on it is immutable. It must carry what its type needs (an image needs a picture, a website preview needs an address; the rest need words or
 * an address). The version it follows becomes `superseded`, a request for approval of the old version is superseded with it (an approval of version 2 never approves version 3),
 * the review state follows, and the customer is told (the first publication is "ready for review", a later one "a new version").
 */
export function publishVersion(app: AppContext, adminId: string, projectId: string, id: string, versionId: string): VersionRow {
  return app.db.transaction(() => {
    const deliverable = deliverableIn(app, projectId, id)
    const project = getProject(app, projectId)!
    if (deliverable.publication_state === 'archived') throw refuse('An archived deliverable cannot be published.', 'archived')
    if (TERMINAL_STATUSES.includes(project.status)) throw refuse('A finished or cancelled project cannot be given new versions.', 'project_closed')
    const version = versionIn(app, deliverable, versionId)
    if (version.status !== 'draft') throw refuse('This version is already published.', 'version_published')
    const needs = REQUIRES[deliverable.type]
    const missing = needs === 'preview_url' ? !version.preview_url : needs === 'image_url' ? !version.image_url : !version.preview_url && !version.image_url && version.customer_description.trim().length === 0
    if (missing) throw refuse('This version lacks what its type needs to be published.', 'version_incomplete')
    const now = iso(app.clock.now())
    const first = deliverable.published_at === null
    const previous = currentVersion(app, deliverable)
    app.db.run("UPDATE deliverable_versions SET status = 'published', published_at = ?, published_by = ?, checksum = ? WHERE id = ? AND status = 'draft'", [now, adminId, checksumOf(deliverable, version), versionId])
    if (previous) app.db.run("UPDATE deliverable_versions SET status = 'superseded' WHERE id = ?", [previous.id])
    app.db.run("UPDATE deliverables SET current_version = ?, publication_state = 'published', published_at = COALESCE(published_at, ?) WHERE id = ?", [version.number, now, id])
    touch(app, id, adminId)
    // An approval request about the version that was replaced is no longer about the current one: it ends here, and says so in the history.
    for (const open of app.db.all<ApprovalRow>("SELECT * FROM deliverable_approvals WHERE deliverable_id = ? AND state = 'requested'", [id])) {
      app.db.run("UPDATE deliverable_approvals SET state = 'superseded', closed_by = 'system', updated_at = ?, revision = revision + 1 WHERE id = ? AND state = 'requested'", [now, open.id])
      recordEvent(app, { deliverableId: id, versionId: open.version_id, approvalId: open.id, type: 'approval_superseded', actor: 'system', from: 'requested', to: 'superseded', note: null })
    }
    recomputeReview(app, id)
    const eventId = recordEvent(app, { deliverableId: id, versionId, versionNumber: version.number, type: 'version_published', actor: 'admin', actorId: adminId, subject: version.title })
    tellCustomer(app, project.customer_id, first ? 'client_deliverable_ready' : 'client_deliverable_new_version', eventId)
    return app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE id = ?', [versionId])!
  })
}

/** Archives a published deliverable: it stays readable to the customer, read-only (no feedback, no approval), and an open request ends. A deliverable never published is removed instead. */
export function archiveDeliverable(app: AppContext, adminId: string, projectId: string, id: string): DeliverableRow {
  return app.db.transaction(() => {
    const deliverable = deliverableIn(app, projectId, id)
    if (!deliverable.published_at) throw refuse('A deliverable that was never published is removed, not archived.', 'not_published')
    if (deliverable.publication_state === 'archived') return deliverable
    const now = iso(app.clock.now())
    for (const open of app.db.all<ApprovalRow>("SELECT * FROM deliverable_approvals WHERE deliverable_id = ? AND state = 'requested'", [id])) {
      app.db.run("UPDATE deliverable_approvals SET state = 'cancelled', closed_by = 'system', updated_at = ?, revision = revision + 1 WHERE id = ? AND state = 'requested'", [now, open.id])
      recordEvent(app, { deliverableId: id, versionId: open.version_id, approvalId: open.id, type: 'approval_cancelled', actor: 'system', from: 'requested', to: 'cancelled' })
    }
    app.db.run("UPDATE deliverables SET publication_state = 'archived' WHERE id = ?", [id])
    recomputeReview(app, id)
    touch(app, id, adminId)
    recordEvent(app, { deliverableId: id, type: 'deliverable_archived', actor: 'admin', actorId: adminId, subject: deliverable.title })
    return getDeliverable(app, id)!
  })
}

/** Removes a deliverable no customer has ever seen. A published one is history and is archived instead. */
export function deleteDeliverable(app: AppContext, projectId: string, id: string): void {
  app.db.transaction(() => {
    const deliverable = deliverableIn(app, projectId, id)
    if (deliverable.published_at) throw refuse('A deliverable that was published is part of the history and cannot be removed; archive it.', 'published')
    app.db.run('DELETE FROM deliverables WHERE id = ?', [id])
  })
}

// ---- the owner's words on feedback ------------------------------------------------------------------------------------------------------

function commentIn(app: Pick<AppContext, 'db'>, deliverable: DeliverableRow, commentId: string): CommentRow {
  // The customer's unsent drafts are theirs alone: the owner cannot see or answer them.
  const row = app.db.get<CommentRow>("SELECT * FROM deliverable_comments WHERE id = ? AND deliverable_id = ? AND status <> 'draft'", [commentId, deliverable.id])
  if (!row) throw notFound('The comment')
  return row
}

export const rootOf = (app: Pick<AppContext, 'db'>, comment: CommentRow): CommentRow => (comment.parent_id ? app.db.get<CommentRow>('SELECT * FROM deliverable_comments WHERE id = ?', [comment.parent_id])! : comment)

/** The owner answers a comment. The reply is part of the thread, is never changed, and the customer is told (unless the owner switched that off). */
export function replyTo(app: AppContext, adminId: string, projectId: string, id: string, commentId: string, body: string): CommentRow {
  return app.db.transaction(() => {
    const deliverable = deliverableIn(app, projectId, id)
    const project = getProject(app, projectId)!
    if (!deliverable.published_at) throw notFound('The comment')
    const target = commentIn(app, deliverable, commentId)
    const now = iso(app.clock.now())
    const replyId = newId()
    app.db.run(
      "INSERT INTO deliverable_comments (id, deliverable_id, version_id, parent_id, author_type, author_id, body, status, submitted_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', ?, ?, 'submitted', ?, ?, ?)",
      [replyId, id, target.version_id, target.id, adminId, body, now, now, now],
    )
    touch(app, id, adminId)
    const version = app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE id = ?', [target.version_id])!
    const eventId = recordEvent(app, { deliverableId: id, versionId: target.version_id, versionNumber: version.number, commentId: replyId, type: 'reply_posted', actor: 'admin', actorId: adminId, note: body })
    tellCustomer(app, project.customer_id, 'client_deliverable_reply', eventId)
    return app.db.get<CommentRow>('SELECT * FROM deliverable_comments WHERE id = ?', [replyId])!
  })
}

/** Marks a thread resolved (the owner's act). The words stay; the customer sees the thread as resolved and can reopen it. */
export function resolveThread(app: AppContext, adminId: string, projectId: string, id: string, commentId: string): CommentRow {
  return app.db.transaction(() => {
    const deliverable = deliverableIn(app, projectId, id)
    const root = rootOf(app, commentIn(app, deliverable, commentId))
    if (root.status === 'resolved') return root
    const now = iso(app.clock.now())
    const result = app.db.run("UPDATE deliverable_comments SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ? AND status = 'submitted'", [now, now, root.id])
    if (result.changes !== 1) throw refuse('This thread cannot be resolved.', 'invalid_transition')
    touch(app, id, adminId)
    const version = app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE id = ?', [root.version_id])!
    recordEvent(app, { deliverableId: id, versionId: root.version_id, versionNumber: version.number, commentId: root.id, type: 'comment_resolved', actor: 'admin', actorId: adminId, from: 'submitted', to: 'resolved' })
    return app.db.get<CommentRow>('SELECT * FROM deliverable_comments WHERE id = ?', [root.id])!
  })
}

/** Reopens a resolved thread. Either side may. */
export function reopenThread(app: AppContext, actor: { type: 'admin' | 'customer'; id: string }, deliverable: DeliverableRow, commentId: string): CommentRow {
  return app.db.transaction(() => {
    const root = rootOf(app, commentIn(app, deliverable, commentId))
    if (root.status !== 'resolved') throw refuse('Only a resolved thread can be reopened.', 'invalid_transition')
    const now = iso(app.clock.now())
    const result = app.db.run("UPDATE deliverable_comments SET status = 'submitted', resolved_at = NULL, updated_at = ? WHERE id = ? AND status = 'resolved'", [now, root.id])
    if (result.changes !== 1) throw refuse('Only a resolved thread can be reopened.', 'invalid_transition')
    touch(app, deliverable.id, actor.type === 'admin' ? actor.id : null, actor.type === 'customer')
    const version = app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE id = ?', [root.version_id])!
    recordEvent(app, { deliverableId: deliverable.id, versionId: root.version_id, versionNumber: version.number, commentId: root.id, type: 'comment_reopened', actor: actor.type, actorId: actor.id, from: 'resolved', to: 'submitted' })
    return app.db.get<CommentRow>('SELECT * FROM deliverable_comments WHERE id = ?', [root.id])!
  })
}

/** A private note of the owner's: stored apart, never selected by anything a customer calls, and recorded in the history only as "a note was added". */
export function addInternalNote(app: AppContext, adminId: string, projectId: string, id: string, input: { body: string; versionId: string | null; commentId: string | null }): string {
  return app.db.transaction(() => {
    const deliverable = deliverableIn(app, projectId, id)
    if (input.versionId) versionIn(app, deliverable, input.versionId)
    if (input.commentId && !app.db.get('SELECT 1 FROM deliverable_comments WHERE id = ? AND deliverable_id = ?', [input.commentId, id])) throw notFound('The comment')
    const noteId = newId()
    app.db.run('INSERT INTO deliverable_internal_notes (id, deliverable_id, version_id, comment_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [noteId, id, input.versionId, input.commentId, adminId, input.body, iso(app.clock.now())])
    recordEvent(app, { deliverableId: id, versionId: input.versionId, commentId: input.commentId, type: 'note_added', actor: 'admin', actorId: adminId, subject: deliverable.title, visibility: 'internal' })
    return noteId
  })
}

// ---- approval: the owner's side ---------------------------------------------------------------------------------------------------------

/** Asks the customer to decide about the CURRENT version. One request at a time; not for a version already approved; not for an archived deliverable or an unpublished version. */
export function requestApproval(app: AppContext, adminId: string, projectId: string, id: string, note: string | null): ApprovalRow {
  return app.db.transaction(() => {
    const deliverable = deliverableIn(app, projectId, id)
    const project = getProject(app, projectId)!
    if (deliverable.publication_state !== 'published') throw refuse('Only a published deliverable can be put to the customer for approval.', 'not_published')
    const version = currentVersion(app, deliverable)
    if (!version) throw refuse('Only a published version can be approved.', 'not_published')
    if (app.db.get('SELECT 1 FROM deliverable_approvals WHERE deliverable_id = ? AND state = \'requested\'', [id])) throw refuse('A request for approval is already waiting for the customer.', 'approval_open')
    if (app.db.get('SELECT 1 FROM deliverable_approvals WHERE version_id = ? AND state = \'approved\'', [version.id])) throw refuse('This version is already approved.', 'already_approved')
    const now = iso(app.clock.now())
    const approvalId = newId()
    app.db.run('INSERT INTO deliverable_approvals (id, deliverable_id, version_id, state, requested_by, requested_at, request_note, revision, created_at, updated_at) VALUES (?, ?, ?, \'requested\', ?, ?, ?, 1, ?, ?)', [approvalId, id, version.id, adminId, now, note, now, now])
    recomputeReview(app, id)
    touch(app, id, adminId)
    const eventId = recordEvent(app, { deliverableId: id, versionId: version.id, versionNumber: version.number, approvalId, type: 'approval_requested', actor: 'admin', actorId: adminId, to: 'requested', note })
    tellCustomer(app, project.customer_id, 'client_deliverable_approval_requested', eventId)
    return app.db.get<ApprovalRow>('SELECT * FROM deliverable_approvals WHERE id = ?', [approvalId])!
  })
}

export function approvalIn(app: Pick<AppContext, 'db'>, deliverable: DeliverableRow, approvalId: string): ApprovalRow {
  const row = app.db.get<ApprovalRow>('SELECT * FROM deliverable_approvals WHERE id = ? AND deliverable_id = ?', [approvalId, deliverable.id])
  if (!row) throw notFound('The approval request')
  return row
}

/** Ends a request nobody has decided: the owner cancels it, or (customer side) the customer withdraws it. A decided request is final. */
export function closeApproval(app: AppContext, actor: { type: 'admin' | 'customer'; id: string }, deliverable: DeliverableRow, approvalId: string, expectedRevision: number | null): ApprovalRow {
  return app.db.transaction(() => {
    const approval = approvalIn(app, deliverable, approvalId)
    if (approval.state !== 'requested') throw refuse('This request was already decided or closed.', 'invalid_transition')
    if (expectedRevision !== null && expectedRevision !== approval.revision) throw stale()
    const now = iso(app.clock.now())
    const result = app.db.run("UPDATE deliverable_approvals SET state = 'cancelled', closed_by = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND state = 'requested' AND revision = ?", [actor.type, now, approvalId, approval.revision])
    if (result.changes !== 1) throw refuse('This request was already decided or closed.', 'invalid_transition')
    recomputeReview(app, deliverable.id)
    touch(app, deliverable.id, actor.type === 'admin' ? actor.id : null, actor.type === 'customer')
    const version = app.db.get<VersionRow>('SELECT * FROM deliverable_versions WHERE id = ?', [approval.version_id])!
    recordEvent(app, { deliverableId: deliverable.id, versionId: approval.version_id, versionNumber: version.number, approvalId, type: actor.type === 'admin' ? 'approval_cancelled' : 'approval_withdrawn', actor: actor.type, actorId: actor.id, from: 'requested', to: 'cancelled' })
    return app.db.get<ApprovalRow>('SELECT * FROM deliverable_approvals WHERE id = ?', [approvalId])!
  })
}

