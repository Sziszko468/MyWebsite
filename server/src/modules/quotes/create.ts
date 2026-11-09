import type { Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { ConstraintError } from '../../http/errors.ts'
import { newId } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import { recordEvent, type Actor } from './events.ts'
import { nextReference } from './references.ts'
import { insertQuote, type NewItem, type QuoteKind, type QuoteRow } from './repository.ts'
import type { Priority, RequestSource, RequestType } from './status.ts'
import { mintViewToken } from './tokens.ts'

/**
 * The one place a quote request is stored. The shop's builder, the FULL EXPERIENCE configurator, CONTROL ROOM AI, an administrator
 * turning a message into a request and an administrator typing one in all call it, so every request gets the same public reference, the same
 * first line in the history, the same status page for the customer and the same e-mails. What differs is only `requestType` and `source`.
 */

export interface NewRequest {
  language: Language
  kind: QuoteKind
  requestType: RequestType
  source: RequestSource
  name: string
  email: string
  phone: string | null
  company: string | null
  website: string | null
  description: string
  objective: string | null
  referenceNotes: string | null
  timing: string | null
  requirements: string | null
  budgetRange: string | null
  briefJson: string | null
  consent: boolean
  marketingConsent: boolean
  ipHash: string | null
  contentHash: string
  items: readonly NewItem[]
  priority?: Priority
  inquiryId?: string | null
  actor: Actor
}

export interface CreatedRequest {
  row: QuoteRow
  /** The secret part of the customer's status link. Handed to the person who just submitted, and put in their e-mail; stored only as a hash. */
  statusToken: string
}

/** Stores the request, its first history line and its status page in one transaction. Throws if a reference could not be allocated. */
export function createQuoteRequest(app: AppContext, input: NewRequest, extra?: (row: QuoteRow) => void): CreatedRequest {
  const now = app.clock.now()
  let created: CreatedRequest | null = null
  app.db.transaction(() => {
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const row: QuoteRow = {
        id: newId(),
        reference: nextReference(app.db, app.config.quoteReferenceFormat, now),
        language: input.language,
        kind: input.kind,
        request_type: input.requestType,
        source: input.source,
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: input.company,
        website: input.website,
        description: input.description,
        objective: input.objective,
        reference_notes: input.referenceNotes,
        timing: input.timing,
        requirements: input.requirements,
        budget_range: input.budgetRange,
        brief_json: input.briefJson,
        status: 'new',
        customer_status: 'new',
        priority: input.priority ?? 'normal',
        inquiry_id: input.inquiryId ?? null,
        archived_at: null,
        consent_at: input.consent ? iso(now) : null,
        marketing_consent_at: input.marketingConsent ? iso(now) : null,
        ip_hash: input.ipHash,
        content_hash: input.contentHash,
        created_at: iso(now),
        updated_at: iso(now),
      }
      try {
        // A savepoint, so a reference collision (which the counter should make impossible) undoes only this attempt.
        app.db.transaction(() => insertQuote(app.db, row, input.items))
      } catch (error) {
        if (error instanceof ConstraintError && error.kind === 'unique') continue
        throw error
      }
      recordEvent(app, { requestId: row.id, reference: row.reference, type: 'request_created', actor: input.actor, to: 'new', summary: `${input.source}/${input.requestType}` })
      app.db.run("INSERT INTO customer_updates (quote_request_id, kind, status, body, author_id, created_at) VALUES (?, 'status', 'new', '', NULL, ?)", [row.id, iso(now)])
      const link = mintViewToken(app, { requestId: row.id, quoteId: null })
      extra?.(row)
      created = { row, statusToken: link.token }
    }
  })
  if (!created) throw new Error('Could not allocate a unique quote reference.')
  return created
}

/**
 * What happens after the request is safely stored: the owner is told and the customer gets a confirmation, both through the outbox,
 * and neither can fail the submission. Returns whether a confirmation to the customer is on its way, so the answer to the visitor can say
 * honestly that their request is saved but no e-mail will follow.
 */
export function afterRequestStored(app: AppContext, row: QuoteRow): { confirmationEmail: 'queued' | 'not_sent' } {
  app.notifier.notifyOwner('quote_received', row.id)
  return { confirmationEmail: app.notifier.confirmSubmitter('quote', row.id) ? 'queued' : 'not_sent' }
}

/** Whether a confirmation e-mail was queued for this request (for the answer to a visitor whose request was recognised as one already sent). */
export const confirmationStatus = (app: AppContext, requestId: string): 'queued' | 'not_sent' =>
  app.db.get("SELECT 1 AS x FROM email_deliveries WHERE related_type = 'quote_request' AND related_id = ? AND kind = 'quote_confirmation' AND status <> 'cancelled'", [requestId]) ? 'queued' : 'not_sent'
