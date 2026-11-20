import type { Language } from '../../../config.ts'
import type { AppContext, SessionInfo } from '../../../context.ts'
import { HttpError, forbidden, notFound, unauthorized, validationFailed } from '../../../http/errors.ts'
import { newId, newReference, sha256Hex } from '../../../lib/crypto.ts'
import { cleanLine } from '../../../lib/text.ts'
import { addMs, iso, MINUTE } from '../../../lib/time.ts'
import { can } from '../../auth/permissions.ts'
import { audit } from '../../system/audit.ts'
import { peekSession, type Authority } from '../adminassistant/access.ts'
import { findSensitive } from '../sensitive.ts'
import { ACTIONS, type Assessed } from './actions.ts'
import { ActionProblem, canonicalJson, CATALOG, FINAL_STATUSES, LIMITS, payloadHashOf, RETRIABLE, type ActionStatus, type ActionType, type FailureCode, type Payload } from './model.ts'
import { appendEvent, getActionByReference, getAction, insertAction, pendingCount, type ActionRow, type NewEvent } from './store.ts'

/**
 * The life of an action (PROMPT 33). Everything that moves an action from one status to the next is here, and every move is the same four things in one transaction: the conditional
 * UPDATE (it only succeeds if the row is still in the status the code believes it is in: that is what makes a second, simultaneous or replayed request lose), the row's new
 * columns, one line of the action's history and one line of the audit log. The database's triggers refuse any other move, so a bug here cannot invent one.
 *
 *   propose          the assistant (for an administrator): proposed -> awaiting_approval, content frozen, hash computed, expiry set
 *   approve          an administrator, with the dedicated control: awaiting_approval -> approved, then immediately execute (below)
 *   execute          the server: approved -> executing -> completed | failed, after re-checking the session, the permission, the frozen content and the target's state
 *   reject / cancel  an administrator: awaiting_approval -> rejected / cancelled
 *   expire           the server: awaiting_approval -> expired, when its time is up
 *   recover          the server: approved / executing -> failed (`interrupted`), for a row a crash left behind; it is never run
 *   retry            an administrator: a failed action whose failure was not its content makes a NEW proposal (the old one stays failed); it needs its own approval
 *
 * Nothing here runs an action because an assistant, a chat message or a timer said so. The only path to `approved` is `approve`, called by the approval route with an
 * administrator's own session.
 */

/** Why a proposal could not be made (the assistant is told the code, not more). */
export class ProposalRefused extends Error {
  readonly code: 'automation_disabled' | 'too_many_pending'
  constructor(code: ProposalRefused['code']) {
    super(code)
    this.name = 'ProposalRefused'
    this.code = code
  }
}

const conflictOf = (message: string, reason: string, extra: Record<string, unknown> = {}) => new HttpError(409, 'conflict', message, { details: { reason, ...extra } })

/** Who may see an action, and who may decide it: its administrator, and every administrator who may read (or write) the system. */
export const mayView = (session: SessionInfo, row: Pick<ActionRow, 'admin_id'>): boolean => row.admin_id === session.userId || can(session.role, 'system:read')
export const mayDecide = (session: SessionInfo, row: Pick<ActionRow, 'admin_id'>): boolean => row.admin_id === session.userId || can(session.role, 'system:write')

// ---- one move ---------------------------------------------------------------------------------------------------------------------------------

type Columns = Partial<Record<'decided_by' | 'decided_at' | 'decision_note' | 'approved_hash' | 'approval_key' | 'second_confirmed' | 'started_at' | 'finished_at' | 'result_json' | 'failure_code', string | number | null>>
const COLUMN_NAMES = new Set(['decided_by', 'decided_at', 'decision_note', 'approved_hash', 'approval_key', 'second_confirmed', 'started_at', 'finished_at', 'result_json', 'failure_code'])

/** Moves an action to the next status, if it is still in the status the caller saw; writes the history line. Must run inside a transaction. */
function move(app: AppContext, row: ActionRow, to: ActionStatus, columns: Columns, event: Omit<NewEvent, 'from' | 'to'>): ActionRow {
  const names = Object.keys(columns)
  for (const name of names) if (!COLUMN_NAMES.has(name)) throw new Error(`Not a column an action may set: ${name}`)
  const now = iso(app.clock.now())
  // The column names are checked against the fixed list above; the values are bound.
  const clauses = names.map((name) => `, ${name} = ?`).join('')
  const result = app.db.run(`UPDATE ai_actions SET status = ?, updated_at = ?${clauses} WHERE id = ? AND status = ?`, [to, now, ...names.map((name) => columns[name as keyof Columns] as string | number | null), row.id, row.status])
  // Another request got there first (or the status was never what the caller thought): nothing was changed.
  if (result.changes !== 1) throw conflictOf('This action has already been dealt with.', 'state_changed')
  appendEvent(app, row, { ...event, from: row.status, to })
  return getAction(app.db, row.id)!
}

