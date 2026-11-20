import type { RequestCtx } from '../../../context.ts'
import { notFound, validationFailed, type FieldErrors } from '../../../http/errors.ts'
import { json } from '../../../http/reply.ts'
import type { RouteDef } from '../../../http/router.ts'
import { can, requirePermission } from '../../auth/permissions.ts'
import type { Authority } from '../adminassistant/access.ts'
import { approveAction, cancelAction, expireDue, isIdempotencyKey, mayView, recoverStuck, rejectAction, retryAction } from './lifecycle.ts'
import { ACTION_STATUSES, ACTION_TYPES, CATALOG, LIMITS, LIVE_STATUSES, UNSUPPORTED, isActionType, type ActionStatus } from './model.ts'
import { getActionByReference, listActions, verifyHistory } from './store.ts'
import { detailView, summaryView } from './view.ts'

/**
 * The administration's side of controlled automation (PROMPT 33), `/api/admin/automation/*`. Like the rest of the administration's API every call needs the administrator's cookie
 * session; every state-changing call also needs the CSRF token and a same-origin request (the application checks both before a handler runs), and none of them sends CORS headers.
 * Every route needs `assistant:use`. An administrator sees their own actions; one who may read the system sees everyone's. Approving, rejecting and cancelling are POSTs to a
 * specific action, made by the dedicated controls of the automation screen: no chat message, no assistant tool and no GET reaches them.
 */

const REFERENCE = /^ACT-[A-Z0-9]{8}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/
const HASH = /^[a-f0-9]{64}$/

const authorityOf = (ctx: RequestCtx): Authority => ({ userId: ctx.session!.userId, tokenHash: ctx.session!.tokenHash })

function referenceOf(ctx: RequestCtx): string {
  if (!REFERENCE.test(ctx.params.reference)) throw notFound('The action')
  return ctx.params.reference
}

/** The body of a decision: exactly the keys it may have, each of the right kind. */
function strict(body: Record<string, unknown>, allowed: readonly string[]): FieldErrors {
  const errors: FieldErrors = {}
  for (const key of Object.keys(body)) if (!allowed.includes(key)) errors[key] = 'unknown'
  return errors
}

