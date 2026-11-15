import { isEmailAddress } from '../../config.ts'
import { htmlToText } from './html.ts'

/**
 * A message as the Gmail API returns it (`users.messages.get`, format `full`), turned into the few things that are kept. Everything in
 * it is untrusted input from a stranger: it is checked before it is used, every size is capped, and a message that is malformed or
 * too big is refused with a `MimeError` instead of being half read. Nothing here executes or renders anything: HTML becomes text
 * (html.ts), headers are only ever data, and no remote resource is fetched. The raw payload never leaves this file.
 */

export interface MimeLimits {
  /** The decoded text of one part, in bytes. */
  partBytes: number
  /** All the decoded text of the message, in bytes. */
  totalBytes: number
  /** What is kept of the body, in characters; the rest is cut (and the message says so). */
  bodyChars: number
  maxDepth: number
  maxParts: number
  maxAttachments: number
  maxAddresses: number
}

export const MIME_LIMITS: MimeLimits = { partBytes: 1_048_576, totalBytes: 1_048_576, bodyChars: 100_000, maxDepth: 12, maxParts: 300, maxAttachments: 100, maxAddresses: 50 }

export type MimeFailure = 'malformed' | 'too_large'

export class MimeError extends Error {
  readonly reason: MimeFailure
  constructor(reason: MimeFailure) {
    super(reason === 'too_large' ? 'The message is larger than the limits allow.' : 'The message is not a well-formed Gmail message.')
    this.name = 'MimeError'
    this.reason = reason
  }
}

export interface ParsedAddress {
  name: string
  address: string
}

export interface ParsedRecipient extends ParsedAddress {
  type: 'to' | 'cc'
}

export interface ParsedAttachment {
  partId: string
  filename: string
  mimeType: string
  size: number
  inline: boolean
}

export interface ParsedMessage {
  gmailMessageId: string
  gmailThreadId: string
  rfcMessageId: string | null
  labels: string[]
  from: ParsedAddress | null
  recipients: ParsedRecipient[]
  subject: string
  bodyText: string
  bodyTruncated: boolean
  /** Gmail's `internalDate`: when the mailbox received it. */
  receivedAt: string
  /** The `Date` header: what the sender claims. */
  sentAt: string | null
  inReplyTo: string | null
  references: string[]
  attachments: ParsedAttachment[]
}

const ID = /^[A-Za-z0-9_-]{1,64}$/
const MESSAGE_ID = /<[^<>\s]{1,998}>/g
/** Gmail's label ids (`INBOX`, `SENT`, `Label_12`). */
const LABEL = /^[A-Za-z0-9_ -]{1,64}$/

interface Header {
  name?: unknown
  value?: unknown
}
interface Part {
  partId?: unknown
  mimeType?: unknown
  filename?: unknown
  headers?: unknown
  body?: unknown
  parts?: unknown
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Characters that reverse or hide the direction of text: never kept from a stranger's message. */
const isBidi = (code: number): boolean => code === 0x200e || code === 0x200f || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)

/** The text without control characters (each becomes `replacement`, except the ones named in `keep`) and without bidirectional controls. */
function stripControls(value: string, replacement: string, keep: readonly number[]): string {
  let out = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (isBidi(code)) continue
    out += (code < 0x20 || code === 0x7f) && !keep.includes(code) ? replacement : char
  }
  return out
}

/** A value in a header, without anything that is not text, and never longer than a header may be. */
const cleanHeader = (value: string, max = 8192): string => stripControls(value.slice(0, max), ' ', [0x09, 0x0a]).trim()

function headersOf(part: Part): Map<string, string> {
  const map = new Map<string, string>()
  if (!Array.isArray(part.headers)) return map
  for (const header of part.headers.slice(0, 300) as Header[]) {
    if (!isObject(header) || typeof header.name !== 'string' || typeof header.value !== 'string') continue
    const name = header.name.toLowerCase().slice(0, 100)
    if (!map.has(name)) map.set(name, header.value.slice(0, 16384))
  }
  return map
}

// ---------------------------------------------------------------------------------------------------------- characters

