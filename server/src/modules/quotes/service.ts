import type { AppContext } from '../../context.ts'
import { LANGUAGES, type Language } from '../../config.ts'
import { ConstraintError, HttpError, validationFailed, type FieldErrors } from '../../http/errors.ts'
import { newId, newReference } from '../../lib/crypto.ts'
import { addMs, iso } from '../../lib/time.ts'
import { countLinks, isRecord } from '../../lib/text.ts'
import { Fields, isEmail, isPhone } from '../../lib/validate.ts'
import { contentHashOf, DUPLICATE_WINDOW_MS } from '../contact/service.ts'
import { loadCatalog, NEEDS, type Need } from '../catalog/repository.ts'
import { snapshot, totalsOf, type PriceSnapshot, type Totals } from '../shop/pricing.ts'
import { findRecentQuoteDuplicate, insertQuote, OBJECTIVES, TIMINGS, type NewItem, type QuoteRow } from './repository.ts'

/**
 * The quote request: what the website's builder sends (src/shop/inquiry.ts `QuoteRequest`, version 2). The
 * answers are checked here against the same limits, and every line of the cart is checked against the
 * catalogue as it is now: the service and the package must be active, an add-on must exist and apply to the need.
 * A price is never read from the request (it has none); the approved prices are copied from the catalogue
 * onto each stored item, so the record says what was on offer when the visitor asked.
 */

/** The same numbers as src/shop/inquiry.ts (src/shop/contractWithServer.test.ts compares them). */
export const QUOTE_LIMITS = {
  description: { min: 20, max: 2000 },
  reference: { max: 500 },
  requirements: { max: 2000 },
  name: { min: 2, max: 100 },
  email: { max: 254 },
  phone: { max: 30 },
  items: { max: 8 },
  extrasPerItem: { max: 12 },
} as const

export interface QuoteLine {
  need: Need
  plan: string
  extras: string[]
}

export interface QuoteInput {
  language: Language
  items: QuoteLine[]
  description: string
  objective: string | null
  reference: string | null
  timing: string | null
  requirements: string | null
  name: string
  email: string
  phone: string | null
  consent: boolean
}

/** The service a need leads to (the same rule as src/content/services/ids.ts): `improve` is the website service, `unsure` has none. */
export const serviceOfNeed = (need: Need): string | null => (need === 'improve' ? 'website' : need === 'unsure' ? null : need)

export function parseQuote(body: Record<string, unknown>, requireConsent: boolean): QuoteInput {
  const fields = new Fields(body)
  if (body.form !== undefined && body.form !== 'quote') fields.fail('form', 'invalid')
  if (body.version !== undefined && body.version !== 2) fields.fail('version', 'invalid')

  const language = fields.oneOf('language', LANGUAGES, { required: true })
  const description = fields.text('description', { ...QUOTE_LIMITS.description, required: true, multiline: true })
  const objective = fields.oneOf('objective', OBJECTIVES)
  const reference = fields.text('reference', { max: QUOTE_LIMITS.reference.max, multiline: true })
  const timing = fields.oneOf('timing', TIMINGS)
  const requirements = fields.text('requirements', { max: QUOTE_LIMITS.requirements.max, multiline: true })
  const name = fields.text('name', { ...QUOTE_LIMITS.name, required: true })
  const email = fields.text('email', { max: QUOTE_LIMITS.email.max, required: true }, (value) => (isEmail(value) ? undefined : 'invalidEmail'))
  const phone = fields.text('phone', { max: QUOTE_LIMITS.phone.max }, (value) => (isPhone(value) ? undefined : 'invalidPhone'))
  const consent = fields.consent('consent', requireConsent)

  const items: QuoteLine[] = []
  const rawItems = body.items
  if (!Array.isArray(rawItems) || rawItems.length === 0) fields.fail('items', 'required')
  else if (rawItems.length > QUOTE_LIMITS.items.max) fields.fail('items', 'tooMany')
  else {
    const seen = new Set<string>()
    rawItems.forEach((raw, index) => {
      const at = (field: string) => `items.${index}.${field}`
      if (!isRecord(raw)) return fields.fail(`items.${index}`, 'invalid')
      const need = typeof raw.need === 'string' && (NEEDS as readonly string[]).includes(raw.need) ? (raw.need as Need) : null
      if (!need) fields.fail(at('need'), raw.need === undefined ? 'required' : 'invalid')
      else if (seen.has(need)) fields.fail(at('need'), 'duplicate')
      else seen.add(need)
      const plan = typeof raw.plan === 'string' && /^[a-z0-9]{2,40}$/.test(raw.plan) ? raw.plan : null
      if (!plan) fields.fail(at('plan'), raw.plan === undefined || raw.plan === null ? 'required' : 'invalid')
      const extras: string[] = []
      if (raw.extras !== undefined && !Array.isArray(raw.extras)) fields.fail(at('extras'), 'invalid')
      else if (Array.isArray(raw.extras)) {
        if (raw.extras.length > QUOTE_LIMITS.extrasPerItem.max) fields.fail(at('extras'), 'tooMany')
        for (const extra of raw.extras) {
          if (typeof extra !== 'string' || !/^[a-z0-9]{2,40}$/.test(extra)) fields.fail(at('extras'), 'invalid')
          else if (!extras.includes(extra)) extras.push(extra)
        }
      }
      if (need && plan) items.push({ need, plan, extras })
    })
  }
  fields.done()

  if (typeof body.website === 'string' && body.website.trim() !== '') throw new HttpError(422, 'spam_suspected', 'The request was not accepted.')
  if (countLinks(`${description} ${reference ?? ''} ${requirements ?? ''}`) > 5) throw new HttpError(422, 'spam_suspected', 'The request was not accepted.')

  return { language: language!, items, description: description!, objective, reference, timing, requirements, name: name!, email: email!, phone, consent }
}

