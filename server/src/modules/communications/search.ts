import { validationFailed } from '../../http/errors.ts'
import { LIMITS } from './model.ts'

/**
 * The small pieces of searching and paging that both sides share (PROMPT 28). A search is a parameterized `LIKE` with the wildcards of what a person typed escaped (so `50%` finds
 * "50%", not everything), two to a hundred characters, and always inside a scope the caller fixed in SQL (a customer's own conversations; for an administrator, everything they may
 * read, which is where the private notes are). Nothing a person types is ever put into SQL text.
 */

/** The text a person typed, tidied and checked. */
export function searchTerm(raw: unknown): string {
  if (typeof raw !== 'string') throw validationFailed({ q: 'required' })
  const term = raw.replace(/\s+/g, ' ').trim()
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(term)) throw validationFailed({ q: 'invalid' })
  if (term.length < LIMITS.searchMin) throw validationFailed({ q: 'tooShort' })
  if (term.length > LIMITS.searchMax) throw validationFailed({ q: 'tooLong' })
  return term
}

/** `%term%` with `\`, `%` and `_` escaped; used with `ESCAPE '\'`. */
export const likePattern = (term: string): string => `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`

/** A few words around the first place the term occurs in a text (for a result), or the start of the text. */
export function snippet(text: string, term: string, radius = 70): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const at = flat.toLowerCase().indexOf(term.toLowerCase())
  if (at < 0) return flat.slice(0, radius * 2) + (flat.length > radius * 2 ? '…' : '')
  const from = Math.max(0, at - radius)
  const to = Math.min(flat.length, at + term.length + radius)
  return `${from > 0 ? '…' : ''}${flat.slice(from, to)}${to < flat.length ? '…' : ''}`
}

// ---- paging ----------------------------------------------------------------------------------------------------------------------------

export function pageSize(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') return LIMITS.pageDefault
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) throw validationFailed({ limit: 'invalid' })
  return Math.min(value, LIMITS.pageMax)
}

const CURSOR = /^(\d{4}-\d\d-\d\dT[\d:.]+Z)\|([A-Za-z0-9_-]{8,64})$/

/** A list of conversations is paged by (last activity, id): the cursor is the last row of the page, and says nothing a reader could use. */
export const encodeCursor = (at: string, id: string): string => Buffer.from(`${at}|${id}`).toString('base64url')

export function decodeCursor(raw: string | null | undefined): { at: string; id: string } | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (raw.length > 200) throw validationFailed({ cursor: 'invalid' })
  const match = CURSOR.exec(Buffer.from(raw, 'base64url').toString('utf8'))
  if (!match) throw validationFailed({ cursor: 'invalid' })
  return { at: match[1], id: match[2] }
}

/** A message sequence number from the address (`before`), or null. */
export function sequenceOf(raw: string | null | undefined, name = 'before'): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > Number.MAX_SAFE_INTEGER) throw validationFailed({ [name]: 'invalid' })
  return value
}
