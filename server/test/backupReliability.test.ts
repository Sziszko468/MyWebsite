import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sha256Of } from '../src/modules/backups/artifacts.ts'
import { BackupCryptoError, decryptBackup, isEncryptedBackup, keyIdOf, parseBackupKey } from '../src/modules/backups/crypto.ts'
import { BackupError } from '../src/modules/backups/errors.ts'
import { GoogleDriveBackup, backupRunning, startBackupScheduler } from '../src/modules/backups/googleDrive.ts'
import { STALE_AFTER_HOURS, backupStatus, beginRun, completeRun, failRun, pruneRuns, recoverInterrupted, shouldCatchUp, type BackupRunRow } from '../src/modules/backups/records.ts'
import { TEST_KEY_TEXT, cleanScratch, scratch, setupBackup, type BackupSetup } from './driveKit.ts'

/**
 * Backup reliability (PROMPT 25): what a backup records about itself, that a failure is a category and never an answer's text, when a
 * backup is stale and when a start-up makes one, upload-then-delete, the check of what Drive holds, and encryption end to end. Drive is the
 * in-memory stand-in (driveKit.ts); nothing reaches Google and every value is made up.
 */

const KEY = parseBackupKey(TEST_KEY_TEXT)!
const HOUR = 3_600_000
let current: BackupSetup | null = null

afterEach(async () => {
  await current?.server.close()
  current = null
  cleanScratch()
})

async function setup(key: Buffer | null = null): Promise<BackupSetup> {
  current = await setupBackup({ key })
  // The records and the dated folder use the server's clock, which tests move by hand.
  current.options.clock = current.server.clock
  return current
}

const TODAY = '2026-11-03'
const runs = (t: BackupSetup) => t.server.db.all<BackupRunRow>('SELECT * FROM backup_runs ORDER BY id')
const stored = (t: BackupSetup, name: string) => t.drive.childrenOf(t.drive.dayFolder('ROOT', TODAY)!).find((item) => item.name === name)!

