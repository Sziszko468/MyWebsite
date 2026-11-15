import type { Database } from '../../db/database.ts'
import type { ParsedAttachment, ParsedMessage, ParsedRecipient } from './mime.ts'

/**
 * `gmail_messages` and `gmail_sync_state`: the only SQL of the Gmail import. Every value is bound as a parameter; the entity type of an
 * association is one of two fixed words, each with its own column, so nothing from a client or from a message is ever part of a statement.
 */

export type EntityType = 'inquiry' | 'quote_request'
export const ENTITY_TYPES: readonly EntityType[] = ['inquiry', 'quote_request']
export type AssociationSource = 'thread' | 'reference' | 'sender' | 'manual'

export interface Target {
  type: EntityType
  id: string
}

export interface MessageRow {
  id: string
  gmail_message_id: string
  gmail_thread_id: string
  rfc_message_id: string | null
  direction: 'inbound' | 'outbound'
  sender_address: string
  sender_name: string
  recipients_json: string
  subject: string
  body_text: string
  body_truncated: number
  received_at: string
  sent_at: string | null
  in_reply_to: string | null
  references_json: string
  attachments_json: string
  inquiry_id: string | null
  quote_request_id: string | null
  association_source: AssociationSource | null
  association_locked: number
  imported_at: string
}

export interface NewMessage {
  id: string
  parsed: ParsedMessage
  direction: 'inbound' | 'outbound'
  target: Target | null
  source: AssociationSource | null
  importedAt: string
}

export const targetOf = (row: Pick<MessageRow, 'inquiry_id' | 'quote_request_id'>): Target | null =>
  row.inquiry_id !== null ? { type: 'inquiry', id: row.inquiry_id } : row.quote_request_id !== null ? { type: 'quote_request', id: row.quote_request_id } : null

/** Messages that no request owns yet and that nobody has deliberately taken off a request. */
const PENDING = 'inquiry_id IS NULL AND quote_request_id IS NULL AND NOT (association_locked = 1 AND association_source IS NULL)'

/** Which of these Gmail ids are already stored (chunks of 100: SQLite limits the number of parameters). */
export function storedIds(db: Database, ids: readonly string[]): Set<string> {
  const found = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    if (chunk.length === 0) continue
    for (const row of db.all<{ gmail_message_id: string }>(`SELECT gmail_message_id FROM gmail_messages WHERE gmail_message_id IN (${chunk.map(() => '?').join(',')})`, chunk)) found.add(row.gmail_message_id)
  }
  return found
}

/** Stores one message. A Gmail id that is already there is left alone and reported as a duplicate (never an error, never a second row). */
export function insertMessage(db: Database, message: NewMessage): 'inserted' | 'duplicate' {
  const { parsed } = message
  const result = db.run(
    `INSERT INTO gmail_messages (id, gmail_message_id, gmail_thread_id, rfc_message_id, direction, sender_address, sender_name, recipients_json, subject, body_text, body_truncated, received_at, sent_at, in_reply_to, references_json, attachments_json, inquiry_id, quote_request_id, association_source, association_locked, imported_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT (gmail_message_id) DO NOTHING`,
    [
      message.id,
      parsed.gmailMessageId,
      parsed.gmailThreadId,
      parsed.rfcMessageId,
      message.direction,
      parsed.from?.address ?? '',
      parsed.from?.name ?? '',
      JSON.stringify(parsed.recipients),
      parsed.subject,
      parsed.bodyText,
      parsed.bodyTruncated ? 1 : 0,
      parsed.receivedAt,
      parsed.sentAt,
      parsed.inReplyTo,
      JSON.stringify(parsed.references),
      JSON.stringify(parsed.attachments),
      message.target?.type === 'inquiry' ? message.target.id : null,
      message.target?.type === 'quote_request' ? message.target.id : null,
      message.target ? message.source : null,
      message.importedAt,
    ],
  )
  return result.changes === 0 ? 'duplicate' : 'inserted'
}

export function getMessage(db: Database, id: string): MessageRow | undefined {
  return db.get<MessageRow>('SELECT * FROM gmail_messages WHERE id = ?', [id])
}

export function listForTarget(db: Database, target: Target, limit: number, offset: number): { rows: MessageRow[]; total: number } {
  const column = target.type === 'inquiry' ? 'inquiry_id' : 'quote_request_id'
  const total = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM gmail_messages WHERE ${column} = ?`, [target.id])?.n ?? 0
  const rows = db.all<MessageRow>(`SELECT * FROM gmail_messages WHERE ${column} = ? ORDER BY received_at ASC, id ASC LIMIT ? OFFSET ?`, [target.id, limit, offset])
  return { rows, total }
}

export function listPending(db: Database, limit: number, offset: number): { rows: MessageRow[]; total: number } {
  const total = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM gmail_messages WHERE ${PENDING}`)?.n ?? 0
  const rows = db.all<MessageRow>(`SELECT * FROM gmail_messages WHERE ${PENDING} ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`, [limit, offset])
  return { rows, total }
}

