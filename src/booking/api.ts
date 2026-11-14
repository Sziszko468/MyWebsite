import { apiEndpoint } from '../config/api'
import type { Language } from '../i18n/config'

/**
 * The booking page's way to the backend (`/api/consultations/*`, server/src/modules/bookings/routes.ts). Every call returns either what the server said
 * or a plain reason the page can word. Nothing is cached or stored here, a secret is only ever put in a request's path, and what a visitor typed
 * is only ever sent to the booking endpoint.
 */

export type BookingStatus = 'pending' | 'confirmed' | 'reschedule_requested' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show'

export interface PublicType {
  code: string
  name: string
  description: string
  durationMinutes: number
}

export interface PublicConfig {
  open: boolean
  timeZone: string | null
  horizonDays: number
  confirmation: 'automatic' | 'manual'
  policy: { cancel: boolean; reschedule: boolean; approvalRequired: boolean }
  types: PublicType[]
}

export interface Slot {
  start: string
  end: string
  /** The wall-clock time happens twice that day (the clocks go back): the page shows the zone's own short name beside it. */
  ambiguous: boolean
}

export interface Day {
  date: string
  status: 'available' | 'full' | 'closed'
  slots: Slot[]
}

export interface BookingInput {
  language: Language
  type: string
  start: string
  name: string
  email: string
  company: string
  website: string
  description: string
  relatedReference: string
  consent: boolean
  idempotencyKey: string
  /** The hidden field no person sees. */
  nickname: string
}

export interface Receipt {
  reference: string
  status: BookingStatus
  type: { code: string; name: string }
  startAt: string
  endAt: string
  timeZone: string
  durationMinutes: number
  language: Language
  confirmationEmail: boolean
  duplicate: boolean
}

export interface BookingPage {
  reference: string
  status: BookingStatus
  active: boolean
  language: Language
  type: { code: string; name: string; description: string }
  durationMinutes: number
  startAt: string
  endAt: string
  timeZone: string
  name: string
  company: string | null
  website: string | null
  description: string | null
  cancellation: { by: 'customer' | 'owner'; at: string; note: string | null } | null
  policy: {
    cancel: { allowed: boolean; reason: string | null }
    reschedule: { allowed: boolean; reason: string | null }
    approvalRequired: boolean
  }
  change: {
    kind: 'cancel' | 'reschedule'
    initiator: 'customer' | 'owner'
    newStartAt: string | null
    newEndAt: string | null
    message: string | null
    expiresAt: string | null
    canWithdraw: boolean
    canAnswer: boolean
  } | null
  history: { type: string; at: string; fromStart: string | null; toStart: string | null; by: 'customer' | 'owner' | 'system' }[]
}

export interface ActionResult {
  outcome: 'requested' | 'done' | 'withdrawn' | 'accepted' | 'declined'
  booking: BookingPage
}

export type CustomerAction =
  | { action: 'cancel'; message: string }
  | { action: 'reschedule'; start: string; message: string }
  | { action: 'withdraw' }
  | { action: 'accept' }
  | { action: 'decline' }

export type Failure =
  | { kind: 'not_found' }
  | { kind: 'expired' }
  | { kind: 'replaced' }
  | { kind: 'rate_limited' }
  | { kind: 'unavailable' }
  | { kind: 'network' }
  | { kind: 'refused'; status: number; reason: string; fields: Record<string, string> }

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
    if (response.status === 409 || response.status === 422 || response.status === 403) return { ok: false, failure: { kind: 'refused', status: response.status, reason: error?.details?.reason ?? error?.code ?? 'refused', fields: error?.details?.fields ?? {} } }
    return { ok: false, failure: { kind: response.status >= 500 ? 'unavailable' : 'network' } }
  } catch {
    return { ok: false, failure: { kind: 'network' } }
  }
}

const enc = encodeURIComponent

export const fetchConfig = (lang: Language) => call<PublicConfig>('GET', `/api/consultations/config?lang=${lang}`)
export const fetchDays = (type: string, from: string, to: string) => call<{ days: Day[] }>('GET', `/api/consultations/types/${enc(type)}/days?from=${from}&to=${to}`)
export const sendBooking = (input: BookingInput) => call<Receipt>('POST', '/api/consultations/bookings', input)
export const fetchBooking = (token: string) => call<BookingPage>('GET', `/api/consultations/manage/${enc(token)}`)
export const fetchRescheduleDays = (token: string, from: string, to: string) => call<{ days: Day[] }>('GET', `/api/consultations/manage/${enc(token)}/days?from=${from}&to=${to}`)
export const sendAction = (token: string, action: CustomerAction) => call<ActionResult>('POST', `/api/consultations/manage/${enc(token)}/actions`, action)

/** A key for one submission: the server answers a repeat of the same key with the booking it already made. */
export function newSubmissionKey(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
