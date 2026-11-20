import type { Language } from '../../../config.ts'
import { sha256Hex } from '../../../lib/crypto.ts'
import type { Permission } from '../../auth/permissions.ts'

/**
 * Controlled automation (PROMPT 33): the vocabulary shared by the lifecycle, the actions, the tools, the API and the screen.
 *
 * The assistant PROPOSES; a person APPROVES with a dedicated control; the server RE-CHECKS and EXECUTES through the existing business functions. The set of actions is a closed,
 * deliberately small list: nothing here is generic (no SQL, no shell, no HTTP, no file access, no "set this field to that"), and an action that cannot be made safe stays out
 * (`UNSUPPORTED`, with the reason, in the catalogue the screen shows).
 */

// ---- the lifecycle -----------------------------------------------------------------------------------------------------------------------

export const ACTION_STATUSES = ['proposed', 'awaiting_approval', 'approved', 'executing', 'completed', 'rejected', 'expired', 'cancelled', 'failed'] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]

/** Final: nothing changes a row in one of these (the database refuses it too). */
export const FINAL_STATUSES: readonly ActionStatus[] = ['completed', 'rejected', 'expired', 'cancelled', 'failed']
/** Not final: the proposal is still going somewhere. */
export const LIVE_STATUSES: readonly ActionStatus[] = ['proposed', 'awaiting_approval', 'approved', 'executing']

/** Which status may follow which. The migration's trigger says the same, so no code path can invent a move. */
export const TRANSITIONS: Readonly<Record<ActionStatus, readonly ActionStatus[]>> = {
  proposed: ['awaiting_approval', 'failed', 'cancelled'],
  awaiting_approval: ['approved', 'rejected', 'cancelled', 'expired', 'failed'],
  approved: ['executing', 'failed'],
  executing: ['completed', 'failed'],
  completed: [],
  rejected: [],
  expired: [],
  cancelled: [],
  failed: [],
}

export const canMove = (from: ActionStatus, to: ActionStatus): boolean => TRANSITIONS[from].includes(to)

// ---- the actions -------------------------------------------------------------------------------------------------------------------------

export const ACTION_TYPES = ['communication.draft_reply', 'project.note_add', 'project.status_change', 'quote_request.triage_status', 'consultation.close_days'] as const
export type ActionType = (typeof ACTION_TYPES)[number]
export const isActionType = (value: unknown): value is ActionType => typeof value === 'string' && (ACTION_TYPES as readonly string[]).includes(value)

export type TargetType = 'conversation' | 'project' | 'quote_request' | 'booking_hours'

/** `yes`: the same screens undo it. `partly`: some of it cannot be undone (stated). `no`: it stays. `not_applicable`: nothing was changed. */
export type Reversible = 'yes' | 'partly' | 'no' | 'not_applicable'

/** What an action does beyond its main change, as codes the screen words in each language. Nothing here is free text. */
export const SIDE_EFFECTS = [
  'draft_not_sent',
  'nothing_changed',
  'internal_only',
  'customer_sees_status',
  'customer_sees_note',
  'not_shown_to_customer',
  'no_email_sent',
  'history_line_recorded',
  'cannot_return_to_new',
  'terminal_status',
  'start_date_set',
  'public_booking_closed',
  'existing_bookings_untouched',
  'audit_recorded',
] as const
export type SideEffect = (typeof SIDE_EFFECTS)[number]

export interface ActionDefinition {
  type: ActionType
  target: TargetType
  /** Needed (with the current role) when it is proposed, when it is approved, and again immediately before it runs. */
  permission: Permission
  reversible: Reversible
  /** Whether a customer can see the result (in the portal, or by what they can book). */
  customerVisible: boolean
  /** `always`, or `conditional` when the parameters decide (the rule is in the action's own file). */
  secondConfirmation: 'never' | 'always' | 'conditional'
  /** The existing business function that does the work: the action adds no rule of its own to what it can change. */
  service: string
  /** What it touches. */
  sideEffects: readonly SideEffect[]
}

export const CATALOG: Readonly<Record<ActionType, ActionDefinition>> = {
  'communication.draft_reply': {
    type: 'communication.draft_reply',
    target: 'conversation',
    permission: 'clients:read',
    reversible: 'not_applicable',
    customerVisible: false,
    secondConfirmation: 'never',
    service: 'none (nothing is written to a customer record; the approved draft is kept with the action and the administrator sends it from the conversation page)',
    sideEffects: ['draft_not_sent', 'nothing_changed', 'no_email_sent'],
  },
  'project.note_add': {
    type: 'project.note_add',
    target: 'project',
    permission: 'clients:projects',
    reversible: 'no',
    customerVisible: false,
    secondConfirmation: 'never',
    service: 'customers/admin.ts addProjectNote',
    sideEffects: ['internal_only', 'not_shown_to_customer', 'no_email_sent'],
  },
  'project.status_change': {
    type: 'project.status_change',
    target: 'project',
    permission: 'clients:projects',
    reversible: 'partly',
    customerVisible: true,
    secondConfirmation: 'conditional',
    service: 'customers/admin.ts setProjectStatus (notify: false)',
    sideEffects: ['customer_sees_status', 'history_line_recorded', 'no_email_sent'],
  },
  'quote_request.triage_status': {
    type: 'quote_request.triage_status',
    target: 'quote_request',
    permission: 'requests:write',
    reversible: 'partly',
    customerVisible: false,
    secondConfirmation: 'never',
    service: 'quotes/admin.ts changeStatus (notify: false, show: false)',
    sideEffects: ['internal_only', 'not_shown_to_customer', 'no_email_sent', 'history_line_recorded'],
  },
  'consultation.close_days': {
    type: 'consultation.close_days',
    target: 'booking_hours',
    permission: 'system:write',
    reversible: 'yes',
    customerVisible: true,
    secondConfirmation: 'always',
    service: 'bookings/admin.ts closeDays',
    sideEffects: ['public_booking_closed', 'existing_bookings_untouched', 'no_email_sent', 'audit_recorded'],
  },
}

