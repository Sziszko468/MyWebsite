import type { Language } from '../i18n/config'
import { isEmail } from '../forms/validate'
import { CONTACT_KINDS, type ContactDraft, type ContactField, type ContactRequest } from './types'

/** What counts as a good answer. The form and the tests use these same rules. */

export const CONTACT_LIMITS = {
  name: { min: 2, max: 100 },
  email: { max: 254 },
  subject: { min: 3, max: 150 },
  message: { min: 10, max: 3000 },
} as const

export type ContactErrorCode = 'required' | 'tooShort' | 'tooLong' | 'invalidEmail' | 'consentRequired'
export type ContactErrors = Partial<Record<ContactField, ContactErrorCode>>

/** The fields in the order they appear, which is also the order focus goes to a problem. */
export const CONTACT_FIELD_ORDER: readonly ContactField[] = ['name', 'email', 'kind', 'subject', 'message', 'consent']

function text(
  value: string,
  rule: { min?: number; max: number },
  extra?: (trimmed: string) => ContactErrorCode | undefined,
): ContactErrorCode | undefined {
  const trimmed = value.trim()
  if (!trimmed) return 'required'
  if (rule.min && trimmed.length < rule.min) return 'tooShort'
  if (trimmed.length > rule.max) return 'tooLong'
  return extra?.(trimmed)
}

/** The problems with the answers; an empty object means the message can be sent. */
export function validateContact(draft: ContactDraft, options: { requireConsent: boolean }): ContactErrors {
  const errors: ContactErrors = {}
  const fail = (field: ContactField, code: ContactErrorCode | undefined) => {
    if (code) errors[field] = code
  }

  fail('name', text(draft.name, CONTACT_LIMITS.name))
  fail('email', text(draft.email, CONTACT_LIMITS.email, (value) => (isEmail(value) ? undefined : 'invalidEmail')))
  if (!draft.kind || !CONTACT_KINDS.includes(draft.kind)) errors.kind = 'required'
  fail('subject', text(draft.subject, CONTACT_LIMITS.subject))
  fail('message', text(draft.message, CONTACT_LIMITS.message))
  if (options.requireConsent && !draft.consent) errors.consent = 'consentRequired'
  return errors
}

/** The request to send. Only call it with a draft that has no problems. */
export function toContactRequest(draft: ContactDraft, language: Language): ContactRequest {
  if (!draft.kind) throw new Error('toContactRequest: the draft is not complete')
  return {
    form: 'contact',
    language,
    kind: draft.kind,
    name: draft.name.trim(),
    email: draft.email.trim(),
    subject: draft.subject.trim(),
    message: draft.message.trim(),
  }
}
