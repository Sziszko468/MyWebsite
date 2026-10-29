import { fill } from '../utils/format'
import type { QuoteText } from './summary'
import type { FieldId } from './types'
import { LIMITS, type ErrorCode } from './validation'

/**
 * The sentence for one problem with one answer, in the visitor's language. `required` has a
 * sentence per question; the length problems say the limit that applies to that very field.
 * `undefined` for "no problem". quote.test.ts checks that no problem the form can raise is left
 * without words in any language.
 */
export function errorText(q: QuoteText, field: FieldId, code: ErrorCode | undefined): string | undefined {
  if (!code) return undefined
  const limits = LIMITS[field as keyof typeof LIMITS] as { min?: number; max: number } | undefined
  switch (code) {
    case 'required':
      return (q.errors.required as Partial<Record<FieldId, string>>)[field]
    case 'tooShort':
      return fill(q.errors.tooShort, { min: limits?.min ?? 1 })
    case 'tooLong':
      return fill(q.errors.tooLong, { max: limits?.max ?? 0 })
    default:
      return q.errors[code]
  }
}
