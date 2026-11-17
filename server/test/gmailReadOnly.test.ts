import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConfigError, loadConfig } from '../src/config.ts'
import { GMAIL_SCOPES } from '../src/modules/gmail/tokenService.ts'
import { ACCESS_TOKEN, FakeGoogle, GMAIL_ENV, gmailMessage } from './gmailKit.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * PROMPT 27: the Gmail integration only READS. It requires one OAuth scope, gmail.readonly; it lists the inbox and fetches messages with two
 * `GET` calls; it sends, modifies, deletes and drafts nothing; and it shares no credential with the Google Drive backup. These tests hold that
 * in two ways: they read the module's source (so a new call cannot be added unnoticed), and they run a real synchronisation against the
 * stand-in for Google and look at every request it made. Nothing here reaches the network; every value is made up.
 */

const READ = 'https://www.googleapis.com/auth/gmail.readonly'
const SEND = 'https://www.googleapis.com/auth/gmail.send'

const root = join(import.meta.dirname, '..', '..')
const moduleDirectory = join(root, 'server', 'src', 'modules', 'gmail')

/** The code of a file without its comments (a comment may say what the code does not do). A `//` inside an address is not a comment. */
const codeOf = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

const filesUnder = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : filesUnder(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })

const moduleFiles = readdirSync(moduleDirectory).filter((name) => name.endsWith('.ts'))
const code = (name: string): string => codeOf(readFileSync(join(moduleDirectory, name), 'utf8'))

/**
 * The code of every source file of the server and the administration that has anything to do with Gmail, found once (the scan reads about nine
 * hundred files, and the whole suite runs in parallel: reading them twice made a CPU-bound test elsewhere time out). A file that never says
 * "gmail", "mail.google.com" or "users/me" cannot contain any of the patterns below, so it is skipped before its comments are stripped.
 */
let gmailRelated: { path: string; code: string }[] | null = null
function scanned(): { path: string; code: string }[] {
  gmailRelated ??= [...filesUnder(join(root, 'server', 'src')), ...filesUnder(join(root, 'src'))].flatMap((path) => {
    const raw = readFileSync(path, 'utf8')
    return /gmail|mail\.google\.com|users\/me/i.test(raw) ? [{ path, code: codeOf(raw) }] : []
  })
  return gmailRelated
}

