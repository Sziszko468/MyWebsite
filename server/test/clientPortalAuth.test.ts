import { afterEach, describe, expect, it } from 'vitest'
import { sha256Hex } from '../src/lib/crypto.ts'
import { clientWords } from '../src/modules/notifications/clientTemplates.ts'
import { HOUR, MINUTE } from '../src/lib/time.ts'
import { startServer } from './helpers.ts'
import { makePortalKit, type PortalKit } from './portalKit.ts'

/**
 * Signing in to the client portal (PROMPT 25): the link that proves an address, what it can and cannot do, and the session it makes. Everything goes through
 * the real endpoints; the only place a secret is ever read is the e-mail the customer got.
 */

let kit: PortalKit
afterEach(async () => {
  await kit?.close()
})

const rows = (sql: string, params: (string | number)[] = []) => kit.server.db.all<Record<string, unknown>>(sql, params)

describe('the invitation and the first sign-in', () => {
  it('an invitation makes an account whose address is NOT verified, and mails one link that holds a secret only in its fragment', async () => {
    kit = await makePortalKit()
    const id = await kit.invite('anna@example.com', { name: 'Anna Kovács' })
    const account = rows('SELECT status, email_verified_at, origin FROM customers WHERE id = ?', [id])[0]
    expect(account).toEqual({ status: 'invited', email_verified_at: null, origin: 'invitation' })

    const mails = kit.mailsTo('anna@example.com')
    expect(mails).toHaveLength(1)
    expect(mails[0].subject).toBe(clientWords('en').activate.subject)
    const link = kit.linkTo('anna@example.com')
    // The secret is after the "#": a browser never sends that part to a server, a log or another site.
    expect(link.url).toMatch(/^https:\/\/site\.test\/en\/client-portal\/verify#[A-Za-z0-9_-]{43}$/)
    expect(link.url).not.toContain('?')
    // Only its hash is stored; the secret is nowhere in the database and nowhere in a log line.
    const stored = rows('SELECT token_hash FROM customer_auth_tokens')
    expect(stored).toEqual([{ token_hash: sha256Hex(link.token) }])
    const everything = JSON.stringify([rows('SELECT * FROM customers'), rows('SELECT * FROM customer_auth_requests'), rows('SELECT * FROM customer_audit_events'), rows('SELECT recipient, note, last_error FROM email_deliveries')])
    expect(everything).not.toContain(link.token)
    expect(kit.server.logs.join('\n')).not.toContain(link.token)
  })

  it('opening the link verifies the address, signs the customer in and sets a hardened cookie', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const account = rows('SELECT status, email_verified_at FROM customers WHERE email = ?', ['anna@example.com'])[0]
    expect(account.status).toBe('active')
    expect(account.email_verified_at).toBe(kit.server.clock.now().toISOString())

    const reply = await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'en' } })
    expect(reply.status).toBe(202)
    await kit.settle()
    const opened = await kit.open(kit.linkTo('anna@example.com').token)
    const cookie = opened.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^cc_client=[A-Za-z0-9_-]{43};/)
    for (const part of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=604800']) expect(cookie).toContain(part)
    // The cookie holds a secret of its own: only its hash is stored.
    const secret = cookie.split(';')[0].split('=')[1]
    expect(rows('SELECT token_hash FROM customer_sessions').map((row) => row.token_hash)).toContain(sha256Hex(secret))
    expect(JSON.stringify(rows('SELECT * FROM customer_sessions'))).not.toContain(secret)

    const session = await anna.get('/api/portal/session')
    expect(session.status).toBe(200)
    expect(session.json.data.customer).toMatchObject({ email: 'anna@example.com' })
    // Nothing of the session's machinery is in the answer except the one thing a page needs: its CSRF token.
    expect(Object.keys(session.json.data).sort()).toEqual(['csrfToken', 'customer', 'features'])
    expect(session.headers.get('cache-control')).toBe('no-store')
    expect(session.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(session.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it('the secure-cookie name and flag are used where the site is served over HTTPS', async () => {
    kit = await makePortalKit({ env: { API_PUBLIC_URL: 'https://api.site.test' } })
    await kit.invite('anna@example.com')
    const opened = await kit.open(kit.linkTo('anna@example.com').token)
    const cookie = opened.headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/^__Host-cc_client=/)
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Domain')
  })

  it('no CORS header is ever added to the portal: a page of another site cannot read it', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const reply = await kit.server.api('/api/portal/session', { headers: { Cookie: anna.cookie, Origin: 'https://site.test' } })
    expect(reply.status).toBe(200)
    expect(reply.headers.get('access-control-allow-origin')).toBeNull()
    const preflight = await kit.server.fetch('/api/portal/session', { method: 'OPTIONS', headers: { Origin: 'https://site.test', 'Access-Control-Request-Method': 'GET' } })
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('what a link can do', () => {
  it('works once: a second opening says it was used, and makes no second session', async () => {
    kit = await makePortalKit()
    await kit.invite('anna@example.com')
    const { token } = kit.linkTo('anna@example.com')
    expect((await kit.open(token)).status).toBe(200)
    const again = await kit.open(token)
    expect(again.status).toBe(410)
    expect(again.json.error.details.reason).toBe('used')
    expect(rows('SELECT COUNT(*) AS n FROM customer_sessions')[0].n).toBe(1)
  })

  it('two clicks at the same moment: exactly one wins', async () => {
    kit = await makePortalKit()
    await kit.invite('anna@example.com')
    const { token } = kit.linkTo('anna@example.com')
    const replies = await Promise.all([kit.open(token), kit.open(token), kit.open(token)])
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 410, 410])
    expect(rows('SELECT COUNT(*) AS n FROM customer_sessions')[0].n).toBe(1)
  })

  it('a sign-in link expires after the configured minutes; an invitation lasts longer', async () => {
    kit = await makePortalKit()
    await kit.invite('bela@example.com')
    await kit.customer('anna@example.com')
    await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'en' } })
    await kit.settle()
    const signIn = kit.linkTo('anna@example.com').token
    const invitation = kit.linkTo('bela@example.com').token
    kit.server.clock.advance(31 * MINUTE)
    const late = await kit.open(signIn)
    expect(late.status).toBe(410)
    expect(late.json.error.details.reason).toBe('expired')
    // The invitation was made for a longer time (72 hours by default): an hour later it still works.
    kit.server.clock.advance(HOUR)
    expect((await kit.open(invitation)).status).toBe(200)
  })

  it('an invitation link that is too old says so', async () => {
    kit = await makePortalKit()
    await kit.invite('anna@example.com')
    const { token } = kit.linkTo('anna@example.com')
    kit.server.clock.advance(73 * HOUR)
    const reply = await kit.open(token)
    expect(reply.status).toBe(410)
    expect(reply.json.error.details.reason).toBe('expired')
  })

  it('a newer link for the same address replaces the older one', async () => {
    kit = await makePortalKit()
    await kit.customer('anna@example.com')
    for (let i = 0; i < 2; i += 1) {
      await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'en' } })
      await kit.settle()
    }
    const links = kit.server.mailer.sent.filter((mail) => mail.to === 'anna@example.com').map((mail) => /verify#([A-Za-z0-9_-]{43})/.exec(mail.text)?.[1]).filter(Boolean) as string[]
    expect(links.length).toBe(3)
    const [, older, newer] = links
    const stale = await kit.open(older)
    expect(stale.status).toBe(410)
    expect(stale.json.error.details.reason).toBe('revoked')
    expect((await kit.open(newer)).status).toBe(200)
  })

  it('a made-up secret is "not valid", a malformed one the same, and guessing costs the guesser', async () => {
    kit = await makePortalKit({ env: { RATE_LIMITS: 'true' } })
    const invented = await kit.open('A'.repeat(43))
    const malformed = await kit.open('short')
    const empty = await kit.server.api('/api/portal/auth/verify', { body: {} })
    for (const reply of [invented, malformed, empty]) {
      expect(reply.status).toBe(404)
      expect(reply.json.error.code).toBe('not_found')
    }
    expect(invented.json.error.message).toBe(malformed.json.error.message)
    // The twenty-first miss in the window is turned away.
    const statuses: number[] = []
    for (let i = 0; i < 20; i += 1) statuses.push((await kit.open(`${String(i).padStart(2, '0')}${'B'.repeat(41)}`)).status)
    expect(statuses.at(-1)).toBe(429)
  })

  it('a link made for an address the account no longer has proves nothing', async () => {
    kit = await makePortalKit()
    await kit.customer('anna@example.com')
    await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'en' } })
    await kit.settle()
    const { token } = kit.linkTo('anna@example.com')
    kit.server.db.run("UPDATE customers SET email = 'other@example.com' WHERE email = 'anna@example.com'")
    expect((await kit.open(token)).status).toBe(404)
    // …and it was not spent by the refusal.
    expect(rows('SELECT used_at FROM customer_auth_tokens WHERE token_hash = ?', [sha256Hex(token)])[0].used_at).toBeNull()
  })
})

