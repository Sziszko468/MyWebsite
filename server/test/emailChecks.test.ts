import { afterEach, describe, expect, it } from 'vitest'
import type { DnsResolver } from '../src/modules/notifications/checks.ts'
import { startServer, type TestServer } from './helpers.ts'
import { API_KEY, eventFor, signedEvent, WEBHOOK_SECRET } from './resendMock.ts'

/**
 * What the administration may say about the e-mail set-up. Each line is the answer to a question put to the
 * provider, the DNS, Cloudflare or the log of real messages: "verified" only when the answer proves it, "not verified" when it
 * proves the opposite, "unknown" when it could not be asked. A setting being present proves nothing. The lookups here are
 * stand-ins (a table of DNS records, a table of API answers), so these tests prove the reading of the answers, not the answers.
 */

type Records = { mx?: Record<string, string[]>; txt?: Record<string, string[]>; fail?: string[] }

const dnsOf = (records: Records): DnsResolver => ({
  async mx(name) {
    if (records.fail?.includes(name)) throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })
    return records.mx?.[name] ?? []
  },
  async txt(name) {
    if (records.fail?.includes(name)) throw Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })
    return records.txt?.[name] ?? []
  },
})

const GOOD_DNS: Records = {
  mx: { 'site.test': ['route1.mx.cloudflare.net', 'route2.mx.cloudflare.net', 'route3.mx.cloudflare.net'] },
  txt: {
    'site.test': ['v=spf1 include:_spf.mx.cloudflare.net ~all'],
    '_dmarc.site.test': ['v=DMARC1; p=none; rua=mailto:dmarc@site.test'],
    'resend._domainkey.site.test': ['p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDabcdefghijklmnopqrstuvwxyz0123456789'],
  },
}

const ZONE = 'a'.repeat(32)
const ACCOUNT = 'b'.repeat(32)

interface Answers {
  domains?: { status: number; body: unknown }
  routing?: { status: number; body: unknown }
  rules?: { status: number; body: unknown }
  addresses?: { status: number; body: unknown }
}

const fetchOf = (answers: Answers) => {
  const calls: { url: string; auth: string | null }[] = []
  const fetchLike = async (input: string, init: RequestInit = {}): Promise<Response> => {
    calls.push({ url: input, auth: new Headers(init.headers).get('authorization') })
    const pick = (answer: { status: number; body: unknown } | undefined) => new Response(JSON.stringify(answer?.body ?? {}), { status: answer?.status ?? 200, headers: { 'content-type': 'application/json' } })
    if (input.endsWith('/domains?limit=1') || input.endsWith('/domains')) return pick(answers.domains ?? { status: 200, body: { data: [{ name: 'site.test', status: 'verified' }] } })
    if (input.includes(`/zones/${ZONE}/email/routing/rules`)) return pick(answers.rules)
    if (input.includes(`/zones/${ZONE}/email/routing`)) return pick(answers.routing)
    if (input.includes(`/accounts/${ACCOUNT}/email/routing/addresses`)) return pick(answers.addresses)
    return new Response('{}', { status: 404 })
  }
  return { fetchLike, calls }
}

const READY = { status: 200, body: { result: { enabled: true, status: 'ready' } } }
const RULE = { status: 200, body: { result: [{ enabled: true, matchers: [{ type: 'literal', field: 'to', value: 'Hello@site.test' }], actions: [{ type: 'forward', value: ['me@private.test'] }] }] } }
const VERIFIED_ADDRESS = { status: 200, body: { result: [{ email: 'me@private.test', verified: '2026-11-01T10:00:00Z' }] } }

let server: TestServer

afterEach(async () => {
  await server?.close()
})

const env = (extra: Record<string, string> = {}) => ({
  EMAIL_PROVIDER: 'resend',
  EMAIL_API_KEY: API_KEY,
  EMAIL_API_URL: 'http://127.0.0.1:9',
  EMAIL_FROM: 'Site <notifications@site.test>',
  EMAIL_REPLY_TO: 'hello@site.test',
  NOTIFY_TO: 'owner@site.test',
  ...extra,
})

