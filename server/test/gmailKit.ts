import { GMAIL_SCOPES } from '../src/modules/gmail/tokenService.ts'

/**
 * A stand-in for Google, for the Gmail tests: the token endpoint, `users.messages.list` (paginated, filtered by label and by `after:`)
 * and `users.messages.get`. It answers like Google does, from messages the test puts in `inbox`, and keeps every request it received.
 * No real account, address, credential or token is involved; every value here is made up.
 */

export const CLIENT_ID = 'gmail-sync-client-1234.apps.googleusercontent.com'
export const CLIENT_SECRET = 'GOCSPX-sync-test-client-secret-VALUE-1'
export const REFRESH_TOKEN = '1//0g-sync-test-refresh-token-VALUE-2'
export const ACCESS_TOKEN = 'ya29.sync-test-access-token-VALUE-3'
export const ACCOUNT = 'mailbox@site.test'
export const GMAIL_ENV = { GMAIL_CLIENT_ID: CLIENT_ID, GMAIL_CLIENT_SECRET: CLIENT_SECRET, GMAIL_REFRESH_TOKEN: REFRESH_TOKEN, GMAIL_ACCOUNT_EMAIL: ACCOUNT }
export const SECRETS = [CLIENT_SECRET, REFRESH_TOKEN, ACCESS_TOKEN]

export const b64 = (value: string | Uint8Array): string => Buffer.from(value).toString('base64url')

type Header = { name: string; value: string }

export interface RawPart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: Header[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: RawPart[]
}

/** A text part, as Gmail returns it: already decoded from its transfer encoding, base64url in `body.data`. */
export function textPart(text: string | Uint8Array, options: { type?: string; charset?: string; partId?: string } = {}): RawPart {
  const type = options.type ?? 'text/plain'
  return { partId: options.partId ?? '0', mimeType: type, filename: '', headers: [{ name: 'Content-Type', value: `${type}; charset="${options.charset ?? 'UTF-8'}"` }], body: { size: typeof text === 'string' ? Buffer.byteLength(text) : text.length, data: b64(text) } }
}

export function filePart(filename: string, mimeType: string, size: number, options: { partId?: string; inline?: boolean; contentId?: string } = {}): RawPart {
  const headers: Header[] = [{ name: 'Content-Type', value: `${mimeType}; name="${filename}"` }, { name: 'Content-Disposition', value: `${options.inline ? 'inline' : 'attachment'}; filename="${filename}"` }]
  if (options.contentId) headers.push({ name: 'Content-ID', value: `<${options.contentId}>` })
  return { partId: options.partId ?? '1', mimeType, filename, headers, body: { size, attachmentId: `ATTACHMENT-ID-OF-GOOGLE-${filename}` } }
}

export function multipart(type: string, parts: RawPart[], headers: Header[] = []): RawPart {
  return { partId: '', mimeType: type, filename: '', headers: [{ name: 'Content-Type', value: `${type}; boundary="b"` }, ...headers], body: { size: 0 }, parts }
}

export interface MessageOptions {
  id: string
  threadId?: string
  /** Milliseconds since the epoch, or a string; default: the order of creation. */
  internalDate?: number | string
  from?: string
  to?: string
  cc?: string
  subject?: string
  messageId?: string
  inReplyTo?: string
  references?: string
  date?: string
  labels?: string[]
  /** The whole payload; default: one text/plain part with `text`. */
  payload?: RawPart
  text?: string
  extraHeaders?: Header[]
}

let counter = 0

