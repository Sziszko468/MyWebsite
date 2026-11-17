import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Database } from '../../db/database.ts'
import type { Clock } from '../../lib/time.ts'
import { createBackupSet, DATABASE_NAME, ENCRYPTED_SUFFIX, MANIFEST_NAME, sha256Of, type BackupSummary, type Manifest } from './artifacts.ts'
import { BackupCryptoError, decryptBackup, isEncryptedBackup, keyIdOf } from './crypto.ts'

/**
 * Backups on a plain folder: the same files, in the same format, as the ones sent to Google Drive. This is what a restore drill uses
 * (download the day's folder from Drive, or make one here with `backup create`), and the commands behind it:
 *
 *   - `writeBackupToDirectory`: a backup into a new, empty folder.
 *   - `verifyBackupDirectory`: every file in the manifest is there, its size and SHA-256 are right, the database is a whole SQLite file.
 *   - `restoreBackup`: verifies, then writes the database (and the pictures) to NEW paths. It never overwrites anything and refuses the
 *     paths it is told are protected (the live database), so a drill cannot touch production by a slip of a path.
 *   - `decryptFile`: one encrypted file, by hand.
 *
 * Problems are reported by file name (a name in a backup is not a secret) and never by content.
 */

export class RestoreError extends Error {
  readonly problems: readonly string[]
  constructor(message: string, problems: readonly string[] = []) {
    super(message)
    this.name = 'RestoreError'
    this.problems = problems
  }
}

const hasUnsafeSegment = (name: string): boolean => isAbsolute(name) || name.includes('\\') || name.split('/').some((part) => part === '' || part === '.' || part === '..')

/** Writes a backup into a folder that does not exist yet, or is empty. */
export async function writeBackupToDirectory(options: { db: Database; mediaDir: string; key: Buffer | null; clock: Clock; directory: string }): Promise<BackupSummary & { directory: string; files: string[] }> {
  const directory = resolve(options.directory)
  if (existsSync(directory) && readdirSync(directory).length > 0) throw new RestoreError(`${directory} is not empty; choose a new folder.`)
  mkdirSync(directory, { recursive: true })
  const set = createBackupSet({ db: options.db, mediaDir: options.mediaDir, key: options.key, clock: options.clock })
  const written: string[] = []
  for await (const file of set.files()) {
    if (hasUnsafeSegment(file.storedName)) throw new RestoreError('A file name in the backup is not acceptable.')
    const path = join(directory, ...file.storedName.split('/'))
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, file.stored)
    written.push(file.storedName)
  }
  return { ...set.summary(), directory, files: written }
}

export interface BackupReport {
  ok: boolean
  /** Every problem makes the backup unusable as it is. */
  problems: string[]
  /** Things worth knowing that do not make it unusable (a file that is not in the manifest). */
  warnings: string[]
  manifest: Manifest | null
  encrypted: boolean
  keyId: string | null
  files: number
  databaseBytes: number
}

interface Loaded {
  report: BackupReport
  /** Plaintext of the database and of every picture, by manifest name; only for a backup that passed. */
  contents: Map<string, Buffer>
}

function locate(directory: string, name: string): string | null {
  const plain = join(directory, ...name.split('/'))
  if (existsSync(plain)) return plain
  const encrypted = `${plain}${ENCRYPTED_SUFFIX}`
  return existsSync(encrypted) ? encrypted : null
}

function walk(directory: string, prefix = ''): string[] {
  const names: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) names.push(...walk(join(directory, entry.name), `${prefix}${entry.name}/`))
    else if (entry.isFile()) names.push(`${prefix}${entry.name}`)
  }
  return names
}

function isManifest(value: unknown): value is Manifest {
  const m = value as Partial<Manifest> | null
  return typeof m === 'object' && m !== null && m.format === 1 && typeof m.encrypted === 'boolean' && typeof m.database === 'object' && m.database !== null && Array.isArray(m.media)
}

