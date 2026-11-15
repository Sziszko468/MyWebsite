import type { AppContext, SessionInfo } from '../../context.ts'
import { notFound, validationFailed } from '../../http/errors.ts'
import { Fields } from '../../lib/validate.ts'
import { requirePermission } from '../auth/permissions.ts'
import { getProject } from '../customers/projects.ts'
import { audit } from '../system/audit.ts'
import { DELIVERABLE_TYPES, DEFAULT_SETTINGS, LIMITS, type DeliverableSettings, type DeliverableType } from './model.ts'
import { deliverableSettings, saveDeliverableSettings } from './settings.ts'
import {
  addInternalNote,
  archiveDeliverable,
  closeApproval,
  createDeliverable,
  createVersion,
  deleteDeliverable,
  deliverableIn,
  publishVersion,
  reopenThread,
  replyTo,
  requestApproval,
  resolveThread,
  updateDeliverable,
  updateVersion,
  type VersionContent,
} from './service.ts'
import { adminDeliverable, adminDeliverables, type AdminDeliverableDetail, type AdminDeliverableRow } from './views.ts'

/**
 * The administration's side of the deliverables. Reading needs `clients:read`; everything that changes one needs `clients:projects` (an editor has it); the owner's e-mail choices
 * need `system:write`. The check is HERE, in the business function, so no route can forget it. Every body is read field by field against the list of fields that exist: a field
 * that is not on the list is refused, so a request cannot set what it has no business setting (an id, a state, a number, a checksum, an author, a project). A deliverable, a
 * version, a comment or an approval named in an address or a body is always looked up THROUGH the project in the address.
 */

function exact(body: Record<string, unknown>, known: readonly string[]): void {
  if (Object.keys(body).length === 0 || !Object.keys(body).every((key) => known.includes(key))) throw validationFailed({ body: 'invalid' })
}

const idField = (fields: Fields, name: string): string | null => fields.text(name, { max: 64 })

function revisionOf(fields: Fields, body: Record<string, unknown>): number | null {
  if (!('revision' in body)) return null
  const value = body.revision
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1_000_000) {
    fields.fail('revision', 'invalid')
    return null
  }
  return value
}

function address(fields: Fields, name: string): string | null {
  return fields.text(name, { max: LIMITS.url })
}

export function projectOf(app: AppContext, projectId: string): void {
  if (!getProject(app, projectId)) throw notFound('The project')
}

export function listDeliverables(app: AppContext, session: SessionInfo | null, projectId: string): { deliverables: AdminDeliverableRow[]; previewOrigins: readonly string[] } {
  requirePermission(session, 'clients:read')
  projectOf(app, projectId)
  return { deliverables: adminDeliverables(app, projectId), previewOrigins: app.config.previewOrigins }
}

export function readDeliverable(app: AppContext, session: SessionInfo | null, projectId: string, id: string): AdminDeliverableDetail {
  requirePermission(session, 'clients:read')
  return adminDeliverable(app, deliverableIn(app, projectId, id))
}

const CREATE_FIELDS = ['title', 'type', 'customerDescription', 'internalDescription', 'taskId', 'versionTitle', 'versionDescription', 'previewUrl', 'imageUrl'] as const

export function addDeliverable(app: AppContext, session: SessionInfo | null, projectId: string, body: Record<string, unknown>): { id: string; reference: string } {
  const who = requirePermission(session, 'clients:projects')
  exact(body, CREATE_FIELDS)
  const fields = new Fields(body)
  const title = fields.text('title', { max: LIMITS.title, required: true })
  const type = fields.oneOf<DeliverableType>('type', DELIVERABLE_TYPES, { required: true })
  const customerDescription = fields.text('customerDescription', { max: LIMITS.description, multiline: true })
  const internalDescription = fields.text('internalDescription', { max: LIMITS.description, multiline: true })
  const taskId = idField(fields, 'taskId')
  const version: VersionContent = {
    title: fields.text('versionTitle', { max: LIMITS.title }) ?? title ?? '',
    customerDescription: fields.text('versionDescription', { max: LIMITS.description, multiline: true }) ?? '',
    previewUrl: address(fields, 'previewUrl'),
    imageUrl: address(fields, 'imageUrl'),
  }
  fields.done()
  const made = createDeliverable(app, who.userId, projectId, { title: title!, type: type!, customerDescription: customerDescription ?? '', internalDescription: internalDescription ?? '', taskId, version })
  audit(app, who, 'deliverables.created', 'deliverable', made.deliverable.id)
  return { id: made.deliverable.id, reference: made.deliverable.reference }
}