async function run(options: { env?: Record<string, string>; dns?: Records; answers?: Answers } = {}) {
  const { fetchLike, calls } = fetchOf(options.answers ?? {})
  server = await startServer({ env: env(options.env), fetch: fetchLike, dns: dnsOf(options.dns ?? GOOD_DNS) })
  const admin = await server.signIn()
  const response = await server.api('/api/admin/notifications/checks', { method: 'POST', headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }, body: {} })
  expect(response.status).toBe(200)
  const checks = Object.fromEntries((response.json.data.checks as { id: string; state: string; detail: string; checkedAt: string }[]).map((check) => [check.id, check]))
  return { checks, admin, calls, response }
}

describe('before anything has been asked', () => {
  it('shows no result at all, not a guess', async () => {
    server = await startServer({ env: env(), dns: dnsOf(GOOD_DNS) })
    const admin = await server.signIn()
    const overview = (await server.api('/api/admin/notifications', { headers: { Cookie: admin.cookie } })).json.data
    expect(overview.checks).toBeNull()
    // A secret being configured is a fact about the configuration, shown as that and nothing more.
    expect(overview.integration).toMatchObject({ provider: 'resend', webhookSecretSet: false, cloudflareApiSet: false })
  })
})

describe('the DNS lines', () => {
  it('verify a set-up that is in place, each with the time it was asked', async () => {
    const { checks, response } = await run()
    expect(checks.routing_dns.state).toBe('verified')
    expect(checks.routing_dns.detail).toContain('route1.mx.cloudflare.net')
    expect(checks.spf).toMatchObject({ state: 'verified' })
    expect(checks.spf.detail).toContain('_spf.mx.cloudflare.net')
    expect(checks.dkim.state).toBe('verified')
    expect(checks.dmarc.state).toBe('verified')
    expect(checks.dmarc.detail).toContain('p=none')
    expect(checks.dmarc.detail).toContain('monitoring only')
    for (const check of Object.values(checks)) expect(check.checkedAt).toBe(response.json.data.checkedAt)
  })

  it('cannot call routing verified when another mail server still receives the domain’s mail', async () => {
    const { checks } = await run({ dns: { ...GOOD_DNS, mx: { 'site.test': ['route1.mx.cloudflare.net', 'aspmx.l.google.com'] } } })
    expect(checks.routing_dns.state).toBe('not_verified')
    expect(checks.routing_dns.detail).toContain('aspmx.l.google.com')
  })

  it('says so when there is no MX at all', async () => {
    const { checks } = await run({ dns: { ...GOOD_DNS, mx: {} } })
    expect(checks.routing_dns).toMatchObject({ state: 'not_verified' })
    expect(checks.routing_dns.detail).toMatch(/no MX records/)
  })

  it('refuses two SPF records (receivers ignore both) and finds a missing one', async () => {
    const two = await run({ dns: { ...GOOD_DNS, txt: { ...GOOD_DNS.txt, 'site.test': ['v=spf1 include:_spf.mx.cloudflare.net ~all', 'v=spf1 include:amazonses.com ~all'] } } })
    expect(two.checks.spf.state).toBe('not_verified')
    expect(two.checks.spf.detail).toMatch(/2 SPF records/)
    await server.close()
    const none = await run({ dns: { ...GOOD_DNS, txt: { ...GOOD_DNS.txt, 'site.test': ['google-site-verification=abc'] } } })
    expect(none.checks.spf.state).toBe('not_verified')
  })

  it('finds a missing DMARC record, a duplicated one, and an enforcing policy', async () => {
    const missing = await run({ dns: { ...GOOD_DNS, txt: { ...GOOD_DNS.txt, '_dmarc.site.test': [] } } })
    expect(missing.checks.dmarc.state).toBe('not_verified')
    await server.close()
    const enforcing = await run({ dns: { ...GOOD_DNS, txt: { ...GOOD_DNS.txt, '_dmarc.site.test': ['v=DMARC1; p=reject'] } } })
    expect(enforcing.checks.dmarc.detail).toContain('p=reject')
    expect(enforcing.checks.dmarc.detail).toContain('enforcing')
  })

  it('finds a DKIM key only where it is published', async () => {
    const { checks } = await run({ dns: { ...GOOD_DNS, txt: { ...GOOD_DNS.txt, 'resend._domainkey.site.test': [] } } })
    expect(checks.dkim.state).toBe('not_verified')
    expect(checks.dkim.detail).toContain('resend._domainkey.site.test')
  })

  it('a lookup that fails is "unknown", never a guess either way', async () => {
    const { checks } = await run({ dns: { ...GOOD_DNS, fail: ['_dmarc.site.test'] } })
    expect(checks.dmarc.state).toBe('unknown')
    expect(checks.spf.state).toBe('verified')
  })

  it('has nothing to look up with no address to take the domain from', async () => {
    const { checks } = await run({ env: { EMAIL_PROVIDER: 'none', EMAIL_FROM: '', EMAIL_REPLY_TO: '', EMAIL_API_KEY: '' } })
    expect(checks.routing_dns.state).toBe('not_verified')
    expect(checks.routing_dns.detail).toMatch(/no public contact address/)
  })
})

