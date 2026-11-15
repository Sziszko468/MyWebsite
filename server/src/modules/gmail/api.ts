import { GmailAuthError, type GmailFetch, type GmailTokenService } from './tokenService.ts'

/**
 * The two Gmail API calls this integration makes, over HTTPS with the access token the token service provides: `users.messages.list`
 * (ids, a page at a time) and `users.messages.get` (one message, headers and MIME parts). Nothing else: no IMAP, no mail library,
 * no sending, no modifying, no attachment download.
 *
 * Every call has a time limit and a size limit, never follows a redirect (the access token is in the request), and fails with a
 * `GmailApiError` that carries a category from a fixed list and nothing Google said: the answer's text is read, checked, and dropped.
 */

export const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export type GmailApiErrorCategory =
  /** Google rejected the access token (twice: a fresh one was tried). */
  | 'api_unauthorized'
  /** The Gmail API is not enabled for the project, or the token lacks the permission. */
  | 'api_forbidden'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'network'
  | 'not_found'
  | 'too_large'
  | 'invalid_response'

const MESSAGES: Record<GmailApiErrorCategory, string> = {
  api_unauthorized: 'Gmail did not accept the access token.',
  api_forbidden: 'Gmail refused the request: the API is not enabled or the permission is missing.',
  rate_limited: 'Gmail is limiting requests; try again later.',
  provider_unavailable: 'Gmail could not answer; try again later.',
  network: 'Gmail could not be reached.',
  not_found: 'Gmail has no such message.',
  too_large: 'Gmail answered with more data than the limit allows.',
  invalid_response: 'Gmail answered with something the server cannot use.',
}

/** The only error of the API client (apart from `GmailAuthError`, which the token service raises). Its message is fixed text. */
export class GmailApiError extends Error {
  readonly category: GmailApiErrorCategory
  /** Gmail's HTTP status when it answered, otherwise null. A number, never text. */
  readonly httpStatus: number | null
  constructor(category: GmailApiErrorCategory, httpStatus: number | null = null) {
    super(MESSAGES[category])
    this.name = 'GmailApiError'
    this.category = category
    this.httpStatus = httpStatus
  }
}

export interface GmailMessageRef {
  id: string
  threadId: string
}

export interface GmailListPage {
  messages: GmailMessageRef[]
  nextPageToken: string | null
}

export interface GmailListOptions {
  labelIds?: readonly string[]
  /** Gmail's search syntax (`after:1700000000`). */
  query?: string
  /** 1 to 500. */
  maxResults?: number
  pageToken?: string
}

export interface GmailApiClient {
  /** One page of message ids, newest first. */
  listMessages(options?: GmailListOptions): Promise<GmailListPage>
  /** One message with its headers and MIME parts, as the API returns it (parsed by mime.ts, never used raw). */
  getMessage(id: string): Promise<unknown>
}

export interface GmailApiOptions {
  fetch?: GmailFetch
  /** For one request; Gmail answers in well under a second. */
  timeoutMs?: number
  /** The most a single answer may weigh, in bytes. A message with big text parts is far below this. */
  maxResponseBytes?: number
}

const ID = /^[A-Za-z0-9_-]{1,64}$/
const PAGE_TOKEN = /^[A-Za-z0-9_=.~-]{1,2048}$/
const LABEL = /^[A-Za-z0-9_ -]{1,64}$/
/** Reasons Google gives with a 403 when the real trouble is the request rate or the quota. */
const RATE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'dailyLimitExceeded', 'quotaExceeded', 'limitExceeded'])

