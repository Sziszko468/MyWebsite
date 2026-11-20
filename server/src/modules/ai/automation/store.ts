import type { Language } from '../../../config.ts'
import type { AppContext } from '../../../context.ts'
import type { Database } from '../../../db/database.ts'
import { sha256Hex } from '../../../lib/crypto.ts'
import { iso } from '../../../lib/time.ts'
import { audit } from '../../system/audit.ts'
import { canMove, GENESIS_HASH, payloadHashOf, type ActionStatus, type ActionType, type ActorType, type EventKind, type Payload, type TargetType } from './model.ts'

/**
 * Where the proposals and their history are kept (PROMPT 33): plain reads and writes of `ai_actions` and `ai_action_events`, and nothing that decides anything. The rules (who may,
 * when, what has to be re-checked) are in `lifecycle.ts`; the database's own triggers (migration 0019) refuse an invalid move, a change to the frozen content, any change to a
 * finished action, a delete, and any change to a history line.
 *
 * Every step of an action's life is one `ai_action_events` row, chained to the one before by a SHA-256 hash, AND one line of the platform's own audit log (`audit_log`, the single
 * audit mechanism the administration has): the first is the action's own timeline (like a project's or a booking's), the second is what the operator reads.
 */

export interface ActionRow {
  id: string
  reference: string
  action_type: ActionType
  status: ActionStatus
  admin_id: string
  conversation_id: string | null
  language: Language
  target_type: TargetType
  target_id: string | null
  target_ref: string | null
  payload_json: string
  payload_hash: string
  preview_json: string
  fingerprint: string
  idempotency_key: string
  requires_second_confirmation: 0 | 1
  expires_at: string
  retry_of: string | null
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  approved_hash: string | null
  approval_key: string | null
  second_confirmed: 0 | 1
  started_at: string | null
  finished_at: string | null
  result_json: string | null
  failure_code: string | null
  created_at: string
  updated_at: string
}

export interface EventRow {
  id: number
  action_id: string
  seq: number
  kind: EventKind
  actor_type: ActorType
  actor_id: string | null
  from_status: ActionStatus | null
  to_status: ActionStatus
  payload_hash: string
  detail_json: string | null
  prev_hash: string
  hash: string
  created_at: string
}

export const getAction = (db: Database, id: string): ActionRow | undefined => db.get<ActionRow>('SELECT * FROM ai_actions WHERE id = ?', [id])
export const getActionByReference = (db: Database, reference: string): ActionRow | undefined => db.get<ActionRow>('SELECT * FROM ai_actions WHERE reference = ?', [reference])
export const eventsOf = (db: Database, actionId: string): EventRow[] => db.all<EventRow>('SELECT * FROM ai_action_events WHERE action_id = ? ORDER BY seq', [actionId])

export type NewAction = Omit<ActionRow, 'decided_by' | 'decided_at' | 'decision_note' | 'approved_hash' | 'approval_key' | 'second_confirmed' | 'started_at' | 'finished_at' | 'result_json' | 'failure_code' | 'updated_at'>

