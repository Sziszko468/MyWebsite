import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../src/config.ts'
import { Database } from '../src/db/database.ts'
import { migrate, migrationStatus } from '../src/db/migrate.ts'
import { seedCatalog } from '../src/db/seed.ts'
import { eraseByEmail, runMaintenance } from '../src/modules/system/maintenance.ts'
import { contact, quote, startServer, type TestServer } from './helpers.ts'

let server: TestServer
const cleanup: string[] = []
beforeEach(async () => {
  server = await startServer()
})
afterEach(async () => {
  await server.close()
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})
const scratch = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'cc-rel-'))
  cleanup.push(directory)
  return directory
}

// ---- configuration ---------------------------------------------------------------------------------------------------------

describe('the configuration', () => {
  const production = { APP_ENV: 'production', APP_SECRET: 'k'.repeat(40), CORS_ORIGINS: 'https://site.test', DATABASE_PATH: '/var/lib/site/app.sqlite', EMAIL_PROVIDER: 'none' }
  const problems = (env: Record<string, string>): string[] => {
    try {
      loadConfig(env)
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      return [...(error as ConfigError).problems]
    }
    return []
  }

  it('starts with nothing at all, for development, and says what it chose', () => {
    const config = loadConfig({})
    expect(config).toMatchObject({ env: 'development', host: '127.0.0.1', port: 8787, databasePath: './data/app.sqlite', corsOrigins: [], rateLimitsEnabled: true, requireConsent: true, secureCookies: false })
    expect(config.email).toMatchObject({ provider: 'none', from: null, notifyTo: null, smtp: null })
    expect(config.appSecret).toContain('development-only') // a development convenience that production refuses (below)
  })

  it('accepts a complete production setup', () => {
    expect(problems(production)).toEqual([])
    const config = loadConfig({ ...production, EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'Site <no-reply@site.test>', NOTIFY_TO: 'owner@site.test', SMTP_HOST: 'smtp.site.test', SMTP_USER: 'u', SMTP_PASSWORD: 'p' })
    expect(config).toMatchObject({ env: 'production', secureCookies: true })
    expect(config.email.smtp).toMatchObject({ host: 'smtp.site.test', port: 587, secure: 'starttls', rejectUnauthorized: true })
  })

  it('refuses what would be unsafe in production, and says all of it at once', () => {
    const all = problems({ APP_ENV: 'production', CORS_ORIGINS: 'http://site.test', EMAIL_PROVIDER: 'file', DATABASE_PATH: ':memory:' })
    expect(all.map((line) => line.split(':')[0]).sort()).toEqual(['APP_SECRET', 'CORS_ORIGINS', 'DATABASE_PATH', 'EMAIL_PROVIDER'])
    expect(problems({ ...production, APP_SECRET: 'short' })[0]).toMatch(/^APP_SECRET: required in production, at least 32/)
    expect(problems({ ...production, APP_SECRET: `change-me-${'x'.repeat(30)}` })[0]).toMatch(/placeholder/)
    expect(problems({ ...production, EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'a@site.test', SMTP_HOST: 'h', SMTP_SECURE: 'none' })[0]).toMatch(/^SMTP_SECURE: none sends credentials/)
    expect(problems({ ...production, EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'a@site.test', SMTP_HOST: 'h', SMTP_TLS_REJECT_UNAUTHORIZED: 'false' })[0]).toMatch(/^SMTP_TLS_REJECT_UNAUTHORIZED: cannot be switched off/)
    expect(problems({ ...production, PUBLIC_URL: 'http://site.test' })[0]).toMatch(/^PUBLIC_URL: must be https/)
    expect(problems({ ...production, DEPLOY_HOOK_URL: 'http://hooks.example/build' })[0]).toMatch(/^DEPLOY_HOOK_URL: must be an https/)
  })

  it('refuses nonsense in any environment, naming the variable', () => {
    const cases: [Record<string, string>, string][] = [
      [{ APP_ENV: 'staging' }, 'APP_ENV'],
      [{ PORT: 'eighty' }, 'PORT'],
      [{ PORT: '70000' }, 'PORT'],
      [{ CORS_ORIGINS: '*' }, 'CORS_ORIGINS'],
      [{ CORS_ORIGINS: 'https://site.test/path' }, 'CORS_ORIGINS'],
      [{ CORS_ORIGINS: 'not a url' }, 'CORS_ORIGINS'],
      [{ LOG_LEVEL: 'loud' }, 'LOG_LEVEL'],
      [{ EMAIL_PROVIDER: 'carrier-pigeon' }, 'EMAIL_PROVIDER'],
      [{ EMAIL_FROM: 'not an address' }, 'EMAIL_FROM'],
      [{ NOTIFY_TO: 'a@x.test, b@x.test' }, 'NOTIFY_TO'],
      [{ NOTIFY_TO: 'someone' }, 'NOTIFY_TO'],
      [{ NOTIFY_LANGUAGE: 'de' }, 'NOTIFY_LANGUAGE'],
      [{ EMAIL_PROVIDER: 'smtp' }, 'SMTP_HOST'],
      [{ EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'a@site.test', SMTP_HOST: 'h', SMTP_USER: 'u' }, 'SMTP_USER'],
      [{ EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'a@site.test', SMTP_HOST: 'h', SMTP_SECURE: 'maybe' }, 'SMTP_SECURE'],
      [{ EMAIL_MAX_ATTEMPTS: '0' }, 'EMAIL_MAX_ATTEMPTS'],
      [{ RETENTION_DAYS: '0' }, 'RETENTION_DAYS'],
      [{ RETENTION_DAYS: 'forever' }, 'RETENTION_DAYS'],
      [{ TRUST_PROXY: '9' }, 'TRUST_PROXY'],
      [{ RATE_LIMITS: 'sometimes' }, 'RATE_LIMITS'],
      [{ BODY_LIMIT_BYTES: '10' }, 'BODY_LIMIT_BYTES'],
      [{ ADMIN_SESSION_HOURS: '0' }, 'ADMIN_SESSION_HOURS'],
      [{ DEPLOY_HOOK_URL: 'not a url' }, 'DEPLOY_HOOK_URL'],
    ]
    for (const [env, name] of cases) {
      const found = problems(env)
      expect(found.some((line) => line.startsWith(`${name}:`)), `${JSON.stringify(env)} -> ${found.join(' | ')}`).toBe(true)
    }
  })

  it('treats an empty variable as unset, so a blank line in a .env file changes nothing', () => {
    expect(problems({ PORT: '', APP_ENV: '  ', CORS_ORIGINS: '', EMAIL_PROVIDER: '', NOTIFY_TO: '', RETENTION_DAYS: '' })).toEqual([])
    expect(loadConfig({ RETENTION_DAYS: '' }).retentionDays).toBeNull()
  })

  it('gives the System page a configuration with no secret, no password and no full address in it', () => {
    const config = loadConfig({ ...production, EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'Site <no-reply@site.test>', NOTIFY_TO: 'owner@site.test', SMTP_HOST: 'smtp.site.test', SMTP_USER: 'mailer-user', SMTP_PASSWORD: 'mailer-password-123' })
    return import('../src/config.ts').then(({ redactedConfig }) => {
      const text = JSON.stringify(redactedConfig(config))
      for (const secret of [production.APP_SECRET, 'mailer-user', 'mailer-password-123', 'owner@site.test', 'no-reply@site.test', '/var/lib/site']) expect(text, secret).not.toContain(secret)
      expect(text).toContain('"appSecret":"set"')
    })
  })
})

