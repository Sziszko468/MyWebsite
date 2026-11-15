import type { GmailConfig } from '../../config.ts'
import type { Database } from '../../db/database.ts'
import { newId } from '../../lib/crypto.ts'
import type { Logger } from '../../lib/logger.ts'
import { iso, type Clock } from '../../lib/time.ts'
import { GmailApiError, type GmailApiClient } from './api.ts'
import { resolveAssociation } from './association.ts'
import { MimeError, parseGmailMessage, type MimeLimits, MIME_LIMITS } from './mime.ts'
import { insertMessage, messageCounts, readSyncState, storedIds, writeSyncState } from './repository.ts'
import { GmailAuthError } from './tokenService.ts'

/**
 * One bounded, idempotent synchronisation of the mailbox's inbox into `gmail_messages`, started by hand (nothing runs it on a timer).
 *
 * How a run goes: list the inbox messages of a recent window, newest first, page by page up to a limit; drop what is already stored
 * (the unique Gmail id: this is what makes a run safe to repeat, to interrupt and to run again after a restart); fetch and store at
 * most `maxImport` of the rest, each in a transaction of its own, oldest first so that a reply finds the conversation it belongs to; what
 * is left over is reported and is picked up by the next run. One message that cannot be read is counted and skipped; an error that would
 * hit every message (the credentials, a limit, Google being down) ends the run, with what was imported kept. Only one run at a time.
 *
 * No access token is ever stored, no message text is logged, and no error carries anything Google or the network said.
 */

export interface SyncOptions {
  /** How far back the inbox is looked at, in days (1 to 90). */
  windowDays?: number
  /** How many new messages one run fetches (1 to 100). */
  maxImport?: number
}

export interface SyncResult {
  imported: number
  skippedDuplicates: number
  associated: number
  unassigned: number
  failed: number
  /** New messages found but left for the next run (over `maxImport`, over the time limit, or past the end of what one run lists). */
  remaining: number
  /** When the last run that was not cut short finished. */
  lastSyncAt: string | null
  /** A category if the run was cut short or some messages failed, otherwise null. */
  error: string | null
}

export interface SyncStatus {
  configured: boolean
  lastSyncAt: string | null
  lastError: string | null
  importedCount: number
  pendingAssociationCount: number
  currentlySyncing: boolean
}

export const SYNC_LIMITS = { windowDays: { default: 14, min: 1, max: 90 }, maxImport: { default: 50, min: 1, max: 100 }, maxListed: 500, pageSize: 100, deadlineMs: 60_000 }

/** Another run is under way. */
export class SyncBusyError extends Error {
  constructor() {
    super('A synchronization is already running.')
    this.name = 'SyncBusyError'
  }
}

/** What stops a whole run: it would be the same for every message that follows. */
const RUN_ENDING = new Set(['api_unauthorized', 'api_forbidden', 'rate_limited', 'provider_unavailable', 'network'])

export interface SyncDeps {
  config: GmailConfig
  db: Database
  clock: Clock
  log: Pick<Logger, 'info' | 'warn' | 'error'>
  api: GmailApiClient
  mime?: MimeLimits
  /** The most one run may take. */
  deadlineMs?: number
}

export class GmailSync {
  private readonly deps: SyncDeps
  private running = false

  constructor(deps: SyncDeps) {
    this.deps = deps
  }

  get currentlySyncing(): boolean {
    return this.running
  }

  status(): SyncStatus {
    const { db, config } = this.deps
    const state = readSyncState(db)
    const counts = messageCounts(db)
    return { configured: config.enabled, lastSyncAt: state.lastSuccessAt, lastError: state.lastError, importedCount: counts.imported, pendingAssociationCount: counts.pending, currentlySyncing: this.running }
  }

  async run(options: SyncOptions = {}): Promise<SyncResult> {
    if (this.running) throw new SyncBusyError()
    this.running = true
    try {
      return await this.execute(options)
    } finally {
      this.running = false
    }
  }

