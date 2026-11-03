import { HttpError } from './errors.ts'

/**
 * What a handler returns. The framework (app.ts) writes it, adds the security headers and logs it; a handler
 * never touches the raw response, which keeps every handler a plain function that a test can call.
 */
export interface Reply {
  status: number
  headers: Record<string, string>
  body: string | Buffer
}

const JSON_TYPE = 'application/json; charset=utf-8'

/** Success: `{ data, meta? }`. */
export function json(data: unknown, options: { status?: number; headers?: Record<string, string>; meta?: Record<string, unknown> } = {}): Reply {
  const body = options.meta ? { data, meta: options.meta } : { data }
  return { status: options.status ?? 200, headers: { 'Content-Type': JSON_TYPE, ...options.headers }, body: JSON.stringify(body) }
}

/** Failure: `{ error: { code, message, details?, requestId } }`. */
export function errorReply(error: HttpError, requestId: string): Reply {
  const payload = { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}), requestId } }
  return { status: error.status, headers: { 'Content-Type': JSON_TYPE, ...error.headers }, body: JSON.stringify(payload) }
}

export const htmlReply = (body: string, status = 200, headers: Record<string, string> = {}): Reply => ({
  status,
  headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers },
  body,
})

export const textReply = (body: string, contentType: string, status = 200, headers: Record<string, string> = {}): Reply => ({
  status,
  headers: { 'Content-Type': contentType, ...headers },
  body,
})

export const redirect = (location: string, headers: Record<string, string> = {}): Reply => ({
  status: 303,
  headers: { Location: location, ...headers },
  body: '',
})

export const empty = (status = 204, headers: Record<string, string> = {}): Reply => ({ status, headers, body: '' })
