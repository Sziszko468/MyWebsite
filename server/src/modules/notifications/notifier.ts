import type { Config } from '../../config.ts'
import type { Database } from '../../db/database.ts'
import { newId } from '../../lib/crypto.ts'
import { ConstraintError } from '../../http/errors.ts'
import { redactText, type Logger } from '../../lib/logger.ts'
import { addMs, iso, MINUTE, type Clock } from '../../lib/time.ts'
import { loadCatalog } from '../catalog/repository.ts'
import { getInquiry } from '../inquiries/repository.ts'
import { getQuotation, linesOf, type QuotationRow } from '../quotes/quotations.ts'
import { getQuote, quoteItems, type QuoteRow } from '../quotes/repository.ts'
import { mintViewToken } from '../quotes/tokens.ts'
import { buildQuoteView, priceSummary } from '../quotes/view.ts'
import { notificationPreferences } from '../system/settings.ts'
import { totalsOf } from '../shop/pricing.ts'
import { MailError } from './smtp.ts'
import type { Mailer } from './mailer.ts'
import { MimeError, type MailMessage } from './mime.ts'
import { quoteWords, renderQuoteAccepted, renderQuoteAcceptedAdmin, renderQuoteDeclined, renderQuoteDeclinedAdmin, renderQuoteSent, renderRequestConfirmation, renderRequestNotification, renderRevisionRequested, type QuoteMail } from './quoteTemplates.ts'
import { renderInquiryConfirmation, renderInquiryReceived, renderStatusChange, renderTestEmail, type EmailKind, type Rendered } from './templates.ts'

/**
 * The outbox. A notification is a row in `email_deliveries` first and an e-mail second: the visitor's request is
 * stored and answered, then the message is rendered from the stored record and handed to the provider in the
 * background. A failure that may pass (a busy server, a dropped connection) is tried again after a growing pause,
 * a permanent one (the server refused the address) is not; every attempt is counted and its error is kept, with
 * addresses masked. The row ends `accepted` (the provider took the message: "sent"), `failed` or `cancelled` (the
 * record it was about has been deleted); later a verified provider event (webhook.ts) may make it `delivered`,
 * `bounced` or `complained`, and nothing else ever does. The storing of a request and the sending of its e-mails are
 * separate: a failure here never reaches the visitor, and the message stays in the database for an administrator to
 * send again. With no provider configured (or sending paused) nothing is queued.
 *
 * Three kinds of message leave here: the owner's notification of what arrived (to `NOTIFY_TO`, always when switched on),
 * the confirmation to the person who wrote (only when an administrator switched it on, once per submission, at most
 * a few per address a day), and what an administrator starts (a status e-mail, a test).
 */

/** Pauses before the 2nd, 3rd, 4th… attempt. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 720]
const STUCK_AFTER_MS = 10 * MINUTE
/**
 * How many confirmations one address may receive in a day. A confirmation goes to an address a stranger typed, so
 * anyone could try to make the site write to someone else; the per-client limits of the forms already hold that
 * back, and this holds it back per recipient too.
 */
export const CONFIRMATIONS_PER_ADDRESS_PER_DAY = 3
const DAY_MS = 24 * 60 * MINUTE

export interface NotifierDeps {
  db: Database
  config: Config
  clock: Clock
  log: Logger
  mailer: Mailer | null
}

export type DeliveryStatus = 'pending' | 'sending' | 'accepted' | 'delivered' | 'bounced' | 'complained' | 'failed' | 'cancelled'

export interface DeliveryRow {
  id: string
  kind: EmailKind
  related_type: 'inquiry' | 'quote_request' | 'system' | 'quote' | 'quote_revision'
  related_id: string
  recipient: string
  language: 'hu' | 'en' | 'nl'
  note: string | null
  status: DeliveryStatus
  attempts: number
  send_generation: number
  next_attempt_at: string | null
  last_error: string | null
  error_code: string | null
  provider_message_id: string | null
  /** The sender that handled the last attempt. */
  provider: string | null
  provider_event: string | null
  created_at: string
  updated_at: string
  accepted_at: string | null
  delivered_at: string | null
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

  /** Whether sending is paused on purpose (`EMAIL_ENABLED=false`) while a provider is configured. */
  get paused(): boolean {
    return !this.deps.config.email.enabled && this.deps.config.email.provider !== 'none'
  }

