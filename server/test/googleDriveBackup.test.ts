import { readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GoogleDriveBackup, startBackupScheduler } from '../src/modules/backups/googleDrive.ts'
import { SECRETS, cleanScratch, day, scratch, setupBackup, type BackupSetup } from './driveKit.ts'

/**
 * The automatic Google Drive backup (server/src/modules/backups/googleDrive.ts), against a small in-memory stand-in for the parts
 * of the Drive API it uses (driveKit.ts). Nothing here reaches Google. Added by the PROMPT 19 audit, kept up to date by PROMPT 25.
 *
 * What is proved: the uploaded database is a real, consistent SQLite file; the pictures go up under `media/`; the dated folder is
 * the day's; old dated folders are removed only AFTER a successful upload (a failed run never costs the older backups) and
 * only folders named like a date; credentials travel only in the token request's body; a failed run e-mails the owner a reason
 * that carries no secret and the scheduler keeps going.
 * What is NOT proved (and cannot be without the owner's Google account): that Google accepts these requests as written.
 * The new behaviour (records, encryption, upload-then-delete, catch-up) is in backupReliability.test.ts.
 */

let current: BackupSetup | null = null

afterEach(async () => {
  vi.useRealTimers()
  await current?.server.close()
  current = null
  cleanScratch()
})

async function setup(): Promise<BackupSetup> {
  current = await setupBackup()
  return current
}

describe('the Google Drive backup', () => {
  it("uploads a consistent database and the pictures into the day's folder, with a manifest, and returns what it did", async () => {
    const { options, drive } = await setup()
    const result = await new GoogleDriveBackup(options).run()

    expect(result.folder).toBe(day(0))
    expect(result.files).toBe(3) // the database and two pictures; the manifest is not counted
    const dayFolder = drive.childrenOf('ROOT').find((item) => item.folder && item.name === day(0))
    expect(dayFolder).toBeDefined()
    const names = drive.childrenOf(dayFolder!.id).map((item) => item.name).sort()
    expect(names).toEqual(['database.sqlite', 'manifest.json', 'media/a1b2.png', 'media/nested/c3d4.webp'])

    // The uploaded database is a real SQLite file, whole, with the migrations and the row we wrote.
    const upload = drive.childrenOf(dayFolder!.id).find((item) => item.name === 'database.sqlite')!
    expect(upload.data!.subarray(0, 15).toString('latin1')).toBe('SQLite format 3')
    const copy = join(mkdtempSync(join(tmpdir(), 'cc-drive-check-')), 'copy.sqlite')
    scratch()
    writeFileSync(copy, upload.data!)
    const restored = new DatabaseSync(copy, { readOnly: true })
    expect((restored.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check).toBe('ok')
    expect((restored.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n).toBeGreaterThanOrEqual(8)
    expect((restored.prepare("SELECT value FROM settings WHERE key = 'audit.probe'").get() as { value: string }).value).toBe('1')
    restored.close()

    // The pictures are byte for byte what is on disk.
    expect(drive.childrenOf(dayFolder!.id).find((item) => item.name === 'media/a1b2.png')!.data).toEqual(Buffer.from([1, 2, 3, 4]))
    // The temporary snapshot is gone.
    expect(readdirSync(tmpdir()).filter((file) => file.startsWith(`portfolio-${process.pid}-`))).toEqual([])
  })

  it('keeps a second run on the same day to one copy of each file (no duplicates)', async () => {
    const { options, drive } = await setup()
    await new GoogleDriveBackup(options).run()
    await new GoogleDriveBackup(options).run()
    const dayFolders = drive.childrenOf('ROOT').filter((item) => item.folder && item.name === day(0))
    expect(dayFolders).toHaveLength(1)
    expect(drive.childrenOf(dayFolders[0].id)).toHaveLength(4)
  })

  it('removes dated folders older than the retention, with their files, and nothing else', async () => {
    const { options, drive } = await setup()
    const old = drive.addFolder(day(-40), 'ROOT')
    const oldFile = drive.addFile('database.sqlite', old)
    const recent = drive.addFolder(day(-10), 'ROOT')
    const recentFile = drive.addFile('database.sqlite', recent)
    const notes = drive.addFolder('my-own-notes', 'ROOT')

    await new GoogleDriveBackup(options).run()

    expect(drive.items.has(old)).toBe(false)
    expect(drive.items.has(oldFile)).toBe(false)
    expect(drive.items.has(recent)).toBe(true)
    expect(drive.items.has(recentFile)).toBe(true)
    expect(drive.items.has(notes)).toBe(true)
  })

  it("never deletes an older backup when today's upload fails", async () => {
    const { options, drive } = await setup()
    const old = drive.addFolder(day(-40), 'ROOT')
    const oldFile = drive.addFile('database.sqlite', old)
    drive.failing.set('/upload/drive/v3/files', 500)

    await expect(new GoogleDriveBackup(options).run()).rejects.toThrow(/Google Drive HTTP 500/)

    expect(drive.items.has(old)).toBe(true)
    expect(drive.items.has(oldFile)).toBe(true)
    expect(readdirSync(tmpdir()).filter((file) => file.startsWith(`portfolio-${process.pid}-`))).toEqual([])
  })

  it("sends the credentials only in the token request's body, never in an address", async () => {
    const { options, drive } = await setup()
    await new GoogleDriveBackup(options).run()
    for (const request of drive.requests) {
      for (const secret of Object.values(SECRETS)) expect(request.url).not.toContain(secret)
    }
    const token = drive.requests.filter((request) => request.url.startsWith('https://oauth2.googleapis.com/token'))
    expect(token).toHaveLength(1)
    expect(token[0].method).toBe('POST')
    expect(token[0].body).toContain('grant_type=refresh_token')
    // Every call to the Drive API is made over https.
    expect(drive.requests.every((request) => request.url.startsWith('https://'))).toBe(true)
  })

  it('on the scheduled hour a failed run e-mails the owner a reason with no secret in it, and the schedule goes on', async () => {
    const { options, drive, server } = await setup()
    drive.failing.set('oauth2.googleapis.com', 400)
    // The token request is a POST, so the stand-in's forced failure applies to it.
    vi.useFakeTimers({ now: new Date('2026-11-13T02:59:30.000Z'), toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const scheduler = startBackupScheduler(options, 3)
    await vi.advanceTimersByTimeAsync(31_000)
    for (let i = 0; i < 20; i += 1) await Promise.resolve()

    expect(server.mailer.sent).toHaveLength(1)
    const mail = server.mailer.sent[0]
    expect(mail.subject).toBe('Portfolio backup failed')
    expect(mail.to).toBe(options.config.email.notifyTo)
    expect(mail.text).toContain('Google Drive HTTP 400')
    expect(mail.text).toContain('(drive_auth)')
    for (const secret of [...Object.values(SECRETS), 'SECRET-DRIVE-ANSWER-TEXT']) {
      expect(mail.text).not.toContain(secret)
      expect(mail.html).not.toContain(secret)
    }

    // The next attempt is scheduled for the following day at the same hour: nothing more happens within the next 23 hours.
    await vi.advanceTimersByTimeAsync(23 * 3_600_000)
    expect(server.mailer.sent).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2 * 3_600_000)
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
    expect(server.mailer.sent).toHaveLength(2)
    scheduler.stop()
  })
})