function readBackup(directory: string, key: Buffer | null): Loaded {
  const problems: string[] = []
  const warnings: string[] = []
  const contents = new Map<string, Buffer>()
  const report: BackupReport = { ok: false, problems, warnings, manifest: null, encrypted: false, keyId: null, files: 0, databaseBytes: 0 }
  const root = resolve(directory)
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    problems.push('The backup folder does not exist.')
    return { report, contents }
  }

  /** Reads a stored file; decrypts it if it is encrypted. Null (with the problem recorded) when it cannot be read. */
  const open = (path: string, label: string): Buffer | null => {
    const bytes = readFileSync(path)
    if (!isEncryptedBackup(bytes)) return bytes
    if (!key) {
      problems.push(`${label}: the backup is encrypted; the key (BACKUP_ENCRYPTION_KEY) is needed.`)
      return null
    }
    try {
      return decryptBackup(key, bytes)
    } catch (error) {
      problems.push(`${label}: ${error instanceof BackupCryptoError ? error.message : 'it could not be decrypted.'}`)
      return null
    }
  }

  const manifestPath = locate(root, MANIFEST_NAME)
  if (!manifestPath) {
    problems.push(`${MANIFEST_NAME}: missing (it lists every file; without it the backup cannot be checked).`)
    return { report, contents }
  }
  const manifestBytes = open(manifestPath, MANIFEST_NAME)
  if (!manifestBytes) return { report, contents }
  let manifest: unknown
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'))
  } catch {
    manifest = null
  }
  if (!isManifest(manifest)) {
    problems.push(`${MANIFEST_NAME}: not a manifest this program wrote.`)
    return { report, contents }
  }
  report.manifest = manifest
  report.encrypted = manifest.encrypted
  report.keyId = manifest.keyId
  if (manifest.encrypted && key && manifest.keyId !== null && manifest.keyId !== keyIdOf(key)) warnings.push('The key given is not the one named in the manifest.')

  const entries = [manifest.database, ...manifest.media]
  for (const entry of entries) {
    const name = typeof entry?.name === 'string' ? entry.name : ''
    if (name === '' || hasUnsafeSegment(name) || (name !== DATABASE_NAME && !name.startsWith('media/'))) {
      problems.push(`${name || '(no name)'}: the manifest names a file this program would never write.`)
      continue
    }
    const path = locate(root, name)
    if (!path) {
      problems.push(`${name}: missing.`)
      continue
    }
    const plain = open(path, name)
    if (!plain) continue
    if (plain.byteLength !== entry.size) problems.push(`${name}: the size is ${plain.byteLength}, the manifest says ${entry.size}.`)
    else if (sha256Of(plain) !== entry.sha256) problems.push(`${name}: the SHA-256 is not the one in the manifest (the file was changed or damaged).`)
    else contents.set(name, plain)
    if (manifest.encrypted !== isEncryptedBackup(readFileSync(path))) warnings.push(`${name}: stored ${manifest.encrypted ? 'without' : 'with'} encryption although the manifest says the opposite.`)
  }

  const known = new Set(entries.flatMap((entry) => (typeof entry?.name === 'string' ? [entry.name, `${entry.name}${ENCRYPTED_SUFFIX}`] : [])))
  known.add(MANIFEST_NAME).add(`${MANIFEST_NAME}${ENCRYPTED_SUFFIX}`)
  for (const name of walk(root)) if (!known.has(name)) warnings.push(`${name}: not in the manifest (ignored).`)

  // The database must be a whole SQLite file, not only the right bytes: open it read-only and let SQLite check itself.
  const database = contents.get(DATABASE_NAME)
  if (database) {
    report.databaseBytes = database.byteLength
    const scratch = mkdtempSync(join(tmpdir(), 'cc-backup-verify-'))
    try {
      const file = join(scratch, DATABASE_NAME)
      writeFileSync(file, database)
      const db = new DatabaseSync(file, { readOnly: true })
      try {
        const integrity = (db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined)?.integrity_check
        if (integrity !== 'ok') problems.push(`${DATABASE_NAME}: SQLite's own integrity check did not say ok.`)
        const version = (db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number | null } | undefined)?.version ?? null
        if (version === null) problems.push(`${DATABASE_NAME}: it has no migration history, so it is not this application's database.`)
        else if (version !== manifest.schemaVersion) warnings.push(`${DATABASE_NAME}: schema version ${version}, the manifest says ${manifest.schemaVersion}.`)
      } finally {
        db.close()
      }
    } catch {
      problems.push(`${DATABASE_NAME}: SQLite could not open it.`)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  }

  report.files = contents.size
  report.ok = problems.length === 0
  return { report, contents }
}