describe('the provider lines', () => {
  it('verifies the key and the sending domain from what the provider itself says', async () => {
    const { checks, calls } = await run()
    expect(checks.provider.state).toBe('verified')
    expect(checks.provider_domain).toMatchObject({ state: 'verified' })
    expect(calls.every((call) => call.auth === `Bearer ${API_KEY}` || call.url.includes('cloudflare'))).toBe(true)
  })

  it('does not call a domain verified that the provider calls pending, or does not know', async () => {
    const pending = await run({ answers: { domains: { status: 200, body: { data: [{ name: 'site.test', status: 'pending' }] } } } })
    expect(pending.checks.provider_domain.state).toBe('not_verified')
    expect(pending.checks.provider_domain.detail).toContain('pending')
    await server.close()
    const unknown = await run({ answers: { domains: { status: 200, body: { data: [{ name: 'other.test', status: 'verified' }] } } } })
    expect(unknown.checks.provider_domain.state).toBe('not_verified')
    expect(unknown.checks.provider_domain.detail).toContain('no domain for site.test')
  })

  it('accepts a sender on a subdomain of the verified domain', async () => {
    const { checks } = await run({ env: { EMAIL_FROM: 'Site <notifications@mail.site.test>' } })
    expect(checks.provider_domain.state).toBe('verified')
  })

  it('a key that can only send cannot be asked about the account: unknown, with the reason, not "fine" and not "broken"', async () => {
    const { checks } = await run({ answers: { domains: { status: 401, body: { name: 'restricted_api_key', message: 'This API key is restricted to only send emails', statusCode: 401 } } } })
    expect(checks.provider.state).toBe('unknown')
    expect(checks.provider.detail).toMatch(/restricted to sending/)
    expect(checks.provider_domain.state).toBe('unknown')
  })

  it('a key the provider refuses is not verified', async () => {
    const { checks } = await run({ answers: { domains: { status: 401, body: { name: 'validation_error', message: 'API key is invalid', statusCode: 401 } } } })
    expect(checks.provider.state).toBe('not_verified')
    expect(checks.provider.detail).toMatch(/refused the API key/)
  })

  it('a provider that is having trouble is unknown', async () => {
    const { checks } = await run({ answers: { domains: { status: 503, body: {} } } })
    expect(checks.provider.state).toBe('unknown')
  })

  it('reports no provider, and a paused one, as what they are', async () => {
    const none = await run({ env: { EMAIL_PROVIDER: 'none', EMAIL_API_KEY: '' } })
    expect(none.checks.provider.state).toBe('not_verified')
    expect(none.checks.sending.state).toBe('not_verified')
    await server.close()
    const paused = await run({ env: { EMAIL_ENABLED: 'false' } })
    expect(paused.checks.provider.detail).toMatch(/paused/)
    expect(paused.checks.sending.detail).toMatch(/paused/)
  })
})

