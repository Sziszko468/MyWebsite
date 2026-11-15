/**
 * The vocabulary of the feedback and approval workflow (PROMPT 27): what a deliverable, a version, a comment and an approval can be, and which moves between states are
 * allowed. The lists are the ones in `0014_client_feedback.sql`; a test reads both and fails when they drift. The rules are documented in docs/client-feedback/.
 */

export const DELIVERABLE_TYPES = ['website_preview', 'design', 'image', 'document', 'prototype', 'other'] as const
export type DeliverableType = (typeof DELIVERABLE_TYPES)[number]

export const PUBLICATION_STATES = ['draft', 'published', 'archived'] as const
export type PublicationState = (typeof PUBLICATION_STATES)[number]

export const REVIEW_STATES = ['not_submitted', 'awaiting_customer', 'changes_requested', 'approved', 'superseded'] as const
export type ReviewState = (typeof REVIEW_STATES)[number]

export const VERSION_STATUSES = ['draft', 'published', 'superseded'] as const
export type VersionStatus = (typeof VERSION_STATUSES)[number]

export const COMMENT_STATUSES = ['draft', 'submitted', 'resolved'] as const
export type CommentStatus = (typeof COMMENT_STATUSES)[number]

export const APPROVAL_STATES = ['requested', 'approved', 'changes_requested', 'cancelled', 'superseded'] as const
export type ApprovalState = (typeof APPROVAL_STATES)[number]

/**
 * What a version of each type must carry to be published. A "website preview" and a "prototype" are somewhere to go; an "image" is a picture the customer can place comments on;
 * the rest need at least some words or an address. Nothing is ever uploaded: the site has no private place to keep a file.
 */
export const REQUIRES: Readonly<Record<DeliverableType, 'preview_url' | 'image_url' | 'any'>> = {
  website_preview: 'preview_url',
  prototype: 'preview_url',
  image: 'image_url',
  design: 'any',
  document: 'any',
  other: 'any',
}

export interface DeliverableRow {
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
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface VersionRow {
  id: string
  deliverable_id: string
  number: number
  title: string
  customer_description: string
  preview_url: string | null
  image_url: string | null
  checksum: string | null
  status: VersionStatus
  published_at: string | null
  published_by: string | null
  created_by: string | null
  created_at: string
}

export interface CommentRow {
  id: string
  deliverable_id: string
  version_id: string
  parent_id: string | null
  author_type: 'customer' | 'admin'
  author_id: string | null
  body: string
  x: number | null
  y: number | null
  status: CommentStatus
  submitted_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface ApprovalRow {
  id: string
  deliverable_id: string
  version_id: string
  state: ApprovalState
  requested_by: string | null
  requested_at: string
  request_note: string | null
  decided_at: string | null
  decided_by_customer: string | null
  decision_note: string | null
  confirmed_version: number | null
  confirmed_checksum: string | null
  closed_by: 'admin' | 'customer' | 'system' | null
  revision: number
  created_at: string
  updated_at: string
}

export const EVENT_TYPES = [
  'deliverable_created', 'deliverable_edited', 'version_created', 'version_edited', 'version_published', 'deliverable_archived',
  'feedback_submitted', 'follow_up_posted', 'reply_posted', 'comment_resolved', 'comment_reopened', 'note_added',
  'approval_requested', 'approval_approved', 'approval_changes_requested', 'approval_cancelled', 'approval_withdrawn', 'approval_superseded',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

export interface EventRow {
  id: number
  deliverable_id: string
  version_id: string | null
  version_number: number | null
  comment_id: string | null
  approval_id: string | null
  event_type: EventType
  actor_type: 'admin' | 'customer' | 'system'
  actor_id: string | null
  from_state: string | null
  to_state: string | null
  subject: string | null
  note: string | null
  visibility: 'customer' | 'internal'
  created_at: string
}

/** Limits on what the owner and the customer may write (the server enforces them; a screen's counters repeat them). */
export const LIMITS = { title: 160, description: 4000, comment: 2000, explanation: 2000, requestNote: 1000, internalNote: 2000, url: 2000, drafts: 50, comments: 500 } as const

/** The owner's choices about what the feedback and approval work e-mails. Every default is on except nothing: each message is about something that was asked for or answered. */
export interface DeliverableSettings {
  /** The customer is told a deliverable is ready for their review (its first version was published). */
  ready: boolean
  /** …that a new version of one they know is available. */
  newVersion: boolean
  /** …that their approval is asked for. */
  approvalRequested: boolean
  /** …that the owner replied to their feedback. */
  reply: boolean
  /** The owner is told the customer sent feedback. */
  feedback: boolean
  /** …asked for changes. */
  changesRequested: boolean
  /** …approved a version. */
  approved: boolean
}

export const DEFAULT_SETTINGS: DeliverableSettings = { ready: true, newVersion: true, approvalRequested: true, reply: true, feedback: true, changesRequested: true, approved: true }
export const SETTINGS_KEY = 'deliverables.settings'
