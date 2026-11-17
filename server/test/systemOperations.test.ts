import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { beginRun, completeRun } from '../src/modules/backups/records.ts'
import { diskData } from '../src/modules/system/operations.ts'
import { TEST_KEY_TEXT } from './driveKit.ts'
import { activateAssistant, contact, startServer, type TestServer } from './helpers.ts'

/**
 * The command center's first screen (PROMPT 25): `GET /api/admin/system` now carries an `operations` part. What it says, who may read it,
 * and that it never carries a secret, a path, a customer's address or the text of a provider's answer.
 */

let server: TestServer | null = null
const folders: string[] = []
afterEach(async () => {
  await server?.close()
  server = null
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

async function setup(env: Record<string, string> = {}, headers: Record<string, string> = {}) {
  server = await startServer({ env })
  const admin = await server.signIn('admin', 'admin@site.test')
  const read = async (extra: Record<string, string> = {}) => {
    const response = await server!.api('/api/admin/system', { headers: { Cookie: admin.cookie, ...headers, ...extra } })
    expect(response.status).toBe(200)
    return { operations: response.json.data.operations, text: response.text, all: response.json.data }
  }
  return { s: server, admin, read }
}

const DRIVE = { GOOGLE_DRIVE_CLIENT_ID: 'drive-id-1', GOOGLE_DRIVE_CLIENT_SECRET: 'drive-secret-VALUE-2', GOOGLE_DRIVE_REFRESH_TOKEN: 'drive-refresh-VALUE-3' }

describe('the backup part', () => {
  it('says "disabled" when no Drive backup is set up, and "never" when it is set up and has not run', async () => {
    const off = await setup()
    expect((await off.read()).operations.backup).toMatchObject({ enabled: false, encrypted: false, state: 'disabled', lastSuccess: null, lastAttempt: null, staleAfterHours: 30 })
    await off.s.close()
    const on = await setup(DRIVE)
    expect((await on.read()).operations.backup).toMatchObject({ enabled: true, state: 'never', lastSuccess: null })
  })

  it('shows the latest success with its age, counts and hashes, the latest attempt beside it, and goes "stale" after 30 hours', async () => {
    const t = await setup({ ...DRIVE, BACKUP_ENCRYPTION_KEY: TEST_KEY_TEXT })
    completeRun(t.s.db, t.s.clock, beginRun(t.s.db, t.s.clock, 'scheduled'), { folder: '2026-11-03', fileCount: 7, totalBytes: 123_456, databaseSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64), encrypted: true })
    // The backup's age is moved, not the clock: an administrator's session would not survive 31 simulated hours.
    const finishedAgo = (hours: number) => t.s.db.run('UPDATE backup_runs SET finished_at = ?', [new Date(t.s.clock.now().getTime() - hours * 3_600_000).toISOString()])
    finishedAgo(6)
    const fresh = (await t.read()).operations.backup
    expect(fresh).toMatchObject({ enabled: true, encrypted: true, state: 'ok' })
    expect(fresh.lastSuccess).toEqual({ finishedAt: '2026-11-03T04:00:00.000Z', ageHours: 6, folder: '2026-11-03', fileCount: 7, totalBytes: 123_456, databaseSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64), encrypted: true, trigger: 'scheduled' })
    finishedAgo(31)
    expect((await t.read()).operations.backup).toMatchObject({ state: 'stale', lastSuccess: { ageHours: 31 } })
  })

  it('shows a failed attempt as a category and a status, nothing else', async () => {
    const t = await setup(DRIVE)
    const id = beginRun(t.s.db, t.s.clock, 'startup')
    t.s.db.run("UPDATE backup_runs SET status = 'failed', finished_at = ?, error_category = 'drive_auth', http_status = 401 WHERE id = ?", [t.s.clock.now().toISOString(), id])
    expect((await t.read()).operations.backup.lastAttempt).toEqual({ status: 'failed', startedAt: '2026-11-03T10:00:00.000Z', finishedAt: '2026-11-03T10:00:00.000Z', errorCategory: 'drive_auth', httpStatus: 401, trigger: 'startup' })
  })
})

