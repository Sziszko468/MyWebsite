import { describe, expect, it } from 'vitest'
import { GMAIL_API, GmailApiError, createGmailApiClient, type GmailApiErrorCategory } from '../src/modules/gmail/api.ts'
import { GmailAuthError, type GmailTokenService } from '../src/modules/gmail/tokenService.ts'
import { ACCESS_TOKEN, CLIENT_SECRET, FakeGoogle, REFRESH_TOKEN, gmailMessage } from './gmailKit.ts'

/** The Gmail API client: the two calls it makes, how it pages, and that every failure becomes a category and nothing Google said. */

type Tokens = Pick<GmailTokenService, 'getAccessToken' | 'invalidate'>

function setup(options: { tokens?: string[]; fetch?: (input: string, init?: RequestInit) => Promise<Response>; timeoutMs?: number; maxResponseBytes?: number } = {}) {
  const google = new FakeGoogle()
  const issued = [...(options.tokens ?? [ACCESS_TOKEN])]
  let invalidated = 0
  const tokens: Tokens = {
    getAccessToken: async () => issued[Math.min(invalidated, issued.length - 1)],
    invalidate: () => {
      invalidated += 1
    },
  }
  const client = createGmailApiClient(tokens, { fetch: options.fetch ?? google.fetch, timeoutMs: options.timeoutMs, maxResponseBytes: options.maxResponseBytes })
  return { google, client, invalidated: () => invalidated }
}

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

async function categoryOf(promise: Promise<unknown>): Promise<{ category: GmailApiErrorCategory; httpStatus: number | null; error: GmailApiError }> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(GmailApiError)
  const failure = error as GmailApiError
  return { category: failure.category, httpStatus: failure.httpStatus, error: failure }
}