  private async execute(options: SyncOptions): Promise<SyncResult> {
    const { db, clock, log, api, config } = this.deps
    const limits = SYNC_LIMITS
    const windowDays = Math.min(limits.windowDays.max, Math.max(limits.windowDays.min, Math.floor(options.windowDays ?? limits.windowDays.default)))
    const maxImport = Math.min(limits.maxImport.max, Math.max(limits.maxImport.min, Math.floor(options.maxImport ?? limits.maxImport.default)))
    const started = clock.now()
    const deadline = started.getTime() + (this.deps.deadlineMs ?? limits.deadlineMs)
    const previous = readSyncState(db)
    const result: SyncResult = { imported: 0, skippedDuplicates: 0, associated: 0, unassigned: 0, failed: 0, remaining: 0, lastSyncAt: previous.lastSuccessAt, error: null }
    let endedBy: string | null = null

    try {
      // 1. The newest messages of the window, page by page, up to the limit of one run.
      const listed: string[] = []
      let pageToken: string | undefined
      do {
        const page = await api.listMessages({ labelIds: ['INBOX'], query: `after:${Math.floor((started.getTime() - windowDays * 86_400_000) / 1000)}`, maxResults: limits.pageSize, pageToken })
        for (const ref of page.messages) if (!listed.includes(ref.id)) listed.push(ref.id)
        pageToken = page.nextPageToken ?? undefined
      } while (pageToken !== undefined && listed.length < limits.maxListed)
      if (listed.length > limits.maxListed) listed.length = limits.maxListed

      // 2. What is new, and how much of it this run takes. (Messages older than the run lists are not counted: the window decides how far back it looks.)
      const known = storedIds(db, listed)
      const fresh = listed.filter((id) => !known.has(id))
      result.skippedDuplicates = listed.length - fresh.length
      const batch = fresh.slice(0, maxImport)
      result.remaining = fresh.length - batch.length

      // 3. One message at a time, oldest first, each stored on its own.
      for (const [index, id] of [...batch].reverse().entries()) {
        if (clock.now().getTime() > deadline) {
          result.remaining += batch.length - index
          endedBy = 'timeout'
          break
        }
        try {
          const raw = await api.getMessage(id)
          const parsed = parseGmailMessage(raw, this.deps.mime ?? MIME_LIMITS)
          const own = config.accountEmail.toLowerCase()
          const direction = parsed.labels.includes('SENT') || (own !== '' && parsed.from?.address === own) ? 'outbound' : 'inbound'
          const outcome = db.transaction(() => {
            const resolution = resolveAssociation(db, { threadId: parsed.gmailThreadId, inReplyTo: parsed.inReplyTo, references: parsed.references, senderAddress: parsed.from?.address ?? '', direction })
            const status = insertMessage(db, { id: newId(), parsed, direction, target: resolution.target, source: resolution.source, importedAt: iso(clock.now()) })
            return { status, associated: resolution.target !== null }
          })
          if (outcome.status === 'duplicate') result.skippedDuplicates += 1
          else {
            result.imported += 1
            if (outcome.associated) result.associated += 1
            else result.unassigned += 1
          }
        } catch (error) {
          const category = categoryOf(error)
          if (category === 'internal_error') throw error
          if (RUN_ENDING.has(category) || error instanceof GmailAuthError) {
            result.remaining += batch.length - index
            endedBy = category
            break
          }
          // This message only (it is gone, too big, or not a message): counted, skipped, and the next one is tried.
          result.failed += 1
          log.warn('A Gmail message was not imported', { category })
        }
      }
    } catch (error) {
      const category = categoryOf(error)
      if (category === 'internal_error') log.error('Gmail synchronization failed unexpectedly', { error })
      endedBy = category
    }

    const finished = iso(clock.now())
    const cutShort = endedBy !== null
    result.error = endedBy ?? (result.failed > 0 ? 'partial_failure' : null)
    if (!cutShort) result.lastSyncAt = finished
    writeSyncState(db, { lastAttemptAt: finished, lastSuccessAt: cutShort ? previous.lastSuccessAt : finished, lastError: result.error, lastImported: result.imported, lastFailed: result.failed })
    const summary = { imported: result.imported, duplicates: result.skippedDuplicates, associated: result.associated, unassigned: result.unassigned, failed: result.failed, remaining: result.remaining, category: result.error }
    if (cutShort) log.warn('Gmail synchronization stopped early', summary)
    else log.info('Gmail synchronization finished', summary)
    return result
  }
}

/** A category for whatever went wrong: a fixed word, never the error's own text. */
export function categoryOf(error: unknown): string {
  if (error instanceof GmailAuthError || error instanceof GmailApiError) return error.category
  if (error instanceof MimeError) return error.reason === 'too_large' ? 'too_large' : 'invalid_response'
  return 'internal_error'
}
