import type { FieldCode, FieldErrors } from '../http/errors.ts'
import { validationFailed } from '../http/errors.ts'
import { cleanBlock, cleanLine, length } from './text.ts'

/**
 * Field checks that build one `FieldErrors` map instead of throwing at the first problem, so a client is told
 * everything that is wrong in one answer. The rules and the codes are those of the website's own forms
 * (src/contact/validation.ts, src/shop/inquiry.ts); a test in src/ compares the numbers so they cannot drift.
 */

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/
const PHONE_CHARACTERS = /^[+\d\s().\-/]+$/
export const EMAIL_MAX = 254

export const isEmail = (value: string): boolean => value.length <= EMAIL_MAX && EMAIL.test(value) && !value.includes('..')
export const isPhone = (value: string): boolean => PHONE_CHARACTERS.test(value) && (value.match(/\d/g)?.length ?? 0) >= 6

/**
 * A website address as the site stores it: `https://` added when the person left the scheme off, only http and https, a host with a dot
 * and no sign-in details in it, no whitespace. `null` when it is not one. The result is what `new URL` makes of it, so it carries no
 * surprises (no `javascript:`, no `//evil` tricks) into a link in the administration.
 */
export function normalizeUrl(value: string): string | null {
  const text = value.trim()
  if (!text || /\s/.test(text) || text.length > 300 || text.startsWith('/')) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : /^[a-z][a-z0-9+.-]*:/i.test(text) ? null : `https://${text}`
  if (!withScheme) return null
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(url.hostname.replace(/\.$/, ''))) return null
    return url.toString()
  } catch {
    return null
  }
}

export class Fields {
  readonly errors: FieldErrors = {}
  private readonly body: Record<string, unknown>

  constructor(body: Record<string, unknown>) {
    this.body = body
  }

  fail(field: string, code: FieldCode): void {
    if (!(field in this.errors)) this.errors[field] = code
  }

  /** A text answer. `null` when optional and empty; the cleaned text otherwise. */
  text(
    field: string,
    rule: { min?: number; max: number; multiline?: boolean; required?: boolean },
    extra?: (value: string) => FieldCode | undefined,
  ): string | null {
    const raw = this.body[field]
    if (raw === undefined || raw === null || raw === '') {
      if (rule.required) this.fail(field, 'required')
      return null
    }
    if (typeof raw !== 'string') {
      this.fail(field, 'invalid')
      return null
    }
    const value = rule.multiline ? cleanBlock(raw) : cleanLine(raw)
    if (!value) {
      if (rule.required) this.fail(field, 'required')
      return null
    }
    if (rule.min !== undefined && length(value) < rule.min) this.fail(field, 'tooShort')
    else if (length(value) > rule.max) this.fail(field, 'tooLong')
    else {
      const code = extra?.(value)
      if (code) this.fail(field, code)
    }
    return value
  }

  /** An optional website address, normalised (see `normalizeUrl`); `invalidUrl` when it is not one. */
  url(field: string, rule: { max: number }): string | null {
    const typed = this.text(field, { max: rule.max })
    if (typed === null) return null
    if (field in this.errors) return null
    const normalised = normalizeUrl(typed)
    if (normalised === null || normalised.length > 300) {
      this.fail(field, 'invalidUrl')
      return null
    }
    return normalised
  }

  oneOf<T extends string>(field: string, allowed: readonly T[], options: { required: true }): T | null
  oneOf<T extends string>(field: string, allowed: readonly T[], options?: { required?: boolean }): T | null
  oneOf<T extends string>(field: string, allowed: readonly T[], options: { required?: boolean } = {}): T | null {
    const raw = this.body[field]
    if (raw === undefined || raw === null || raw === '') {
      if (options.required) this.fail(field, 'required')
      return null
    }
    if (typeof raw !== 'string' || !allowed.includes(raw as T)) {
      this.fail(field, 'invalid')
      return null
    }
    return raw as T
  }

  /** `consent` is a yes only when it is exactly `true`. */
  consent(field: string, required: boolean): boolean {
    const given = this.body[field] === true
    if (required && !given) this.fail(field, 'consentRequired')
    return given
  }

  value(field: string): unknown {
    return this.body[field]
  }

  /** Throws the 422 when anything was wrong. */
  done(): void {
    if (Object.keys(this.errors).length > 0) throw validationFailed(this.errors)
  }
}