// ---- a database that is not there -------------------------------------------------------------------------------------------

describe('when the database is not there', () => {
  it('says "not ready" and 503 with a Retry-After, never an empty success, while staying alive', async () => {
    server.db.close()
    const ready = await server.api('/api/ready')
    expect(ready.status).toBe(503)
    expect(ready.json.data).toMatchObject({ status: 'not_ready', checks: { database: 'unavailable', migrations: 'unknown' } })
    expect(ready.headers.get('retry-after')).toBe('10')
    expect((await server.api('/api/health')).status).toBe(200) // alive, so a supervisor does not restart a process that only has to wait
    for (const [path, body] of [['/api/services', undefined], ['/api/shop/catalog', undefined], ['/api/contact', contact()], ['/api/quote-requests', quote()], ['/api/admin/login', { email: 'a@site.test', password: 'x'.repeat(12) }]] as const) {
      const response = await server.api(path, { body })
      expect(response.status, path).toBe(503)
      expect(response.json.error, path).toMatchObject({ code: 'service_unavailable', message: 'The service is temporarily unavailable.' })
      expect(response.headers.get('retry-after'), path).toBe('30')
      expect(response.text, path).not.toMatch(/sqlite|not open|ERR_|stack/i)
    }
  })

  it('does not tell the visitor "received" for a message it could not keep', async () => {
    server.db.close()
    const response = await server.api('/api/contact', { body: contact() })
    expect(response.status).toBe(503)
    expect(response.json.data).toBeUndefined()
    expect(response.text).not.toContain('received')
  })

  it('comes back to work when the database does: the same process, a new connection', async () => {
    const directory = scratch()
    await server.close()
    server = await startServer({ databasePath: join(directory, 'app.sqlite') })
    expect((await server.api('/api/contact', { body: contact() })).status).toBe(201)
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 1 })
  })

  it('reports "not ready" for a database whose schema is out of date', async () => {
    server.db.run('DROP TABLE schema_migrations')
    const ready = await server.api('/api/ready')
    expect(ready.status).toBe(503)
    expect(ready.json.data.status ?? ready.json.status).toBe('not_ready')
  })
})