export function insertAction(db: Database, row: NewAction, now: string): void {
  db.run(
    `INSERT INTO ai_actions (id, reference, action_type, status, admin_id, conversation_id, language, target_type, target_id, target_ref, payload_json, payload_hash, preview_json, fingerprint,
       idempotency_key, requires_second_confirmation, expires_at, retry_of, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.reference, row.action_type, row.status, row.admin_id, row.conversation_id, row.language, row.target_type, row.target_id, row.target_ref, row.payload_json, row.payload_hash, row.preview_json, row.fingerprint, row.idempotency_key, row.requires_second_confirmation, row.expires_at, row.retry_of, row.created_at, now],
  )
}

// ---- the history ----------------------------------------------------------------------------------------------------------------------------

export interface NewEvent {
  kind: EventKind
  actorType: ActorType
  /** The administrator an `ai` proposal was made for, or who decided. Null for the server. */
  actorId: string | null
  from: ActionStatus | null
  to: ActionStatus
  /** Codes and counts only. */
  detail?: Record<string, string | number | boolean | null>
}

/** The hash of one history line: everything that says what happened, and the hash of the line before it. */
export function eventHash(prev: string, event: { action_id: string; seq: number; kind: string; actor_type: string; actor_id: string | null; from_status: string | null; to_status: string; payload_hash: string; detail_json: string | null; created_at: string }): string {
  return sha256Hex(JSON.stringify([prev, event.action_id, event.seq, event.kind, event.actor_type, event.actor_id, event.from_status, event.to_status, event.payload_hash, event.detail_json, event.created_at]))
}

/**
 * Adds the next line to an action's history (and one line to the audit log). It must run in the same transaction as the status change it records, so a move never exists without its
 * line and a line never exists without its move.
 */
export function appendEvent(app: AppContext, action: Pick<ActionRow, 'id' | 'reference' | 'action_type' | 'payload_hash'>, event: NewEvent): EventRow {
  const last = app.db.get<{ seq: number; hash: string }>('SELECT seq, hash FROM ai_action_events WHERE action_id = ? ORDER BY seq DESC LIMIT 1', [action.id])
  const seq = (last?.seq ?? 0) + 1
  const prev = last?.hash ?? GENESIS_HASH
  const createdAt = iso(app.clock.now())
  const detail = event.detail ? JSON.stringify(event.detail) : null
  if (detail !== null && detail.length > 500) throw new RangeError('The detail of a history line is limited to 500 characters.')
  const row = { action_id: action.id, seq, kind: event.kind, actor_type: event.actorType, actor_id: event.actorId, from_status: event.from, to_status: event.to, payload_hash: action.payload_hash, detail_json: detail, created_at: createdAt }
  const hash = eventHash(prev, row)
  const id = app.db.run(
    'INSERT INTO ai_action_events (action_id, seq, kind, actor_type, actor_id, from_status, to_status, payload_hash, detail_json, prev_hash, hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [row.action_id, row.seq, row.kind, row.actor_type, row.actor_id, row.from_status, row.to_status, row.payload_hash, row.detail_json, prev, hash, row.created_at],
  ).lastInsertRowid
  // The platform's audit log: what the operator reads. The administrator is the actor of a proposal (it was made for them) and of a decision; the server's own steps have none.
  audit(app, event.actorId ? { userId: event.actorId } : null, `ai_action.${event.kind}`, 'ai_action', action.reference, { type: action.action_type, by: event.actorType, to: event.to, ...(event.detail ?? {}) })
  return { id, ...row, prev_hash: prev, hash } as EventRow
}

// ---- reading --------------------------------------------------------------------------------------------------------------------------------

export interface ListFilters {
  statuses?: readonly ActionStatus[]
  type?: ActionType
  adminId?: string
  /** A target's reference, or the start of one. */
  target?: string
  /** Created on or after this day (UTC, `YYYY-MM-DD`). */
  from?: string
  /** Created on or before this day. */
  to?: string
  page: number
  pageSize: number
}

const likeOf = (word: string): string => `%${word.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_')}%`

export function listActions(db: Database, filters: ListFilters, viewer: { userId: string; seesAll: boolean }): { rows: ActionRow[]; total: number } {
  const conditions: string[] = ['1 = 1']
  const params: Array<string | number> = []
  // An administrator without the system view sees only their own; with it, everyone's (and may filter by administrator).
  if (!viewer.seesAll) {
    conditions.push('a.admin_id = ?')
    params.push(viewer.userId)
  } else if (filters.adminId) {
    conditions.push('a.admin_id = ?')
    params.push(filters.adminId)
  }
  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(`a.status IN (${filters.statuses.map(() => '?').join(', ')})`)
    params.push(...filters.statuses)
  }
  if (filters.type) {
    conditions.push('a.action_type = ?')
    params.push(filters.type)
  }
  if (filters.target) {
    conditions.push("a.target_ref LIKE ? ESCAPE '!'")
    params.push(likeOf(filters.target))
  }
  if (filters.from) {
    conditions.push('a.created_at >= ?')
    params.push(`${filters.from}T00:00:00.000Z`)
  }
  if (filters.to) {
    conditions.push('a.created_at < ?')
    params.push(`${new Date(Date.parse(`${filters.to}T00:00:00.000Z`) + 86_400_000).toISOString()}`)
  }
  const where = conditions.join(' AND ')
  const total = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ai_actions a WHERE ${where}`, params)?.n ?? 0
  const rows = db.all<ActionRow>(`SELECT a.* FROM ai_actions a WHERE ${where} ORDER BY a.created_at DESC, a.id LIMIT ? OFFSET ?`, [...params, filters.pageSize, (filters.page - 1) * filters.pageSize])
  return { rows, total }
}

/** How many proposals an administrator has waiting for a decision. */
export const pendingCount = (db: Database, adminId: string): number => db.get<{ n: number }>("SELECT COUNT(*) AS n FROM ai_actions WHERE admin_id = ? AND status IN ('proposed', 'awaiting_approval')", [adminId])?.n ?? 0

// ---- integrity ------------------------------------------------------------------------------------------------------------------------------

export type IntegrityProblem = 'payload_hash_mismatch' | 'bad_start' | 'gap' | 'chain_break' | 'hash_mismatch' | 'event_payload_mismatch' | 'transition_invalid' | 'status_mismatch' | 'missing_history'

export interface IntegrityReport {
  ok: boolean
  actions: number
  events: number
  problems: Array<{ reference: string; seq: number | null; problem: IntegrityProblem }>
}

/**
 * Checks that the history of the actions is whole and unaltered: each action's frozen payload still has its hash; its lines start at 1 with no gap; each line's hash is the one its
 * content and its predecessor give; every line carries the action's payload hash; the statuses follow each other by the allowed moves; and the last line ends where the action is.
 * It proves the history is consistent with itself, not that nobody with direct access to the database could rewrite all of it (the limit is documented in docs/ai-automation).
 */
export function verifyHistory(db: Database, options: { reference?: string; limit?: number } = {}): IntegrityReport {
  const rows = options.reference
    ? db.all<ActionRow>('SELECT * FROM ai_actions WHERE reference = ?', [options.reference])
    : db.all<ActionRow>('SELECT * FROM ai_actions ORDER BY created_at, id LIMIT ?', [options.limit ?? 5000])
  const report: IntegrityReport = { ok: true, actions: rows.length, events: 0, problems: [] }
  const flag = (row: ActionRow, seq: number | null, problem: IntegrityProblem) => {
    report.ok = false
    report.problems.push({ reference: row.reference, seq, problem })
  }
  for (const row of rows) {
    let payloadOk = false
    try {
      payloadOk = payloadHashOf(JSON.parse(row.payload_json) as Payload) === row.payload_hash
    } catch {
      payloadOk = false
    }
    if (!payloadOk) flag(row, null, 'payload_hash_mismatch')
    const events = eventsOf(db, row.id)
    report.events += events.length
    if (events.length === 0) {
      flag(row, null, 'missing_history')
      continue
    }
    let prevHash = GENESIS_HASH
    let prevStatus: ActionStatus | null = null
    events.forEach((event, index) => {
      if (event.seq !== index + 1) flag(row, event.seq, 'gap')
      if (index === 0 && (event.kind !== 'proposal_created' || event.from_status !== null || event.to_status !== 'proposed')) flag(row, event.seq, 'bad_start')
      if (event.prev_hash !== prevHash) flag(row, event.seq, 'chain_break')
      if (eventHash(event.prev_hash, event) !== event.hash) flag(row, event.seq, 'hash_mismatch')
      if (event.payload_hash !== row.payload_hash) flag(row, event.seq, 'event_payload_mismatch')
      if (event.from_status !== prevStatus || (event.from_status !== null && !canMove(event.from_status, event.to_status))) flag(row, event.seq, 'transition_invalid')
      prevHash = event.hash
      prevStatus = event.to_status
    })
    if (prevStatus !== row.status) flag(row, events[events.length - 1].seq, 'status_mismatch')
  }
  return report
}

