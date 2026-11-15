import { del, get, patch, post, put } from './client'

/**
 * The deliverables' side of the administration (server/src/modules/deliverables/routes.ts): what a project shares with its customer for review, its immutable versions, the
 * customer's feedback and the owner's replies and private notes, and the approval of one exact version. The server decides every rule (a published version is never edited, a
 * number rises by one, an approval is about one published version); the screens here only ask and say what came back.
 */

export const DELIVERABLE_TYPES = ['website_preview', 'design', 'image', 'document', 'prototype', 'other'] as const
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number]
export type PublicationState = 'draft' | 'published' | 'archived'
export type ReviewState = 'not_submitted' | 'awaiting_customer' | 'changes_requested' | 'approved' | 'superseded'
export type ApprovalState = 'requested' | 'approved' | 'changes_requested' | 'cancelled' | 'superseded'

export interface DeliverableRow {
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
  pendingFeedback: number
  awaitingApproval: boolean
  updatedAt: string
  revision: number
}

export interface Deliverable {
  id: string
  reference: string
  project_id: string
  task_id: string | null
  title: string
  customer_description: string
  internal_description: string
  type: DeliverableType
  publication_state: PublicationState
  review_state: ReviewState
  current_version: number
  revision: number
  published_at: string | null
  last_customer_activity_at: string | null
  created_at: string
  updated_at: string
}

export interface Version {
  id: string
  number: number
  title: string
  customer_description: string
  preview_url: string | null
  image_url: string | null
  checksum: string | null
  status: 'draft' | 'published' | 'superseded'
  published_at: string | null
  created_at: string
  embeddable: boolean
  previewHost: string | null
}

export interface Comment {
  id: string
  version_id: string
  parent_id: string | null
  author_type: 'customer' | 'admin'
  body: string
  x: number | null
  y: number | null
  status: 'submitted' | 'resolved'
  created_at: string
  adminEmail: string | null
  marker: number | null
}

export interface Approval {
  id: string
  version_id: string
  state: ApprovalState
  requested_at: string
  request_note: string | null
  decided_at: string | null
  decision_note: string | null
  confirmed_version: number | null
  confirmed_checksum: string | null
  closed_by: 'admin' | 'customer' | 'system' | null
  revision: number
}

export interface DeliverableEvent {
  id: number
  version_number: number | null
  comment_id: string | null
  approval_id: string | null
  event_type: string
  actor_type: 'admin' | 'customer' | 'system'
  from_state: string | null
  to_state: string | null
  subject: string | null
  note: string | null
  visibility: 'customer' | 'internal'
  created_at: string
  adminEmail: string | null
}

export interface DeliverableDetail {
  deliverable: Deliverable
  versions: Version[]
  comments: Comment[]
  notes: Array<{ id: string; versionId: string | null; commentId: string | null; body: string; createdAt: string; authorEmail: string | null }>
  approvals: Approval[]
  events: DeliverableEvent[]
  task: { id: string; reference: string; title: string } | null
  previewOrigins: string[]
}

export interface DeliverableSettings {
  ready: boolean
  newVersion: boolean
  approvalRequested: boolean
  reply: boolean
  feedback: boolean
  changesRequested: boolean
  approved: boolean
}

export interface NewDeliverable {
  title: string
  type: DeliverableType
  customerDescription?: string
  internalDescription?: string
  taskId?: string | null
  versionTitle?: string
  versionDescription?: string
  previewUrl?: string | null
  imageUrl?: string | null
}

const base = '/api/admin/client-projects'
const enc = encodeURIComponent
const data = async <T>(promise: Promise<{ data: T }>): Promise<T> => (await promise).data
const at = (project: string, id = '', suffix = '') => `${base}/${enc(project)}/deliverables${id ? `/${enc(id)}` : ''}${suffix}`

export const deliverables = {
  list: (project: string, signal?: AbortSignal) => data(get<{ deliverables: DeliverableRow[]; previewOrigins: string[] }>(at(project), { signal })),
  get: (project: string, id: string, signal?: AbortSignal) => data(get<DeliverableDetail>(at(project, id), { signal })),
  create: (project: string, body: NewDeliverable) => data(post<{ id: string; reference: string }>(at(project), body)),
  edit: (project: string, id: string, body: { title?: string; customerDescription?: string; internalDescription?: string; taskId?: string | null; type?: DeliverableType; revision?: number }) => data(patch<DeliverableDetail>(at(project, id), body)),
  remove: (project: string, id: string) => del(at(project, id)),
  editVersion: (project: string, id: string, versionId: string, body: { title?: string; customerDescription?: string; previewUrl?: string | null; imageUrl?: string | null }) => data(patch<DeliverableDetail>(at(project, id, `/versions/${enc(versionId)}`), body)),
  newVersion: (project: string, id: string) => data(post<DeliverableDetail>(at(project, id, '/versions'), {})),
  publish: (project: string, id: string, versionId: string) => data(post<DeliverableDetail>(at(project, id, `/versions/${enc(versionId)}/publish`), {})),
  archive: (project: string, id: string) => data(post<DeliverableDetail>(at(project, id, '/archive'), {})),
  reply: (project: string, id: string, commentId: string, body: string) => data(post<DeliverableDetail>(at(project, id, `/comments/${enc(commentId)}/replies`), { body })),
  resolve: (project: string, id: string, commentId: string) => data(post<DeliverableDetail>(at(project, id, `/comments/${enc(commentId)}/resolve`), {})),
  reopen: (project: string, id: string, commentId: string) => data(post<DeliverableDetail>(at(project, id, `/comments/${enc(commentId)}/reopen`), {})),
  note: (project: string, id: string, body: { body: string; versionId?: string; commentId?: string }) => data(post<{ id: string }>(at(project, id, '/notes'), body)),
  requestApproval: (project: string, id: string, note?: string) => data(post<DeliverableDetail>(at(project, id, '/approvals'), note ? { note } : {})),
  cancelApproval: (project: string, id: string, approvalId: string) => data(post<DeliverableDetail>(at(project, id, `/approvals/${enc(approvalId)}/cancel`), {})),
  settings: (signal?: AbortSignal) => data(get<DeliverableSettings>('/api/admin/deliverable-settings', { signal })),
  saveSettings: (body: Partial<DeliverableSettings>) => data(put<DeliverableSettings>('/api/admin/deliverable-settings', body)),
}
