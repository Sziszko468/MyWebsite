import type { AppContext } from '../../context.ts'
import { LANGUAGES, type Language } from '../../config.ts'
import { HttpError, validationFailed, type FieldErrors } from '../../http/errors.ts'
import { addMs, iso } from '../../lib/time.ts'
import { countLinks, isRecord } from '../../lib/text.ts'
import { Fields, isEmail, isPhone } from '../../lib/validate.ts'
import { contentHashOf, DUPLICATE_WINDOW_MS } from '../contact/service.ts'
import { loadCatalog, NEEDS, type Need } from '../catalog/repository.ts'
import { snapshot, totalsOf, type PriceSnapshot, type Totals } from '../shop/pricing.ts'
import { afterRequestStored, confirmationStatus, createQuoteRequest } from './create.ts'
import { findRecentQuoteDuplicate, OBJECTIVES, TIMINGS, type NewItem } from './repository.ts'
import type { RequestType } from './status.ts'
import { mintViewToken } from './tokens.ts'

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
  company: { max: 100 },
  website: { max: 200 },
  budget: { max: 80 },
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
  company: string | null
  website: string | null
  budgetRange: string | null
  consent: boolean
  /** The separate, optional agreement to hear about other things; it never affects the request. */
  marketing: boolean
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
  const company = fields.text('company', { max: QUOTE_LIMITS.company.max })
  // `website` is the hidden trap field (a person never sees it); the customer's own address is `companyWebsite`.
  const website = fields.url('companyWebsite', { max: QUOTE_LIMITS.website.max })
  const budgetRange = fields.text('budgetRange', { max: QUOTE_LIMITS.budget.max })
  const consent = fields.consent('consent', requireConsent)
  const marketing = body.marketing === true

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

  return { language: language!, items, description: description!, objective, reference, timing, requirements, name: name!, email: email!, phone, company, website, budgetRange, consent, marketing }
}

export interface QuoteResult {
  reference: string
  createdAt: string
  duplicate: boolean
  pricing: Totals
  /** The secret of the customer's status link, for the person who just sent the request. */
  statusToken: string
  /** Whether a confirmation e-mail is on its way. The request is saved either way. */
  confirmationEmail: 'queued' | 'not_sent'
}

/** What kind of request a cart is: decided here from the lines, never taken from the browser. */
export function requestTypeOf(lines: readonly QuoteLine[]): RequestType {
  const custom = lines.filter((line) => line.plan === 'custom')
  if (custom.length === 0) return 'package_quote'
  if (custom.length === lines.length && lines.every((line) => line.need === 'website' || line.need === 'improve')) return 'custom_website'
  if (custom.length === lines.length && lines.every((line) => line.need === 'webapp')) return 'custom_application'
  return 'custom_service'
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
    // An add-on sits on a line only if it applies to the service AND, when the line has a package, the package lists it (PROMPT 20:
    // the website already offers only those; the server must not accept what the page would never show). A custom project has no package.
    if (extras.some((extra) => !extra || !extra.appliesTo.includes(line.need) || (pack !== null && !pack.extras.includes(extra.code)))) errors[at('extras')] = 'unknown'

    if (!errors[at('need')] && !errors[at('plan')] && !errors[at('extras')]) {
      const known = extras.filter((extra) => extra !== undefined)
      const shot = snapshot(pack, known)
      snapshots.push(shot)
      const names = {
        service: service ? Object.fromEntries(LANGUAGES.map((language) => [language, service.translations[language]?.title ?? service.slug])) : null,
        package: pack ? Object.fromEntries(LANGUAGES.map((language) => [language, pack.translations[language]?.name ?? pack.code])) : null,
        extras: known.map((extra) => ({ code: extra.code, names: Object.fromEntries(LANGUAGES.map((language) => [language, extra.translations[language]?.name ?? extra.code])) })),
      }
      items.push({
        position: index,
        need: line.need,
        serviceId: service?.id ?? null,
        packageId: pack?.id ?? null,
        plan: line.plan,
        extraIds: known.map((extra) => extra.id),
        snapshot: shot,
        names,
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
    // The same request again (a retry after a slow answer, a double click): the answer is the first one, and nothing is sent a second time.
    return {
      reference: existing.reference,
      createdAt: existing.created_at,
      duplicate: true,
      pricing: totalsOf(storedSnapshots(app, existing.id)),
      statusToken: app.db.transaction(() => mintViewToken(app, { requestId: existing.id, quoteId: null }).token),
      confirmationEmail: confirmationStatus(app, existing.id),
    }
  }

  const { items, snapshots } = resolveItems(app, input.items)
  const created = createQuoteRequest(app, {
    language: input.language,
    kind: 'catalogue',
    requestType: requestTypeOf(input.items),
    source: 'shop',
    name: input.name,
    email: input.email,
    phone: input.phone,
    company: input.company,
    website: input.website,
    description: input.description,
    objective: input.objective,
    referenceNotes: input.reference,
    timing: input.timing,
    requirements: input.requirements,
    budgetRange: input.budgetRange,
    briefJson: null,
    consent: input.consent,
    marketingConsent: input.marketing,
    ipHash,
    contentHash: hash,
    items,
    actor: { type: 'system' },
  })
  const { confirmationEmail } = afterRequestStored(app, created.row)
  return { reference: created.row.reference, createdAt: created.row.created_at, duplicate: false, pricing: totalsOf(snapshots), statusToken: created.statusToken, confirmationEmail }
}

function storedSnapshots(app: AppContext, quoteId: string): PriceSnapshot[] {
  return app.db.all<{ price_snapshot: string }>('SELECT price_snapshot FROM quote_request_items WHERE quote_request_id = ? ORDER BY position', [quoteId]).map((row) => JSON.parse(row.price_snapshot) as PriceSnapshot)
}