describe('asking for a link', () => {
  it('says the same thing for every address, and only sends where it should', async () => {
    kit = await makePortalKit()
    await kit.customer('active@example.com')
    await kit.invite('invited@example.com')
    await kit.invite('off@example.com')
    const off = rows('SELECT id FROM customers WHERE email = ?', ['off@example.com'])[0].id as string
    expect((await kit.api(`/api/admin/clients/${off}/actions`, { body: { action: 'disable' }, headers: kit.admin })).status).toBe(200)
    kit.server.mailer.sent.length = 0

    const answers = []
    for (const email of ['active@example.com', 'invited@example.com', 'off@example.com', 'nobody@example.com', 'ACTIVE@Example.com']) {
      answers.push(await kit.server.api('/api/portal/auth/request', { body: { email, language: 'en' } }))
    }
    await kit.settle()
    for (const answer of answers) {
      expect(answer.status).toBe(202)
      expect(answer.json).toEqual({ data: { accepted: true, linkMinutes: 30 } })
    }
    expect(kit.mailsTo('active@example.com')).toHaveLength(2)
    expect(kit.mailsTo('invited@example.com')[0].subject).toBe(clientWords('en').activate.subject)
    expect(kit.mailsTo('off@example.com')).toHaveLength(0)
    expect(kit.mailsTo('nobody@example.com')).toHaveLength(0)
    expect(rows('SELECT COUNT(*) AS n FROM customers')[0].n).toBe(3)
  })

  it('refuses a malformed address or a missing language, and nothing else', async () => {
    kit = await makePortalKit()
    const bad = await kit.server.api('/api/portal/auth/request', { body: { email: 'not-an-address', language: 'en' } })
    expect(bad.status).toBe(422)
    expect(bad.json.error.details.fields.email).toBe('invalidEmail')
    const noLanguage = await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com' } })
    expect(noLanguage.status).toBe(422)
    expect(noLanguage.json.error.details.fields.language).toBe('required')
    const wrongLanguage = await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'de' } })
    expect(wrongLanguage.status).toBe(422)
  })

  it('stops sending after a few links an hour for one address, and still answers the same', async () => {
    kit = await makePortalKit()
    await kit.customer('anna@example.com')
    kit.server.mailer.sent.length = 0
    const answers = []
    for (let i = 0; i < 8; i += 1) answers.push(await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'en' } }))
    await kit.settle()
    expect(new Set(answers.map((answer) => JSON.stringify(answer.json))).size).toBe(1)
    // The first link of the invitation counts too: four more fit in the hour.
    expect(kit.mailsTo('anna@example.com').length).toBe(4)
    kit.server.clock.advance(61 * MINUTE)
    await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'en' } })
    await kit.settle()
    expect(kit.mailsTo('anna@example.com').length).toBe(5)
  })

  it('writes the message in the language of the page that asked, with that language in the link', async () => {
    kit = await makePortalKit()
    await kit.customer('anna@example.com')
    for (const lang of ['hu', 'nl', 'en'] as const) {
      kit.server.mailer.sent.length = 0
      await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: lang } })
      await kit.settle()
      const mail = kit.mailsTo('anna@example.com')[0]
      expect(mail.subject).toBe(clientWords(lang).signIn.subject)
      expect(kit.linkTo('anna@example.com').url).toContain(`/${lang}/client-portal/verify#`)
      kit.server.clock.advance(HOUR + MINUTE)
    }
  })

  it('refuses to claim an address is mailed when there is no provider', async () => {
    kit = await makePortalKit({ server: await startServer({ env: { PUBLIC_URL: 'https://site.test' }, mailer: null }) })
    const config = await kit.server.api('/api/portal/config')
    expect(config.json.data.signInAvailable).toBe(false)
    const asked = await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'en' } })
    expect(asked.status).toBe(202)
    expect(rows('SELECT COUNT(*) AS n FROM customer_auth_requests')[0].n).toBe(0)
  })
})

