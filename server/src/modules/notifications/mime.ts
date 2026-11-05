import { randomBytes } from 'node:crypto'

/**
 * A message as the bytes an SMTP server accepts: multipart/alternative with a plain-text and an HTML part, UTF-8
 * throughout, bodies in base64, non-ASCII header text as RFC 2047 encoded words. Every header value is checked
 * for line breaks first: a value that could end a header and start another (a name typed into a form) is
 * refused, which is what stops header injection.
 */

export interface MailMessage {
  /** `Name <address>` or an address. */
  from: string
  to: string
  replyTo?: string | null
  subject: string
  text: string
  html: string
  messageId: string
  date: Date
  /** For a provider that takes one: the same key for the same message, so a repeated request cannot send it twice. */
  idempotencyKey?: string
  /** Labels the provider hands back in its events (our delivery id), so an event can be matched to a message even before we have the provider's own id. ASCII letters, digits, `_` and `-` only. */
  tags?: Record<string, string>
}

export class MimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MimeError'
  }
}

export function assertSingleLine(value: string, what: string): string {
  if (/[\r\n\0]/.test(value)) throw new MimeError(`${what} contains a line break.`)
  return value
}

const isAscii = (value: string): boolean => /^[\x20-\x7E]*$/.test(value)

/** `=?UTF-8?B?…?=` words of at most 45 source bytes each, folded onto continuation lines. */
export function encodeWords(value: string): string {
  assertSingleLine(value, 'A header value')
  if (isAscii(value)) return value
  const words: string[] = []
  let chunk = ''
  for (const char of value) {
    if (Buffer.byteLength(chunk + char) > 45) {
      words.push(chunk)
      chunk = ''
    }
    chunk += char
  }
  if (chunk) words.push(chunk)
  return words.map((word) => `=?UTF-8?B?${Buffer.from(word, 'utf8').toString('base64')}?=`).join('\r\n ')
}

const SPECIALS = /[()<>@,;:\\".[\]]/

/** The display name and the address of `Name <address>`; a bare address has no name. */
export function splitSender(value: string): { name: string | null; address: string } {
  assertSingleLine(value, 'An address')
  const match = /^\s*(.*?)\s*<([^<>\s]+)>\s*$/.exec(value)
  if (match) return { name: match[1] ? match[1].replace(/^"|"$/g, '') : null, address: match[2] }
  return { name: null, address: value.trim() }
}

export function formatAddress(value: string): string {
  const { name, address } = splitSender(value)
  if (!name) return address
  const shown = isAscii(name) ? (SPECIALS.test(name) ? `"${name.replace(/(["\\])/g, '\\$1')}"` : name) : encodeWords(name)
  return `${shown} <${address}>`
}

function base64Lines(value: string): string {
  return (Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g) ?? ['']).join('\r\n')
}

export function buildMime(message: MailMessage): string {
  const boundary = `cc-${randomBytes(12).toString('hex')}`
  const headers = [
    `Date: ${message.date.toUTCString().replace('GMT', '+0000')}`,
    `From: ${formatAddress(message.from)}`,
    `To: ${formatAddress(message.to)}`,
    ...(message.replyTo ? [`Reply-To: ${formatAddress(message.replyTo)}`] : []),
    `Subject: ${encodeWords(message.subject)}`,
    `Message-ID: <${assertSingleLine(message.messageId, 'The message id')}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    'X-Auto-Response-Suppress: All',
  ]
  const part = (type: string, body: string) => [`--${boundary}`, `Content-Type: ${type}; charset=utf-8`, 'Content-Transfer-Encoding: base64', '', base64Lines(body)].join('\r\n')
  return [headers.join('\r\n'), '', part('text/plain', message.text), part('text/html', message.html), `--${boundary}--`, ''].join('\r\n')
}