  /** Puts a message in the outbox. Public so the quotation workflow can queue its mails inside the same transaction as the state change they announce. */
  enqueue(input: { kind: EmailKind; relatedType: DeliveryRow['related_type']; relatedId: string; recipient: string; language: DeliveryRow['language']; note?: string | null }): string {
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
    // The owner can switch either notification off in the administration (Notifications); what is already queued is still sent.
    const wanted = notificationPreferences(this.deps.db)
    if (kind === 'inquiry_received' ? !wanted.newInquiry : !wanted.newQuote) {
      log.debug('owner notification skipped: switched off in the administration', { kind })
      return
    }
    try {
      this.enqueue({ kind, relatedType: kind === 'inquiry_received' ? 'inquiry' : 'quote_request', relatedId, recipient: config.email.notifyTo, language: config.email.notifyLanguage })
    } catch (error) {
      // The visitor's request is already stored; a failure to queue its notification must not turn into an error for them.
      log.error('could not queue the owner notification', { kind, error })
    }
  }

  /**
   * The confirmation to the person who wrote, when an administrator switched confirmations on. One per submission (the
   * database refuses a second), at most a few per address a day, and never when nothing is configured to send it. Like the
   * owner's notification it is queued after the request is stored, and its failure is nobody's error but the log's.
   */
  confirmSubmitter(kind: 'inquiry' | 'quote', relatedId: string): boolean {
    const { db, log, clock } = this.deps
    if (!this.enabled) return false
    const wanted = notificationPreferences(db)
    if (kind === 'inquiry' ? !wanted.confirmInquiry : !wanted.confirmQuote) return false
    const row = kind === 'inquiry' ? getInquiry(db, relatedId) : getQuote(db, relatedId)
    if (!row) return false
    const since = iso(addMs(clock.now(), -DAY_MS))
    const recent = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM email_deliveries WHERE recipient = ? COLLATE NOCASE AND kind IN ('inquiry_confirmation', 'quote_confirmation') AND created_at >= ?", [row.email, since])?.n ?? 0
    if (recent >= CONFIRMATIONS_PER_ADDRESS_PER_DAY) {
      log.warn('confirmation skipped: this address has had its share today', { kind })
      return false
    }
    try {
      this.enqueue({ kind: kind === 'inquiry' ? 'inquiry_confirmation' : 'quote_confirmation', relatedType: kind === 'inquiry' ? 'inquiry' : 'quote_request', relatedId, recipient: row.email, language: row.language })
      return true
    } catch (error) {
      // A second confirmation for the same submission is refused by the database: that is the point, not a failure.
      if (error instanceof ConstraintError && error.kind === 'unique') {
        log.debug('confirmation skipped: already queued', { kind })
        return true
      }
      log.error('could not queue the confirmation', { kind, error })
      return false
    }
  }

  // ---- the quotation's mails (PROMPT 17) ----

  /** Where the customer's e-mail links point: the public site, in the customer's language. `null` when the operator has not said where the site is. */
  customerLink(language: DeliveryRow['language'], page: 'quote' | 'request', token: string): string | null {
    const base = this.deps.config.publicUrl
    return base ? `${base}/${language}/${page}/${token}` : null
  }

  /** The request in the administration. */
  adminLink(requestId: string): string | null {
    const base = this.deps.config.publicUrl
    return base ? `${base}/admin/quotes/${requestId}` : null
  }

  /** Whether a quotation can be sent at all: a provider and a sender, and the site's address for the link. */
  get canSendQuotations(): boolean {
    return this.enabled && this.deps.config.publicUrl !== null
  }

  /** The quotation, to the customer. Called inside the transaction that marks it sent, so a sent quotation always has its e-mail in the outbox. */
  queueQuotation(quote: QuotationRow, request: QuoteRow, revised: boolean, note: string | null): string {
    return this.enqueue({ kind: revised ? 'quote_revised' : 'quote_sent', relatedType: 'quote', relatedId: quote.id, recipient: request.email, language: quote.language, note })
  }

  /** The acceptance or the decline, to both sides: one message each, exactly once (the database refuses a second). */
  queueDecision(quote: QuotationRow, request: QuoteRow, decision: 'accepted' | 'declined'): void {
    const { config, log } = this.deps
    const attempt = (input: Parameters<Notifier['enqueue']>[0]) => {
      try {
        this.enqueue(input)
      } catch (error) {
        if (!(error instanceof ConstraintError && error.kind === 'unique')) log.error('could not queue a decision e-mail', { kind: input.kind, error })
      }
    }
    if (this.enabled) attempt({ kind: decision === 'accepted' ? 'quote_accepted' : 'quote_declined', relatedType: 'quote', relatedId: quote.id, recipient: request.email, language: quote.language })
    if (this.enabled && config.email.notifyTo) attempt({ kind: decision === 'accepted' ? 'quote_accepted_admin' : 'quote_declined_admin', relatedType: 'quote', relatedId: quote.id, recipient: config.email.notifyTo, language: config.email.notifyLanguage })
  }