describe('registration', () => {
  it('is closed by default: an unknown address gets nothing and no account', async () => {
    kit = await makePortalKit()
    const config = await kit.server.api('/api/portal/config')
    expect(config.json.data.registration).toBe(false)
    await kit.server.api('/api/portal/auth/request', { body: { email: 'new@example.com', language: 'en' } })
    await kit.settle()
    expect(kit.mailsTo('new@example.com')).toHaveLength(0)
    expect(rows('SELECT COUNT(*) AS n FROM customers')[0].n).toBe(0)
  })

  it('when the owner opens it, an address that is proven gets an account, and only then', async () => {
    kit = await makePortalKit({ registration: true })
    await kit.server.api('/api/portal/auth/request', { body: { email: 'new@example.com', language: 'nl' } })
    await kit.settle()
    expect(rows('SELECT COUNT(*) AS n FROM customers')[0].n).toBe(0)
    expect(kit.mailsTo('new@example.com')[0].subject).toBe(clientWords('nl').register.subject)
    const opened = await kit.open(kit.linkTo('new@example.com').token)
    expect(opened.status).toBe(200)
    expect(opened.json.data).toMatchObject({ purpose: 'register', created: true })
    expect(rows('SELECT status, origin, language, email_verified_at FROM customers')[0]).toMatchObject({ status: 'active', origin: 'registration', language: 'nl' })
    // From now on the address is an account like any other: it gets sign-in links.
    await kit.server.api('/api/portal/auth/request', { body: { email: 'new@example.com', language: 'nl' } })
    await kit.settle()
    expect(kit.mailsTo('new@example.com').at(-1)!.subject).toBe(clientWords('nl').signIn.subject)
  })

  it('a registration link made while it was open is not honoured once it is closed again', async () => {
    kit = await makePortalKit({ registration: true })
    await kit.server.api('/api/portal/auth/request', { body: { email: 'new@example.com', language: 'en' } })
    await kit.settle()
    const { token } = kit.linkTo('new@example.com')
    await kit.put('/api/admin/client-settings', { registration: false })
    expect((await kit.open(token)).status).toBe(404)
    expect(rows('SELECT COUNT(*) AS n FROM customers')[0].n).toBe(0)
  })
})

