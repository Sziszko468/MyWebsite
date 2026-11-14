import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { GOOD_PASSWORD } from './helpers.ts'

/**
 * Two real server processes on ONE database file, each taking bookings at the same moment. Inside one process the single writer keeps two bookings apart; this
 * is the proof that it also holds across processes (another instance of the server, a script, a restart overlapping the old one): SQLite serialises the
 * write transactions of the two connections, and the trigger of migration 0011 is behind the application's own check.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MAIN = join(root, 'server', 'src', 'main.ts')
const CLI = join(root, 'server', 'src', 'cli.ts')

const cleanup: string[] = []
const children: ChildProcess[] = []
afterEach(async () => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill()
  await new Promise((resolve) => setTimeout(resolve, 200))
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

function environment(overrides: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) if (/^(APP_|PORT$|HOST$|PUBLIC_URL|API_PUBLIC_URL|CORS_|DATABASE_|MIGRATE_|SEED_|TRUST_|LOG_|REQUIRE_|EMAIL_|NOTIFY_|BRAND_|SMTP_|RETENTION_|ADMIN_|DEPLOY_|STATIC_|RATE_|BODY_|VITE_)/.test(key)) delete env[key]
  return { ...env, ...overrides }
}

function startServer(env: Record<string, string>): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', MAIN], { cwd: root, env: environment({ PORT: '0', ...env }), stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(child)
    let output = ''
    let settled = false
    const timer = setTimeout(() => !settled && reject(new Error(`the server did not start in time:\n${output}`)), 40_000)
    const read = (chunk: Buffer) => {
      output += chunk
      const match = /"msg":"server listening".*?"port":(\d+)/.exec(output)
      if (match && !settled) {
        settled = true
        clearTimeout(timer)
        resolve({ url: `http://127.0.0.1:${match[1]}` })
      }
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.on('error', reject)
    child.on('close', (code) => !settled && reject(new Error(`the server exited with code ${code}:\n${output}`)))
  })
}

function adminCreate(env: Record<string, string>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, 'admin', 'create', 'owner@site.test', 'admin'], { cwd: root, env: environment({ ...env, ADMIN_PASSWORD: GOOD_PASSWORD }), stdio: ['pipe', 'pipe', 'pipe'] })
    children.push(child)
    child.on('error', reject)
    child.on('close', (code) => resolve(code))
    child.stdin.end('')
  })
}

async function call(url: string, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...init.headers }
  if (init.body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${url}${path}`, { method: init.method ?? (init.body === undefined ? 'GET' : 'POST'), headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), redirect: 'manual' })
  const text = await response.text()
  return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null }
}

describe('two server processes on one database', () => {
  it('lets exactly one of eight simultaneous bookings for one slot succeed, whichever process it reaches', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc-booking-'))
    cleanup.push(directory)
    const env = { DATABASE_PATH: join(directory, 'app.sqlite'), APP_SECRET: 'a-secret-for-this-test-only-0123456789', RATE_LIMITS: 'false', EMAIL_PROVIDER: 'none' }
    const first = await startServer(env)
    expect(await adminCreate(env)).toBe(0)
    const second = await startServer({ ...env, SEED_ON_START: 'false' })

    const login = await call(first.url, '/api/admin/login', { body: { email: 'owner@site.test', password: GOOD_PASSWORD } })
    expect(login.status).toBe(200)
    const headers = { Cookie: (login.headers.get('set-cookie') ?? '').split(';')[0], 'X-CSRF-Token': login.json.data.csrfToken as string }
    const send = async (method: string, path: string, body: unknown) => {
      const answer = await call(first.url, path, { method, body, headers })
      expect(answer.status, `${method} ${path}: ${JSON.stringify(answer.json)}`).toBeLessThan(300)
    }
    await send('PUT', '/api/admin/consultation-types/discovery', { durationMinutes: 30, enabled: true })
    // Open all day, every day, in UTC: a slot exists whenever this test happens to run.
    await send('PUT', '/api/admin/booking-hours', { hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '00:00', end: '24:00' })) })
    await send('PUT', '/api/admin/booking-settings', { enabled: true, timeZone: 'UTC', slotStepMinutes: 30, minNoticeHours: 1, horizonDays: 30 })

    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    // The other process sees the same configuration, because it is the same file.
    const days = await call(second.url, `/api/consultations/types/discovery/days?from=${today}&to=${tomorrow}`)
    expect(days.status, JSON.stringify(days.json)).toBe(200)
    const start = (days.json.data.days as { slots: { start: string }[] }[]).flatMap((day) => day.slots)[0]?.start
    expect(start).toBeTruthy()

    const urls = [first.url, second.url]
    const attempts = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        call(urls[index % 2], '/api/consultations/bookings', { body: { language: 'en', type: 'discovery', start, name: 'Racer', email: `racer${index}@example.com`, consent: true } }),
      ),
    )
    expect(attempts.map((attempt) => attempt.status).sort()).toEqual([201, 409, 409, 409, 409, 409, 409, 409])
    expect(attempts.filter((attempt) => attempt.status === 409).every((attempt) => attempt.json.error.details.reason === 'slot_unavailable')).toBe(true)

    // Both processes read the same file, so both see the one booking (a session is in the database too).
    for (const url of urls) expect((await call(url, '/api/admin/bookings', { headers })).json.meta.total).toBe(1)
  }, 120_000)
})