// ---- a failure in the middle ------------------------------------------------------------------------------------------------

describe('when something fails half-way', () => {
  it('stores a quote request completely or not at all', async () => {
    server.db.exec("CREATE TRIGGER fail_extras BEFORE INSERT ON quote_request_item_extras BEGIN SELECT RAISE(ABORT, 'disk on fire'); END")
    const response = await server.api('/api/quote-requests', { body: quote() })
    expect(response.status).toBe(500)
    expect(response.json.error.code).toBe('internal_error')
    expect(response.text).not.toContain('disk on fire')
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: 0 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_request_items')).toEqual({ n: 0 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM email_deliveries')).toEqual({ n: 0 })
    server.db.exec('DROP TRIGGER fail_extras')
    expect((await server.api('/api/quote-requests', { body: quote() })).status).toBe(201) // the failure left nothing behind that would block a retry
  })

  it('does not report success for a message that was not stored, and does not queue an e-mail about it', async () => {
    server.db.exec("CREATE TRIGGER fail_inquiry BEFORE INSERT ON inquiries BEGIN SELECT RAISE(ABORT, 'no space'); END")
    const response = await server.api('/api/contact', { body: contact() })
    expect(response.status).toBe(500)
    expect(response.json.data).toBeUndefined()
    expect(server.db.get('SELECT COUNT(*) AS n FROM email_deliveries')).toEqual({ n: 0 })
    expect(server.mailer.sent).toEqual([])
  })

  it('keeps the visitor\'s message when the notification cannot even be queued, and says so in the log', async () => {
    server.db.exec("CREATE TRIGGER fail_queue BEFORE INSERT ON email_deliveries BEGIN SELECT RAISE(ABORT, 'outbox broken'); END")
    const response = await server.api('/api/contact', { body: contact() })
    expect(response.status).toBe(201)
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 1 })
    expect(server.logs.join('\n')).toContain('could not queue the owner notification')
  })

  it('keeps an administrator\'s catalogue edit all-or-nothing', async () => {
    const admin = await server.signIn()
    server.db.exec("CREATE TRIGGER fail_needs BEFORE INSERT ON package_needs BEGIN SELECT RAISE(ABORT, 'nope'); END")
    const body = { needs: ['website'], extras: [], status: 'disabled', translations: { hu: { name: 'Changed' }, en: { name: 'Changed' }, nl: { name: 'Changed' } } }
    const response = await server.api('/api/admin/packages/launch', { method: 'PUT', body, headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf } })
    expect(response.status).toBe(500)
    expect(server.db.get("SELECT status FROM packages WHERE code = 'launch'")).toEqual({ status: 'active' })
    expect(server.db.get("SELECT name FROM package_translations WHERE language = 'en' AND package_id = (SELECT id FROM packages WHERE code = 'launch')")).toEqual({ name: 'Launch' })
  })

  it('handles many requests at once without losing or doubling any', async () => {
    const distinct = await Promise.all(Array.from({ length: 30 }, (_, i) => server.api('/api/contact', { body: contact({ subject: `Parallel ${i}` }) })))
    expect(distinct.every((response) => response.status === 201)).toBe(true)
    expect(new Set(distinct.map((response) => response.json.data.reference)).size).toBe(30)
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 30 })
    const same = await Promise.all(Array.from({ length: 12 }, () => server.api('/api/contact', { body: contact({ subject: 'The very same message' }) })))
    expect(same.filter((response) => response.status === 201)).toHaveLength(1)
    expect(same.filter((response) => response.status === 200)).toHaveLength(11)
    expect(new Set(same.map((response) => response.json.data.reference)).size).toBe(1)
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 31 })
    await server.app.context.notifier.processDue()
    expect(server.db.get('SELECT COUNT(*) AS n FROM email_deliveries')).toEqual({ n: 31 }) // one e-mail per stored message, none for the repeats
  })
})

