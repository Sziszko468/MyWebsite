import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Database } from '../src/db/database.ts'
import { MIGRATIONS_DIRECTORY, migrate } from '../src/db/migrate.ts'
import { finish, recordLimitEvent, reserve, spent, sweepAbandoned, worstCase } from '../src/modules/ai/budget.ts'
import { classify } from '../src/modules/ai/gateway.ts'
import type { Knowledge } from '../src/modules/ai/knowledge.ts'
import { withConnectTimeout } from '../src/modules/ai/model.ts'
import { AI_PRICING, estimateCostUsd } from '../src/modules/ai/pricing.ts'
import { findSensitive } from '../src/modules/ai/sensitive.ts'
import { loadSettings } from '../src/modules/ai/settings.ts'
import { createConversation, createSession } from '../src/modules/ai/store.ts'
import { buildTools } from '../src/modules/ai/tools.ts'
import { checkToolOutput, TOOL_OUTPUT_MAX_CHARS } from '../src/modules/ai/toolGuard.ts'
import { setSetting } from '../src/modules/system/settings.ts'
import { parseSse, say, scriptedModel } from './aiMock.ts'
import { startServer, TestClock, type TestServer } from './helpers.ts'

/**
 * PROMPT 29: the production activation of CONTROL ROOM AI. What this file shows, without one request to the real provider: the assistant stays
 * switched off and says why when the key is missing or malformed, the key is in no response and no log, the operator's ceilings cannot be
 * passed by an administrator, every configuration change is audited, the global limit on answers at once, a request can be followed by its id,
 * an answer that is empty, cut off or invalid is told to the visitor, a shutdown settles what is running, a card number is not accepted,
 * what a tool returns is checked before the model sees it, and the cost is booked as reported, none or unknown, never invented.
 */

let server: TestServer | null = null
afterEach(async () => {
  await server?.close()
  server = null
})

const KEY = 'test-key-not-real-0123456789abcdef'
const as = (who: { cookie: string; csrf: string }) => ({ Cookie: who.cookie, 'X-CSRF-Token': who.csrf })

async function start(script: Parameters<typeof scriptedModel>[0] = [], env: Record<string, string> = {}) {
  const model = scriptedModel(script)
  server = await startServer({ env: { MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-ai-media-')), ...env }, aiModel: async () => model })
  return { s: server, model }
}
const newSession = async (s: TestServer) => ({ 'X-AI-Session': (await s.api('/api/ai/session', { body: {} })).json.data.token as string })
let counter = 0
const post = (s: TestServer, headers: Record<string, string>, text = 'hello', id = `conv-prod-${String(counter++).padStart(10, '0')}`, extra: Record<string, string> = {}) =>
  s.fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers, ...extra }, body: JSON.stringify({ conversationId: id, trigger: 'submit-user-message', language: 'en', text }) })
