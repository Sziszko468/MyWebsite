import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, configureApi, del, get, onSessionEnded, patch, post, queryString, setCsrfToken } from './client'

interface Call {
  url: string
  init: RequestInit
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

let calls: Call[]
let answer: () => Response | Promise<Response>

beforeEach(() => {
  calls = []
  answer = () => json(200, { data: null })
  configureApi({
    fetch: async (url, init = {}) => {
      calls.push({ url, init })
      return answer()
    },
  })
  setCsrfToken(null)
})

afterEach(() => {
  onSessionEnded(() => undefined)()
})

describe('queryString', () => {
  it('drops empty values and writes true as 1', () => {
    expect(queryString({ q: 'anna', status: '', page: 2, archived: true, kind: null, from: undefined, dir: false })).toBe('?q=anna&page=2&archived=1')
  })

  it('is empty when there is nothing to ask', () => {
    expect(queryString(undefined)).toBe('')
    expect(queryString({ q: '' })).toBe('')
  })

  it('encodes what is typed', () => {
    expect(queryString({ q: 'a&b=c d' })).toBe('?q=a%26b%3Dc+d')
  })
})

describe('what a request carries', () => {
  it('a read has no body, no CSRF header and no content type, but always the session cookie and no caching', async () => {
    setCsrfToken('token-1')
    await get('/api/admin/inquiries', { query: { page: 2 } })
    const [call] = calls
    expect(call.url).toBe('/api/admin/inquiries?page=2')
    expect(call.init.method).toBe('GET')
    expect(call.init.body).toBeUndefined()
    expect(call.init.credentials).toBe('same-origin')
    expect(call.init.cache).toBe('no-store')
    const headers = call.init.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBeUndefined()
    expect(headers['Content-Type']).toBeUndefined()
    expect(headers.Accept).toBe('application/json')
  })

  it.each([
    ['POST', (body: unknown) => post('/x', body)],
    ['PATCH', (body: unknown) => patch('/x', body)],
  ])('a %s carries the CSRF token and a JSON body', async (method, send) => {
    setCsrfToken('token-2')
    await send({ status: 'new' })
    const [call] = calls
    const headers = call.init.headers as Record<string, string>
    expect(call.init.method).toBe(method)
    expect(headers['X-CSRF-Token']).toBe('token-2')
    expect(headers['Content-Type']).toBe('application/json')
    expect(call.init.body).toBe('{"status":"new"}')
  })

  it('a DELETE carries the CSRF token and no body', async () => {
    setCsrfToken('token-3')
    answer = () => new Response(null, { status: 204 })
    await expect(del('/api/admin/inquiries/1')).resolves.toEqual({ data: undefined })
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['X-CSRF-Token']).toBe('token-3')
    expect(calls[0].init.body).toBeUndefined()
  })

  it('never sends the token to read, and never sends one it does not have', async () => {
    await post('/x', {})
    expect((calls[0].init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined()
  })
})

describe('what an answer becomes', () => {
  it('data and meta come out of the envelope', async () => {
    answer = () => json(200, { data: { id: 1 }, meta: { total: 7 } })
    await expect(get('/x')).resolves.toEqual({ data: { id: 1 }, meta: { total: 7 } })
  })

  it('an error envelope becomes an ApiError with its code, fields and request id', async () => {
    answer = () => json(422, { error: { code: 'validation_failed', message: 'Nope', requestId: 'req-9', details: { fields: { 'translations.hu.title': 'required' } } } })
    const error = await get('/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 422, code: 'validation_failed', requestId: 'req-9', fields: { 'translations.hu.title': 'required' } })
  })

  it('an answer that is not the backend’s (a proxy page) is an ApiError, not a crash', async () => {
    answer = () => new Response('<html>Bad gateway</html>', { status: 502 })
    await expect(get('/x')).rejects.toMatchObject({ status: 502, code: 'unreadable' })
  })

  it('a success that is not the envelope is refused rather than guessed at', async () => {
    answer = () => json(200, { unexpected: true })
    await expect(get('/x')).rejects.toMatchObject({ code: 'unreadable' })
  })

  it('a dropped connection is a network error', async () => {
    configureApi({
      fetch: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await expect(get('/x')).rejects.toMatchObject({ status: 0, code: 'network' })
  })

  it('an aborted request is passed on as an abort, not reported as a failure', async () => {
    configureApi({
      fetch: async () => {
        throw new DOMException('aborted', 'AbortError')
      },
    })
    await expect(get('/x')).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('when the session ends', () => {
  it('a 401 tells the application once and forgets the CSRF token', async () => {
    const ended = vi.fn()
    onSessionEnded(ended)
    setCsrfToken('stale')
    answer = () => json(401, { error: { code: 'unauthorized', message: 'Sign in' } })
    await expect(get('/api/admin/dashboard')).rejects.toMatchObject({ status: 401 })
    expect(ended).toHaveBeenCalledTimes(1)
    answer = () => json(200, { data: null })
    await post('/x', {})
    const last = calls[calls.length - 1]
    expect((last.init.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined()
  })

  it('the sign-in itself may answer 401 (a wrong password) without ending anything', async () => {
    const ended = vi.fn()
    onSessionEnded(ended)
    answer = () => json(401, { error: { code: 'invalid_credentials', message: 'No' } })
    await expect(post('/api/admin/login', {}, { anonymous: true })).rejects.toMatchObject({ code: 'invalid_credentials' })
    expect(ended).not.toHaveBeenCalled()
  })

  it('other failures do not end the session', async () => {
    const ended = vi.fn()
    onSessionEnded(ended)
    answer = () => json(403, { error: { code: 'forbidden', message: 'No' } })
    await expect(get('/x')).rejects.toMatchObject({ status: 403 })
    answer = () => json(500, { error: { code: 'internal', message: 'Oops' } })
    await expect(get('/x')).rejects.toMatchObject({ status: 500 })
    expect(ended).not.toHaveBeenCalled()
  })
})
