import { API_BASE, apiEndpoint } from '../config/api'
import type { Language } from '../i18n/config'

/**
 * The client portal's way to the backend (`/api/portal/*`, server/src/modules/customers/routes.ts). The customer is identified by a cookie the browser keeps
 * (HttpOnly: this code cannot read it) and every change carries the session's CSRF token, which lives only in memory (`session.tsx`): nothing secret is
 * ever written to the browser’s storage or to the address. A call returns what the server said or a plain reason the page can word; a customer's id
 * is never sent, because the server knows who is asking.
 */

export type ProjectStatus = 'awaiting_start' | 'discovery' | 'planning' | 'design' | 'development' | 'review' | 'waiting_customer' | 'finalization' | 'completed' | 'on_hold' | 'cancelled'
export type ProjectCategory = 'website' | 'webapp' | 'ui' | 'integrations' | 'ai' | 'other'
export type ProjectEventType =
  | 'created'
  | 'status_changed'
  | 'dates_changed'
  | 'milestone_added'
  | 'milestone_completed'
  | 'document_published'
  | 'feedback_requested'
  | 'update_posted'
  // PROMPT 26: the lines the project work writes for the customer (the owner's own lines never reach this page)
  | 'task_created'
  | 'task_status_changed'
  | 'task_completed'
  | 'task_cancelled'
  | 'milestone_status_changed'
  | 'action_assigned'
  | 'action_submitted'
  | 'action_under_review'
  | 'action_changes_requested'
  | 'action_accepted'
  | 'action_cancelled'
export type TaskStatus = 'backlog' | 'planned' | 'in_progress' | 'in_review' | 'waiting_customer' | 'blocked' | 'completed' | 'cancelled'
export type MilestoneStatus = 'upcoming' | 'in_progress' | 'completed' | 'delayed' | 'cancelled'
export type ActionType = 'provide_content' | 'answer_question' | 'confirm_direction' | 'review_deliverable' | 'approve_stage' | 'other'
export type ActionStatus = 'not_started' | 'submitted' | 'under_review' | 'changes_requested' | 'accepted' | 'cancelled'
export type RequestStatus = 'new' | 'under_review' | 'waiting_customer' | 'quote_preparation' | 'quote_sent' | 'accepted' | 'declined' | 'in_progress' | 'completed' | 'cancelled'
export type QuoteState = 'open' | 'expired' | 'accepted' | 'declined' | 'superseded' | 'withdrawn'
export type BookingStatus = 'pending' | 'confirmed' | 'reschedule_requested' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show'

export interface PortalConfig {
  signInAvailable: boolean
  registration: boolean
  linkMinutes: number
  inviteHours: number
}

export interface CustomerView {
  email: string
  name: string | null
  company: string | null
  language: Language
  createdAt: string
  verifiedAt: string | null
  deletionRequestedAt: string | null
}

export interface SessionData {
  customer: CustomerView
  csrfToken: string
  features: { selfLinking: boolean; documents: boolean }
}

export interface Verified {
  purpose: 'sign_in' | 'activate' | 'register' | 'email_change'
  created: boolean
  csrfToken: string
  customer: CustomerView
}

export interface ProjectSummary {
  reference: string
  name: string
  category: ProjectCategory
  status: ProjectStatus
  startedOn: string | null
  expectedOn: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  milestones: { done: number; total: number } | null
  nextMilestone: { title: string; dueOn: string | null } | null
  progress: WorkProgress
}

/** Counted by the server from the tasks and milestones the customer can see; `percent` is `null` when there is nothing to count (never "0 %"). */
export interface WorkProgress {
  percent: number | null
  basis: 'tasks' | 'milestones' | null
  tasks: { total: number; completed: number; open: number; overdue: number }
  milestones: { total: number; completed: number; overdue: number }
  /** The day "overdue" was decided against (the server's, in the owner's zone). */
  today: string
}

export interface TimelineEntry {
  id: number
  type: ProjectEventType
  at: string
  /** A project status on a project line; a task or action status on a task or action line. */
  fromStatus: string | null
  toStatus: string | null
  note: string | null
  milestone: string | null
  /** The title of the task, milestone or request the line is about, as it was then. */
  subject: string | null
}

export interface DocumentSummary {
  id: string
  title: string
  kind: string
  fileName: string | null
  mimeType: string | null
  sizeBytes: number | null
  publishedAt: string
}

export interface ProjectDetail extends ProjectSummary {
  milestoneList: Array<{ id: string; title: string; description: string | null; status: MilestoneStatus; dueOn: string | null; completedAt: string | null }>
  timeline: TimelineEntry[]
  documents: DocumentSummary[]
  request: { reference: string } | null
}

