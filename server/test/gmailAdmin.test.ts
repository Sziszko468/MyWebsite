import { afterEach, describe, expect, it } from 'vitest'
import { GMAIL_SCOPES } from '../src/modules/gmail/tokenService.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * Gmail, step 2: the administration's view of the connection (`GET /api/admin/gmail/status`, `POST /api/admin/gmail/check`).
 * Google is a stand-in handed to the server as its `fetch`, so no request leaves the machine and every credential is made up.
 */

const CLIENT_ID = 'gmail-admin-client-1234.apps.googleusercontent.com'
const CLIENT_SECRET = 'GOCSPX-admin-test-client-secret-VALUE-1'
const REFRESH_TOKEN = '1//0g-admin-test-refresh-token-VALUE-2'
const ACCESS_TOKEN = 'ya29.admin-test-access-token-VALUE-3'
const ACCOUNT = 'mailbox@site.test'
const GMAIL_ENV = { GMAIL_CLIENT_ID: CLIENT_ID, GMAIL_CLIENT_SECRET: CLIENT_SECRET, GMAIL_REFRESH_TOKEN: REFRESH_TOKEN, GMAIL_ACCOUNT_EMAIL: ACCOUNT }
const SECRETS = [CLIENT_SECRET, REFRESH_TOKEN, ACCESS_TOKEN]

type Step = () => Response | Error
const reply = (status: number, body: unknown): Response => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const goodAnswer = () => reply(200, { access_token: ACCESS_TOKEN, expires_in: 3599, scope: GMAIL_SCOPES.join(' '), token_type: 'Bearer' })

/** Google, as the server's `fetch`: the n-th request to it gets the n-th step (the last repeats). */
function fakeGoogle(...steps: Step[]) {
  const calls: string[] = []
  const fetch = async (input: string): Promise<Response> => {
    calls.push(input)
    const result = steps[Math.min(calls.length - 1, steps.length - 1)]!()
    if (result instanceof Error) throw result
    return result
  }
  return { calls, fetch }
}

let server: TestServer | null = null
afterEach(async () => {
  await server?.close()
  server = null
})

async function setup(options: { env?: Record<string, string>; steps?: Step[] } = {}) {
  const google = fakeGoogle(...(options.steps ?? [goodAnswer]))
  server = await startServer({ env: { ...GMAIL_ENV, ...options.env }, fetch: google.fetch })
  const admin = await server.signIn('admin', 'admin@site.test')
  const headers = (who = admin) => ({ Cookie: who.cookie, 'X-CSRF-Token': who.csrf })
  return {
    s: server,
    google,
    admin,
    status: (who = admin) => server!.api('/api/admin/gmail/status', { headers: { Cookie: who.cookie } }),
    check: (who = admin) => server!.api('/api/admin/gmail/check', { method: 'POST', body: {}, headers: headers(who) }),
  }
}

const audits = (s: TestServer) => s.db.all<{ action: string; detail: string | null }>("SELECT action, detail FROM audit_log WHERE action LIKE 'gmail.%' ORDER BY id")

/** Nothing of the credentials, the tokens or the logs' view of them in any text the test collected. */
function expectNoSecrets(label: string, ...texts: string[]) {
  const text = texts.join('\n')
  for (const secret of [...SECRETS, CLIENT_ID]) expect(text, `${label}: ${secret}`).not.toContain(secret)
}

