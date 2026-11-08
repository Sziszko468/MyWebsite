import { apiEndpoint } from '../config/api'

/**
 * The assistant's HTTP client, without any AI library: a few JSON calls to the backend (server/src/modules/ai/routes.ts). The
 * visitor is an anonymous session: a token the server signs, kept in `sessionStorage` (this tab only; the privacy notice lists
 * it) and sent in the `X-AI-Session` header. There is no cookie and no account. Nothing here is loaded until the assistant is
 * opened, except `availability.ts`, which only asks whether to offer it.
 */

export class AiError extends Error {
  readonly status: number
  /** The server's error code (`rate_limited`, `service_unavailable`, `conflict`, …) or `network`. */
  readonly code: string
  /** The server's reason (`daily_budget`, `session_requests`, `busy`, `conversation_expired`, …), when it gave one. */
  readonly reason: string | null
  readonly fields: Record<string, string>
  constructor(status: number, code: string, reason: string | null = null, fields: Record<string, string> = {}) {
    super(`${code}${reason ? `: ${reason}` : ''}`)
    this.name = 'AiError'
    this.status = status
    this.code = code
    this.reason = reason
    this.fields = fields
  }
}

const KEY = 'cc-ai'

export interface Stored {
  token: string | null
  conversationId: string | null
}

function store(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** What this tab remembers: the session token and the conversation it was in. Nothing else, and never anything the visitor wrote. */
export function readStored(): Stored {
  try {
    const raw = store()?.getItem(KEY)
    if (!raw) return { token: null, conversationId: null }
    const parsed: unknown = JSON.parse(raw)
    const value = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
    return { token: typeof value.token === 'string' ? value.token : null, conversationId: typeof value.conversationId === 'string' ? value.conversationId : null }
  } catch {
    return { token: null, conversationId: null }
  }
}

export function writeStored(next: Partial<Stored>): void {
  try {
    store()?.setItem(KEY, JSON.stringify({ ...readStored(), ...next }))
  } catch {
    // Storage is refused (a private window): the assistant still works, it just forgets on a reload.
  }
}

export function clearStored(): void {
  try {
    store()?.removeItem(KEY)
  } catch {
    // Nothing to do.
  }
}

export const newConversationId = (): string => `c${crypto.randomUUID().replace(/-/g, '')}`

let token: string | null = readStored().token
let creating: Promise<string> | null = null

/** The session token, created on first use. Concurrent callers share one request. */
export async function ensureSession(fresh = false): Promise<string> {
  if (!fresh && token) return token
  creating ??= (async () => {
    const response = await request<{ token: string }>('POST', '/api/ai/session', {}, false)
    token = response.token
    writeStored({ token })
    return token
  })().finally(() => {
    creating = null
  })
  return creating
}

export const currentToken = (): string | null => token

async function request<T>(method: string, path: string, body: unknown, authenticated = true, retry = true): Promise<T> {
  const url = apiEndpoint(path)
  if (url === null) throw new AiError(0, 'unavailable', 'no_backend')
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (authenticated) headers['X-AI-Session'] = await ensureSession()
  let response: Response
  try {
    response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'omit', referrerPolicy: 'no-referrer' })
  } catch {
    throw new AiError(0, 'network')
  }
  if (response.status === 401 && authenticated && retry) {
    // The server no longer knows this session (it restarted, or the token expired): start a new one, once.
    token = null
    await ensureSession(true)
    return request<T>(method, path, body, authenticated, false)
  }
  if (response.status === 204) return undefined as T
  let parsed: unknown = null
  try {
    parsed = await response.json()
  } catch {
    parsed = null
  }
  if (!response.ok) throw errorFrom(response.status, parsed)
  return (parsed as { data: T }).data
}

export function errorFrom(status: number, parsed: unknown): AiError {
  const error = typeof parsed === 'object' && parsed !== null && 'error' in parsed ? ((parsed as { error: Record<string, unknown> }).error ?? {}) : {}
  const details = typeof error.details === 'object' && error.details !== null ? (error.details as Record<string, unknown>) : {}
  const fields = typeof details.fields === 'object' && details.fields !== null ? (details.fields as Record<string, string>) : {}
  return new AiError(status, typeof error.code === 'string' ? error.code : 'error', typeof details.reason === 'string' ? details.reason : null, fields)
}

// ---- the calls ----

export interface ConversationSummary {
  id: string
  title: string | null
  language: 'hu' | 'en' | 'nl'
  topic: string
  messageCount: number
  updatedAt: string
  createdAt: string
  planReady: boolean
  sent: boolean
}

export interface PlanState {
  plan: Record<string, unknown> | null
  version: number
  missing: string[]
  ready: boolean
  sent: boolean
  reference: string | null
}

export interface ConversationDetail extends ConversationSummary, PlanState {
  messages: unknown[]
}

export const listConversations = () => request<ConversationSummary[]>('GET', '/api/ai/conversations', undefined)
export const readConversation = (id: string) => request<ConversationDetail>('GET', `/api/ai/conversations/${encodeURIComponent(id)}`, undefined)
export const deleteConversation = (id: string) => request<undefined>('DELETE', `/api/ai/conversations/${encodeURIComponent(id)}`, undefined)
export const savePlan = (id: string, expectedVersion: number, fields: Record<string, unknown>) => request<PlanState>('PUT', `/api/ai/conversations/${encodeURIComponent(id)}/plan`, { expectedVersion, ...fields })
export const restartPlan = (id: string) => request<PlanState>('DELETE', `/api/ai/conversations/${encodeURIComponent(id)}/plan`, undefined)
export const approveRequest = (id: string, body: { name: string; email: string; company: string | null; consent: boolean; planVersion: number }) =>
  request<{ approvedAt: string; expiresAt: string }>('POST', `/api/ai/conversations/${encodeURIComponent(id)}/quote-approval`, body)
