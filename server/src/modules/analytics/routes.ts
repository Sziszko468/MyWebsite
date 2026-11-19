import type { SessionInfo } from '../../context.ts'
import { forbidden, notFound, unauthorized } from '../../http/errors.ts'
import { json, textReply } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { audit } from '../system/audit.ts'
import { exportFileName, sectionCsv } from './export.ts'
import { SECTIONS, type SectionName } from './model.ts'
import { accessOf, buildSection } from './service.ts'

/**
 * The analytics API (PROMPT 32), `/api/admin/analytics`. Like the rest of the administration it needs the administrator's cookie session (and a same-origin request); it only reads, so
 * there is no CSRF-protected state change. It has NO permission of its own: each section needs the permission of the data behind it (`requests:read`, `clients:read`, `system:read`),
 * checked per request against the role stored now, and a section the role may not read comes back as `not_permitted`, never as a zero. Responses are never cacheable.
 */

/** A signed-in administrator who may read at least one of the three areas; what each section shows is decided per section. */
function needSession(session: SessionInfo | null): SessionInfo {
  if (!session) throw unauthorized()
  const access = accessOf(session)
  if (!access.requests && !access.clients && !access.system) throw forbidden()
  return session
}

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' }

export function analyticsRoutes(): RouteDef[] {
  const admin = (pattern: string, handler: RouteDef['handler']): RouteDef => ({ method: 'GET', pattern, area: 'admin', auth: true, handler, limit: 'analytics' })
  const sectionOf = (value: string | null): SectionName => {
    if (value === null || !(SECTIONS as readonly string[]).includes(value)) throw notFound('The report')
    return value as SectionName
  }
  return [
    // One section at a time (the screen loads the one being looked at).
    admin('/api/admin/analytics', (ctx) => {
      const session = needSession(ctx.session)
      const name = sectionOf(ctx.query.get('section') ?? 'executive')
      const { meta, filters, section } = buildSection(ctx.app, session, name, ctx.query)
      return json({ meta, filters, access: accessOf(session), section }, { headers: NO_STORE })
    }),
    // The same section as a CSV file: the filters, the permissions and the period are the screen's.
    admin('/api/admin/analytics/export', (ctx) => {
      const session = needSession(ctx.session)
      const name = sectionOf(ctx.query.get('report'))
      const { meta, filters, section } = buildSection(ctx.app, session, name, ctx.query)
      if (section.state === 'not_permitted') throw forbidden()
      audit(ctx.app, session, 'analytics.export', 'analytics', name, { from: meta.period.from, to: meta.period.to })
      return textReply(sectionCsv(section, meta, filters, name), 'text/csv; charset=utf-8', 200, { ...NO_STORE, 'Content-Disposition': `attachment; filename="${exportFileName(name, meta)}"`, 'X-Content-Type-Options': 'nosniff' })
    }),
  ]
}