/** One message as `users.messages.get` returns it (format `full`). */
export function gmailMessage(options: MessageOptions): Record<string, unknown> {
  counter += 1
  const headers: Header[] = []
  const add = (name: string, value: string | undefined) => {
    if (value !== undefined) headers.push({ name, value })
  }
  add('From', options.from ?? 'Anna Kovács <anna@example.com>')
  add('To', options.to ?? `Site <${ACCOUNT}>`)
  add('Cc', options.cc)
  add('Subject', options.subject ?? `Subject ${options.id}`)
  add('Date', options.date ?? 'Mon, 02 Nov 2026 10:00:00 +0000')
  add('Message-ID', options.messageId ?? `<${options.id}@mail.example.com>`)
  add('In-Reply-To', options.inReplyTo)
  add('References', options.references)
  for (const header of options.extraHeaders ?? []) headers.push(header)
  const base = options.payload ?? textPart(options.text ?? `Hello, this is message ${options.id}.`)
  return {
    id: options.id,
    threadId: options.threadId ?? options.id,
    internalDate: String(options.internalDate ?? Date.parse('2026-11-03T09:00:00Z') + counter * 60_000),
    labelIds: options.labels ?? ['INBOX', 'UNREAD'],
    sizeEstimate: 1000,
    payload: { ...base, headers: [...headers, ...(base.headers ?? [])] },
  }
}

export interface GoogleRequest {
  kind: 'token' | 'list' | 'get'
  url: string
  /** The `Authorization` header, as sent. */
  authorization: string | null
  query: URLSearchParams
}

type Override = (request: GoogleRequest) => Response | Error | undefined | Promise<Response | Error | undefined>

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export class FakeGoogle {
  /** What the mailbox holds. The list returns the ones with the INBOX label (or the asked-for labels), newest first. */
  inbox: Record<string, unknown>[] = []
  readonly requests: GoogleRequest[] = []
  /** Answers a request instead of the normal behaviour; returns undefined to let the normal behaviour answer. */
  override: Override | undefined
  tokenScopes: string = GMAIL_SCOPES.join(' ')
  pageSize = 1000

  add(...messages: Record<string, unknown>[]): this {
    this.inbox.push(...messages)
    return this
  }

  count(kind: GoogleRequest["kind"]): number {
    return this.requests.filter((request) => request.kind === kind).length
  }

  /** The server's `fetch`. */
  readonly fetch = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input)
    const headers = new Headers(init?.headers)
    const kind: GoogleRequest["kind"] = url.hostname === 'oauth2.googleapis.com' ? 'token' : /\/messages$/.test(url.pathname) ? 'list' : 'get'
    const request: GoogleRequest = { kind, url: input, authorization: headers.get('authorization'), query: url.searchParams }
    this.requests.push(request)
    const forced = await this.override?.(request)
    if (forced instanceof Error) throw forced
    if (forced) return forced
    if (kind === 'token') return json(200, { access_token: ACCESS_TOKEN, expires_in: 3599, scope: this.tokenScopes, token_type: 'Bearer' })
    if (url.hostname !== 'gmail.googleapis.com') return json(404, {})
    if (kind === 'list') {
      const labels = url.searchParams.getAll('labelIds')
      const after = /after:(\d+)/.exec(url.searchParams.get('q') ?? '')
      const matching = this.inbox
        .filter((message) => labels.every((label) => (message.labelIds as string[]).includes(label)))
        .filter((message) => !after || Number(message.internalDate) >= Number(after[1]) * 1000)
        .sort((a, b) => Number(b.internalDate) - Number(a.internalDate))
      const offset = Number(/^p(\d+)$/.exec(url.searchParams.get('pageToken') ?? '')?.[1] ?? 0)
      const size = Math.min(this.pageSize, Number(url.searchParams.get('maxResults') ?? 100))
      const page = matching.slice(offset, offset + size)
      const next = offset + size < matching.length ? `p${offset + size}` : undefined
      return json(200, { ...(page.length > 0 ? { messages: page.map((message) => ({ id: message.id, threadId: message.threadId })) } : {}), ...(next ? { nextPageToken: next } : {}) })
    }
    const id = decodeURIComponent(url.pathname.split('/').pop() ?? '')
    const found = this.inbox.find((message) => message.id === id)
    return found ? json(200, found) : json(404, { error: { code: 404, message: 'Requested entity was not found.', errors: [{ reason: 'notFound' }] } })
  }
}
