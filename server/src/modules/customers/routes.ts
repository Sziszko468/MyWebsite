import type { RouteDef } from '../../http/router.ts'
import { notFound, validationFailed } from '../../http/errors.ts'
import { empty, json } from '../../http/reply.ts'
import type { AppContext } from '../../context.ts'
import { actOnClient, addProjectMilestone, addProjectNote, clientDetail, createClientProject, editClientProject, editProjectMilestone, inviteClient, linkRecord, listClients, postProjectUpdate, projectDetail, publishProjectDocument, readSettings, removeProjectMilestone, setProjectStatus, unlinkRecord, writeSettings } from './admin.ts'
import { portalSettings } from './accounts.ts'
import { canSendLinks, parseLinkRequest, requestLink, verifyLink } from './auth.ts'
import { claimOwnRecords } from './linking.ts'
import {
  NO_DOCUMENT_STORE,
  cancelDeletion,
  candidatesOf,
  customerView,
  documentFor,
  openBookingLink,
  openRequestLink,
  overview,
  portalBooking,
  portalBookings,
  portalRequest,
  portalRequests,
  requestDeletion,
  requestEmailChange,
  revokeOne,
  revokeOthers,
  sessionInfo,
  sessionsOf,
  signOut,
  updateProfile,
} from './portal.ts'
import { portalDocuments, portalProject, portalProjects } from './projects.ts'
import { clearedClientCookie, clientCookie, clientOf } from './sessions.ts'

/**
 * The client portal's addresses.
 *
 * `/api/portal/*` is the customer's own API. It is same-origin only (no CORS headers are ever added to it), every answer is `no-store` and `noindex`, the
 * customer is identified by their session cookie and nothing else, and every state-changing request needs that session's CSRF token. The two addresses that
 * come before a session exists (asking for a link, opening one) are rate limited and say the same thing whoever asks. NO address takes a customer id: the
 * identity of a request is `ctx.customer`, resolved from the cookie.
 *
 * `/api/admin/clients*` and `/api/admin/client-*` are the administration's: behind an administrator's session and CSRF token, the permission checked by
 * the business function.
 */