export interface QuoteResult {
  reference: string
  createdAt: string
  duplicate: boolean
  pricing: Totals
}

/** Checks the cart against the catalogue and builds what is stored for each line. */
function resolveItems(app: AppContext, lines: readonly QuoteLine[]): { items: NewItem[]; snapshots: PriceSnapshot[] } {
  const catalog = loadCatalog(app.db)
  if (catalog.services.length === 0 || catalog.packages.length === 0) throw new HttpError(503, 'catalog_unavailable', 'The catalogue is not available yet.', { headers: { 'Retry-After': '60' } })

  const errors: FieldErrors = {}
  const items: NewItem[] = []
  const snapshots: PriceSnapshot[] = []
  lines.forEach((line, index) => {
    const at = (field: string) => `items.${index}.${field}`
    const slug = serviceOfNeed(line.need)
    const service = slug ? catalog.services.find((candidate) => candidate.slug === slug) : null
    if (slug && !service) errors[at('need')] = 'unknown'

    const pack = line.plan === 'custom' ? null : (catalog.packages.find((candidate) => candidate.code === line.plan) ?? null)
    if (line.plan !== 'custom' && !pack) errors[at('plan')] = 'unknown'

    const extras = line.extras.map((code) => catalog.extras.find((candidate) => candidate.code === code))
    if (extras.some((extra) => !extra || !extra.appliesTo.includes(line.need))) errors[at('extras')] = 'unknown'

    if (!errors[at('need')] && !errors[at('plan')] && !errors[at('extras')]) {
      const known = extras.filter((extra) => extra !== undefined)
      const shot = snapshot(pack, known)
      snapshots.push(shot)
      items.push({
        position: index,
        need: line.need,
        serviceId: service?.id ?? null,
        packageId: pack?.id ?? null,
        plan: line.plan,
        extraIds: known.map((extra) => extra.id),
        snapshot: shot,
      })
    }
  })
  if (Object.keys(errors).length > 0) throw validationFailed(errors, 'Something in the request is not on offer.')
  return { items, snapshots }
}

export function submitQuote(app: AppContext, input: QuoteInput, ipHash: string): QuoteResult {
  const now = app.clock.now()
  const hash = contentHashOf(app.config.appSecret, input.email, input.description, JSON.stringify(input.items.map((line) => [line.need, line.plan, [...line.extras].sort()]).sort()))

  const existing = findRecentQuoteDuplicate(app.db, hash, iso(addMs(now, -DUPLICATE_WINDOW_MS)))
  if (existing) {
    // The same request again (a retry after a slow answer, a double click): the answer is the first one.
    return { reference: existing.reference, createdAt: existing.created_at, duplicate: true, pricing: totalsOf(storedSnapshots(app, existing.id)) }
  }

  const { items, snapshots } = resolveItems(app, input.items)
  let row: QuoteRow | null = null
  app.db.transaction(() => {
    for (let attempt = 0; attempt < 5 && !row; attempt += 1) {
      const candidate: QuoteRow = {
        id: newId(),
        reference: newReference('Q'),
        language: input.language,
        kind: 'catalogue',
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: null,
        description: input.description,
        objective: input.objective,
        reference_notes: input.reference,
        timing: input.timing,
        requirements: input.requirements,
        brief_json: null,
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
        insertQuote(app.db, candidate, items)
        row = candidate
      } catch (error) {
        if (!(error instanceof ConstraintError && error.kind === 'unique')) throw error
      }
    }
  })
  if (!row) throw new Error('Could not allocate a unique quote reference.')
  const saved: QuoteRow = row

  app.notifier.notifyOwner('quote_received', saved.id)
  app.notifier.confirmSubmitter('quote', saved.id)
  return { reference: saved.reference, createdAt: saved.created_at, duplicate: false, pricing: totalsOf(snapshots) }
}

function storedSnapshots(app: AppContext, quoteId: string): PriceSnapshot[] {
  return app.db.all<{ price_snapshot: string }>('SELECT price_snapshot FROM quote_request_items WHERE quote_request_id = ? ORDER BY position', [quoteId]).map((row) => JSON.parse(row.price_snapshot) as PriceSnapshot)
}