describe('listing messages (users.messages.list)', () => {
  it('asks the API for a page of ids with the access token, the label and the search, and nothing it does not need', async () => {
    const { google, client } = setup()
    google.add(gmailMessage({ id: 'aaa' }), gmailMessage({ id: 'bbb' }))
    const page = await client.listMessages({ labelIds: ['INBOX'], query: 'after:1700000000', maxResults: 50 })
    expect(page.messages.map((entry) => entry.id).sort()).toEqual(['aaa', 'bbb'])
    expect(page.nextPageToken).toBeNull()
    const [request] = google.requests
    expect(request.kind).toBe('list')
    expect(request.url.startsWith(`${GMAIL_API}/messages?`)).toBe(true)
    expect(request.authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
    expect(Object.fromEntries(request.query)).toEqual({ maxResults: '50', fields: 'messages(id,threadId),nextPageToken', labelIds: 'INBOX', q: 'after:1700000000' })
  })

  it('sends the request without following redirects and with a time limit', async () => {
    let seen: RequestInit | undefined
    const { client } = setup({
      fetch: async (_input, init) => {
        seen = init
        return reply(200, {})
      },
    })
    await client.listMessages()
    expect(seen?.redirect).toBe('error')
    expect(seen?.signal).toBeInstanceOf(AbortSignal)
    expect(seen?.method).toBe('GET')
  })

  it('follows the pages: each answer says where the next begins, and the last says nothing', async () => {
    const { google, client } = setup()
    google.pageSize = 2
    google.add(...['m1', 'm2', 'm3', 'm4', 'm5'].map((id, index) => gmailMessage({ id, internalDate: 1_800_000_000_000 - index })))
    const seen: string[] = []
    let token: string | undefined
    let pages = 0
    do {
      const page = await client.listMessages({ labelIds: ['INBOX'], maxResults: 2, pageToken: token })
      seen.push(...page.messages.map((entry) => entry.id))
      token = page.nextPageToken ?? undefined
      pages += 1
    } while (token)
    expect(seen).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
    expect(pages).toBe(3)
    expect(google.requests[1].query.get('pageToken')).toBe('p2')
  })

  it('answers an empty mailbox with an empty page', async () => {
    const { client } = setup()
    expect(await client.listMessages({ labelIds: ['INBOX'] })).toEqual({ messages: [], nextPageToken: null })
  })

  it('keeps the page size within what the API allows, and refuses a label or a page token that is not one', async () => {
    const { google, client } = setup()
    await client.listMessages({ maxResults: 100_000 })
    await client.listMessages({ maxResults: 0 })
    expect(google.requests.map((request) => request.query.get('maxResults'))).toEqual(['500', '1'])
    await expect(client.listMessages({ labelIds: ['INBOX&q=anything'] })).rejects.toThrow(TypeError)
    expect((await categoryOf(client.listMessages({ pageToken: 'x'.repeat(5000) }))).category).toBe('invalid_response')
    expect((await categoryOf(client.listMessages({ pageToken: 'a b&c' }))).category).toBe('invalid_response')
    expect(google.requests).toHaveLength(2)
  })

  it.each([
    ['messages that is not a list', { messages: 'nope' }],
    ['an entry without an id', { messages: [{ threadId: 'abc' }] }],
    ['an id that is a path', { messages: [{ id: '../../x', threadId: 'abc' }] }],
    ['a next page token that is not a token', { messages: [], nextPageToken: 'has spaces & symbols' }],
    ['a list that is not an object', ['x']],
  ])('refuses an answer with %s', async (_name, body) => {
    const { client } = setup({ fetch: async () => reply(200, body) })
    expect((await categoryOf(client.listMessages())).category).toBe('invalid_response')
  })
})

describe('reading one message (users.messages.get)', () => {
  it('asks for the full message with the access token and gives the answer as it is, to be parsed elsewhere', async () => {
    const { google, client } = setup()
    const message = gmailMessage({ id: 'abc123def' })
    google.add(message)
    expect(await client.getMessage('abc123def')).toEqual(message)
    const [request] = google.requests
    expect(request.kind).toBe('get')
    expect(new URL(request.url).pathname).toBe('/gmail/v1/users/me/messages/abc123def')
    expect(request.query.get('format')).toBe('full')
    expect(request.authorization).toBe(`Bearer ${ACCESS_TOKEN}`)
  })

  it('never puts anything but a Gmail id in the address', async () => {
    const { google, client } = setup()
    for (const id of ['../../etc/passwd', 'a/b', 'a?format=raw', '', 'x'.repeat(65), 'a b']) expect((await categoryOf(client.getMessage(id))).category, id).toBe('invalid_response')
    expect(google.requests).toHaveLength(0)
  })

  it('says "not found" for a message that has been deleted since it was listed', async () => {
    const { client } = setup()
    expect(await categoryOf(client.getMessage('gone123'))).toMatchObject({ category: 'not_found', httpStatus: 404 })
  })
})

describe('when the API says no', () => {
  it('tries a new access token once after a 401, and invalidates the old one', async () => {
    const attempts: (string | null)[] = []
    const { client, invalidated } = setup({
      tokens: ['ya29.old-token', 'ya29.new-token'],
      fetch: async (_input, init) => {
        const authorization = new Headers(init?.headers).get('authorization')
        attempts.push(authorization)
        return authorization === 'Bearer ya29.new-token' ? reply(200, { messages: [] }) : reply(401, { error: { message: 'Invalid Credentials' } })
      },
    })
    expect(await client.listMessages()).toEqual({ messages: [], nextPageToken: null })
    expect(attempts).toEqual(['Bearer ya29.old-token', 'Bearer ya29.new-token'])
    expect(invalidated()).toBe(1)
  })

  it('gives up after a second 401 with "unauthorized", and does not ask a third time', async () => {
    let calls = 0
    const { client } = setup({
      tokens: ['ya29.a', 'ya29.b'],
      fetch: async () => {
        calls += 1
        return reply(401, {})
      },
    })
    expect(await categoryOf(client.listMessages())).toMatchObject({ category: 'api_unauthorized', httpStatus: 401 })
    expect(calls).toBe(2)
  })

  it.each([
    [403, { error: { errors: [{ reason: 'rateLimitExceeded' }] } }, 'rate_limited'],
    [403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }, 'rate_limited'],
    [403, { error: { errors: [{ reason: 'accessNotConfigured' }] } }, 'api_forbidden'],
    [403, '<html>Forbidden</html>', 'api_forbidden'],
    [404, { error: { errors: [{ reason: 'notFound' }] } }, 'not_found'],
    [429, { error: { message: 'Too Many Requests' } }, 'rate_limited'],
    [500, { error: { message: 'Backend Error' } }, 'provider_unavailable'],
    [503, '<html>Unavailable</html>', 'provider_unavailable'],
    [400, { error: { message: 'Invalid request' } }, 'invalid_response'],
  ] as [number, unknown, GmailApiErrorCategory][])('maps HTTP %i to the category %s', async (status, body, expected) => {
    const { client } = setup({ fetch: async () => reply(status, body) })
    expect(await categoryOf(client.getMessage('abc123'))).toMatchObject({ category: expected, httpStatus: status })
  })

  it('maps a network failure and a time-out to "network"', async () => {
    const down = setup({
      fetch: async () => {
        throw new Error('connect ECONNREFUSED')
      },
    })
    expect((await categoryOf(down.client.listMessages())).category).toBe('network')
    const slow = setup({
      timeoutMs: 25,
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          signal?.addEventListener('abort', () => reject(signal.reason))
        }),
    })
    expect((await categoryOf(slow.client.listMessages())).category).toBe('network')
  })

  it('refuses an answer that is not JSON', async () => {
    const { client } = setup({ fetch: async () => reply(200, '<html>not json</html>') })
    expect((await categoryOf(client.getMessage('abc123'))).category).toBe('invalid_response')
  })

  it('lets an expired or revoked credential through as the token service describes it, without asking Gmail', async () => {
    let calls = 0
    const client = createGmailApiClient(
      {
        getAccessToken: async () => {
          throw new GmailAuthError('invalid_grant', 400)
        },
        invalidate: () => undefined,
      },
      {
        fetch: async () => {
          calls += 1
          return reply(200, {})
        },
      },
    )
    const error = await client.listMessages().then(() => null, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(GmailAuthError)
    expect((error as GmailAuthError).category).toBe('invalid_grant')
    expect(calls).toBe(0)
  })
})

