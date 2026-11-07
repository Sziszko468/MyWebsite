import type { AppContext } from '../../context.ts'
import { LANGUAGES, type Language } from '../../config.ts'
import { ConstraintError, HttpError, validationFailed, type FieldErrors } from '../../http/errors.ts'
import { newId, newReference } from '../../lib/crypto.ts'
import { countLinks, isRecord } from '../../lib/text.ts'
import { addMs, iso } from '../../lib/time.ts'
import { Fields, isEmail } from '../../lib/validate.ts'
import { contentHashOf, DUPLICATE_WINDOW_MS } from '../contact/service.ts'
import { findRecentQuoteDuplicate, insertQuote, type QuoteRow } from '../quotes/repository.ts'
import type { Brief, BriefQuestion } from './brief.ts'
import { publishedDocuments, type FullExperienceDoc } from './documents.ts'
import { totalsOf, type Totals } from './pricing.ts'

/**
 * A FULL EXPERIENCE request: the answers of the configurator on the flagship page. It goes into the same store as the
 * request builder's quotes (`quote_requests`, so it is in the same administration list, with the same statuses, notes and
 * e-mails), as `kind = 'full_experience'`, with no cart lines and a brief instead: each answer saved with the question and
 * the option labels in every language. The answers are checked against the **published** configurator, as it is now: a
 * question or an option that is not there is refused, a required question must be answered, a single choice has one answer.
 * Nothing in the request is a price, and none is ever invented: FULL EXPERIENCE is a custom quote.
 */

/** The same numbers as the website's configurator (src/shop/fullExperience/request.ts; contractWithServer compares them). */
export const FE_LIMITS = {
  description: { min: 20, max: 4000 },
  name: { min: 2, max: 100 },
  email: { max: 254 },
  company: { max: 100 },
} as const

export interface FullExperienceInput {
  language: Language
  preferredLanguage: Language
  /** Question id -> chosen option ids. */
  answers: Record<string, string[]>
  description: string
  name: string
  email: string
  company: string | null
  consent: boolean
}

export function parseFullExperienceRequest(body: Record<string, unknown>, requireConsent: boolean): FullExperienceInput {
  const fields = new Fields(body)
  if (body.form !== 'full_experience') fields.fail('form', 'invalid')
  if (body.version !== undefined && body.version !== 1) fields.fail('version', 'invalid')

  const language = fields.oneOf('language', LANGUAGES, { required: true })
  const preferred = fields.oneOf('preferredLanguage', LANGUAGES)
  const description = fields.text('description', { ...FE_LIMITS.description, required: true, multiline: true })
  const name = fields.text('name', { ...FE_LIMITS.name, required: true })
  const email = fields.text('email', { max: FE_LIMITS.email.max, required: true }, (value) => (isEmail(value) ? undefined : 'invalidEmail'))
  const company = fields.text('company', { max: FE_LIMITS.company.max })
  const consent = fields.consent('consent', requireConsent)

  const answers: Record<string, string[]> = {}
  if (body.answers !== undefined && !isRecord(body.answers)) fields.fail('answers', 'invalid')
  else if (isRecord(body.answers)) {
    for (const [question, value] of Object.entries(body.answers)) {
      if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(question)) {
        fields.fail('answers', 'invalid')
        continue
      }
      const chosen = typeof value === 'string' ? [value] : Array.isArray(value) ? value : null
      if (!chosen || chosen.some((id) => typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(id))) {
        fields.fail(`answers.${question}`, 'invalid')
        continue
      }
      if (chosen.length > 0) answers[question] = [...new Set(chosen as string[])]
    }
  }
  fields.done()

  if (typeof body.website === 'string' && body.website.trim() !== '') throw new HttpError(422, 'spam_suspected', 'The request was not accepted.')
  if (countLinks(description ?? '') > 5) throw new HttpError(422, 'spam_suspected', 'The request was not accepted.')

  return { language: language!, preferredLanguage: preferred ?? language!, answers, description: description!, name: name!, email: email!, company: company || null, consent }
}

/** Checks the answers against the published configurator and builds the brief that is stored. */
export function buildBrief(doc: FullExperienceDoc, input: Pick<FullExperienceInput, 'answers' | 'preferredLanguage'>): Brief {
  const errors: FieldErrors = {}
  for (const id of Object.keys(input.answers)) if (!doc.configurator.questions.some((question) => question.id === id)) errors[`answers.${id}`] = 'unknown'
  const questions: BriefQuestion[] = doc.configurator.questions.map((question) => {
    const chosen = input.answers[question.id] ?? []
    if (chosen.length === 0 && question.required) errors[`answers.${question.id}`] = 'required'
    if (question.kind === 'single' && chosen.length > 1) errors[`answers.${question.id}`] = 'tooMany'
    const answers = chosen.flatMap((optionId) => {
      const option = question.options.find((candidate) => candidate.id === optionId)
      if (!option) {
        errors[`answers.${question.id}`] = 'unknown'
        return []
      }
      return [{ id: option.id, label: option.label }]
    })
    return { id: question.id, kind: question.kind, title: question.title, answers }
  })
  if (Object.keys(errors).length > 0) throw validationFailed(errors, 'Something in the answers is not on offer.')
  return { version: 1, preferredLanguage: input.preferredLanguage, questions }
}

export interface FullExperienceResult {
  reference: string
  createdAt: string
  duplicate: boolean
  pricing: Totals
}

export function submitFullExperience(app: AppContext, input: FullExperienceInput, ipHash: string): FullExperienceResult {
  const doc = publishedDocuments(app.db).fullExperience
  if (!doc) throw new HttpError(503, 'catalog_unavailable', 'The FULL EXPERIENCE request is not available yet.', { headers: { 'Retry-After': '60' } })
  const brief = buildBrief(doc, input)
  const now = app.clock.now()
  const answersKey = JSON.stringify(Object.entries(input.answers).map(([id, chosen]) => [id, [...chosen].sort()]).sort())
  const hash = contentHashOf(app.config.appSecret, 'full_experience', input.email, input.description, answersKey)

  const existing = findRecentQuoteDuplicate(app.db, hash, iso(addMs(now, -DUPLICATE_WINDOW_MS)))
  if (existing) return { reference: existing.reference, createdAt: existing.created_at, duplicate: true, pricing: totalsOf([]) }

  let row: QuoteRow | null = null
  app.db.transaction(() => {
    for (let attempt = 0; attempt < 5 && !row; attempt += 1) {
      const candidate: QuoteRow = {
        id: newId(),
        reference: newReference('F'),
        language: input.language,
        kind: 'full_experience',
        name: input.name,
        email: input.email,
        phone: null,
        company: input.company,
        description: input.description,
        objective: null,
        reference_notes: null,
        timing: null,
        requirements: null,
        brief_json: JSON.stringify(brief),
        status: 'new',
        inquiry_id: null,
        archived_at: null,
        consent_at: input.consent ? iso(now) : null,
        ip_hash: ipHash,
        content_hash: hash,
        created_at: iso(now),
        updated_at: iso(now),
      }
      try {
        insertQuote(app.db, candidate, [])
        row = candidate
      } catch (error) {
        if (!(error instanceof ConstraintError && error.kind === 'unique')) throw error
      }
    }
  })
  if (!row) throw new Error('Could not allocate a unique request reference.')
  const saved: QuoteRow = row
  app.notifier.notifyOwner('quote_received', saved.id)
  app.notifier.confirmSubmitter('quote', saved.id)
  return { reference: saved.reference, createdAt: saved.created_at, duplicate: false, pricing: totalsOf([]) }
}
