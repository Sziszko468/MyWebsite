import type { Handler } from '../context.ts'
import type { LimitName } from './rateLimit.ts'

/**
 * A router small enough to read in one go: a route is a method and a path pattern with `:name` segments.
 * `area` says which family the route belongs to, which decides its headers and its CORS rules (app.ts): the
 * public JSON API is open to the website's origin, the admin is same-origin only.
 */
export type Area = 'api' | 'admin' | 'static'

export interface RouteDef {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  pattern: string
  handler: Handler
  area: Area
  /** The rate limit applied to the route, on top of the global one. */
  limit?: LimitName
  /** A signed-in administrator is required; the permission (modules/auth/permissions.ts) is checked by the handler's module. */
  auth?: boolean
}

interface Compiled {
  def: RouteDef
  segments: string[]
}

export type Match = { kind: 'found'; def: RouteDef; params: Record<string, string> } | { kind: 'method'; allowed: string[] } | { kind: 'none' }

export class Router {
  private readonly routes: Compiled[] = []

  add(...defs: RouteDef[]): this {
    for (const def of defs) this.routes.push({ def, segments: def.pattern.split('/').filter(Boolean) })
    return this
  }

  match(method: string, path: string): Match {
    const parts = path.split('/').filter(Boolean)
    const allowed = new Set<string>()
    for (const { def, segments } of this.routes) {
      if (segments.length !== parts.length) continue
      const params: Record<string, string> = {}
      let ok = true
      for (let i = 0; i < segments.length; i += 1) {
        if (segments[i].startsWith(':')) {
          try {
            params[segments[i].slice(1)] = decodeURIComponent(parts[i])
          } catch {
            ok = false
            break
          }
        } else if (segments[i] !== parts[i]) {
          ok = false
          break
        }
      }
      if (!ok) continue
      if (def.method === method) return { kind: 'found', def, params }
      allowed.add(def.method)
    }
    return allowed.size > 0 ? { kind: 'method', allowed: [...allowed] } : { kind: 'none' }
  }
}