interface Row {
  status: string
  error_code: string | null
  actual_cost_usd: number | null
  reserved_cost_usd: number
  cost_state: string | null
  cost_source: string | null
  finish_reason: string | null
  correlation_id: string | null
  input_tokens: number | null
}
const rows = (s: TestServer) => s.db.all<Row>('SELECT * FROM ai_requests ORDER BY created_at, rowid')
const waitFor = async (condition: () => boolean, ms = 3000) => {
  const until = Date.now() + ms
  while (!condition()) {
    if (Date.now() > until) throw new Error('timed out waiting for the condition')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
const admin = async (s: TestServer) => as(await s.signIn('admin'))
const summary = async (s: TestServer) => (await s.api('/api/admin/ai', { headers: await admin(s) })).json.data

describe('without a usable key', () => {
  it('stays off, says so, never builds the provider and answers the visitor with a controlled "not available"', async () => {
    let built = 0
    server = await startServer({ env: { ANTHROPIC_API_KEY: '' }, aiActive: true, aiModel: async () => {
      built += 1
      return scriptedModel([])
    } })
    const s = server
    const config = (await s.api('/api/ai/config')).json.data
    expect(config.available).toBe(false)
    expect((await s.api('/api/ai/session', { body: {} })).status).toBe(503)
    // A session token that exists (made before the key was removed) gets the same answer, and nothing is requested from anyone.
    const created = createSession(s.db, s.clock, s.config.ai.sessionSecret, 'iphash')
    const refused = await post(s, { 'X-AI-Session': created.token })
    expect(refused.status).toBe(503)
    expect(((await refused.json()) as any).error.details.reason).toBe('unavailable')
    expect(built).toBe(0)
    expect(rows(s)).toHaveLength(0)
    const board = await summary(s)
    expect(board.apiKey).toBe('missing')
    expect(board.availability).toEqual({ available: false, reason: 'no_api_key' })
    expect(board.operations.provider.status).toBe('not_configured')
  })

  it('treats a malformed key as no key: the server still starts, the key is dropped and nowhere to be seen', async () => {
    const bad = 'not a key with spaces ZZZ-9876'
    const s = (server = await startServer({ env: { ANTHROPIC_API_KEY: bad }, aiActive: true, aiModel: async () => scriptedModel([]) }))
    expect(s.config.ai.apiKey).toBeNull()
    expect(s.config.ai.keyProblem).toBe('malformed')
    const board = await summary(s)
    expect(board.apiKey).toBe('malformed')
    expect(board.availability).toEqual({ available: false, reason: 'key_malformed' })
    expect((await s.api('/api/ai/config')).json.data.available).toBe(false)
    const system = (await s.api('/api/admin/system', { headers: await admin(s) })).json.data.config.assistant
    expect(system.apiKey).toBe('malformed')
    // The connection test does not call anyone with a key that cannot be one.
    const tested = await s.api('/api/admin/ai/connection-test', { method: 'POST', body: {}, headers: await admin(s) })
    expect(tested.json.data.result).toMatchObject({ ok: false, reason: 'no_api_key' })
    for (const text of [JSON.stringify(board), JSON.stringify(system), tested.text, s.logs.join('\n')]) expect(text).not.toContain('ZZZ-9876')
    // The switch cannot be turned on either (it was put on by the test set-up, so it is switched off first).
    const headers = await admin(s)
    expect((await s.api('/api/admin/ai/settings', { method: 'PUT', body: { enabled: false }, headers })).status).toBe(200)
    expect((await s.api('/api/admin/ai/settings', { method: 'PUT', body: { enabled: true }, headers })).status).toBe(409)
  })
})

describe('the key never leaves the server', () => {
  it('is in no public response, no administration response, no error, no health check and no log line', async () => {
    const { s } = await start([() => say('hi')].map((f) => f()))
    const headers = await newSession(s)
    const chat = await post(s, headers, 'tell me about the packages')
    await chat.text()
    const bodies: string[] = [
      (await s.api('/api/ai/config')).text,
      (await s.api('/api/health')).text,
      (await s.api('/api/ready')).text,
      (await s.api('/api/ai/conversations/nope-nope-nope-nope-0', { headers })).text,
      (await s.api('/api/admin/ai')).text,
      (await s.api('/api/ai/chat', { body: { model: 'claude-sonnet-5-5' }, headers })).text,
    ]
    const as_admin = await admin(s)
    bodies.push((await s.api('/api/admin/ai', { headers: as_admin })).text, (await s.api('/api/admin/ai/usage', { headers: as_admin })).text, (await s.api('/api/admin/system', { headers: as_admin })).text)
    for (const text of [...bodies, s.logs.join('\n')]) {
      expect(text).not.toContain(KEY)
      expect(text).not.toContain('0123456789abcdef')
    }
  })

  it('is not in the database: the settings, the verification record and the audit log hold only a keyed fingerprint', async () => {
    const { s } = await start()
    const as_admin = await admin(s)
    await s.api('/api/admin/ai/settings', { method: 'PUT', body: { dailyBudgetUsd: 2 }, headers: as_admin })
    const dump = JSON.stringify({ settings: s.db.all('SELECT * FROM settings'), audit: s.db.all('SELECT * FROM audit_log'), requests: s.db.all('SELECT * FROM ai_requests'), alerts: s.db.all('SELECT * FROM ai_alerts'), tests: s.db.all('SELECT * FROM ai_connection_tests') })
    expect(dump).not.toContain(KEY)
  })

  it('never offers the browser more than it needs: the public configuration has no limit, price, ceiling, model or key', async () => {
    const { s } = await start()
    const config = (await s.api('/api/ai/config')).json.data
    expect(Object.keys(config).sort()).toEqual(['available', 'discoveryEnabled', 'languages', 'maxInputChars', 'plannerEnabled', 'quoteEnabled', 'retentionDays', 'suggestions', 'unavailableReason', 'welcome'])
    const health = JSON.stringify([(await s.api('/api/health')).json, (await s.api('/api/ready')).json])
    expect(health).not.toMatch(/anthropic|haiku|assistant|apikey|model/i)
  })
})

describe('the operator\'s ceilings', () => {
  it('cannot be passed by an administrator: a value above one is refused, and a saved value above one is applied as the ceiling', async () => {
    const { s } = await start([], { AI_CEILING_DAILY_BUDGET: '2', AI_CEILING_CONCURRENT: '3', AI_MAX_CONCURRENT_REQUESTS: '2' })
    const headers = await admin(s)
    const put = (body: Record<string, unknown>) => s.api('/api/admin/ai/settings', { method: 'PUT', body, headers })
    const refused = await put({ dailyBudgetUsd: 3 })
    expect(refused.status).toBe(422)
    expect(refused.json.error.details.fields.dailyBudgetUsd).toBe('tooLong')
    expect((await put({ maxConcurrentRequests: 4 })).status).toBe(422)
    expect((await put({ dailyBudgetUsd: 2, maxConcurrentRequests: 3 })).status).toBe(200)
    // A value saved while the ceiling was higher (or hand-edited) is applied as the ceiling.
    setSetting(s.db, s.clock, 'ai.settings', JSON.stringify({ dailyBudgetUsd: 2.0, monthlyBudgetUsd: 4000, maxOutputTokens: 16000, enabled: true }), null)
    const settings = loadSettings(s.app.context)
    expect(settings.dailyBudgetUsd).toBe(2)
    expect(settings.monthlyBudgetUsd).toBe(s.config.ai.ceilings.monthlyBudgetUsd)
    expect(settings.maxOutputTokens).toBe(s.config.ai.ceilings.maxOutputTokens)
    // The administration shows the ceilings and its ranges stop at them.
    const board = await summary(s)
    expect(board.ceilings.find((c: { key: string }) => c.key === 'dailyBudgetUsd')).toMatchObject({ value: 2, variable: 'AI_CEILING_DAILY_BUDGET' })
    expect(board.ranges.dailyBudgetUsd[1]).toBe(2)
  })

  it('refuses a starting value above its own ceiling at start-up, naming the variable', async () => {
    await expect(startServer({ env: { AI_DAILY_BUDGET: '30' } })).rejects.toThrow(/AI_CEILING_DAILY_BUDGET/)
  })

  it('keeps the prices out of reach: the administration cannot send, save or read a price as a setting, and the list in code is what is used', async () => {
    const { s } = await start()
    const headers = await admin(s)
    for (const body of [{ priceInputPerMTok: 0 }, { priceOutputPerMTok: 0.0001 }, { pricesAsOf: '2030-01-01' }]) {
      const response = await s.api('/api/admin/ai/settings', { method: 'PUT', body, headers })
      expect(response.status, JSON.stringify(body)).toBe(422)
    }
    // An old or hand-edited row with a price of 0 is ignored: a budget cannot be switched off through the stored settings.
    setSetting(s.db, s.clock, 'ai.settings', JSON.stringify({ priceInputPerMTok: 0, priceOutputPerMTok: 0 }), null)
    const settings = loadSettings(s.app.context)
    expect(settings.priceInputPerMTok).toBe(AI_PRICING.inputPerMTok)
    expect(settings.priceOutputPerMTok).toBe(AI_PRICING.outputPerMTok)
    expect((await summary(s)).pricing).toMatchObject({ editable: false, inputPerMTok: 0.1, outputPerMTok: 0.5, longPromptInputPerMTok: 0.5, longPromptOutputPerMTok: 2.5, longPromptThresholdTokens: 100_000, source: expect.stringContaining('platform.claude.com') })
  })

  it('prices a prompt over 100 000 tokens at the provider\'s long-prompt rate, never below the configured price', () => {
    const prices = { priceInputPerMTok: AI_PRICING.inputPerMTok, priceOutputPerMTok: AI_PRICING.outputPerMTok }
    expect(estimateCostUsd(100_000, 10_000, prices)).toBeCloseTo(0.015, 9)
    expect(estimateCostUsd(100_001, 10_000, prices)).toBeCloseTo((100_001 * 0.5 + 10_000 * 2.5) / 1_000_000, 9)
    // An operator who sets a price above the long rate is never undercut by it.
    expect(estimateCostUsd(200_000, 0, { priceInputPerMTok: 2, priceOutputPerMTok: 0 })).toBeCloseTo(0.4, 9)
  })
})

describe('the configuration is audited', () => {
  it('records who changed which setting from what to what, and names (never copies) a changed text', async () => {
    const { s } = await start()
    const headers = await admin(s)
    const response = await s.api('/api/admin/ai/settings', { method: 'PUT', body: { dailyBudgetUsd: 2, maxToolCalls: 3, welcome: { en: 'A private welcome text nobody else should see in the log' } }, headers })
    expect(response.status).toBe(200)
    const entry = s.db.get<{ actor_id: number | null; detail: string }>("SELECT actor_id, detail FROM audit_log WHERE action = 'ai.settings.update'")!
    expect(entry.actor_id).not.toBeNull()
    const detail = JSON.parse(entry.detail) as Record<string, string>
    expect(detail.dailyBudgetUsd).toBe('1 → 2')
    expect(detail.maxToolCalls).toBe('6 → 3')
    expect(detail.welcome).toBe('changed')
    expect(entry.detail).not.toContain('private welcome')
    // A save that changes nothing is not an entry.
    await s.api('/api/admin/ai/settings', { method: 'PUT', body: { dailyBudgetUsd: 2 }, headers })
    expect(s.db.all("SELECT 1 FROM audit_log WHERE action = 'ai.settings.update'")).toHaveLength(1)
    // And the screen shows the history.
    const history = (await summary(s)).operations.history
    expect(history[0]).toMatchObject({ action: 'ai.settings.update' })
  })
})

describe('the administration\'s endpoints', () => {
  it('refuse a visitor, a request without the CSRF token and a request from another site', async () => {
    const { s } = await start()
    const who = await s.signIn('admin')
    const calls: Array<[string, string, Record<string, unknown> | undefined]> = [
      ['GET', '/api/admin/ai', undefined],
      ['GET', '/api/admin/ai/usage', undefined],
      ['PUT', '/api/admin/ai/settings', { dailyBudgetUsd: 2 }],
      ['POST', '/api/admin/ai/connection-test', {}],
      ['POST', '/api/admin/ai/alerts/acknowledge', {}],
      ['POST', '/api/admin/ai/knowledge/refresh', {}],
    ]
    for (const [method, path, body] of calls) {
      expect((await s.api(path, { method, body })).status, `${method} ${path} without a session`).toBe(401)
      if (method === 'GET') continue
      expect((await s.api(path, { method, body, headers: { Cookie: who.cookie } })).status, `${method} ${path} without the CSRF token`).toBe(403)
      expect((await s.api(path, { method, body, headers: { ...as(who), Origin: 'https://evil.test' } })).status, `${method} ${path} from another site`).toBe(403)
    }
    expect(s.db.all("SELECT 1 FROM audit_log WHERE action LIKE 'ai.%'")).toHaveLength(0)
  })

  it('show operations and never a conversation: no text, no title, no visitor, no conversation id', async () => {
    const { s } = await start([() => say('A reply about wombats.')].map((f) => f()))
    const headers = await newSession(s)
    await (await post(s, headers, 'a very distinctive question about wombats and tax')).text()
    await waitFor(() => rows(s)[0]?.status === 'completed')
    const as_admin = await admin(s)
    const board = await s.api('/api/admin/ai', { headers: as_admin })
    const usage = await s.api('/api/admin/ai/usage?range=weekly', { headers: as_admin })
    for (const text of [board.text, usage.text]) {
      expect(text).not.toMatch(/wombat/i)
      expect(text).not.toContain('conv-prod-')
    }
    const conversationIds = s.db.all<{ id: string }>('SELECT id FROM ai_conversations').map((row) => row.id)
    const sessionIds = s.db.all<{ id: string }>('SELECT id FROM ai_sessions').map((row) => row.id)
    for (const id of [...conversationIds, ...sessionIds]) expect(board.text).not.toContain(id)
    expect(board.json.data.operations.lastSuccessfulRequest).toMatchObject({ modelVerified: true })
    expect(board.json.data.operations.today).toMatchObject({ requests: 1, completed: 1, failed: 0 })
  })
})

describe('the global limit on answers at once', () => {
  it('refuses the next answer at once (no queue) while the limit is reached, counts the refusal, and accepts again when one finishes', async () => {
    let open: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (open = resolve))
    const { s } = await start((n) => (n === 0 ? say('first', { input: 400, output: 60 }, { gate }) : say('second')), { AI_MAX_CONCURRENT_REQUESTS: '1' })
    const first = await post(s, await newSession(s), 'one')
    expect(first.status).toBe(200)
    await waitFor(() => s.app.context.assistant.inFlight === 1)
    const refused = await post(s, await newSession(s), 'two')
    expect(refused.status).toBe(503)
    expect(refused.headers.get('retry-after')).toBe('5')
    expect(((await refused.json()) as any).error.details.reason).toBe('capacity')
    expect(rows(s)).toHaveLength(1)
    expect(s.db.get<{ count: number }>("SELECT count FROM ai_limit_events WHERE kind = 'concurrent_global'")?.count).toBe(1)
    expect((await summary(s)).live).toMatchObject({ inFlight: 1, maxConcurrent: 1 })
    open()
    await first.text()
    await waitFor(() => s.app.context.assistant.inFlight === 0)
    expect((await post(s, await newSession(s), 'three')).status).toBe(200)
    const events = (await summary(s)).operations.limitEvents
    expect(events).toContainEqual(expect.objectContaining({ kind: 'concurrent_global', today: 1 }))
  })

  it('holds when many requests arrive in the same instant: of six sent at once to a limit of two, exactly two are accepted', async () => {
    let open: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (open = resolve))
    const { s } = await start(() => say('answer', { input: 400, output: 60 }, { gate }), { AI_MAX_CONCURRENT_REQUESTS: '2', AI_CEILING_CONCURRENT: '5' })
    const sessions = await Promise.all(Array.from({ length: 6 }, () => newSession(s)))
    const responses = await Promise.all(sessions.map((headers, index) => post(s, headers, `question ${index}`)))
    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 503, 503, 503, 503])
    expect(rows(s)).toHaveLength(2)
    expect(s.app.context.assistant.inFlight).toBe(2)
    open()
    await Promise.all(responses.filter((response) => response.status === 200).map((response) => response.text()))
    await waitFor(() => s.app.context.assistant.inFlight === 0)
    expect(s.db.get<{ count: number }>("SELECT count FROM ai_limit_events WHERE kind = 'concurrent_global'")?.count).toBe(4)
  })

  it('counts every other refusal too: a busy conversation, an address over its limit, a session over its limit, a budget', async () => {
    let open: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (open = resolve))
    const { s } = await start((n) => (n === 0 ? say('slow', { input: 400, output: 60 }, { gate }) : say('ok')), { AI_MAX_REQUESTS_PER_SESSION: '2', AI_MAX_REQUESTS_PER_IP: '6', RATE_LIMITS: 'true' })
    const headers = await newSession(s)
    const first = await post(s, headers, 'one', 'conv-busy-0123456789')
    await waitFor(() => s.app.context.assistant.inFlight === 1)
    expect((await post(s, headers, 'again', 'conv-busy-0123456789')).status).toBe(409)
    open()
    await first.text()
    await waitFor(() => s.app.context.assistant.inFlight === 0)
    expect((await post(s, headers, 'two')).status).toBe(200)
    expect((await post(s, headers, 'three')).status).toBe(429)
    const kinds = s.db.all<{ kind: string }>('SELECT kind FROM ai_limit_events').map((row) => row.kind)
    expect(kinds).toEqual(expect.arrayContaining(['conversation_busy', 'session_requests']))
    recordLimitEvent(s.app.context, 'ip_rate')
    expect(s.db.get<{ count: number }>("SELECT count FROM ai_limit_events WHERE kind = 'ip_rate'")?.count).toBe(1)
  })
})