export function editDeliverable(app: AppContext, session: SessionInfo | null, projectId: string, id: string, body: Record<string, unknown>): AdminDeliverableDetail {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['title', 'customerDescription', 'internalDescription', 'taskId', 'type', 'revision'])
  const fields = new Fields(body)
  const changes: Parameters<typeof updateDeliverable>[4] = {}
  if ('title' in body) changes.title = fields.text('title', { max: LIMITS.title, required: true }) ?? undefined
  if ('customerDescription' in body) changes.customerDescription = fields.text('customerDescription', { max: LIMITS.description, multiline: true }) ?? ''
  if ('internalDescription' in body) changes.internalDescription = fields.text('internalDescription', { max: LIMITS.description, multiline: true }) ?? ''
  if ('taskId' in body) changes.taskId = idField(fields, 'taskId')
  if ('type' in body) changes.type = fields.oneOf<DeliverableType>('type', DELIVERABLE_TYPES, { required: true }) ?? undefined
  const revision = revisionOf(fields, body)
  fields.done()
  const row = updateDeliverable(app, who.userId, projectId, id, changes, revision)
  audit(app, who, 'deliverables.edited', 'deliverable', id)
  return adminDeliverable(app, row)
}

export function editVersion(app: AppContext, session: SessionInfo | null, projectId: string, id: string, versionId: string, body: Record<string, unknown>): AdminDeliverableDetail {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['title', 'customerDescription', 'previewUrl', 'imageUrl'])
  const fields = new Fields(body)
  const changes: Partial<VersionContent> = {}
  if ('title' in body) changes.title = fields.text('title', { max: LIMITS.title, required: true }) ?? undefined
  if ('customerDescription' in body) changes.customerDescription = fields.text('customerDescription', { max: LIMITS.description, multiline: true }) ?? ''
  if ('previewUrl' in body) changes.previewUrl = address(fields, 'previewUrl')
  if ('imageUrl' in body) changes.imageUrl = address(fields, 'imageUrl')
  fields.done()
  updateVersion(app, who.userId, projectId, id, versionId, changes)
  audit(app, who, 'deliverables.version_edited', 'deliverable', id)
  return adminDeliverable(app, deliverableIn(app, projectId, id))
}

export function newVersion(app: AppContext, session: SessionInfo | null, projectId: string, id: string): AdminDeliverableDetail {
  const who = requirePermission(session, 'clients:projects')
  const version = createVersion(app, who.userId, projectId, id)
  audit(app, who, 'deliverables.version_created', 'deliverable', id, { version: version.number })
  return adminDeliverable(app, deliverableIn(app, projectId, id))
}

export function publish(app: AppContext, session: SessionInfo | null, projectId: string, id: string, versionId: string): AdminDeliverableDetail {
  const who = requirePermission(session, 'clients:projects')
  const version = publishVersion(app, who.userId, projectId, id, versionId)
  audit(app, who, 'deliverables.version_published', 'deliverable', id, { version: version.number })
  return adminDeliverable(app, deliverableIn(app, projectId, id))
}

export function archive(app: AppContext, session: SessionInfo | null, projectId: string, id: string): AdminDeliverableDetail {
  const who = requirePermission(session, 'clients:projects')
  archiveDeliverable(app, who.userId, projectId, id)
  audit(app, who, 'deliverables.archived', 'deliverable', id)
  return adminDeliverable(app, deliverableIn(app, projectId, id))
}

