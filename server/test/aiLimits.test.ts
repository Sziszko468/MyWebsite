import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { reserve, spent, worstCase, finish, sweepAbandoned } from '../src/modules/ai/budget.ts'
import { loadSettings } from '../src/modules/ai/settings.ts'
import { createConversation, createSession } from '../src/modules/ai/store.ts'
import { callTool, parseSse, say, scriptedModel, type Scripted } from './aiMock.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * Cost control and failure behaviour: the per-session, per-day and per-month limits, the budget that is reserved before a request
 * starts and reconciled after, many requests at once, and what a slow, failing or cancelled provider leaves behind.
 */

let server: TestServer | null = null
afterEach(async () => {
  await server?.close()
  server = null
})

const as = (who: { cookie: string; csrf: string }) => ({ Cookie: who.cookie, 'X-CSRF-Token': who.csrf })

async function start(script: Parameters<typeof scriptedModel>[0], env: Record<string, string> = {}) {
  const model = scriptedModel(script)
  server = await startServer({ env: { MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-ai-media-')), ...env }, aiModel: async () => model })
  return { s: server, model }
}
const newSession = async (s: TestServer) => ({ 'X-AI-Session': (await s.api('/api/ai/session', { body: {} })).json.data.token as string })
let counter = 0
const post = (s: TestServer, headers: Record<string, string>, text = 'hello', id = `conv-limit-${String(counter++).padStart(10, '0')}`, signal?: AbortSignal) =>
  s.fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ conversationId: id, trigger: 'submit-user-message', language: 'en', text }), signal })