describe('the database, the disk and the migrations', () => {
  it('shows the migration status and the snapshot setting; an in-memory database has no snapshots and no disk to measure', async () => {
    const t = await setup()
    const { operations } = await t.read()
    expect(operations.migrations).toMatchObject({ current: 40, latest: 40, pending: 0, snapshots: { enabled: false, retentionDays: 14, count: 0, newestAt: null, newestBytes: null } })
    expect(operations.disk).toEqual({ available: false, freeBytes: null, totalBytes: null, freePercent: null, databaseBytes: null, low: false })
  })

  it('measures the volume of a real database file: free and total space, the file size, and a warning when it is nearly full', () => {
    const folder = mkdtempSync(join(tmpdir(), 'cc-disk-'))
    folders.push(folder)
    const path = join(folder, 'app.sqlite')
    writeFileSync(path, Buffer.alloc(8192))
    const disk = diskData(path)
    expect(disk.available).toBe(true)
    expect(disk.databaseBytes).toBe(8192)
    expect(disk.totalBytes!).toBeGreaterThan(disk.freeBytes!)
    expect(disk.freePercent!).toBeGreaterThan(0)
    expect(disk.freePercent!).toBeLessThanOrEqual(100)
    expect(disk.low).toBe(disk.freePercent! < 10 || disk.freeBytes! < 512 * 1_048_576)
    // A database that does not exist yet, in a folder that does not exist yet: still the volume above it, never an error.
    expect(diskData(join(folder, 'not-yet', 'app.sqlite'))).toMatchObject({ available: true, databaseBytes: null })
    expect(diskData(':memory:').available).toBe(false)
  })
})

describe('e-mail and the assistant', () => {
  it('shows the e-mail set-up as facts (never an address), the delivery counts, and that the checks have not run since the start', async () => {
    const t = await setup()
    const { operations } = await t.read()
    expect(operations.email).toMatchObject({ provider: 'file', enabled: true, paused: false, fromSet: true, replyToSet: false, notifyToSet: true, webhookSecretSet: false, deliveries: { pending: 0, failed: 0, accepted: 0, delivered: 0, bounced: 0 }, lastFailureAt: null, checks: null })
  })

  it('shows what the checks found as states, once they have run, and not their sentences', async () => {
    const dns = { mx: async () => ['route1.mx.cloudflare.net'], txt: async () => ['v=spf1 include:_spf.mx.cloudflare.net ~all'] }
    server = await startServer({ dns })
    const admin = await server.signIn('admin', 'admin@site.test')
    await server.app.context.emailChecks.run()
    const response = await server.api('/api/admin/system', { headers: { Cookie: admin.cookie } })
    const checks = response.json.data.operations.email.checks
    expect(checks.checkedAt).toBe(server.clock.now().toISOString())
    expect(checks.items.length).toBeGreaterThan(3)
    expect(Object.keys(checks.items[0]).sort()).toEqual(['id', 'state'])
    expect((Object.values(checks.states) as number[]).reduce((sum, n) => sum + n, 0)).toBe(checks.items.length)
    expect(JSON.stringify(checks)).not.toContain('v=spf1')
  })

  it('shows the assistant as unverified until its connection test has proved the model, and then as verified', async () => {
    const t = await setup()
    expect((await t.read()).operations.assistant).toMatchObject({ operatorEnabled: true, apiKeySet: true, model: 'claude-haiku-5-5', verification: 'unverified', verifiedAt: null, available: false, unavailableReason: 'admin_disabled' })
    activateAssistant(t.s.app.context)
    expect((await t.read()).operations.assistant).toMatchObject({ verification: 'verified', available: true, unavailableReason: null, failureReason: null })
  })
})

describe('the network, as this request reached the application', () => {
  const CHAIN = { 'X-Forwarded-For': '203.0.113.9, 198.51.100.7', 'CF-Connecting-IP': '203.0.113.9' }

  it('with TRUST_PROXY 0 shows the shared address a proxy gives everybody, says it differs from Cloudflare’s, and measures the value that would fit', async () => {
    const t = await setup({}, CHAIN)
    const { network } = (await t.read()).operations
    expect(network).toEqual({ clientIp: '127.0.0.1', socketAddress: '127.0.0.1', forwardedFor: ['203.0.113.9', '198.51.100.7'], cloudflareConnectingIp: '203.0.113.9', trustProxy: 0, verdict: 'differs_from_cloudflare_header', measuredTrustProxy: 2 })
  })

  it('with the measured value picks the visitor’s own address, and says it matches', async () => {
    const t = await setup({ TRUST_PROXY: '2' }, CHAIN)
    expect((await t.read()).operations.network).toMatchObject({ clientIp: '203.0.113.9', trustProxy: 2, verdict: 'matches_cloudflare_header', measuredTrustProxy: 2 })
  })

  it('says "direct" when no proxy header came, and "proxy without Cloudflare header" when only forwarding headers did', async () => {
    const t = await setup()
    expect((await t.read()).operations.network).toMatchObject({ verdict: 'direct', forwardedFor: [], cloudflareConnectingIp: null, measuredTrustProxy: null })
    expect((await t.read({ 'X-Forwarded-For': '203.0.113.9' })).operations.network).toMatchObject({ verdict: 'proxy_without_cloudflare_header', forwardedFor: ['203.0.113.9'], measuredTrustProxy: null })
  })

  it('shows only what looks like an address, at most ten of them, and never what a header carries that is not one', async () => {
    const t = await setup()
    const hostile = ['<script>alert(1)</script>', 'a'.repeat(60), '::ffff:192.0.2.5', ...Array.from({ length: 12 }, (_, i) => `198.51.100.${i}`)].join(', ')
    const { network } = (await t.read({ 'X-Forwarded-For': hostile, 'CF-Connecting-IP': 'not an address <b>' })).operations
    expect(network.forwardedFor).toHaveLength(10)
    expect(network.forwardedFor.slice(0, 3)).toEqual(['(unreadable)', '(unreadable)', '192.0.2.5'])
    expect(network.cloudflareConnectingIp).toBe('(unreadable)')
    expect(JSON.stringify(network)).not.toMatch(/script|<b>|aaaa/)
  })
})