function decoderFor(charset: string | null): { decode(input: Uint8Array): string } {
  const label = (charset ?? 'utf-8').split('*')[0].trim().toLowerCase().replace(/^["']|["']$/g, '')
  try {
    return new TextDecoder(label || 'utf-8', { fatal: false })
  } catch {
    return new TextDecoder('utf-8', { fatal: false })
  }
}

/** RFC 2047 encoded words (`=?UTF-8?B?…?=`, `=?ISO-8859-2?Q?…?=`), in headers that may hold text. */
function decodeWords(value: string): string {
  const text = value.slice(0, 8192).replace(/(\?=)\s+(?==\?)/g, '$1')
  return text.replace(/=\?([^?\s]{1,60})\?([bBqQ])\?([^?\s]{0,2000})\?=/g, (_whole, charset: string, encoding: string, payload: string) => {
    try {
      const bytes =
        encoding.toLowerCase() === 'b'
          ? Buffer.from(payload, 'base64')
          : Buffer.from(
              payload.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16))),
              'latin1',
            )
      return decoderFor(charset).decode(bytes)
    } catch {
      return ''
    }
  })
}

const headerText = (value: string | undefined, max: number): string => (value === undefined ? '' : cleanHeader(decodeWords(cleanHeader(value))).replace(/\s+/g, ' ').slice(0, max).trim())

// ------------------------------------------------------------------------------------------------------------ addresses

/** Splits a header on the separators that are not inside quotes, comments or angle brackets. */
function splitTop(value: string, separators: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  let angle = 0
  let comment = 0
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]
    if (quoted) {
      current += char
      if (char === '\\' && i + 1 < value.length) current += value[++i]
      else if (char === '"') quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === '(') comment += 1
    else if (char === ')' && comment > 0) comment -= 1
    else if (comment === 0 && char === '<') angle += 1
    else if (comment === 0 && char === '>' && angle > 0) angle -= 1
    if (angle === 0 && comment === 0 && !quoted && separators.includes(char)) {
      parts.push(current)
      current = ''
    } else current += char
  }
  parts.push(current)
  return parts
}

function unquote(name: string): string {
  const trimmed = name.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) return trimmed.slice(1, -1).replace(/\\(.)/g, '$1')
  return trimmed.replace(/"/g, '')
}

export function parseAddresses(value: string | undefined, max: number): ParsedAddress[] {
  if (!value) return []
  const result: ParsedAddress[] = []
  for (const token of splitTop(value.slice(0, 16384), ',;')) {
    if (result.length >= max) break
    const withoutComments = token.replace(/\([^()]*\)/g, ' ')
    const angled = /<([^<>]*)>/.exec(withoutComments)
    // Without angle brackets the address is the last word (`Group: a@example.com` starts a group; the address is what follows the colon).
    const bare = angled ? null : /([^\s:,;<>"()]+@[^\s:,;<>"()]+)\s*$/.exec(withoutComments.trim())
    const raw = (angled ? angled[1] : (bare?.[1] ?? '')).trim().replace(/^mailto:/i, '').replace(/^"|"$/g, '')
    const address = raw.toLowerCase()
    if (!isEmailAddress(address)) continue
    const name = angled ? headerText(unquote(withoutComments.slice(0, angled.index)), 200) : ''
    result.push({ name: name.toLowerCase() === address ? '' : name, address })
  }
  return result
}

// ------------------------------------------------------------------------------------------------------------- the body

interface Budget {
  parts: number
  bytes: number
}

