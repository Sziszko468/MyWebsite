import type { QuoteRequest } from './types'

/**
 * The one place that knows how a quote request leaves the browser. The form calls `submit` and
 * shows what comes back; it never assumes that a request was sent.
 *
 * - With no endpoint configured, the transport is `none`: it sends nothing and says so
 *   (`unavailable`). The form then offers the summary to copy instead and never claims success.
 * - With an endpoint, the request is POSTed there as JSON over HTTPS. Only a 2xx answer counts as
 *   `sent`; anything else, a network failure or a timeout is a `failed` outcome, and the visitor's
 *   answers stay in the form.
 *
 * Nothing is written to storage and nothing is logged here: the request exists in memory until it
 * is posted to the address the owner configured.
 */

export type SubmitOutcome =
  | { status: 'sent' }
  | { status: 'unavailable' }
  | { status: 'failed'; reason: 'network' | 'timeout' | 'rejected' }

export interface QuoteTransport {
  readonly id: 'none' | 'endpoint'
  submit(request: QuoteRequest): Promise<SubmitOutcome>
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/

/**
 * A usable endpoint is an https:// address. A local http:// address is accepted only while
 * developing, so a test server can stand in for the real one. Anything else (empty, malformed,
 * plain http on the internet) is treated as not configured.
 */
export function normalizeEndpoint(value: unknown, allowLocalHttp = false): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.username || url.password) return null
  if (url.protocol === 'https:') return url.toString()
  if (allowLocalHttp && url.protocol === 'http:' && LOCAL_HOST.test(url.hostname)) return url.toString()
  return null
}

export const unavailableTransport: QuoteTransport = {
  id: 'none',
  submit: () => Promise.resolve({ status: 'unavailable' }),
}

export function endpointTransport(
  endpoint: string,
  { fetchImpl = (...args) => fetch(...args), timeoutMs = 12000 }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): QuoteTransport {
  return {
    id: 'endpoint',
    async submit(request) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(request),
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        })
        return response.ok ? { status: 'sent' } : { status: 'failed', reason: 'rejected' }
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === 'AbortError'
        return { status: 'failed', reason: aborted ? 'timeout' : 'network' }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

export function createTransport(endpoint: string | null): QuoteTransport {
  return endpoint ? endpointTransport(endpoint) : unavailableTransport
}
