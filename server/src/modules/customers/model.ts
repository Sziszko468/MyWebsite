import type { Language } from '../../config.ts'

/**
 * The client portal's vocabulary (PROMPT 25): what an account is, what a project's status can be and which moves between statuses are allowed. The lists
 * are the ones in the migration (`0012_client_portal.sql`); a test reads both and fails when they drift. The project status model is documented in
 * docs/client-portal/ARCHITECTURE.md and is the part PROMPT 26 (project management and timeline) extends.
 */

// ---- accounts -------------------------------------------------------------------------------------------------------------------------

export type CustomerStatus = 'invited' | 'active' | 'disabled'
export type CustomerOrigin = 'invitation' | 'registration'

export interface CustomerRow {
  id: string
  email: string
  name: string | null
  company: string | null
  language: Language
  status: CustomerStatus
  origin: CustomerOrigin
  email_verified_at: string | null
  last_sign_in_at: string | null
  deletion_requested_at: string | null
  disabled_at: string | null
  invited_by: string | null
  created_at: string
  updated_at: string
}

/** What a customer's address is proven to be: only an account whose address was verified (and is not switched off) can sign in or claim a record. */
export const isVerified = (customer: Pick<CustomerRow, 'status' | 'email_verified_at'>): boolean => customer.status === 'active' && customer.email_verified_at !== null

export type AuthPurpose = 'sign_in' | 'activate' | 'register' | 'email_change'

export interface AuthRequestRow {
  id: string
  purpose: AuthPurpose
  customer_id: string | null
  email: string
  language: Language
  ip_hash: string | null
  created_at: string
}

export type AuditType =
  | 'invited'
  | 'invitation_resent'
  | 'registered'
  | 'verified'
  | 'signed_in'
  | 'signed_out'
  | 'sessions_revoked'
  | 'email_change_requested'
  | 'email_changed'
  | 'profile_updated'
  | 'disabled'
  | 'enabled'
  | 'record_linked'
  | 'record_unlinked'
  | 'deletion_requested'
  | 'deletion_cancelled'
  | 'project_created'

export const AUDIT_TYPES: readonly AuditType[] = ['invited', 'invitation_resent', 'registered', 'verified', 'signed_in', 'signed_out', 'sessions_revoked', 'email_change_requested', 'email_changed', 'profile_updated', 'disabled', 'enabled', 'record_linked', 'record_unlinked', 'deletion_requested', 'deletion_cancelled', 'project_created']

// ---- the owner's two switches ----------------------------------------------------------------------------------------------------------

export interface PortalSettings {
  /** Anyone who proves an address may create an account. OFF until the owner decides: the portal is for customers the owner invites. */
  registration: boolean
  /** A signed-in customer may claim the quote requests and bookings that carry the address they have proven. OFF: the owner links records by hand. */
  selfLinking: boolean
}

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = { registration: false, selfLinking: false }
export const PORTAL_SETTINGS_KEY = 'portal.settings'

// ---- projects -------------------------------------------------------------------------------------------------------------------------

export const PROJECT_STATUSES = ['awaiting_start', 'discovery', 'planning', 'design', 'development', 'review', 'waiting_customer', 'finalization', 'completed', 'on_hold', 'cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
export const isProjectStatus = (value: unknown): value is ProjectStatus => typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value)

export const PROJECT_CATEGORIES = ['website', 'webapp', 'ui', 'integrations', 'ai', 'other'] as const
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number]
export const isProjectCategory = (value: unknown): value is ProjectCategory => typeof value === 'string' && (PROJECT_CATEGORIES as readonly string[]).includes(value)

/** Finished, one way or the other. A project here is not "active" and is not shown as waiting for anything. */
export const TERMINAL_STATUSES: readonly ProjectStatus[] = ['completed', 'cancelled']
/** Being worked on or waiting for the customer: what the portal counts as an active project. (On hold is paused, not active.) */
export const ACTIVE_STATUSES: readonly ProjectStatus[] = ['awaiting_start', 'discovery', 'planning', 'design', 'development', 'review', 'waiting_customer', 'finalization']
/** The customer has something to do. */
export const AWAITING_CUSTOMER: readonly ProjectStatus[] = ['waiting_customer']
/** A change into one of these is told to the customer by e-mail unless the owner says otherwise; the working phases are shown in the portal only unless the owner chooses to tell. */
export const IMPORTANT_STATUSES: readonly ProjectStatus[] = ['waiting_customer', 'review', 'finalization', 'completed', 'on_hold', 'cancelled']

