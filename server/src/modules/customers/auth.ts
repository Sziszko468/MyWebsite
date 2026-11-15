import { LANGUAGES, type Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { HttpError } from '../../http/errors.ts'
import { newId, randomToken, sha256Hex } from '../../lib/crypto.ts'
import { addMs, HOUR, iso, MINUTE } from '../../lib/time.ts'
import { Fields, isEmail } from '../../lib/validate.ts'
import { normalizeEmail } from '../auth/users.ts'
import { findCustomerByEmail, getCustomer, insertCustomer, isDuplicate, portalSettings, recordAudit } from './accounts.ts'
import { queueClientMail } from './mail.ts'
import type { AuthPurpose, AuthRequestRow, CustomerRow } from './model.ts'
import { revokeClientSessions, startClientSession } from './sessions.ts'

/**
 * Signing in without a password. A customer gives an address; if it belongs to an account (or registration is open) a link is e-mailed to it; opening the
 * link, which proves they can read that mailbox, signs them in. There is no password to steal, reuse, guess or reset, and "I lost access" and "I forgot my
 * password" are the same thing: ask for a new link.
 *
 * What makes the links safe:
 *  - the secret is 256 random bits (base64url, 43 characters), made when the e-mail is written and shown only inside it; the database keeps its SHA-256;
 *  - it works once (the update that spends it is also the check, so two clicks cannot both win) and for a short time;
 *  - a newer link for the same address replaces the older ones;
 *  - the link carries the secret after a `#`, which a browser never sends to a server, a log or another site;
 *  - asking for a link says the same thing whether or not the address has an account, and a wrong or spent secret costs the guesser (a rate limit).
 */

export const SHAPE = /^[A-Za-z0-9_-]{43}$/
/** How many links one address may ask for in an hour. Past it nothing more is sent and nothing is said: the answer is the same. */
export const LINKS_PER_ADDRESS_PER_HOUR = 5

const invalid = () => new HttpError(404, 'not_found', 'This link is not valid.')
const gone = (reason: 'expired' | 'used' | 'revoked') => new HttpError(410, 'gone', reason === 'expired' ? 'This link has expired.' : reason === 'used' ? 'This link was already used.' : 'This link has been replaced.', { details: { reason } })

/** A made-up or wrong secret costs the asker: after a handful they wait. */
function missed(app: AppContext, ip: string): never {
  app.limiters.check('tokenMiss', ip)
  throw invalid()
}

export function parseLinkRequest(body: Record<string, unknown>): { email: string; language: Language } {
  const fields = new Fields(body)
  const typed = fields.text('email', { max: 254, required: true }, (value) => (isEmail(normalizeEmail(value)) ? undefined : 'invalidEmail'))
  const language = fields.oneOf('language', LANGUAGES, { required: true })
  fields.done()
  return { email: normalizeEmail(typed ?? ''), language: language as Language }
}

/** Whether a link can be sent at all: a provider and a sender, and the site's address for the link. */
export const canSendLinks = (app: AppContext): boolean => app.notifier.enabled && app.config.publicUrl !== null

interface TokenRow {
  id: string
  token_hash: string
  request_id: string
  created_at: string
  expires_at: string
  used_at: string | null
  revoked_at: string | null
}

/** Records that a link was asked for and queues the e-mail. The caller has decided that this address may have one. Returns whether a message was queued. */
export function createLinkRequest(app: AppContext, input: { purpose: AuthPurpose; customerId: string | null; email: string; language: Language; ipHash: string | null }): boolean {
  const id = newId()
  return app.db.transaction(() => {
    app.db.run('INSERT INTO customer_auth_requests (id, purpose, customer_id, email, language, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, input.purpose, input.customerId, normalizeEmail(input.email), input.language, input.ipHash, iso(app.clock.now())])
    const kind = input.purpose === 'sign_in' ? 'client_sign_in' : input.purpose === 'activate' ? 'client_activate' : input.purpose === 'register' ? 'client_register' : 'client_email_change'
    return queueClientMail(app, { kind, relatedType: 'client_auth', relatedId: id, recipient: normalizeEmail(input.email), language: input.language })
  })
}

/**
 * "Send me a link." The caller always answers the same way. What is sent depends on what exists: an account that was verified gets a sign-in link, one that
 * was invited and never opened gets an activation link, an unknown address gets a registration link only while the owner has registration open, and a
 * switched-off account gets nothing. At most a few links per address an hour.
 */
export function requestLink(app: AppContext, input: { email: string; language: Language }, ipHash: string): void {
  if (!canSendLinks(app)) return
  const address = normalizeEmail(input.email)
  const since = iso(addMs(app.clock.now(), -HOUR))
  const recent = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM customer_auth_requests WHERE email = ? COLLATE NOCASE AND created_at >= ?', [address, since])?.n ?? 0
  if (recent >= LINKS_PER_ADDRESS_PER_HOUR) {
    app.log.warn('sign-in link skipped: this address has had its share this hour')
    return
  }
  const customer = findCustomerByEmail(app, address)
  let purpose: AuthPurpose | null = null
  if (customer) purpose = customer.status === 'active' ? 'sign_in' : customer.status === 'invited' ? 'activate' : null
  else if (portalSettings(app).registration) purpose = 'register'
  if (!purpose) return
  createLinkRequest(app, { purpose, customerId: customer?.id ?? null, email: address, language: input.language, ipHash })
}

/**
 * The secret of one link, made when its e-mail is written. Earlier unused links for the same address (or, for an address change, of the same account) are
 * revoked first: only the newest one works. Returns the secret, which goes into the message and nowhere else.
 */
export function mintLinkToken(app: Pick<AppContext, 'db' | 'clock' | 'config'>, request: AuthRequestRow): { token: string; expiresAt: string } {
  const now = app.clock.now()
  const token = randomToken(32)
  const ttl = request.purpose === 'activate' ? app.config.client.inviteHours * HOUR : app.config.client.linkMinutes * MINUTE
  const expiresAt = iso(addMs(now, ttl))
  app.db.transaction(() => {
    if (request.purpose === 'email_change') {
      app.db.run("UPDATE customer_auth_tokens SET revoked_at = ? WHERE used_at IS NULL AND revoked_at IS NULL AND request_id IN (SELECT id FROM customer_auth_requests WHERE purpose = 'email_change' AND customer_id = ?)", [iso(now), request.customer_id])
    } else {
      app.db.run("UPDATE customer_auth_tokens SET revoked_at = ? WHERE used_at IS NULL AND revoked_at IS NULL AND request_id IN (SELECT id FROM customer_auth_requests WHERE purpose IN ('sign_in', 'activate', 'register') AND email = ? COLLATE NOCASE)", [iso(now), request.email])
    }
    app.db.run('INSERT INTO customer_auth_tokens (id, token_hash, request_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)', [newId(), sha256Hex(token), request.id, iso(now), expiresAt])
  })
  return { token, expiresAt }
}

export interface Verified {
  purpose: AuthPurpose
  customer: CustomerRow
  created: boolean
  session: { token: string; csrfToken: string; maxAgeSeconds: number }
}

/** What opening a link does. Everything happens in one transaction: the link is spent, the account changes and the sign-in is made, or none of it. */
export function verifyLink(app: AppContext, raw: string, ip: string, ipHash: string, userAgent: string): Verified {
  if (typeof raw !== 'string' || !SHAPE.test(raw)) return missed(app, ip)
  const token = app.db.get<TokenRow>('SELECT * FROM customer_auth_tokens WHERE token_hash = ?', [sha256Hex(raw)])
  if (!token) return missed(app, ip)
  if (token.revoked_at) throw gone('revoked')
  if (token.used_at) throw gone('used')
  if (token.expires_at <= iso(app.clock.now())) throw gone('expired')
  const request = app.db.get<AuthRequestRow>('SELECT * FROM customer_auth_requests WHERE id = ?', [token.request_id])
  if (!request) return missed(app, ip)

  return app.db.transaction(() => {
    const now = iso(app.clock.now())
    // The update is the check: of two simultaneous clicks exactly one spends the link, and a failure below puts it back.
    if (app.db.run('UPDATE customer_auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?', [now, token.id, now]).changes !== 1) throw gone('used')

    let customer: CustomerRow
    let created = false
    if (request.purpose === 'email_change') {
      const current = request.customer_id ? getCustomer(app, request.customer_id) : undefined
      if (!current || current.status !== 'active') throw invalid()
      const taken = findCustomerByEmail(app, request.email)
      if (taken && taken.id !== current.id) throw invalid()
      if (current.email.toLowerCase() === request.email.toLowerCase()) throw invalid()
      const previous = current.email
      app.db.run('UPDATE customers SET email = ?, email_verified_at = ?, updated_at = ? WHERE id = ?', [request.email, now, now, current.id])
      // Every other sign-in and every link still waiting ends: they were for the old address.
      revokeClientSessions(app, current.id)
      app.db.run('UPDATE customer_auth_tokens SET revoked_at = ? WHERE used_at IS NULL AND revoked_at IS NULL AND request_id IN (SELECT id FROM customer_auth_requests WHERE customer_id = ?)', [now, current.id])
      const auditId = recordAudit(app, { customerId: current.id, type: 'email_changed', actor: { type: 'customer', id: current.id }, detail: 'new_address_verified' })
      // The old address is told, in the account's language: a change nobody asked for must not go unnoticed.
      queueClientMail(app, { kind: 'client_security_notice', relatedType: 'client_audit', relatedId: String(auditId), recipient: previous, language: current.language })
      customer = getCustomer(app, current.id)!
    } else {
      const existing = request.customer_id ? getCustomer(app, request.customer_id) : findCustomerByEmail(app, request.email)
      if (existing) {
        // The link was e-mailed to the address the account has now: a link made for an address the account no longer has proves nothing.
        if (existing.email.toLowerCase() !== request.email.toLowerCase() || existing.status === 'disabled') throw invalid()
        customer = existing
      } else {
        // A registration link: the account is made now, with an address that was just proven. Closed registration means a link made before it closed is not honoured.
        if (request.purpose !== 'register' || !portalSettings(app).registration) throw invalid()
        try {
          customer = insertCustomer(app, { email: request.email, language: request.language, status: 'active', origin: 'registration', verified: true })
        } catch (error) {
          if (!isDuplicate(error)) throw error
          throw invalid()
        }
        created = true
        recordAudit(app, { customerId: customer.id, type: 'registered', actor: { type: 'customer', id: customer.id } })
      }
      if (customer.status === 'invited') {
        app.db.run("UPDATE customers SET status = 'active', email_verified_at = ?, updated_at = ? WHERE id = ?", [now, now, customer.id])
        recordAudit(app, { customerId: customer.id, type: 'verified', actor: { type: 'customer', id: customer.id } })
        customer = getCustomer(app, customer.id)!
      }
    }
    const session = startClientSession(app, customer.id, ipHash, userAgent)
    recordAudit(app, { customerId: customer.id, type: 'signed_in', actor: { type: 'customer', id: customer.id } })
    return { purpose: request.purpose, customer, created, session }
  })
}

/** Housekeeping: spent and expired secrets and the requests behind them, a month after they stopped mattering. */
export function purgeAuth(app: AppContext): number {
  const cutoff = iso(addMs(app.clock.now(), -30 * 24 * HOUR))
  app.db.run('DELETE FROM customer_auth_tokens WHERE expires_at < ?', [cutoff])
  return app.db.run('DELETE FROM customer_auth_requests WHERE created_at < ? AND NOT EXISTS (SELECT 1 FROM customer_auth_tokens t WHERE t.request_id = customer_auth_requests.id)', [cutoff]).changes
}
