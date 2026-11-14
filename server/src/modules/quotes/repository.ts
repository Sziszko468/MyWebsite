import type { Database } from '../../db/database.ts'
import type { Language } from '../../config.ts'
import { likePattern, orderBy, type ListSort, type NoteRow } from '../inquiries/repository.ts'
import type { PriceSnapshot } from '../shop/pricing.ts'
import { REQUEST_STATUSES, type Priority, type RequestSource, type RequestStatus, type RequestType } from './status.ts'

export const QUOTE_STATUSES = REQUEST_STATUSES
export type QuoteStatus = RequestStatus
export const OBJECTIVES = ['present', 'leads', 'sell', 'process', 'improve', 'other'] as const
export const TIMINGS = ['unsure', 'asap', 'weeks', 'months', 'flexible'] as const

export const QUOTE_KINDS = ['catalogue', 'full_experience'] as const
export type QuoteKind = (typeof QUOTE_KINDS)[number]
/** Where a request was written (see status.ts): the shop, CONTROL ROOM AI, a contact message an administrator turned into a request, or by hand. */
export type QuoteSource = RequestSource

export interface QuoteRow {
  id: string
  reference: string
  language: Language
  /** `catalogue`: built from the cart (items). `full_experience`: the flagship offer's configurator (no items, a brief). */
  kind: QuoteKind
  request_type: RequestType
  source: QuoteSource
  name: string
  email: string
  phone: string | null
  company: string | null
  website: string | null
  description: string
  objective: string | null
  reference_notes: string | null
  timing: string | null
  requirements: string | null
  /** What the visitor wrote about their budget, in their own words. */
  budget_range: string | null
  /** A FULL EXPERIENCE request's answers with the questions and labels as they were (modules/shop/brief.ts). */
  brief_json: string | null
  status: QuoteStatus
  /** The last status the customer was shown (moves only when an administrator chooses to show a change, or the customer acted). */
  customer_status: QuoteStatus
  priority: Priority
  /** The inquiry an administrator linked this request to. */
  inquiry_id: string | null
  archived_at: string | null
  consent_at: string | null
  marketing_consent_at: string | null
  ip_hash: string | null
  content_hash: string
  created_at: string
  updated_at: string
}

export interface NewItem {
  position: number
  need: string
  serviceId: number | null
  packageId: number | null
  plan: string
  extraIds: number[]
  snapshot: PriceSnapshot
  /** Names as they were when the request was made: `{ service, package, extras: [{ code, name }] }`, each name in every language. */
  names: Record<string, unknown>
}

export interface ItemView {
  position: number
  need: string
  service: string | null
  plan: string
  package: string | null
  extras: string[]
  snapshot: PriceSnapshot
  /** The names saved with the line (empty for a request made before they were saved). */
  names: Record<string, unknown>
}

