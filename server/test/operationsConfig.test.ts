import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ConfigError, loadConfig, redactedConfig } from '../src/config.ts'
import { TEST_KEY_TEXT } from './driveKit.ts'

/** The settings PROMPT 25 added, and that none of them can put a secret in what the System page shows. */

const problems = (env: Record<string, string>): string[] => {
  try {
    loadConfig(env)
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError)
    return [...(error as ConfigError).problems]
  }
  return []
}

describe('the operations settings', () => {
  it('start with sensible defaults: no encryption, snapshots for 14 days beside the database, no canonical redirect', () => {
    const config = loadConfig({ DATABASE_PATH: '/var/data/app.sqlite' })
    expect(config.backup.encryptionKey).toBeNull()
    expect(config.migrationSnapshots).toEqual({ days: 14, directory: join('/var/data', 'migration-snapshots') })
    expect(config.canonicalRedirect).toBe(false)
  })

  it('read the key (base64 or hex), the retention and the folder', () => {
    const config = loadConfig({ BACKUP_ENCRYPTION_KEY: TEST_KEY_TEXT, MIGRATION_SNAPSHOT_DAYS: '30', MIGRATION_SNAPSHOT_DIR: '/var/data/snaps', DATABASE_PATH: '/var/data/app.sqlite' })
    expect(config.backup.encryptionKey).toHaveLength(32)
    expect(loadConfig({ BACKUP_ENCRYPTION_KEY: config.backup.encryptionKey!.toString('hex') }).backup.encryptionKey).toEqual(config.backup.encryptionKey)
    expect(config.migrationSnapshots).toEqual({ days: 30, directory: '/var/data/snaps' })
    expect(loadConfig({ MIGRATION_SNAPSHOT_DAYS: '0' }).migrationSnapshots.days).toBe(0)
  })

  it('stop the server for a key that is set but cannot be one, and the message never repeats the value', () => {
    for (const bad of ['short', 'not base64 !!', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=']) {
      const found = problems({ BACKUP_ENCRYPTION_KEY: bad })
      expect(found, bad).toHaveLength(1)
      expect(found[0]).toMatch(/^BACKUP_ENCRYPTION_KEY: must be 32 random bytes/)
      expect(found[0]).not.toContain(bad)
    }
  })

  it('refuse what is out of range, and a canonical redirect with no address to redirect to', () => {
    expect(problems({ MIGRATION_SNAPSHOT_DAYS: '-1' })[0]).toMatch(/^MIGRATION_SNAPSHOT_DAYS: must be a whole number from 0 to 365/)
    expect(problems({ MIGRATION_SNAPSHOT_DAYS: '366' })).toHaveLength(1)
    expect(problems({ CANONICAL_REDIRECT: 'true' })[0]).toMatch(/^CANONICAL_REDIRECT: needs PUBLIC_URL/)
    expect(problems({ CANONICAL_REDIRECT: 'true', PUBLIC_URL: 'https://szilardkiss.com' })).toEqual([])
    expect(problems({ CANONICAL_REDIRECT: 'maybe', PUBLIC_URL: 'https://szilardkiss.com' })[0]).toMatch(/^CANONICAL_REDIRECT: must be true or false/)
  })

  it('show the System page whether backups are encrypted and the snapshot retention, and never the key', () => {
    const shown = redactedConfig(loadConfig({ BACKUP_ENCRYPTION_KEY: TEST_KEY_TEXT, GOOGLE_DRIVE_CLIENT_ID: 'a', GOOGLE_DRIVE_CLIENT_SECRET: 'b', GOOGLE_DRIVE_REFRESH_TOKEN: 'c' }))
    expect(shown.googleDriveBackup).toMatchObject({ enabled: true, encrypted: true })
    expect(shown.migrationSnapshots).toEqual({ days: 14 })
    expect(shown.canonicalRedirect).toBe(false)
    const text = JSON.stringify(shown)
    expect(text).not.toContain(TEST_KEY_TEXT)
    expect(text).not.toContain(Buffer.from(TEST_KEY_TEXT, 'base64').toString('hex'))
  })
})
