import type { Language } from '../i18n/config'
import { LANGUAGE_META } from '../i18n/config'
import { getPackage } from '../content/packages'
import { getAddon, type ExtraId } from '../content/services/addons'
import type { NeedId, PlanId } from '../content/services/ids'
import type { Localized } from '../content/trilingual'
import type { ShopText } from '../content/shop'
import { EMAIL_MAX, isEmail, isPhone, isWebsite } from '../forms/validate'
import { fill } from '../utils/format'
import { isCartComplete, type Cart } from './cart'

/**
 * The inquiry: what the visitor says besides what is in the cart, how each answer is checked, and
 * the request that is handed to the transport (forms/submit.ts). All of it is plain functions of
 * the cart and the answers, so the configurator and the tests apply the very same rules.
 */

export const OBJECTIVES = ['present', 'leads', 'sell', 'process', 'improve', 'other'] as const
export type ObjectiveId = (typeof OBJECTIVES)[number]

export const TIMINGS = ['unsure', 'asap', 'weeks', 'months', 'flexible'] as const
export type TimingId = (typeof TIMINGS)[number]

/** The configurator's six steps, in order. */
export const STEPS = ['need', 'plan', 'extras', 'details', 'review', 'send'] as const
export type StepId = (typeof STEPS)[number]

/** What the visitor has typed or chosen besides the cart. Empty strings and `null` mean "not answered". */
export interface Details {
  description: string
  objective: ObjectiveId | null
  reference: string
  timing: TimingId | null
  requirements: string
  name: string
  email: string
  phone: string
  /** The company the request is for (optional), its website (optional) and the budget in the visitor's own words (optional). */
  company: string
  website: string
  budget: string
  consent: boolean
  /** The separate, optional agreement to hear about other things; it is never needed to send the request. */
  marketing: boolean
}

export const EMPTY_DETAILS: Details = {
  description: '',
  objective: null,
  reference: '',
  timing: null,
  requirements: '',
  name: '',
  email: '',
  phone: '',
  company: '',
  website: '',
  budget: '',
  consent: false,
  marketing: false,
}

export const LIMITS = {
  description: { min: 20, max: 2000 },
  reference: { max: 500 },
  requirements: { max: 2000 },
  name: { min: 2, max: 100 },
  email: { max: EMAIL_MAX },
  phone: { max: 30 },
  company: { max: 100 },
  website: { max: 200 },
  budget: { max: 80 },
} as const

/** The reason an answer is not accepted; the configurator turns it into a sentence in the visitor's language. */
export type ErrorCode = 'required' | 'tooShort' | 'tooLong' | 'invalidEmail' | 'invalidPhone' | 'invalidUrl' | 'consentRequired'
/** Where an error belongs: a field, or the package question of one line of the cart (`plan:website`). */
export type FieldKey = 'need' | `plan:${NeedId}` | keyof Details
export type Errors = Partial<Record<FieldKey, ErrorCode>>

export interface ValidationOptions {
  /** The visitor has to tick the acknowledgement of how the data is used (config/quote.ts). */
  requireConsent: boolean
}

function required(
  value: string,
  rule: { min?: number; max: number },
  extra?: (trimmed: string) => ErrorCode | undefined,
): ErrorCode | undefined {
  const trimmed = value.trim()
  if (!trimmed) return 'required'
  if (rule.min && trimmed.length < rule.min) return 'tooShort'
  if (trimmed.length > rule.max) return 'tooLong'
  return extra?.(trimmed)
}

/** An answer that may be left empty, but not be too long. */
function optional(value: string, max: number, extra?: (trimmed: string) => ErrorCode | undefined): ErrorCode | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > max) return 'tooLong'
  return extra?.(trimmed)
}