describe('what the Gmail module asks of Google, read from its source', () => {
  it('has found the module (the checks below are not looking at nothing)', () => {
    expect(moduleFiles).toEqual(expect.arrayContaining(['api.ts', 'sync.ts', 'tokenService.ts', 'admin.ts']))
  })

  it('requires exactly one scope, gmail.readonly', () => {
    expect([...GMAIL_SCOPES]).toEqual([READ])
  })

  it('names no Gmail permission beyond reading, anywhere in the server or the administration (comments aside)', () => {
    const forbidden = /gmail\.send|gmail\.modify|gmail\.compose|gmail\.insert|gmail\.labels|gmail\.settings|mail\.google\.com\//i
    expect(scanned().length, 'the scan found the Gmail module itself').toBeGreaterThan(5)
    const offenders = scanned().filter((file) => forbidden.test(file.code))
    expect(offenders.map((file) => file.path.slice(root.length + 1))).toEqual([])
  })

  it('has no call that sends, drafts, changes, deletes or downloads an attachment', () => {
    const forbidden = /messages\/send|\/drafts|\/modify|batchModify|batchDelete|\/trash|\/untrash|\/import\b|\/insert\b|\/attachments\b|users\.messages\.(send|insert|import|delete|modify|trash)/i
    for (const name of moduleFiles) expect(forbidden.test(code(name)), name).toBe(false)
  })

  it('makes exactly two kinds of outbound request: one GET to Gmail and one POST to the token endpoint', () => {
    const calls = moduleFiles.map((name) => [name, (code(name).match(/fetchImpl\(/g) ?? []).length] as const).filter(([, n]) => n > 0)
    expect(calls).toEqual([
      ['api.ts', 1],
      ['tokenService.ts', 1],
    ])
    const verbs = moduleFiles.flatMap((name) => [...code(name).matchAll(/method:\s*'([A-Z]+)'/g)].map((match) => [name, match[1]]))
    expect(verbs).toEqual([
      ['api.ts', 'GET'],
      ['tokenService.ts', 'POST'],
    ])
  })

  it('reaches Gmail by two fixed paths only: the message list and one message', () => {
    const paths = [...code('api.ts').matchAll(/\bcall\(\s*(['`])([^'`]*)\1/g)].map((match) => match[2])
    expect(paths).toEqual(['/messages', '/messages/${id}'])
  })

  it('is the only code that talks to the Gmail API', () => {
    const outside = scanned().filter((file) => !file.path.startsWith(moduleDirectory) && /gmail\.googleapis\.com|users\/me\/messages/.test(file.code))
    expect(outside.map((file) => file.path.slice(root.length + 1))).toEqual([])
  })

  it('is not an e-mail sender: Gmail is not a provider the mailer can be switched to', () => {
    expect(() => loadConfig({ EMAIL_PROVIDER: 'gmail' })).toThrow(ConfigError)
    expect(readFileSync(join(root, 'server', 'src', 'config.ts'), 'utf8')).toMatch(/provider: 'none' \| 'smtp' \| 'file' \| 'resend'/)
  })
})

describe('the Gmail credentials and the Google Drive backup credentials share nothing', () => {
  it('never reads a Drive setting, and the backup never reads a Gmail one', () => {
    for (const name of moduleFiles) expect(/GOOGLE_DRIVE|config\.backup|backups\/|drive\.file/i.test(code(name)), `${name} must not touch the Drive backup`).toBe(false)
    const backups = filesUnder(join(root, 'server', 'src', 'modules', 'backups'))
    expect(backups.length).toBeGreaterThan(0)
    for (const file of backups) expect(/gmail/i.test(codeOf(readFileSync(file, 'utf8'))), `${file} must not touch Gmail`).toBe(false)
  })

  it('keeps the two sets of variable names apart in the configuration', () => {
    const config = loadConfig({ ...GMAIL_ENV, GOOGLE_DRIVE_CLIENT_ID: 'drive-id', GOOGLE_DRIVE_CLIENT_SECRET: 'drive-secret-0001', GOOGLE_DRIVE_REFRESH_TOKEN: 'drive-refresh-0002' })
    expect(config.gmail.clientId).toBe(GMAIL_ENV.GMAIL_CLIENT_ID)
    expect(config.gmail.clientSecret).toBe(GMAIL_ENV.GMAIL_CLIENT_SECRET)
    expect(config.gmail.refreshToken).toBe(GMAIL_ENV.GMAIL_REFRESH_TOKEN)
    expect(config.backup.clientId).toBe('drive-id')
    expect(config.backup.clientSecret).toBe('drive-secret-0001')
    expect(config.backup.refreshToken).toBe('drive-refresh-0002')
  })
})

describe('what a real synchronisation does, from the requests it made', () => {
  let server: TestServer | null = null
  afterEach(async () => {
    await server?.close()
    server = null
  })

  async function setup(tokenScopes?: string) {
    const google = new FakeGoogle()
    if (tokenScopes !== undefined) google.tokenScopes = tokenScopes
    const s = await startServer({ env: GMAIL_ENV, fetch: google.fetch })
    server = s
    google.add(gmailMessage({ id: 'r1' }), gmailMessage({ id: 'r2' }), gmailMessage({ id: 'r3', text: 'A third message.' }))
    return { google, s, sync: s.app.context.gmailSync, gmail: s.app.context.gmail }
  }

  it('lists and fetches with GET, asks for a token with POST, and makes no other request', async () => {
    const t = await setup()
    expect((await t.gmail.check()).connected).toBe(true)
    expect(await t.sync.run()).toMatchObject({ imported: 3, failed: 0, error: null })

    expect(t.google.count('token')).toBeGreaterThan(0)
    expect(t.google.count('list')).toBeGreaterThan(0)
    expect(t.google.count('get')).toBe(3)
    for (const request of t.google.requests) {
      const url = new URL(request.url)
      if (request.kind === 'token') {
        expect([request.method, url.origin, url.pathname]).toEqual(['POST', 'https://oauth2.googleapis.com', '/token'])
      } else {
        expect(request.method, request.url).toBe('GET')
        expect(url.origin).toBe('https://gmail.googleapis.com')
        expect(url.pathname, 'only the list and one message').toMatch(/^\/gmail\/v1\/users\/me\/messages(\/[^/]+)?$/)
        expect(request.authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
      }
    }
    expect(t.google.requests.some((request) => request.method !== 'GET' && request.kind !== 'token'), 'no write of any kind reaches Gmail').toBe(false)
  })

  it('runs a whole synchronisation on a token that was granted gmail.readonly and nothing else', async () => {
    const t = await setup(READ)
    expect(await t.sync.run()).toMatchObject({ imported: 3, error: null })
  })

  it('runs it just as well on a token that was granted gmail.send as well (an earlier authorization)', async () => {
    const t = await setup(`${READ} ${SEND}`)
    expect(await t.sync.run()).toMatchObject({ imported: 3, error: null })
  })

  it('imports nothing and says why when the token lacks gmail.readonly, even if it can send', async () => {
    const t = await setup(SEND)
    const result = await t.sync.run()
    expect(result).toMatchObject({ imported: 0, error: 'insufficient_scope' })
    expect(t.google.count('list'), 'it never reaches Gmail without the permission').toBe(0)
    expect(t.google.count('get')).toBe(0)
  })
})
