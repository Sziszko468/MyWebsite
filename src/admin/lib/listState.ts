import type { ListQuery } from '../api/types'

/**
 * What a list is showing, kept in the address (`?status=new&q=anna&page=2`) so a filtered list can be bookmarked, shared with
 * another administrator, and survives a reload or the back button. These are plain functions of the address, so the rules
 * (what resets the page, what "archived" means) are tested without a browser.
 */

export interface ListState {
  q: string
  /** A status, `archived` (the archive), or empty (everything that is not archived). */
  status: string
  kind: string
  /** The quote requests' own filters: the type of request, its priority and where it came from. */
  type: string
  priority: string
  source: string
  /** The language the customer wrote in (hu, en, nl). */
  language: string
  from: string
  to: string
  /** `created_desc`, `name_asc`, …: the column and the direction in one word. */
  order: string
  page: number
}

export const DEFAULT_ORDER = 'created_desc'

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function readListState(params: URLSearchParams): ListState {
  const page = Number.parseInt(params.get('page') ?? '1', 10)
  const day = (name: string) => {
    const value = params.get(name) ?? ''
    return DAY.test(value) ? value : ''
  }
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    status: params.get('status') ?? '',
    kind: params.get('kind') ?? '',
    type: params.get('type') ?? '',
    priority: params.get('priority') ?? '',
    source: params.get('source') ?? '',
    language: params.get('language') ?? '',
    from: day('from'),
    to: day('to'),
    order: params.get('order') ?? DEFAULT_ORDER,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** The query the backend takes: the archive is a filter of its own, and the order is split into a column and a direction. */
export function toListQuery(state: ListState): ListQuery {
  const separator = state.order.lastIndexOf('_')
  const sort = separator > 0 ? state.order.slice(0, separator) : undefined
  const dir = state.order.slice(separator + 1)
  return {
    q: state.q || undefined,
    status: state.status && state.status !== 'archived' ? state.status : undefined,
    archived: state.status === 'archived' ? 'only' : undefined,
    kind: state.kind || undefined,
    type: state.type || undefined,
    priority: state.priority || undefined,
    source: state.source || undefined,
    language: state.language || undefined,
    from: state.from || undefined,
    to: state.to || undefined,
    sort: sort && state.order !== DEFAULT_ORDER ? sort : undefined,
    dir: sort && state.order !== DEFAULT_ORDER && (dir === 'asc' || dir === 'desc') ? dir : undefined,
    page: state.page > 1 ? state.page : undefined,
  }
}

/** The address after a change: a change of a filter goes back to the first page; only a change of page keeps its number. Empty values leave no trace. */
export function writeListState(current: URLSearchParams, patch: Partial<ListState>): URLSearchParams {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '' || value === 1 || (key === 'order' && value === DEFAULT_ORDER)) next.delete(key)
    else next.set(key, String(value))
  }
  if (!('page' in patch)) next.delete('page')
  return next
}

export const hasFilters = (state: ListState): boolean => Boolean(state.q || state.status || state.kind || state.type || state.priority || state.source || state.language || state.from || state.to)