/** Checks a backup folder (downloaded from Drive, or made by `writeBackupToDirectory`) without changing anything. */
export function verifyBackupDirectory(directory: string, key: Buffer | null): BackupReport {
  return readBackup(directory, key).report
}

export interface RestoreResult {
  database: string
  databaseBytes: number
  media: { directory: string; files: number } | null
}

/**
 * Restores a verified backup to NEW paths. The database goes to `target` (written beside it first and renamed, so a half-written file is
 * never at `target`); the pictures, if `mediaTarget` is given, into that folder. Nothing that exists is overwritten, and a path in
 * `protectedPaths` (the live database's) is refused whatever else is true: a restore drill happens in an empty scratch place.
 */
export function restoreBackup(options: { directory: string; key: Buffer | null; target: string; mediaTarget?: string; protectedPaths?: readonly string[] }): RestoreResult {
  const target = resolve(options.target)
  const same = (path: string) => normalize(path).toLowerCase() === normalize(target).toLowerCase()
  if ((options.protectedPaths ?? []).some((path) => path !== ':memory:' && same(resolve(path)))) throw new RestoreError('That is the live database. A restore never writes to it: restore to a new file.')
  if (existsSync(target) || existsSync(`${target}-wal`) || existsSync(`${target}-shm`)) throw new RestoreError(`${target} already exists; a restore never overwrites. Choose a new file.`)
  const mediaTarget = options.mediaTarget ? resolve(options.mediaTarget) : null
  if (mediaTarget && existsSync(mediaTarget) && readdirSync(mediaTarget).length > 0) throw new RestoreError(`${mediaTarget} is not empty; choose a new folder.`)

  const { report, contents } = readBackup(options.directory, options.key)
  if (!report.ok) throw new RestoreError('The backup did not pass its checks, so nothing was restored.', report.problems)
  const database = contents.get(DATABASE_NAME)
  if (!database) throw new RestoreError('The backup has no database.')

  mkdirSync(dirname(target), { recursive: true })
  const partial = `${target}.restoring-${process.pid}`
  writeFileSync(partial, database, { flag: 'wx' })
  renameSync(partial, target)

  let media: RestoreResult['media'] = null
  if (mediaTarget) {
    let files = 0
    for (const [name, bytes] of contents) {
      if (!name.startsWith('media/')) continue
      const path = join(mediaTarget, ...name.slice('media/'.length).split('/'))
      if (!path.startsWith(`${mediaTarget}${sep}`)) throw new RestoreError('A picture name leads outside the folder.')
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, bytes, { flag: 'wx' })
      files += 1
    }
    media = { directory: mediaTarget, files }
  }
  return { database: target, databaseBytes: database.byteLength, media }
}

/** Decrypts one file, the way the documentation says to do it by hand; writes a new file only. */
export function decryptFile(input: string, output: string, key: Buffer): { bytes: number } {
  const out = resolve(output)
  if (existsSync(out)) throw new RestoreError(`${out} already exists; choose a new file name.`)
  const plain = decryptBackup(key, readFileSync(resolve(input)))
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, plain, { flag: 'wx' })
  return { bytes: plain.byteLength }
}