export function messageCounts(db: Database): { imported: number; pending: number } {
  return {
    imported: db.get<{ n: number }>('SELECT COUNT(*) AS n FROM gmail_messages')?.n ?? 0,
    pending: db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM gmail_messages WHERE ${PENDING}`)?.n ?? 0,
  }
}

/** The request exists (the table is chosen by the whitelisted type, never by a string from outside). */
export function targetExists(db: Database, target: Target): boolean {
  const sql = target.type === 'inquiry' ? 'SELECT 1 AS x FROM inquiries WHERE id = ?' : 'SELECT 1 AS x FROM quote_requests WHERE id = ?'
  return db.get(sql, [target.id]) !== undefined
}

/** Sets or clears the association of one message. A person's decision (`manual`, or a clear) is locked: no automatic rule may change it. */
export function writeAssociation(db: Database, id: string, target: Target | null, source: AssociationSource | null, locked: boolean): boolean {
  return (
    db.run('UPDATE gmail_messages SET inquiry_id = ?, quote_request_id = ?, association_source = ?, association_locked = ? WHERE id = ?', [
      target?.type === 'inquiry' ? target.id : null,
      target?.type === 'quote_request' ? target.id : null,
      target ? source : null,
      locked ? 1 : 0,
      id,
    ]).changes > 0
  )
}

// ------------------------------------------------------------------------------------------------------------- views

export interface MessageSummary {
  id: string
  threadId: string
  direction: 'inbound' | 'outbound'
  from: { name: string; address: string }
  to: { name: string; address: string; type: 'to' | 'cc' }[]
  subject: string
  /** The start of the text, on one line. */
  snippet: string
  receivedAt: string
  attachmentCount: number
  association: { entityType: EntityType; entityId: string; source: AssociationSource | null } | null
}

export interface MessageDetail extends MessageSummary {
  bodyText: string
  bodyTruncated: boolean
  sentAt: string | null
  attachments: { filename: string; mimeType: string; size: number; inline: boolean }[]
  /** An administrator took it off its request on purpose. */
  manuallyCleared: boolean
}

function json<T>(text: string, fallback: T): T {
  try {
    const value = JSON.parse(text) as unknown
    return Array.isArray(value) ? (value as T) : fallback
  } catch {
    return fallback
  }
}

export function summaryOf(row: MessageRow): MessageSummary {
  const target = targetOf(row)
  return {
    id: row.id,
    threadId: row.gmail_thread_id,
    direction: row.direction,
    from: { name: row.sender_name, address: row.sender_address },
    to: json<ParsedRecipient[]>(row.recipients_json, []).map((entry) => ({ name: entry.name, address: entry.address, type: entry.type })),
    subject: row.subject,
    snippet: row.body_text.slice(0, 400).replace(/\s+/g, ' ').trim().slice(0, 200),
    receivedAt: row.received_at,
    attachmentCount: json<ParsedAttachment[]>(row.attachments_json, []).length,
    association: target ? { entityType: target.type, entityId: target.id, source: row.association_source } : null,
  }
}

/** One message as the administration may see it. The raw payload, the headers other than these, and Gmail's own ids of parts are never part of it. */
export function detailOf(row: MessageRow): MessageDetail {
  return {
    ...summaryOf(row),
    bodyText: row.body_text,
    bodyTruncated: row.body_truncated === 1,
    sentAt: row.sent_at,
    attachments: json<ParsedAttachment[]>(row.attachments_json, []).map((entry) => ({ filename: entry.filename, mimeType: entry.mimeType, size: entry.size, inline: entry.inline })),
    manuallyCleared: row.association_locked === 1 && row.association_source === null,
  }
}

// ----------------------------------------------------------------------------------------------------- sync state

export interface SyncState {
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  lastImported: number
  lastFailed: number
}

export function readSyncState(db: Database): SyncState {
  const row = db.get<{ last_attempt_at: string | null; last_success_at: string | null; last_error: string | null; last_imported: number; last_failed: number }>('SELECT * FROM gmail_sync_state WHERE id = 1')
  return { lastAttemptAt: row?.last_attempt_at ?? null, lastSuccessAt: row?.last_success_at ?? null, lastError: row?.last_error ?? null, lastImported: row?.last_imported ?? 0, lastFailed: row?.last_failed ?? 0 }
}

export function writeSyncState(db: Database, state: SyncState): void {
  db.run('UPDATE gmail_sync_state SET last_attempt_at = ?, last_success_at = ?, last_error = ?, last_imported = ?, last_failed = ? WHERE id = 1', [state.lastAttemptAt, state.lastSuccessAt, state.lastError, state.lastImported, state.lastFailed])
}
