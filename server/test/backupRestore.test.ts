import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Database } from '../src/db/database.ts'
import { migrationStatus } from '../src/db/migrate.ts'
import { DATABASE_NAME, MANIFEST_NAME, sha256Of } from '../src/modules/backups/artifacts.ts'
import { BackupCryptoError, parseBackupKey } from '../src/modules/backups/crypto.ts'
import { GoogleDriveBackup } from '../src/modules/backups/googleDrive.ts'
import { RestoreError, decryptFile, restoreBackup, verifyBackupDirectory, writeBackupToDirectory } from '../src/modules/backups/local.ts'
import { TEST_KEY_TEXT, cleanScratch, scratch, setupBackup, type BackupSetup } from './driveKit.ts'
import { startServer } from './helpers.ts'

/**
 * The restore drill, automated (docs/operations/RESTORE_DRILL.md): a backup made by the new code is downloaded from the (stand-in) Drive,
 * verified against its manifest, and restored into an EMPTY scratch place; the restored database is opened, compared table by table with
 * the source, and a server is started on it. Also what must NOT work: a damaged backup, a wrong key, an overwrite, the live database.
 * No production database, no customer data and no real Drive is involved: everything lives in temporary folders.
 */

const KEY = parseBackupKey(TEST_KEY_TEXT)!
const TODAY = '2026-11-03'
let current: BackupSetup | null = null
const extraServers: { close(): Promise<void> }[] = []

afterEach(async () => {
  await current?.server.close()
  current = null
  for (const server of extraServers.splice(0)) await server.close()
  cleanScratch()
})

async function made(key: Buffer | null = null): Promise<{ t: BackupSetup; folder: string }> {
  const t = await setupBackup({ key })
  current = t
  t.options.clock = t.server.clock
  // A little more than the stand-in's one row, so the comparison means something.
  for (let i = 0; i < 5; i += 1) t.server.db.run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [`drill.row.${i}`, `value ${i}`, '2026-11-03T00:00:00.000Z'])
  await new GoogleDriveBackup(t.options).run()
  const folder = scratch('cc-drill-download-')
  t.drive.download(t.drive.dayFolder('ROOT', TODAY)!, folder)
  return { t, folder }
}

const tables = (path: string): string[] => {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map((row) => row.name)
  } finally {
    db.close()
  }
}
const dump = (path: string): Record<string, unknown[]> => {
  const db = new DatabaseSync(path, { readOnly: true })
  try {
    return Object.fromEntries(tables(path).map((name) => [name, db.prepare(`SELECT * FROM "${name}"`).all() as unknown[]]))
  } finally {
    db.close()
  }
}

