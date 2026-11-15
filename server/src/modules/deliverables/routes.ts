import type { AppContext } from '../../context.ts'
import { validationFailed } from '../../http/errors.ts'
import type { RouteDef } from '../../http/router.ts'
import { empty, json } from '../../http/reply.ts'
import { Fields } from '../../lib/validate.ts'
import { clientOf } from '../customers/sessions.ts'
import {
  addDeliverable,
  archive,
  askForApproval,
  cancelRequest,
  editDeliverable,
  editVersion,
  listDeliverables,
  newVersion,
  note,
  publish,
  readDeliverable,
  readSettings,
  remove,
  reply,
  thread,
  writeSettings,
} from './admin.ts'
import { approve, createDraft, deleteDraft, editDraft, followUp, ownDeliverable, reopen, requestChanges, sendFeedback, withdraw, type Position } from './customer.ts'
import { LIMITS } from './model.ts'
import { portalDeliverable, portalDeliverables } from './views.ts'

/**
 * The deliverables' addresses. The customer's (`/api/portal/projects/:reference/deliverables…`) are the portal's: same-origin only, `no-store`, behind the customer's own session and
 * CSRF token, and every one starts from the project the SESSION'S customer owns; none takes a customer id, an author, a version or a state: the version is always the current one.
 * The administration's (`/api/admin/client-projects/:id/deliverables…`, `/api/admin/deliverable-settings`) are behind an administrator's session and CSRF token, with the
 * permission checked by the business function. Nothing here redirects to an address a person typed, and nothing fetches one.
 */

function exact(body: Record<string, unknown>, known: readonly string[]): void {
  if (Object.keys(body).some((key) => !known.includes(key))) throw validationFailed({ body: 'invalid' })
}

/** `{ x, y }` in the body, or neither: a position is both numbers or none. */
function positionOf(body: Record<string, unknown>): Position | null | undefined {
  if (!('position' in body)) return undefined
  const value = body.position
  if (value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) throw validationFailed({ position: 'invalid' })
  const entry = value as Record<string, unknown>
  if (Object.keys(entry).some((key) => key !== 'x' && key !== 'y')) throw validationFailed({ position: 'invalid' })
  return { x: entry.x as number, y: entry.y as number }
}

