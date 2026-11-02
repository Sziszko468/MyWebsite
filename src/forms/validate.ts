/** The checks every form of the site shares: what counts as an e-mail address and as a phone number. */

export const EMAIL_MAX = 254

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/
const PHONE_CHARACTERS = /^[+\d\s().\-/]+$/

export function isEmail(value: string): boolean {
  return value.length <= EMAIL_MAX && EMAIL.test(value) && !value.includes('..')
}

/** Loose on purpose: digits and the usual separators, with room for a country code. */
export function isPhone(value: string): boolean {
  return PHONE_CHARACTERS.test(value) && (value.match(/\d/g)?.length ?? 0) >= 6
}
