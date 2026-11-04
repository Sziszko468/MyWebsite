import type { AdminText } from '../i18n/en'
import { ApiError } from '../api/client'

/** A sentence, in the administrator's language, for whatever went wrong; never the server's own wording or anything it knows about itself. */
export function describeError(t: AdminText, error: unknown): string {
  if (!(error instanceof ApiError)) return t.states.errorGeneric
  if (error.code === 'network') return t.states.errorNetwork
  switch (error.status) {
    case 401:
      return t.login.expired
    case 403:
      return t.states.errorForbidden
    case 404:
      return t.states.errorNotFound
    case 409:
      return t.states.conflict
    case 429:
      return t.states.rateLimited
    case 503:
      return t.states.errorUnavailable
    default:
      return t.states.errorGeneric
  }
}

/** The error's reference for support (the request id the server logged it under), when it has one. */
export const errorReference = (error: unknown): string | null => (error instanceof ApiError ? error.requestId : null)

/** Field name → a sentence for the form to show next to it. `translations.hu.title` and `fields.name` are shown on the field that ends in the name. */
export function fieldErrors(t: AdminText, error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {}
  const messages = t.services.errors as Record<string, string>
  return Object.fromEntries(Object.entries(error.fields).map(([field, code]) => [field, messages[code] ?? t.services.errors.invalid]))
}