describe('verifying a backup', () => {
  it('passes a backup downloaded from Drive: every file, every hash, and a database SQLite itself calls whole', async () => {
    const { folder } = await made()
    const report = verifyBackupDirectory(folder, null)
    expect(report).toMatchObject({ ok: true, problems: [], warnings: [], encrypted: false, keyId: null, files: 3 })
    expect(report.manifest?.schemaVersion).toBeGreaterThanOrEqual(40)
    expect(report.databaseBytes).toBeGreaterThan(4096)
  })

  it('passes an encrypted backup with the key, and says what is needed without it or with another', async () => {
    const { folder } = await made(KEY)
    expect(verifyBackupDirectory(folder, KEY)).toMatchObject({ ok: true, encrypted: true, files: 3 })
    const without = verifyBackupDirectory(folder, null)
    expect(without.ok).toBe(false)
    expect(without.problems[0]).toMatch(/manifest\.json: the backup is encrypted; the key \(BACKUP_ENCRYPTION_KEY\) is needed/)
    const other = parseBackupKey(Buffer.from(Array.from({ length: 32 }, (_, i) => 255 - i)).toString('base64'))!
    expect(verifyBackupDirectory(folder, other).problems[0]).toMatch(/different key/)
  })

  it('names what is wrong, by file name, in a backup that was changed: a byte, a missing file, a replaced database, no manifest', async () => {
    const { folder } = await made()
    const picture = join(folder, 'media', 'a1b2.png')
    const original = readFileSync(picture)
    writeFileSync(picture, Buffer.from([1, 2, 3, 5]))
    expect(verifyBackupDirectory(folder, null).problems).toEqual(['media/a1b2.png: the SHA-256 is not the one in the manifest (the file was changed or damaged).'])
    writeFileSync(picture, Buffer.from([1, 2, 3]))
    expect(verifyBackupDirectory(folder, null).problems).toEqual(['media/a1b2.png: the size is 3, the manifest says 4.'])
    writeFileSync(picture, original)
    expect(verifyBackupDirectory(folder, null).ok).toBe(true)

    const nested = join(folder, 'media', 'nested', 'c3d4.webp')
    const nestedBytes = readFileSync(nested)
    rmSync(nested)
    expect(verifyBackupDirectory(folder, null).problems).toEqual(['media/nested/c3d4.webp: missing.'])
    writeFileSync(nested, nestedBytes)

    // A database replaced by something that is not SQLite, with the manifest "fixed" to match: the hashes agree, SQLite does not.
    const database = join(folder, DATABASE_NAME)
    const realDatabase = readFileSync(database)
    const junk = Buffer.from('this is not a database '.repeat(300))
    writeFileSync(database, junk)
    const manifestPath = join(folder, MANIFEST_NAME)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const realManifest = readFileSync(manifestPath)
    manifest.database = { name: DATABASE_NAME, size: junk.length, sha256: sha256Of(junk) }
    writeFileSync(manifestPath, JSON.stringify(manifest))
    expect(verifyBackupDirectory(folder, null).problems).toEqual([`${DATABASE_NAME}: SQLite could not open it.`])
    writeFileSync(database, realDatabase)
    writeFileSync(manifestPath, realManifest)
    expect(verifyBackupDirectory(folder, null).ok).toBe(true)

    rmSync(manifestPath)
    expect(verifyBackupDirectory(folder, null).problems[0]).toMatch(/^manifest\.json: missing/)
  })

  it('does not follow a manifest that names a file outside the backup, and only warns about a file that is not listed', async () => {
    const { folder } = await made()
    const manifestPath = join(folder, MANIFEST_NAME)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const real = readFileSync(manifestPath)
    for (const name of ['../outside.png', '/etc/passwd', 'media/../../x', 'other/thing.bin', 'media\\evil.png', 'media//x']) {
      manifest.media = [{ name, size: 1, sha256: 'a'.repeat(64) }]
      writeFileSync(manifestPath, JSON.stringify(manifest))
      expect(verifyBackupDirectory(folder, null).problems.join(' '), name).toContain('the manifest names a file this program would never write')
    }
    writeFileSync(manifestPath, real)
    writeFileSync(join(folder, 'extra-note.txt'), 'someone put this here')
    expect(verifyBackupDirectory(folder, null)).toMatchObject({ ok: true, warnings: ['extra-note.txt: not in the manifest (ignored).'] })
  })

  it('reports a folder that does not exist, and a manifest that is not one, without throwing', async () => {
    expect(verifyBackupDirectory(join(scratch(), 'nowhere'), null).problems).toEqual(['The backup folder does not exist.'])
    const folder = scratch()
    writeFileSync(join(folder, MANIFEST_NAME), '{"hello": "world"}')
    expect(verifyBackupDirectory(folder, null).problems).toEqual(['manifest.json: not a manifest this program wrote.'])
    writeFileSync(join(folder, MANIFEST_NAME), 'not json at all')
    expect(verifyBackupDirectory(folder, null).ok).toBe(false)
  })
})

