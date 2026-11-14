import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Config } from '../../config.ts'

/**
 * Where the uploaded pictures live and whether that place is safe to keep them in (PROMPT 22). A hosting platform's application folder is
 * usually rebuilt on every deploy, so pictures kept there are lost; they must be on a persistent disk. The server cannot see the host's
 * settings, so it asks the one question it can answer: is the media folder on the same filesystem as the application's own files? If it is, and
 * this is production, that is reported as a warning (it is a strong hint, not proof: a host may mount a disk over the application folder). It also
 * checks that the folder can be written to. Nothing here changes anything beyond creating the folder and a probe file it removes at once.
 */

export interface MediaStorage {
  directory: string
  writable: boolean
  /** `true` when the folder is on the application's own filesystem, `false` when it is on another (a mounted disk), `null` when that could not be told. */
  onApplicationFilesystem: boolean | null
  /** Why an administrator should look at it, or `null`. */
  warning: 'not_writable' | 'application_filesystem' | null
  files: number
}

const APPLICATION_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..')

export function mediaStorage(config: Pick<Config, 'mediaDir' | 'env'>): MediaStorage {
  const directory = resolve(config.mediaDir)
  let writable = false
  try {
    mkdirSync(directory, { recursive: true })
    const probe = join(directory, `.write-test-${process.pid}`)
    writeFileSync(probe, 'x')
    unlinkSync(probe)
    writable = true
  } catch {
    writable = false
  }
  let onApplicationFilesystem: boolean | null = null
  try {
    onApplicationFilesystem = statSync(directory).dev === statSync(APPLICATION_ROOT).dev
  } catch {
    onApplicationFilesystem = null
  }
  let files = 0
  try {
    files = readdirSync(directory).filter((name) => !name.startsWith('.')).length
  } catch {
    files = 0
  }
  const warning = !writable ? 'not_writable' : config.env === 'production' && onApplicationFilesystem === true ? 'application_filesystem' : null
  return { directory, writable, onApplicationFilesystem, warning, files }
}
