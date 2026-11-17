import { validationFailed } from '../../http/errors.ts'
import { Fields } from '../../lib/validate.ts'
import { CONTEXT_TYPES, type ContextType } from './model.ts'

/** Reading a request's body field by field (PROMPT 28): the fields that exist, and nothing else. Shared by the customer's and the administration's endpoints. */

/** A body with a key that is not on the list (or no key at all) is refused: a request cannot set what it has no business setting. */
export function exact(body: Record<string, unknown>, known: readonly string[]): void {
  if (Object.keys(body).length === 0 || !Object.keys(body).every((key) => known.includes(key))) throw validationFailed({ body: 'invalid' })
}

/** The token a sender's screen made for one message (so sending it twice stores it once). */
export function tokenOf(fields: Fields): string | null {
  const token = fields.text('clientToken', { max: 64 })
  if (token !== null && !/^[A-Za-z0-9_-]{8,64}$/.test(token)) fields.fail('clientToken', 'invalid')
  return token
}

/** What a thread is about: `{ type, reference }` (never an id), or none. The record is looked up through the customer later (service.resolveContext). */
export function contextFrom(fields: Fields, body: Record<string, unknown>): { type: ContextType; reference: string } | null {
  if (!('context' in body) || body.context === null) return null
  const raw = body.context
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    fields.fail('context', 'invalid')
    return null
  }
  const inner = new Fields(raw as Record<string, unknown>)
  const type = inner.oneOf('type', CONTEXT_TYPES, { required: true })
  const reference = inner.text('reference', { max: 40, required: true })
  if (Object.keys(inner.errors).length > 0 || !type || !reference) {
    fields.fail('context', 'invalid')
    return null
  }
  return { type, reference }
}

/** An id or a reference in a query string. */
export const plainId = (raw: string | null, name: string): string | null => {
  if (!raw) return null
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(raw)) throw validationFailed({ [name]: 'invalid' })
  return raw
}
