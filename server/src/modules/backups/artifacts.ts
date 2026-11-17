import { createHash } from 'node:crypto'
import { readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import type { Database } from '../../db/database.ts'
import { migrationStatus } from '../../db/migrate.ts'
import { iso, type Clock } from '../../lib/time.ts'
import { BackupCryptoError, encryptBackup, keyIdOf } from './crypto.ts'
import { BackupError } from './errors.ts'

/**
 * What a backup is made of, independent of where it goes (Google Drive, a folder for a restore drill): a consistent snapshot of the
 * database (`VACUUM INTO`, taken while the server runs), the uploaded pictures, and a manifest that lists every file with its size and
 * SHA-256, so that a restore can prove it has everything and that nothing changed. With a key every file (the manifest too) is
 * encrypted before it is handed over and its name gets `.enc`; the manifest's hashes are always those of the plaintext.
 *
 * A backup is produced one file at a time (the pictures are not all held in memory together); the manifest comes last.
 */

export const MANIFEST_NAME = 'manifest.json'
export const DATABASE_NAME = 'database.sqlite'
export const ENCRYPTED_SUFFIX = '.enc'

export interface BackupFile {
  kind: 'database' | 'media' | 'manifest'
  /** The name in the manifest: what a restore recreates (`database.sqlite`, `media/a1b2.png`). */
  name: string
  /** The name it is stored under: the same, plus `.enc` when encrypted. */
  storedName: string
  /** The bytes to store (encrypted, if there is a key). */
  stored: Buffer
  /** Plaintext size and SHA-256. */
  size: number
  sha256: string
}

export interface Manifest {
  format: 1
  createdAt: string
  encrypted: boolean
  /** The public identifier of the key (not the key): which key a restore needs. */
  keyId: string | null
  /** The newest migration the database had when it was backed up. */
  schemaVersion: number
  database: { name: string; size: number; sha256: string }
  media: { name: string; size: number; sha256: string }[]
}

export interface BackupSummary {
  /** Database and pictures; the manifest is not counted. */
  fileCount: number
  /** What was stored (after encryption), for the same files. */
  totalBytes: number
  databaseSha256: string
  manifestSha256: string
  encrypted: boolean
}

export const sha256Of = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')

async function mediaFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const walk = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  try {
    await walk(root)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return files.sort()
}

export interface BackupSet {
  /** The files, one at a time, the database first and the manifest last. Must be read to the end. */
  files(): AsyncGenerator<BackupFile>
  /** Valid once `files()` has been read to the end. */
  summary(): BackupSummary
}

export function createBackupSet(options: { db: Database; mediaDir: string; key: Buffer | null; clock: Clock }): BackupSet {
  const { db, mediaDir, key, clock } = options
  let summary: BackupSummary | null = null
  const wrap = (kind: BackupFile['kind'], name: string, plain: Buffer): BackupFile => ({
    kind,
    name,
    storedName: key ? `${name}${ENCRYPTED_SUFFIX}` : name,
    stored: key ? encryptBackup(key, plain) : plain,
    size: plain.byteLength,
    sha256: sha256Of(plain),
  })

  async function* files(): AsyncGenerator<BackupFile> {
    // A consistent copy of the live database in one file, taken while the server runs; the temporary file is always removed.
    const snapshot = join(tmpdir(), `portfolio-${process.pid}-${Date.now()}.sqlite`)
    let fileCount = 0
    let totalBytes = 0
    let database: BackupFile
    try {
      try {
        db.run('VACUUM INTO ?', [snapshot])
        database = wrap('database', DATABASE_NAME, await readFile(snapshot))
      } catch (error) {
        throw error instanceof BackupCryptoError ? error : new BackupError('snapshot')
      }
    } finally {
      await rm(snapshot, { force: true }).catch(() => undefined)
    }
    const schemaVersion = migrationStatus(db).current
    fileCount += 1
    totalBytes += database.stored.byteLength
    yield database

    const media: Manifest['media'] = []
    for (const path of await mediaFiles(mediaDir)) {
      const file = wrap('media', `media/${relative(mediaDir, path).split(sep).join('/')}`, await readFile(path))
      media.push({ name: file.name, size: file.size, sha256: file.sha256 })
      fileCount += 1
      totalBytes += file.stored.byteLength
      yield file
    }

    const manifest: Manifest = { format: 1, createdAt: iso(clock.now()), encrypted: key !== null, keyId: key ? keyIdOf(key) : null, schemaVersion, database: { name: database.name, size: database.size, sha256: database.sha256 }, media }
    const manifestFile = wrap('manifest', MANIFEST_NAME, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'))
    summary = { fileCount, totalBytes, databaseSha256: database.sha256, manifestSha256: manifestFile.sha256, encrypted: key !== null }
    yield manifestFile
  }

  return {
    files,
    summary() {
      if (!summary) throw new Error('The backup set was not read to the end.')
      return summary
    },
  }
}
