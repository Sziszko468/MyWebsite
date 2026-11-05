import type { EmailConfig } from '../../config.ts'
import { assertSingleLine, splitSender, type MailMessage } from './mime.ts'
import { MailError } from './smtp.ts'
import type { Mailer } from './mailer.ts'

/**
 * The transactional provider (Resend), over its HTTPS API: one `POST /emails` per message. The provider's API key
 * is sent only here, in a header, and appears in no log and no answer. The request carries an idempotency key, so a
 * message the provider received whose answer we never saw (a timeout) is not sent twice when we try again.
 *
 * What the provider answers is sorted into "may pass" (try again later: its own trouble, a busy moment, a
 * request it was still working on) and "will not pass" (the key or the sender is not accepted, the address is
 * refused, the quota is used up: waiting does not help, the administrator has to). A `201` means the provider has
 * **accepted** the message; it says nothing about delivery, which only a signed webhook may say.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

const TIMEOUT_MS = 15_000

/** The error object of an answer, whichever of the field names the API used. */
function describe(body: unknown): { name: string; message: string } {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const inner = typeof record.error === 'object' && record.error !== null ? (record.error as Record<string, unknown>) : record
  const name = [inner.name, inner.code, inner.type].find((value): value is string => typeof value === 'string') ?? ''
  const message = typeof inner.message === 'string' ? inner.message : ''
  return { name, message }
}

/** Turns an unsuccessful answer into a `MailError` that says whether trying again can help. Exported for the tests. */
export function failureOf(status: number, body: unknown, retryAfter: string | null): MailError {
  const { name, message } = describe(body)
  const text = `The provider answered ${status}${name ? ` (${name})` : ''}${message ? `: ${message}` : ''}`
  if (status === 429) {
    // A used-up quota does not pass by waiting a few minutes; a burst does.
    if (/quota/i.test(name)) return new MailError(text, { transient: false, code: status, reason: 'quota' })
    return new MailError(`${text}${retryAfter ? ` (retry after ${retryAfter}s)` : ''}`, { transient: true, code: status, reason: 'rate_limited' })
  }
  if (status === 409) {
    // Another request with the same key is still in progress: it may yet succeed, try again later. A key reused with a different message is a bug, not a delay.
    if (/concurrent/i.test(name) || /resource_locked/i.test(name)) return new MailError(text, { transient: true, code: status, reason: 'conflict' })
    return new MailError(text, { transient: false, code: status, reason: 'rejected' })
  }
  if (status === 401 || status === 403) {
    // A key that is wrong, restricted to something else, suspended, or a sender that is not allowed: the administrator has to change something.
    return new MailError(text, { transient: false, code: status, reason: 'auth' })
  }
  if (status >= 500) return new MailError(text, { transient: true, code: status, reason: 'unavailable' })
  // 400, 404, 405, 422: the request itself was refused (an address that is not one, a missing field). The same request will be refused again.
  return new MailError(text, { transient: false, code: status, reason: 'rejected' })
}

export function createResendMailer(config: EmailConfig, fetchImpl: FetchLike = (input, init) => fetch(input, init)): Mailer {
  const apiKey = config.apiKey
  if (!apiKey) throw new Error('A resend mailer needs EMAIL_API_KEY.')
  const endpoint = `${config.apiUrl}/emails`
  return {
    name: 'resend',
    async send(message: MailMessage) {
      // The same refusal of line breaks the SMTP path has: nothing that came from a visitor may add a header.
      assertSingleLine(message.subject, 'The subject')
      const to = splitSender(message.to).address
      const replyTo = message.replyTo ? splitSender(message.replyTo).address : null
      const body = {
        from: message.from,
        to: [to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(replyTo ? { reply_to: replyTo } : {}),
        // Not a bulk or marketing message: tell autoresponders (out-of-office replies) to leave it alone.
        headers: { 'X-Auto-Response-Suppress': 'All' },
        ...(message.tags ? { tags: Object.entries(message.tags).map(([name, value]) => ({ name, value })) } : {}),
      }
      const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' }
      if (message.idempotencyKey) headers['Idempotency-Key'] = message.idempotencyKey.slice(0, 256)

      let response: Response
      try {
        response = await fetchImpl(endpoint, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) })
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        throw new MailError(timedOut ? 'The provider did not answer in time.' : 'The provider could not be reached.', { transient: true, reason: timedOut ? 'timeout' : 'network' })
      }
      let payload: unknown = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) throw failureOf(response.status, payload, response.headers.get('retry-after'))
      const id = typeof payload === 'object' && payload !== null && typeof (payload as { id?: unknown }).id === 'string' ? (payload as { id: string }).id : null
      // A success without an id cannot be matched to a later event: still accepted, but say so in the log of whoever reads it.
      return { providerMessageId: id }
    },
  }
}
