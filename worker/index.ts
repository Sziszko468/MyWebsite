import { decide, type RoutingEnv } from './routing'

/**
 * The edge Worker of the public website (Cloudflare Workers, static assets). The whole site is static files; this script exists
 * for one job: choosing the starting language of a visitor who opened an address without one (`/`), BEFORE any page is sent, so
 * nobody sees a page in one language replaced by another.
 *
 * Privacy, by construction: the only thing read from the connection is `request.cf.country`, a two-letter country code. The
 * visitor's IP address is not read, stored, logged or forwarded, nothing is sent to a third party, nothing is written
 * (no log line, no KV, no analytics event), and the country is not passed on to the page: the answer is just the address
 * the visitor is sent to. The only thing the visitor can store is their own language choice (cookie `cc_lang`, set by the page).
 *
 * `wrangler.jsonc` runs this script first only for addresses that are not a language page or a built asset (run_worker_first);
 * every other request is answered by Cloudflare's asset layer without invoking it.
 */

interface Env extends RoutingEnv {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const decision = decide(request, env)
    if (decision.kind === 'pass') return env.ASSETS.fetch(request)
    return new Response(null, {
      status: 302,
      headers: {
        Location: decision.location,
        // The answer depends on a cookie and the connection: nothing may keep it, and nothing may show it to another visitor.
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie',
      },
    })
  },
}