const atomically = <T>(app: AppContext, work: () => T): T => app.db.transaction(work)

// ---- proposing ----------------------------------------------------------------------------------------------------------------------------------

export interface ProposalInput {
  /** The administrator the proposal is for (the assistant works under their session). */
  session: SessionInfo
  conversationId: string | null
  language: Language
  type: ActionType
  assessed: Assessed
  params: Record<string, unknown>
  /** Why the assistant proposes it. */
  reason: string
  /** A retry of a failed action: the new proposal points at it, and the first history line says an administrator (not the assistant) made it. */
  retryOf?: string
}

export function createProposal(app: AppContext, input: ProposalInput): { row: ActionRow; duplicate: boolean } {
  const settings = app.config.ai.automation
  if (!settings.enabled) throw new ProposalRefused('automation_disabled')
  expireDue(app)
  const payload: Payload = { v: 1, type: input.type, target: input.assessed.target, params: input.params, reason: input.reason, language: input.language }
  const payloadHash = payloadHashOf(payload)
  const idempotencyKey = sha256Hex(`${input.session.userId}|${input.conversationId ?? ''}|${payloadHash}`)
  // The same proposal, from the same administrator and conversation, that is still going: it is returned, not made again (a model that asks twice, a retried request).
  const existing = app.db.get<ActionRow>("SELECT * FROM ai_actions WHERE idempotency_key = ? AND status IN ('proposed', 'awaiting_approval', 'approved', 'executing')", [idempotencyKey])
  if (existing) return { row: existing, duplicate: true }
  if (pendingCount(app.db, input.session.userId) >= settings.maxPending) throw new ProposalRefused('too_many_pending')
  const now = app.clock.now()
  const id = newId()
  let reference = newReference('ACT')
  for (let attempt = 0; attempt < 8 && app.db.get('SELECT 1 FROM ai_actions WHERE reference = ?', [reference]); attempt += 1) reference = newReference('ACT')
  const definition = CATALOG[input.type]
  atomically(app, () => {
    insertAction(
      app.db,
      {
        id,
        reference,
        action_type: input.type,
        status: 'proposed',
        admin_id: input.session.userId,
        conversation_id: input.conversationId,
        language: input.language,
        target_type: input.assessed.target.type,
        target_id: input.assessed.target.id,
        target_ref: input.assessed.target.reference,
        payload_json: canonicalJson(payload),
        payload_hash: payloadHash,
        preview_json: canonicalJson(input.assessed.preview),
        fingerprint: input.assessed.fingerprint,
        idempotency_key: idempotencyKey,
        requires_second_confirmation: input.assessed.secondConfirmation ? 1 : 0,
        expires_at: iso(addMs(now, settings.ttlMinutes * MINUTE)),
        retry_of: input.retryOf ?? null,
        created_at: iso(now),
      },
      iso(now),
    )
    const created = getAction(app.db, id)!
    appendEvent(app, created, { kind: 'proposal_created', actorType: input.retryOf ? 'admin' : 'ai', actorId: input.session.userId, from: null, to: 'proposed', detail: { type: input.type, secondConfirmation: input.assessed.secondConfirmation, ...(input.retryOf ? { retry: true } : {}), reversible: definition.reversible } })
    move(app, created, 'awaiting_approval', {}, { kind: 'submitted', actorType: 'server', actorId: null })
  })
  return { row: getAction(app.db, id)!, duplicate: false }
}

// ---- time and crashes --------------------------------------------------------------------------------------------------------------------------

/** Moves every proposal whose time is up to `expired`. Called whenever actions are read or decided, and by the maintenance run, so an expired proposal is never approved. */
export function expireDue(app: AppContext): number {
  const now = iso(app.clock.now())
  const due = app.db.all<ActionRow>("SELECT * FROM ai_actions WHERE status = 'awaiting_approval' AND expires_at <= ?", [now])
  let expired = 0
  for (const row of due) {
    try {
      atomically(app, () => move(app, row, 'expired', { finished_at: now }, { kind: 'expired', actorType: 'server', actorId: null }))
      expired += 1
    } catch (error) {
      if (!(error instanceof HttpError)) throw error
    }
  }
  return expired
}

