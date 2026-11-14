import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { GOOD_PASSWORD } from './helpers.ts'

/**
 * The real thing: the same commands an operator runs (`node server/src/main.ts`, `node server/src/cli.ts`), in an
 * empty folder, with only environment variables for configuration. Nothing here is imported from the server's
 * source, so this is what proves that a clean checkout starts.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MAIN = join(root, 'server', 'src', 'main.ts')
const CLI = join(root, 'server', 'src', 'cli.ts')

const cleanup: string[] = []
const children: ChildProcess[] = []
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) child.kill()
  }
  await new Promise((resolve) => setTimeout(resolve, 100))
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

const folder = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'cc-proc-'))
  cleanup.push(directory)
  return directory
}

/** The environment of a clean server: the machine's own (PATH and so on), none of this project's settings, then the given ones. */
function environment(overrides: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) if (/^(APP_|PORT$|HOST$|PUBLIC_URL|API_PUBLIC_URL|CORS_|DATABASE_|MIGRATE_|SEED_|TRUST_|LOG_|REQUIRE_|EMAIL_|NOTIFY_|BRAND_|SMTP_|RETENTION_|ADMIN_|DEPLOY_|STATIC_|RATE_|BODY_|VITE_)/.test(key)) delete env[key]
  return { ...env, ...overrides }
}

interface Finished {
  code: number | null
  stdout: string
  stderr: string
}

function cli(args: string[], env: Record<string, string>, input?: string): Promise<Finished> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', CLI, ...args], { cwd: root, env: environment(env), stdio: ['pipe', 'pipe', 'pipe'] })
    children.push(child)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.stdin.end(input ?? '')
  })
}

interface Running {
  child: ChildProcess
  port: number
  url: string
  output(): string
  stop(): Promise<number | null>
}

function server(env: Record<string, string>): Promise<Running> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', MAIN], { cwd: root, env: environment({ PORT: '0', ...env }), stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(child)
    let output = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) reject(new Error(`the server did not start in time. Output so far:\n${output}`))
    }, 30_000)
    const exited = new Promise<number | null>((done) => child.on('close', (code) => done(code)))
    const read = (chunk: Buffer) => {
      output += chunk
      const match = /"msg":"server listening".*?"port":(\d+)/.exec(output)
      if (match && !settled) {
        settled = true
        clearTimeout(timer)
        const port = Number(match[1])
        resolve({
          child,
          port,
          url: `http://127.0.0.1:${port}`,
          output: () => output,
          stop: async () => {
            child.kill()
            return exited
          },
        })
      }
    }
    child.stdout.on('data', read)
    child.stderr.on('data', read)
    child.on('error', reject)
    child.on('close', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error(`the server exited with code ${code} before it was listening. Output:\n${output}`))
      }
    })
  })
}

const exits = (env: Record<string, string>): Promise<Finished> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', MAIN], { cwd: root, env: environment(env), stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(child)
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`the server did not exit. Output:\n${stdout}${stderr}`))
    }, 20_000)
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })

const json = async (url: string, path: string, init: RequestInit = {}) => {
  const response = await fetch(`${url}${path}`, { redirect: 'manual', ...init })
  const text = await response.text()
  return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null }
}

const contact = (overrides: Record<string, unknown> = {}) => ({
  form: 'contact', language: 'en', kind: 'project', name: 'Anna Kovács', email: 'anna@example.com', subject: 'From the real process', message: 'A message sent to a server that was started from nothing.', consent: true, ...overrides,
})

