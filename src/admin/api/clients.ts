import { del, get, patch, post, put, type Envelope, type RequestOptions } from './client'

/** The client portal's side of the administration (server/src/modules/customers/routes.ts). Nothing here carries a sign-in secret, a session token or a link's secret. */

export type ClientStatus = 'invited' | 'active' | 'disabled'
export type ProjectStatus = 'awaiting_start' | 'discovery' | 'planning' | 'design' | 'development' | 'review' | 'waiting_customer' | 'finalization' | 'completed' | 'on_hold' | 'cancelled'
export type ProjectCategory = 'website' | 'webapp' | 'ui' | 'integrations' | 'ai' | 'other'
export type ProjectEventType = 'created' | 'status_changed' | 'dates_changed' | 'milestone_added' | 'milestone_completed' | 'document_published' | 'feedback_requested' | 'update_posted'

export const PROJECT_STATUSES: readonly ProjectStatus[] = ['awaiting_start', 'discovery', 'planning', 'design', 'development', 'review', 'waiting_customer', 'finalization', 'completed', 'on_hold', 'cancelled']
export const PROJECT_CATEGORIES: readonly ProjectCategory[] = ['website', 'webapp', 'ui', 'integrations', 'ai', 'other']

export interface ClientListRow {
  id: string
  email: string
  name: string | null
  company: string | null
  language: 'hu' | 'en' | 'nl'
  status: ClientStatus
  origin: 'invitation' | 'registration'
  verified: boolean
  lastSignInAt: string | null
  deletionRequested: boolean
  createdAt: string
  projects: number
  records: number
}

export interface ClientSettings {
  registration: boolean
  selfLinking: boolean
  canSendLinks: boolean
}

export interface AuditView {
  id: number
  type: string
  actor: 'customer' | 'admin' | 'system'
  adminEmail: string | null
  detail: string | null
  at: string
}

export interface Candidate {
  type: 'quote_request' | 'booking'
  id: string
  reference: string
  createdAt: string
  status: string
}

export interface ClientDetail {
  customer: {
    id: string
    email: string
    name: string | null
    company: string | null
    language: 'hu' | 'en' | 'nl'
    status: ClientStatus
    origin: 'invitation' | 'registration'
    verifiedAt: string | null
    lastSignInAt: string | null
    deletionRequestedAt: string | null
    disabledAt: string | null
    createdAt: string
    invitedBy: string | null
  }
  sessions: Array<{ id: string; createdAt: string; lastSeenAt: string; expiresAt: string; browser: string }>
  links: Array<{ id: string; type: 'quote_request' | 'booking'; recordId: string; reference: string; method: 'admin' | 'verified_email'; status: string; linkedAt: string }>
  candidates: Candidate[]
  projects: Array<{ id: string; reference: string; name: string; category: ProjectCategory; status: ProjectStatus; updatedAt: string; quoteRequestReference: string | null }>
  audit: AuditView[]
}

export interface ProjectView {
  project: { id: string; reference: string; customer_id: string; quote_request_id: string | null; name: string; category: ProjectCategory; status: ProjectStatus; started_on: string | null; expected_on: string | null; completed_at: string | null; created_at: string; updated_at: string }
  customer: { id: string; email: string; name: string | null; language: 'hu' | 'en' | 'nl'; status: ClientStatus }
  quoteRequestReference: string | null
  allowedStatuses: ProjectStatus[]
  milestones: Array<{ id: string; title: string; due_on: string | null; completed_at: string | null }>
  events: Array<{ id: number; event_type: ProjectEventType; from_status: ProjectStatus | null; to_status: ProjectStatus | null; note: string | null; created_at: string; adminEmail: string | null }>
  notes: Array<{ id: string; body: string; createdAt: string; authorEmail: string | null }>
  documents: Array<{ id: string; title: string; kind: string; published_at: string | null }>
  documentsCanBePublished: false
}

const base = '/api/admin'

// What a screen needs is the answer's `data`; only the list also reads the envelope's `meta`.
const getData = async <T>(path: string, options?: RequestOptions) => (await get<T>(path, options)).data
const postData = async <T>(path: string, body?: unknown) => (await post<T>(path, body)).data
const putData = async <T>(path: string, body?: unknown) => (await put<T>(path, body)).data
const patchData = async <T>(path: string, body?: unknown) => (await patch<T>(path, body)).data
const enc = encodeURIComponent

export const clients = {
  settings: (signal?: AbortSignal) => getData<ClientSettings>(`${base}/client-settings`, { signal }),
  saveSettings: (changes: Partial<Pick<ClientSettings, 'registration' | 'selfLinking'>>) => putData<ClientSettings>(`${base}/client-settings`, changes),
  list: async (query: { q?: string; status?: string; page?: number; pageSize?: number }, signal?: AbortSignal) => {
    const { data, meta } = await get<ClientListRow[]>(`${base}/clients`, { query, signal })
    return { rows: data, page: meta as unknown as { page: number; pageSize: number; total: number } }
  },
  invite: (body: { email: string; name?: string; company?: string; language: string }) => postData<{ id: string; emailQueued: boolean }>(`${base}/clients`, body),
  get: (id: string, signal?: AbortSignal) => getData<ClientDetail>(`${base}/clients/${enc(id)}`, { signal }),
  act: (id: string, action: 'disable' | 'enable' | 'revoke_sessions' | 'send_link' | 'clear_deletion_request') => postData<{ ok: true; sessionsClosed?: number; emailQueued?: boolean }>(`${base}/clients/${enc(id)}/actions`, { action }),
  link: (id: string, type: 'quote_request' | 'booking', recordId: string) => postData<{ id: string }>(`${base}/clients/${enc(id)}/links`, { type, recordId }),
  unlink: (id: string, linkId: string) => del(`${base}/clients/${enc(id)}/links/${enc(linkId)}`),
  createProject: (id: string, body: { name: string; category: string; startedOn?: string; expectedOn?: string; quoteRequestId?: string; notify: boolean }) => postData<{ id: string; reference: string }>(`${base}/clients/${enc(id)}/projects`, body),
}

export const clientProjects = {
  get: (id: string, signal?: AbortSignal) => getData<ProjectView>(`${base}/client-projects/${enc(id)}`, { signal }),
  edit: (id: string, body: { name?: string; category?: string; startedOn?: string | null; expectedOn?: string | null }) => patchData<unknown>(`${base}/client-projects/${enc(id)}`, body),
  status: (id: string, body: { status: string; note?: string; notify?: boolean }) => postData<unknown>(`${base}/client-projects/${enc(id)}/status`, body),
  addMilestone: (id: string, body: { title: string; dueOn?: string }) => postData<unknown>(`${base}/client-projects/${enc(id)}/milestones`, body),
  doneMilestone: (id: string, milestoneId: string) => patchData<unknown>(`${base}/client-projects/${enc(id)}/milestones/${enc(milestoneId)}`, { done: true }),
  removeMilestone: (id: string, milestoneId: string) => del(`${base}/client-projects/${enc(id)}/milestones/${enc(milestoneId)}`),
  update: (id: string, body: { kind: 'update' | 'feedback'; note: string; notify?: boolean }) => postData<unknown>(`${base}/client-projects/${enc(id)}/updates`, body),
  note: (id: string, text: string) => postData<unknown>(`${base}/client-projects/${enc(id)}/notes`, { body: text }),
}

export type { Envelope }