export interface Overview {
  name: string | null
  counts: { active: number; awaitingYou: number; completed: number; requests: number; bookings: number }
  awaitingYou: Array<{ reference: string; name: string; status: ProjectStatus }>
  activity: Array<{ id: number; type: ProjectEventType; at: string; toStatus: string | null; note: string | null; milestone: string | null; subject: string | null; project: { reference: string; name: string } }>
  /** The requests the customer has to answer now, most urgent first. */
  needsYou: Array<{ project: { reference: string; name: string }; task: { reference: string; title: string }; status: ActionStatus; dueOn: string | null; overdue: boolean }>
  upcoming: Array<{ kind: 'milestone' | 'task'; project: { reference: string; name: string }; title: string; dueOn: string | null; overdue: boolean }>
  bookings: Array<{ reference: string; startAt: string; endAt: string; timeZone: string; typeName: string; status: BookingStatus; language: Language }>
}

export interface PortalAction {
  type: ActionType
  instruction: string
  status: ActionStatus
  /** Who has to move it: `you`, `us`, or nobody (finished). */
  awaiting: 'you' | 'us' | null
  canRespond: boolean
  revision: number
  /** The latest request for changes, in the words the owner wrote for the customer. */
  changesRequested: string | null
}

export interface PortalTask {
  reference: string
  title: string
  description: string
  status: TaskStatus
  startOn: string | null
  dueOn: string | null
  completedAt: string | null
  overdue: boolean
  category: { hu: string; en: string; nl: string } | null
  milestone: { title: string } | null
  waitingFor: Array<{ reference: string; title: string }>
  action: PortalAction | null
}

export interface PortalWork {
  progress: WorkProgress
  tasks: PortalTask[]
}

export interface PortalTaskDetail extends PortalTask {
  submissions: Array<{ revision: number; response: string; submittedAt: string }>
  history: Array<{ at: string; to: ActionStatus; by: 'you' | 'us'; note: string | null }>
}

export interface RequestRow {
  reference: string
  createdAt: string
  status: RequestStatus
  language: Language
  acceptedQuote: string | null
  projects: number
}

export interface RequestDetail {
  reference: string
  createdAt: string
  language: Language
  status: RequestStatus
  updates: Array<{ at: string; kind: 'status' | 'message' | 'quote'; status: RequestStatus | null; body: string }>
  quotes: Array<{ reference: string; version: number; title: string; state: QuoteState; sentAt: string | null; validUntil: string | null; acceptedAt: string | null; price: string | null; timeline: string | null; language: Language }>
  projects: Array<{ reference: string; name: string; status: ProjectStatus }>
}

export interface BookingRow {
  reference: string
  status: BookingStatus
  active: boolean
  startAt: string
  endAt: string
  timeZone: string
  typeName: string
  language: Language
}

export interface BookingDetail {
  reference: string
  status: BookingStatus
  active: boolean
  language: Language
  type: { code: string; name: string; description: string }
  durationMinutes: number
  startAt: string
  endAt: string
  timeZone: string
}

export interface DocumentRow extends DocumentSummary {
  project: { reference: string; name: string }
}

export interface SessionRow {
  id: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  browser: string
  current: boolean
}

export interface Candidate {
  type: 'quote_request' | 'booking'
  id: string
  reference: string
  createdAt: string
  status: string
}

export type Failure =
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'used' }
  | { kind: 'replaced' }
  | { kind: 'rate_limited' }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' }
  | { kind: 'network' }
  | { kind: 'no_backend' }
  | { kind: 'refused'; status: number; reason: string; fields: Record<string, string> }

export type Result<T> = { ok: true; data: T } | { ok: false; failure: Failure }

/**
 * Whether the portal can work at all from this page: the cookie that identifies a customer is `SameSite=Strict` and the API sends no CORS headers, so the
 * website and the API must be one origin (the backend serving the site, `VITE_API_URL=/`, or a proxy). An API on another origin cannot be used.
 */
export function portalUsable(): boolean {
  if (API_BASE === null) return false
  if (API_BASE === '') return true
  try {
    return new URL(API_BASE).origin === window.location.origin
  } catch {
    return false
  }
}

let csrfToken: string | null = null
/** The CSRF token lives in memory only: it is handed out by the session and is gone with the page. */
export const setCsrf = (token: string | null): void => {
  csrfToken = token
}