/** A row left in `approved` or `executing` is one a crash interrupted (a request runs its action from approval to the end without waiting for anything). It is NOT run again: it fails. */
export function recoverStuck(app: AppContext): number {
  const now = app.clock.now()
  const stuck = app.db.all<ActionRow>("SELECT * FROM ai_actions WHERE status IN ('approved', 'executing') AND updated_at <= ?", [iso(addMs(now, -LIMITS.stuckSeconds * 1000))])
  let recovered = 0
  for (const row of stuck) {
    try {
      atomically(app, () => move(app, row, 'failed', { finished_at: iso(now), failure_code: 'interrupted' }, { kind: 'execution_failed', actorType: 'server', actorId: null, detail: { code: 'interrupted' } }))
      recovered += 1
    } catch (error) {
      if (!(error instanceof HttpError)) throw error
    }
  }
  return recovered
}

// ---- checking the state of things --------------------------------------------------------------------------------------------------------------

/** The parsed payload of a row, or null when it is not the payload its hash says (a row edited by hand, or damaged). */
function intactPayload(row: ActionRow): Payload | null {
  try {
    const payload = JSON.parse(row.payload_json) as Payload
    if (payloadHashOf(payload) !== row.payload_hash) return null
    if (payload.type !== row.action_type || payload.target.id !== row.target_id || payload.target.reference !== row.target_ref || payload.target.type !== row.target_type) return null
    return payload
  } catch {
    return null
  }
}

/**
 * The current state of the world against what was approved: the parameters are still acceptable, the business rules still allow it, the target is the one proposed and its state is
 * the state the proposal was made on. Returns the reason it no longer holds, or null.
 */
function stale(app: AppContext, session: SessionInfo, row: ActionRow, payload: Payload): FailureCode | null {
  const action = ACTIONS[row.action_type]
  try {
    if (canonicalJson(action.parse(payload.params)) !== canonicalJson(payload.params)) return 'validation_failed'
    const assessed = action.assess(app, session, payload.target.id, payload.params, payload.language)
    return assessed.fingerprint === row.fingerprint ? null : 'target_changed'
  } catch (error) {
    if (error instanceof ActionProblem) return error.code
    if (error instanceof HttpError) return error.status === 403 ? 'permission_lost' : error.status === 404 ? 'target_missing' : 'validation_failed'
    throw error
  }
}

function failureCodeOf(error: unknown): FailureCode {
  if (error instanceof ActionProblem) return error.code
  if (error instanceof HttpError) {
    if (error.status === 403) return 'permission_lost'
    if (error.status === 404) return 'target_missing'
    const reason = (error.details as { reason?: unknown } | undefined)?.reason
    if (reason === 'bookings_in_range' || reason === 'invalid_transition') return reason
    if (error.status === 409 || error.status === 422 || error.status === 400) return 'validation_failed'
  }
  return 'execution_error'
}

/** Ends an action that cannot go on: `failed`, with the code. */
function fail(app: AppContext, row: ActionRow, code: FailureCode, kind: 'approval_invalidated' | 'execution_failed'): ActionRow {
  const now = iso(app.clock.now())
  return atomically(app, () => move(app, row, 'failed', { finished_at: now, failure_code: code }, { kind, actorType: 'server', actorId: null, detail: { code } }))
}

// ---- approving and executing -------------------------------------------------------------------------------------------------------------------

export interface ApproveInput {
  /** The hash of the payload the administrator was shown. The server compares it with the frozen one. */
  payloadHash: string
  /** The second confirmation, for an action that needs one. */
  secondConfirmation: boolean
  /** A key the screen makes for this one decision: the same key again is the same decision (a double click, a retried request), not a second one. */
  idempotencyKey: string
}

const KEY = /^[A-Za-z0-9_-]{16,64}$/
export const isIdempotencyKey = (value: unknown): value is string => typeof value === 'string' && KEY.test(value)

function sessionOf(app: AppContext, authority: Authority): SessionInfo {
  const session = peekSession(app, authority)
  if (!session) throw unauthorized()
  if (!can(session.role, 'assistant:use')) throw forbidden()
  return session
}