describe('what a backup records about itself', () => {
  it('writes one row per run: the files, the bytes, the hashes of the database and of the manifest, and nothing secret', async () => {
    const t = await setup()
    const result = await new GoogleDriveBackup(t.options).run()
    const [row, ...others] = runs(t)
    expect(others).toEqual([])
    expect(row).toMatchObject({ run_trigger: 'scheduled', status: 'success', folder: TODAY, file_count: 3, encrypted: 0, error_category: null, http_status: null, finished_at: t.server.clock.now().toISOString() })
    const database = stored(t, 'database.sqlite').data!
    expect(row.database_sha256).toBe(sha256Of(database))
    expect(row.manifest_sha256).toBe(sha256Of(stored(t, 'manifest.json').data!))
    expect(row.total_bytes).toBe(database.length + 4 + 3)
    expect(result).toMatchObject({ files: 3, bytes: row.total_bytes, databaseSha256: row.database_sha256, manifestSha256: row.manifest_sha256, encrypted: false })
    // The manifest lists every file with the hash of what was backed up.
    const manifest = JSON.parse(stored(t, 'manifest.json').data!.toString('utf8'))
    expect(manifest).toMatchObject({ format: 1, encrypted: false, keyId: null, createdAt: t.server.clock.now().toISOString(), database: { name: 'database.sqlite', size: database.length, sha256: row.database_sha256 } })
    expect(manifest.media.map((entry: { name: string }) => entry.name)).toEqual(['media/a1b2.png', 'media/nested/c3d4.webp'])
    expect(manifest.media[0]).toEqual({ name: 'media/a1b2.png', size: 4, sha256: sha256Of(Buffer.from([1, 2, 3, 4])) })
  })

  it('shows the latest success and how old it is, and one word for where things stand', async () => {
    const t = await setup()
    expect(backupStatus(t.server.db, t.config, t.server.clock, false)).toMatchObject({ enabled: true, encrypted: false, state: 'never', lastSuccess: null, lastAttempt: null, staleAfterHours: STALE_AFTER_HOURS })
    await new GoogleDriveBackup(t.options).run()
    t.server.clock.advance(5 * HOUR)
    const status = backupStatus(t.server.db, t.config, t.server.clock, false)
    expect(status.state).toBe('ok')
    expect(status.lastSuccess).toMatchObject({ ageHours: 5, folder: TODAY, fileCount: 3, trigger: 'scheduled', encrypted: false })
    expect(status.lastAttempt).toMatchObject({ status: 'success', errorCategory: null })
    expect(backupStatus(t.server.db, t.config, t.server.clock, true).state).toBe('running')
    expect(backupStatus(t.server.db, { ...t.config, backup: { ...t.config.backup, enabled: false } }, t.server.clock, false).state).toBe('disabled')
  })

  it(`calls a backup stale after ${STALE_AFTER_HOURS} hours (a day, plus a day's slack for a late or retried run), and not before`, async () => {
    const t = await setup()
    await new GoogleDriveBackup(t.options).run()
    t.server.clock.advance((STALE_AFTER_HOURS - 1) * HOUR)
    expect(backupStatus(t.server.db, t.config, t.server.clock, false).state).toBe('ok')
    t.server.clock.advance(2 * HOUR)
    expect(backupStatus(t.server.db, t.config, t.server.clock, false)).toMatchObject({ state: 'stale', lastSuccess: { ageHours: STALE_AFTER_HOURS + 1 } })
  })

  it('records a failure as a category and a status, shows it beside the last success, and never keeps what Drive said', async () => {
    const t = await setup()
    await new GoogleDriveBackup(t.options).run()
    t.server.clock.advance(HOUR)
    t.drive.failing.set('/upload/drive/v3/files', 503)
    const failure = await new GoogleDriveBackup(t.options).run().then(() => null, (error: unknown) => error)
    expect(failure).toBeInstanceOf(BackupError)
    expect((failure as BackupError).message).toBe('Google Drive HTTP 503')
    expect(runs(t)[1]).toMatchObject({ status: 'failed', error_category: 'drive_http', http_status: 503, folder: null, file_count: 0, database_sha256: null })
    const status = backupStatus(t.server.db, t.config, t.server.clock, false)
    expect(status.state).toBe('ok')
    expect(status.lastSuccess?.finishedAt).toBe('2026-11-03T10:00:00.000Z')
    expect(status.lastAttempt).toMatchObject({ status: 'failed', errorCategory: 'drive_http', httpStatus: 503 })
    const everything = JSON.stringify([runs(t), t.server.logs, String((failure as Error).stack)])
    for (const word of ['SECRET-DRIVE-ANSWER-TEXT', 'forced failure', 'access-token', 'client-secret-xyz', 'refresh-token-xyz']) expect(everything, word).not.toContain(word)
  })

  it.each([
    ['a refused token', (t: BackupSetup) => t.drive.failing.set('oauth2.googleapis.com', 401), 'drive_auth', 401, 'Google Drive HTTP 401'],
    ['no network', (t: BackupSetup) => void (t.options.fetchImpl = (async () => { throw new Error('connect ECONNREFUSED https://www.googleapis.com/?key=client-secret-xyz') }) as typeof fetch), 'drive_network', null, 'Google Drive could not be reached'],
  ] as [string, (t: BackupSetup) => unknown, string, number | null, string][])('says "%s" as a category, with a fixed sentence', async (_name, break_, category, status, message) => {
    const t = await setup()
    break_(t)
    const failure = (await new GoogleDriveBackup(t.options).run().then(() => null, (error: unknown) => error)) as BackupError
    expect([failure.category, failure.httpStatus, failure.message]).toEqual([category, status, message])
    expect(runs(t)[0]).toMatchObject({ status: 'failed', error_category: category, http_status: status })
    expect(JSON.stringify([failure.message, String(failure.stack)])).not.toMatch(/client-secret-xyz|ECONNREFUSED|googleapis\.com\/\?key/)
  })

  it('turns a run left "running" by a process that stopped into a failed attempt, and keeps the table small', async () => {
    const t = await setup()
    beginRun(t.server.db, t.server.clock, 'scheduled')
    expect(recoverInterrupted(t.server.db, t.server.clock)).toBe(1)
    expect(runs(t)[0]).toMatchObject({ status: 'failed', error_category: 'interrupted' })
    for (let i = 0; i < 230; i += 1) failRun(t.server.db, t.server.clock, beginRun(t.server.db, t.server.clock, 'scheduled'), 'drive_http', 500)
    expect(pruneRuns(t.server.db)).toBe(31)
    expect(runs(t)).toHaveLength(200)
  })
})

