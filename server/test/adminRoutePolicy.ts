/**
 * The access policy of the administration (PROMPT 25): for every route the server registers under `/api/admin`, who may call it.
 * `adminRoutes.test.ts` finds the routes by asking the router, so a route that is added without a line here makes that test fail, and
 * a line that no route matches any more does too. The test then checks each line against the running server: no session is 401,
 * a state-changing call without the CSRF token or from another origin is 403, an editor gets 403 exactly where the policy says
 * `admin`, and an administrator is never answered with a server error.
 *
 *   public         no session needed (only the sign-in itself; it must be rate limited)
 *   authenticated  any signed-in user: an editor and an administrator
 *   admin          an administrator only; an editor is answered 403 (modules/auth/permissions.ts: the delete and system permissions)
 *
 * Choosing a level for a new route is the point of the file: write the line by hand, and mean it. The levels are what the code does today
 * (they were read from the running server, then checked against the `requirePermission` calls of the modules); changing a line here
 * without changing the module is a failing test, not a change of policy.
 */
export type Access = 'public' | 'authenticated' | 'admin'

export const ADMIN_ROUTE_POLICY: Record<string, Access> = {
  'GET /api/admin/bookings': 'authenticated',
  'GET /api/admin/bookings/:id': 'authenticated',
  'GET /api/admin/bookings/:id/days': 'authenticated',
  'POST /api/admin/bookings/:id/actions': 'authenticated',
  'GET /api/admin/booking-config': 'authenticated',
  'PUT /api/admin/booking-settings': 'admin',
  'PUT /api/admin/booking-hours': 'admin',
  'POST /api/admin/consultation-types': 'admin',
  'PUT /api/admin/consultation-types/:code': 'admin',
  'GET /api/admin/projects': 'authenticated',
  'POST /api/admin/projects': 'authenticated',
  'GET /api/admin/project-settings': 'authenticated',
  'PUT /api/admin/project-settings': 'authenticated',
  'PUT /api/admin/project-order': 'authenticated',
  'GET /api/admin/project-preview': 'authenticated',
  'GET /api/admin/projects/:id': 'authenticated',
  'PUT /api/admin/projects/:id': 'authenticated',
  'PATCH /api/admin/projects/:id': 'authenticated',
  'DELETE /api/admin/projects/:id': 'admin',
  'GET /api/admin/projects/:id/preview': 'authenticated',
  'POST /api/admin/projects/:id/duplicate': 'authenticated',
  'GET /api/admin/projects/:id/preview-links': 'authenticated',
  'POST /api/admin/projects/:id/preview-links': 'authenticated',
  'DELETE /api/admin/projects/:id/preview-links/:link': 'authenticated',
  'POST /api/admin/projects/:id/publish': 'authenticated',
  'POST /api/admin/projects/:id/unpublish': 'authenticated',
  'POST /api/admin/projects/:id/archive': 'authenticated',
  'POST /api/admin/projects/:id/restore': 'authenticated',
  'GET /api/admin/media': 'authenticated',
  'POST /api/admin/media': 'authenticated',
  'GET /api/admin/media-storage': 'authenticated',
  'PUT /api/admin/media/:id': 'authenticated',
  'POST /api/admin/media/:id/replace': 'authenticated',
  'DELETE /api/admin/media/:id': 'admin',
  'GET /api/admin/texts': 'authenticated',
  'PUT /api/admin/texts/:key': 'authenticated',
  'GET /api/admin/profile': 'authenticated',
  'PUT /api/admin/profile': 'authenticated',
  'DELETE /api/admin/profile': 'authenticated',
  'GET /api/admin/ai': 'admin',
  'PUT /api/admin/ai/settings': 'admin',
  'POST /api/admin/ai/connection-test': 'admin',
  'POST /api/admin/ai/alerts/acknowledge': 'admin',
  'GET /api/admin/ai/usage': 'admin',
  'POST /api/admin/ai/knowledge/refresh': 'admin',
  'POST /api/admin/login': 'public',
  'POST /api/admin/logout': 'authenticated',
  'GET /api/admin/session': 'authenticated',
  'GET /api/admin/dashboard': 'authenticated',
  'GET /api/admin/inquiries': 'authenticated',
  'GET /api/admin/inquiries/:id': 'authenticated',
  'PATCH /api/admin/inquiries/:id': 'authenticated',
  'DELETE /api/admin/inquiries/:id': 'admin',
  'GET /api/admin/quote-requests': 'authenticated',
  'GET /api/admin/quote-requests/export.csv': 'authenticated',
  'GET /api/admin/quote-requests/overview': 'authenticated',
  'POST /api/admin/quote-requests': 'authenticated',
  'GET /api/admin/quote-requests/:id': 'authenticated',
  'GET /api/admin/quote-requests/:id/export': 'authenticated',
  'GET /api/admin/quote-requests/:id/export.json': 'authenticated',
  'PATCH /api/admin/quote-requests/:id': 'authenticated',
  'POST /api/admin/quote-requests/:id/resend-confirmation': 'authenticated',
  'POST /api/admin/quote-requests/:id/revoke-links': 'authenticated',
  'POST /api/admin/quote-requests/:id/quotes': 'authenticated',
  'POST /api/admin/inquiries/:id/quote-request': 'authenticated',
  'GET /api/admin/quotes/:id': 'authenticated',
  'PUT /api/admin/quotes/:id': 'authenticated',
  'DELETE /api/admin/quotes/:id': 'authenticated',
  'POST /api/admin/quotes/:id/send': 'authenticated',
  'POST /api/admin/quotes/:id/resend': 'authenticated',
  'POST /api/admin/quotes/:id/withdraw': 'authenticated',
  'DELETE /api/admin/quote-requests/:id': 'admin',
  'GET /api/admin/services': 'authenticated',
  'POST /api/admin/services': 'authenticated',
  'GET /api/admin/services/:slug': 'authenticated',
  'PUT /api/admin/services/:slug': 'authenticated',
  'DELETE /api/admin/services/:slug': 'admin',
  'GET /api/admin/packages': 'authenticated',
  'POST /api/admin/packages': 'authenticated',
  'GET /api/admin/packages/:code': 'authenticated',
  'PUT /api/admin/packages/:code': 'authenticated',
  'DELETE /api/admin/packages/:code': 'admin',
  'GET /api/admin/extras': 'authenticated',
  'POST /api/admin/extras': 'authenticated',
  'GET /api/admin/extras/:code': 'authenticated',
  'PUT /api/admin/extras/:code': 'authenticated',
  'DELETE /api/admin/extras/:code': 'admin',
  'GET /api/admin/content': 'authenticated',
  'POST /api/admin/content': 'authenticated',
  'GET /api/admin/content/:type/:slug': 'authenticated',
  'PUT /api/admin/content/:type/:slug': 'authenticated',
  'DELETE /api/admin/content/:type/:slug': 'admin',
  'PUT /api/admin/order/:kind': 'authenticated',
  'GET /api/admin/shop/documents/:code': 'authenticated',
  'PUT /api/admin/shop/documents/:code': 'authenticated',
  'POST /api/admin/shop/documents/:code/publish': 'authenticated',
  'POST /api/admin/shop/documents/:code/unpublish': 'authenticated',
  'GET /api/admin/translations': 'authenticated',
  'PUT /api/admin/translations/:group/:key/:lang': 'authenticated',
  'GET /api/admin/notifications': 'authenticated',
  'POST /api/admin/notifications/checks': 'admin',
  'POST /api/admin/notifications/test': 'admin',
  'PUT /api/admin/notifications/preferences': 'admin',
  'POST /api/admin/notifications/deliveries/:id/retry': 'authenticated',
  'GET /api/admin/settings': 'authenticated',
  'PUT /api/admin/settings/preferences': 'authenticated',
  'POST /api/admin/account/password': 'authenticated',
  'GET /api/admin/sessions': 'authenticated',
  'POST /api/admin/sessions/revoke-others': 'authenticated',
  'DELETE /api/admin/sessions/:id': 'authenticated',
  'GET /api/admin/system': 'admin',
  'POST /api/admin/system/maintenance': 'admin',
  'POST /api/admin/system/publish': 'admin',
}