export function automationRoutes(): RouteDef[] {
  const admin = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler'], limit?: RouteDef['limit']): RouteDef => ({ method, pattern, area: 'admin', auth: true, handler, ...(limit ? { limit } : {}) })
  const base = '/api/admin/automation'

  return [
    // Whether automation is on, what it can do, what it will not do, and what this administrator's role may decide.
    admin('GET', `${base}/config`, (ctx) => {
      const who = requirePermission(ctx.session, 'assistant:use')
      const settings = ctx.app.config.ai.automation
      return json({
        enabled: settings.enabled,
        ttlMinutes: settings.ttlMinutes,
        maxPending: settings.maxPending,
        seesAll: can(who.role, 'system:read'),
        types: ACTION_TYPES.map((type) => ({ ...CATALOG[type], permitted: can(who.role, CATALOG[type].permission) })),
        unsupported: UNSUPPORTED,
        administrators: can(who.role, 'system:read') ? ctx.app.db.all<{ id: string; email: string }>('SELECT id, email FROM admin_users ORDER BY email').map((row) => ({ id: row.id, email: row.email })) : [],
      })
    }),

    // The list: `tab=pending` (waiting for a decision or being executed) or `tab=history` (everything else), or `all`; filtered by status, type, administrator, target and date.
    admin('GET', `${base}/actions`, (ctx) => {
      const who = requirePermission(ctx.session, 'assistant:use')
      expireDue(ctx.app)
      recoverStuck(ctx.app)
      const errors: FieldErrors = {}
      const tab = ctx.query.get('tab') ?? 'all'
      if (!['pending', 'history', 'all'].includes(tab)) errors.tab = 'invalid'
      const wanted = (ctx.query.get('status') ?? '').split(',').filter(Boolean)
      if (!wanted.every((status) => (ACTION_STATUSES as readonly string[]).includes(status))) errors.status = 'invalid'
      const type = ctx.query.get('type')
      if (type !== null && type !== '' && !isActionType(type)) errors.type = 'invalid'
      const from = ctx.query.get('from')
      const to = ctx.query.get('to')
      if (from && !DAY.test(from)) errors.from = 'invalid'
      if (to && !DAY.test(to)) errors.to = 'invalid'
      const page = Number(ctx.query.get('page') ?? '1')
      const pageSize = Number(ctx.query.get('pageSize') ?? String(LIMITS.pageDefault))
      if (!Number.isInteger(page) || page < 1 || page > 10_000) errors.page = 'invalid'
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > LIMITS.pageMax) errors.pageSize = 'invalid'
      const admin = ctx.query.get('admin')
      if (Object.keys(errors).length > 0) throw validationFailed(errors)
      const statuses: ActionStatus[] = wanted.length > 0 ? (wanted as ActionStatus[]) : tab === 'pending' ? [...LIVE_STATUSES] : tab === 'history' ? ACTION_STATUSES.filter((status) => !LIVE_STATUSES.includes(status)) : []
      const seesAll = can(who.role, 'system:read')
      const { rows, total } = listActions(
        ctx.app.db,
        { statuses, ...(type ? { type: type as (typeof ACTION_TYPES)[number] } : {}), ...(admin ? { adminId: admin } : {}), ...(ctx.query.get('target') ? { target: ctx.query.get('target')!.slice(0, 64) } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), page, pageSize },
        { userId: who.userId, seesAll },
      )
      const cache = new Map<string, string | null>()
      return json({ items: rows.map((row) => summaryView(ctx.app, row, who, cache)), total, page, pageSize, tab })
    }),

    admin('GET', `${base}/actions/:reference`, (ctx) => {
      const who = requirePermission(ctx.session, 'assistant:use')
      const reference = referenceOf(ctx)
      expireDue(ctx.app)
      recoverStuck(ctx.app)
      const row = getActionByReference(ctx.app.db, reference)
      if (!row || !mayView(who, row)) throw notFound('The action')
      return json({ ...detailView(ctx.app, row, who), integrity: verifyHistory(ctx.app.db, { reference }) })
    }),

    // The dedicated approval control. Approves the exact payload the screen showed (its hash), with the decision's own key; the server re-checks everything, then runs it.
    admin(
      'POST',
      `${base}/actions/:reference/approve`,
      async (ctx) => {
        requirePermission(ctx.session, 'assistant:use')
        const reference = referenceOf(ctx)
        const body = await ctx.json()
        const errors = strict(body, ['payloadHash', 'secondConfirmation', 'idempotencyKey'])
        if (typeof body.payloadHash !== 'string' || !HASH.test(body.payloadHash)) errors.payloadHash = 'invalid'
        if (!isIdempotencyKey(body.idempotencyKey)) errors.idempotencyKey = 'invalid'
        if (body.secondConfirmation !== undefined && typeof body.secondConfirmation !== 'boolean') errors.secondConfirmation = 'invalid'
        if (Object.keys(errors).length > 0) throw validationFailed(errors)
        const row = approveAction(ctx.app, authorityOf(ctx), reference, { payloadHash: body.payloadHash as string, secondConfirmation: body.secondConfirmation === true, idempotencyKey: body.idempotencyKey as string })
        return json(detailView(ctx.app, row, ctx.session!))
      },
      'automation',
    ),

    admin(
      'POST',
      `${base}/actions/:reference/reject`,
      async (ctx) => {
        requirePermission(ctx.session, 'assistant:use')
        const reference = referenceOf(ctx)
        const body = await ctx.json()
        const errors = strict(body, ['note'])
        if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') errors.note = 'invalid'
        if (Object.keys(errors).length > 0) throw validationFailed(errors)
        const row = rejectAction(ctx.app, authorityOf(ctx), reference, { note: typeof body.note === 'string' ? body.note : null })
        return json(detailView(ctx.app, row, ctx.session!))
      },
      'automation',
    ),

    admin(
      'POST',
      `${base}/actions/:reference/cancel`,
      async (ctx) => {
        requirePermission(ctx.session, 'assistant:use')
        const reference = referenceOf(ctx)
        const errors = strict(await ctx.json(), [])
        if (Object.keys(errors).length > 0) throw validationFailed(errors)
        return json(detailView(ctx.app, cancelAction(ctx.app, authorityOf(ctx), reference), ctx.session!))
      },
      'automation',
    ),

    admin(
      'POST',
      `${base}/actions/:reference/retry`,
      async (ctx) => {
        requirePermission(ctx.session, 'assistant:use')
        const reference = referenceOf(ctx)
        const errors = strict(await ctx.json(), [])
        if (Object.keys(errors).length > 0) throw validationFailed(errors)
        return json(detailView(ctx.app, retryAction(ctx.app, authorityOf(ctx), reference), ctx.session!), { status: 201 })
      },
      'automation',
    ),

    // Whether the history of the actions is whole and unaltered (the administrator who may read the system).
    admin('GET', `${base}/integrity`, (ctx) => {
      requirePermission(ctx.session, 'system:read')
      return json(verifyHistory(ctx.app.db, {}))
    }),
  ]
}