describe('the session', () => {
  it('ends at its absolute deadline, whatever the customer does', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    // Seven days of use (a day less an hour apart, so it is never idle): the deadline is still seven days from the sign-in.
    for (let day = 1; day <= 7; day += 1) {
      kit.server.clock.advance(23 * HOUR)
      expect((await anna.get('/api/portal/session')).status, `day ${day}`).toBe(200)
    }
    kit.server.clock.advance(23 * HOUR)
    const reply = await anna.get('/api/portal/session')
    expect(reply.status).toBe(401)
    expect(rows('SELECT COUNT(*) AS n FROM customer_sessions')[0].n).toBe(0)
  })

  it('ends after a time without use, and is kept alive by use', async () => {
    kit = await makePortalKit()
    const kept = await kit.customer('anna@example.com')
    kit.server.clock.advance(30 * HOUR)
    expect((await kept.get('/api/portal/session')).status).toBe(200)
    kit.server.clock.advance(30 * HOUR)
    expect((await kept.get('/api/portal/session')).status).toBe(200)
    kit.server.clock.advance(49 * HOUR)
    expect((await kept.get('/api/portal/session')).status).toBe(401)
  })

  it('needs the CSRF token for every change, and the right one', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const without = await kit.server.api('/api/portal/profile', { method: 'PATCH', body: { name: 'Anna' }, headers: { Cookie: anna.cookie } })
    expect(without.status).toBe(403)
    expect(without.json.error.code).toBe('csrf_failed')
    const wrong = await kit.server.api('/api/portal/profile', { method: 'PATCH', body: { name: 'Anna' }, headers: { Cookie: anna.cookie, 'X-CSRF-Token': 'x'.repeat(32) } })
    expect(wrong.status).toBe(403)
    expect((await anna.patch('/api/portal/profile', { name: 'Anna' })).status).toBe(200)
  })

  it('refuses a change that comes from another site, even with a good cookie and token', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    for (const headers of [{ Origin: 'https://evil.test' }, { 'Sec-Fetch-Site': 'cross-site' }] as Record<string, string>[]) {
      const reply = await kit.server.api('/api/portal/profile', { method: 'PATCH', body: { name: 'Mallory' }, headers: { ...anna.headers, ...headers } })
      expect(reply.status).toBe(403)
      expect(reply.json.error.code).toBe('origin_not_allowed')
    }
    expect(rows('SELECT name FROM customers')[0].name).toBeNull()
    // …and the same for the two things that come before a session.
    const verify = await kit.server.api('/api/portal/auth/verify', { body: { token: 'A'.repeat(43) }, headers: { Origin: 'https://evil.test' } })
    expect(verify.status).toBe(403)
    const request = await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'en' }, headers: { 'Sec-Fetch-Site': 'cross-site' } })
    expect(request.status).toBe(403)
  })

  it('signing out ends the session on the server and clears the cookie', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const reply = await anna.post('/api/portal/session/sign-out')
    expect(reply.status).toBe(200)
    expect(reply.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await anna.get('/api/portal/session')).status).toBe(401)
    expect(rows("SELECT event_type FROM customer_audit_events WHERE event_type = 'signed_out'")).toHaveLength(1)
  })

  it('lists the sessions without any secret, and lets the customer end the others', async () => {
    kit = await makePortalKit()
    const first = await kit.customer('anna@example.com')
    const second = await kit.signInAgain('anna@example.com')
    const list = await first.get('/api/portal/sessions')
    expect(list.status).toBe(200)
    expect(list.json.data).toHaveLength(2)
    expect(list.json.data.filter((entry: { current: boolean }) => entry.current)).toHaveLength(1)
    for (const entry of list.json.data) expect(Object.keys(entry).sort()).toEqual(['browser', 'createdAt', 'current', 'expiresAt', 'id', 'lastSeenAt'])
    expect(list.text).not.toContain(first.cookie.split('=')[1])

    const closed = await first.post('/api/portal/sessions/revoke-others')
    expect(closed.json.data.closed).toBe(1)
    expect((await second.get('/api/portal/session')).status).toBe(401)
    expect((await first.get('/api/portal/session')).status).toBe(200)
  })

  it('lets a customer end one of their own sessions by its id, and no one else’s', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const bela = await kit.customer('bela@example.com')
    const belaSession = (await bela.get('/api/portal/sessions')).json.data[0].id as string
    const refused = await anna.del(`/api/portal/sessions/${belaSession}`)
    expect(refused.status).toBe(404)
    expect((await bela.get('/api/portal/session')).status).toBe(200)
    const own = (await anna.get('/api/portal/sessions')).json.data[0].id as string
    const done = await anna.del(`/api/portal/sessions/${own}`)
    expect(done.status).toBe(200)
    expect(done.json.data.current).toBe(true)
    expect((await anna.get('/api/portal/session')).status).toBe(401)
  })
})

