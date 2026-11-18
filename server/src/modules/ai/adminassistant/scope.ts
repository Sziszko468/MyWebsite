import type { AppContext } from '../../../context.ts'
import type { Database } from '../../../db/database.ts'
import type { Access } from './access.ts'
import type { ContextType } from './store.ts'

/**
 * The context of a conversation, and what it lets the tools reach (PROMPT 31).
 *
 * A context is a REFERENCE: "this project", "this customer"… It is stored with the conversation and fixed for its whole life (changing it starts a new
 * conversation, so nothing said about one customer stays in the window of a conversation about another). It is never an authorization: every turn, and every tool
 * call, resolves it again against the database with the administrator's current permissions (`resolveScope`), and a context that no longer exists or is no longer
 * allowed simply makes the conversation unavailable, with one message for both cases.
 *
 * Resolving a context gives a `Scope`: for each kind of record, the ids the conversation may touch (`null` = no restriction, the general business context).
 * A tool looks a record up by the reference the model gave it and then asks `inScope(...)`; a record outside the scope is answered exactly like one that does not exist.
 * The sets are what is TIED to the context record: a customer's projects, quote requests, conversations and consultations; a project's quote request and its conversations;
 * a quote request's inquiry, consultations and projects; a conversation's own project and context; a consultation's quote request. Nothing else.
 */

export type Kind = 'customer' | 'project' | 'quote' | 'conversation' | 'booking' | 'inquiry'

export interface Scope {
  type: ContextType
  ref: string | null
  /** The context record itself (null for the general context). */
  self: { kind: Kind; id: string } | null
  /** Per kind: the ids reachable from here; `null` = anything the administrator's permissions allow (general context only). */
  sets: Record<Kind, ReadonlySet<string> | null>
}

export class ContextUnavailable extends Error {
  constructor() {
    super('context_unavailable')
    this.name = 'ContextUnavailable'
  }
}

const NOTHING: ReadonlySet<string> = new Set()
const set = (ids: Array<string | null | undefined>): ReadonlySet<string> => new Set(ids.filter((id): id is string => typeof id === 'string' && id !== ''))
const column = (db: Database, sql: string, params: string[]): string[] => db.all<{ id: string | null }>(sql, params).flatMap((row) => (row.id ? [row.id] : []))

/** The permission the context's own record needs (the tools need their own on top). */
const CONTEXT_PERMISSION = { project: 'clients:read', customer: 'clients:read', conversation: 'clients:read', quote: 'requests:read', consultation: 'requests:read' } as const

export const GENERAL: Scope = { type: 'general', ref: null, self: null, sets: { customer: null, project: null, quote: null, conversation: null, booking: null, inquiry: null } }

/**
 * The scope of a context, or `ContextUnavailable` (no such record, or this administrator may not read it: the same answer for both, so a context cannot be used to
 * find out whether a record exists).
 */