  /** The customer's request for clarification or a change, to the owner. */
  queueRevisionNotice(revisionId: string): void {
    const { config, log } = this.deps
    if (!this.enabled || !config.email.notifyTo) return
    try {
      this.enqueue({ kind: 'revision_requested_admin', relatedType: 'quote_revision', relatedId: revisionId, recipient: config.email.notifyTo, language: config.email.notifyLanguage })
    } catch (error) {
      if (!(error instanceof ConstraintError && error.kind === 'unique')) log.error('could not queue the revision notice', { error })
    }
  }

  /**
   * An administrator sends a message again: a failed one is retried, one the provider accepted is sent once more (a new send generation, so the
   * provider treats it as a new message). The same row is reused, so no second row is made and the once-only rules hold. False when it is
   * still waiting to go out.
   */
  resend(id: string): boolean {
    const { db, clock } = this.deps
    const now = iso(clock.now())
    const changed = db.run("UPDATE email_deliveries SET status = 'pending', attempts = 0, send_generation = send_generation + 1, next_attempt_at = ?, last_error = NULL, error_code = NULL, updated_at = ? WHERE id = ? AND status IN ('failed', 'accepted', 'delivered', 'bounced', 'complained', 'cancelled')", [now, now, id]).changes
    if (changed > 0) this.kick()
    return changed > 0
  }

  /** A test message to the owner's address, started by an administrator. Returns the delivery id, or `null` when nothing can be sent. */
  sendTest(): string | null {
    const { config } = this.deps
    if (!this.enabled || !config.email.notifyTo) return null
    return this.enqueue({ kind: 'test', relatedType: 'system', relatedId: 'test', recipient: config.email.notifyTo, language: config.email.notifyLanguage })
  }

  /** A status change e-mail to the person who wrote, started by an administrator. Returns the delivery id, or `null` when e-mail is not configured. */
  notifyCustomer(kind: 'inquiry_status' | 'quote_status', relatedId: string, note: string | null): string | null {
    if (!this.enabled) return null
    const { db } = this.deps
    const row = kind === 'inquiry_status' ? getInquiry(db, relatedId) : getQuote(db, relatedId)
    if (!row) return null
    return this.enqueue({ kind, relatedType: kind === 'inquiry_status' ? 'inquiry' : 'quote_request', relatedId, recipient: row.email, language: row.language, note })
  }

  /** Puts a failed message back in the queue for another round of attempts, and sends it at once. False when it is not a failed one. */
  retry(id: string): boolean {
    const { db, clock } = this.deps
    const now = iso(clock.now())
    // A new generation changes the idempotency key: the provider must treat this as a new attempt, not as the answer to the last one.
    const changed = db.run("UPDATE email_deliveries SET status = 'pending', attempts = 0, send_generation = send_generation + 1, next_attempt_at = ?, last_error = NULL, error_code = NULL, updated_at = ? WHERE id = ? AND status = 'failed'", [now, now, id]).changes
    if (changed > 0) this.kick()
    return changed > 0
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
    const { db, config, clock } = this.deps
    const brand = config.email.brandName
    if (row.kind === 'test') return renderTestEmail(row.language, brand, this.deps.mailer?.name ?? config.email.provider, clock.now())
    // What an administrator wrote for the confirmations, in the language of the e-mail; nothing when they wrote nothing.
    const note = notificationPreferences(db).responseNote[row.language].trim() || null
    if (row.kind === 'inquiry_received' || row.kind === 'inquiry_status' || row.kind === 'inquiry_confirmation') {
      const inquiry = getInquiry(db, row.related_id)
      if (!inquiry) return null
      if (row.kind === 'inquiry_confirmation') return renderInquiryConfirmation(inquiry, row.language, brand, note)
      return row.kind === 'inquiry_received' ? renderInquiryReceived(inquiry, row.language, brand) : renderStatusChange('inquiry', inquiry, row.note, row.language, brand)
    }
    if (row.related_type === 'quote' || row.related_type === 'quote_revision') return this.renderQuotation(row)

    const request = getQuote(db, row.related_id)
    if (!request) return null
    // A link to the customer's own status page. Minted now, for this message: a message written again carries a fresh one.
    const statusUrl = (): string | null => {
      if (!config.publicUrl) return null
      return this.customerLink(row.language, 'request', mintViewToken(this.deps, { requestId: request.id, quoteId: null }).token)
    }
    if (row.kind === 'quote_status') {
      const words = quoteWords(row.language)
      const url = statusUrl()
      return renderStatusChange('quote', request, row.note, row.language, brand, url ? { label: words.openStatus, url, fallback: words.fallback } : null)
    }
    const items = quoteItems(db, request.id)
    const catalog = loadCatalog(db, { includeDisabled: true })
    const packageName = (code: string) => {
      const pack = catalog.packages.find((candidate) => candidate.code === code)
      return pack?.translations[row.language]?.name ?? pack?.translations.hu?.name ?? code
    }
    const data = { request, items, totals: totalsOf(items.map((item) => item.snapshot)), packageName }
    if (row.kind === 'quote_confirmation') return renderRequestConfirmation(data, row.language, brand, statusUrl(), note)
    return renderRequestNotification(data, row.language, brand, this.adminLink(request.id))
  }