describe('Cloudflare Email Routing', () => {
  const cloudflare = { CLOUDFLARE_API_TOKEN: 'cf-test-token-0123456789', CLOUDFLARE_ZONE_ID: ZONE, CLOUDFLARE_ACCOUNT_ID: ACCOUNT }

  it('is unknown without read access: the server says what it cannot see rather than claiming it works', async () => {
    const { checks } = await run()
    expect(checks.routing_cloudflare.state).toBe('unknown')
    expect(checks.routing_cloudflare.detail).toMatch(/forwarding rule|dashboard/)
  })

  it('is verified when routing is ready, an enabled rule forwards the address, and the destination is verified', async () => {
    const { checks, calls } = await run({ env: cloudflare, answers: { routing: READY, rules: RULE, addresses: VERIFIED_ADDRESS } })
    expect(checks.routing_cloudflare.state).toBe('verified')
    expect(checks.routing_cloudflare.detail).toContain('hello@site.test')
    // Only reads, with the token as a bearer.
    expect(calls.filter((call) => call.url.includes('cloudflare.com')).every((call) => call.auth === 'Bearer cf-test-token-0123456789')).toBe(true)
  })

  it('is not verified when the destination mailbox has not been confirmed', async () => {
    const { checks } = await run({ env: cloudflare, answers: { routing: READY, rules: RULE, addresses: { status: 200, body: { result: [{ email: 'me@private.test', verified: null }] } } } })
    expect(checks.routing_cloudflare.state).toBe('not_verified')
    expect(checks.routing_cloudflare.detail).toMatch(/not verified yet/)
  })

  it('is not verified when no enabled rule matches the public address, or routing is not ready, or the token is refused', async () => {
    const noRule = await run({ env: cloudflare, answers: { routing: READY, rules: { status: 200, body: { result: [] } }, addresses: VERIFIED_ADDRESS } })
    expect(noRule.checks.routing_cloudflare.state).toBe('not_verified')
    expect(noRule.checks.routing_cloudflare.detail).toContain('No enabled forwarding rule')
    await server.close()
    const notReady = await run({ env: cloudflare, answers: { routing: { status: 200, body: { result: { enabled: true, status: 'misconfigured' } } } } })
    expect(notReady.checks.routing_cloudflare.state).toBe('not_verified')
    expect(notReady.checks.routing_cloudflare.detail).toContain('misconfigured')
    await server.close()
    const refused = await run({ env: cloudflare, answers: { routing: { status: 403, body: {} } } })
    expect(refused.checks.routing_cloudflare.state).toBe('not_verified')
    expect(refused.checks.routing_cloudflare.detail).toMatch(/refused the token/)
  })

  it('a disabled rule does not count', async () => {
    const disabled = { status: 200, body: { result: [{ enabled: false, matchers: [{ type: 'literal', field: 'to', value: 'hello@site.test' }], actions: [{ type: 'forward', value: ['me@private.test'] }] }] } }
    const { checks } = await run({ env: cloudflare, answers: { routing: READY, rules: disabled, addresses: VERIFIED_ADDRESS } })
    expect(checks.routing_cloudflare.state).toBe('not_verified')
  })

  it('never lets the token or the destination mailbox reach the browser', async () => {
    const { response } = await run({ env: cloudflare, answers: { routing: READY, rules: RULE, addresses: VERIFIED_ADDRESS } })
    expect(response.text).not.toContain('cf-test-token-0123456789')
    expect(response.text).not.toContain('me@private.test')
    expect(server.logs.join('\n')).not.toContain('cf-test-token-0123456789')
  })
})

