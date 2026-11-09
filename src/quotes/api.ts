import { apiEndpoint } from '../config/api'

/**
 * The customer's two private pages talk to the backend through a secret in the address and nothing else. Every call returns either what the
 * server said or a plain reason the page can word: a link that does not exist, one that no longer works (and why), too many tries, no
 * connection. Nothing is cached, stored or logged here, and the secret is never put anywhere but the request's path.
 */

export type QuoteState = 'open' | 'expired' | 'accepted' | 'declined' | 'superseded' | 'withdrawn'
export type RequestStatus = 'new' | 'under_review' | 'waiting_customer' | 'quote_preparation' | 'quote_sent' | 'accepted' | 'declined' | 'in_progress' | 'completed' | 'cancelled'

export interface Money {
  minor: number
  text: string
}

export interface ViewLine {
  kind: 'item' | 'optional' | 'discount'
  description: string
  detail: string
  quantity: number
  unit: Money
  total: Money
  justification: string
}

export interface QuoteView {
  reference: string
  requestReference: string
  version: number
  language: 'hu' | 'en' | 'nl'
  status: string
  expired: boolean
  title: string
  introduction: string
  understanding: string
  scope: string
  deliverables: string
  exclusions: string
  paymentTerms: string
  terms: string
  notes: string
  estimatedTimeline: string
  validUntil: string | null
  customer: { name: string; company: string | null }
  pricing: {
    mode: 'fixed' | 'itemized' | 'custom'
    note: string
    currency: string | null
    lines: ViewLine[]
    fixed: Money | null
    subtotal: Money | null
    discount: Money | null
    optional: Money | null
    tax: { mode: 'unspecified' | 'excluded' | 'included' | 'exempt'; ratePercent: string | null; amount: Money | null; verified: boolean; note: string }
    total: Money | null
  }
  sentAt: string | null
  acceptedAt: string | null
  declinedAt: string | null
}

export interface QuotePageData {
  quote: QuoteView
  state: QuoteState
  actions: { accept: string | null; decline: string | null; revise: string | null }
}

export interface RequestPageData {
  reference: string
  createdAt: string
  language: 'hu' | 'en' | 'nl'
  status: RequestStatus
  updates: Array<{ at: string; kind: 'status' | 'message' | 'quote'; status: RequestStatus | null; body: string }>
  quotations: Array<{ reference: string; version: number; title: string; state: QuoteState; sentAt: string | null; validUntil: string | null; link: string | null }>
}

export type Failure =
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'replaced' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable' }
  | { kind: 'network' }
  | { kind: 'refused'; reason: string; fields: Record<string, string> }

export type Result<T> = { ok: true; data: T } | { ok: false; failure: Failure }

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Result<T>> {
  const url = apiEndpoint(path)
  if (url === null) return { ok: false, failure: { kind: 'unavailable' } }
  try {
    const response = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    })
    const json: unknown = await response.json().catch(() => null)
    if (response.ok) return { ok: true, data: (json as { data: T }).data }
    const error = (json as { error?: { code?: string; details?: { reason?: string; fields?: Record<string, string> } } } | null)?.error
    if (response.status === 404) return { ok: false, failure: { kind: 'not_found' } }
    if (response.status === 410) return { ok: false, failure: { kind: error?.details?.reason === 'expired' ? 'expired' : 'replaced' } }
    if (response.status === 429) return { ok: false, failure: { kind: 'rate_limited' } }
    if (response.status === 409 || response.status === 422) return { ok: false, failure: { kind: 'refused', reason: error?.details?.reason ?? error?.code ?? 'refused', fields: error?.details?.fields ?? {} } }
    return { ok: false, failure: { kind: 'network' } }
  } catch {
    return { ok: false, failure: { kind: 'network' } }
  }
}

const SECRET = /^[A-Za-z0-9_-]{20,64}$/

/** A malformed secret never leaves the browser: it is "not found" without asking. */
const guard = <T>(token: string, run: () => Promise<Result<T>>): Promise<Result<T>> => (SECRET.test(token) ? run() : Promise.resolve({ ok: false, failure: { kind: 'not_found' } }))

export const fetchQuotation = (token: string) => guard(token, () => call<QuotePageData>('GET', `/api/customer/quotations/${token}`))
export const fetchRequest = (token: string) => guard(token, () => call<RequestPageData>('GET', `/api/customer/requests/${token}`))

export type Decision = { outcome: 'accepted' | 'declined' | 'revision_requested'; at: string; reference: string }

export const postAction = (body: { token: string; confirm?: boolean; reason?: string; message?: string }) => guard(body.token, () => call<Decision>('POST', '/api/customer/actions', body))