  /** The mails about a quotation (or a revision request): the offer's own language, and a fresh secure link for the customer's. */
  private renderQuotation(row: DeliveryRow): Rendered | null {
    const { db, config, clock } = this.deps
    const brand = config.email.brandName
    let revision: { message: string; created_at: string; quote_id: string } | undefined
    if (row.related_type === 'quote_revision') {
      revision = db.get<{ message: string; created_at: string; quote_id: string }>('SELECT message, created_at, quote_id FROM quote_revision_requests WHERE id = ?', [row.related_id])
      if (!revision) return null
    }
    const quote = getQuotation(db, revision ? revision.quote_id : row.related_id)
    if (!quote) return null
    const request = getQuote(db, quote.quote_request_id)
    if (!request) return null
    const words = quoteWords(row.language)
    const view = buildQuoteView(quote, linesOf(db, quote.id), request, clock.now())
    const mail: QuoteMail = {
      reference: quote.reference,
      requestReference: request.reference,
      version: quote.version,
      title: quote.title,
      language: quote.language,
      customerName: request.name,
      priceText: priceSummary(view, words.priceInQuote),
      validUntil: quote.valid_until,
      timeline: quote.estimated_timeline,
    }
    const adminUrl = this.adminLink(request.id)
    // A new token for each message that carries a link, so what was sent can be traced to nothing but its own link.
    const quoteUrl = (): string | null => (config.publicUrl ? this.customerLink(row.language, 'quote', mintViewToken(this.deps, { requestId: request.id, quoteId: quote.id }).token) : null)
    switch (row.kind) {
      case 'quote_sent':
      case 'quote_revised': {
        const url = quoteUrl()
        // A quotation the customer cannot open is not a quotation: refuse to write the message rather than send one with nothing to open.
        if (!url) throw new MailError('The site address (PUBLIC_URL) is not set, so the quotation link cannot be built.', { transient: false, reason: 'rejected' })
        return renderQuoteSent(mail, row.language, brand, url, row.kind === 'quote_revised', row.note)
      }
      case 'quote_accepted':
        return renderQuoteAccepted(mail, quote.accepted_at ?? iso(clock.now()), row.language, brand, quoteUrl())
      case 'quote_accepted_admin':
        return renderQuoteAcceptedAdmin(mail, quote.accepted_at ?? iso(clock.now()), row.language, brand, adminUrl)
      case 'quote_declined':
        return renderQuoteDeclined(mail, quote.declined_at ?? iso(clock.now()), row.language, brand)
      case 'quote_declined_admin':
        return renderQuoteDeclinedAdmin(mail, quote.declined_at ?? iso(clock.now()), quote.decline_reason, row.language, brand, adminUrl)
      case 'revision_requested_admin':
        return revision ? renderRevisionRequested(mail, revision.message, revision.created_at, row.language, brand, adminUrl) : null
      default:
        return null
    }
  }

  /** The address of the person a message to the owner is about, so the owner can answer them straight from the mail program. */
  private customerAddress(row: DeliveryRow): string | null {
    const { db } = this.deps
    if (row.kind === 'inquiry_received') return getInquiry(db, row.related_id)?.email ?? null
    if (row.related_type === 'quote_request') return getQuote(db, row.related_id)?.email ?? null
    const quoteId = row.related_type === 'quote_revision' ? db.get<{ quote_id: string }>('SELECT quote_id FROM quote_revision_requests WHERE id = ?', [row.related_id])?.quote_id : row.related_id
    const quote = quoteId ? getQuotation(db, quoteId) : undefined
    return quote ? (getQuote(db, quote.quote_request_id)?.email ?? null) : null
  }