describe('Gmail status for the administrator', () => {
  it('says "not configured" when no Gmail setting exists, and never asks Google', async () => {
    const t = await setup({ env: { GMAIL_CLIENT_ID: '', GMAIL_CLIENT_SECRET: '', GMAIL_REFRESH_TOKEN: '', GMAIL_ACCOUNT_EMAIL: '' } })
    const status = await t.status()
    expect(status.status).toBe(200)
    expect(status.json.data).toEqual({ configured: false, connected: false, accountEmail: null, lastError: 'not_configured', checkedAt: null })
    const check = await t.check()
    expect(check.status).toBe(200)
    expect(check.json.data).toEqual(status.json.data)
    expect(t.google.calls).toHaveLength(0)
    expect(audits(t.s), 'a check that asked nobody leaves no trace').toEqual([])
  })

  it('says "not configured" for a half-set configuration, and does not show the half it has', async () => {
    const t = await setup({ env: { GMAIL_CLIENT_SECRET: '' } })
    const status = await t.status()
    expect(status.json.data).toMatchObject({ configured: false, connected: false, lastError: 'not_configured' })
    await t.check()
    expect(t.google.calls).toHaveLength(0)
    expectNoSecrets('half-set', status.text)
  })

  it('says "configured, not checked" until a check has been made, without asking Google', async () => {
    const t = await setup()
    const status = await t.status()
    expect(status.json.data).toEqual({ configured: true, connected: false, accountEmail: ACCOUNT, lastError: null, checkedAt: null })
    expect(t.google.calls).toHaveLength(0)
  })

  it('connects: a check asks Google, and the status afterwards remembers the result and the time', async () => {
    const t = await setup()
    t.s.clock.advance(60_000)
    const check = await t.check()
    expect(check.status).toBe(200)
    expect(check.json.data).toEqual({ configured: true, connected: true, accountEmail: ACCOUNT, lastError: null, checkedAt: t.s.clock.now().toISOString() })
    expect(t.google.calls).toEqual(['https://oauth2.googleapis.com/token'])
    // The service is the one the application built, not one per request: the next request sees what the check found.
    expect((await t.status()).json.data).toEqual(check.json.data)
    expect(audits(t.s)).toEqual([{ action: 'gmail.check', detail: null }])
    expectNoSecrets('connected', check.text, JSON.stringify(t.s.logs))
  })

  it('asks Google again on every manual check, even while an access token is still good', async () => {
    const t = await setup()
    await t.check()
    t.s.clock.advance(5 * 60_000)
    const second = await t.check()
    expect(second.json.data.connected).toBe(true)
    expect(t.google.calls).toHaveLength(2)
    expect(second.json.data.checkedAt).toBe(t.s.clock.now().toISOString())
  })

  it.each([
    ['a revoked refresh token', () => reply(400, { error: 'invalid_grant', error_description: `refresh_token ${REFRESH_TOKEN} was revoked` }), 'invalid_grant'],
    ['a wrong client', () => reply(401, `{"error":"invalid_client","detail":"${CLIENT_SECRET}"}`), 'invalid_credentials'],
    ['a rate limit', () => reply(429, `slow down ${ACCESS_TOKEN}`), 'rate_limited'],
    ['Google being down', () => reply(503, `<html>${REFRESH_TOKEN}</html>`), 'provider_unavailable'],
    ['no network', () => new Error(`connect ECONNREFUSED https://oauth2.googleapis.com/token?client_secret=${CLIENT_SECRET}`), 'network'],
    ['an answer without a token', () => reply(200, { scope: `${REFRESH_TOKEN}` }), 'invalid_response'],
    ['a token without the Gmail permissions', () => reply(200, { access_token: ACCESS_TOKEN, expires_in: 3599, scope: 'https://www.googleapis.com/auth/drive.file' }), 'insufficient_scope'],
  ] as [string, Step, string][])('reports %s as a result (HTTP 200), with a category and nothing Google or the network said', async (_name, step, category) => {
    const t = await setup({ steps: [step] })
    const check = await t.check()
    expect(check.status, 'a failed connection is the answer to the check, not an error of the check').toBe(200)
    expect(check.json.data).toEqual({ configured: true, connected: false, accountEmail: ACCOUNT, lastError: category, checkedAt: t.s.clock.now().toISOString() })
    const after = await t.status()
    expect(after.json.data).toEqual(check.json.data)
    expect(audits(t.s)).toEqual([{ action: 'gmail.check_failed', detail: JSON.stringify({ category }) }])
    expectNoSecrets(category, check.text, after.text, JSON.stringify(t.s.logs), JSON.stringify(audits(t.s)))
    // The log says that it failed, and why in the same words.
    expect(t.s.logs.join('\n')).toContain('Gmail token refresh failed')
  })

  it('recovers: a check after a failure that now works says "connected"', async () => {
    const t = await setup({ steps: [() => reply(503, {}), goodAnswer] })
    expect((await t.check()).json.data).toMatchObject({ connected: false, lastError: 'provider_unavailable' })
    t.s.clock.advance(1000)
    expect((await t.check()).json.data).toMatchObject({ connected: true, lastError: null })
    expect(audits(t.s).map((row) => row.action)).toEqual(['gmail.check_failed', 'gmail.check'])
  })

  it('only ever shows the five safe fields', async () => {
    const t = await setup()
    for (const answer of [await t.status(), await t.check(), await t.status()]) expect(Object.keys(answer.json.data).sort()).toEqual(['accountEmail', 'checkedAt', 'configured', 'connected', 'lastError'])
  })
})