describe('following one request', () => {
  it('stores the request id the visitor was given with the usage row and puts it on one safe log line, and never logs the question', async () => {
    const { s } = await start([() => say('Fine.', { input: 321, output: 12 })].map((f) => f()))
    const headers = await newSession(s)
    const response = await post(s, headers, 'a very distinctive question about wombats', undefined, { 'X-Request-Id': 'req-correlation-0001' })
    expect(response.headers.get('x-request-id')).toBe('req-correlation-0001')
    await response.text()
    await waitFor(() => rows(s)[0]?.status === 'completed')
    expect(rows(s)[0].correlation_id).toBe('req-correlation-0001')
    const lines = s.logs.map((line) => JSON.parse(line) as Record<string, unknown>)
    const line = lines.find((entry) => entry.msg === 'assistant request finished')!
    expect(line).toMatchObject({ requestId: 'req-correlation-0001', requestRef: 'req-correlation-0001', status: 'completed', finish: 'stop', inTok: 321, outTok: 12, modelVerified: true })
    expect(s.logs.join('\n')).not.toMatch(/wombat/i)
    expect(s.logs.join('\n')).not.toContain(KEY)
  })
})

describe('following one request (the id a real client gets)', () => {
  it('keeps the generated request id readable in the log, so one request can be searched for, and still masks a secret that is put in the same field', async () => {
    const { s } = await start([() => say('Fine.')].map((f) => f()))
    const response = await post(s, await newSession(s), 'hello')
    const given = response.headers.get('x-request-id')!
    expect(given).toMatch(/^[0-9a-f-]{36}$/)
    await response.text()
    await waitFor(() => rows(s)[0]?.status === 'completed')
    expect(rows(s)[0].correlation_id).toBe(given)
    const lines = s.logs.map((line) => JSON.parse(line) as Record<string, unknown>)
    const finished = lines.find((entry) => entry.msg === 'assistant request finished')!
    expect(finished.requestId).toBe(given)
    expect(finished.requestRef).toBe(given)
    expect(finished.aiRequest).toMatch(/^[0-9a-f-]{36}$/)
    // The same id is on the HTTP line, so the visitor's report, the access log and the usage row all agree.
    expect(lines.some((entry) => entry.msg === 'request' && entry.requestId === given && entry.route === '/api/ai/chat')).toBe(true)
    // A client may choose its own id; one that contains the key is masked, not logged.
    const own = await post(s, await newSession(s), 'hello again', undefined, { 'X-Request-Id': `id-${KEY}`.slice(0, 64) })
    await own.text()
    expect(s.logs.join('\n')).not.toContain(KEY)
  })
})