export function remove(app: AppContext, session: SessionInfo | null, projectId: string, id: string): void {
  const who = requirePermission(session, 'clients:projects')
  deleteDeliverable(app, projectId, id)
  audit(app, who, 'deliverables.deleted', 'deliverable', id)
}

export function reply(app: AppContext, session: SessionInfo | null, projectId: string, id: string, commentId: string, body: Record<string, unknown>): AdminDeliverableDetail {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['body'])
  const fields = new Fields(body)
  const text = fields.text('body', { max: LIMITS.comment, min: 1, multiline: true, required: true })
  fields.done()
  replyTo(app, who.userId, projectId, id, commentId, text!)
  audit(app, who, 'deliverables.reply', 'deliverable', id)
  return adminDeliverable(app, deliverableIn(app, projectId, id))
}

export function thread(app: AppContext, session: SessionInfo | null, projectId: string, id: string, commentId: string, move: 'resolve' | 'reopen'): AdminDeliverableDetail {
  const who = requirePermission(session, 'clients:projects')
  const deliverable = deliverableIn(app, projectId, id)
  if (move === 'resolve') resolveThread(app, who.userId, projectId, id, commentId)
  else reopenThread(app, { type: 'admin', id: who.userId }, deliverable, commentId)
  audit(app, who, `deliverables.comment_${move}`, 'deliverable', id)
  return adminDeliverable(app, deliverableIn(app, projectId, id))
}

export function note(app: AppContext, session: SessionInfo | null, projectId: string, id: string, body: Record<string, unknown>): { id: string } {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['body', 'versionId', 'commentId'])
  const fields = new Fields(body)
  const text = fields.text('body', { max: LIMITS.internalNote, multiline: true, required: true })
  const versionId = idField(fields, 'versionId')
  const commentId = idField(fields, 'commentId')
  fields.done()
  const noteId = addInternalNote(app, who.userId, projectId, id, { body: text!, versionId, commentId })
  audit(app, who, 'deliverables.note', 'deliverable', id)
  return { id: noteId }
}

export function askForApproval(app: AppContext, session: SessionInfo | null, projectId: string, id: string, body: Record<string, unknown>): AdminDeliverableDetail {
  const who = requirePermission(session, 'clients:projects')
  if (Object.keys(body).length > 0) exact(body, ['note'])
  const fields = new Fields(body)
  const text = fields.text('note', { max: LIMITS.requestNote, multiline: true })
  fields.done()
  requestApproval(app, who.userId, projectId, id, text)
  audit(app, who, 'deliverables.approval_requested', 'deliverable', id)
  return adminDeliverable(app, deliverableIn(app, projectId, id))
}

export function cancelRequest(app: AppContext, session: SessionInfo | null, projectId: string, id: string, approvalId: string, body: Record<string, unknown>): AdminDeliverableDetail {
  const who = requirePermission(session, 'clients:projects')
  if (Object.keys(body).length > 0) exact(body, ['revision'])
  const fields = new Fields(body)
  const revision = revisionOf(fields, body)
  fields.done()
  closeApproval(app, { type: 'admin', id: who.userId }, deliverableIn(app, projectId, id), approvalId, revision)
  audit(app, who, 'deliverables.approval_cancelled', 'deliverable', id)
  return adminDeliverable(app, deliverableIn(app, projectId, id))
}

// ---- the owner's e-mail choices -----------------------------------------------------------------------------------------------------------

export function readSettings(app: AppContext, session: SessionInfo | null): DeliverableSettings {
  requirePermission(session, 'clients:read')
  return deliverableSettings(app)
}

export function writeSettings(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): DeliverableSettings {
  const who = requirePermission(session, 'system:write')
  exact(body, Object.keys(DEFAULT_SETTINGS))
  const next = { ...deliverableSettings(app) }
  const fields = new Fields(body)
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof DeliverableSettings>) {
    if (!(key in body)) continue
    if (typeof body[key] !== 'boolean') fields.fail(key, 'invalid')
    else next[key] = body[key] as boolean
  }
  fields.done()
  saveDeliverableSettings(app, next, who.userId)
  audit(app, who, 'deliverables.settings', 'system', null)
  return next
}
