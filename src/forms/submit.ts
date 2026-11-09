/**
 * The one place that knows how a form's request (the quote request, the contact message) leaves
 * the browser. A form calls `submit` and shows what comes back; it never assumes that a request
 * was sent.
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

/**
 * What the backend answered when it stored a request: the reference to quote, when it arrived, the secret of the private status page (shown
 * once to the person who sent it) and whether a confirmation e-mail is on its way. A form handler of another kind may answer nothing of the
 * sort, and then there is no receipt: the form says it was sent and nothing more.
 */
export interface Receipt {
  reference: string
  createdAt: string | null
  statusToken: string | null
  confirmationEmail: 'queued' | 'not_sent' | null
}

/** Reads the backend's `{ data: { reference, createdAt, statusToken, confirmationEmail } }`; `null` for anything else. */
export function parseReceipt(body: unknown): Receipt | null {
  const data = typeof body === 'object' && body !== null ? (body as { data?: unknown }).data : null
  if (typeof data !== 'object' || data === null) return null
  const fields = data as Record<string, unknown>
  if (typeof fields.reference !== 'string' || !/^[A-Za-z0-9-]{3,40}$/.test(fields.reference)) return null
  return {
    reference: fields.reference,
    createdAt: typeof fields.createdAt === 'string' && !Number.isNaN(Date.parse(fields.createdAt)) ? fields.createdAt : null,
    statusToken: typeof fields.statusToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(fields.statusToken) ? fields.statusToken : null,
    confirmationEmail: fields.confirmationEmail === 'queued' || fields.confirmationEmail === 'not_sent' ? fields.confirmationEmail : null,
  }
}

export type SubmitOutcome =
  | { status: 'sent'; receipt?: Receipt }
  | { status: 'unavailable' }
  | { status: 'failed'; reason: 'network' | 'timeout' | 'rejected' }

export interface Transport<T extends object> {
  readonly id: 'none' | 'endpoint'
  submit(request: T): Promise<SubmitOutcome>
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/

/**
 * A usable endpoint is an https:// address, or a path on the site's own origin (`/api/contact`). A
 * local http:// address is accepted only while developing, so a test server can stand in for the real
 * one. Anything else (empty, malformed, plain http on the internet) is treated as not configured.
 */
export function normalizeEndpoint(value: unknown, allowLocalHttp = false): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  // A path on the site's own origin (`/api/contact`), for a deployment where the backend serves the website too.
  if (/^\/(?!\/)[A-Za-z0-9_\-./]*$/.test(value.trim()) && !value.includes('..')) return value.trim()
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

export const unavailableTransport: Transport<object> = {
  id: 'none',
  submit: () => Promise.resolve({ status: 'unavailable' }),
}

export function endpointTransport<T extends object>(
  endpoint: string,
  { fetchImpl = (...args) => fetch(...args), timeoutMs = 12000 }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Transport<T> {
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
        if (!response.ok) return { status: 'failed', reason: 'rejected' }
        // The request is stored whether or not the answer can be read: only a readable one adds a receipt.
        const receipt = parseReceipt(await response.json().catch(() => null))
        return receipt ? { status: 'sent', receipt } : { status: 'sent' }
      } catch (error) {
        const aborted = error instanceof DOMException && error.name === 'AbortError'
        return { status: 'failed', reason: aborted ? 'timeout' : 'network' }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

export function createTransport<T extends object>(endpoint: string | null): Transport<T> {
  return endpoint ? endpointTransport<T>(endpoint) : unavailableTransport
}
