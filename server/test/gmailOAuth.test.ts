import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig, redactedConfig, type GmailConfig } from '../src/config.ts'
import { createLogger } from '../src/lib/logger.ts'
import { GMAIL_SCOPES, GMAIL_TOKEN_URL, GmailAuthError, createGmailTokenService, type GmailErrorCategory } from '../src/modules/gmail/tokenService.ts'
import { startServer, TestClock } from './helpers.ts'

/**
 * Gmail, step 1: the configuration and the OAuth token service. Google is a stand-in (an injected `fetch`), so nothing here
 * reaches the network and no real credential is involved. Every value below is made up.
 */

const CLIENT_ID = 'gmail-client-1234567890.apps.googleusercontent.com'
const CLIENT_SECRET = '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01'
const REFRESH_TOKEN = '1//0g-gmail-refresh-token-VALUE-0002'
const ACCESS_TOKEN = 'ya29.gmail-access-token-VALUE-0003'
const ACCOUNT = 'mailbox@site.test'
const GMAIL_ENV = { GMAIL_CLIENT_ID: CLIENT_ID, GMAIL_CLIENT_SECRET: CLIENT_SECRET, GMAIL_REFRESH_TOKEN: REFRESH_TOKEN, GMAIL_ACCOUNT_EMAIL: ACCOUNT }

const DRIVE_ENV = {
  GOOGLE_DRIVE_CLIENT_ID: 'drive-client-9999.apps.googleusercontent.com',
  GOOGLE_DRIVE_CLIENT_SECRET: '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01',
  GOOGLE_DRIVE_REFRESH_TOKEN: '1//0g-drive-refresh-token-VALUE-9002',
  GOOGLE_DRIVE_FOLDER_ID: 'drive-folder-id',
}

const production = { APP_ENV: 'production', APP_SECRET: 'k'.repeat(40), CORS_ORIGINS: 'https://site.test', DATABASE_PATH: '/var/lib/site/app.sqlite', EMAIL_PROVIDER: 'none' }
const smtp = { EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'Site <no-reply@site.test>', NOTIFY_TO: 'owner@site.test', SMTP_HOST: 'smtp.site.test', SMTP_USER: 'u', SMTP_PASSWORD: 'p' }

const completeConfig = (): GmailConfig => loadConfig(GMAIL_ENV).gmail

// ---- a stand-in for Google ---------------------------------------------------------------------------------------------------

type Step = () => Response | Promise<Response> | Error
interface Call {
  url: string
  init: RequestInit
  form: URLSearchParams
}

const reply = (status: number, body: unknown): Response => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const tokenAnswer = (extra: Record<string, unknown> = {}) => ({ access_token: ACCESS_TOKEN, expires_in: 3599, scope: GMAIL_SCOPES.join(' '), token_type: 'Bearer', ...extra })

/** Answers the n-th request with the n-th step (the last step repeats). A step that is an Error makes the request fail like a network error. */
function fakeGoogle(...steps: Step[]) {
  const calls: Call[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {}, form: new URLSearchParams(String(init?.body ?? '')) })
    const result = await steps[Math.min(calls.length - 1, steps.length - 1)]!()
    if (result instanceof Error) throw result
    return result
  }) as typeof fetch
  return { calls, fetch: fetchImpl }
}

function setup(...steps: Step[]) {
  const google = fakeGoogle(...steps)
  const clock = new TestClock()
  const lines: string[] = []
  const log = createLogger({ level: 'debug', write: (line) => void lines.push(line) })
  const service = createGmailTokenService(completeConfig(), { fetch: google.fetch, clock, log })
  return { ...google, clock, lines, service }
}

const categoryOf = async (promise: Promise<unknown>): Promise<{ category: GmailErrorCategory; httpStatus: number | null; error: GmailAuthError }> => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(GmailAuthError)
  const failure = error as GmailAuthError
  return { category: failure.category, httpStatus: failure.httpStatus, error: failure }
}