/** The body of an answer, read up to a limit; a longer one is cut off and refused (nothing of it is kept). */
async function readLimited(response: Response, max: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max) {
    await response.body?.cancel().catch(() => undefined)
    throw new GmailApiError('too_large', response.status)
  }
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > max) {
        await reader.cancel().catch(() => undefined)
        throw new GmailApiError('too_large', response.status)
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof GmailApiError) throw error
    throw new GmailApiError('network', response.status)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function failureOf(status: number, text: string): GmailApiError {
  if (status === 401) return new GmailApiError('api_unauthorized', status)
  if (status === 404) return new GmailApiError('not_found', status)
  if (status === 429) return new GmailApiError('rate_limited', status)
  if (status >= 500) return new GmailApiError('provider_unavailable', status)
  if (status === 403) {
    // Only Google's reason code is looked at, to tell "slow down" from "not allowed".
    try {
      const errors = (JSON.parse(text) as { error?: { errors?: { reason?: unknown }[] } }).error?.errors
      if (Array.isArray(errors) && errors.some((entry) => typeof entry?.reason === 'string' && RATE_REASONS.has(entry.reason))) return new GmailApiError('rate_limited', status)
    } catch {
      // not JSON: it is a refusal
    }
    return new GmailApiError('api_forbidden', status)
  }
  return new GmailApiError('invalid_response', status)
}

export function createGmailApiClient(tokens: Pick<GmailTokenService, 'getAccessToken' | 'invalidate'>, options: GmailApiOptions = {}): GmailApiClient {
  const timeoutMs = options.timeoutMs ?? 20_000
  const maxBytes = options.maxResponseBytes ?? 2 * 1024 * 1024

  async function call(path: string, query: URLSearchParams): Promise<unknown> {
    const fetchImpl: GmailFetch = options.fetch ?? fetch
    const url = `${GMAIL_API}${path}?${query.toString()}`
    // A 401 may only mean the cached access token has been revoked or has just expired: one new token is tried before giving up.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      // A `GmailAuthError` from the token service passes through as it is: it already has a safe category.
      const token = await tokens.getAccessToken()
      let response: Response
      try {
        response = await fetchImpl(url, { method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })
      } catch (error) {
        if (error instanceof GmailAuthError) throw error
        throw new GmailApiError('network')
      }
      if (response.status === 401 && attempt === 0) {
        await response.body?.cancel().catch(() => undefined)
        tokens.invalidate()
        continue
      }
      const text = await readLimited(response, maxBytes)
      if (!response.ok) throw failureOf(response.status, text)
      try {
        return JSON.parse(text)
      } catch {
        throw new GmailApiError('invalid_response', response.status)
      }
    }
    throw new GmailApiError('api_unauthorized', 401)
  }

  return {
    async listMessages(listOptions = {}) {
      const query = new URLSearchParams({ maxResults: String(Math.min(500, Math.max(1, Math.floor(listOptions.maxResults ?? 100)))), fields: 'messages(id,threadId),nextPageToken' })
      for (const label of listOptions.labelIds ?? []) {
        if (!LABEL.test(label)) throw new TypeError('A label id is not acceptable.')
        query.append('labelIds', label)
      }
      if (listOptions.query) query.set('q', listOptions.query.slice(0, 500))
      if (listOptions.pageToken) {
        if (!PAGE_TOKEN.test(listOptions.pageToken)) throw new GmailApiError('invalid_response')
        query.set('pageToken', listOptions.pageToken)
      }
      const body = await call('/messages', query)
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new GmailApiError('invalid_response')
      const { messages, nextPageToken } = body as { messages?: unknown; nextPageToken?: unknown }
      if (messages !== undefined && !Array.isArray(messages)) throw new GmailApiError('invalid_response')
      const refs: GmailMessageRef[] = []
      for (const entry of (messages ?? []) as unknown[]) {
        const { id, threadId } = (typeof entry === 'object' && entry !== null ? entry : {}) as { id?: unknown; threadId?: unknown }
        if (typeof id !== 'string' || typeof threadId !== 'string' || !ID.test(id) || !ID.test(threadId)) throw new GmailApiError('invalid_response')
        refs.push({ id, threadId })
      }
      if (nextPageToken !== undefined && (typeof nextPageToken !== 'string' || !PAGE_TOKEN.test(nextPageToken))) throw new GmailApiError('invalid_response')
      return { messages: refs, nextPageToken: typeof nextPageToken === 'string' && nextPageToken !== '' ? nextPageToken : null }
    },

    async getMessage(id) {
      // The id goes into the address: only what a Gmail id can be.
      if (!ID.test(id)) throw new GmailApiError('invalid_response')
      return call(`/messages/${id}`, new URLSearchParams({ format: 'full', fields: 'id,threadId,internalDate,labelIds,sizeEstimate,payload' }))
    },
  }
}
