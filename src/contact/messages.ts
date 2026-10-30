import type { Dictionary } from '../i18n/locales/hu'
import { fill } from '../utils/format'
import type { ContactField } from './types'
import { CONTACT_LIMITS, type ContactErrorCode } from './validation'

/** The contact form's words in the visitor's language. */
export type ContactText = Dictionary['contactPage']['form']

/**
 * The sentence for one problem with one answer. `required` has a sentence per question; the length
 * problems name the limit of that very field. `undefined` for "no problem".
 */
export function contactErrorText(c: ContactText, field: ContactField, code: ContactErrorCode | undefined): string | undefined {
  if (!code) return undefined
  const limits = CONTACT_LIMITS[field as keyof typeof CONTACT_LIMITS] as { min?: number; max: number } | undefined
  switch (code) {
    case 'required':
      return (c.errors.required as Partial<Record<ContactField, string>>)[field]
    case 'tooShort':
      return fill(c.errors.tooShort, { min: limits?.min ?? 1 })
    case 'tooLong':
      return fill(c.errors.tooLong, { max: limits?.max ?? 0 })
    default:
      return c.errors[code]
  }
}
