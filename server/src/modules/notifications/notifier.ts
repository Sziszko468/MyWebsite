import type { Config } from '../../config.ts'
import type { Database } from '../../db/database.ts'
import { newId } from '../../lib/crypto.ts'
import { redactText, type Logger } from '../../lib/logger.ts'
import { addMs, iso, MINUTE, type Clock } from '../../lib/time.ts'
import { loadCatalog } from '../catalog/repository.ts'
import { getInquiry } from '../inquiries/repository.ts'
import { getQuote, quoteItems } from '../quotes/repository.ts'
import { totalsOf } from '../shop/pricing.ts'
import { MailError } from './smtp.ts'
import type { Mailer } from './mailer.ts'
import { MimeError, type MailMessage } from './mime.ts'
import { renderInquiryReceived, renderQuoteReceived, renderStatusChange, type EmailKind, type Rendered } from './templates.ts'

/**
 * The outbox. A notification is a row in `email_deliveries` first and an e-mail second: the visitor's request is
 * stored and answered, then the message is rendered from the stored record and handed to the provider in the
 * background. A failure that may pass (a busy server, a dropped connection) is tried again after a growing pause,
 * a permanent one (the server refused the address) is not; every attempt is counted and its error is kept, with
 * addresses masked. The row ends `accepted` (the provider took the message, which is all that is ever claimed),
 * `failed` or `cancelled` (the record it was about has been deleted). With no provider configured nothing is queued.
 */

