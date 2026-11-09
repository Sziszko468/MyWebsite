import type { Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { HttpError, validationFailed } from '../../http/errors.ts'
import { addMs, iso } from '../../lib/time.ts'
import { Fields, isEmail } from '../../lib/validate.ts'
import { contentHashOf, DUPLICATE_WINDOW_MS } from '../contact/service.ts'
import { afterRequestStored, createQuoteRequest } from '../quotes/create.ts'
import { findRecentQuoteDuplicate } from '../quotes/repository.ts'
import { FE_LIMITS } from '../shop/fullExperience.ts'
import { isReady, planBrief, planDescription, planHash, readStoredPlan, type ProjectPlan } from './plan.ts'
import { APPROVAL_TTL_MS, consumeApproval, insertApproval, liveApproval, markQuoteSent, type ConversationRow } from './store.ts'
import type { AiSettings } from '../../config.ts'

/**
 * From an approved plan to a quote request. Two steps, both server-side, neither of them the model's:
 *
 *   1. The visitor reads the plan in the interface and presses "Send this request" with their name, e-mail address and (if the
 *      site asks for it) the privacy acknowledgement. `approve()` records that against the plan AS IT IS NOW (its version and a
 *      hash of its content). That click is the only thing that can create an approval.
 *   2. The assistant's tool `submitApprovedQuoteRequest` calls `submit()`, which refuses unless a live, unused approval exists
 *      for this conversation, the plan has not changed since, and the contact details it is called with are the approved ones.
 *      The request that is stored is built from the stored plan, so whatever the model says is not what is sent.
 *
 * The request goes into the same table, notifications and administration list as every other quote request (`source` says it
 * was written by the assistant). Nothing is e-mailed by the assistant itself: the notifier does what it does for any request.
 */

export interface ApprovalInput {
  name: string
  email: string
  company: string | null
  consent: boolean
}

export function parseApproval(body: Record<string, unknown>, requireConsent: boolean): ApprovalInput & { planVersion: number } {
  const fields = new Fields(body)
  const name = fields.text('name', { ...FE_LIMITS.name, required: true })
  const email = fields.text('email', { max: FE_LIMITS.email.max, required: true }, (value) => (isEmail(value) ? undefined : 'invalidEmail'))
  const company = fields.text('company', { max: FE_LIMITS.company.max })
  const consent = fields.consent('consent', requireConsent)
  const version = body.planVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) fields.fail('planVersion', 'invalid')
  fields.done()
  return { name: name!, email: email!, company: company || null, consent, planVersion: version as number }
}

/** Records the visitor's approval of the plan they are looking at. */
export function approve(app: AppContext, settings: AiSettings, conversation: ConversationRow, input: ReturnType<typeof parseApproval>): { approvedAt: string; expiresAt: string } {
  if (!settings.quoteEnabled) throw new HttpError(503, 'service_unavailable', 'Sending a request through the assistant is not available at the moment.')
  const plan = readStoredPlan(conversation.plan_json)
  if (!plan || !isReady(plan)) throw validationFailed({ plan: 'required' }, 'There is no complete plan to send yet.')
  if (conversation.quote_reference) throw new HttpError(409, 'conflict', 'This plan has already been sent.')
  if (input.planVersion !== conversation.plan_version) throw new HttpError(409, 'conflict', 'The plan changed. Review it again before approving.')
  const row = insertApproval(app.db, app.clock, { conversationId: conversation.id, planVersion: conversation.plan_version, planHash: planHash(plan), name: input.name, email: input.email, company: input.company, consent: input.consent })
  return { approvedAt: row.created_at, expiresAt: row.expires_at }
}

export type SubmitFailure = 'quote_disabled' | 'approval_required' | 'approval_expired' | 'plan_changed' | 'already_sent' | 'plan_incomplete'

export type SubmitResult = { ok: true; reference: string; duplicate: boolean } | { ok: false; error: SubmitFailure }

/**
 * What the tool does. It never throws for a refusal: the model is told why, in a code, and the visitor is told by the model. The
 * model passes nothing: the approval is bound to the plan's content, and the contact details are the visitor's, entered in the
 * panel and held in the approval, so they never pass through the model.
 */
export function submit(app: AppContext, settings: AiSettings, conversation: ConversationRow, language: Language, ipHash: string): SubmitResult {
  if (!settings.quoteEnabled) return { ok: false, error: 'quote_disabled' }
  if (conversation.quote_reference) return { ok: false, error: 'already_sent' }
  const plan: ProjectPlan | null = readStoredPlan(conversation.plan_json)
  if (!plan || !isReady(plan)) return { ok: false, error: 'plan_incomplete' }
  const approval = liveApproval(app.db, app.clock, conversation.id)
  if (!approval) {
    // Distinguish "never approved" from "approved a while ago" for the sake of the words the visitor hears.
    const old = app.db.get<{ id: string }>('SELECT id FROM ai_approvals WHERE conversation_id = ? AND consumed_at IS NULL AND expires_at <= ? LIMIT 1', [conversation.id, iso(app.clock.now())])
    return { ok: false, error: old ? 'approval_expired' : 'approval_required' }
  }
  if (approval.plan_version !== conversation.plan_version || approval.plan_hash !== planHash(plan)) return { ok: false, error: 'plan_changed' }
  if (!approval.name || !approval.email) return { ok: false, error: 'approval_required' }

  const now = app.clock.now()
  const description = planDescription(plan, language)
  const brief = planBrief(plan, language)
  const hash = contentHashOf(app.config.appSecret, 'ai_assistant', approval.email, description)
  const existing = findRecentQuoteDuplicate(app.db, hash, iso(addMs(now, -DUPLICATE_WINDOW_MS)))
  if (existing) {
    consumeApproval(app.db, app.clock, approval.id, existing.reference)
    markQuoteSent(app.db, conversation.id, existing.reference)
    return { ok: true, reference: existing.reference, duplicate: true }
  }

  // The same store, reference, history, status page and e-mails as every other request; only the type and the source say it was the assistant's.
  const created = createQuoteRequest(
    app,
    {
      language,
      kind: 'full_experience',
      requestType: 'ai_project',
      source: 'control_room_ai',
      name: approval.name!,
      email: approval.email!,
      phone: null,
      company: approval.company,
      website: null,
      description,
      objective: null,
      referenceNotes: null,
      timing: null,
      requirements: null,
      budgetRange: null,
      briefJson: JSON.stringify(brief),
      consent: approval.consent_at !== null,
      marketingConsent: false,
      ipHash,
      contentHash: hash,
      items: [],
      actor: { type: 'assistant' },
    },
    (row) => {
      consumeApproval(app.db, app.clock, approval.id, row.reference)
      markQuoteSent(app.db, conversation.id, row.reference)
    },
  )
  afterRequestStored(app, created.row)
  return { ok: true, reference: created.row.reference, duplicate: false }
}

export { APPROVAL_TTL_MS }