describe('upload first, delete after', () => {
  it("keeps today's earlier copy of a file when the new upload of it fails (the old order deleted it first)", async () => {
    const t = await setup()
    const folder = t.drive.addFolder(TODAY, 'ROOT')
    const earlier = t.drive.addFile('database.sqlite', folder, 'THE-EARLIER-BACKUP')
    t.drive.failUpload = (_n, name) => (name === 'database.sqlite' ? 500 : null)
    await expect(new GoogleDriveBackup(t.options).run()).rejects.toThrow(/Google Drive HTTP 500/)
    expect(t.drive.items.get(earlier)?.data?.toString()).toBe('THE-EARLIER-BACKUP')
    expect(runs(t)[0]).toMatchObject({ status: 'failed', error_category: 'drive_http' })
  })

  it('deletes the earlier copy only after the new one is stored and checked', async () => {
    const t = await setup()
    const folder = t.drive.addFolder(TODAY, 'ROOT')
    const earlier = t.drive.addFile('database.sqlite', folder, 'THE-EARLIER-BACKUP')
    await new GoogleDriveBackup(t.options).run()
    expect(t.drive.items.has(earlier)).toBe(false)
    const databases = t.drive.childrenOf(folder).filter((item) => item.name === 'database.sqlite')
    expect(databases).toHaveLength(1)
    expect(databases[0].data!.subarray(0, 15).toString('latin1')).toBe('SQLite format 3')
    const upload = t.drive.requests.findIndex((request) => request.method === 'POST' && request.url.includes('/upload/') )
    const removal = t.drive.requests.findIndex((request) => request.method === 'DELETE' && request.url.endsWith(`/files/${earlier}`))
    expect(upload).toBeGreaterThan(-1)
    expect(removal).toBeGreaterThan(upload)
  })

  it.each([
    ['a size that is not what was sent', (t: BackupSetup) => (t.drive.wrongSize = true)],
    ['a checksum that is not what was sent', (t: BackupSetup) => (t.drive.wrongMd5 = true)],
  ])('refuses %s: the copy is removed, the earlier one stays, the run fails as "integrity"', async (_name, corrupt) => {
    const t = await setup()
    const folder = t.drive.addFolder(TODAY, 'ROOT')
    const earlier = t.drive.addFile('database.sqlite', folder, 'THE-EARLIER-BACKUP')
    corrupt(t)
    const failure = (await new GoogleDriveBackup(t.options).run().then(() => null, (error: unknown) => error)) as BackupError
    expect(failure.category).toBe('integrity')
    expect(t.drive.items.get(earlier)?.data?.toString()).toBe('THE-EARLIER-BACKUP')
    expect(t.drive.childrenOf(folder).map((item) => item.name)).toEqual(['database.sqlite'])
    expect(runs(t)[0]).toMatchObject({ status: 'failed', error_category: 'integrity' })
  })

  it('does not start a second backup while one is running, and does not record one', async () => {
    const t = await setup()
    const first = new GoogleDriveBackup(t.options).run()
    expect(backupRunning()).toBe(true)
    const second = await new GoogleDriveBackup(t.options).run().then(() => null, (error: unknown) => error)
    expect(second).toBeInstanceOf(BackupError)
    expect((second as BackupError).category).toBe('busy')
    await first
    expect(backupRunning()).toBe(false)
    expect(runs(t)).toHaveLength(1)
    await new GoogleDriveBackup(t.options).run()
    expect(runs(t)).toHaveLength(2)
  })
})