/** The text of a plain-text body, as it should be stored: no control characters, one kind of line break, no runs of blank lines. */
function tidy(text: string): string {
  const withoutMark = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  return stripControls(withoutMark.replace(/\r\n?/g, '\n'), '', [0x09, 0x0a])
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function mediaType(part: Part, headers: Map<string, string>): string {
  const fromHeader = (headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const declared = typeof part.mimeType === 'string' ? part.mimeType.trim().toLowerCase() : ''
  const type = declared || fromHeader
  return /^[a-z0-9!#$&^_.+-]{1,60}\/[a-z0-9!#$&^_.+-]{1,100}$/.test(type) ? type : 'application/octet-stream'
}

function charsetOf(headers: Map<string, string>): string | null {
  const match = /charset\s*=\s*("?)([^";\s]{1,60})\1/i.exec(headers.get('content-type') ?? '')
  return match ? match[2] : null
}

const isAttachment = (part: Part, headers: Map<string, string>): boolean =>
  (typeof part.filename === 'string' && part.filename.trim() !== '') || /^\s*attachment\b/i.test(headers.get('content-disposition') ?? '')

function decodeData(part: Part, headers: Map<string, string>, limits: MimeLimits, budget: Budget): string {
  const body = isObject(part.body) ? part.body : {}
  const data = body.data
  if (data === undefined || data === '') return ''
  if (typeof data !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(data)) throw new MimeError('malformed')
  // The size is known before anything is decoded: base64 is 4 characters for 3 bytes.
  const estimate = Math.floor((data.length * 3) / 4)
  if (estimate > limits.partBytes) throw new MimeError('too_large')
  budget.bytes += estimate
  if (budget.bytes > limits.totalBytes) throw new MimeError('too_large')
  return decoderFor(charsetOf(headers)).decode(Buffer.from(data, 'base64url'))
}

/** The readable text of a part and what is below it: plain text as it is, HTML converted, multipart/alternative by preference for plain text. */
function textOf(part: Part, depth: number, limits: MimeLimits, budget: Budget, flags: { cut: boolean }): string {
  if (depth > limits.maxDepth) throw new MimeError('malformed')
  budget.parts += 1
  if (budget.parts > limits.maxParts) throw new MimeError('too_large')
  const headers = headersOf(part)
  const type = mediaType(part, headers)
  if (type.startsWith('multipart/')) {
    const children = Array.isArray(part.parts) ? (part.parts as unknown[]) : []
    const texts: { type: string; text: string }[] = []
    for (const child of children) {
      if (!isObject(child)) throw new MimeError('malformed')
      const childHeaders = headersOf(child)
      if (isAttachment(child, childHeaders)) {
        budget.parts += 1
        if (budget.parts > limits.maxParts) throw new MimeError('too_large')
        continue
      }
      texts.push({ type: mediaType(child, childHeaders), text: textOf(child, depth + 1, limits, budget, flags) })
    }
    if (type === 'multipart/alternative') {
      // The same message in several forms: the plain text if there is some, else the first form that says anything.
      const plain = texts.find((entry) => entry.type === 'text/plain' && entry.text.trim() !== '')
      return (plain ?? texts.find((entry) => entry.text.trim() !== ''))?.text ?? ''
    }
    return texts
      .map((entry) => entry.text)
      .filter((text) => text.trim() !== '')
      .join('\n\n')
  }
  if (type !== 'text/plain' && type !== 'text/html') return ''
  const body = isObject(part.body) ? part.body : {}
  if (body.data === undefined && typeof body.attachmentId === 'string') {
    flags.cut = true // a body Gmail did not inline: it is not read (nothing is fetched in this step)
    return ''
  }
  const raw = decodeData(part, headers, limits, budget)
  return type === 'text/html' ? htmlToText(raw) : raw
}

// ----------------------------------------------------------------------------------------------------------- attachments

function safeFilename(value: unknown): string {
  if (typeof value !== 'string') return ''
  // Only the name: a path in it is dropped, so it can never point anywhere when it is shown or used later.
  const last = value.split(/[\\/]/).pop() ?? ''
  return cleanHeader(decodeWords(last), 255).replace(/[<>:"|?*]/g, '_').slice(0, 255)
}

function collectAttachments(part: Part, depth: number, limits: MimeLimits, out: ParsedAttachment[], counter: { parts: number }): void {
  if (depth > limits.maxDepth) throw new MimeError('malformed')
  counter.parts += 1
  if (counter.parts > limits.maxParts) throw new MimeError('too_large')
  const headers = headersOf(part)
  const type = mediaType(part, headers)
  const children = Array.isArray(part.parts) ? (part.parts as unknown[]) : []
  const named = typeof part.filename === 'string' && part.filename.trim() !== ''
  // A container is walked; a named part (a forwarded message with a file name, say) is one attachment, not a container.
  if (type.startsWith('multipart/') || (children.length > 0 && !named)) {
    for (const child of children) if (isObject(child)) collectAttachments(child, depth + 1, limits, out, counter)
    return
  }
  const body = isObject(part.body) ? part.body : {}
  const disposition = headers.get('content-disposition') ?? ''
  const textBody = (type === 'text/plain' || type === 'text/html') && !named && !/^\s*attachment\b/i.test(disposition)
  if (textBody) return
  // A part that is not the message's own text: a file, or something embedded in it (an inline picture).
  if (!named && !/^\s*(attachment|inline)\b/i.test(disposition) && !headers.has('content-id') && typeof body.attachmentId !== 'string') return
  if (out.length >= limits.maxAttachments) return
  const size = typeof body.size === 'number' && Number.isFinite(body.size) && body.size >= 0 ? Math.floor(body.size) : 0
  out.push({ partId: typeof part.partId === 'string' && /^[0-9.]{1,32}$/.test(part.partId) ? part.partId : '', filename: safeFilename(part.filename), mimeType: type, size, inline: /^\s*inline\b/i.test(disposition) || (!named && headers.has('content-id')) })
}

// ---------------------------------------------------------------------------------------------------------------- parse

const clamp = (value: string, max: number): string => {
  if (value.length <= max) return value
  const cut = value.slice(0, max)
  // Never leave half of a surrogate pair at the end.
  return /[\ud800-\udbff]$/.test(cut) ? cut.slice(0, -1) : cut
}

function isoDate(value: string | undefined): string | null {
  if (!value) return null
  const time = Date.parse(cleanHeader(value, 200))
  return Number.isFinite(time) && time > Date.UTC(1990, 0, 1) && time < Date.UTC(2200, 0, 1) ? new Date(time).toISOString() : null
}

const messageIds = (value: string | undefined, max: number): string[] => [...(value ?? '').slice(0, 16384).matchAll(MESSAGE_ID)].map((match) => match[0]).slice(0, max)

/** Reads one message from the Gmail API. Throws `MimeError` for anything that is malformed or over a limit; never returns half a message. */
export function parseGmailMessage(raw: unknown, limits: MimeLimits = MIME_LIMITS): ParsedMessage {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.threadId !== 'string' || !ID.test(raw.id) || !ID.test(raw.threadId) || !isObject(raw.payload)) throw new MimeError('malformed')
  const internal = typeof raw.internalDate === 'string' && /^\d{1,15}$/.test(raw.internalDate) ? Number(raw.internalDate) : NaN
  if (!Number.isFinite(internal) || internal < Date.UTC(1990, 0, 1) || internal > Date.UTC(2200, 0, 1)) throw new MimeError('malformed')
  const payload = raw.payload as Part
  const headers = headersOf(payload)

  const budget: Budget = { parts: 0, bytes: 0 }
  const flags = { cut: false }
  const text = tidy(textOf(payload, 0, limits, budget, flags))
  const body = clamp(text, limits.bodyChars)
  const attachments: ParsedAttachment[] = []
  collectAttachments(payload, 0, limits, attachments, { parts: 0 })

  const from = parseAddresses(headers.get('from'), 1)[0] ?? null
  const recipients: ParsedRecipient[] = [
    ...parseAddresses(headers.get('to'), limits.maxAddresses).map((address) => ({ ...address, type: 'to' as const })),
    ...parseAddresses(headers.get('cc'), limits.maxAddresses).map((address) => ({ ...address, type: 'cc' as const })),
  ].slice(0, limits.maxAddresses)
  const labels = Array.isArray(raw.labelIds) ? (raw.labelIds as unknown[]).filter((label): label is string => typeof label === 'string' && LABEL.test(label)).slice(0, 50) : []

  return {
    gmailMessageId: raw.id,
    gmailThreadId: raw.threadId,
    rfcMessageId: messageIds(headers.get('message-id'), 1)[0] ?? null,
    labels,
    from,
    recipients,
    subject: headerText(headers.get('subject'), 500),
    bodyText: body,
    bodyTruncated: flags.cut || body.length < text.length,
    receivedAt: new Date(internal).toISOString(),
    sentAt: isoDate(headers.get('date')),
    inReplyTo: messageIds(headers.get('in-reply-to'), 1)[0] ?? null,
    references: messageIds(headers.get('references'), 50),
    attachments,
  }
}