describe('a clean start', () => {
  it('migrates and loads the catalogue by itself, and is ready to take a message, from an empty folder and a handful of settings', async () => {
    const directory = folder()
    const running = await server({ DATABASE_PATH: join(directory, 'data', 'app.sqlite'), APP_SECRET: 'a-secret-for-this-test-only-0123456789' })
    expect(running.output()).toContain('"msg":"migrations applied"')
    expect(running.output()).toContain('"msg":"catalogue loaded into an empty database"')
    expect(existsSync(join(directory, 'data', 'app.sqlite'))).toBe(true)
    expect((await json(running.url, '/api/health')).status).toBe(200)
    const ready = await json(running.url, '/api/ready')
    expect(ready.status).toBe(200)
    expect(ready.json.data).toMatchObject({ status: 'ready', checks: { database: 'ok', migrations: 'current', email: 'off' } })
    expect((await json(running.url, '/api/services')).json.data).toHaveLength(4)
    expect((await json(running.url, '/api/packages')).json.data).toHaveLength(4)
    const sent = await json(running.url, '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact()) })
    expect(sent.status).toBe(201)
    expect(sent.json.data.reference).toMatch(/^C-[A-Z0-9]{8}$/)
    expect(running.output()).not.toContain('anna@example.com')
  }, 60_000)

  it('keeps its data across a restart, and does not load the catalogue a second time', async () => {
    const directory = folder()
    const env = { DATABASE_PATH: join(directory, 'app.sqlite'), APP_SECRET: 'a-secret-for-this-test-only-0123456789' }
    const first = await server(env)
    const reference = (await json(first.url, '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact()) })).json.data.reference
    await first.stop()
    const second = await server(env)
    expect(second.output()).not.toContain('catalogue loaded')
    expect(second.output()).not.toContain('migrations applied')
    expect((await json(second.url, '/api/services')).json.data).toHaveLength(4)
    // The message is still there: look at it the way the owner would, signed in.
    const created = await cli(['admin', 'create', 'owner@site.test', 'admin'], { ...env, ADMIN_PASSWORD: GOOD_PASSWORD })
    expect(created.code).toBe(0)
    const login = await json(second.url, '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'owner@site.test', password: GOOD_PASSWORD }) })
    expect(login.status).toBe(200)
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
    const list = await json(second.url, '/api/admin/inquiries', { headers: { Cookie: cookie } })
    expect(list.json.data.map((row: { reference: string }) => row.reference)).toEqual([reference])
    if (process.platform !== 'win32') expect(await second.stop()).toBe(null) // (a signal handler's clean exit cannot be observed on Windows, which ends the process outright)
  }, 90_000)

  it('refuses to start without its migrations when told not to apply them, and says why', async () => {
    const directory = folder()
    const result = await exits({ DATABASE_PATH: join(directory, 'app.sqlite'), MIGRATE_ON_START: 'false' })
    expect(result.code).toBe(1)
    expect(result.stdout + result.stderr).toContain('pending migrations')
  }, 30_000)

  it('refuses to start on a port that is taken, with the reason', async () => {
    const directory = folder()
    const first = await server({ DATABASE_PATH: join(directory, 'one.sqlite') })
    const second = await exits({ DATABASE_PATH: join(directory, 'two.sqlite'), PORT: String(first.port) })
    expect(second.code).toBe(1)
    expect(second.stderr).toMatch(/could not start.*(EADDRINUSE|address already in use)/i)
  }, 60_000)

  it('refuses an invalid configuration with exit status 78, listing every problem, before it opens anything', async () => {
    const directory = folder()
    const result = await exits({ APP_ENV: 'production', CORS_ORIGINS: '*', EMAIL_PROVIDER: 'file', DATABASE_PATH: join(directory, 'never.sqlite') })
    expect(result.code).toBe(78)
    for (const name of ['APP_SECRET', 'CORS_ORIGINS', 'EMAIL_PROVIDER']) expect(result.stderr, name).toContain(name)
    expect(result.stdout).toBe('')
    expect(existsSync(join(directory, 'never.sqlite'))).toBe(false)
  }, 30_000)

  it('refuses a half-made provider setup the same way: a missing key and sender, a plain-http API, a webhook secret that is not one, one Cloudflare value alone', async () => {
    const directory = folder()
    const result = await exits({ EMAIL_PROVIDER: 'resend', EMAIL_API_URL: 'http://api.example.com', EMAIL_WEBHOOK_SECRET: 'not-a-secret', CLOUDFLARE_API_TOKEN: 'token', DATABASE_PATH: join(directory, 'never2.sqlite') })
    expect(result.code).toBe(78)
    for (const name of ['EMAIL_FROM', 'EMAIL_API_KEY', 'EMAIL_API_URL', 'EMAIL_WEBHOOK_SECRET', 'CLOUDFLARE_API_TOKEN']) expect(result.stderr, name).toContain(name)
    expect(result.stderr).not.toContain('not-a-secret')
    expect(existsSync(join(directory, 'never2.sqlite'))).toBe(false)
  }, 30_000)
})

describe('the operator\'s commands', () => {
  const env = (directory: string) => ({ DATABASE_PATH: join(directory, 'app.sqlite'), APP_SECRET: 'a-secret-for-this-test-only-0123456789' })

  it('check prints the configuration without a single secret', async () => {
    const directory = folder()
    const result = await cli(['check'], { ...env(directory), SMTP_PASSWORD: 'smtp-password-123', SMTP_USER: 'smtp-user', SMTP_HOST: 'smtp.site.test', EMAIL_PROVIDER: 'smtp', EMAIL_FROM: 'Site <no-reply@site.test>', NOTIFY_TO: 'owner@site.test' })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Configuration is valid.')
    expect(result.stdout).toContain('"smtp"')
    for (const secret of ['a-secret-for-this-test-only', 'smtp-password-123', 'smtp-user', 'owner@site.test', 'no-reply@site.test']) expect(result.stdout, secret).not.toContain(secret)
    expect(existsSync(join(directory, 'app.sqlite'))).toBe(false) // it only reads settings
  }, 30_000)

  it('migrate and seed are safe to run again', async () => {
    const e = env(folder())
    expect((await cli(['migrate'], e)).stdout).toMatch(/Applied migrations: 1, 2, 3, 4, 5, 6, 7, 8, 9\.\s+Schema version 9\./)
    expect((await cli(['migrate'], e)).stdout).toMatch(/The schema is up to date\./)
    expect((await cli(['seed'], e)).stdout).toContain('Loaded 4 services, 4 packages, 8 add-ons and 6 FAQ entries.')
    expect((await cli(['seed'], e)).stdout).toContain('The catalogue is not empty: nothing was changed.')
  }, 60_000)

  it('creates administrators with a checked password, from the environment or from a pipe, and lists them', async () => {
    const e = env(folder())
    const weak = await cli(['admin', 'create', 'owner@site.test'], { ...e, ADMIN_PASSWORD: 'short' })
    expect(weak.code).toBe(1)
    expect(weak.stderr).toMatch(/at least 12/)
    const common = await cli(['admin', 'create', 'owner@site.test'], { ...e, ADMIN_PASSWORD: 'password1234' })
    expect(common.code).toBe(1)
    expect(common.stderr).toMatch(/too common/)
    expect((await cli(['admin', 'create', 'owner@site.test', 'admin'], { ...e, ADMIN_PASSWORD: GOOD_PASSWORD })).stdout).toContain('Created admin owner@site.test.')
    const piped = await cli(['admin', 'create', 'editor@site.test', 'editor'], e, `${GOOD_PASSWORD}\n${GOOD_PASSWORD}\n`)
    expect(piped.code, piped.stderr).toBe(0)
    expect(piped.stdout).toContain('Created editor editor@site.test.')
    const mismatch = await cli(['admin', 'create', 'third@site.test'], e, `${GOOD_PASSWORD}\nsomething else entirely\n`)
    expect(mismatch.code).toBe(1)
    expect(mismatch.stderr).toContain('The two passwords are not the same.')
    expect((await cli(['admin', 'create', 'x@site.test', 'superuser'], { ...e, ADMIN_PASSWORD: GOOD_PASSWORD })).stderr).toContain('The role must be admin or editor.')
    expect((await cli(['admin', 'create', 'OWNER@site.test'], { ...e, ADMIN_PASSWORD: GOOD_PASSWORD })).stderr).toMatch(/already exists/)
    const list = (await cli(['admin', 'list'], e)).stdout
    expect(list).toMatch(/owner@site\.test\tadmin\tactive\tlast sign-in: never/)
    expect(list).toMatch(/editor@site\.test\teditor\tactive/)
    expect(list).not.toContain('third@site.test')
    expect(list + weak.stdout + piped.stdout).not.toContain(GOOD_PASSWORD)
  }, 90_000)

  it('disables an account and signs it out at once, and enables it again', async () => {
    const directory = folder()
    const e = env(directory)
    await cli(['admin', 'create', 'owner@site.test'], { ...e, ADMIN_PASSWORD: GOOD_PASSWORD })
    const running = await server(e)
    const body = JSON.stringify({ email: 'owner@site.test', password: GOOD_PASSWORD })
    const login = await json(running.url, '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
    expect((await json(running.url, '/api/admin/session', { headers: { Cookie: cookie } })).status).toBe(200)
    expect((await cli(['admin', 'disable', 'owner@site.test'], e)).stdout).toContain('owner@site.test is now disabled.')
    expect((await json(running.url, '/api/admin/session', { headers: { Cookie: cookie } })).status).toBe(401)
    expect((await json(running.url, '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status).toBe(401)
    expect((await cli(['admin', 'enable', 'owner@site.test'], e)).stdout).toContain('is now active.')
    expect((await json(running.url, '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status).toBe(200)
    // A new password closes every session the account had.
    expect((await cli(['admin', 'password', 'owner@site.test'], { ...e, ADMIN_PASSWORD: 'another-long-passphrase-2' })).stdout).toMatch(/Password changed for owner@site\.test; \d+ session\(s\) closed\./)
    expect((await json(running.url, '/api/admin/session', { headers: { Cookie: cookie } })).status).toBe(401)
    expect((await json(running.url, '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })).status).toBe(401)
    expect((await cli(['admin', 'disable', 'nobody@site.test'], e)).stderr).toContain('There is no administrator nobody@site.test.')
  }, 90_000)

  it('writes a consistent backup of the database while the server is running, and refuses to overwrite one', async () => {
    const directory = folder()
    const e = env(directory)
    const running = await server(e)
    const reference = (await json(running.url, '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact()) })).json.data.reference
    const file = join(directory, 'backups', 'copy.sqlite')
    const made = await cli(['backup', file], e)
    expect(made.code, made.stderr).toBe(0)
    expect(made.stdout).toMatch(/^Backup written to .*copy\.sqlite \(\d+ bytes\)\.$/m)
    const again = await cli(['backup', file], e)
    expect(again.code).toBe(1)
    expect(again.stderr).toContain('already exists')
    expect((await cli(['backup'], e)).stderr).toContain('Give the file to write the backup to.')
    // The copy is a database of its own: open it and find what the live one held.
    const { Database } = await import('../src/db/database.ts')
    const copy = new Database(file)
    try {
      expect(copy.get<{ reference: string }>('SELECT reference FROM inquiries')?.reference).toBe(reference)
      expect(copy.get('PRAGMA integrity_check')).toEqual({ integrity_check: 'ok' })
      expect(copy.get('SELECT COUNT(*) AS n FROM services')).toEqual({ n: 4 })
    } finally {
      copy.close()
    }
  }, 60_000)

  it('runs maintenance and erases an address only when the operator confirms', async () => {
    const directory = folder()
    const e = env(directory)
    const running = await server(e)
    await json(running.url, '/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(contact({ email: 'forget.me@example.com' })) })
    expect((await cli(['maintenance'], e)).stdout).toMatch(/"inquiries": 0/)
    const refused = await cli(['erase', 'forget.me@example.com'], e, 'no\n')
    expect(refused.code).toBe(1)
    expect(refused.stderr).toContain('Cancelled.')
    const done = await cli(['erase', 'Forget.Me@example.com'], e, 'yes\n')
    expect(done.code, done.stderr).toBe(0)
    expect(JSON.parse(done.stdout.slice(done.stdout.indexOf('{')))).toMatchObject({ inquiries: 1 })
    expect((await cli(['frobnicate'], e)).code).toBe(2)
  }, 90_000)
})