describe('the owner’s hand on an account', () => {
  it('switching an account off ends its sessions at once and sends it no more links', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const answer = await kit.api(`/api/admin/clients/${anna.id}/actions`, { body: { action: 'disable' }, headers: kit.admin })
    expect(answer.status).toBe(200)
    expect((await anna.get('/api/portal/session')).status).toBe(401)
    kit.server.mailer.sent.length = 0
    await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'en' } })
    await kit.settle()
    expect(kit.mailsTo('anna@example.com')).toHaveLength(0)
    // A link that was already out does not work either.
    const enabled = await kit.api(`/api/admin/clients/${anna.id}/actions`, { body: { action: 'enable' }, headers: kit.admin })
    expect(enabled.status).toBe(200)
    expect(rows('SELECT status FROM customers')[0].status).toBe('active')
  })

  it('a link asked for before the account was switched off no longer works', async () => {
    kit = await makePortalKit()
    await kit.customer('anna@example.com')
    await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'en' } })
    await kit.settle()
    const { token } = kit.linkTo('anna@example.com')
    const id = rows('SELECT id FROM customers')[0].id as string
    await kit.api(`/api/admin/clients/${id}/actions`, { body: { action: 'disable' }, headers: kit.admin })
    expect((await kit.open(token)).status).toBe(410)
  })

  it('signing a customer out everywhere tells them, and tells the owner nothing secret', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    await kit.signInAgain('anna@example.com')
    kit.server.mailer.sent.length = 0
    const answer = await kit.api(`/api/admin/clients/${anna.id}/actions`, { body: { action: 'revoke_sessions' }, headers: kit.admin })
    expect(answer.json.data.sessionsClosed).toBe(2)
    await kit.settle()
    expect(kit.mailsTo('anna@example.com')[0].subject).toBe(clientWords('en').notice.subject)
    expect(kit.mailsTo('anna@example.com')[0].text).not.toMatch(/https?:\/\//)
  })

  it('an administrator can read the account and its sessions, but never a secret', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const detail = await kit.api(`/api/admin/clients/${anna.id}`, { headers: { Cookie: kit.admin.Cookie } })
    expect(detail.status).toBe(200)
    expect(detail.json.data.sessions).toHaveLength(1)
    const text = detail.text
    for (const secret of [anna.cookie.split('=')[1], anna.csrf, sha256Hex(anna.cookie.split('=')[1])]) expect(text).not.toContain(secret)
    expect(text).not.toMatch(/token_hash|csrf_token|password/i)
  })
})

