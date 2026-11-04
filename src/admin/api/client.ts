/**
 * The administration's only way to talk to the backend (`/api/admin/*`, server/). It adds what every request needs and
 * turns every failure into one kind of error, so a screen has one thing to handle:
 *
 *   - the session cookie travels by itself (same origin, `HttpOnly`: this code never sees it);
 *   - a request that changes something carries the session's CSRF token in `X-CSRF-Token`, a JSON body, and nothing
 *     else is ever sent as a form or with credentials to another address;
 *   - a 401 from anywhere except the sign-in itself means the session ended (it idles out), and the application is told
 *     once so it can return to the sign-in instead of every screen discovering it separately;
 *   - an answer that is not the backend's JSON envelope (a proxy's error page, a dropped connection) is still an
 *     `ApiError`, with a `code` a screen can show a sentence for.
 */

export interface Envelope<T> {
  data: T
  meta?: Record<string, unknown>
}

export class ApiError extends Error {
  readonly status: number
  /** The backend's error code (`validation_failed`, `conflict`, …), or `network` / `unreadable` when there was no usable answer. */
  readonly code: string
  /** Field name → why it was refused (`required`, `tooLong`, `invalid`, …), for a form to show next to the field. */
  readonly fields: Record<string, string>
  readonly requestId: string | null

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}, requestId: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
    this.requestId = requestId
  }
}

export interface RequestOptions {
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  signal?: AbortSignal
  /** Sign-in is the one request that is allowed to answer 401 without meaning "the session ended". */
  anonymous?: boolean
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

let fetchImpl: FetchLike = (input, init) => fetch(input, init)
let csrfToken: string | null = null
let sessionEnded: (() => void) | null = null

/** For tests: replace the network. */
export function configureApi(options: { fetch?: FetchLike }): void {
  if (options.fetch) fetchImpl = options.fetch
}

export const setCsrfToken = (token: string | null): void => {
  csrfToken = token
}

/** Registers the one place that learns the session ended; returns the way to unregister. */
export function onSessionEnded(handler: () => void): () => void {
  sessionEnded = handler
  return () => {
    if (sessionEnded === handler) sessionEnded = null
  }
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function queryString(query: RequestOptions['query']): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '' || value === false) continue
    params.set(key, value === true ? '1' : String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

export async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: string | undefined
  if (UNSAFE.has(method)) {
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken
    if (method !== 'DELETE') {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(options.body ?? {})
    }
  }

  let response: Response
  try {
    response = await fetchImpl(`${path}${queryString(options.query)}`, { method, headers, body, credentials: 'same-origin', cache: 'no-store', signal: options.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'network', 'The server could not be reached.')
  }

  if (response.status === 204) return { data: undefined as T }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  const record = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : null

  if (!response.ok) {
    const failure = record && typeof record.error === 'object' && record.error !== null ? (record.error as Record<string, unknown>) : null
    const details = failure && typeof failure.details === 'object' && failure.details !== null ? (failure.details as Record<string, unknown>) : null
    const fields = details && typeof details.fields === 'object' && details.fields !== null ? (details.fields as Record<string, string>) : {}
    const error = new ApiError(
      response.status,
      typeof failure?.code === 'string' ? failure.code : 'unreadable',
      typeof failure?.message === 'string' ? failure.message : `The server answered ${response.status}.`,
      fields,
      typeof failure?.requestId === 'string' ? failure.requestId : null,
    )
    if (response.status === 401 && !options.anonymous) {
      csrfToken = null
      sessionEnded?.()
    }
    throw error
  }

  if (!record || !('data' in record)) throw new ApiError(response.status, 'unreadable', 'The answer was not understood.')
  return { data: record.data as T, meta: typeof record.meta === 'object' && record.meta !== null ? (record.meta as Record<string, unknown>) : undefined }
}

export const get = <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options)
export const post = <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body })
export const put = <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body })
export const patch = <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body })
export const del = (path: string, options?: RequestOptions) => request<undefined>('DELETE', path, options)
