import type { GmailStatus } from '../api/types'
import { fill } from '../i18n'
import type { AdminText } from '../i18n/en'
import { describeError } from './errors'

/** What the Gmail panel says about the connection. Four states, and only these. */
export type GmailState = 'not_configured' | 'not_checked' | 'connected' | 'failed'

/**
 * The state, from the five fields the backend sends. A failure always comes with a category, so "configured, not connected, no
 * error" can only mean that nobody has asked Google yet.
 */
export function gmailState(status: GmailStatus): GmailState {
  if (!status.configured) return 'not_configured'
  if (status.connected) return 'connected'
  return status.lastError ? 'failed' : 'not_checked'
}

/** The categories the backend can send (server/src/modules/gmail/tokenService.ts); the dictionaries must word each one. */
export const GMAIL_ERROR_CATEGORIES = ['not_configured', 'invalid_credentials', 'invalid_grant', 'insufficient_scope', 'rate_limited', 'provider_unavailable', 'network', 'invalid_response'] as const

/** A sentence for an error category, in the administrator's language. A category from a newer backend is "unknown", never shown as it is. */
export function gmailErrorText(t: AdminText, category: string | null): string {
  const words = t.settings.gmail.errors as Record<string, string>
  return (category !== null && Object.prototype.hasOwnProperty.call(words, category) ? words[category] : undefined) ?? words.unknown
}

/** What a manual check came to: the status to show (null when the check could not be made at all) and the toast to raise. */
export interface GmailCheckOutcome {
  status: GmailStatus | null
  tone: 'success' | 'error'
  message: string
}

/**
 * Runs a check and words the result for the administrator. Never throws: a connection that does not work is an answer (the
 * status, with its error category), and a check that could not be made (the session ended, no permission, too many requests,
 * the server unreachable) becomes one sentence about that, with no status to replace the one on screen.
 */
export async function checkGmail(t: AdminText, check: () => Promise<{ data: GmailStatus }>): Promise<GmailCheckOutcome> {
  const g = t.settings.gmail
  try {
    const { data } = await check()
    if (data.connected) return { status: data, tone: 'success', message: g.checkOk }
    return { status: data, tone: 'error', message: fill(g.checkFailed, { reason: gmailErrorText(t, data.lastError) }) }
  } catch (error) {
    return { status: null, tone: 'error', message: describeError(t, error) }
  }
}

/** Where a screen remembers the call that is running (a `useRef` holds one). */
export interface RunningCall<T> {
  current: Promise<T> | null
}

/**
 * Runs a call unless one is already running in the slot, in which case it does nothing and returns the one under way. A
 * button that is pressed twice, or a key held down, sends one request; the next press is accepted once the call has finished,
 * whether it worked or not.
 */
export function runOnce<T>(slot: RunningCall<T>, run: () => Promise<T>): Promise<T> {
  slot.current ??= run().finally(() => {
    slot.current = null
  })
  return slot.current
}