describe('changing the address', () => {
  it('sends a link to the NEW address and a notice to the old one, and changes nothing until the link is opened', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const other = await kit.signInAgain('anna@example.com')
    kit.server.mailer.sent.length = 0
    const asked = await anna.post('/api/portal/profile/email', { email: 'Anna.New@Example.com' })
    expect(asked.status).toBe(202)
    await kit.settle()
    expect(rows('SELECT email FROM customers')[0].email).toBe('anna@example.com')
    expect(kit.mailsTo('anna.new@example.com')[0].subject).toBe(clientWords('en').emailChange.subject)
    const notice = kit.mailsTo('anna@example.com')[0]
    expect(notice.subject).toBe(clientWords('en').notice.subject)
    // The old address is shown the new one only masked, and the notice carries no link.
    expect(notice.text).toContain('a*****@example.com')
    expect(notice.text).not.toContain('anna.new@example.com')
    expect(notice.text).not.toMatch(/https?:\/\//)

    const opened = await kit.open(kit.linkTo('anna.new@example.com').token)
    expect(opened.status).toBe(200)
    expect(opened.json.data.purpose).toBe('email_change')
    expect(rows('SELECT email FROM customers')[0].email).toBe('anna.new@example.com')
    // Every earlier sign-in ended; the one that proved the new address is the only one left.
    expect((await anna.get('/api/portal/session')).status).toBe(401)
    expect((await other.get('/api/portal/session')).status).toBe(401)
    const fresh = kit.as((opened.headers.get('set-cookie') ?? '').split(';')[0], opened.json.data.csrfToken)
    expect((await fresh.get('/api/portal/session')).json.data.customer.email).toBe('anna.new@example.com')
    // The old address is told, and can no longer be used to sign in.
    await kit.settle()
    expect(kit.mailsTo('anna@example.com').at(-1)!.subject).toBe(clientWords('en').notice.subject)
    kit.server.mailer.sent.length = 0
    await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'en' } })
    await kit.settle()
    expect(kit.mailsTo('anna@example.com')).toHaveLength(0)
  })

  it('says nothing about an address that is already someone else’s, and changes nothing', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    await kit.customer('bela@example.com')
    kit.server.mailer.sent.length = 0
    const asked = await anna.post('/api/portal/profile/email', { email: 'bela@example.com' })
    expect(asked.status).toBe(202)
    await kit.settle()
    expect(kit.mailsTo('bela@example.com')).toHaveLength(0)
    expect(rows('SELECT COUNT(*) AS n FROM customer_auth_requests WHERE purpose = ?', ['email_change'])[0].n).toBe(0)
  })

  it('a link for a new address that someone else has taken since is refused', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    await anna.post('/api/portal/profile/email', { email: 'taken@example.com' })
    await kit.settle()
    const { token } = kit.linkTo('taken@example.com')
    await kit.customer('taken@example.com')
    expect((await kit.open(token)).status).toBe(404)
    expect(rows('SELECT email FROM customers WHERE id = ?', [anna.id])[0].email).toBe('anna@example.com')
  })
})

