import { createHmac, randomUUID } from 'node:crypto'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'

/**
 * A stand-in for the transactional provider's API, speaking the little of it the server uses (`POST /emails`,
 * `GET /domains`), on a real local port, so the real mailer makes real HTTP requests against it. Not the provider: what
 * it answers is what its documentation says the provider answers (the shapes were read from the documentation on
 * 2026-11-04), so a test with it proves our side of the conversation, not the provider's behaviour.
 */

export interface RecordedRequest {
  method: string
  path: string
  headers: IncomingHttpHeaders
  body: Record<string, unknown> | null
}

export interface Scripted {
  status: number
  body?: unknown
  headers?: Record<string, string>
  /** Never answer (to see the timeout path). */
  hang?: boolean
}

export interface MockResend {
  url: string
  requests: RecordedRequest[]
  /** Answers for the next `POST /emails` calls, in order; after them, a success. */
  script: Scripted[]
  /** What `GET /domains` answers. */
  domains: Scripted
  /** Runs when a send arrives, before it is answered (to make a webhook beat the answer). */
  onSend: ((body: Record<string, unknown>, id: string) => Promise<void>) | null
  sends(): RecordedRequest[]
  close(): Promise<void>
}

export async function mockResend(): Promise<MockResend> {
  const state: MockResend = {
    url: '',
    requests: [],
    script: [],
    domains: { status: 200, body: { object: 'list', has_more: false, data: [{ id: 'dom_1', name: 'site.test', status: 'verified' }] } },
    onSend: null,
    sends: () => state.requests.filter((request) => request.method === 'POST' && request.path === '/emails'),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
  const sockets = new Set<import('node:net').Socket>()
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      void (async () => {
        let body: Record<string, unknown> | null = null
        try {
          body = chunks.length > 0 ? (JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>) : null
        } catch {
          body = null
        }
        const path = (req.url ?? '').split('?')[0]
        state.requests.push({ method: req.method ?? 'GET', path, headers: req.headers, body })
        const reply = (scripted: Scripted) => {
          res.writeHead(scripted.status, { 'Content-Type': 'application/json', ...(scripted.headers ?? {}) })
          res.end(JSON.stringify(scripted.body ?? {}))
        }
        if (req.headers.authorization !== 'Bearer re_test_key_0123456789') return reply({ status: 401, body: { name: 'validation_error', message: 'API key is invalid', statusCode: 401 } })
        if (req.method === 'GET' && path === '/domains') return reply(state.domains)
        if (req.method === 'POST' && path === '/emails') {
          const next = state.script.shift()
          if (next?.hang) return
          if (next) return reply(next)
          const id = randomUUID()
          if (state.onSend && body) await state.onSend(body, id)
          return reply({ status: 200, body: { id } })
        }
        reply({ status: 404, body: { name: 'not_found', message: 'Route not found', statusCode: 404 } })
      })()
    })
  })
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  state.url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
  const close = state.close
  state.close = () => {
    for (const socket of sockets) socket.destroy()
    return close()
  }
  return state
}

/** The key the mock accepts, and the signing secret the tests configure (the secret's own bytes are arbitrary). */
export const API_KEY = 're_test_key_0123456789'
export const WEBHOOK_SECRET = `whsec_${Buffer.from('a-test-signing-key-0123456789abcd').toString('base64')}`

/** A webhook request as the provider's signer (Svix) would make it: the three headers and the raw body. */
export function signedEvent(event: Record<string, unknown> | string, options: { id?: string; at?: Date; secret?: string; tamper?: boolean } = {}): { headers: Record<string, string>; raw: string } {
  const raw = typeof event === 'string' ? event : JSON.stringify(event)
  const id = options.id ?? `msg_${randomUUID().replace(/-/g, '')}`
  const timestamp = Math.floor((options.at ?? new Date()).getTime() / 1000)
  const key = Buffer.from((options.secret ?? WEBHOOK_SECRET).slice('whsec_'.length), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64')
  return {
    headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${options.tamper ? Buffer.from(signature, 'base64').reverse().toString('base64') : signature}` },
    raw,
  }
}

/** The event the provider sends about a message (the shape is the documented one: `type`, `created_at`, `data`). */
export const eventFor = (type: string, messageId: string, extra: Record<string, unknown> = {}, delivery?: string) => ({
  type,
  created_at: '2026-11-03T10:00:05.000Z',
  data: { email_id: messageId, from: 'Site <notifications@site.test>', to: ['anna@example.com'], subject: 'x', created_at: '2026-11-03T10:00:00.000Z', ...(delivery ? { tags: { delivery } } : {}), ...extra },
})