describe('Gmail status: who may see and do what', () => {
  it('needs a signed-in administrator for both, and says 401 without one, without asking Google', async () => {
    const t = await setup()
    expect((await t.s.api('/api/admin/gmail/status')).status).toBe(401)
    expect((await t.s.api('/api/admin/gmail/check', { method: 'POST', body: {} })).status).toBe(401)
    expect((await t.s.api('/api/admin/gmail/status', { headers: { Cookie: 'cc_admin=not-a-session' } })).status).toBe(401)
    expect(t.google.calls).toHaveLength(0)
  })

  it('keeps the mailbox address and the check from an editor (no system permission), who gets 403', async () => {
    const t = await setup()
    const editor = await t.s.signIn('editor', 'editor@site.test')
    const status = await t.status(editor)
    const check = await t.check(editor)
    expect([status.status, check.status]).toEqual([403, 403])
    expect(status.text + check.text).not.toContain(ACCOUNT)
    expect(status.json.error.code).toBe('forbidden')
    expect(t.google.calls, 'an editor cannot make the server call Google').toHaveLength(0)
    expect(audits(t.s)).toEqual([])
    // The system page, the other place the status is reached from, is closed to an editor in the same way.
    const system = await t.s.api('/api/admin/system', { headers: { Cookie: editor.cookie } })
    expect(system.status).toBe(403)
    expect(system.text).not.toContain(ACCOUNT)
  })

  it('protects the check against forged requests: it needs the session’s CSRF token, and the admin’s own origin', async () => {
    const t = await setup()
    const noToken = await t.s.api('/api/admin/gmail/check', { method: 'POST', body: {}, headers: { Cookie: t.admin.cookie } })
    expect([noToken.status, noToken.json.error.code]).toEqual([403, 'csrf_failed'])
    const wrongToken = await t.s.api('/api/admin/gmail/check', { method: 'POST', body: {}, headers: { Cookie: t.admin.cookie, 'X-CSRF-Token': `${t.admin.csrf}x` } })
    expect([wrongToken.status, wrongToken.json.error.code]).toEqual([403, 'csrf_failed'])
    const foreign = await t.s.api('/api/admin/gmail/check', { method: 'POST', body: {}, headers: { Cookie: t.admin.cookie, 'X-CSRF-Token': t.admin.csrf, Origin: 'https://evil.example' } })
    expect([foreign.status, foreign.json.error.code]).toEqual([403, 'origin_not_allowed'])
    expect(t.google.calls, 'none of the three reached Google').toHaveLength(0)
    // The same request, the way the administration sends it, works.
    expect((await t.check()).status).toBe(200)
    expect(t.google.calls).toHaveLength(1)
  })

  it('answers a read-only request to the check address with 405, not by checking', async () => {
    const t = await setup()
    const response = await t.s.api('/api/admin/gmail/check', { headers: { Cookie: t.admin.cookie } })
    expect(response.status).toBe(405)
    expect(t.google.calls).toHaveLength(0)
  })

  it('limits how often one administrator can make the server call Google', async () => {
    const t = await setup({ env: { RATE_LIMITS: 'true' } })
    const statuses: number[] = []
    for (let i = 0; i < 8; i += 1) statuses.push((await t.check()).status)
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429, 429])
    expect(t.google.calls, 'the refused ones never reached Google').toHaveLength(6)
    const second = await t.s.signIn('admin', 'second@site.test')
    expect((await t.check(second)).status, 'another administrator has their own allowance').toBe(200)
    t.s.clock.advance(61_000)
    expect((await t.check()).status, 'the allowance comes back after a minute').toBe(200)
  })
})

describe('Gmail in the system overview', () => {
  it('shows an administrator whether it is set up, and never the address, a value or a secret', async () => {
    const t = await setup()
    const system = await t.s.api('/api/admin/system', { headers: { Cookie: t.admin.cookie } })
    expect(system.status).toBe(200)
    expect(system.json.data.config.gmail).toEqual({ enabled: true, credentials: 'set', accountEmailSet: true, problems: [] })
    expectNoSecrets('system', system.text)
    expect(system.text).not.toContain(ACCOUNT)
  })

  it('names the variable that keeps Gmail off, not its value', async () => {
    const t = await setup({ env: { GMAIL_REFRESH_TOKEN: '', GMAIL_ACCOUNT_EMAIL: 'not an address' } })
    const system = await t.s.api('/api/admin/system', { headers: { Cookie: t.admin.cookie } })
    expect(system.json.data.config.gmail).toEqual({ enabled: false, credentials: 'missing', accountEmailSet: false, problems: ['GMAIL_REFRESH_TOKEN is missing', 'GMAIL_ACCOUNT_EMAIL is not a valid e-mail address'] })
    expect(system.text).not.toContain('not an address')
    expectNoSecrets('system, half-set', system.text)
  })
})

describe('Gmail and the rest of the server', () => {
  it('leaves the existing e-mail system and the Google Drive backup settings as they were', async () => {
    const t = await setup({ env: { GOOGLE_DRIVE_CLIENT_ID: 'drive-id', GOOGLE_DRIVE_CLIENT_SECRET: 'drive-secret-value', GOOGLE_DRIVE_REFRESH_TOKEN: 'drive-refresh-value' } })
    await t.check()
    // A Gmail check makes exactly one request, to Google's token address with Gmail's values, and nothing else.
    expect(t.google.calls).toEqual(['https://oauth2.googleapis.com/token'])
    const system = await t.s.api('/api/admin/system', { headers: { Cookie: t.admin.cookie } })
    expect(system.json.data.config.googleDriveBackup).toMatchObject({ enabled: true, credentials: 'set' })
    expect(system.json.data.config.emailProvider).toBe('file')
    expect(t.s.mailer.sent, 'a Gmail check sends no e-mail').toHaveLength(0)
  })
})
