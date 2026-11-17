/**
 * The lists, limits and shapes of the client communication system (PROMPT 28, migration 0015). The lists here are the lists in the migration's CHECKs; a test compares them.
 */

export const CONVERSATION_KINDS = ['thread', 'activity'] as const
export type ConversationKind = (typeof CONVERSATION_KINDS)[number]

export const CONVERSATION_STATUSES = ['open', 'waiting_owner', 'waiting_customer', 'resolved', 'archived'] as const
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

/** A thread that still expects somebody, or nobody yet: the ones that are not finished. */
export const ACTIVE_STATUSES: readonly ConversationStatus[] = ['open', 'waiting_owner', 'waiting_customer']

export const MESSAGE_TYPES = ['text', 'system_event', 'announcement'] as const
export type MessageType = (typeof MESSAGE_TYPES)[number]

export const VISIBILITIES = ['customer', 'internal'] as const
export type Visibility = (typeof VISIBILITIES)[number]

export const SENDER_TYPES = ['customer', 'admin', 'system'] as const
export type SenderType = (typeof SENDER_TYPES)[number]

/** What a thread can be about. Every kind is a record the customer can see in the portal (their project, a deliverable or task of it, a booking or quote request linked to them). */
export const CONTEXT_TYPES = ['project', 'deliverable', 'task', 'booking', 'quote'] as const
export type ContextType = (typeof CONTEXT_TYPES)[number]

export const EVENT_SOURCES = ['project_event', 'deliverable_event', 'booking_event', 'quote_event', 'conversation'] as const
export type EventSource = (typeof EVENT_SOURCES)[number]

/**
 * The system events there are (the keys the screens put into the reader's language). `conversation.*` events are written inside a thread; the others are mirrored into the
 * customer's activity feed from what another module recorded (events.ts).
 */
export const EVENT_KEYS = [
  'project.created',
  'project.status_changed',
  'milestone.completed',
  'task.submitted',
  'task.accepted',
  'task.changes_requested',
  'deliverable.published',
  'deliverable.feedback_submitted',
  'deliverable.changes_requested',
  'deliverable.approved',
  'consultation.confirmed',
  'consultation.rescheduled',
  'consultation.cancelled',
  'quote.sent',
  'quote.accepted',
  'conversation.resolved',
  'conversation.reopened',
  'conversation.archived',
  'conversation.resolution_requested',
] as const
export type EventKey = (typeof EVENT_KEYS)[number]

export const LIMITS = {
  subject: 200,
  /** What a person can send. The database allows 5000 as a last line of defence. */
  message: 4000,
  note: 4000,
  /** A search: shorter is noise (and a scan of everything), longer is not a person typing. */
  searchMin: 2,
  searchMax: 100,
  pageDefault: 30,
  pageMax: 50,
  /** Threads a customer started that nobody has answered yet: the most they can leave waiting. */
  waitingPerCustomer: 10,
  /** Threads of one customer, in all (an archived one counts). */
  threadsPerCustomer: 300,
  /** Messages in one thread. */
  messagesPerThread: 2000,
} as const

export interface ConversationRow {
  id: string
  reference: string
  kind: ConversationKind
  customer_id: string
  project_id: string | null
  context_type: ContextType | null
  context_id: string | null
  subject: string | null
  status: ConversationStatus
  started_by: 'customer' | 'admin' | 'system'
  resolution_requested_at: string | null
  resolved_at: string | null
  archived_at: string | null
  last_message_at: string | null
  last_activity_at: string
  revision: number
  created_at: string
  updated_at: string
}

export interface MessageRow {
  seq: number
  id: string
  conversation_id: string
  sender_type: SenderType
  sender_id: string | null
  message_type: MessageType
  visibility: Visibility
  body: string | null
  important: number
  event_key: EventKey | null
  event_params: string | null
  source_type: EventSource | null
  source_id: string | null
  idempotency_key: string | null
  client_token: string | null
  created_at: string
  edited_at: string | null
  deleted_at: string | null
}

/** The owner's choices (system settings): who may start a thread, and which of the e-mails exist at all. */
export interface CommunicationSettings {
  /** Customers may start a thread of their own (otherwise they only answer the owner's). Off until the owner opens it. */
  customerCanStart: boolean
  /** Tell the customer about the owner's replies, announcements, important messages and resolutions. */
  replies: boolean
  announcements: boolean
  important: boolean
  resolution: boolean
  /** Tell the owner about a customer's message and about a request for resolution. */
  messageToOwner: boolean
  resolutionRequested: boolean
}

export const DEFAULT_SETTINGS: CommunicationSettings = {
  customerCanStart: false,
  replies: true,
  announcements: true,
  important: true,
  resolution: true,
  messageToOwner: true,
  resolutionRequested: true,
}
export const SETTINGS_KEY = 'communications.settings'

/** What a customer chose to be e-mailed about (all on until they say otherwise). */
export interface MessagePreferences {
  replies: boolean
  announcements: boolean
  important: boolean
  resolution: boolean
}
export const DEFAULT_PREFERENCES: MessagePreferences = { replies: true, announcements: true, important: true, resolution: true }