/**
 * Which status may follow which. The rule is deliberately small (PROMPT 26 decides what a real workflow needs): a project in a working phase may move to any
 * other status, a finished one (completed, cancelled) can only be put back on hold (reopened) by the owner, and nothing moves to the status it already has.
 */
export const PROJECT_TRANSITIONS: Readonly<Record<ProjectStatus, readonly ProjectStatus[]>> = Object.fromEntries(
  PROJECT_STATUSES.map((from) => [from, TERMINAL_STATUSES.includes(from) ? (['on_hold'] as const) : PROJECT_STATUSES.filter((to) => to !== from)]),
) as unknown as Record<ProjectStatus, readonly ProjectStatus[]>

export const canMoveProject = (from: ProjectStatus, to: ProjectStatus): boolean => PROJECT_TRANSITIONS[from].includes(to)

export interface ProjectRow {
  id: string
  reference: string
  customer_id: string
  quote_request_id: string | null
  quote_id: string | null
  name: string
  category: ProjectCategory
  status: ProjectStatus
  started_on: string | null
  expected_on: string | null
  completed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface MilestoneRow {
  id: string
  project_id: string
  title: string
  due_on: string | null
  completed_at: string | null
  position: number
  created_at: string
  description: string | null
  status: 'upcoming' | 'in_progress' | 'completed' | 'delayed' | 'cancelled'
  customer_visible: 0 | 1
}

export type ProjectEventType =
  | 'created' | 'status_changed' | 'dates_changed' | 'milestone_added' | 'milestone_completed' | 'document_published' | 'feedback_requested' | 'update_posted'
  // PROMPT 26 (migration 0013): the project work
  | 'task_created' | 'task_edited' | 'task_status_changed' | 'task_completed' | 'task_cancelled' | 'task_assigned' | 'dependency_added' | 'dependency_removed'
  | 'milestone_status_changed' | 'action_assigned' | 'action_submitted' | 'action_under_review' | 'action_changes_requested' | 'action_accepted' | 'action_cancelled' | 'note_added'
export const PROJECT_EVENT_TYPES: readonly ProjectEventType[] = [
  'created', 'status_changed', 'dates_changed', 'milestone_added', 'milestone_completed', 'document_published', 'feedback_requested', 'update_posted',
  'task_created', 'task_edited', 'task_status_changed', 'task_completed', 'task_cancelled', 'task_assigned', 'dependency_added', 'dependency_removed',
  'milestone_status_changed', 'action_assigned', 'action_submitted', 'action_under_review', 'action_changes_requested', 'action_accepted', 'action_cancelled', 'note_added',
]

export interface ProjectEventRow {
  id: number
  project_id: string
  event_type: ProjectEventType
  actor_type: 'admin' | 'customer' | 'system'
  actor_id: string | null
  /** A project status on a project line; a task or action status on a task or action line (the event type says which). */
  from_status: string | null
  to_status: string | null
  milestone_id: string | null
  document_id: string | null
  task_id: string | null
  action_id: string | null
  /** The title of the thing the event is about, as it was at the time. */
  subject: string | null
  /** `customer`: the customer's timeline shows it. `internal`: only the administration. */
  visibility: 'customer' | 'internal'
  note: string | null
  created_at: string
}

export const DOCUMENT_KINDS = ['brief', 'design', 'deliverable', 'other'] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export interface DocumentRow {
  id: string
  project_id: string
  title: string
  kind: DocumentKind
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  storage_key: string | null
  published_at: string | null
  created_by: string | null
  created_at: string
}

export type LinkType = 'quote_request' | 'booking'
export interface LinkRow {
  id: string
  customer_id: string
  quote_request_id: string | null
  booking_id: string | null
  method: 'admin' | 'verified_email'
  linked_by: string | null
  created_at: string
}