/** Pauses before the 2nd, 3rd, 4th… attempt. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 720]
const STUCK_AFTER_MS = 10 * MINUTE

export interface NotifierDeps {
  db: Database
  config: Config
  clock: Clock
  log: Logger
  mailer: Mailer | null
}

export interface DeliveryRow {
  id: string
  kind: EmailKind
  related_type: 'inquiry' | 'quote_request'
  related_id: string
  recipient: string
  language: 'hu' | 'en' | 'nl'
  note: string | null
  status: 'pending' | 'sending' | 'accepted' | 'failed' | 'cancelled'
  attempts: number
  next_attempt_at: string | null
  last_error: string | null
  provider_message_id: string | null
  created_at: string
  updated_at: string
  accepted_at: string | null
}

export class Notifier {
  private readonly deps: NotifierDeps
  private timer: ReturnType<typeof setInterval> | null = null
  private running: Promise<unknown> | null = null

  constructor(deps: NotifierDeps) {
    this.deps = deps
  }

  /** Whether any e-mail can be sent at all (a provider is configured and there is a sender). */
  get enabled(): boolean {
    return this.deps.mailer !== null && this.deps.config.email.from !== null
  }

  private enqueue(input: { kind: EmailKind; relatedType: DeliveryRow['related_type']; relatedId: string; recipient: string; language: DeliveryRow['language']; note?: string | null }): string {
    const now = iso(this.deps.clock.now())
    const id = newId()
    this.deps.db.run(
      `INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, note, status, attempts, next_attempt_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
      [id, input.kind, input.relatedType, input.relatedId, input.recipient, input.language, input.note ?? null, now, now, now],
    )
    this.kick()
    return id
  }

  /** The owner's notification of a new message or quote request. Skipped (and said so in the log) when there is nowhere to send it. */
  notifyOwner(kind: 'inquiry_received' | 'quote_received', relatedId: string): void {
    const { config, log } = this.deps
    if (!this.enabled || !config.email.notifyTo) {
      log.debug('owner notification skipped: no provider or no NOTIFY_TO', { kind })
      return
    }
    try {
      this.enqueue({ kind, relatedType: kind === 'inquiry_received' ? 'inquiry' : 'quote_request', relatedId, recipient: config.email.notifyTo, language: config.email.notifyLanguage })
    } catch (error) {
      // The visitor's request is already stored; a failure to queue its notification must not turn into an error for them.
      log.error('could not queue the owner notification', { kind, error })
    }
  }

  /** A status change e-mail to the person who wrote, started by an administrator. Returns the delivery id, or `null` when e-mail is not configured. */
  notifyCustomer(kind: 'inquiry_status' | 'quote_status', relatedId: string, note: string | null): string | null {
    if (!this.enabled) return null
    const { db } = this.deps
    const row = kind === 'inquiry_status' ? getInquiry(db, relatedId) : getQuote(db, relatedId)
    if (!row) return null
    return this.enqueue({ kind, relatedType: kind === 'inquiry_status' ? 'inquiry' : 'quote_request', relatedId, recipient: row.email, language: row.language, note })
  }

  private kick(): void {
    if (!this.deps.mailer) return
    setImmediate(() => {
      void this.processDue().catch((error) => this.deps.log.error('outbox run failed', { error }))
    })
  }

  start(intervalMs = 30_000): void {
    if (this.timer || !this.deps.mailer) return
    this.timer = setInterval(() => void this.processDue().catch((error) => this.deps.log.error('outbox run failed', { error })), intervalMs)
    this.timer.unref()
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    await this.running?.catch(() => undefined)
  }

  /** Sends what is due. Runs one at a time; a call made while one is running waits for it. */
  async processDue(): Promise<{ accepted: number; failed: number; retried: number }> {
    if (this.running) {
      await this.running.catch(() => undefined)
    }
    const run = this.runOnce()
    this.running = run
    try {
      return await run
    } finally {
      if (this.running === run) this.running = null
    }
  }

  private async runOnce(): Promise<{ accepted: number; failed: number; retried: number }> {
    const { db, clock, log } = this.deps
    const totals = { accepted: 0, failed: 0, retried: 0 }
    if (!this.deps.mailer) return totals
    const now = clock.now()
    // A row left `sending` by a process that died is picked up again.
    db.run("UPDATE email_deliveries SET status = 'pending', updated_at = ? WHERE status = 'sending' AND updated_at < ?", [iso(now), iso(addMs(now, -STUCK_AFTER_MS))])
    const due = db.all<DeliveryRow>("SELECT * FROM email_deliveries WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at LIMIT 25", [iso(now)])
    for (const row of due) {
      const claimed = db.run("UPDATE email_deliveries SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'", [iso(clock.now()), row.id])
      if (claimed.changes === 0) continue
      const outcome = await this.deliver({ ...row, attempts: row.attempts + 1 })
      totals[outcome] += 1
      log.info('e-mail attempt', { delivery: row.id, kind: row.kind, attempt: row.attempts + 1, outcome })
    }
    return totals
  }

  private render(row: DeliveryRow): Rendered | null {
    const { db, config } = this.deps
    const brand = config.email.brandName
    if (row.kind === 'inquiry_received' || row.kind === 'inquiry_status') {
      const inquiry = getInquiry(db, row.related_id)
      if (!inquiry) return null
      return row.kind === 'inquiry_received' ? renderInquiryReceived(inquiry, row.language, brand) : renderStatusChange('inquiry', inquiry, row.note, row.language, brand)
    }
    const quote = getQuote(db, row.related_id)
    if (!quote) return null
    if (row.kind === 'quote_status') return renderStatusChange('quote', quote, row.note, row.language, brand)
    const items = quoteItems(db, quote.id)
    const catalog = loadCatalog(db, { includeDisabled: true })
    const packageName = (code: string) => {
      const pack = catalog.packages.find((candidate) => candidate.code === code)
      return pack?.translations[row.language]?.name ?? pack?.translations.hu?.name ?? code
    }
    return renderQuoteReceived(quote, items, totalsOf(items.map((item) => item.snapshot)), row.language, brand, packageName)
  }

  private async deliver(row: DeliveryRow): Promise<'accepted' | 'failed' | 'retried'> {
    const { db, clock, config } = this.deps
    const mailer = this.deps.mailer!
    const finish = (status: DeliveryRow['status'], fields: { error?: string | null; messageId?: string | null; next?: string | null }) => {
      const now = iso(clock.now())
      db.run('UPDATE email_deliveries SET status = ?, last_error = ?, provider_message_id = ?, next_attempt_at = ?, accepted_at = ?, updated_at = ? WHERE id = ?', [
        status,
        fields.error ?? null,
        fields.messageId ?? null,
        fields.next ?? null,
        status === 'accepted' ? now : null,
        now,
        row.id,
      ])
    }
    try {
      const rendered = this.render(row)
      if (!rendered) {
        finish('cancelled', { error: 'The record this message was about no longer exists.' })
        return 'failed'
      }
      const from = config.email.from!
      const domain = from.replace(/^.*@/, '').replace(/[^A-Za-z0-9.-]/g, '') || 'localhost'
      // The owner's notification can be answered directly (Reply-To is the visitor); a customer's goes back to the owner.
      const toOwner = row.kind === 'inquiry_received' || row.kind === 'quote_received'
      const replyTo = toOwner ? (row.kind === 'inquiry_received' ? getInquiry(db, row.related_id)?.email : getQuote(db, row.related_id)?.email) : config.email.notifyTo
      const message: MailMessage = { from, to: row.recipient, replyTo: replyTo ?? null, subject: rendered.subject, text: rendered.text, html: rendered.html, messageId: `${row.id}@${domain}`, date: clock.now() }
      const result = await mailer.send(message)
      finish('accepted', { messageId: result.providerMessageId })
      return 'accepted'
    } catch (error) {
      // A message that cannot be built (a line break in an address) will not become buildable by waiting.
      const transient = error instanceof MailError ? error.transient : !(error instanceof MimeError)
      const text = redactText(error instanceof Error ? error.message : String(error))
      if (!transient || row.attempts >= config.email.maxAttempts) {
        finish('failed', { error: text })
        return 'failed'
      }
      const pause = BACKOFF_MINUTES[Math.min(row.attempts - 1, BACKOFF_MINUTES.length - 1)]
      finish('pending', { error: text, next: iso(addMs(clock.now(), pause * MINUTE)) })
      return 'retried'
    }
  }

  /** Counts for the System page. */
  summary(): { enabled: boolean; provider: string; pending: number; failed: number; accepted: number; lastFailure: { at: string; error: string } | null } {
    const { db, config } = this.deps
    const count = (status: string) => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM email_deliveries WHERE status = ?', [status])?.n ?? 0
    const last = db.get<{ updated_at: string; last_error: string }>("SELECT updated_at, last_error FROM email_deliveries WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 1")
    return {
      enabled: this.enabled,
      provider: config.email.provider,
      pending: count('pending') + count('sending'),
      failed: count('failed'),
      accepted: count('accepted'),
      lastFailure: last ? { at: last.updated_at, error: last.last_error } : null,
    }
  }
}
