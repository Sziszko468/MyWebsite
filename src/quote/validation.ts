import type { Language } from '../i18n/config'
import { PACKAGE_CHOICES, PROJECT_TYPES, TIMINGS, type FieldId, type QuoteDraft, type QuoteRequest, type StepId } from './types'

/**
 * What each step asks, and when an answer is good enough. These are plain functions of the draft,
 * so the form and the tests use the very same rules. A step is checked when the visitor moves on,
 * and the whole form again when it is sent.
 */

export const LIMITS = {
  description: { min: 20, max: 2000 },
  reference: { max: 500 },
  budget: { max: 100 },
  name: { min: 2, max: 100 },
  email: { max: 254 },
  phone: { max: 30 },
} as const

/** The reason an answer is not accepted; the form turns it into a sentence in the visitor's language. */
export type ErrorCode = 'required' | 'tooShort' | 'tooLong' | 'invalidEmail' | 'invalidPhone' | 'consentRequired'
export type Errors = Partial<Record<FieldId, ErrorCode>>

/** The fields each step owns, in the order they appear. */
export const STEP_FIELDS: Record<StepId, readonly FieldId[]> = {
  project: ['projectType', 'package'],
  details: ['description', 'reference'],
  extras: ['budget', 'timing'],
  contact: ['name', 'email', 'phone', 'consent'],
}

export interface ValidationOptions {
  /** The visitor has to tick the acknowledgement of how the data is used (config/quote.ts). */
  requireConsent: boolean
}

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/
const PHONE_CHARACTERS = /^[+\d\s().\-/]+$/

export function isEmail(value: string): boolean {
  return value.length <= LIMITS.email.max && EMAIL.test(value) && !value.includes('..')
}

/** Loose on purpose: digits and the usual separators, with room for a country code. */
export function isPhone(value: string): boolean {
  return PHONE_CHARACTERS.test(value) && (value.match(/\d/g)?.length ?? 0) >= 6
}

function text(
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
function optionalText(value: string, max: number, extra?: (trimmed: string) => ErrorCode | undefined): ErrorCode | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > max) return 'tooLong'
  return extra?.(trimmed)
}

/** The problems with the answers a step owns. An empty object means the step can be left. */
export function validateStep(step: StepId, draft: QuoteDraft, options: ValidationOptions): Errors {
  const errors: Errors = {}
  const fail = (field: FieldId, code: ErrorCode | undefined) => {
    if (code) errors[field] = code
  }

  switch (step) {
    case 'project':
      if (!draft.projectType || !PROJECT_TYPES.includes(draft.projectType)) errors.projectType = 'required'
      if (!draft.package || !PACKAGE_CHOICES.includes(draft.package)) errors.package = 'required'
      break
    case 'details':
      fail('description', text(draft.description, LIMITS.description))
      fail('reference', optionalText(draft.reference, LIMITS.reference.max))
      break
    case 'extras':
      // Both answers are optional; only their size and value are checked.
      fail('budget', optionalText(draft.budget, LIMITS.budget.max))
      if (draft.timing !== null && !TIMINGS.includes(draft.timing)) errors.timing = 'required'
      break
    case 'contact':
      fail('name', text(draft.name, LIMITS.name))
      fail('email', text(draft.email, LIMITS.email, (value) => (isEmail(value) ? undefined : 'invalidEmail')))
      fail('phone', optionalText(draft.phone, LIMITS.phone.max, (value) => (isPhone(value) ? undefined : 'invalidPhone')))
      if (options.requireConsent && !draft.consent) errors.consent = 'consentRequired'
      break
  }
  return errors
}

export const STEP_ORDER: readonly StepId[] = ['project', 'details', 'extras', 'contact']

/** The first step whose answers are not acceptable, with its problems; `null` when the whole form is fine. */
export function firstInvalidStep(draft: QuoteDraft, options: ValidationOptions): { step: StepId; errors: Errors } | null {
  for (const step of STEP_ORDER) {
    const errors = validateStep(step, draft, options)
    if (Object.keys(errors).length > 0) return { step, errors }
  }
  return null
}

const orNull = (value: string): string | null => value.trim() || null

/** The request to send. Only call it with a draft that passed `firstInvalidStep`. */
export function toRequest(draft: QuoteDraft, language: Language): QuoteRequest {
  if (!draft.projectType || !draft.package) throw new Error('toRequest: the draft is not complete')
  return {
    language,
    projectType: draft.projectType,
    package: draft.package,
    description: draft.description.trim(),
    reference: orNull(draft.reference),
    budget: orNull(draft.budget),
    timing: draft.timing,
    name: draft.name.trim(),
    email: draft.email.trim(),
    phone: orNull(draft.phone),
  }
}
