/**
 * Every way a request can fail, as one set of codes. A client (the website, a script) reacts to the `code`;
 * the `message` is for a person reading a log or a network tab. Nothing in an error carries a stack trace,
 * a query, a file path or anything the server knows about itself.
 */
export type ErrorCode =
  | 'invalid_json'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'validation_failed'
  | 'unauthorized'
  | 'forbidden'
  | 'csrf_failed'
  | 'origin_not_allowed'
  | 'not_found'
  | 'method_not_allowed'
  | 'conflict'
  | 'rate_limited'
  | 'spam_suspected'
  | 'catalog_unavailable'
  | 'service_unavailable'
  | 'bad_gateway'
  | 'internal_error'

/** Why a field was refused. Deliberately the same words the website's forms use, so the two can share a translation. */
export type FieldCode =
  | 'required'
  | 'tooShort'
  | 'tooLong'
  | 'invalidEmail'
  | 'invalidPhone'
  | 'invalid'
  | 'consentRequired'
  | 'unknown'
  | 'duplicate'
  | 'tooMany'

export type FieldErrors = Record<string, FieldCode>

export class HttpError extends Error {
  readonly status: number
  readonly code: ErrorCode
  readonly details?: Record<string, unknown>
  readonly headers: Record<string, string>

  constructor(status: number, code: ErrorCode, message: string, options: { details?: Record<string, unknown>; headers?: Record<string, string> } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = options.details
    this.headers = options.headers ?? {}
  }
}

export const badJson = (message = 'The request body is not valid JSON.') => new HttpError(400, 'invalid_json', message)
export const unsupportedMedia = (expected: string) => new HttpError(415, 'unsupported_media_type', `Send the body as ${expected}.`)
export const tooLarge = (limit: number) => new HttpError(413, 'payload_too_large', `The request body is larger than ${limit} bytes.`)
export const validationFailed = (fields: FieldErrors, message = 'Some fields are not acceptable.') =>
  new HttpError(422, 'validation_failed', message, { details: { fields } })
export const unauthorized = (message = 'Sign in to continue.') => new HttpError(401, 'unauthorized', message)
export const forbidden = (message = 'You are not allowed to do this.') => new HttpError(403, 'forbidden', message)
export const csrfFailed = () => new HttpError(403, 'csrf_failed', 'The form is out of date. Reload the page and try again.')
export const notFound = (what = 'The resource') => new HttpError(404, 'not_found', `${what} was not found.`)
export const conflict = (message: string) => new HttpError(409, 'conflict', message)
export const rateLimited = (retryAfterSeconds: number) =>
  new HttpError(429, 'rate_limited', 'Too many requests. Try again later.', {
    headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))) },
  })
export const unavailable = (message = 'The service is temporarily unavailable.') => new HttpError(503, 'service_unavailable', message, { headers: { 'Retry-After': '30' } })

/** The database could not be reached or is closed; surfaced to a client as a 503, never as a 500 with details. */
export class DatabaseUnavailableError extends Error {
  constructor(message = 'The database is not available.') {
    super(message)
    this.name = 'DatabaseUnavailableError'
  }
}

/** A constraint (unique, foreign key, check) was violated; the module that issued the statement decides what that means. */
export class ConstraintError extends Error {
  readonly kind: 'unique' | 'foreign_key' | 'check' | 'not_null' | 'other'
  constructor(kind: ConstraintError['kind'], message: string) {
    super(message)
    this.name = 'ConstraintError'
    this.kind = kind
  }
}
