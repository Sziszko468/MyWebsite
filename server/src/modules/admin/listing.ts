import { cleanLine } from '../../lib/text.ts'
import { LIST_SORTS, type ListSort } from '../inquiries/repository.ts'

/**
 * What every list in the administration accepts in its query string: search, a date range, sorting, paging. Anything
 * unrecognised is ignored rather than refused (a stale bookmark still opens the list), and nothing from the query
 * string ever reaches SQL as text: the sort is picked from a fixed list, the rest are bound parameters.
 */

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

export interface Listing {
  page: number
  pageSize: number
  q: string | undefined
  archived: 'exclude' | 'only' | 'all'
  /** Start and end of the chosen days as UTC instants. */
  from: string | undefined
  to: string | undefined
  sort: ListSort | undefined
  dir: 'asc' | 'desc' | undefined
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

function day(value: string | null, end: boolean): string | undefined {
  if (!value || !DAY.test(value)) return undefined
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return undefined
  return end ? `${value}T23:59:59.999Z` : `${value}T00:00:00.000Z`
}

export function parseListing(query: URLSearchParams): Listing {
  const archived = query.get('archived')
  const q = cleanLine(query.get('q') ?? '').slice(0, 100)
  const sort = query.get('sort')
  const dir = query.get('dir')
  const size = Number.parseInt(query.get('pageSize') ?? '', 10)
  return {
    page: Math.max(1, Math.min(10_000, Number.parseInt(query.get('page') ?? '1', 10) || 1)),
    pageSize: Number.isInteger(size) && size >= 1 ? Math.min(size, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE,
    q: q || undefined,
    archived: archived === 'only' || archived === 'all' ? archived : 'exclude',
    from: day(query.get('from'), false),
    to: day(query.get('to'), true),
    sort: (LIST_SORTS as readonly string[]).includes(sort ?? '') ? (sort as ListSort) : undefined,
    dir: dir === 'asc' || dir === 'desc' ? dir : undefined,
  }
}