  private async deliver(row: DeliveryRow): Promise<'accepted' | 'failed' | 'retried'> {
    const { db, clock, config } = this.deps
    const mailer = this.deps.mailer!
    const finish = (status: DeliveryRow['status'], fields: { error?: string | null; code?: string | null; messageId?: string | null; next?: string | null }) => {
      const now = iso(clock.now())
      if (status === 'accepted') {
        // The provider's event can beat the answer to our request. If it already moved the message on (delivered, bounced), that
        // stands: only what we alone know (the provider's id, when it took the message) is added, never a step back.
        db.run(
          `UPDATE email_deliveries SET status = CASE WHEN status = 'sending' THEN 'accepted' ELSE status END, last_error = NULL, error_code = NULL,
             provider_message_id = COALESCE(provider_message_id, ?), provider = ?, next_attempt_at = NULL, accepted_at = COALESCE(accepted_at, ?), updated_at = ? WHERE id = ?`,
          [fields.messageId ?? null, mailer.name, now, now, row.id],
        )
        return
      }
      db.run('UPDATE email_deliveries SET status = ?, last_error = ?, error_code = ?, provider = ?, next_attempt_at = ?, updated_at = ? WHERE id = ?', [status, fields.error ?? null, fields.code ?? null, mailer.name, fields.next ?? null, now, row.id])
    }
    try {
      const rendered = this.render(row)
      if (!rendered) {
        finish('cancelled', { error: 'The record this message was about no longer exists.' })
        return 'failed'
      }
      const from = config.email.from!
      const domain = from.replace(/^.*@/, '').replace(/[^A-Za-z0-9.-]/g, '') || 'localhost'
      // The owner's notification can be answered directly (Reply-To is the visitor, never the sender: the sender is the verified
      // address). A customer's goes back to the PUBLIC contact address, never to the owner's private inbox (`NOTIFY_TO`).
      const toOwner = row.kind === 'inquiry_received' || row.kind === 'quote_received' || row.kind === 'quote_accepted_admin' || row.kind === 'quote_declined_admin' || row.kind === 'revision_requested_admin'
      const customerReply = config.email.replyTo ?? from
      const replyTo = row.kind === 'test' ? null : toOwner ? this.customerAddress(row) : customerReply
      const message: MailMessage = {
        from,
        to: row.recipient,
        replyTo: replyTo ?? null,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        messageId: `${row.id}@${domain}`,
        date: clock.now(),
        // Same message, same key: a repeated request (after a timeout) cannot send it twice. A manual retry is a new generation.
        idempotencyKey: `${row.id}-${row.send_generation}`,
        tags: { delivery: row.id, kind: row.kind },
      }
      const result = await mailer.send(message)
      finish('accepted', { messageId: result.providerMessageId })
      return 'accepted'
    } catch (error) {
      // A message that cannot be built (a line break in an address) will not become buildable by waiting.
      const transient = error instanceof MailError ? error.transient : !(error instanceof MimeError)
      const text = redactText(error instanceof Error ? error.message : String(error))
      const code = error instanceof MailError ? error.reason : error instanceof MimeError ? 'rejected' : 'unavailable'
      if (!transient || row.attempts >= config.email.maxAttempts) {
        finish('failed', { error: text, code })
        return 'failed'
      }
      const pause = BACKOFF_MINUTES[Math.min(row.attempts - 1, BACKOFF_MINUTES.length - 1)]
      finish('pending', { error: text, code, next: iso(addMs(clock.now(), pause * MINUTE)) })
      return 'retried'
    }
  }

  /** Counts for the System page. */
  summary(): { enabled: boolean; paused: boolean; provider: string; pending: number; failed: number; accepted: number; delivered: number; bounced: number; lastFailure: { at: string; error: string } | null } {
    const { db, config } = this.deps
    const count = (status: string) => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM email_deliveries WHERE status = ?', [status])?.n ?? 0
    const last = db.get<{ updated_at: string; last_error: string }>("SELECT updated_at, last_error FROM email_deliveries WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 1")
    return {
      enabled: this.enabled,
      paused: this.paused,
      provider: config.email.provider,
      pending: count('pending') + count('sending'),
      failed: count('failed'),
      accepted: count('accepted'),
      delivered: count('delivered'),
      bounced: count('bounced') + count('complained'),
      lastFailure: last ? { at: last.updated_at, error: last.last_error } : null,
    }
  }
}
