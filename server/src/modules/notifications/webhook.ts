import { createHmac, timingSafeEqual } from 'node:crypto'
import type { AppContext } from '../../context.ts'
import { HttpError, notFound, unauthorized } from '../../http/errors.ts'
import { iso } from '../../lib/time.ts'
import { redactText } from '../../lib/logger.ts'
import { isRecord } from '../../lib/text.ts'

/**
 * What the provider tells us after it accepted a message: delivered, bounced, complained. The only way a message
 * ever becomes `delivered` here. The provider signs every event (Svix scheme: HMAC-SHA256 over `id.timestamp.body`
 * with the base64 key behind `whsec_`); an event whose signature does not verify, whose timestamp is old, or that
 * arrives with no secret configured is refused before anyone looks at it. A verified event is applied once (its id is
 * the key of `email_events`), in order of importance rather than of arrival (an older "sent" cannot undo "delivered";
 * "delivered" can still become "complained"), and only the minimum is kept: the event's type, id, time and which
 * message it was about — no address, no subject, no text.
 */

/** Events older (or newer) than this are not accepted: a recorded request replayed later must not work. */
export const TOLERANCE_SECONDS = 5 * 60

const header = (headers: Record<string, string | string[] | undefined>, name: string): string | null => {
  const value = headers[name]
  return typeof value === 'string' && value.length > 0 && value.length < 2048 ? value : null
}

/** Whether `rawBody` was signed by the holder of `secret` at about `nowMs`. Never throws on bad input: it just says no. */
export function verifySignature(secret: string, headers: Record<string, string | string[] | undefined>, rawBody: Buffer, nowMs: number): boolean {
  const id = header(headers, 'svix-id')
  const timestamp = header(headers, 'svix-timestamp')
  const signatures = header(headers, 'svix-signature')
  if (!id || !timestamp || !signatures || !secret.startsWith('whsec_')) return false
  if (!/^\d{1,12}$/.test(timestamp)) return false
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64')
  if (key.length === 0) return false
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest()
  // The header holds one or more `v1,<base64>` entries (several while a secret is being rotated): any one may match.
  for (const entry of signatures.split(' ')) {
    const [version, value] = entry.split(',')
    if (version !== 'v1' || !value) continue
    const given = Buffer.from(value, 'base64')
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true
  }
  return false
}

type Status = 'pending' | 'sending' | 'accepted' | 'delivered' | 'bounced' | 'complained' | 'failed' | 'cancelled'

/** What an event type means for a message's state; `null` for types that carry no state (opens, clicks, a delay). */
const EVENT_STATE: Record<string, Status | null> = {
  'email.sent': 'accepted',
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'failed',
}

const NEGATIVE = new Set<Status>(['bounced', 'complained', 'failed'])

/**
 * Whether a message in `current` may move to `next`. Good news (the provider has it, it was delivered) may lift a message
 * that is still waiting or that we gave up on (the provider did receive it after all); bad news (bounced, complained, failed) may
 * follow anything that is not already bad news, except that a complaint may follow a delivery. A cancelled message is
 * the record's owner's decision and stays cancelled.
 */
export function mayMove(current: Status, next: Status): boolean {
  if (current === next || current === 'cancelled') return false
  if (next === 'accepted') return current === 'pending' || current === 'sending' || current === 'failed'
  if (next === 'delivered') return current === 'pending' || current === 'sending' || current === 'accepted' || current === 'failed'
  if (next === 'complained') return current !== 'bounced'
  return !NEGATIVE.has(current)
}

export interface WebhookOutcome {
  duplicate: boolean
  outcome: 'applied' | 'ignored' | 'unmatched'
}

interface DeliveryState {
  id: string
  status: Status
  provider_message_id: string | null
}

function tagOf(data: Record<string, unknown>, name: string): string | null {
  const tags = data.tags
  if (isRecord(tags)) return typeof tags[name] === 'string' ? (tags[name] as string) : null
  if (Array.isArray(tags)) {
    const hit = tags.find((tag) => isRecord(tag) && tag.name === name)
    return isRecord(hit) && typeof hit.value === 'string' ? hit.value : null
  }
  return null
}