function rowFor(app: AppContext, session: SessionInfo, reference: string, rule: 'view' | 'decide'): ActionRow {
  const row = getActionByReference(app.db, reference)
  // Another administrator's action, and one that does not exist, are the same answer.
  if (!row || !(rule === 'view' ? mayView(session, row) : mayDecide(session, row))) throw notFound('The action')
  return row
}

/**
 * Approves an action and runs it, as one request: this is the dedicated approval control. Returns the action as it ends up (`completed`, or `failed` when the execution could not
 * go through; a request that cannot even be approved is an error and changes nothing, except an approval that no longer holds, which fails the action and says why).
 */
export function approveAction(app: AppContext, authority: Authority, reference: string, input: ApproveInput): ActionRow {
  const session = sessionOf(app, authority)
  expireDue(app)
  recoverStuck(app)
  let row = rowFor(app, session, reference, 'decide')
  // The same decision again (same key, same administrator): the answer is what it already is, never a second execution.
  if (row.approval_key !== null && row.approval_key === input.idempotencyKey && row.decided_by === session.userId && row.status !== 'awaiting_approval') return row
  if (!app.config.ai.automation.enabled) throw conflictOf('Automation is switched off.', 'automation_disabled')
  if (row.status !== 'awaiting_approval') throw conflictOf('This action is not waiting for approval.', 'not_awaiting_approval', { status: row.status })
  // The permission first: whoever may not do this learns nothing about the proposal's content or hash.
  if (!can(session.role, CATALOG[row.action_type].permission)) {
    audit(app, session, 'ai_action.approval_refused', 'ai_action', row.reference, { reason: 'permission_lost' })
    throw forbidden()
  }
  if (input.payloadHash !== row.payload_hash) {
    audit(app, session, 'ai_action.approval_refused', 'ai_action', row.reference, { reason: 'payload_mismatch' })
    throw conflictOf('The proposal is not the one that was approved. Reload it and look again.', 'payload_mismatch')
  }
  if (row.requires_second_confirmation === 1 && !input.secondConfirmation) throw validationFailed({ secondConfirmation: 'required' }, 'This action needs a second confirmation.')
  const payload = intactPayload(row)
  const problem = payload === null ? 'payload_tampered' : stale(app, session, row, payload)
  if (problem !== null) {
    row = fail(app, row, problem, 'approval_invalidated')
    throw conflictOf('This proposal no longer holds. Ask for a new one.', problem, { status: row.status, reference: row.reference })
  }
  row = atomically(app, () =>
    move(app, row, 'approved', { decided_by: session.userId, decided_at: iso(app.clock.now()), approved_hash: row.payload_hash, approval_key: input.idempotencyKey, second_confirmed: input.secondConfirmation ? 1 : 0 }, { kind: 'approval_granted', actorType: 'admin', actorId: session.userId, detail: { secondConfirmed: input.secondConfirmation } }),
  )
  return execute(app, authority, row)
}

/**
 * Runs an approved action: claims it (`approved -> executing`, once), re-reads the session and the role, re-verifies the frozen content and the approval's hash, re-checks the
 * target's state, and only then calls the business function, in a transaction together with the move to `completed`. Any failure leaves the business data as it was.
 */
function execute(app: AppContext, authority: Authority, approved: ActionRow): ActionRow {
  const started = atomically(app, () => move(app, approved, 'executing', { started_at: iso(app.clock.now()) }, { kind: 'execution_started', actorType: 'server', actorId: null }))
  // Immediately before it runs: the session as it is NOW (a sign-out, a disabled account or a changed role since the click ends it here)…
  const session = peekSession(app, authority)
  if (!session) return fail(app, started, 'session_ended', 'execution_failed')
  if (!can(session.role, CATALOG[started.action_type].permission) || !can(session.role, 'assistant:use')) return fail(app, started, 'permission_lost', 'execution_failed')
  if (!app.config.ai.automation.enabled) return fail(app, started, 'automation_disabled', 'execution_failed')
  // …the frozen content and what the approval was bound to…
  const payload = intactPayload(started)
  if (payload === null || started.approved_hash !== started.payload_hash || started.decided_by !== session.userId) return fail(app, started, 'payload_tampered', 'execution_failed')
  // …and the target, once more.
  const problem = stale(app, session, started, payload)
  if (problem !== null) return fail(app, started, problem, 'execution_failed')
  try {
    return atomically(app, () => {
      const result = ACTIONS[started.action_type].execute(app, session, payload)
      return move(app, started, 'completed', { finished_at: iso(app.clock.now()), result_json: JSON.stringify(result) }, { kind: 'execution_succeeded', actorType: 'server', actorId: null, detail: { ok: true } })
    })
  } catch (error) {
    // The transaction rolled back: the business data is as it was. The action records why.
    return fail(app, started, failureCodeOf(error), 'execution_failed')
  }
}