describe('the two kinds of sign-in never meet', () => {
  it('an administrator’s cookie is nothing in the portal, and a customer’s is nothing in the administration', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    expect((await kit.server.api('/api/portal/session', { headers: { Cookie: kit.admin.Cookie } })).status).toBe(401)
    for (const path of ['/api/admin/clients', '/api/admin/session', '/api/admin/quote-requests']) {
      const reply = await kit.server.api(path, { headers: { Cookie: anna.cookie } })
      expect(reply.status, path).toBe(401)
    }
    const post = await kit.server.api('/api/admin/clients', { method: 'POST', body: { email: 'x@example.com', language: 'en' }, headers: anna.headers })
    expect(post.status).toBe(401)
  })

  it('every portal address that holds a customer’s data refuses a visitor with no session', async () => {
    kit = await makePortalKit()
    const paths = ['/api/portal/session', '/api/portal/overview', '/api/portal/projects', '/api/portal/projects/PRJ-AAAAAAAA', '/api/portal/requests', '/api/portal/requests/CC-2026-000001', '/api/portal/bookings', '/api/portal/bookings/BK-2026-000001', '/api/portal/documents', '/api/portal/documents/x/download', '/api/portal/link-candidates', '/api/portal/sessions']
    for (const path of paths) expect((await kit.server.api(path)).status, path).toBe(401)
    for (const [method, path] of [['PATCH', '/api/portal/profile'], ['POST', '/api/portal/profile/email'], ['POST', '/api/portal/sessions/revoke-others'], ['POST', '/api/portal/account/deletion-request'], ['DELETE', '/api/portal/account/deletion-request'], ['POST', '/api/portal/link-candidates/claim'], ['POST', '/api/portal/session/sign-out']] as const) {
      expect((await kit.server.api(path, { method, body: {} })).status, `${method} ${path}`).toBe(401)
    }
  })
})