describe('encrypted backups (AES-256-GCM, BACKUP_ENCRYPTION_KEY)', () => {
  it('encrypts every file, the manifest too, so that nothing readable leaves the server, and records that it did', async () => {
    const t = await setup(KEY)
    const result = await new GoogleDriveBackup(t.options).run()
    expect(result.encrypted).toBe(true)
    const names = t.drive.childrenOf(t.drive.dayFolder('ROOT', TODAY)!).map((item) => item.name).sort()
    expect(names).toEqual(['database.sqlite.enc', 'manifest.json.enc', 'media/a1b2.png.enc', 'media/nested/c3d4.webp.enc'])
    for (const name of names) expect(isEncryptedBackup(stored(t, name).data!), name).toBe(true)
    // No stored byte sequence is the clear SQLite header, the manifest's JSON, or a picture.
    for (const name of names) {
      const data = stored(t, name).data!
      expect(data.includes(Buffer.from('SQLite format 3')), name).toBe(false)
      expect(data.includes(Buffer.from('"format"')), name).toBe(false)
    }
    expect(runs(t)[0]).toMatchObject({ status: 'success', encrypted: 1 })
    expect(backupStatus(t.server.db, t.config, t.server.clock, false)).toMatchObject({ encrypted: true, lastSuccess: { encrypted: true } })
  })

  it('decrypts to exactly what was backed up, and the manifest and the record agree with it', async () => {
    const t = await setup(KEY)
    await new GoogleDriveBackup(t.options).run()
    const database = decryptBackup(KEY, stored(t, 'database.sqlite.enc').data!)
    expect(database.subarray(0, 15).toString('latin1')).toBe('SQLite format 3')
    expect(decryptBackup(KEY, stored(t, 'media/a1b2.png.enc').data!)).toEqual(Buffer.from([1, 2, 3, 4]))
    const manifestBytes = decryptBackup(KEY, stored(t, 'manifest.json.enc').data!)
    const manifest = JSON.parse(manifestBytes.toString('utf8'))
    expect(manifest).toMatchObject({ encrypted: true, keyId: keyIdOf(KEY), database: { sha256: sha256Of(database), size: database.length } })
    expect(runs(t)[0]).toMatchObject({ database_sha256: sha256Of(database), manifest_sha256: sha256Of(manifestBytes) })
    // The restored copy is a whole database holding what was there.
    const scratchDir = mkdtempSync(join(tmpdir(), 'cc-enc-'))
    scratch()
    writeFileSync(join(scratchDir, 'db.sqlite'), database)
    const copy = new DatabaseSync(join(scratchDir, 'db.sqlite'), { readOnly: true })
    expect((copy.prepare("SELECT value FROM settings WHERE key = 'audit.probe'").get() as { value: string }).value).toBe('1')
    copy.close()
  })

  it('refuses a wrong key, a damaged file and a file that is not encrypted, each with its own fixed sentence', async () => {
    const t = await setup(KEY)
    await new GoogleDriveBackup(t.options).run()
    const data = stored(t, 'database.sqlite.enc').data!
    const other = parseBackupKey(Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64'))!
    const reason = (work: () => unknown) => {
      try {
        work()
      } catch (error) {
        expect(error).toBeInstanceOf(BackupCryptoError)
        return (error as BackupCryptoError).reason
      }
      return 'accepted'
    }
    expect(reason(() => decryptBackup(other, data))).toBe('wrong_key')
    const flipped = (at: number) => {
      const copy = Buffer.from(data)
      copy[at] ^= 1
      return copy
    }
    expect(reason(() => decryptBackup(KEY, flipped(60)))).toBe('corrupt') // a byte of the ciphertext
    expect(reason(() => decryptBackup(KEY, flipped(data.length - 1)))).toBe('corrupt') // a byte of the tag
    expect(reason(() => decryptBackup(KEY, flipped(12)))).toBe('corrupt') // a byte of the nonce (authenticated header)
    expect(reason(() => decryptBackup(KEY, data.subarray(0, data.length - 5)))).toBe('corrupt') // truncated
    expect(reason(() => decryptBackup(KEY, Buffer.from('SQLite format 3 plain text, not a backup at all.')))).toBe('not_encrypted')
    expect(reason(() => decryptBackup(KEY, data))).toBe('accepted')
  })

  it('uses a new nonce for every file and every run, so the same file never encrypts to the same bytes', async () => {
    const t = await setup(KEY)
    await new GoogleDriveBackup(t.options).run()
    const first = Buffer.from(stored(t, 'media/a1b2.png.enc').data!)
    await new GoogleDriveBackup(t.options).run()
    const second = stored(t, 'media/a1b2.png.enc').data!
    expect(second.equals(first)).toBe(false)
    expect(second.subarray(9, 21).equals(first.subarray(9, 21))).toBe(false) // the nonce, after "CCBK1" and the 4-byte key id
    expect(decryptBackup(KEY, second)).toEqual(decryptBackup(KEY, first))
  })

  it('replaces the clear copies of a day that was backed up before encryption was switched on', async () => {
    const t = await setup()
    await new GoogleDriveBackup(t.options).run()
    expect(t.drive.childrenOf(t.drive.dayFolder('ROOT', TODAY)!).map((item) => item.name)).toContain('database.sqlite')
    const keyed = { ...t.options, config: { ...t.options.config, backup: { ...t.options.config.backup, encryptionKey: KEY } } }
    await new GoogleDriveBackup(keyed).run()
    const names = t.drive.childrenOf(t.drive.dayFolder('ROOT', TODAY)!).map((item) => item.name).sort()
    expect(names).toEqual(['database.sqlite.enc', 'manifest.json.enc', 'media/a1b2.png.enc', 'media/nested/c3d4.webp.enc'])
  })

  it('never puts the key in a request, a log line, a record or an error', async () => {
    const t = await setup(KEY)
    await new GoogleDriveBackup(t.options).run()
    const text = JSON.stringify([t.drive.requests.map((request) => request.url + request.body), t.server.logs, runs(t), t.server.db.all('SELECT * FROM audit_log')])
    for (const form of [KEY.toString('base64'), KEY.toString('hex'), TEST_KEY_TEXT]) expect(text, form).not.toContain(form)
  })

  it.each([
    ['not 32 bytes', 'c2hvcnQ='],
    ['not base64 or hex', 'this is not a key at all, it has spaces in it!!'],
    ['all one byte', Buffer.alloc(32, 9).toString('base64')],
    ['hex of the wrong length', 'ab'.repeat(31)],
  ])('refuses a key that is %s', (_name, text) => {
    expect(parseBackupKey(text)).toBeNull()
  })

  it('accepts the key as base64 (padded or url-safe) and as 64 hexadecimal characters', () => {
    expect(parseBackupKey(TEST_KEY_TEXT)).toEqual(KEY)
    expect(parseBackupKey(KEY.toString('hex'))).toEqual(KEY)
    expect(parseBackupKey(`  ${KEY.toString('base64')}\n`)).toEqual(KEY)
    expect(parseBackupKey(KEY.toString('base64url'))).toEqual(KEY)
  })
})

describe('the catch-up after a start with no recent backup', () => {
  const decide = (lastSuccessAt: string | null, lastAttempt: { status: string; startedAt: string } | null, now = '2026-11-03T10:00:00.000Z', hourUtc = 3) => shouldCatchUp({ lastSuccessAt, lastAttempt, now: new Date(now), hourUtc }).reason

  it('decides by the last success (24 hours), the last attempt (an hour) and the schedule (ten minutes)', () => {
    expect(decide(null, null)).toBe('needed')
    expect(decide('2026-11-02T10:00:01.000Z', null)).toBe('recent_success') // 23 h 59 m 59 s ago
    expect(decide('2026-11-02T10:00:00.000Z', null)).toBe('needed') // exactly 24 h
    expect(decide(null, { status: 'failed', startedAt: '2026-11-03T09:10:00.000Z' })).toBe('recent_attempt')
    expect(decide(null, { status: 'running', startedAt: '2026-11-03T09:30:00.000Z' })).toBe('recent_attempt')
    expect(decide(null, { status: 'failed', startedAt: '2026-11-03T08:59:00.000Z' })).toBe('needed')
    expect(decide(null, { status: 'success', startedAt: '2026-11-03T09:59:00.000Z' })).toBe('needed')
    expect(decide(null, null, '2026-11-03T02:55:00.000Z')).toBe('scheduled_soon')
    expect(decide(null, null, '2026-11-03T02:49:00.000Z')).toBe('needed')
  })

  /** The scheduler over the stand-in, with the server's clock; the daily timer is set far from "now" so only the catch-up can run. */
  const start = (t: BackupSetup) => startBackupScheduler(t.options, (t.server.clock.now().getUTCHours() + 12) % 24, { catchUp: true, catchUpDelayMs: 5 })

  it('makes a backup when none exists, records it as a start-up backup, and does not make a second one', async () => {
    const t = await setup()
    const scheduler = start(t)
    expect(await scheduler.catchUp).toBe('ran')
    expect(runs(t)).toHaveLength(1)
    expect(runs(t)[0]).toMatchObject({ run_trigger: 'startup', status: 'success' })
    scheduler.stop()
    const again = start(t)
    expect(await again.catchUp).toBe('skipped')
    expect(runs(t)).toHaveLength(1)
    again.stop()
  })

  it('makes a backup when the last success is older than 24 hours, and none when it is newer', async () => {
    const t = await setup()
    completeRun(t.server.db, t.server.clock, beginRun(t.server.db, t.server.clock, 'scheduled'), { folder: TODAY, fileCount: 1, totalBytes: 1, databaseSha256: 'a'.repeat(64), manifestSha256: 'b'.repeat(64), encrypted: false })
    t.server.clock.advance(23 * HOUR)
    const recent = start(t)
    expect(await recent.catchUp).toBe('skipped')
    recent.stop()
    expect(t.drive.requests).toHaveLength(0)
    t.server.clock.advance(2 * HOUR)
    const old = start(t)
    expect(await old.catchUp).toBe('ran')
    old.stop()
    expect(runs(t)).toHaveLength(2)
  })

  it('treats a backup that was running when the process stopped as a failed attempt, and makes one if that was long ago', async () => {
    const t = await setup()
    beginRun(t.server.db, t.server.clock, 'scheduled')
    t.server.clock.advance(3 * HOUR)
    const scheduler = start(t)
    expect(await scheduler.catchUp).toBe('ran')
    scheduler.stop()
    expect(runs(t).map((row) => [row.status, row.error_category, row.run_trigger])).toEqual([['failed', 'interrupted', 'scheduled'], ['success', null, 'startup']])
  })

  it('does not hammer the destination or the owner when the server keeps restarting after a failure', async () => {
    const t = await setup()
    t.drive.failing.set('oauth2.googleapis.com', 400)
    const first = start(t)
    expect(await first.catchUp).toBe('failed')
    first.stop()
    expect(t.server.mailer.sent).toHaveLength(1)
    expect(t.server.mailer.sent[0].text).toContain('(drive_auth)')
    for (let restart = 0; restart < 3; restart += 1) {
      t.server.clock.advance(5 * 60_000)
      const again = start(t)
      expect(await again.catchUp).toBe('skipped')
      again.stop()
    }
    expect(t.server.mailer.sent, 'one e-mail, not one per restart').toHaveLength(1)
    expect(runs(t)).toHaveLength(1)
    // An hour later it tries again.
    t.server.clock.advance(HOUR)
    t.drive.failing.clear()
    const later = start(t)
    expect(await later.catchUp).toBe('ran')
    later.stop()
  })

  it('is not made at all when it was not asked for, and is cancelled by stopping', async () => {
    const t = await setup()
    const plain = startBackupScheduler(t.options, (t.server.clock.now().getUTCHours() + 12) % 24)
    expect(plain.catchUp).toBeNull()
    plain.stop()
    const slow = startBackupScheduler(t.options, (t.server.clock.now().getUTCHours() + 12) % 24, { catchUp: true, catchUpDelayMs: 60_000 })
    slow.stop()
    expect(await slow.catchUp).toBe('skipped')
    expect(runs(t)).toHaveLength(0)
  })
})