describe('the webhook and the sending lines come from what really happened', () => {
  it('the webhook is verified only by a signed event that was actually received', async () => {
    const without = await run({ env: { EMAIL_WEBHOOK_SECRET: '' } })
    expect(without.checks.webhook.state).toBe('not_verified')
    expect(without.checks.webhook.detail).toMatch(/ever be shown as delivered/)
    await server.close()
    const first = await run({ env: { EMAIL_WEBHOOK_SECRET: WEBHOOK_SECRET } })
    expect(first.checks.webhook).toMatchObject({ state: 'unknown' })
    expect(first.checks.webhook.detail).toMatch(/no signed event has been received/)
    const event = signedEvent(eventFor('email.delivered', 'does-not-matter'), { at: server.clock.now() })
    expect((await server.api('/api/webhooks/email', { method: 'POST', headers: event.headers, raw: event.raw })).status).toBe(200)
    server.clock.advance(10_000)
    const admin = await server.signIn()
    const again = await server.api('/api/admin/notifications/checks', { method: 'POST', headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }, body: {} })
    expect(again.json.data.checks.find((check: { id: string }) => check.id === 'webhook').state).toBe('verified')
  })

  it('sending is unknown until a message went out, verified by an accepted one, and not verified by a failed one', async () => {
    const first = await run({ env: { EMAIL_PROVIDER: 'file', EMAIL_API_KEY: '', EMAIL_FILE_DIR: './data/test-mail-checks' } })
    expect(first.checks.sending.state).toBe('unknown')
    const stamp = server.clock.now().toISOString()
    const insert = (id: string, status: string, at: string, provider = 'file') => server.db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, provider, created_at, updated_at) VALUES (?, 'inquiry_status', 'inquiry', ?, 'a@example.com', 'en', ?, 1, ?, ?, ?)", [id, id, status, provider, at, at])
    const admin = first.admin
    const ask = async () => (await server.api('/api/admin/notifications/checks', { method: 'POST', headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }, body: {} })).json.data.checks.find((check: { id: string }) => check.id === 'sending')
    // What an EARLIER provider accepted (or a message from before providers were recorded) says nothing about this one.
    insert('older', 'accepted', stamp, 'smtp')
    server.db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, created_at, updated_at) VALUES ('oldest', 'inquiry_status', 'inquiry', 'oldest', 'a@example.com', 'en', 'accepted', 1, ?, ?)", [stamp, stamp])
    server.clock.advance(60_000)
    expect((await ask()).state).toBe('unknown')
    insert('ok', 'accepted', stamp)
    server.clock.advance(60_000)
    expect((await ask()).state).toBe('verified')
    server.clock.advance(60_000)
    insert('bad', 'failed', server.clock.now().toISOString())
    server.clock.advance(60_000)
    expect((await ask()).state).toBe('not_verified')
  })
})

describe('asking', () => {
  it('is for administrators with system access only, and goes in the audit log', async () => {
    const { admin } = await run()
    expect(server.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'notification.checks'")).toEqual({ n: 1 })
    const editor = await server.signIn('editor')
    const refused = await server.api('/api/admin/notifications/checks', { method: 'POST', headers: { Cookie: editor.cookie, 'X-CSRF-Token': editor.csrf }, body: {} })
    expect(refused.status).toBe(403)
    const anonymous = await server.api('/api/admin/notifications/checks', { method: 'POST', body: {} })
    expect(anonymous.status).toBe(401)
    void admin
  })

  it('is not repeated within a few seconds (the answers are public lookups and API calls), and remembers the last result', async () => {
    const { admin, calls } = await run()
    const before = calls.length
    const again = await server.api('/api/admin/notifications/checks', { method: 'POST', headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }, body: {} })
    expect(again.status).toBe(200)
    expect(calls.length).toBe(before)
    const overview = (await server.api('/api/admin/notifications', { headers: { Cookie: admin.cookie } })).json.data
    expect(overview.checks.checks).toHaveLength(9)
    server.clock.advance(6_000)
    await server.api('/api/admin/notifications/checks', { method: 'POST', headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }, body: {} })
    expect(calls.length).toBeGreaterThan(before)
  })
})