// ---- restarts --------------------------------------------------------------------------------------------------------------

describe('a restart', () => {
  it('finds everything where it was, applies no migration twice and does not seed again over edits', async () => {
    const directory = scratch()
    const path = join(directory, 'nested', 'app.sqlite') // the folder does not exist yet: the server makes it
    await server.close()
    server = await startServer({ databasePath: path })
    const admin = await server.signIn('admin', 'admin@site.test')
    const reference = (await server.api('/api/contact', { body: contact() })).json.data.reference
    await server.api('/api/admin/extras/care', { method: 'PUT', headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }, body: { status: 'disabled', translations: { hu: { name: 'Care' }, en: { name: 'Care' }, nl: { name: 'Care' } }, appliesTo: ['website'] } })
    await server.close()

    const db = new Database(path)
    try {
      const before = migrationStatus(db)
      migrate(db, server.clock)
      expect(migrationStatus(db)).toEqual(before)
      expect(migrationStatus(db).pending).toBe(0)
      expect(db.get<{ reference: string }>('SELECT reference FROM inquiries')?.reference).toBe(reference)
      expect(db.get("SELECT status FROM extras WHERE code = 'care'")).toEqual({ status: 'disabled' })
      expect(db.get('SELECT COUNT(*) AS n FROM admin_users')).toEqual({ n: 1 })
      const ids = db.all('SELECT id FROM services ORDER BY id')
      // The seed only fills an empty catalogue: it must never overwrite what the owner has edited since.
      const restarted = await startServer({ databasePath: path, seed: false })
      try {
        seedCatalog(restarted.app.context)
        expect(restarted.db.get("SELECT status FROM extras WHERE code = 'care'")).toEqual({ status: 'disabled' })
        expect(restarted.db.all('SELECT id FROM services ORDER BY id')).toEqual(ids)
        expect((await restarted.api('/api/shop/extras')).json.data.map((extra: { code: string }) => extra.code)).not.toContain('care')
      } finally {
        await restarted.close()
      }
    } finally {
      db.close()
    }
  })

  it('refuses a database from a newer version of the software instead of damaging it', async () => {
    const directory = scratch()
    const path = join(directory, 'app.sqlite')
    const db = new Database(path)
    migrate(db, server.clock)
    db.run("INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (99, 'from_the_future', 'abc', '2030-01-01T00:00:00.000Z')")
    expect(() => migrate(db, server.clock)).toThrow(/newer|unknown/i)
    db.close()
  })
})