describe('what is too big', () => {
  it('refuses an answer that declares itself too big, without reading it', async () => {
    const { client } = setup({ maxResponseBytes: 1000, fetch: async () => reply(200, 'x'.repeat(10), { 'content-length': '5000' }) })
    expect((await categoryOf(client.getMessage('abc123'))).category).toBe('too_large')
  })

  it('stops reading an answer that is too big and says nothing about it', async () => {
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(new TextEncoder().encode('SECRET-BODY-TEXT '.repeat(100)))
        if (pulled > 10_000) controller.close()
      },
    })
    const { client } = setup({ maxResponseBytes: 10_000, fetch: async () => new Response(stream, { status: 200 }) })
    const failure = await categoryOf(client.getMessage('abc123'))
    expect(failure.category).toBe('too_large')
    expect(pulled, 'it did not read on and on').toBeLessThan(100)
    expect(failure.error.message + String(failure.error.stack)).not.toContain('SECRET-BODY-TEXT')
  })
})

describe('what a failure never carries', () => {
  it('has no credential, no token and no text from Google or from the network in the error', async () => {
    const hostile = `internal error handling ${REFRESH_TOKEN} for ${CLIENT_SECRET} with ${ACCESS_TOKEN}`
    for (const fetch of [async () => reply(500, { error: { message: hostile } }), async () => reply(403, { error: { message: hostile, errors: [{ reason: 'forbidden' }] } }), async () => reply(200, hostile), async () => { throw new Error(hostile) }]) {
      const { client } = setup({ fetch })
      const { error } = await categoryOf(client.getMessage('abc123'))
      const everything = [error.message, error.stack ?? '', String(error), JSON.stringify(error)].join('\n')
      for (const secret of [REFRESH_TOKEN, CLIENT_SECRET, ACCESS_TOKEN, 'internal error']) expect(everything, secret).not.toContain(secret)
      expect(error.cause).toBeUndefined()
    }
  })
})