/**
 * What is NOT supported, and why (codes the screen words). The list is part of the catalogue so an administrator who asks for one of these is told, in the screen's language, that
 * it is not something the assistant can prepare, and so the documentation and the tests have one list to hold the line against.
 */
export const UNSUPPORTED = [
  { code: 'send_message', reason: 'sends_to_customer' },
  { code: 'send_email', reason: 'sends_to_customer' },
  { code: 'quotation_status', reason: 'binding_and_customer_facing' },
  { code: 'quotation_content', reason: 'money' },
  { code: 'consultation_booking_change', reason: 'emails_customer' },
  { code: 'consultation_open_hours', reason: 'widens_public_availability' },
  { code: 'consultation_settings', reason: 'configuration' },
  { code: 'project_milestones_tasks', reason: 'not_assessed' },
  { code: 'project_customer_update', reason: 'customer_text_not_assessed' },
  { code: 'delete_record', reason: 'irreversible' },
  { code: 'roles_permissions_accounts', reason: 'security' },
  { code: 'settings_keys_secrets', reason: 'security' },
  { code: 'payments', reason: 'financial' },
  { code: 'deployment_infrastructure', reason: 'infrastructure' },
  { code: 'generic_execution', reason: 'no_generic_tools' },
] as const
export type UnsupportedCode = (typeof UNSUPPORTED)[number]['code']

/** Why a proposal cannot go on or an execution did not happen. Codes, never texts: the screen words them. */
export const FAILURE_CODES = [
  'permission_lost',
  'session_ended',
  'target_missing',
  'target_changed',
  'validation_failed',
  'invalid_transition',
  'bookings_in_range',
  'payload_tampered',
  'automation_disabled',
  'execution_error',
  'interrupted',
] as const
export type FailureCode = (typeof FAILURE_CODES)[number]

/** A failure after which a fresh proposal for the same thing makes sense (nothing was changed, and the cause was not the content). */
export const RETRIABLE: readonly FailureCode[] = ['execution_error', 'interrupted']

/** A reason an action cannot be prepared, approved or run. Thrown by the actions; the lifecycle turns it into a failed row or a refused request. */
export class ActionProblem extends Error {
  readonly code: FailureCode
  constructor(code: FailureCode) {
    super(code)
    this.name = 'ActionProblem'
    this.code = code
  }
}

// ---- the frozen content ------------------------------------------------------------------------------------------------------------------

export const LIMITS = {
  reason: 400,
  draft: 4000,
  note: 2000,
  customerNote: 500,
  label: 120,
  decisionNote: 300,
  /** An approval waits at most this long for the target to be unchanged between the proposal and the execution. */
  stuckSeconds: 120,
  retries: 3,
  pageDefault: 20,
  pageMax: 50,
} as const

export interface Target {
  type: TargetType
  id: string | null
  reference: string | null
}

/** Exactly what an approval is bound to. Its canonical form is hashed. */
export interface Payload {
  v: 1
  type: ActionType
  target: Target
  params: Record<string, unknown>
  /** Why the assistant proposes it, in the assistant's words (cut, cleaned, shown as the assistant's). */
  reason: string
  language: Language
}

export interface PreviewRecord {
  type: TargetType | 'customer'
  reference: string | null
  /** A short, non-personal label (a project's name, a date range): never an address or a customer's words. */
  label: string | null
}

export interface PreviewChange {
  /** A field code the screen words ("status", "closedDays"). */
  field: string
  before: string | null
  after: string | null
}

export interface PreviewContent {
  kind: 'draft_reply' | 'note' | 'customer_note'
  text: string
  language?: Language
}

/** What the administrator is shown to decide, frozen with the proposal. */
export interface Preview {
  records: PreviewRecord[]
  changes: PreviewChange[]
  contents: PreviewContent[]
  sideEffects: SideEffect[]
  reversible: Reversible
  customerVisible: boolean
  secondConfirmation: boolean
}

/** JSON with the keys of every object in sorted order, so the same content always has the same text (and the same hash). `undefined` is dropped, as `JSON.stringify` drops it. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
}

export const payloadHashOf = (payload: Payload): string => sha256Hex(canonicalJson(payload))

/** A short, stable digest of the part of the target's state the action depends on: if it differs at approval or execution, the approval no longer holds. */
export const fingerprintOf = (state: unknown): string => sha256Hex(canonicalJson(state))

/** The first link of every history chain. */
export const GENESIS_HASH = '0'.repeat(64)

export const ACTOR_TYPES = ['ai', 'admin', 'server'] as const
export type ActorType = (typeof ACTOR_TYPES)[number]

export const EVENT_KINDS = ['proposal_created', 'submitted', 'approval_granted', 'rejected', 'cancelled', 'expired', 'approval_invalidated', 'execution_started', 'execution_succeeded', 'execution_failed'] as const
export type EventKind = (typeof EVENT_KINDS)[number]