function reasonOf(type: string, data: Record<string, unknown>): { text: string; code: string } {
  const bounce = isRecord(data.bounce) ? data.bounce : null
  const failed = isRecord(data.failed) ? data.failed : null
  const raw = [bounce?.message, failed?.reason, data.reason].find((value): value is string => typeof value === 'string' && value.length > 0)
  const kind = typeof bounce?.type === 'string' ? ` (${bounce.type}${typeof bounce.subType === 'string' ? `, ${bounce.subType}` : ''})` : ''
  const text = redactText(raw ?? (type === 'email.complained' ? 'The recipient marked the message as spam.' : type === 'email.suppressed' ? 'The provider did not send the message: the address is on its suppression list.' : 'The provider reported the message as undeliverable.'))
  return { text: `${text}${kind}`.slice(0, 300), code: type === 'email.complained' ? 'complained' : type === 'email.suppressed' ? 'suppressed' : type === 'email.bounced' ? 'bounced' : 'provider_failed' }
}

/** Verifies and applies one webhook request. Throws `HttpError`s the route turns into answers; returns what it did. */
export function handleWebhook(app: AppContext, headers: Record<string, string | string[] | undefined>, rawBody: Buffer): WebhookOutcome {
  const secret = app.config.email.webhookSecret
  // No secret, no webhook: the address does not exist, rather than accepting anything.
  if (!secret) throw notFound('The address')
  if (!verifySignature(secret, headers, rawBody, app.clock.now().getTime())) {
    app.log.warn('e-mail webhook refused: the signature could not be verified')
    throw unauthorized('The signature of this request could not be verified.')
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    throw new HttpError(400, 'invalid_json', 'The request body is not valid JSON.')
  }
  if (!isRecord(payload) || typeof payload.type !== 'string' || !isRecord(payload.data)) throw new HttpError(400, 'invalid_json', 'The event is not in the expected shape.')
  const eventId = header(headers, 'svix-id') as string
  const type = payload.type.slice(0, 64)
  const data = payload.data
  const messageId = typeof data.email_id === 'string' ? data.email_id.slice(0, 128) : null
  const now = iso(app.clock.now())
  const occurred = typeof payload.created_at === 'string' && !Number.isNaN(Date.parse(payload.created_at)) ? iso(new Date(payload.created_at)) : now

  return app.db.transaction((): WebhookOutcome => {
    // The provider retries until it is answered, and may send an event twice: the second time changes nothing.
    if (app.db.get('SELECT 1 FROM email_events WHERE id = ?', [eventId])) return { duplicate: true, outcome: 'ignored' }

    const target = EVENT_STATE[type]
    let delivery: DeliveryState | null = null
    if (messageId || tagOf(data, 'delivery')) {
      // Our own label first (it is there even when the event beats the answer to our send), then the provider's id.
      const label = tagOf(data, 'delivery')
      if (label) delivery = app.db.get<DeliveryState>('SELECT id, status, provider_message_id FROM email_deliveries WHERE id = ?', [label]) ?? null
      if (delivery && delivery.provider_message_id && messageId && delivery.provider_message_id !== messageId) delivery = null
      if (!delivery && messageId) delivery = app.db.get<DeliveryState>('SELECT id, status, provider_message_id FROM email_deliveries WHERE provider_message_id = ?', [messageId]) ?? null
    }

    let outcome: WebhookOutcome['outcome'] = delivery ? 'ignored' : 'unmatched'
    if (delivery && target && mayMove(delivery.status, target)) {
      const reason = NEGATIVE.has(target) ? reasonOf(type, data) : null
      app.db.run(
        `UPDATE email_deliveries SET status = ?, provider_event = ?, provider_message_id = COALESCE(provider_message_id, ?),
           accepted_at = CASE WHEN ? IN ('accepted', 'delivered') THEN COALESCE(accepted_at, ?) ELSE accepted_at END,
           delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END,
           last_error = ?, error_code = ?, next_attempt_at = NULL, updated_at = ? WHERE id = ?`,
        [target, type, messageId, target, occurred, target, occurred, reason ? reason.text : null, reason ? reason.code : null, now, delivery.id],
      )
      outcome = 'applied'
      if (NEGATIVE.has(target)) app.notifier.reportDeliveryProblem(delivery.id)
    } else if (delivery && type === 'email.delivery_delayed') {
      // A temporary problem at the recipient's side: nothing changes except that the administrator can see it.
      app.db.run('UPDATE email_deliveries SET provider_event = ?, updated_at = ? WHERE id = ? AND status IN (\'accepted\', \'pending\', \'sending\')', [type, now, delivery.id])
    }
    app.db.run('INSERT INTO email_events (id, provider, event_type, delivery_id, provider_message_id, occurred_at, received_at, outcome) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [eventId, 'resend', type, delivery?.id ?? null, messageId, occurred, now, outcome])
    return { duplicate: false, outcome }
  })
}
