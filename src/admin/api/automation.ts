import { get, post } from './client'

/**
 * The controlled-automation endpoints (`/api/admin/automation`, server/src/modules/ai/automation). The screen only shows what the server sends and sends back decisions: approving, rejecting,
 * cancelling and proposing again are POSTs to one action, made by the dedicated controls. The assistant itself has no way to call any of them.
 */

export const ACTION_TYPES = ['communication.draft_reply', 'project.note_add', 'project.status_change', 'quote_request.triage_status', 'consultation.close_days'] as const
export type ActionType = (typeof ACTION_TYPES)[number]

export const ACTION_STATUSES = ['proposed', 'awaiting_approval', 'approved', 'executing', 'completed', 'rejected', 'expired', 'cancelled', 'failed'] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]

export type TargetType = 'conversation' | 'project' | 'quote_request' | 'booking_hours'
export type Reversible = 'yes' | 'partly' | 'no' | 'not_applicable'

export interface Person {
  id: string | null
  email: string | null
}

export interface Abilities {
  approve: boolean
  reject: boolean
  cancel: boolean
  retry: boolean
}

export interface Change {
  field: string
  before: string | null
  after: string | null
}

export interface ActionSummary {
  reference: string
  type: ActionType
  status: ActionStatus
  administrator: Person
  target: { type: TargetType; reference: string | null; label: string | null }
  change: Change | null
  contentKind: string | null
  requiresSecondConfirmation: boolean
  customerVisible: boolean
  expiresAt: string
  createdAt: string
  updatedAt: string
  failureCode: string | null
  retryOf: string | null
  can: Abilities
}

export interface Preview {
  records: Array<{ type: string; reference: string | null; label: string | null }>
  changes: Change[]
  contents: Array<{ kind: 'draft_reply' | 'note' | 'customer_note'; text: string; language?: string }>
  sideEffects: string[]
  reversible: Reversible
  customerVisible: boolean
  secondConfirmation: boolean
}

export interface HistoryLine {
  seq: number
  kind: string
  actor: { type: 'ai' | 'admin' | 'server'; id: string | null; email: string | null }
  from: ActionStatus | null
  to: ActionStatus
  detail: Record<string, unknown> | null
  at: string
  hash: string
}

export interface ActionDetail extends ActionSummary {
  language: string
  conversationId: string | null
  reason: string | null
  preview: Preview | null
  payloadHash: string
  definition: { permission: string; reversible: Reversible; customerVisible: boolean; secondConfirmation: 'never' | 'always' | 'conditional' }
  decision: { by: Person; at: string; note: string | null; secondConfirmed: boolean } | null
  execution: { startedAt: string | null; finishedAt: string | null; result: Record<string, unknown> | null; failureCode: string | null }
  history: HistoryLine[]
  /** Only on the single-action read. */
  integrity?: { ok: boolean; actions: number; events: number; problems: Array<{ reference: string; seq: number | null; problem: string }> }
}

export interface CatalogEntry {
  type: ActionType
  target: TargetType
  permission: string
  reversible: Reversible
  customerVisible: boolean
  secondConfirmation: 'never' | 'always' | 'conditional'
  service: string
  sideEffects: string[]
  permitted: boolean
}

export interface AutomationConfig {
  enabled: boolean
  ttlMinutes: number
  maxPending: number
  seesAll: boolean
  types: CatalogEntry[]
  unsupported: Array<{ code: string; reason: string }>
  administrators: Array<{ id: string; email: string }>
}

export interface ListQuery {
  tab?: 'pending' | 'history' | 'all'
  status?: string
  type?: string
  admin?: string
  target?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export interface ActionList {
  items: ActionSummary[]
  total: number
  page: number
  pageSize: number
  tab: string
}

const BASE = '/api/admin/automation'
const path = (reference: string, tail = '') => `${BASE}/actions/${encodeURIComponent(reference)}${tail}`

export const automation = {
  config: (signal?: AbortSignal) => get<AutomationConfig>(`${BASE}/config`, { signal }).then((answer) => answer.data),
  list: (query: ListQuery, signal?: AbortSignal) => get<ActionList>(`${BASE}/actions`, { query: { ...query }, signal }).then((answer) => answer.data),
  detail: (reference: string, signal?: AbortSignal) => get<ActionDetail>(path(reference), { signal }).then((answer) => answer.data),
  /** The dedicated approval control: the hash of the payload that was shown, this decision's own key, and the second confirmation where one is needed. */
  approve: (reference: string, body: { payloadHash: string; idempotencyKey: string; secondConfirmation?: boolean }) => post<ActionDetail>(path(reference, '/approve'), body).then((answer) => answer.data),
  reject: (reference: string, note: string | null) => post<ActionDetail>(path(reference, '/reject'), note ? { note } : {}).then((answer) => answer.data),
  cancel: (reference: string) => post<ActionDetail>(path(reference, '/cancel'), {}).then((answer) => answer.data),
  retry: (reference: string) => post<ActionDetail>(path(reference, '/retry'), {}).then((answer) => answer.data),
}

/** A key for ONE decision: the same key again means the same decision (a double click, a retried request), never a second one. */
export function newDecisionKey(): string {
  const random = globalThis.crypto
  if (typeof random?.randomUUID === 'function') return random.randomUUID()
  const bytes = new Uint8Array(16)
  random.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
