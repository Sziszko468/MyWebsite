import type { AppContext, SessionInfo } from '../../../context.ts'
import { can } from '../../auth/permissions.ts'
import { mayDecide } from './lifecycle.ts'
import { CATALOG, RETRIABLE, type FailureCode, type Payload, type Preview } from './model.ts'
import { eventsOf, type ActionRow, type EventRow } from './store.ts'

/**
 * What the administration is told about an action (PROMPT 33). The frozen payload and the preview are shown as stored; the history is shown line by line with who did each step (the
 * assistant proposed, an administrator decided, the server executed). Nothing here carries a session, a key, a hash of a secret or an address: an administrator is shown by the e-mail
 * address they sign in with (the administration's own way of naming one), and only to an administrator who may see that action.
 */

type Emails = Map<string, string | null>

const emailOf = (app: AppContext, cache: Emails, id: string | null): string | null => {
  if (id === null) return null
  if (!cache.has(id)) cache.set(id, app.db.get<{ email: string }>('SELECT email FROM admin_users WHERE id = ?', [id])?.email ?? null)
  return cache.get(id) ?? null
}

const parse = <T>(text: string | null): T | null => {
  if (text === null) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

/** What this viewer may do with the action right now (the server checks again when they try). */
function abilities(app: AppContext, viewer: SessionInfo, row: ActionRow) {
  const decide = mayDecide(viewer, row)
  const enabled = app.config.ai.automation.enabled
  const permitted = can(viewer.role, CATALOG[row.action_type].permission)
  return {
    approve: decide && enabled && permitted && row.status === 'awaiting_approval',
    reject: decide && row.status === 'awaiting_approval',
    cancel: decide && (row.status === 'awaiting_approval' || row.status === 'proposed'),
    retry: decide && enabled && permitted && row.status === 'failed' && RETRIABLE.includes(row.failure_code as FailureCode),
  }
}

export function summaryView(app: AppContext, row: ActionRow, viewer: SessionInfo, cache: Emails = new Map()) {
  const preview = parse<Preview>(row.preview_json)
  const change = preview?.changes[0] ?? null
  return {
    reference: row.reference,
    type: row.action_type,
    status: row.status,
    administrator: { id: row.admin_id, email: emailOf(app, cache, row.admin_id) },
    target: { type: row.target_type, reference: row.target_ref, label: preview?.records[0]?.label ?? null },
    change,
    contentKind: preview?.contents[0]?.kind ?? null,
    requiresSecondConfirmation: row.requires_second_confirmation === 1,
    customerVisible: preview?.customerVisible ?? false,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    failureCode: row.failure_code,
    retryOf: row.retry_of,
    can: abilities(app, viewer, row),
  }
}

export interface EventView {
  seq: number
  kind: EventRow['kind']
  actor: { type: EventRow['actor_type']; id: string | null; email: string | null }
  from: EventRow['from_status']
  to: EventRow['to_status']
  detail: Record<string, unknown> | null
  at: string
  hash: string
}

export function eventView(app: AppContext, event: EventRow, cache: Emails): EventView {
  return {
    seq: event.seq,
    kind: event.kind,
    actor: { type: event.actor_type, id: event.actor_id, email: emailOf(app, cache, event.actor_id) },
    from: event.from_status,
    to: event.to_status,
    detail: parse<Record<string, unknown>>(event.detail_json),
    at: event.created_at,
    hash: event.hash,
  }
}

export function detailView(app: AppContext, row: ActionRow, viewer: SessionInfo) {
  const cache: Emails = new Map()
  const payload = parse<Payload>(row.payload_json)
  const retryOf = row.retry_of ? app.db.get<{ reference: string }>('SELECT reference FROM ai_actions WHERE id = ?', [row.retry_of])?.reference ?? null : null
  return {
    ...summaryView(app, row, viewer, cache),
    language: row.language,
    conversationId: row.conversation_id,
    reason: payload?.reason ?? null,
    preview: parse<Preview>(row.preview_json),
    payloadHash: row.payload_hash,
    definition: { permission: CATALOG[row.action_type].permission, reversible: CATALOG[row.action_type].reversible, customerVisible: CATALOG[row.action_type].customerVisible, secondConfirmation: CATALOG[row.action_type].secondConfirmation },
    decision: row.decided_at ? { by: { id: row.decided_by, email: emailOf(app, cache, row.decided_by) }, at: row.decided_at, note: row.decision_note, secondConfirmed: row.second_confirmed === 1 } : null,
    execution: { startedAt: row.started_at, finishedAt: row.finished_at, result: parse<Record<string, unknown>>(row.result_json), failureCode: row.failure_code },
    retryOf,
    history: eventsOf(app.db, row.id).map((event) => eventView(app, event, cache)),
  }
}