describe('the deployment', () => {
  it('shows the commit the host says is running, in lower case, and a short form; ignores what is not a commit', async () => {
    const t = await setup({ RENDER_GIT_COMMIT: 'ABCDEF1234567890ABCDEF1234567890ABCDEF12', RENDER_SERVICE_NAME: 'my-website' })
    expect((await t.read()).operations.deployment).toEqual({ commit: 'abcdef1234567890abcdef1234567890abcdef12', shortCommit: 'abcdef123456', source: 'RENDER_GIT_COMMIT', service: 'my-website', environment: 'test', startedAt: expect.any(String) })
    await t.s.close()
    const other = await setup({ GIT_COMMIT: '1234567' })
    expect((await other.read()).operations.deployment).toMatchObject({ commit: '1234567', shortCommit: '1234567', source: 'GIT_COMMIT' })
    await other.s.close()
    const bad = await setup({ RENDER_GIT_COMMIT: 'not a commit; rm -rf /', RENDER_SERVICE_NAME: '<script>' })
    expect((await bad.read()).operations.deployment).toMatchObject({ commit: null, shortCommit: null, source: null, service: null })
  })
})

describe('who may read it, and what it never says', () => {
  it('is for administrators: signed out is 401 and an editor is 403, with no operations in either answer', async () => {
    const t = await setup()
    const editor = await t.s.signIn('editor', 'editor@site.test')
    const anonymous = await t.s.api('/api/admin/system')
    const refused = await t.s.api('/api/admin/system', { headers: { Cookie: editor.cookie } })
    expect([anonymous.status, refused.status]).toEqual([401, 403])
    expect(anonymous.text + refused.text).not.toContain('operations')
  })

  it('carries no secret, no path, no address of a customer or of the e-mail set-up, and nothing the provider said', async () => {
    const t = await setup({ ...DRIVE, BACKUP_ENCRYPTION_KEY: TEST_KEY_TEXT, SMTP_PASSWORD: 'smtp-password-VALUE-4', ANTHROPIC_API_KEY: 'anthropic-key-VALUE-5-0123456789' })
    await t.s.api('/api/contact', { body: contact({ email: 'private.customer@example.org', name: 'Private Customer' }) })
    t.s.db.run("UPDATE email_deliveries SET status = 'failed', last_error = 'SECRET-PROVIDER-TEXT for private.customer@example.org' WHERE rowid = (SELECT MIN(rowid) FROM email_deliveries)")
    const { operations } = await t.read()
    const text = JSON.stringify(operations)
    for (const forbidden of [
      DRIVE.GOOGLE_DRIVE_CLIENT_SECRET,
      DRIVE.GOOGLE_DRIVE_REFRESH_TOKEN,
      TEST_KEY_TEXT,
      Buffer.from(TEST_KEY_TEXT, 'base64').toString('hex'),
      'smtp-password-VALUE-4',
      'anthropic-key-VALUE-5',
      'private.customer@example.org',
      'Private Customer',
      'SECRET-PROVIDER-TEXT',
      'owner@site.test',
      'no-reply@site.test',
      t.s.config.mediaDir,
      t.s.config.migrationSnapshots.directory,
      t.s.config.appSecret,
    ]) expect(text, forbidden).not.toContain(forbidden)
    expect(operations.email.deliveries.failed).toBeGreaterThanOrEqual(1)
  })

  it('leaves the rest of the system answer as it was', async () => {
    const t = await setup()
    const { all } = await t.read()
    expect(Object.keys(all).sort()).toEqual(['audit', 'config', 'email', 'failedDeliveries', 'hasDeployHook', 'migrations', 'operations', 'stats'])
    expect(all.config.googleDriveBackup).toMatchObject({ enabled: false, encrypted: false })
  })
})