/** The problems with the answers a step owns. An empty object means the step can be left. */
export function validateStep(step: StepId, cart: Cart, details: Details, options: ValidationOptions): Errors {
  const errors: Errors = {}
  const fail = (field: FieldKey, code: ErrorCode | undefined) => {
    if (code) errors[field] = code
  }

  switch (step) {
    case 'need':
      if (cart.lines.length === 0) errors.need = 'required'
      break
    case 'plan':
      if (cart.lines.length === 0) errors.need = 'required'
      for (const line of cart.lines) if (line.plan === null) errors[`plan:${line.need}`] = 'required'
      break
    case 'details':
      fail('description', required(details.description, LIMITS.description))
      fail('reference', optional(details.reference, LIMITS.reference.max))
      fail('requirements', optional(details.requirements, LIMITS.requirements.max))
      fail('budget', optional(details.budget, LIMITS.budget.max))
      if (details.objective !== null && !OBJECTIVES.includes(details.objective)) errors.objective = 'required'
      if (details.timing !== null && !TIMINGS.includes(details.timing)) errors.timing = 'required'
      break
    case 'send':
      fail('name', required(details.name, LIMITS.name))
      fail('email', required(details.email, LIMITS.email, (value) => (isEmail(value) ? undefined : 'invalidEmail')))
      fail('phone', optional(details.phone, LIMITS.phone.max, (value) => (isPhone(value) ? undefined : 'invalidPhone')))
      fail('company', optional(details.company, LIMITS.company.max))
      fail('website', optional(details.website, LIMITS.website.max, (value) => (isWebsite(value) ? undefined : 'invalidUrl')))
      if (options.requireConsent && !details.consent) errors.consent = 'consentRequired'
      break
    case 'extras':
    case 'review':
      break
  }
  return errors
}

/** The first step whose answers are not acceptable, with its problems; `null` when the whole request is fine. */
export function firstInvalidStep(cart: Cart, details: Details, options: ValidationOptions): { step: StepId; errors: Errors } | null {
  for (const step of STEPS) {
    const errors = validateStep(step, cart, details, options)
    if (Object.keys(errors).length > 0) return { step, errors }
  }
  return null
}

/** What the request sends for one line of the cart. */
export interface RequestItem {
  need: NeedId
  plan: PlanId
  extras: ExtraId[]
}

/** What the configurator sends. Optional answers that were left empty are `null`, not empty strings. */
export interface QuoteRequest {
  /** Which of the site's forms this is, so one handler can tell a quote request from a contact message. */
  form: 'quote'
  /** The shape of this payload: 2 added the list of items and replaced the single project type and package. */
  version: 2
  language: Language
  items: RequestItem[]
  description: string
  objective: ObjectiveId | null
  reference: string | null
  timing: TimingId | null
  requirements: string | null
  name: string
  email: string
  phone: string | null
  company: string | null
  /** The company's website (the server calls the field `companyWebsite`: `website` is its hidden trap). */
  companyWebsite: string | null
  budgetRange: string | null
  /** Whether the visitor ticked the separate, optional box about hearing from us again. Never needed to send the request. */
  marketing: boolean
  /** Whether the visitor ticked the acknowledgement of how the data is used (the server records when, and can insist: REQUIRE_CONSENT). */
  consent: boolean
}

const orNull = (value: string): string | null => value.trim() || null

/** The request to send. Only call it with a cart and answers that passed `firstInvalidStep`. */
export function toRequest(cart: Cart, details: Details, language: Language): QuoteRequest {
  if (!isCartComplete(cart)) throw new Error('toRequest: the cart is not complete')
  return {
    form: 'quote',
    version: 2,
    language,
    items: cart.lines.map((line) => ({ need: line.need, plan: line.plan as PlanId, extras: [...line.extras] })),
    description: details.description.trim(),
    objective: details.objective,
    reference: orNull(details.reference),
    timing: details.timing,
    requirements: orNull(details.requirements),
    name: details.name.trim(),
    email: details.email.trim(),
    phone: orNull(details.phone),
    company: orNull(details.company),
    companyWebsite: orNull(details.website),
    budgetRange: orNull(details.budget),
    marketing: details.marketing,
    consent: details.consent,
  }
}

