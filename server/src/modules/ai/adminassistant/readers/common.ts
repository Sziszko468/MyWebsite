import type { AppContext } from '../../../../context.ts'
import type { Access } from '../access.ts'
import type { Scope } from '../scope.ts'

/**
 * What every reader of the admin assistant is given (PROMPT 31): the application, the administrator's access (re-reads the session at each check) and the
 * conversation's scope. A reader checks the permission its data needs with `access.need(...)` BEFORE it queries anything, looks records up by the public reference the model gave,
 * answers "not found" for a record outside the scope, and returns a plain, whitelisted, size-limited object. Readers only SELECT: nothing here writes.
 */
export interface ReadCtx {
  app: AppContext
  access: Access
  scope: Scope
}

/** A reference to a record the administrator can open: the kind, the public reference, and the page of the administration (relative to `/admin`). */
export interface RecordLink {
  type: 'quote' | 'project' | 'customer' | 'conversation' | 'consultation' | 'task'
  reference: string
  path: string
}

export const link = {
  quote: (reference: string, id: string): RecordLink => ({ type: 'quote', reference, path: `/quotes/${id}` }),
  project: (reference: string, id: string): RecordLink => ({ type: 'project', reference, path: `/client-projects/${id}` }),
  customer: (id: string): RecordLink => ({ type: 'customer', reference: id, path: `/clients/${id}` }),
  conversation: (reference: string): RecordLink => ({ type: 'conversation', reference, path: `/communications/${reference}` }),
  consultation: (reference: string, id: string): RecordLink => ({ type: 'consultation', reference, path: `/bookings/${id}` }),
  task: (reference: string, projectId: string): RecordLink => ({ type: 'task', reference, path: `/client-projects/${projectId}/work` }),
}

/** What a list answer says about itself, so no number stands without its period or its basis. */
export interface Listed<T> {
  basis: 'actual'
  asOf: string
  total: number
  page: number
  limit: number
  hasMore: boolean
  items: T[]
}

export const listed = <T>(ctx: ReadCtx, items: T[], total: number, page: { limit: number; page: number }): Listed<T> => ({
  basis: 'actual',
  asOf: ctx.app.clock.now().toISOString(),
  total,
  page: page.page,
  limit: page.limit,
  hasMore: page.page * page.limit < total,
  items,
})