describe('what the provider returns', () => {
  const errorOf = (text: string) => parseSse(text).find((chunk) => chunk.type === 'error')?.errorText

  it('tells the visitor when an answer reached the output limit, keeps it, and records why the model stopped', async () => {
    const { s } = await start([() => say('A long answer that was cut off', { input: 400, output: 1500 }, { finishReason: 'length' })].map((f) => f()))
    const headers = await newSession(s)
    const text = await (await post(s, headers, 'write a lot', 'conv-length-012345678')).text()
    expect(errorOf(text)).toBeUndefined()
    expect(text).toContain('"finishReason":"length"')
    await waitFor(() => rows(s)[0]?.status === 'completed')
    expect(rows(s)[0]).toMatchObject({ status: 'completed', finish_reason: 'length', cost_state: 'reported' })
    const stored = (await s.api('/api/ai/conversations/conv-length-012345678', { headers })).json.data
    expect(stored.messages.at(-1).metadata).toEqual({ finishReason: 'length' })
    expect((await summary(s)).operations.today.truncated).toBe(1)
  })

  it('does not present an empty answer as a success: it is a failure of this request, told in a code, and the question is kept for a retry', async () => {
    const { s } = await start([() => say('', { input: 400, output: 5 })].map((f) => f()))
    const headers = await newSession(s)
    const text = await (await post(s, headers, 'hello?', 'conv-empty-0123456789')).text()
    expect(errorOf(text)).toBe('provider_invalid_response')
    await waitFor(() => rows(s)[0]?.status !== 'reserved')
    expect(rows(s)[0]).toMatchObject({ status: 'failed', error_code: 'provider_invalid_response' })
    const stored = (await s.api('/api/ai/conversations/conv-empty-0123456789', { headers })).json.data
    expect(stored.messages.map((message: { role: string }) => message.role)).toEqual(['user'])
    expect((await summary(s)).operations.provider.lastError).toMatchObject({ code: 'provider_invalid_response' })
  })

  it('says "output limit" when the limit was reached before a word came out', async () => {
    const { s } = await start([() => say('', { input: 400, output: 1500 }, { finishReason: 'length' })].map((f) => f()))
    const text = await (await post(s, await newSession(s), 'hello?')).text()
    expect(errorOf(text)).toBe('output_limit')
    await waitFor(() => rows(s)[0]?.status !== 'reserved')
    expect(rows(s)[0]).toMatchObject({ status: 'failed', error_code: 'output_limit', finish_reason: 'length' })
  })

  it('maps an unusable provider reply (a body that is not the API\'s, an empty one) to one code, without quoting it', async () => {
    const { s } = await start(() => {
      throw Object.assign(new Error('Invalid JSON response: {secret provider text}'), { name: 'AI_InvalidResponseDataError' })
    })
    const text = await (await post(s, await newSession(s), 'hello?')).text()
    expect(errorOf(text)).toBe('provider_invalid_response')
    expect(text).not.toMatch(/secret provider text|Invalid JSON/)
    await waitFor(() => rows(s)[0]?.status !== 'reserved')
    expect(rows(s)[0]).toMatchObject({ status: 'failed', error_code: 'provider_invalid_response', cost_state: 'none', actual_cost_usd: 0 })
  })

  it('classifies every failure the brief names to a code the interface has words for', () => {
    const named = (name: string, status?: number) => Object.assign(new Error('secret'), { name, ...(status ? { statusCode: status } : {}) })
    expect(classify(named('AI_APICallError', 401))).toBe('provider_auth')
    expect(classify(named('AI_APICallError', 429))).toBe('provider_rate_limit')
    expect(classify(named('AI_APICallError', 529))).toBe('provider_unavailable')
    expect(classify(named('AI_APICallError', 503))).toBe('provider_unavailable')
    expect(classify(named('AI_APICallError'))).toBe('provider_unavailable')
    expect(classify(named('TimeoutError'))).toBe('timeout')
    expect(classify(named('AbortError'))).toBe('timeout')
    expect(classify(named('AI_JSONParseError'))).toBe('provider_invalid_response')
    expect(classify(named('AI_NoOutputGeneratedError'))).toBe('provider_invalid_response')
    expect(classify(named('AI_RetryError'))).toBe('provider_unavailable')
    expect(classify(new Error('something else'))).toBe('assistant_error')
  })

  it('answers a provider that cannot be reached over the real provider package with a controlled code, no cost and no other model', async () => {
    // Nothing listens on port 1: the real @ai-sdk/anthropic provider fails to connect.
    server = await startServer({ env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:1/v1', MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-ai-media-')) }, aiActive: true })
    const s = server
    const text = await (await post(s, await newSession(s), 'hello?')).text()
    expect(errorOf(text)).toBe('provider_unavailable')
    expect(text).not.toMatch(/ECONNREFUSED|127\.0\.0\.1/)
    await waitFor(() => rows(s)[0]?.status !== 'reserved', 8000)
    expect(rows(s)[0]).toMatchObject({ status: 'failed', error_code: 'provider_unavailable', cost_state: 'none', actual_cost_usd: 0, input_tokens: null })
    expect(s.logs.join('\n')).not.toMatch(/ECONNREFUSED/)
  })
})