export async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<Result<T>> {
  const url = apiEndpoint(path)
  if (url === null || !portalUsable()) return { ok: false, failure: { kind: 'no_backend' } }
  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
    if (response.status === 204) return { ok: true, data: undefined as T }
    const json: unknown = await response.json().catch(() => null)
    if (response.ok) return { ok: true, data: (json as { data: T }).data }
    const error = (json as { error?: { code?: string; details?: { reason?: string; fields?: Record<string, string> } } } | null)?.error
    if (response.status === 401) return { ok: false, failure: { kind: 'unauthorized' } }
    if (response.status === 404) return { ok: false, failure: { kind: 'not_found' } }
    if (response.status === 410) return { ok: false, failure: { kind: error?.details?.reason === 'expired' ? 'expired' : error?.details?.reason === 'used' ? 'used' : 'replaced' } }
    if (response.status === 429) return { ok: false, failure: { kind: 'rate_limited' } }
    if (response.status === 409 || response.status === 422 || response.status === 403) return { ok: false, failure: { kind: 'refused', status: response.status, reason: error?.details?.reason ?? error?.code ?? 'refused', fields: error?.details?.fields ?? {} } }
    return { ok: false, failure: { kind: response.status >= 500 ? 'unavailable' : 'network' } }
  } catch {
    return { ok: false, failure: { kind: 'network' } }
  }
}

const enc = encodeURIComponent

export const fetchConfig = () => call<PortalConfig>('GET', '/api/portal/config')
export const askForLink = (email: string, language: Language) => call<{ accepted: true; linkMinutes: number }>('POST', '/api/portal/auth/request', { email, language })
export const verifyLink = (token: string) => call<Verified>('POST', '/api/portal/auth/verify', { token })
export const fetchSession = () => call<SessionData>('GET', '/api/portal/session')
export const signOutRequest = () => call<{ ok: true }>('POST', '/api/portal/session/sign-out', {})
export const fetchOverview = () => call<Overview>('GET', '/api/portal/overview')
export const fetchProjects = () => call<ProjectSummary[]>('GET', '/api/portal/projects')
export const fetchProject = (reference: string) => call<ProjectDetail>('GET', `/api/portal/projects/${enc(reference)}`)
export const fetchWork = (reference: string) => call<PortalWork>('GET', `/api/portal/projects/${enc(reference)}/tasks`)
export const fetchTask = (reference: string, task: string) => call<PortalTaskDetail>('GET', `/api/portal/projects/${enc(reference)}/tasks/${enc(task)}`)
export const respondToTask = (reference: string, task: string, response: string) => call<{ revision: number; task: PortalTaskDetail }>('POST', `/api/portal/projects/${enc(reference)}/tasks/${enc(task)}/respond`, { response })
export const fetchRequests = () => call<RequestRow[]>('GET', '/api/portal/requests')
export const fetchRequest = (reference: string) => call<RequestDetail>('GET', `/api/portal/requests/${enc(reference)}`)
export const openRequest = (reference: string, quote: string | null) => call<{ path: string }>('POST', `/api/portal/requests/${enc(reference)}/open`, { quote })
export const fetchBookings = () => call<BookingRow[]>('GET', '/api/portal/bookings')
export const fetchBooking = (reference: string) => call<BookingDetail>('GET', `/api/portal/bookings/${enc(reference)}`)
export const openBooking = (reference: string) => call<{ path: string }>('POST', `/api/portal/bookings/${enc(reference)}/open`, {})
export const fetchDocuments = () => call<DocumentRow[]>('GET', '/api/portal/documents')
export const fetchCandidates = () => call<Candidate[]>('GET', '/api/portal/link-candidates')
export const claimCandidates = (ids: string[]) => call<{ linked: number }>('POST', '/api/portal/link-candidates/claim', { ids })
export const saveProfile = (body: { name?: string; company?: string; language?: Language }) => call<CustomerView>('PATCH', '/api/portal/profile', body)
export const requestEmailChange = (email: string) => call<{ accepted: true }>('POST', '/api/portal/profile/email', { email })
export const fetchSessions = () => call<SessionRow[]>('GET', '/api/portal/sessions')
export const endSession = (id: string) => call<{ current: boolean }>('DELETE', `/api/portal/sessions/${enc(id)}`)
export const endOtherSessions = () => call<{ closed: number }>('POST', '/api/portal/sessions/revoke-others', {})
export const askForDeletion = () => call<{ requestedAt: string }>('POST', '/api/portal/account/deletion-request', {})
export const withdrawDeletion = () => call<undefined>('DELETE', '/api/portal/account/deletion-request')