// ---- configuration -----------------------------------------------------------------------------------------------------------

describe('the Gmail configuration', () => {
  it('is switched off, and says nothing is wrong, when no Gmail variable is set', () => {
    expect(loadConfig({}).gmail).toEqual({ enabled: false, clientId: '', clientSecret: '', refreshToken: '', accountEmail: '', problems: [] })
    expect(loadConfig({ GMAIL_CLIENT_ID: '', GMAIL_CLIENT_SECRET: '  ', GMAIL_REFRESH_TOKEN: '', GMAIL_ACCOUNT_EMAIL: '' }).gmail).toMatchObject({ enabled: false, problems: [] })
  })

  it('is on, with the four values, when all of them are set', () => {
    expect(loadConfig(GMAIL_ENV).gmail).toEqual({ enabled: true, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, refreshToken: REFRESH_TOKEN, accountEmail: ACCOUNT, problems: [] })
    // A pasted value with spaces around it is the same value (as every other setting).
    expect(loadConfig({ ...GMAIL_ENV, GMAIL_CLIENT_SECRET: `  ${CLIENT_SECRET}\n` }).gmail.clientSecret).toBe(CLIENT_SECRET)
  })

  it.each(['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_ACCOUNT_EMAIL'])('stays off, without an error, when only %s is missing', (missing) => {
    const env: Record<string, string> = { ...GMAIL_ENV }
    delete env[missing]
    const config = loadConfig(env).gmail
    expect(config.enabled).toBe(false)
    expect(config.problems).toEqual([`${missing} is missing`])
    // No half-set credential is kept where something could use it.
    expect([config.clientId, config.clientSecret, config.refreshToken]).toEqual(['', '', ''])
  })

  it('stays off when a value cannot be used, and names the variable but never the value', () => {
    const badAddress = loadConfig({ ...GMAIL_ENV, GMAIL_ACCOUNT_EMAIL: 'not an address' }).gmail
    expect(badAddress).toMatchObject({ enabled: false, accountEmail: '', problems: ['GMAIL_ACCOUNT_EMAIL is not a valid e-mail address'] })
    const spaced = loadConfig({ ...GMAIL_ENV, GMAIL_REFRESH_TOKEN: 'abc def-secret-part' }).gmail
    expect(spaced).toMatchObject({ enabled: false, refreshToken: '', problems: ['GMAIL_REFRESH_TOKEN contains whitespace'] })
    expect(JSON.stringify([badAddress.problems, spaced.problems])).not.toMatch(/not an address|def-secret-part/)
  })

  it('never stops the server from starting, however it is set — also in production', () => {
    for (const env of [{}, { GMAIL_CLIENT_ID: CLIENT_ID }, { GMAIL_ACCOUNT_EMAIL: 'nope' }, { ...GMAIL_ENV, GMAIL_CLIENT_SECRET: 'two words' }, GMAIL_ENV]) {
      expect(() => loadConfig({ ...production, ...env }), JSON.stringify(Object.keys(env))).not.toThrow()
    }
    // The existing validation still stops a bad configuration, and still reports only its own problems.
    try {
      loadConfig({ ...production, APP_SECRET: 'short', GMAIL_CLIENT_ID: CLIENT_ID })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      expect((error as ConfigError).problems.map((line) => line.split(':')[0])).toEqual(['APP_SECRET'])
    }
  })

  it('leaves the existing e-mail system as it was, with Gmail set, half set or not set', () => {
    const without = loadConfig({ ...production, ...smtp }).email
    expect(without.smtp).toMatchObject({ host: 'smtp.site.test', port: 587, secure: 'starttls' })
    expect(loadConfig({ ...production, ...smtp, ...GMAIL_ENV }).email).toEqual(without)
    expect(loadConfig({ ...production, ...smtp, GMAIL_CLIENT_ID: CLIENT_ID }).email).toEqual(without)
  })

  it('starts the whole server, and its health check answers, with a half-set Gmail configuration', async () => {
    const server = await startServer({ env: { GMAIL_CLIENT_ID: CLIENT_ID, GMAIL_ACCOUNT_EMAIL: ACCOUNT } })
    try {
      expect(server.config.gmail.enabled).toBe(false)
      expect((await server.api('/api/health')).status).toBe(200)
    } finally {
      await server.close()
    }
  })

  it('keeps the Google Drive backup configuration exactly as it was', () => {
    const expected = { enabled: true, clientId: DRIVE_ENV.GOOGLE_DRIVE_CLIENT_ID, clientSecret: DRIVE_ENV.GOOGLE_DRIVE_CLIENT_SECRET, refreshToken: DRIVE_ENV.GOOGLE_DRIVE_REFRESH_TOKEN, folderId: 'drive-folder-id', retentionDays: 30, hourUtc: 3 }
    expect(loadConfig(DRIVE_ENV).backup).toEqual(expected)
    // Gmail variables change nothing about it …
    expect(loadConfig({ ...DRIVE_ENV, ...GMAIL_ENV }).backup).toEqual(expected)
    expect(loadConfig({ ...DRIVE_ENV, GMAIL_CLIENT_ID: CLIENT_ID }).backup).toEqual(expected)
    // … and it is not what switches Gmail on, nor what Gmail's values switch on.
    expect(loadConfig(DRIVE_ENV).gmail).toMatchObject({ enabled: false, clientId: '', clientSecret: '', refreshToken: '', problems: [] })
    expect(loadConfig(GMAIL_ENV).backup).toMatchObject({ enabled: false, clientId: '', clientSecret: '', refreshToken: '' })
    expect(loadConfig({ ...DRIVE_ENV, ...GMAIL_ENV }).gmail).toMatchObject({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, refreshToken: REFRESH_TOKEN })
    // The Drive rules are untouched: a half-set Drive configuration still stops the server, a half-set Gmail one does not.
    expect(() => loadConfig({ GOOGLE_DRIVE_CLIENT_ID: DRIVE_ENV.GOOGLE_DRIVE_CLIENT_ID })).toThrow(/GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_REFRESH_TOKEN must be set together/)
    // What the System page shows about the backup is unchanged, and it shows nothing of Gmail's secrets.
    const shown = redactedConfig(loadConfig({ ...production, ...DRIVE_ENV, ...GMAIL_ENV }))
    expect(shown.googleDriveBackup).toEqual({ enabled: true, credentials: 'set', folderIdSet: true, retentionDays: 30, hourUtc: 3 })
    for (const secret of [CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN, ACCOUNT]) expect(JSON.stringify(shown), secret).not.toContain(secret)
  })
})