// ---- housekeeping ----------------------------------------------------------------------------------------------------------

describe('housekeeping and the right to be forgotten', () => {
  const day = 86_400_000
  const ctx = () => server.app.context

  async function populate(): Promise<void> {
    const admin = await server.signIn()
    const patch = (id: string, body: unknown) => server.api(`/api/admin/inquiries/${id}`, { method: 'PATCH', body, headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf } })
    const patchQuote = (id: string, body: unknown) => server.api(`/api/admin/quote-requests/${id}`, { method: 'PATCH', body, headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf } })
    for (const subject of ['open', 'closed', 'archived', 'answered']) await server.api('/api/contact', { body: contact({ subject, email: `${subject}@example.com` }) })
    const id = (subject: string) => server.db.get<{ id: string }>('SELECT id FROM inquiries WHERE subject = ?', [subject])!.id
    await patch(id('closed'), { status: 'closed' })
    await patch(id('archived'), { archived: true })
    await patch(id('answered'), { status: 'answered' })
    for (const description of ['open request for the site', 'declined request for the site', 'closed request for the site', 'accepted request for the site']) await server.api('/api/quote-requests', { body: quote({ description, email: `${description.split(' ')[0]}@example.com` }) })
    const quoteId = (word: string) => server.db.get<{ id: string }>('SELECT id FROM quote_requests WHERE description LIKE ?', [`${word}%`])!.id
    await patchQuote(quoteId('declined'), { status: 'declined' })
    await patchQuote(quoteId('closed'), { status: 'closed' })
    await patchQuote(quoteId('accepted'), { status: 'accepted' })
    await server.app.context.notifier.processDue()
  }

  it('deletes nothing by age unless a retention period is set', async () => {
    await populate()
    server.clock.advance(5000 * day)
    const result = runMaintenance(ctx())
    expect(result).toMatchObject({ inquiries: 0, quoteRequests: 0, deliveries: 0, retentionDays: null })
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 4 })
  })

  it('deletes what is finished and old when a retention period is set, and keeps what is open or recent', async () => {
    await server.close()
    server = await startServer({ env: { RETENTION_DAYS: '365' } })
    await populate()
    const subjects = () => server.db.all<{ subject: string }>('SELECT subject FROM inquiries ORDER BY subject').map((row) => row.subject)
    server.clock.advance(300 * day)
    expect(runMaintenance(ctx())).toMatchObject({ inquiries: 0, quoteRequests: 0, deliveries: 0 }) // not old enough yet
    server.clock.advance(70 * day)
    const result = runMaintenance(ctx())
    expect(result).toMatchObject({ inquiries: 2, quoteRequests: 2, retentionDays: 365 })
    expect(result.deliveries).toBeGreaterThan(0)
    expect(subjects()).toEqual(['answered', 'open']) // an open or merely answered one is never removed by age
    expect(server.db.all<{ description: string }>('SELECT description FROM quote_requests ORDER BY description').map((row) => row.description.split(' ')[0])).toEqual(['accepted', 'open'])
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_request_items WHERE quote_request_id NOT IN (SELECT id FROM quote_requests)')).toEqual({ n: 0 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM email_deliveries WHERE related_id NOT IN (SELECT id FROM inquiries UNION SELECT id FROM quote_requests) AND status = \'pending\'')).toEqual({ n: 0 })
  })

  it('removes expired sessions and only those', async () => {
    const idle = await server.signIn('admin', 'one@site.test')
    server.clock.advance(11 * 3_600_000) // the first session has now sat unused for eleven hours
    const current = await server.signIn('admin', 'two@site.test')
    expect(server.db.get('SELECT COUNT(*) AS n FROM admin_sessions')).toEqual({ n: 2 })
    expect(runMaintenance(ctx()).expiredSessions).toBe(1)
    expect(server.db.get('SELECT COUNT(*) AS n FROM admin_sessions')).toEqual({ n: 1 })
    expect((await server.api('/api/admin/session', { headers: { Cookie: current.cookie } })).status).toBe(200)
    expect((await server.api('/api/admin/session', { headers: { Cookie: idle.cookie } })).status).toBe(401)
    expect(runMaintenance(ctx()).expiredSessions).toBe(0)
  })

  it('erases everything held about one address, whatever the capitals, and nothing about anyone else', async () => {
    await server.api('/api/contact', { body: contact({ email: 'Forget.Me@Example.com', subject: 'first' }) })
    await server.api('/api/contact', { body: contact({ email: 'forget.me@example.com', subject: 'second' }) })
    await server.api('/api/quote-requests', { body: quote({ email: 'forget.me@example.com' }) })
    await server.api('/api/contact', { body: contact({ email: 'keep.me@example.com', subject: 'third' }) })
    await server.api('/api/quote-requests', { body: quote({ email: 'keep.me@example.com', description: 'A different description for another person.' }) })
    await server.app.context.notifier.processDue()
    const admin = await server.signIn()
    await server.api('/api/admin/quote-requests', { headers: { Cookie: admin.cookie } })
    const noted = server.db.get<{ id: string }>("SELECT id FROM quote_requests WHERE email = 'forget.me@example.com'")!.id
    await server.api(`/api/admin/quote-requests/${noted}`, { method: 'PATCH', body: { addNote: 'internal note' }, headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf } })
    server.db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, created_at, updated_at) VALUES ('d1', 'inquiry_status', 'inquiry', 'x', 'FORGET.ME@example.com', 'en', 'accepted', ?, ?)", [server.clock.now().toISOString(), server.clock.now().toISOString()])
    const result = eraseByEmail(ctx(), '  Forget.ME@example.com ')
    expect(result).toMatchObject({ inquiries: 2, quoteRequests: 1 })
    expect(result.deliveries).toBeGreaterThanOrEqual(1)
    const left = JSON.stringify([...server.db.all('SELECT * FROM inquiries'), ...server.db.all('SELECT * FROM quote_requests'), ...server.db.all('SELECT * FROM email_deliveries'), ...server.db.all('SELECT * FROM quote_request_notes')])
    expect(left.toLowerCase()).not.toContain('forget.me')
    expect(left).not.toContain('internal note')
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 1 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: 1 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_request_items WHERE quote_request_id NOT IN (SELECT id FROM quote_requests)')).toEqual({ n: 0 })
    expect(eraseByEmail(ctx(), 'forget.me@example.com')).toEqual({ inquiries: 0, quoteRequests: 0, deliveries: 0 })
  })
})

// ---- shutting down ---------------------------------------------------------------------------------------------------------

describe('shutting down', () => {
  it('lets the request in progress finish, then stops listening, and can be asked twice', async () => {
    const seen = server.app.context.stats.requests
    const pending = server.api('/api/services')
    while (server.app.context.stats.requests === seen) await new Promise((resolve) => setImmediate(resolve)) // the server has taken it
    await server.app.close()
    expect((await pending).status).toBe(200)
    await expect(server.api('/api/services')).rejects.toThrow()
    await expect(server.app.close()).resolves.toBeUndefined()
  })

  it('waits for an e-mail being sent before it lets go of the outbox', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const original = server.mailer.send.bind(server.mailer)
    server.mailer.send = async (message) => {
      await gate
      return original(message)
    }
    await server.api('/api/contact', { body: contact() })
    await new Promise((resolve) => setImmediate(resolve))
    let closed = false
    const closing = server.app.close().then(() => (closed = true))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(closed).toBe(false)
    release()
    await closing
    expect(server.db.get('SELECT status FROM email_deliveries')).toEqual({ status: 'accepted' })
  })
})
