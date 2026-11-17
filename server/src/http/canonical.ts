/**
 * The canonical host (PROMPT 25): when the website is reachable under more than one host name (the apex and `www`, the host's own
 * `*.onrender.com` address), every GET or HEAD for a page on any other host than `PUBLIC_URL`'s is answered with a 301 to the same path
 * on `PUBLIC_URL`, so that the address a visitor, a crawler and the sitemap see is one. It is OFF unless `CANONICAL_REDIRECT=true`.
 *
 * This is a safeguard behind the redirect rule that belongs in the DNS/CDN dashboard, not a replacement for it, and it must never be
 * switched on while a dashboard rule sends the same traffic the other way (apex to www): the two would redirect each other forever.
 * Order of a change: remove the dashboard rule first, then switch this on (docs/operations/RELEASE_CHECKLIST.md).
 *
 * What makes it safe:
 *   - the target is `PUBLIC_URL`'s origin plus the request's own path and query: nothing from the `Host` header or from any other
 *     header is ever put in the address, so it cannot be turned into an open redirect;
 *   - only GET and HEAD are redirected (a POST cannot be, and is not touched); `/api/health` and `/api/ready` are never redirected
 *     (a host's health check does not use the public name); an address that is an IP, `localhost`, or not a host name at all is left alone;
 *   - the redirect may be cached for five minutes only, so a mistake is cheap to take back.
 * It has no imports on purpose: the website's tests load it too, to hold the sitemap's host against the host this redirects to.
 */

export interface CanonicalInput {
  /** `PUBLIC_URL`: an origin such as `https://szilardkiss.com`. */
  publicUrl: string
  method: string
  /** The request's `Host` header. */
  host: string | undefined
  pathname: string
  search: string
}

export interface CanonicalRedirect {
  status: 301
  headers: Record<string, string>
}

const EXEMPT_PATHS = new Set(['/api/health', '/api/ready'])
const IP_LITERAL = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])(:\d+)?$/
const HOST_NAME = /^[a-z0-9.-]+(:\d{1,5})?$/

/** The host (with a non-default port, if any) of an origin, lower case; null when it is not an origin. */
export function canonicalHostOf(publicUrl: string): string | null {
  try {
    return new URL(publicUrl).host.toLowerCase()
  } catch {
    return null
  }
}

/** A space, a control character or a DEL: nothing that may sit in a header value. */
const unsafe = (text: string): boolean => [...text].some((char) => char.charCodeAt(0) <= 0x20 || char.charCodeAt(0) === 0x7f)

export function canonicalRedirect(input: CanonicalInput): CanonicalRedirect | null {
  if (input.method !== 'GET' && input.method !== 'HEAD') return null
  if (EXEMPT_PATHS.has(input.pathname)) return null
  // The request's own path and query go into the Location header. The server's URL parser has already percent-encoded them, and this
  // does not rely on that: anything that could break a header line, or is not a path, is not redirected (it is served as it is).
  if (!input.pathname.startsWith('/') || unsafe(input.pathname) || unsafe(input.search)) return null
  const canonical = canonicalHostOf(input.publicUrl)
  if (canonical === null) return null
  // The host as the client wrote it, without a trailing dot and without the port its scheme implies.
  const host = (input.host ?? '').trim().toLowerCase().replace(/\.(?=:\d+$|$)/, '').replace(/:(80|443)$/, '')
  if (host === '' || host === canonical) return null
  if (host === 'localhost' || host.startsWith('localhost:') || IP_LITERAL.test(host) || !HOST_NAME.test(host)) return null
  return { status: 301, headers: { Location: `${new URL(input.publicUrl).origin}${input.pathname}${input.search}`, 'Cache-Control': 'public, max-age=300' } }
}
