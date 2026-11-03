import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, type App } from '../src/app.ts'
import { loadConfig, type Config } from '../src/config.ts'
import { Database } from '../src/db/database.ts'
import { migrate } from '../src/db/migrate.ts'
import { seedCatalog } from '../src/db/seed.ts'
import { createLogger, type Logger } from '../src/lib/logger.ts'
import type { Clock } from '../src/lib/time.ts'
import { createMailer, type Mailer } from '../src/modules/notifications/mailer.ts'
import type { MailMessage } from '../src/modules/notifications/mime.ts'
import { MailError } from '../src/modules/notifications/smtp.ts'
import { createUser } from '../src/modules/auth/users.ts'
import type { Role } from '../src/modules/auth/permissions.ts'

/** A clock a test moves by hand. */
export class TestClock implements Clock {
  private time: number
  constructor(start = Date.parse('2026-11-03T10:00:00.000Z')) {
    this.time = start
  }
  now(): Date {
    return new Date(this.time)
  }
  advance(ms: number): void {
    this.time += ms
  }
}

/** A mailer that records what it was given, and can be told to fail. */
export class RecordingMailer implements Mailer {
  readonly name = 'recording'
  readonly sent: MailMessage[] = []
  private failures: MailError[] = []
  attempts = 0

  failNext(error: MailError, times = 1): void {
    for (let i = 0; i < times; i += 1) this.failures.push(error)
  }
  async send(message: MailMessage): Promise<{ providerMessageId: string | null }> {
    this.attempts += 1
    const failure = this.failures.shift()
    if (failure) throw failure
    this.sent.push(message)
    return { providerMessageId: `test-${this.sent.length}` }
  }
}

export interface TestServer {
  app: App
  config: Config
  db: Database
  clock: TestClock
  mailer: RecordingMailer
  logs: string[]
  url: string
  /** A request with JSON in and JSON out. */
  api(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string>; raw?: string }): Promise<{ status: number; headers: Headers; json: any; text: string }>
  /** A request that returns the raw response (HTML pages, redirects). */
  fetch(path: string, init?: RequestInit): Promise<Response>
  /** Creates an administrator and signs in; returns the cookie and the CSRF token. */
  signIn(role?: Role, email?: string): Promise<{ cookie: string; csrf: string; email: string }>
  close(): Promise<void>
}

export const GOOD_PASSWORD = 'a-long-test-passphrase-1'

const baseEnv: Record<string, string> = {
  APP_ENV: 'test',
  DATABASE_PATH: ':memory:',
  CORS_ORIGINS: 'https://site.test',
  EMAIL_PROVIDER: 'file',
  EMAIL_FILE_DIR: join(tmpdir(), 'cc-test-mail'),
  EMAIL_FROM: 'Site <no-reply@site.test>',
  NOTIFY_TO: 'owner@site.test',
  NOTIFY_LANGUAGE: 'en',
  BRAND_NAME: 'Test Brand',
  RATE_LIMITS: 'false',
}

export async function startServer(options: { env?: Record<string, string>; seed?: boolean; mailer?: Mailer | null; realMailer?: boolean; databasePath?: string } = {}): Promise<TestServer> {
  const env = { ...baseEnv, ...options.env }
  if (options.databasePath) env.DATABASE_PATH = options.databasePath
  const config = loadConfig(env)
  const clock = new TestClock()
  const db = new Database(config.databasePath)
  migrate(db, clock)
  const logs: string[] = []
  const log: Logger = createLogger({ level: 'debug', write: (line) => void logs.push(line) })
  const mailer = options.realMailer ? createMailer(config.email) : options.mailer === undefined ? new RecordingMailer() : options.mailer
  const app = createApp({ config, db, clock, log, mailer })
  if (options.seed !== false) seedCatalog(app.context)
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', () => resolve()))
  const address = app.server.address()
  const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  let counter = 0

  const rawFetch = (path: string, init: RequestInit = {}) => fetch(`${url}${path}`, { redirect: 'manual', ...init })

  const server: TestServer = {
    app,
    config,
    db,
    clock,
    mailer: mailer as RecordingMailer,
    logs,
    url,
    fetch: rawFetch,
    async api(path, init = {}) {
      const headers: Record<string, string> = { ...init.headers }
      let body: string | undefined
      if (init.raw !== undefined) body = init.raw
      else if (init.body !== undefined) body = JSON.stringify(init.body)
      if (body !== undefined && !('Content-Type' in headers) && !('content-type' in headers)) headers['Content-Type'] = 'application/json'
      const response = await rawFetch(path, { method: init.method ?? (body !== undefined ? 'POST' : 'GET'), headers, body })
      const text = await response.text()
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      return { status: response.status, headers: response.headers, json, text }
    },
    async signIn(role = 'admin', email = `user${counter++}@site.test`) {
      await createUser(db, clock, { email, password: GOOD_PASSWORD, role })
      const response = await server.api('/api/admin/login', { body: { email, password: GOOD_PASSWORD } })
      if (response.status !== 200) throw new Error(`sign-in failed in a test: ${response.status} ${response.text}`)
      const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0]
      return { cookie, csrf: response.json.data.csrfToken as string, email }
    },
    async close() {
      await app.close()
      db.close()
    },
  }
  return server
}

/** A contact message the server accepts. */
export const contact = (overrides: Record<string, unknown> = {}) => ({
  form: 'contact',
  language: 'en',
  kind: 'project',
  name: 'Anna Kovács',
  email: 'anna@example.com',
  subject: 'A new website',
  message: 'I would like a small website for my bakery in Utrecht. Can we talk?',
  consent: true,
  ...overrides,
})

/** A quote request the server accepts. */
export const quote = (overrides: Record<string, unknown> = {}) => ({
  form: 'quote',
  version: 2,
  language: 'en',
  items: [{ need: 'website', plan: 'launch', extras: ['pages'] }],
  description: 'A small website for a bakery, with opening hours and a contact form.',
  objective: 'present',
  reference: null,
  timing: 'months',
  requirements: null,
  name: 'Anna Kovács',
  email: 'anna@example.com',
  phone: null,
  consent: true,
  ...overrides,
})