export function deliverableRoutes(_app: AppContext): RouteDef[] {
  const signedIn = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler']): RouteDef => ({ method, pattern, area: 'portal', limit: 'portal', customerAuth: true, handler })
  const admin = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler']): RouteDef => ({ method, pattern, area: 'admin', auth: true, handler })
  const mine = '/api/portal/projects/:reference/deliverables'
  const base = '/api/admin/client-projects/:id/deliverables'

  const detail = (ctx: Parameters<RouteDef['handler']>[0], version: number | null = null) => {
    const { deliverable, project } = ownDeliverable(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.deliverable)
    return portalDeliverable(ctx.app, clientOf(ctx).customerId, deliverable, project.status, version)
  }

  return [
    // ---- the customer ----
    signedIn('GET', mine, (ctx) => json(portalDeliverables(ctx.app, clientOf(ctx).customerId, ctx.params.reference))),
    signedIn('GET', `${mine}/:deliverable`, (ctx) => {
      const asked = Number(ctx.query.get('version'))
      return json(detail(ctx, Number.isInteger(asked) && asked >= 1 ? asked : null))
    }),
    signedIn('POST', `${mine}/:deliverable/comments`, async (ctx) => {
      const body = await ctx.json()
      exact(body, ['body', 'position'])
      const fields = new Fields(body)
      const text = fields.text('body', { max: LIMITS.comment, required: true, multiline: true })
      const position = positionOf(body)
      fields.done()
      createDraft(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.deliverable, { body: text!, position: position ?? null })
      return json(detail(ctx), { status: 201 })
    }),
    signedIn('PATCH', `${mine}/:deliverable/comments/:comment`, async (ctx) => {
      const body = await ctx.json()
      exact(body, ['body', 'position'])
      if (Object.keys(body).length === 0) throw validationFailed({ body: 'invalid' })
      const fields = new Fields(body)
      const text = 'body' in body ? fields.text('body', { max: LIMITS.comment, required: true, multiline: true }) : null
      const position = positionOf(body)
      fields.done()
      editDraft(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.deliverable, ctx.params.comment, { ...(text !== null ? { body: text } : {}), ...(position !== undefined ? { position } : {}) })
      return json(detail(ctx))
    }),
    signedIn('DELETE', `${mine}/:deliverable/comments/:comment`, (ctx) => {
      deleteDraft(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.deliverable, ctx.params.comment)
      return empty(204)
    }),
    signedIn('POST', `${mine}/:deliverable/feedback`, async (ctx) => {
      exact(await ctx.json(), [])
      const result = sendFeedback(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.deliverable)
      return json({ ...result, deliverable: detail(ctx) }, { status: 201 })
    }),
    signedIn('POST', `${mine}/:deliverable/comments/:comment/follow-up`, async (ctx) => {
      const body = await ctx.json()
      exact(body, ['body'])
      const fields = new Fields(body)
      const text = fields.text('body', { max: LIMITS.comment, required: true, multiline: true })
      fields.done()
      followUp(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.deliverable, ctx.params.comment, text!)
      return json(detail(ctx), { status: 201 })
    }),
    signedIn('POST', `${mine}/:deliverable/comments/:comment/reopen`, async (ctx) => {
      exact(await ctx.json(), [])
      reopen(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.deliverable, ctx.params.comment)
      return json(detail(ctx))
    }),
    signedIn('POST', `${mine}/:deliverable/approvals/:approval/approve`, async (ctx) => {
      const body = await ctx.json()
      exact(body, ['confirm', 'versionNumber', 'checksum', 'revision'])
      if (typeof body.versionNumber !== 'number' || typeof body.checksum !== 'string' || typeof body.revision !== 'number') throw validationFailed({ body: 'invalid' })
      approve(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.deliverable, ctx.params.approval, { confirm: body.confirm, versionNumber: body.versionNumber, checksum: body.checksum, revision: body.revision })
      return json(detail(ctx))
    }),
    signedIn('POST', `${mine}/:deliverable/approvals/:approval/changes`, async (ctx) => {
      const body = await ctx.json()
      exact(body, ['explanation', 'revision'])
      const fields = new Fields(body)
      const explanation = fields.text('explanation', { max: LIMITS.explanation, min: 3, required: true, multiline: true })
      if (typeof body.revision !== 'number') fields.fail('revision', 'invalid')
      fields.done()
      requestChanges(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.deliverable, ctx.params.approval, { explanation: explanation!, revision: body.revision as number })
      return json(detail(ctx))
    }),
    signedIn('POST', `${mine}/:deliverable/approvals/:approval/withdraw`, async (ctx) => {
      const body = await ctx.json()
      exact(body, ['revision'])
      if (typeof body.revision !== 'number') throw validationFailed({ revision: 'invalid' })
      withdraw(ctx.app, clientOf(ctx).customerId, ctx.params.reference, ctx.params.deliverable, ctx.params.approval, body.revision)
      return json(detail(ctx))
    }),

    // ---- the administration ----
    admin('GET', base, (ctx) => json(listDeliverables(ctx.app, ctx.session, ctx.params.id))),
    admin('POST', base, async (ctx) => json(addDeliverable(ctx.app, ctx.session, ctx.params.id, await ctx.json()), { status: 201 })),
    admin('GET', `${base}/:deliverableId`, (ctx) => json(readDeliverable(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId))),
    admin('PATCH', `${base}/:deliverableId`, async (ctx) => json(editDeliverable(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId, await ctx.json()))),
    admin('DELETE', `${base}/:deliverableId`, (ctx) => {
      remove(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId)
      return empty(204)
    }),
    admin('POST', `${base}/:deliverableId/versions`, (ctx) => json(newVersion(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId), { status: 201 })),
    admin('PATCH', `${base}/:deliverableId/versions/:versionId`, async (ctx) => json(editVersion(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId, ctx.params.versionId, await ctx.json()))),
    admin('POST', `${base}/:deliverableId/versions/:versionId/publish`, (ctx) => json(publish(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId, ctx.params.versionId))),
    admin('POST', `${base}/:deliverableId/archive`, (ctx) => json(archive(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId))),
    admin('POST', `${base}/:deliverableId/comments/:commentId/replies`, async (ctx) => json(reply(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId, ctx.params.commentId, await ctx.json()), { status: 201 })),
    admin('POST', `${base}/:deliverableId/comments/:commentId/resolve`, (ctx) => json(thread(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId, ctx.params.commentId, 'resolve'))),
    admin('POST', `${base}/:deliverableId/comments/:commentId/reopen`, (ctx) => json(thread(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId, ctx.params.commentId, 'reopen'))),
    admin('POST', `${base}/:deliverableId/notes`, async (ctx) => json(note(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId, await ctx.json()), { status: 201 })),
    admin('POST', `${base}/:deliverableId/approvals`, async (ctx) => json(askForApproval(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId, await ctx.json()), { status: 201 })),
    admin('POST', `${base}/:deliverableId/approvals/:approvalId/cancel`, async (ctx) => json(cancelRequest(ctx.app, ctx.session, ctx.params.id, ctx.params.deliverableId, ctx.params.approvalId, await ctx.json()))),
    admin('GET', '/api/admin/deliverable-settings', (ctx) => json(readSettings(ctx.app, ctx.session))),
    admin('PUT', '/api/admin/deliverable-settings', async (ctx) => json(writeSettings(ctx.app, ctx.session, await ctx.json()))),
  ]
}