/** The configurator's and the shop's words in the visitor's language: what the summary is made of. */
export interface SummaryText {
  configurator: Localized<ShopText['configurator']>
  common: Localized<ShopText['common']>
}

export const planName = (plan: PlanId | null, text: SummaryText): string =>
  plan === null ? text.configurator.review.notChosen : plan === 'custom' ? text.common.plans.custom.name : getPackage(plan).name

/** One line of the cart as words: its service, its package and its add-ons. */
export function describeLine(
  line: { need: NeedId; plan: PlanId | null; extras: readonly ExtraId[] },
  lang: Language,
  text: SummaryText,
): { title: string; plan: string; extras: string[] } {
  return {
    title: text.common.needs[line.need].title,
    plan: planName(line.plan, text),
    extras: line.extras.map((id) => getAddon(id).name[lang]),
  }
}

/**
 * The answers as label and value pairs, in the order they were asked: what the visitor sees under
 * "Summary" and what the copied text is made of. An unanswered question reads as the dash from the
 * dictionary, so no row silently disappears.
 */
export function summaryRows(
  cart: Cart,
  details: Details,
  lang: Language,
  text: SummaryText,
  { contact }: { contact: boolean },
): Array<[label: string, value: string]> {
  const { labels, empty } = text.configurator.summary
  const answer = (value: string) => value.trim() || empty

  const services = cart.lines
    .map((line) => {
      const { title, plan, extras } = describeLine(line, lang, text)
      const addons = extras.length > 0 ? `; ${text.configurator.review.addons}: ${extras.join(', ')}` : ''
      return `${title} (${text.configurator.review.package}: ${plan}${addons})`
    })
    .join('\n')

  const rows: Array<[string, string]> = [
    [labels.services, services || empty],
    [labels.description, answer(details.description)],
    [labels.objective, details.objective ? text.configurator.details.objective.options[details.objective] : empty],
    [labels.reference, answer(details.reference)],
    [labels.timing, details.timing ? text.configurator.details.timing.options[details.timing] : empty],
    [labels.requirements, answer(details.requirements)],
    [labels.budget, answer(details.budget)],
  ]
  if (contact) rows.push([labels.name, answer(details.name)], [labels.email, answer(details.email)], [labels.phone, answer(details.phone)], [labels.company, answer(details.company)], [labels.website, answer(details.website)])
  return rows
}

/** Plain text of the whole request, for the clipboard or an e-mail draft. */
export function buildSummary(cart: Cart, details: Details, lang: Language, text: SummaryText): string {
  const lines = [text.configurator.summary.title, '']
  for (const [label, value] of summaryRows(cart, details, lang, text, { contact: true })) {
    // A long answer goes under its label, so line breaks the visitor typed are kept.
    lines.push(value.includes('\n') ? `${label}:\n${value}` : `${label}: ${value}`)
  }
  lines.push(`${text.configurator.summary.labels.language}: ${LANGUAGE_META[lang].name}`)
  return lines.join('\n')
}

/** The sentence for one problem with one answer, in the visitor's language. `undefined` for "no problem". */
export function errorText(
  text: SummaryText['configurator'],
  field: FieldKey,
  code: ErrorCode | undefined,
  context: { name?: string } = {},
): string | undefined {
  if (!code) return undefined
  const rule = (LIMITS as Record<string, { min?: number; max: number }>)[field]
  switch (code) {
    case 'required': {
      if (field.startsWith('plan:')) return fill(text.errors.required.plan, { name: context.name ?? '' })
      const messages = text.errors.required as Partial<Record<string, string>>
      return messages[field] ?? text.errors.required.description
    }
    case 'tooShort':
      return fill(text.errors.tooShort, { min: rule?.min ?? 1 })
    case 'tooLong':
      return fill(text.errors.tooLong, { max: rule?.max ?? 0 })
    default:
      return text.errors[code]
  }
}
