/** The checks every form of the site shares: what counts as an e-mail address and as a phone number. */

export const EMAIL_MAX = 254

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/
const PHONE_CHARACTERS = /^[+\d\s().\-/]+$/

export function isEmail(value: string): boolean {
  return value.length <= EMAIL_MAX && EMAIL.test(value) && !value.includes('..')
}

/**
 * A website address the way the server accepts it (lib/validate.ts `normalizeUrl`): http or https, a host with a dot, no sign-in
 * details, no spaces; the scheme may be left off. Used only to tell the visitor early; the server decides.
 */
export function isWebsite(value: string): boolean {
  const text = value.trim()
  if (!text || /\s/.test(text) || text.length > 300 || text.startsWith('/')) return false
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : /^[a-z][a-z0-9+.-]*:/i.test(text) ? null : `https://${text}`
  if (!withScheme) return false
  try {
    const url = new URL(withScheme)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    if (url.username || url.password) return false
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(url.hostname.replace(/\.$/, ''))
  } catch {
    return false
  }
}

/** Loose on purpose: digits and the usual separators, with room for a country code. */
export function isPhone(value: string): boolean {
  return PHONE_CHARACTERS.test(value) && (value.match(/\d/g)?.length ?? 0) >= 6
}