describe('restoring a backup into an empty scratch place', () => {
  it.each([['not encrypted', null], ['encrypted', KEY]] as [string, Buffer | null][])('restores a backup that is %s to a new database and a new media folder that match the source', async (_name, key) => {
    const { t, folder } = await made(key)
    const place = scratch('cc-drill-restore-')
    const result = restoreBackup({ directory: folder, key, target: join(place, 'restored', 'app.sqlite'), mediaTarget: join(place, 'restored', 'media'), protectedPaths: [t.server.config.databasePath] })
    expect(result.media?.files).toBe(2)
    // The restored database holds what the source held (the backup was taken after the rows were written), table by table.
    expect(tables(result.database)).toEqual(t.server.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((row) => row.name))
    const restored = dump(result.database)
    expect(restored.settings).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'audit.probe', value: '1' }), expect.objectContaining({ key: 'drill.row.4', value: 'value 4' })]))
    const source = Object.fromEntries(tables(result.database).map((name) => [name, t.server.db.all(`SELECT * FROM "${name}"`)]))
    for (const name of ['settings', 'schema_migrations', 'admin_users', 'inquiries']) expect(restored[name], name).toEqual(source[name])
    // The pictures are byte for byte the originals.
    expect(readFileSync(join(place, 'restored', 'media', 'a1b2.png'))).toEqual(Buffer.from([1, 2, 3, 4]))
    expect(readFileSync(join(place, 'restored', 'media', 'nested', 'c3d4.webp'))).toEqual(Buffer.from([5, 6, 7]))
    // It is a current, usable database: the migrations are all applied, and a server starts on it and says it is ready.
    const opened = new Database(result.database)
    expect(migrationStatus(opened)).toMatchObject({ pending: 0 })
    opened.close()
    const second = await startServer({ databasePath: result.database, seed: false, env: { MEDIA_DIR: join(place, 'restored', 'media') } })
    extraServers.push(second)
    const ready = await second.api('/api/ready')
    expect([ready.status, ready.json.data.status, ready.json.data.checks]).toEqual([200, 'ready', expect.objectContaining({ database: 'ok', migrations: 'current' })])
    // Nothing is left half written.
    expect(readdirSync(join(place, 'restored')).filter((file) => file.includes('.restoring-'))).toEqual([])
  })

  it('refuses a backup that did not pass, and writes nothing', async () => {
    const { t, folder } = await made()
    writeFileSync(join(folder, 'media', 'a1b2.png'), 'tampered')
    const place = scratch()
    const attempt = () => restoreBackup({ directory: folder, key: null, target: join(place, 'app.sqlite'), mediaTarget: join(place, 'media'), protectedPaths: [t.server.config.databasePath] })
    expect(attempt).toThrow(RestoreError)
    try {
      attempt()
    } catch (error) {
      expect((error as RestoreError).problems).toEqual(['media/a1b2.png: the size is 8, the manifest says 4.'])
    }
    expect(readdirSync(place)).toEqual([])
  })

  it('never overwrites: an existing database file, a non-empty media folder, and the live database are all refused', async () => {
    const { folder } = await made()
    const place = scratch()
    const existing = join(place, 'existing.sqlite')
    writeFileSync(existing, 'PRECIOUS')
    expect(() => restoreBackup({ directory: folder, key: null, target: existing })).toThrow(/already exists; a restore never overwrites/)
    expect(readFileSync(existing, 'utf8')).toBe('PRECIOUS')
    mkdirSync(join(place, 'media-in-use'))
    writeFileSync(join(place, 'media-in-use', 'keep.png'), 'KEEP')
    expect(() => restoreBackup({ directory: folder, key: null, target: join(place, 'fresh.sqlite'), mediaTarget: join(place, 'media-in-use') })).toThrow(/is not empty/)
    expect(existsSync(join(place, 'fresh.sqlite'))).toBe(false)
    const live = join(place, 'live.sqlite')
    for (const spelling of [live, live.toUpperCase(), join(place, '.', 'live.sqlite'), join(place, 'sub', '..', 'live.sqlite')]) {
      expect(() => restoreBackup({ directory: folder, key: null, target: spelling, protectedPaths: [live] }), spelling).toThrow(/That is the live database/)
    }
    expect(existsSync(live)).toBe(false)
  })

  it('makes a whole backup into a folder on disk (what `backup create` does), which verifies and restores like one from Drive', async () => {
    const t = await setupBackup({ key: KEY })
    current = t
    const destination = join(scratch(), 'created')
    const summary = await writeBackupToDirectory({ db: t.server.db, mediaDir: t.mediaDir, key: KEY, clock: t.server.clock, directory: destination })
    expect(summary).toMatchObject({ fileCount: 3, encrypted: true })
    expect(summary.files.sort()).toEqual(['database.sqlite.enc', 'manifest.json.enc', 'media/a1b2.png.enc', 'media/nested/c3d4.webp.enc'])
    expect(verifyBackupDirectory(destination, KEY).ok).toBe(true)
    const restored = restoreBackup({ directory: destination, key: KEY, target: join(scratch(), 'r.sqlite') })
    expect(dump(restored.database).settings).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'audit.probe' })]))
    await expect(writeBackupToDirectory({ db: t.server.db, mediaDir: t.mediaDir, key: KEY, clock: t.server.clock, directory: destination })).rejects.toThrow(/is not empty/)
  })

  it('decrypts one file by hand into a new file, with the right key only', async () => {
    const { folder } = await made(KEY)
    const place = scratch()
    const output = join(place, 'database.sqlite')
    expect(decryptFile(join(folder, 'database.sqlite.enc'), output, KEY).bytes).toBeGreaterThan(4096)
    expect(readFileSync(output).subarray(0, 15).toString('latin1')).toBe('SQLite format 3')
    expect(() => decryptFile(join(folder, 'database.sqlite.enc'), output, KEY)).toThrow(/already exists/)
    const other = parseBackupKey(Buffer.from(Array.from({ length: 32 }, (_, i) => i * 3 + 1)).toString('base64'))!
    expect(() => decryptFile(join(folder, 'database.sqlite.enc'), join(place, 'other.sqlite'), other)).toThrow(BackupCryptoError)
    expect(existsSync(join(place, 'other.sqlite'))).toBe(false)
  })
})