// ---- declining ------------------------------------------------------------------------------------------------------------------------------------

export function rejectAction(app: AppContext, authority: Authority, reference: string, input: { note: string | null }): ActionRow {
  const session = sessionOf(app, authority)
  expireDue(app)
  const row = rowFor(app, session, reference, 'decide')
  if (row.status !== 'awaiting_approval') throw conflictOf('This action is not waiting for approval.', 'not_awaiting_approval', { status: row.status })
  const note = input.note === null ? null : cleanLine(input.note).slice(0, LIMITS.decisionNote) || null
  if (note !== null && findSensitive(note) !== null) throw validationFailed({ note: 'invalid' })
  const now = iso(app.clock.now())
  return atomically(app, () => move(app, row, 'rejected', { decided_by: session.userId, decided_at: now, decision_note: note, finished_at: now }, { kind: 'rejected', actorType: 'admin', actorId: session.userId }))
}

export function cancelAction(app: AppContext, authority: Authority, reference: string): ActionRow {
  const session = sessionOf(app, authority)
  expireDue(app)
  const row = rowFor(app, session, reference, 'decide')
  if (row.status !== 'awaiting_approval' && row.status !== 'proposed') throw conflictOf('This action can no longer be cancelled.', 'not_cancellable', { status: row.status })
  const now = iso(app.clock.now())
  return atomically(app, () => move(app, row, 'cancelled', { decided_by: session.userId, decided_at: now, finished_at: now }, { kind: 'cancelled', actorType: 'admin', actorId: session.userId }))
}

// ---- recovery ---------------------------------------------------------------------------------------------------------------------------------------

/** How many retries lie behind this action (it, and the ones it retried). */
function retriesBehind(app: AppContext, row: ActionRow): number {
  let count = 0
  let current: ActionRow | undefined = row
  while (current?.retry_of && count < 10) {
    count += 1
    current = getAction(app.db, current.retry_of)
  }
  return count
}

/**
 * A failed action whose failure was not its content (the execution went wrong, or a crash interrupted it) can be proposed again: a NEW action with the same frozen payload, assessed
 * again against the world as it is now, waiting for a new approval. The failed one stays failed. A failure that was the content's (the target changed, a rule says no, the
 * permission was lost) is never retried: it needs a new proposal.
 */
export function retryAction(app: AppContext, authority: Authority, reference: string): ActionRow {
  const session = sessionOf(app, authority)
  if (!app.config.ai.automation.enabled) throw conflictOf('Automation is switched off.', 'automation_disabled')
  const row = rowFor(app, session, reference, 'decide')
  if (row.status !== 'failed' || !RETRIABLE.includes(row.failure_code as FailureCode)) throw conflictOf('This action cannot be retried. Ask for a new proposal.', 'not_retriable', { status: row.status })
  if (retriesBehind(app, row) >= LIMITS.retries) throw conflictOf('This action has been retried too many times.', 'too_many_retries')
  if (!can(session.role, CATALOG[row.action_type].permission)) throw forbidden()
  const payload = intactPayload(row)
  if (payload === null) throw conflictOf('This action cannot be retried.', 'payload_tampered')
  let assessed: Assessed
  try {
    assessed = ACTIONS[row.action_type].assess(app, session, payload.target.id, ACTIONS[row.action_type].parse(payload.params), payload.language)
  } catch (error) {
    const code = failureCodeOf(error)
    throw conflictOf('This proposal no longer holds. Ask for a new one.', code)
  }
  try {
    return createProposal(app, { session, conversationId: row.conversation_id, language: payload.language, type: row.action_type, assessed, params: payload.params, reason: payload.reason, retryOf: row.id }).row
  } catch (error) {
    if (error instanceof ProposalRefused) throw conflictOf('Too many proposals are waiting. Decide some first.', error.code)
    throw error
  }
}

/** True for the statuses an action can no longer leave. */
export const isFinal = (status: ActionStatus): boolean => FINAL_STATUSES.includes(status)