export function customerRoutes(_app: AppContext): RouteDef[] {
  const open = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler'], limit: RouteDef['limit'] = 'portalAuth'): RouteDef => ({ method, pattern, area: 'portal', limit, handler })
  const signedIn = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler']): RouteDef => ({ method, pattern, area: 'portal', limit: 'portal', customerAuth: true, handler })
  const admin = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler']): RouteDef => ({ method, pattern, area: 'admin', auth: true, handler })
  const one = <T>(value: T | null | undefined, what: string): T => {
    if (value === null || value === undefined) throw notFound(what)
    return value
  }

  return [
    // ---- before a session exists ----
    open('GET', '/api/portal/config', (ctx) => {
      const { client } = ctx.app.config
      return json({ signInAvailable: canSendLinks(ctx.app), registration: portalSettings(ctx.app).registration, linkMinutes: client.linkMinutes, inviteHours: client.inviteHours })
    }, 'customer'),
    open('POST', '/api/portal/auth/request', async (ctx) => {
      requestLink(ctx.app, parseLinkRequest(await ctx.json()), ctx.ipHash)
      // The same answer for every address: nothing says whether one has an account, is switched off, or was over its share of links.
      return json({ accepted: true, linkMinutes: ctx.app.config.client.linkMinutes }, { status: 202 })
    }),
    open('POST', '/api/portal/auth/verify', async (ctx) => {
      const body = await ctx.json()
      const result = verifyLink(ctx.app, typeof body.token === 'string' ? body.token : '', ctx.ip, ctx.ipHash, String(ctx.req.headers['user-agent'] ?? ''))
      // Not the token, the address or the name: only what kind of thing happened.
      ctx.log.info('portal sign-in', { purpose: result.purpose, created: result.created })
      return json({ purpose: result.purpose, created: result.created, csrfToken: result.session.csrfToken, customer: customerView(result.customer) }, { headers: { 'Set-Cookie': clientCookie(ctx.app, result.session.token, result.session.maxAgeSeconds) } })
    }),

    // ---- the session ----
    signedIn('GET', '/api/portal/session', (ctx) => json(sessionInfo(ctx.app, clientOf(ctx)))),
    signedIn('POST', '/api/portal/session/sign-out', (ctx) => {
      signOut(ctx.app, clientOf(ctx))
      return json({ ok: true }, { headers: { 'Set-Cookie': clearedClientCookie(ctx.app) } })
    }),
    signedIn('GET', '/api/portal/overview', (ctx) => json(overview(ctx.app, clientOf(ctx)))),

    // ---- projects ----
    signedIn('GET', '/api/portal/projects', (ctx) => json(portalProjects(ctx.app, clientOf(ctx).customerId))),
    signedIn('GET', '/api/portal/projects/:reference', (ctx) => json(one(portalProject(ctx.app, clientOf(ctx).customerId, ctx.params.reference), 'The project'))),

    // ---- quote requests and bookings ----
    signedIn('GET', '/api/portal/requests', (ctx) => json(portalRequests(ctx.app, clientOf(ctx)))),
    signedIn('GET', '/api/portal/requests/:reference', (ctx) => json(one(portalRequest(ctx.app, clientOf(ctx), ctx.params.reference), 'The request'))),
    signedIn('POST', '/api/portal/requests/:reference/open', async (ctx) => {
      const body = await ctx.json()
      if (body.quote !== undefined && body.quote !== null && typeof body.quote !== 'string') throw validationFailed({ quote: 'invalid' })
      return json(openRequestLink(ctx.app, clientOf(ctx), ctx.params.reference, typeof body.quote === 'string' ? body.quote : null))
    }),
    signedIn('GET', '/api/portal/bookings', (ctx) => json(portalBookings(ctx.app, clientOf(ctx)))),
    signedIn('GET', '/api/portal/bookings/:reference', (ctx) => json(one(portalBooking(ctx.app, clientOf(ctx), ctx.params.reference), 'The booking'))),
    signedIn('POST', '/api/portal/bookings/:reference/open', (ctx) => json(openBookingLink(ctx.app, clientOf(ctx), ctx.params.reference))),

    // ---- documents: authorized on every request; delivery waits for a private store (docs/client-portal/DOCUMENTS.md) ----
    signedIn('GET', '/api/portal/documents', (ctx) => json(portalDocuments(ctx.app, clientOf(ctx).customerId))),
    signedIn('GET', '/api/portal/documents/:id/download', async (ctx) => {
      const { storageKey } = documentFor(ctx.app, clientOf(ctx).customerId, ctx.params.id)
      const file = await NO_DOCUMENT_STORE.open(storageKey)
      return { status: 200, headers: { 'Content-Type': file.contentType, 'Content-Disposition': 'attachment', 'X-Content-Type-Options': 'nosniff' }, body: file.body }
    }),

    // ---- claiming records that carry the verified address (only while the owner allows it) ----
    signedIn('GET', '/api/portal/link-candidates', (ctx) => json(candidatesOf(ctx.app, clientOf(ctx)))),
    signedIn('POST', '/api/portal/link-candidates/claim', async (ctx) => {
      const body = await ctx.json()
      if (body.ids !== undefined && (!Array.isArray(body.ids) || body.ids.length > 200 || !body.ids.every((id) => typeof id === 'string' && id.length <= 64))) throw validationFailed({ ids: 'invalid' })
      return json(claimOwnRecords(ctx.app, clientOf(ctx).customerId, (body.ids as string[] | undefined) ?? null))
    }),

    // ---- the account ----
    signedIn('PATCH', '/api/portal/profile', async (ctx) => json(updateProfile(ctx.app, clientOf(ctx), await ctx.json()))),
    signedIn('POST', '/api/portal/profile/email', async (ctx) => {
      requestEmailChange(ctx.app, clientOf(ctx), await ctx.json(), ctx.ipHash)
      return json({ accepted: true, linkMinutes: ctx.app.config.client.linkMinutes }, { status: 202 })
    }),
    signedIn('GET', '/api/portal/sessions', (ctx) => json(sessionsOf(ctx.app, clientOf(ctx)))),
    signedIn('DELETE', '/api/portal/sessions/:id', (ctx) => {
      const result = revokeOne(ctx.app, clientOf(ctx), ctx.params.id)
      return json(result, result.current ? { headers: { 'Set-Cookie': clearedClientCookie(ctx.app) } } : {})
    }),
    signedIn('POST', '/api/portal/sessions/revoke-others', (ctx) => json({ closed: revokeOthers(ctx.app, clientOf(ctx)) })),
    signedIn('POST', '/api/portal/account/deletion-request', (ctx) => json(requestDeletion(ctx.app, clientOf(ctx)), { status: 202 })),
    signedIn('DELETE', '/api/portal/account/deletion-request', (ctx) => {
      cancelDeletion(ctx.app, clientOf(ctx))
      return empty(204)
    }),

    // ---- the administration ----
    admin('GET', '/api/admin/client-settings', (ctx) => json(readSettings(ctx.app, ctx.session))),
    admin('PUT', '/api/admin/client-settings', async (ctx) => json(writeSettings(ctx.app, ctx.session, await ctx.json()))),
    admin('GET', '/api/admin/clients', (ctx) => {
      const data = listClients(ctx.app, ctx.session, ctx.query)
      return json(data.rows, { meta: { page: data.page, pageSize: data.pageSize, total: data.total } })
    }),
    admin('POST', '/api/admin/clients', async (ctx) => json(inviteClient(ctx.app, ctx.session, await ctx.json()), { status: 201 })),
    admin('GET', '/api/admin/clients/:id', (ctx) => json(clientDetail(ctx.app, ctx.session, ctx.params.id))),
    admin('POST', '/api/admin/clients/:id/actions', async (ctx) => json(actOnClient(ctx.app, ctx.session, ctx.params.id, await ctx.json()))),
    admin('POST', '/api/admin/clients/:id/links', async (ctx) => json(linkRecord(ctx.app, ctx.session, ctx.params.id, await ctx.json()), { status: 201 })),
    admin('DELETE', '/api/admin/clients/:id/links/:linkId', (ctx) => {
      unlinkRecord(ctx.app, ctx.session, ctx.params.id, ctx.params.linkId)
      return empty(204)
    }),
    admin('POST', '/api/admin/clients/:id/projects', async (ctx) => json(createClientProject(ctx.app, ctx.session, ctx.params.id, await ctx.json()), { status: 201 })),
    admin('GET', '/api/admin/client-projects/:id', (ctx) => json(projectDetail(ctx.app, ctx.session, ctx.params.id))),
    admin('PATCH', '/api/admin/client-projects/:id', async (ctx) => json(editClientProject(ctx.app, ctx.session, ctx.params.id, await ctx.json()))),
    admin('POST', '/api/admin/client-projects/:id/status', async (ctx) => json(setProjectStatus(ctx.app, ctx.session, ctx.params.id, await ctx.json()))),
    admin('POST', '/api/admin/client-projects/:id/milestones', async (ctx) => json(addProjectMilestone(ctx.app, ctx.session, ctx.params.id, await ctx.json()), { status: 201 })),
    admin('PATCH', '/api/admin/client-projects/:id/milestones/:milestoneId', async (ctx) => json(editProjectMilestone(ctx.app, ctx.session, ctx.params.id, ctx.params.milestoneId, await ctx.json()))),
    admin('DELETE', '/api/admin/client-projects/:id/milestones/:milestoneId', (ctx) => {
      removeProjectMilestone(ctx.app, ctx.session, ctx.params.id, ctx.params.milestoneId)
      return empty(204)
    }),
    admin('POST', '/api/admin/client-projects/:id/updates', async (ctx) => json(postProjectUpdate(ctx.app, ctx.session, ctx.params.id, await ctx.json()), { status: 201 })),
    admin('POST', '/api/admin/client-projects/:id/notes', async (ctx) => json(addProjectNote(ctx.app, ctx.session, ctx.params.id, await ctx.json()), { status: 201 })),
    admin('POST', '/api/admin/client-projects/:id/documents/:documentId/publish', (ctx) => publishProjectDocument(ctx.app, ctx.session, ctx.params.id, ctx.params.documentId)),
  ]
}
