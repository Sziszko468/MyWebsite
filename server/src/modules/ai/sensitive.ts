/**
 * What must never be sent to the provider or kept in a conversation (PROMPT 29): a payment card number, or something that is plainly a
 * credential (an API key, a private key, a bearer token). The assistant is for questions about a portfolio and for planning a project; nobody
 * needs to type these, and a visitor who does so by mistake is better refused than stored for days and passed on to a processor.
 *
 * This is deliberately narrow. It is NOT a general personal-data filter: names, e-mail addresses and phone numbers a visitor writes in free text
 * are not detected (the privacy notice tells them not to enter sensitive data, and the contact details of a request are typed in the plan
 * panel, never in the chat). The limitation is documented in docs/ai/PRIVACY.md.
 */

export type SensitiveKind = 'payment_card' | 'secret'

/** The Luhn check every card number passes (it keeps a long number that is not a card, such as an order number, from being refused). */
function luhn(digits: string): boolean {
  let sum = 0
  let double = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48
    if (double) {
      value *= 2
      if (value > 9) value -= 9
    }
    sum += value
    double = !double
  }
  return sum % 10 === 0
}

const SECRETS: readonly RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{10,}/,
  /\bsk-[A-Za-z0-9]{24,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/i,
]

/** The first kind of sensitive data found in a text, or null. */
export function findSensitive(text: string): SensitiveKind | null {
  for (const pattern of SECRETS) if (pattern.test(text)) return 'secret'
  for (const match of text.matchAll(/(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])/g)) {
    const digits = match[0].replace(/\D/g, '')
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return 'payment_card'
  }
  return null
}