describe('the commands (node server/src/cli.ts backup …), as an operator runs them', () => {
  const run = (args: string[], env: Record<string, string>) => {
    const result = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', join(import.meta.dirname, '..', 'src', 'cli.ts'), ...args], {
      env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', TEMP: process.env.TEMP ?? '', TMP: process.env.TMP ?? '', APP_ENV: 'development', ...env },
      encoding: 'utf8',
      timeout: 60_000,
    })
    return { code: result.status, out: result.stdout, err: result.stderr }
  }

  it('create, verify, decrypt and restore a backup, and refuse what is unsafe, with exit codes a script can rely on', () => {
    const home = scratch('cc-cli-')
    const databasePath = join(home, 'data', 'app.sqlite')
    const env = { DATABASE_PATH: databasePath, MEDIA_DIR: join(home, 'data', 'media'), BACKUP_ENCRYPTION_KEY: TEST_KEY_TEXT, EMAIL_PROVIDER: 'none' }
    expect(run(['migrate'], env).out).toMatch(/Applied migrations: .*40\.\s+Schema version 40\./)
    mkdirSync(join(home, 'data', 'media'), { recursive: true })
    writeFileSync(join(home, 'data', 'media', 'photo.png'), Buffer.from([9, 8, 7]))
    const raw = new DatabaseSync(databasePath)
    raw.exec("INSERT INTO settings (key, value, updated_at) VALUES ('cli.drill', 'yes', '2026-11-03T00:00:00.000Z')")
    raw.close()

    const folder = join(home, 'backup')
    const create = run(['backup', 'create', folder], env)
    expect(create.code, create.err).toBe(0)
    expect(create.out).toMatch(/2 file\(s\).*encrypted\./s)
    expect(readdirSync(folder).sort()).toEqual(['database.sqlite.enc', 'manifest.json.enc', 'media'])
    expect(run(['backup', 'create', folder], env).code, 'a folder that is not empty is refused').toBe(1)

    const verify = run(['backup', 'verify', folder], env)
    expect([verify.code, verify.out]).toEqual([0, expect.stringMatching(/^Backup OK: 2 file\(s\) checked, database \d+ bytes, encrypted \(key id [0-9a-f]{8}\), schema version 40/)])
    expect(run(['backup', 'verify', folder], { ...env, BACKUP_ENCRYPTION_KEY: '' }).code, 'without the key').toBe(1)

    const decrypted = join(home, 'plain.sqlite')
    expect(run(['backup', 'decrypt', join(folder, 'database.sqlite.enc'), decrypted], env).out).toMatch(/^Decrypted to .*plain\.sqlite \(\d+ bytes\)\./)
    expect(readFileSync(decrypted).subarray(0, 15).toString('latin1')).toBe('SQLite format 3')
    expect(run(['backup', 'decrypt', join(folder, 'database.sqlite.enc'), decrypted], env).code, 'never over an existing file').toBe(1)

    const restoredPath = join(home, 'drill', 'restored.sqlite')
    const restore = run(['backup', 'restore', folder, restoredPath, '--media', join(home, 'drill', 'media')], env)
    expect(restore.code, restore.err).toBe(0)
    expect(restore.out).toMatch(/Restored the database to .*restored\.sqlite.*Restored 1 picture\(s\) .*Nothing that existed was changed/s)
    expect(dump(restoredPath).settings).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'cli.drill', value: 'yes' })]))
    expect(readFileSync(join(home, 'drill', 'media', 'photo.png'))).toEqual(Buffer.from([9, 8, 7]))

    const refused = run(['backup', 'restore', folder, databasePath], env)
    expect(refused.code).toBe(1)
    expect(refused.err).toMatch(/That is the live database/)
    expect(run(['backup', 'restore', folder, restoredPath], env).err).toMatch(/already exists; a restore never overwrites/)
    // The live database was never touched by any of it.
    expect(dump(databasePath).settings).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'cli.drill' })]))

    // A changed backup: the command says NOT OK, names the file, and exits non-zero.
    writeFileSync(join(folder, 'media', 'photo.png.enc'), 'damaged')
    const damaged = run(['backup', 'verify', folder], env)
    expect(damaged.code).toBe(1)
    expect(damaged.out).toMatch(/^Backup NOT OK/)
    expect(damaged.out).toMatch(/PROBLEM: media\/photo\.png: the size is 7, the manifest says 3/)
  }, 120_000)
})