export function insertQuote(db: Database, row: QuoteRow, items: readonly NewItem[]): void {
  db.run(
    `INSERT INTO quote_requests (id, reference, language, kind, request_type, source, name, email, phone, company, website, description, objective, reference_notes, timing, requirements, budget_range, brief_json, status, customer_status, priority, inquiry_id, archived_at, consent_at, marketing_consent_at, ip_hash, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.reference, row.language, row.kind, row.request_type, row.source, row.name, row.email, row.phone, row.company, row.website, row.description, row.objective, row.reference_notes, row.timing, row.requirements, row.budget_range, row.brief_json, row.status, row.customer_status, row.priority, row.inquiry_id, row.archived_at, row.consent_at, row.marketing_consent_at, row.ip_hash, row.content_hash, row.created_at, row.updated_at],
  )
  for (const item of items) {
    const result = db.run('INSERT INTO quote_request_items (quote_request_id, position, need, service_id, package_id, plan, price_snapshot, names_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      row.id,
      item.position,
      item.need,
      item.serviceId,
      item.packageId,
      item.plan,
      JSON.stringify(item.snapshot),
      JSON.stringify(item.names),
    ])
    for (const extraId of item.extraIds) db.run('INSERT INTO quote_request_item_extras (item_id, extra_id) VALUES (?, ?)', [result.lastInsertRowid, extraId])
  }
}

export const findRecentQuoteDuplicate = (db: Database, contentHash: string, sinceIso: string): QuoteRow | undefined =>
  db.get<QuoteRow>('SELECT * FROM quote_requests WHERE content_hash = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1', [contentHash, sinceIso])

export const getQuote = (db: Database, id: string): QuoteRow | undefined => db.get<QuoteRow>('SELECT * FROM quote_requests WHERE id = ?', [id])

export function quoteItems(db: Database, quoteId: string): ItemView[] {
  const items = db.all<{ id: number; position: number; need: string; plan: string; service: string | null; package: string | null; price_snapshot: string; names_json: string }>(
    `SELECT i.id, i.position, i.need, i.plan, s.slug AS service, p.code AS package, i.price_snapshot, i.names_json
     FROM quote_request_items i
     LEFT JOIN services s ON s.id = i.service_id
     LEFT JOIN packages p ON p.id = i.package_id
     WHERE i.quote_request_id = ? ORDER BY i.position`,
    [quoteId],
  )
  return items.map((item) => ({
    position: item.position,
    need: item.need,
    service: item.service,
    plan: item.plan,
    package: item.package,
    extras: db.all<{ code: string }>('SELECT e.code FROM quote_request_item_extras x JOIN extras e ON e.id = x.extra_id WHERE x.item_id = ? ORDER BY e.position, e.id', [item.id]).map((row) => row.code),
    snapshot: JSON.parse(item.price_snapshot) as PriceSnapshot,
    names: JSON.parse(item.names_json) as Record<string, unknown>,
  }))
}

export interface QuoteFilters {
  status?: string
  type?: string
  priority?: string
  source?: string
  /** The language the customer wrote in (hu, en, nl). */
  language?: string
  extraSort?: ExtraSort
  archived?: 'exclude' | 'only' | 'all'
  q?: string
  from?: string
  to?: string
  sort?: ListSort
  dir?: 'asc' | 'desc'
  page: number
  pageSize: number
}

function where(filters: QuoteFilters): { sql: string; params: (string | number)[] } {
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (filters.status) {
    clauses.push('status = ?')
    params.push(filters.status)
  }
  if (filters.type) {
    clauses.push('request_type = ?')
    params.push(filters.type)
  }
  if (filters.priority) {
    clauses.push('priority = ?')
    params.push(filters.priority)
  }
  if (filters.source) {
    clauses.push('source = ?')
    params.push(filters.source)
  }
  if (filters.language) {
    clauses.push('language = ?')
    params.push(filters.language)
  }
  if (filters.archived === 'only') clauses.push('archived_at IS NOT NULL')
  else if (filters.archived !== 'all') clauses.push('archived_at IS NULL')
  if (filters.from) {
    clauses.push('created_at >= ?')
    params.push(filters.from)
  }
  if (filters.to) {
    clauses.push('created_at <= ?')
    params.push(filters.to)
  }
  if (filters.q) {
    const like = likePattern(filters.q)
    clauses.push("(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR requirements LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\')")
    params.push(like, like, like, like, like, like)
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

/** The request list can also be sorted by priority (urgent first when descending), type and reference; the columns are fixed words, never the request's text. */
export const EXTRA_SORTS = ['priority', 'type', 'reference'] as const
export type ExtraSort = (typeof EXTRA_SORTS)[number]
const EXTRA_COLUMN: Record<ExtraSort, string> = {
  priority: "CASE priority WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 WHEN 'normal' THEN 1 ELSE 0 END",
  type: 'request_type',
  reference: 'reference',
}

function order(filters: QuoteFilters): string {
  if (filters.extraSort) return `ORDER BY ${EXTRA_COLUMN[filters.extraSort]} ${filters.dir === 'asc' ? 'ASC' : 'DESC'}, created_at DESC, id`
  return orderBy(filters.sort, filters.dir)
}

export function listQuotes(db: Database, filters: QuoteFilters): { rows: QuoteRow[]; total: number } {
  const { sql, params } = where(filters)
  const total = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM quote_requests ${sql}`, params)?.n ?? 0
  const rows = db.all<QuoteRow>(`SELECT * FROM quote_requests ${sql} ${order(filters)} LIMIT ? OFFSET ?`, [...params, filters.pageSize, (filters.page - 1) * filters.pageSize])
  return { rows, total }
}

export const updateQuoteStatus = (db: Database, id: string, status: QuoteStatus, nowIso: string): boolean =>
  db.run('UPDATE quote_requests SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso, id]).changes > 0

export const setQuoteArchived = (db: Database, id: string, archived: boolean, nowIso: string): boolean =>
  db.run('UPDATE quote_requests SET archived_at = ?, updated_at = ? WHERE id = ?', [archived ? nowIso : null, nowIso, id]).changes > 0

export function addQuoteNote(db: Database, quoteId: string, authorId: string, body: string, nowIso: string): void {
  db.run('INSERT INTO quote_request_notes (quote_request_id, author_id, body, created_at) VALUES (?, ?, ?, ?)', [quoteId, authorId, body, nowIso])
  db.run('UPDATE quote_requests SET updated_at = ? WHERE id = ?', [nowIso, quoteId])
}

export const listQuoteNotes = (db: Database, quoteId: string): NoteRow[] =>
  db.all<NoteRow>(
    `SELECT n.id, n.author_id, u.email AS author_email, n.body, n.created_at
     FROM quote_request_notes n LEFT JOIN admin_users u ON u.id = n.author_id
     WHERE n.quote_request_id = ? ORDER BY n.created_at, n.id`,
    [quoteId],
  )

export const deleteQuote = (db: Database, id: string): boolean => db.run('DELETE FROM quote_requests WHERE id = ?', [id]).changes > 0

export function quoteCounts(db: Database): { byStatus: Record<string, number>; archived: number; total: number } {
  const byStatus: Record<string, number> = {}
  for (const row of db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM quote_requests WHERE archived_at IS NULL GROUP BY status')) byStatus[row.status] = row.n
  return {
    byStatus,
    archived: db.get<{ n: number }>('SELECT COUNT(*) AS n FROM quote_requests WHERE archived_at IS NOT NULL')?.n ?? 0,
    total: db.get<{ n: number }>('SELECT COUNT(*) AS n FROM quote_requests')?.n ?? 0,
  }
}

export const countQuotesSince = (db: Database, sinceIso: string): number => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM quote_requests WHERE created_at >= ?', [sinceIso])?.n ?? 0