export function resolveScope(app: AppContext, access: Access, type: ContextType, ref: string | null): Scope {
  if (type === 'general') return GENERAL
  if (ref === null) throw new ContextUnavailable()
  if (!access.has(CONTEXT_PERMISSION[type])) throw new ContextUnavailable()
  const { db } = app
  if (type === 'customer') {
    const row = db.get<{ id: string }>('SELECT id FROM customers WHERE id = ?', [ref])
    if (!row) throw new ContextUnavailable()
    return {
      type,
      ref,
      self: { kind: 'customer', id: row.id },
      sets: {
        customer: set([row.id]),
        project: set(column(db, 'SELECT id FROM client_projects WHERE customer_id = ?', [row.id])),
        quote: set([
          ...column(db, 'SELECT quote_request_id AS id FROM customer_links WHERE customer_id = ? AND quote_request_id IS NOT NULL', [row.id]),
          ...column(db, 'SELECT quote_request_id AS id FROM client_projects WHERE customer_id = ? AND quote_request_id IS NOT NULL', [row.id]),
        ]),
        conversation: set(column(db, "SELECT id FROM conversations WHERE customer_id = ? AND kind = 'thread'", [row.id])),
        booking: set(column(db, 'SELECT booking_id AS id FROM customer_links WHERE customer_id = ? AND booking_id IS NOT NULL', [row.id])),
        inquiry: NOTHING,
      },
    }
  }
  if (type === 'project') {
    const row = db.get<{ id: string; quote_request_id: string | null }>('SELECT id, quote_request_id FROM client_projects WHERE reference = ?', [ref])
    if (!row) throw new ContextUnavailable()
    return {
      type,
      ref,
      self: { kind: 'project', id: row.id },
      sets: { customer: NOTHING, project: set([row.id]), quote: set([row.quote_request_id]), conversation: set(column(db, "SELECT id FROM conversations WHERE project_id = ? AND kind = 'thread'", [row.id])), booking: NOTHING, inquiry: NOTHING },
    }
  }
  if (type === 'quote') {
    const row = db.get<{ id: string; inquiry_id: string | null }>('SELECT id, inquiry_id FROM quote_requests WHERE reference = ?', [ref])
    if (!row) throw new ContextUnavailable()
    return {
      type,
      ref,
      self: { kind: 'quote', id: row.id },
      sets: {
        customer: NOTHING,
        project: set(column(db, 'SELECT id FROM client_projects WHERE quote_request_id = ?', [row.id])),
        quote: set([row.id]),
        conversation: set(column(db, "SELECT id FROM conversations WHERE context_type = 'quote' AND context_id = ? AND kind = 'thread'", [row.id])),
        booking: set(column(db, 'SELECT id FROM bookings WHERE quote_request_id = ?', [row.id])),
        inquiry: set([row.inquiry_id]),
      },
    }
  }
  if (type === 'conversation') {
    const row = db.get<{ id: string; project_id: string | null; context_type: string | null; context_id: string | null }>("SELECT id, project_id, context_type, context_id FROM conversations WHERE reference = ? AND kind = 'thread'", [ref])
    if (!row) throw new ContextUnavailable()
    return {
      type,
      ref,
      self: { kind: 'conversation', id: row.id },
      sets: {
        customer: NOTHING,
        project: set([row.project_id]),
        quote: row.context_type === 'quote' ? set([row.context_id]) : NOTHING,
        conversation: set([row.id]),
        booking: row.context_type === 'booking' ? set([row.context_id]) : NOTHING,
        inquiry: NOTHING,
      },
    }
  }
  // consultation
  const row = db.get<{ id: string; quote_request_id: string | null }>('SELECT id, quote_request_id FROM bookings WHERE reference = ?', [ref])
  if (!row) throw new ContextUnavailable()
  return { type, ref, self: { kind: 'booking', id: row.id }, sets: { customer: NOTHING, project: NOTHING, quote: set([row.quote_request_id]), conversation: NOTHING, booking: set([row.id]), inquiry: NOTHING } }
}

/** Whether a record of this kind may be reached from this scope. */
export function inScope(scope: Scope, kind: Kind, id: string): boolean {
  const ids = scope.sets[kind]
  return ids === null || ids.has(id)
}

/** The ids a search must be limited to (`null`: no limit). An empty list means "nothing can match". */
export function scopeIds(scope: Scope, kind: Kind): string[] | null {
  const ids = scope.sets[kind]
  return ids === null ? null : [...ids]
}

/** The general business context: the overview, the activity, the alerts, the briefing and the business reports make sense only here. */
export const isGeneral = (scope: Scope): boolean => scope.type === 'general'

/** A SQL fragment `AND <column> IN (?, ?)` (or `AND 0` for an empty scope) for a search restricted to the scope; empty string when there is no restriction. */
export function scopeClause(ids: string[] | null, column: string): { sql: string; params: string[] } {
  if (ids === null) return { sql: '', params: [] }
  if (ids.length === 0) return { sql: ' AND 0', params: [] }
  return { sql: ` AND ${column} IN (${ids.map(() => '?').join(', ')})`, params: ids }
}
