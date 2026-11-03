import type { Database } from '../../db/database.ts'
import type { Language } from '../../config.ts'

export const INQUIRY_KINDS = ['job', 'collaboration', 'project', 'other'] as const
export type InquiryKind = (typeof INQUIRY_KINDS)[number]
export const INQUIRY_STATUSES = ['new', 'in_progress', 'answered', 'closed'] as const
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number]

export interface InquiryRow {
  id: string
  reference: string
  language: Language
  kind: InquiryKind
  name: string
  email: string
  subject: string
  message: string
  status: InquiryStatus
  archived_at: string | null
  consent_at: string | null
  ip_hash: string | null
  content_hash: string
  created_at: string
  updated_at: string
}

export interface NoteRow {
  id: number
  author_id: string | null
  author_email: string | null
  body: string
  created_at: string
}

export interface ListFilters {
  status?: string
  /** `exclude` (default): the working list; `only`: the archive; `all`. */
  archived?: 'exclude' | 'only' | 'all'
  kind?: string
  q?: string
  page: number
  pageSize: number
}

/** Escapes the characters LIKE treats specially, so a search for "50%" finds "50%" and not everything. */
export const likePattern = (q: string): string => `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

export function insertInquiry(db: Database, row: InquiryRow): void {
  db.run(
    `INSERT INTO inquiries (id, reference, language, kind, name, email, subject, message, status, archived_at, consent_at, ip_hash, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.reference, row.language, row.kind, row.name, row.email, row.subject, row.message, row.status, row.archived_at, row.consent_at, row.ip_hash, row.content_hash, row.created_at, row.updated_at],
  )
}

export function findRecentDuplicate(db: Database, contentHash: string, sinceIso: string): InquiryRow | undefined {
  return db.get<InquiryRow>('SELECT * FROM inquiries WHERE content_hash = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 1', [contentHash, sinceIso])
}

export const getInquiry = (db: Database, id: string): InquiryRow | undefined => db.get<InquiryRow>('SELECT * FROM inquiries WHERE id = ?', [id])

function where(filters: ListFilters): { sql: string; params: (string | number)[] } {
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (filters.status) {
    clauses.push('status = ?')
    params.push(filters.status)
  }
  if (filters.kind) {
    clauses.push('kind = ?')
    params.push(filters.kind)
  }
  if (filters.archived === 'only') clauses.push('archived_at IS NOT NULL')
  else if (filters.archived !== 'all') clauses.push('archived_at IS NULL')
  if (filters.q) {
    const like = likePattern(filters.q)
    clauses.push("(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR subject LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\')")
    params.push(like, like, like, like, like)
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

export function listInquiries(db: Database, filters: ListFilters): { rows: InquiryRow[]; total: number } {
  const { sql, params } = where(filters)
  const total = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM inquiries ${sql}`, params)?.n ?? 0
  const rows = db.all<InquiryRow>(`SELECT * FROM inquiries ${sql} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`, [...params, filters.pageSize, (filters.page - 1) * filters.pageSize])
  return { rows, total }
}

export function updateInquiryStatus(db: Database, id: string, status: InquiryStatus, nowIso: string): boolean {
  return db.run('UPDATE inquiries SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso, id]).changes > 0
}

export function setInquiryArchived(db: Database, id: string, archived: boolean, nowIso: string): boolean {
  return db.run('UPDATE inquiries SET archived_at = ?, updated_at = ? WHERE id = ?', [archived ? nowIso : null, nowIso, id]).changes > 0
}

export function addInquiryNote(db: Database, inquiryId: string, authorId: string, body: string, nowIso: string): void {
  db.run('INSERT INTO inquiry_notes (inquiry_id, author_id, body, created_at) VALUES (?, ?, ?, ?)', [inquiryId, authorId, body, nowIso])
  db.run('UPDATE inquiries SET updated_at = ? WHERE id = ?', [nowIso, inquiryId])
}

export const listInquiryNotes = (db: Database, inquiryId: string): NoteRow[] =>
  db.all<NoteRow>(
    `SELECT n.id, n.author_id, u.email AS author_email, n.body, n.created_at
     FROM inquiry_notes n LEFT JOIN admin_users u ON u.id = n.author_id
     WHERE n.inquiry_id = ? ORDER BY n.created_at, n.id`,
    [inquiryId],
  )

export const deleteInquiry = (db: Database, id: string): boolean => db.run('DELETE FROM inquiries WHERE id = ?', [id]).changes > 0

export function inquiryCounts(db: Database): { byStatus: Record<string, number>; archived: number; last7Days: number; last30Days: number; total: number } {
  const byStatus: Record<string, number> = {}
  for (const row of db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM inquiries WHERE archived_at IS NULL GROUP BY status')) byStatus[row.status] = row.n
  const archived = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM inquiries WHERE archived_at IS NOT NULL')?.n ?? 0
  const total = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM inquiries')?.n ?? 0
  return { byStatus, archived, total, last7Days: 0, last30Days: 0 }
}

export const countInquiriesSince = (db: Database, sinceIso: string): number => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM inquiries WHERE created_at >= ?', [sinceIso])?.n ?? 0
