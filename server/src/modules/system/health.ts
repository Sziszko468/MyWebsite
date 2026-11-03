import type { AppContext } from '../../context.ts'
import { migrationStatus } from '../../db/migrate.ts'
import { json } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'

/**
 * `GET /api/health` says the process is up (a load balancer's liveness probe: it touches nothing). `GET /api/ready`
 * says it can do its work: the database answers and the schema is current. Neither reveals configuration beyond
 * whether e-mail is switched on, and neither needs a session.
 */
export function healthRoutes(app: AppContext): RouteDef[] {
  return [
    { method: 'GET', pattern: '/api/health', area: 'api', handler: () => json({ status: 'ok' }) },
    {
      method: 'GET',
      pattern: '/api/ready',
      area: 'api',
      handler: () => {
        const database = app.db.isOpen && app.db.ping()
        let migrations: 'current' | 'pending' | 'unknown' = 'unknown'
        if (database) {
          try {
            migrations = migrationStatus(app.db).pending === 0 ? 'current' : 'pending'
          } catch {
            migrations = 'unknown'
          }
        }
        const ready = database && migrations === 'current'
        return json(
          { status: ready ? 'ready' : 'not_ready', checks: { database: database ? 'ok' : 'unavailable', migrations, email: app.notifier.enabled ? 'configured' : 'off' } },
          { status: ready ? 200 : 503, headers: ready ? {} : { 'Retry-After': '10' } },
        )
      },
    },
  ]
}