describe('the connection timeout', () => {
  const never: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })

  it('cuts off a provider that does not start answering, as a TimeoutError', async () => {
    await expect(withConnectTimeout(never, 30)('http://provider.test/v1/messages', {})).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('does not touch a provider that answers in time, and lets the visitor\'s own abort through', async () => {
    const fast: typeof fetch = async () => new Response('ok')
    expect(await (await withConnectTimeout(fast, 30)('http://provider.test/')).text()).toBe('ok')
    const controller = new AbortController()
    const pending = withConnectTimeout(never, 5000)('http://provider.test/', { signal: controller.signal })
    controller.abort(new DOMException('gone', 'AbortError'))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('shutting down', () => {
  it('stops taking questions, cancels what is still running when the time is up, and books it: nothing stays reserved', async () => {
    const gate = new Promise<void>(() => undefined)
    const { s } = await start((n) => (n === 0 ? say('never finished', { input: 400, output: 60 }, { gate }) : say('ok')))
    const response = await post(s, await newSession(s), 'one', 'conv-shutdown-012345')
    await waitFor(() => s.app.context.assistant.inFlight === 1)
    const stopping = s.app.context.assistant.shutdown(30)
    // From this moment nothing new is accepted.
    const refused = await post(s, await newSession(s), 'two')
    expect(refused.status).toBe(503)
    await stopping
    expect(s.app.context.assistant.inFlight).toBe(0)
    await waitFor(() => rows(s)[0]?.status !== 'reserved')
    expect(rows(s)[0]).toMatchObject({ status: 'aborted', error_code: 'shutdown', cost_state: 'unknown' })
    // What it cost is not known, so the budget keeps counting what was reserved for it.
    expect(rows(s)[0].actual_cost_usd).toBe(rows(s)[0].reserved_cost_usd)
    expect(parseSse(await response.text()).find((chunk) => chunk.type === 'error')?.errorText).toBe('unavailable')
    expect(s.db.get<{ count: number }>("SELECT count FROM ai_limit_events WHERE kind = 'shutting_down'")?.count).toBe(1)
  })
})

describe('what must not be sent', () => {
  it('refuses a payment card number and a secret key before they are stored or sent, and counts the refusal', async () => {
    const { s, model } = await start([() => say('ok')].map((f) => f()))
    const headers = await newSession(s)
    for (const text of ['my card is 4242 4242 4242 4242 please', 'use sk-ant-api03-abcdefghijklmnopqrstuv for it', 'token: Bearer abcdefghijklmnopqrstuvwxyz0123456789']) {
      const response = await post(s, headers, text, 'conv-card-0123456789')
      expect(response.status, text).toBe(422)
      const body = (await response.json()) as any
      expect(body.error.details.reason).toBe('sensitive_data')
      expect(JSON.stringify(body)).not.toContain('4242')
    }
    expect(model.doStreamCalls).toHaveLength(0)
    expect(s.db.all('SELECT 1 FROM ai_conversations')).toHaveLength(0)
    expect(s.db.all('SELECT 1 FROM ai_messages')).toHaveLength(0)
    expect(rows(s)).toHaveLength(0)
    expect(s.db.get<{ count: number }>("SELECT count FROM ai_limit_events WHERE kind = 'sensitive_input'")?.count).toBe(3)
    // An ordinary long number is not a card, and the question goes through.
    expect((await post(s, headers, 'my order number is 1234 5678 9012 3456', 'conv-card-0123456789')).status).toBe(200)
  })

  it('recognises a card by its check digit and a credential by its shape, and nothing else', () => {
    expect(findSensitive('4111-1111-1111-1111')).toBe('payment_card')
    expect(findSensitive('5500 0000 0000 0004')).toBe('payment_card')
    expect(findSensitive('1234 5678 9012 3456')).toBeNull()
    expect(findSensitive('call me on +36 30 123 4567')).toBeNull()
    expect(findSensitive('my email is someone@example.com')).toBeNull()
    expect(findSensitive('a project of 2024 and 2025')).toBeNull()
    expect(findSensitive('-----BEGIN RSA PRIVATE KEY-----')).toBe('secret')
    expect(findSensitive('AKIAABCDEFGHIJKLMNOP')).toBe('secret')
    expect(findSensitive('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U')).toBe('secret')
  })
})

describe('what a tool hands back', () => {
  it('is checked before the model sees it: too large, a secret-looking key and a credential in the text are not passed on', () => {
    expect(checkToolOutput({ title: 'A project', technologies: ['React'], note: 'fine' })).toBeNull()
    expect(checkToolOutput({ text: 'x'.repeat(TOOL_OUTPUT_MAX_CHARS + 1) })).toBe('too_large')
    expect(checkToolOutput({ projects: [{ title: 'A', passwordHash: 'x' }] })).toBe('forbidden_key')
    expect(checkToolOutput({ internal_note: 'private' })).toBe('forbidden_key')
    expect(checkToolOutput({ customerEmail: 'a@b.c' })).toBe('forbidden_key')
    expect(checkToolOutput({ text: 'the key is sk-ant-api03-abcdefghijklmnopqrstuv' })).toBe('credential')
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    expect(checkToolOutput(cycle)).toBe('not_serializable')
  })

  async function run(name: string, knowledge: Partial<Knowledge>) {
    const { s } = await start()
    const app = s.app.context
    const created = createSession(app.db, app.clock, app.config.ai.sessionSecret, 'iphash')
    createConversation(app.db, app.clock, created.id, 'conv-guard-0123456789', 'en')
    const tools = await buildTools({ app, knowledge: knowledge as Knowledge, settings: loadSettings(app), conversationId: 'conv-guard-0123456789', sessionId: created.id, language: 'en', ipHash: 'iphash', requestId: 'req-1', counter: { calls: 0 } })
    const tool = (tools as unknown as Record<string, { execute: (input: unknown, options: unknown) => Promise<any> }>)[name]
    return { s, result: await tool.execute({}, { toolCallId: 'call-1', messages: [] }) }
  }

  it('tells the model the lookup failed, and records a rejected call, when a result carries something that must not leave', async () => {
    const { s, result } = await run('getDeveloperProfile', { developerProfile: () => ({ story: 'fine', apiKey: 'x', session_id: 'y' }) as never })
    expect(result).toMatchObject({ error: 'tool_output_rejected' })
    expect(JSON.stringify(result)).not.toContain('"apiKey"')
    expect(s.db.get<{ status: string }>("SELECT status FROM ai_tool_calls WHERE tool = 'getDeveloperProfile'")?.status).toBe('rejected')
    expect(s.logs.join('\n')).toContain('assistant tool result rejected')
  })

  it('passes a normal result untouched', async () => {
    const { result } = await run('getDeveloperProfile', { developerProfile: () => ({ story: 'A developer.', technologies: ['React', 'Node.js'] }) as never })
    expect(result).toEqual({ story: 'A developer.', technologies: ['React', 'Node.js'] })
  })
})

describe('private data stays out of reach of the model', () => {
  const dir = join(import.meta.dirname, '..', 'src', 'modules', 'ai')
  const tablesIn = (file: string) => [...readFileSync(join(dir, file), 'utf8').matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_]+)/g)].map((match) => match[1])

  it('reads only published content and its own records: the files the model\'s tools run through name no customer, booking, message or account table', () => {
    const published = new Set(['services', 'packages', 'extras', 'site_content', 'projects', 'shop_documents', 'settings'])
    for (const file of ['knowledge.ts', 'tools.ts', 'plan.ts', 'prompt.ts', 'toolGuard.ts']) {
      for (const table of tablesIn(file)) expect(published.has(table), `${file} reads ${table}`).toBe(true)
    }
    // The visitor's own records are reached through store.ts only, by session, and every query there names the conversation or the session.
    const store = readFileSync(join(dir, 'store.ts'), 'utf8')
    for (const table of tablesIn('store.ts')) expect(table.startsWith('ai_'), `store.ts touches ${table}`).toBe(true)
    expect(store).toMatch(/WHERE id = \? AND session_id = \?/)
  })

  it('has no tool that takes a model, an address, a query, a key or a file name, and exactly the tools of the brief (the eight of PROMPT 16 with the free-form planner, the discovery set with project discovery)', async () => {
    const { s } = await start([], { AI_DISCOVERY_ENABLED: 'false' })
    const app = s.app.context
    const created = createSession(app.db, app.clock, app.config.ai.sessionSecret, 'iphash')
    createConversation(app.db, app.clock, created.id, 'conv-names-0123456789', 'en')
    const tools = (await buildTools({ app, knowledge: app.assistant.knowledge, settings: loadSettings(app), conversationId: 'conv-names-0123456789', sessionId: created.id, language: 'en', ipHash: 'iphash', requestId: 'req-1', counter: { calls: 0 } })) as Record<string, unknown>
    expect(Object.keys(tools).sort()).toEqual(['comparePackages', 'createProjectPlan', 'getDeveloperProfile', 'getFullExperienceDetails', 'getProjectDetails', 'getPublishedServices', 'searchPortfolioProjects', 'submitApprovedQuoteRequest'])
    const schemas = JSON.stringify(tools, (key, value) => (key === 'execute' ? undefined : value))
    expect(schemas).not.toMatch(/"(model|apiKey|url|path|file|filename|sql|email|address|customerId|conversationId|sessionId)"\s*:\s*\{/)
  })
})

describe('the cost is booked as reported, none or unknown, and never invented', () => {
  const reservationFor = (s: TestServer, id: string) => {
    const app = s.app.context
    const session = createSession(app.db, app.clock, app.config.ai.sessionSecret, 'iphash')
    createConversation(app.db, app.clock, session.id, id, 'en')
    return reserve(app, loadSettings(app), { conversationId: id, sessionId: session.id, ipHash: 'iphash', model: 'claude-haiku-5-5', promptTokens: 1000, newConversation: false })
  }
  const outcome = { steps: 1, toolCalls: 0, latencyMs: 10, firstTokenMs: null, errorCode: null }

  it('reports the provider\'s token counts as reported, a provider that never answered as none (nothing), and a request that ended without usage as unknown (counted at the reservation)', async () => {
    const { s } = await start()
    const app = s.app.context
    const settings = loadSettings(app)
    const a = reservationFor(s, 'conv-cost-a-0123456789')
    finish(app, settings, a, { ...outcome, status: 'completed', usage: { inputTokens: 1000, outputTokens: 200 }, firstTokenMs: 5 })
    const b = reservationFor(s, 'conv-cost-b-0123456789')
    finish(app, settings, b, { ...outcome, status: 'failed', usage: null, errorCode: 'provider_unavailable' })
    const c = reservationFor(s, 'conv-cost-c-0123456789')
    finish(app, settings, c, { ...outcome, status: 'aborted', usage: null, errorCode: 'aborted' })
    const d = reservationFor(s, 'conv-cost-d-0123456789')
    // A stream that broke after output had started: the provider may have billed it and told us nothing.
    finish(app, settings, d, { ...outcome, status: 'failed', usage: null, errorCode: 'provider_error', firstTokenMs: 40 })
    const e = reservationFor(s, 'conv-cost-e-0123456789')
    s.clock.advance(30 * 60_000)
    expect(sweepAbandoned(app)).toBe(1)

    const byId = (id: string) => s.db.get<Row & { input_tokens: number | null; output_tokens: number | null }>('SELECT * FROM ai_requests WHERE id = ?', [id])!
    expect(byId(a.id)).toMatchObject({ cost_state: 'reported', cost_source: 'provider_usage', input_tokens: 1000, output_tokens: 200 })
    expect(byId(a.id).actual_cost_usd).toBeCloseTo((1000 * 0.1 + 200 * 0.5) / 1_000_000, 12)
    expect(byId(b.id)).toMatchObject({ cost_state: 'none', actual_cost_usd: 0, input_tokens: null, output_tokens: null })
    for (const unknown of [c, d, e]) {
      const row = byId(unknown.id)
      expect(row.cost_state, unknown.id).toBe('unknown')
      expect(row.actual_cost_usd ?? row.reserved_cost_usd).toBe(row.reserved_cost_usd)
      // No token count is invented for it.
      expect(row.input_tokens).toBeNull()
    }
    // The budget counts the unknown ones at their reservation and the failed-before-anything one at nothing.
    const used = spent(app, s.clock.now())
    expect(used.dayCostUsd).toBeCloseTo(byId(a.id).actual_cost_usd! + 3 * a.reservedCostUsd, 9)

    // The administration says the same, in three buckets.
    s.clock.advance(-30 * 60_000)
    const board = await summary(s)
    expect(board.operations.today.costAccounting).toMatchObject({ reported: 1, none: 1, unknown: 3 })
    expect(board.operations.today.costAccounting.unknownCostUsd).toBeCloseTo(3 * a.reservedCostUsd, 9)
    expect(board.operations.today.inputTokens).toBe(1000)
  })

  it('derives the same three states for a row written before the column existed', async () => {
    const { s } = await start()
    const insert = (id: string, status: string, source: string | null, cost: number) =>
      s.db.run(`INSERT INTO ai_requests (id, ip_hash, model, status, reserved_cost_usd, actual_cost_usd, cost_source, day, created_at) VALUES (?, 'h', 'claude-haiku-5-5', ?, 0.01, ?, ?, ?, ?)`, [id, status, cost, source, s.clock.now().toISOString().slice(0, 10), s.clock.now().toISOString()])
    insert('legacy-1', 'completed', 'provider_usage', 0.002)
    insert('legacy-2', 'failed', 'estimate', 0)
    insert('legacy-3', 'aborted', 'estimate', 0.01)
    expect((await summary(s)).operations.today.costAccounting).toMatchObject({ reported: 1, none: 1, unknown: 1 })
  })

  it('prices the reservation of a very long prompt at the long-prompt rate, so a budget is never under-reserved', async () => {
    const { s } = await start()
    const settings = loadSettings(s.app.context)
    const short = worstCase({ ...settings, maxToolCalls: 1 }, 1000)
    const long = worstCase({ ...settings, maxToolCalls: 1 }, 150_000)
    expect(long.costUsd).toBeGreaterThan(((150_000 + 1500) * 0.5) / 1_000_000)
    expect(short.costUsd).toBeCloseTo(0.001, 9)
  })
})

describe('the upgrade to migration 0016', () => {
  const folders: string[] = []
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })

  it('keeps every usage row exactly as it was, adds the new columns empty, and creates nothing for anybody', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc-mig-ai-'))
    folders.push(directory)
    for (const name of readdirSync(MIGRATIONS_DIRECTORY).filter((file) => file < '0016')) copyFileSync(join(MIGRATIONS_DIRECTORY, name), join(directory, name))
    const clock = new TestClock()
    const db = new Database(':memory:')
    migrate(db, clock, directory)
    const now = '2026-11-01T10:00:00.000Z'
    db.run("INSERT INTO ai_requests (id, ip_hash, model, status, reserved_cost_usd, actual_cost_usd, cost_source, input_tokens, output_tokens, day, created_at) VALUES ('old-1', 'h', 'claude-haiku-5-5', 'completed', 0.01, 0.002, 'provider_usage', 400, 60, '2026-11-01', ?)", [now])
    db.run("INSERT INTO ai_requests (id, ip_hash, model, status, reserved_cost_usd, cost_source, day, created_at) VALUES ('old-2', 'h', 'claude-haiku-5-5', 'abandoned', 0.01, 'estimate', '2026-11-01', ?)", [now])
    expect(migrate(db, clock).filter((version) => version === 16)).toEqual([16])
    expect(db.all('SELECT id, status, actual_cost_usd, cost_source, input_tokens, correlation_id, finish_reason, cost_state FROM ai_requests ORDER BY id')).toEqual([
      { id: 'old-1', status: 'completed', actual_cost_usd: 0.002, cost_source: 'provider_usage', input_tokens: 400, correlation_id: null, finish_reason: null, cost_state: null },
      { id: 'old-2', status: 'abandoned', actual_cost_usd: null, cost_source: 'estimate', input_tokens: null, correlation_id: null, finish_reason: null, cost_state: null },
    ])
    expect(db.all('SELECT * FROM ai_limit_events')).toEqual([])
    // The new column refuses a state that is not one of the three.
    expect(() => db.run("UPDATE ai_requests SET cost_state = 'guess' WHERE id = 'old-1'")).toThrow()
    db.close()
  })
})

describe('another site', () => {
  it('cannot make a visitor\'s browser use the assistant: an unsafe request from an origin the site does not allow is refused before anything happens', async () => {
    const { s, model } = await start([() => say('ok')].map((f) => f()))
    const headers = await newSession(s)
    const foreign = { Origin: 'https://evil.test' }
    const chat = await post(s, headers, 'hello', 'conv-origin-012345678', foreign)
    expect(chat.status).toBe(403)
    expect(((await chat.json()) as any).error.code).toBe('origin_not_allowed')
    expect((await s.api('/api/ai/session', { body: {}, headers: foreign })).status).toBe(403)
    expect(model.doStreamCalls).toHaveLength(0)
    expect(rows(s)).toHaveLength(0)
    // The site's own origin (an allowed one) is served.
    expect((await post(s, headers, 'hello', 'conv-origin-012345678', { Origin: 'https://site.test' })).status).toBe(200)
  })
})