/** The part of a registered route this file needs (the router's own `RouteDef` has the handler too). */
export interface RouteInfo {
  method: string
  pattern: string
  area: string
  auth?: boolean
  limit?: string
}

export const routeKey = (route: Pick<RouteInfo, 'method' | 'pattern'>): string => `${route.method} ${route.pattern}`

/** A route that belongs to the administration: under `/api/admin`, in the admin area, or one that asks for a session wherever it lives. */
export const isAdminSurface = (route: RouteInfo): boolean => route.auth === true || route.area === 'admin' || route.pattern.startsWith('/api/admin')

export interface PolicyReport {
  /** Routes the server has and the policy does not mention. */
  missing: string[]
  /** Lines of the policy that no route matches. */
  stale: string[]
  /** Routes that are not public in the policy but are not behind `auth: true` in the router. */
  withoutSession: string[]
  /** Routes that are public in the policy and carry no rate limit. */
  publicWithoutLimit: string[]
  /** Routes that are `auth: true` in the router but listed as public. */
  publicButAuthenticated: string[]
}

/** Compares what the router has with the policy. Pure: the test feeds it the real routes, and a synthetic list to prove it notices. */
export function comparePolicy(routes: readonly RouteInfo[], policy: Record<string, Access> = ADMIN_ROUTE_POLICY): PolicyReport {
  const surface = routes.filter(isAdminSurface)
  const keys = new Set(surface.map(routeKey))
  return {
    missing: surface.filter((route) => policy[routeKey(route)] === undefined).map(routeKey),
    stale: Object.keys(policy).filter((key) => !keys.has(key)),
    withoutSession: surface.filter((route) => policy[routeKey(route)] !== undefined && policy[routeKey(route)] !== 'public' && route.auth !== true).map(routeKey),
    publicWithoutLimit: surface.filter((route) => policy[routeKey(route)] === 'public' && !route.limit).map(routeKey),
    publicButAuthenticated: surface.filter((route) => policy[routeKey(route)] === 'public' && route.auth === true).map(routeKey),
  }
}

/** Values for the `:name` segments that reach the handler's permission check: numbers where an id is a number, a real type, kind and group. */
const PARAMETERS: Record<string, string> = { id: '999999', link: '999999', type: 'faq', kind: 'services', code: 'comparison', group: 'services', lang: 'hu' }

export const concretePath = (pattern: string): string => pattern.replace(/:([A-Za-z]+)/g, (_match, name: string) => PARAMETERS[name] ?? 'x')