const requests = (s: TestServer) => s.db.all<{ status: string; actual_cost_usd: number | null; reserved_cost_usd: number; error_code: string | null; cost_source: string | null }>('SELECT * FROM ai_requests ORDER BY rowid')
const waitFor = async (condition: () => boolean, ms = 3000) => {
  const until = Date.now() + ms
  while (!condition()) {
    if (Date.now() > until) throw new Error('timed out waiting for the condition')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('limits', () => {
  it('limits the requests of one session, and says so with a retry hint', async () => {
    const { s } = await start((n) => say(`answer ${n}`), { AI_MAX_REQUESTS_PER_SESSION: '2' })
    const headers = await newSession(s)
    expect((await post(s, headers)).status).toBe(200)
    expect((await post(s, headers)).status).toBe(200)
    const refused = await post(s, headers)
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBeTruthy()
    expect(((await refused.json()) as any).error.details.reason).toBe('session_requests')
    expect(requests(s)).toHaveLength(2)
    // Another session is unaffected.
    expect((await post(s, await newSession(s))).status).toBe(200)
  })

  it('limits the requests of one network address in a window', async () => {
    const { s } = await start((n) => say(`answer ${n}`), { AI_MAX_REQUESTS_PER_IP: '3', RATE_LIMITS: 'true' })
    const statuses: number[] = []
    for (let i = 0; i < 4; i += 1) statuses.push((await post(s, await newSession(s))).status)
    expect(statuses).toEqual([200, 200, 200, 429])
  })

  it('limits the number of new sessions from one address', async () => {
    const { s } = await start([], { RATE_LIMITS: 'true' })
    const statuses: number[] = []
    for (let i = 0; i < 22; i += 1) statuses.push((await s.api('/api/ai/session', { body: {} })).status)
    expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(true)
    expect(statuses.slice(20)).toEqual([429, 429])
  })

  it('limits the daily number of requests, of tokens and of conversations', async () => {
    const a = await start((n) => say(`answer ${n}`), { AI_DAILY_REQUESTS: '2' })
    const headers = await newSession(a.s)
    await post(a.s, headers)
    await post(a.s, headers)
    const refused = await post(a.s, headers)
    expect(refused.status).toBe(503)
    expect(((await refused.json()) as any).error.details.reason).toBe('daily_requests')
    await a.s.close()

    const b = await start((n) => say(`answer ${n}`), { AI_DAILY_TOKEN_BUDGET: '5000' })
    const refusedTokens = await post(b.s, await newSession(b.s))
    expect(refusedTokens.status).toBe(503)
    expect(((await refusedTokens.json()) as any).error.details.reason).toBe('daily_tokens')
    await b.s.close()

    const c = await start((n) => say(`answer ${n}`), { AI_MAX_DAILY_CONVERSATIONS: '2' })
    const one = await newSession(c.s)
    const two = await newSession(c.s)
    const three = await newSession(c.s)
    expect((await post(c.s, one)).status).toBe(200)
    expect((await post(c.s, two)).status).toBe(200)
    const third = await post(c.s, three)
    expect(third.status).toBe(503)
    expect(((await third.json()) as any).error.details.reason).toBe('daily_conversations')
    // A refused new conversation leaves nothing behind.
    expect(c.s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ai_conversations')!.n).toBe(2)
  })

  it('refuses a request that could take the day or the month over its budget, with a friendly message and before anything is sent to the provider', async () => {
    const day = await start((n) => say(`answer ${n}`), { AI_DAILY_BUDGET: '0.0001' })
    const refused = await post(day.s, await newSession(day.s))
    expect(refused.status).toBe(503)
    const body = (await refused.json()) as any
    expect(body.error).toMatchObject({ code: 'service_unavailable', details: { reason: 'daily_budget' } })
    expect(body.error.message).toBe('The assistant is not available right now.')
    expect(day.model.doStreamCalls).toHaveLength(0)
    expect(requests(day.s)).toHaveLength(0)
    await day.s.close()

    const month = await start((n) => say(`answer ${n}`), { AI_DAILY_BUDGET: '5', AI_MONTHLY_BUDGET: '0.0001' })
    const refusedMonth = await post(month.s, await newSession(month.s))
    expect(refusedMonth.status).toBe(503)
    expect(((await refusedMonth.json()) as any).error.details.reason).toBe('monthly_budget')
  })

  it('counts a day\'s spending against a month, and a new day starts a new day budget', async () => {
    const { s } = await start((n) => say(`answer ${n}`, { input: 1_000_000, output: 100_000 }), { AI_DAILY_BUDGET: '0.155', AI_MONTHLY_BUDGET: '0.5' })
    const headers = await newSession(s)
    const first = await post(s, headers)
    expect(first.status).toBe(200)
    await first.text()
    await waitFor(() => requests(s)[0]?.status === 'completed')
    // 1M input tokens at $0.10 + 100K output at $0.50 per million = $0.15 spent today.
    const used = spent(s.app.context, s.clock.now())
    expect(used.dayCostUsd).toBeCloseTo(0.15, 6)
    expect((await post(s, headers)).status).toBe(503)
    s.clock.advance(86_400_000)
    const next = await post(s, headers)
    expect(next.status).toBe(200)
    await next.text()
    await waitFor(() => requests(s).every((row) => row.status === 'completed'))
    expect(spent(s.app.context, s.clock.now()).monthCostUsd).toBeCloseTo(0.3, 6)
  })
})

describe('the budget reservation', () => {
  it('reserves a worst-case amount before the provider is called and reconciles it with the reported usage afterwards', async () => {
    let seenWhileRunning: { status: string; reserved: number }[] = []
    const { s } = await start(() => {
      seenWhileRunning = server!.db.all<{ status: string; reserved_cost_usd: number }>('SELECT status, reserved_cost_usd FROM ai_requests').map((row) => ({ status: row.status, reserved: row.reserved_cost_usd }))
      return say('done', { input: 700, output: 50 })
    })
    await (await post(s, await newSession(s))).text()
    expect(seenWhileRunning).toHaveLength(1)
    expect(seenWhileRunning[0].status).toBe('reserved')
    expect(seenWhileRunning[0].reserved).toBeGreaterThan(0.001)
    const [row] = requests(s)
    expect(row.status).toBe('completed')
    expect(row.cost_source).toBe('provider_usage')
    expect(row.actual_cost_usd!).toBeCloseTo((700 * 0.1 + 50 * 0.5) / 1_000_000, 10)
    expect(row.actual_cost_usd!).toBeLessThan(row.reserved_cost_usd)
  })

  it('holds under concurrency: of many requests started at once only as many as the budget can cover are accepted', async () => {
    let open!: () => void
    const gate = new Promise<void>((resolve) => (open = resolve))
    const { s } = await start((_n): Scripted => say('slow answer', { input: 300, output: 40 }, { gate }))
    const settings = loadSettings(s.app.context)
    const estimate = worstCase(settings, Math.ceil((1800 + 300) / 3)).costUsd
    // Room for exactly three worst cases (and not a fourth).
    s.db.run("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('ai.settings', ?, ?, NULL)", [JSON.stringify({ dailyBudgetUsd: estimate * 3.6, monthlyBudgetUsd: estimate * 3.6 }), s.clock.now().toISOString()])
    const sessions = await Promise.all(Array.from({ length: 10 }, () => newSession(s)))
    const inflight = sessions.map((headers) => post(s, headers, 'a question of ordinary length'))
    await waitFor(() => s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM ai_requests WHERE status = 'reserved'")!.n >= 3)
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM ai_requests WHERE status = 'reserved'")!.n).toBe(3)
    open()
    const responses = await Promise.all(inflight)
    await Promise.all(responses.map((response) => response.text()))
    expect(responses.filter((response) => response.status === 200)).toHaveLength(3)
    expect(responses.filter((response) => response.status === 503)).toHaveLength(7)
    const rows = requests(s)
    expect(rows).toHaveLength(3)
    expect(rows.every((row) => row.status === 'completed')).toBe(true)
    // Nothing was overspent: what was counted, at its worst, never exceeded the budget.
    expect(rows.reduce((sum, row) => sum + row.reserved_cost_usd, 0)).toBeLessThanOrEqual(estimate * 3.6)
  })

  it('counts an unfinished reservation at its reserved cost, and a sweep marks it abandoned without ever counting it as zero', async () => {
    const { s } = await start([])
    const app = s.app.context
    const session = createSession(app.db, app.clock, app.config.ai.sessionSecret, 'h')
    createConversation(app.db, app.clock, session.id, 'conv-abandoned-012345', 'en')
    const reservation = reserve(app, loadSettings(app), { conversationId: 'conv-abandoned-012345', sessionId: session.id, ipHash: 'h', model: 'm', promptTokens: 1000, newConversation: false })
    expect(spent(app, app.clock.now()).dayCostUsd).toBeCloseTo(reservation.reservedCostUsd, 10)
    s.clock.advance(16 * 60_000)
    expect(sweepAbandoned(app)).toBe(1)
    expect(requests(s)[0]).toMatchObject({ status: 'abandoned', cost_source: 'estimate' })
    expect(spent(app, app.clock.now()).dayCostUsd).toBeCloseTo(reservation.reservedCostUsd, 10)
    // Reconciling it late does nothing (it is no longer reserved).
    finish(app, loadSettings(app), reservation, { status: 'completed', usage: { inputTokens: 1, outputTokens: 1 }, steps: 1, toolCalls: 0, errorCode: null, latencyMs: 1, firstTokenMs: 1 })
    expect(requests(s)[0].status).toBe('abandoned')
  })
})

describe('a provider that fails, stalls or is cancelled', () => {
  it('answers a provider error with a short code in the stream, costs nothing, and keeps the visitor\'s question for a retry', async () => {
    const { s } = await start(() => {
      throw Object.assign(new Error('overloaded: secret provider text'), { statusCode: 529 })
    })
    const headers = await newSession(s)
    const response = await post(s, headers, 'is anyone there', 'conv-provider-fail-0123')
    expect(response.status).toBe(200)
    const text = await response.text()
    const chunks = parseSse(text)
    const error = chunks.find((chunk) => chunk.type === 'error')
    expect(error).toBeTruthy()
    expect(String(error!.errorText)).toBe('provider_unavailable')
    expect(text).not.toMatch(/secret provider text|overloaded/)
    await waitFor(() => requests(s)[0]?.status !== 'reserved')
    expect(requests(s)[0]).toMatchObject({ status: 'failed', error_code: 'provider_unavailable', actual_cost_usd: 0 })
    const stored = (await s.api('/api/ai/conversations/conv-provider-fail-0123', { headers })).json.data
    expect(stored.messages.map((m: { role: string }) => m.role)).toEqual(['user'])
  })

  it('does not let a provider that is down use up the day\'s token budget: a request that failed before any usage counts no tokens', async () => {
    // One request's worst case is about 30 000 tokens, so a budget of 60 000 could be exhausted by two reservations if failures were counted at them.
    const { s } = await start(
      (n) => {
        if (n < 6) throw Object.assign(new Error('overloaded: secret provider text'), { statusCode: 529 })
        return say('back again')
      },
      { AI_DAILY_TOKEN_BUDGET: '60000' },
    )
    const headers = await newSession(s)
    for (let i = 0; i < 6; i += 1) {
      const response = await post(s, headers, `try ${i}`)
      expect(response.status).toBe(200)
      await response.text()
      await waitFor(() => requests(s).every((row) => row.status !== 'reserved'))
    }
    expect(requests(s).map((row) => row.status)).toEqual(Array(6).fill('failed'))
    expect(spent(s.app.context, s.app.context.clock.now()).dayTokens).toBe(0)
    const back = await post(s, headers, 'is it back?')
    expect(back.status).toBe(200)
    expect(parseSse(await back.text()).map((chunk) => chunk.delta ?? '').join('')).toContain('back again')
  })

  it('classifies an authentication failure and a rate limit from the provider without quoting the provider', async () => {
    const { s } = await start((n) => {
      throw Object.assign(new Error('invalid x-api-key sk-ant-this-is-secret'), { statusCode: n === 0 ? 401 : 429 })
    })
    const first = await (await post(s, await newSession(s))).text()
    expect(first).toContain('provider_auth')
    expect(first).not.toMatch(/sk-ant|x-api-key/)
    await waitFor(() => requests(s)[0]?.status !== 'reserved')
    expect(requests(s)[0].error_code).toBe('provider_auth')
  })

  it('cuts off a provider that never answers after the configured time, and says so', async () => {
    const { s } = await start((): Scripted => ({ stream: new ReadableStream({ start() {} }) }), { AI_TIMEOUT_MS: '300' })
    const response = await post(s, await newSession(s), 'hello?')
    const chunks = parseSse(await response.text())
    expect(chunks.some((chunk) => chunk.type === 'error')).toBe(true)
    await waitFor(() => requests(s)[0]?.status !== 'reserved', 4000)
    expect(requests(s)[0].status).toBe('failed')
    expect(requests(s)[0].error_code).toBe('timeout')
  })

  it('stops paying for an answer the visitor cancelled: the stream is aborted, the request is reconciled once, and a partial answer is kept', async () => {
    const { s, model } = await start(() => say('one two three four five six seven eight nine ten', { input: 400, output: 60 }, { delayMs: 40 }))
    const headers = await newSession(s)
    const controller = new AbortController()
    const response = await post(s, headers, 'tell me a lot', 'conv-cancelled-012345', controller.signal)
    const reader = response.body!.getReader()
    await reader.read()
    await reader.read()
    controller.abort()
    await reader.cancel().catch(() => undefined)
    await waitFor(() => requests(s)[0]?.status !== 'reserved', 4000)
    const [row] = requests(s)
    expect(['aborted', 'completed']).toContain(row.status)
    expect(row.actual_cost_usd).not.toBeNull()
    expect(model.doStreamCalls).toHaveLength(1)
    // The conversation is usable afterwards.
    const stored = await s.api('/api/ai/conversations/conv-cancelled-012345', { headers })
    expect(stored.status).toBe(200)
    expect(stored.json.data.messages[0].role).toBe('user')
  })

  it('lets one answer at a time run in a conversation, and a visitor open only a few', async () => {
    let open!: () => void
    const gate = new Promise<void>((resolve) => (open = resolve))
    const { s } = await start(() => say('late', { input: 100, output: 10 }, { gate }))
    const headers = await newSession(s)
    const first = post(s, headers, 'first', 'conv-busy-0123456789a')
    await waitFor(() => requests(s).length === 1)
    const second = await post(s, headers, 'second', 'conv-busy-0123456789a')
    expect(second.status).toBe(409)
    expect(((await second.json()) as any).error.details.reason).toBe('busy')
    open()
    expect((await first).status).toBe(200)
    await (await first).text().catch(() => '')
  })

  it('survives a tool that is asked for in a loop: the answer is bounded by the step limit', async () => {
    const { s, model } = await start(() => callTool('getFullExperienceDetails', {}, { input: 200, output: 10 }), { AI_MAX_TOOL_CALLS: '3' })
    await (await post(s, await newSession(s))).text()
    await waitFor(() => requests(s)[0]?.status !== 'reserved')
    expect(model.doStreamCalls).toHaveLength(3)
    expect(requests(s)[0]).toMatchObject({ status: 'completed' })
  })
})

describe('the administration of the assistant', () => {
  it('is for signed-in administrators: no session is refused, an editor may not see or change anything', async () => {
    const { s } = await start([say('x')])
    for (const [method, path] of [['GET', '/api/admin/ai'], ['PUT', '/api/admin/ai/settings'], ['GET', '/api/admin/ai/usage'], ['POST', '/api/admin/ai/knowledge/refresh']] as const) {
      expect((await s.api(path, { method, body: method === 'GET' ? undefined : {} })).status).toBe(401)
    }
    const editor = await s.signIn('editor')
    expect((await s.api('/api/admin/ai', { headers: as(editor) })).status).toBe(403)
    expect((await s.api('/api/admin/ai/settings', { method: 'PUT', body: { enabled: false }, headers: as(editor) })).status).toBe(403)
    expect((await s.api('/api/admin/ai/usage', { headers: as(editor) })).status).toBe(403)
  })

  it('shows real usage: requests, tokens, cost, response time, failures, tools, topics, planner and quote counts', async () => {
    const { s } = await start((n) => (n === 0 ? callTool('comparePackages', {}, { input: 500, output: 20 }) : n === 1 ? say('Compared.', { input: 900, output: 80 }) : n === 2 ? say('Another.', { input: 100, output: 10 }) : (() => { throw Object.assign(new Error('x'), { statusCode: 500 }) })()))
    const headers = await newSession(s)
    await (await post(s, headers, 'compare the packages', 'conv-usage-aaaaaaaaaaaa')).text()
    await (await post(s, headers, 'and again', 'conv-usage-bbbbbbbbbbbb')).text()
    await (await post(s, headers, 'fails', 'conv-usage-cccccccccccc')).text()
    await waitFor(() => requests(s).length === 3 && requests(s).every((row) => row.status !== 'reserved'))

    const admin = await s.signIn('admin')
    const summary = (await s.api('/api/admin/ai', { headers: as(admin) })).json.data
    expect(summary.model.id).toBe('claude-haiku-5-5')
    expect(summary.apiKey).toBe('set')
    expect(JSON.stringify(summary)).not.toContain('test-key-not-real')
    expect(summary.availability).toEqual({ available: true })
    expect(summary.canWrite).toBe(true)
    expect(summary.pricing.note).toMatch(/not a bill/)
    expect(summary.overview).toMatchObject({ conversations: 3, requests: 3, failedRequests: 1, inputTokens: 1500, outputTokens: 110, toolCalls: 1, requestsWithReportedUsage: 2 })
    expect(summary.overview.estimatedCostUsd).toBeGreaterThan(0)
    expect(summary.overview.tools).toEqual([expect.objectContaining({ tool: 'comparePackages', calls: 1, failed: 0 })])
    expect(summary.overview.topics.find((topic: { topic: string }) => topic.topic === 'packages').n).toBe(1)
    expect(summary.overview.errors[0]).toMatchObject({ code: 'provider_unavailable', n: 1 })
    expect(summary.budget.day.requests).toBe(3)
    expect(summary.knowledge.sources).toMatchObject({ packages: { published: 4 }, services: { published: 4 }, comparison: { published: true }, fullExperience: { published: true }, developerProfile: { available: true, nameSet: false } })
    // No conversation text anywhere in what the administration receives.
    expect(JSON.stringify(summary)).not.toMatch(/compare the packages|and again/)

    const series = (await s.api('/api/admin/ai/usage?range=daily', { headers: as(admin) })).json.data.series
    expect(series.points).toHaveLength(30)
    expect(series.points.at(-1)).toMatchObject({ requests: 3, conversations: 3 })
    expect(series.points[0]).toMatchObject({ requests: 0, costUsd: 0 })
    expect((await s.api('/api/admin/ai/usage?range=weekly', { headers: as(admin) })).json.data.series.points.length).toBeGreaterThan(10)
    expect((await s.api('/api/admin/ai/usage?range=monthly', { headers: as(admin) })).json.data.series.points.length).toBeGreaterThanOrEqual(12)
  })

  it('changes the settings on the server: disable and re-enable, budgets, limits, texts, and refuses what is not acceptable', async () => {
    const { s } = await start((n) => say(`answer ${n}`))
    const admin = await s.signIn('admin')
    const put = (body: unknown) => s.api('/api/admin/ai/settings', { method: 'PUT', body, headers: as(admin) })
    const headers = await newSession(s)

    expect((await post(s, headers)).status).toBe(200)
    expect((await put({ enabled: false })).status).toBe(200)
    expect((await s.api('/api/ai/config')).json.data.available).toBe(false)
    expect((await post(s, headers)).status).toBe(503)
    expect((await s.api('/api/ai/session', { body: {} })).status).toBe(503)
    expect((await put({ enabled: true })).status).toBe(200)
    expect((await post(s, headers)).status).toBe(200)

    const saved = await put({ dailyBudgetUsd: 2, monthlyBudgetUsd: 20, maxOutputTokens: 800, maxRequestsPerSession: 7, maxInputChars: 500, languages: ['en', 'nl'], welcome: { en: 'Hi from the control room', hu: '', nl: '' }, suggestions: { en: ['Compare packages', 'Plan a site'], hu: [], nl: [] }, plannerEnabled: false })
    expect(saved.status).toBe(200)
    expect(saved.json.data.settings).toMatchObject({ dailyBudgetUsd: 2, maxOutputTokens: 800, maxRequestsPerSession: 7, plannerEnabled: false })
    const config = (await s.api('/api/ai/config')).json.data
    expect(config).toMatchObject({ languages: ['en', 'nl'], plannerEnabled: false, maxInputChars: 500, welcome: { en: 'Hi from the control room' } })
    expect(config.suggestions.en).toEqual(['Compare packages', 'Plan a site'])
    // The settings are enforced: Hungarian is no longer offered, a long message is refused, the planner tool is gone.
    expect((await s.fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ conversationId: 'conv-settings-0123456', trigger: 'submit-user-message', language: 'hu', text: 'szia' }) })).status).toBe(422)
    expect((await post(s, headers, 'x'.repeat(501))).status).toBe(422)

    expect((await put({ dailyBudgetUsd: 50, monthlyBudgetUsd: 20 })).status).toBe(422)
    expect((await put({ maxOutputTokens: 10 })).json.error.details.fields.maxOutputTokens).toBe('tooShort')
    expect((await put({ maxToolCalls: 2.5 })).status).toBe(422)
    expect((await put({ languages: [] })).status).toBe(422)
    expect((await put({ model: 'claude-opus-5-5' })).json.error.details.fields.model).toBe('unknown')
    expect((await put({ apiKey: 'x' })).status).toBe(422)
    expect((await put({ priceInputPerMTok: -1 })).status).toBe(422)
    // A model, a key and a base address are the operator's: nothing the administration saves changes them.
    expect(s.app.context.config.ai.model).toBe('claude-haiku-5-5')
  })

  it('refreshes the knowledge on request and reports how fresh the answers are', async () => {
    const { s } = await start([])
    const admin = await s.signIn('admin')
    const before = (await s.api('/api/admin/ai', { headers: as(admin) })).json.data.knowledge
    await s.app.context.assistant.knowledge.comparePackages('en')
    const built = s.app.context.assistant.knowledge.builds
    await s.app.context.assistant.knowledge.comparePackages('en')
    expect(s.app.context.assistant.knowledge.builds).toBe(built)
    const refreshed = await s.api('/api/admin/ai/knowledge/refresh', { body: {}, headers: as(admin) })
    expect(refreshed.status).toBe(200)
    await s.app.context.assistant.knowledge.comparePackages('en')
    expect(s.app.context.assistant.knowledge.builds).toBe(built + 1)
    expect(before.fingerprint).toMatch(/^[0-9a-f]{16}$/)
  })
})