// ---- the token service ------------------------------------------------------------------------------------------------------

describe('the Gmail token service', () => {
  it('makes no request at all without a complete configuration', async () => {
    const google = fakeGoogle(() => reply(200, tokenAnswer()))
    for (const env of [{}, { GMAIL_CLIENT_ID: CLIENT_ID, GMAIL_CLIENT_SECRET: CLIENT_SECRET }]) {
      const service = createGmailTokenService(loadConfig(env).gmail, { fetch: google.fetch })
      expect((await categoryOf(service.getAccessToken())).category).toBe('not_configured')
      expect(await service.status()).toEqual({ configured: false, connected: false, accountEmail: null, lastError: 'not_configured' })
    }
    expect(google.calls).toHaveLength(0)
  })

  it('exchanges the refresh token at Google with the Gmail credentials and nothing else', async () => {
    const { service, calls } = setup(() => reply(200, tokenAnswer()))
    expect(await service.getAccessToken()).toBe(ACCESS_TOKEN)
    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call!.url).toBe(GMAIL_TOKEN_URL)
    expect(call!.url).toBe('https://oauth2.googleapis.com/token')
    expect(call!.init.method).toBe('POST')
    expect((call!.init.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded')
    expect(Object.fromEntries(call!.form)).toEqual({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH_TOKEN, grant_type: 'refresh_token' })
    // The credentials are sent nowhere else: no redirect is followed, and the request has a time limit.
    expect(call!.init.redirect).toBe('error')
    expect(call!.init.signal).toBeInstanceOf(AbortSignal)
  })

  it('uses its own credentials even when the Google Drive ones are set too, and never reads the backup settings', async () => {
    const google = fakeGoogle(() => reply(200, tokenAnswer()))
    const config = loadConfig({ ...DRIVE_ENV, ...GMAIL_ENV })
    await createGmailTokenService(config.gmail, { fetch: google.fetch }).getAccessToken()
    const sent = google.calls[0]!.init.body as string
    for (const drive of Object.values(DRIVE_ENV)) expect(sent, drive).not.toContain(drive)
    expect(sent).toContain('client_id=gmail-client')
    const source = readFileSync(new URL('../src/modules/gmail/tokenService.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/GOOGLE_DRIVE|\.backup\b|googleDrive/)
  })

  it('reports the mailbox as connected, with the four fields and no more', async () => {
    const { service } = setup(() => reply(200, tokenAnswer()))
    const status = await service.status()
    expect(status).toEqual({ configured: true, connected: true, accountEmail: ACCOUNT, lastError: null })
    expect(Object.keys(status).sort()).toEqual(['accountEmail', 'configured', 'connected', 'lastError'])
  })

  it('keeps the access token in memory and asks Google once while it is good', async () => {
    const { service, calls, clock } = setup(() => reply(200, tokenAnswer()))
    await service.getAccessToken()
    clock.advance(30 * 60_000)
    expect(await service.getAccessToken()).toBe(ACCESS_TOKEN)
    expect((await service.status()).connected).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('shares one request between callers that ask at the same time', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { service, calls } = setup(async () => {
      await gate
      return reply(200, tokenAnswer())
    })
    const pending = [service.getAccessToken(), service.getAccessToken(), service.status().then(() => ACCESS_TOKEN)]
    release()
    expect(await Promise.all(pending)).toEqual([ACCESS_TOKEN, ACCESS_TOKEN, ACCESS_TOKEN])
    expect(calls).toHaveLength(1)
  })

  it('renews the token a minute before it expires, and again when it has expired', async () => {
    let n = 0
    const { service, calls, clock } = setup(() => reply(200, tokenAnswer({ access_token: `ya29.token-number-${++n}`, expires_in: 3600 })))
    expect(await service.getAccessToken()).toBe('ya29.token-number-1')
    clock.advance(3600_000 - 61_000) // 61 s left: still used
    expect(await service.getAccessToken()).toBe('ya29.token-number-1')
    expect(calls).toHaveLength(1)
    clock.advance(2_000) // 59 s left: renewed before it can expire in flight
    expect(await service.getAccessToken()).toBe('ya29.token-number-2')
    expect(calls).toHaveLength(2)
    clock.advance(3600_000 + 5_000) // long expired
    expect(await service.getAccessToken()).toBe('ya29.token-number-3')
    expect(calls).toHaveLength(3)
  })

  it('does not believe a lifetime longer than an hour', async () => {
    const { service, calls, clock } = setup(() => reply(200, tokenAnswer({ expires_in: 999_999_999 })))
    await service.getAccessToken()
    clock.advance(2 * 3600_000)
    await service.getAccessToken()
    expect(calls).toHaveLength(2)
  })

  it.each([
    [400, 'invalid_grant', { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }],
    [400, 'invalid_credentials', { error: 'invalid_request', error_description: 'Missing required parameter' }],
    [400, 'invalid_credentials', 'not even json'],
    [401, 'invalid_credentials', { error: 'invalid_client', error_description: 'The OAuth client was not found.' }],
    [403, 'invalid_credentials', { error: 'access_denied' }],
    [429, 'rate_limited', { error: 'rate_limit_exceeded' }],
    [500, 'provider_unavailable', { error: 'backendError' }],
    [503, 'provider_unavailable', '<html>Service Unavailable</html>'],
    [404, 'invalid_response', { error: 'not_found' }],
  ] as [number, GmailErrorCategory, unknown][])('answers HTTP %i with the category %s', async (status, expected, body) => {
    const { service, calls } = setup(() => reply(status, body))
    expect(await categoryOf(service.getAccessToken())).toMatchObject({ category: expected, httpStatus: status })
    expect(await service.status()).toEqual({ configured: true, connected: false, accountEmail: ACCOUNT, lastError: expected })
    expect(calls.length).toBeGreaterThanOrEqual(1)
  })

  it('treats a network failure and a timeout as "could not be reached"', async () => {
    const down = setup(() => new Error('connect ECONNREFUSED 142.250.0.1:443'))
    expect((await categoryOf(down.service.getAccessToken())).category).toBe('network')
    expect(await down.service.status()).toMatchObject({ connected: false, lastError: 'network' })

    // A server that never answers: the time limit cuts the request off.
    const silent = ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        signal?.addEventListener('abort', () => reject(signal.reason))
      })) as typeof fetch
    const service = createGmailTokenService(completeConfig(), { fetch: silent, timeoutMs: 25 })
    expect((await categoryOf(service.getAccessToken())).category).toBe('network')
  })

  it('refuses an answer it cannot use, and does not keep it', async () => {
    for (const body of ['', 'null', '[]', '{}', { access_token: '', expires_in: 3599 }, { access_token: ACCESS_TOKEN }, { access_token: ACCESS_TOKEN, expires_in: 'soon' }, { access_token: ACCESS_TOKEN, expires_in: -5 }, { access_token: 'has a space', expires_in: 3599 }, tokenAnswer({ token_type: 'MAC' })]) {
      const { service, calls } = setup(() => reply(200, body))
      expect((await categoryOf(service.getAccessToken())).category, JSON.stringify(body)).toBe('invalid_response')
      await categoryOf(service.getAccessToken())
      expect(calls, 'a refused answer is not cached').toHaveLength(2)
    }
  })

  it('refuses a token that was not granted the permissions the integration needs', async () => {
    for (const scope of [GMAIL_SCOPES[0], GMAIL_SCOPES[1], 'https://www.googleapis.com/auth/drive.file', '']) {
      const { service } = setup(() => reply(200, tokenAnswer({ scope })))
      expect((await categoryOf(service.getAccessToken())).category, scope).toBe('insufficient_scope')
      expect(await service.status()).toMatchObject({ configured: true, connected: false, lastError: 'insufficient_scope' })
    }
    // Both scopes, in either order, and more are fine; so is an answer that does not list scopes at all.
    for (const scope of [[...GMAIL_SCOPES].reverse().join(' '), `${GMAIL_SCOPES.join(' ')} openid`, undefined]) {
      const { service } = setup(() => reply(200, tokenAnswer({ scope })))
      expect(await service.getAccessToken()).toBe(ACCESS_TOKEN)
    }
  })

  it('recovers: a failure drops the old token, and the next good answer is used', async () => {
    let n = 0
    const { service, calls, clock, lines } = setup(
      () => reply(200, tokenAnswer({ access_token: 'ya29.first', expires_in: 3600 })),
      () => reply(503, { error: 'backendError' }),
      () => reply(503, { error: 'backendError' }),
      () => reply(200, tokenAnswer({ access_token: `ya29.second-${++n}`, expires_in: 3600 })),
    )
    expect(await service.getAccessToken()).toBe('ya29.first')
    clock.advance(3600_000) // expired
    expect(await service.status()).toMatchObject({ connected: false, lastError: 'provider_unavailable' })
    expect((await categoryOf(service.getAccessToken())).category).toBe('provider_unavailable')
    expect(await service.getAccessToken()).toBe('ya29.second-1')
    expect(await service.status()).toMatchObject({ connected: true, lastError: null })
    expect(calls).toHaveLength(4)
    // One warning for the new failure (not one per attempt), one note for the recovery.
    expect(lines.filter((line) => line.includes('Gmail token refresh failed'))).toHaveLength(1)
    expect(lines.filter((line) => line.includes('Gmail token refresh recovered'))).toHaveLength(1)
  })

  it('throws only its own error, with a fixed message and no cause', async () => {
    for (const step of [() => reply(400, { error: 'invalid_grant' }), () => reply(500, {}), () => new Error('socket hang up'), () => reply(200, 'nope')] as Step[]) {
      const { error } = await categoryOf(setup(step).service.getAccessToken())
      expect(error.name).toBe('GmailAuthError')
      expect(error.cause).toBeUndefined()
      expect(Object.keys(error).sort()).toEqual(['category', 'httpStatus', 'name']) // nothing else is attached to it
    }
  })
})

// ---- no secret in an error, a log or an answer ------------------------------------------------------------------------------

describe('secrets', () => {
  const secrets = [CLIENT_SECRET, REFRESH_TOKEN, ACCESS_TOKEN]
  // Google and the network do their worst: every answer and every failure quotes the credentials back.
  const hostile: Step[] = [
    () => reply(400, { error: 'invalid_grant', error_description: `refresh_token ${REFRESH_TOKEN} for ${CLIENT_ID} with secret ${CLIENT_SECRET} was revoked` }),
    () => reply(401, `client_secret=${CLIENT_SECRET}&access_token=${ACCESS_TOKEN}`),
    () => reply(500, { error: { message: `internal error while handling ${REFRESH_TOKEN}` } }),
    () => reply(429, `slow down ${CLIENT_SECRET}`),
    () => new Error(`connect failed: ${GMAIL_TOKEN_URL}?client_secret=${CLIENT_SECRET}&refresh_token=${REFRESH_TOKEN}`),
    () => reply(200, tokenAnswer({ token_type: `MAC ${ACCESS_TOKEN}` })),
    () => reply(200, tokenAnswer({ scope: `https://www.googleapis.com/auth/other ${REFRESH_TOKEN}` })),
    () => reply(200, { access_token: `${ACCESS_TOKEN} with a space`, expires_in: 3599 }),
  ]

  it('never appear in an error, a status or a log line, whatever Google or the network say', async () => {
    for (const [index, step] of hostile.entries()) {
      const { service, lines } = setup(step)
      const { error } = await categoryOf(service.getAccessToken())
      const status = await service.status()
      const everything = [error.message, error.stack ?? '', String(error), JSON.stringify(error), JSON.stringify(status), ...lines].join('\n')
      for (const secret of [...secrets, CLIENT_ID]) expect(everything, `step ${index}: ${secret}`).not.toContain(secret)
      expect(lines.length, `step ${index} is logged`).toBeGreaterThan(0)
      expect(lines.join('\n')).toContain('Gmail token refresh failed')
    }
  })

  it('stay out of the log when everything works', async () => {
    const { service, lines } = setup(() => reply(200, tokenAnswer()))
    await service.getAccessToken()
    await service.status()
    expect(lines.join('\n')).not.toMatch(new RegExp(secrets.map((secret) => secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')))
  })

  it('are masked by the server logger once the app has registered them, even if a field quoted them', async () => {
    // Short values on purpose: the logger masks any long unbroken token by shape, which would hide a missing registration.
    const client = 'cl.secret.7'
    const refresh = 'rf.token.7'
    const server = await startServer({ env: { ...GMAIL_ENV, GMAIL_CLIENT_SECRET: client, GMAIL_REFRESH_TOKEN: refresh } })
    try {
      server.app.context.log.warn('a provider said something', { detail: `quoted ${client} and ${refresh}` })
      const text = server.logs.join('\n')
      expect(text).toContain('a provider said something')
      expect(text).toContain('quoted [secret] and [secret]')
    } finally {
      await server.close()
    }
  })
})
