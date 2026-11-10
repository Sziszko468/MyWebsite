import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startStandIn, type StandIn } from '../../tools/e2e/anthropic-standin.ts'
import { finish, reserve } from '../src/modules/ai/budget.ts'
import { loadSettings } from '../src/modules/ai/settings.ts'
import { createConversation, createSession } from '../src/modules/ai/store.ts'
import { parseSse } from './aiMock.ts'
import { quote, startServer, type TestServer } from './helpers.ts'

/**
 * Identity verification and the connection test, with the REAL `@ai-sdk/anthropic` provider over HTTP against the local stand-in
 * (which can be told to name another model, name none, or refuse with any status). What these show: the assistant becomes
 * available only through a successful connection test AND the administrator's switch; a reply from any other model breaks the
 * verification and is never passed on; every provider failure ends as a safe, recorded, user-friendly "not available" with the
 * rest of the site untouched; and no request ever names a model other than `claude-haiku-5-5`.
 *
 * The stand-in is not Anthropic and proves nothing about the live API. The report says so.
 */

const KEY = 'test-key-not-real-0123456789abcdef'
const HAIKU = 'claude-haiku-5-5'

let server: TestServer | null = null
let standIn: StandIn | null = null
afterEach(async () => {
  // Whatever happened, no request in the test ever asked for another model.
  for (const received of standIn?.requests ?? []) expect(received.body.model).toBe(HAIKU)
  await server?.close()
  await standIn?.close()
  server = null
  standIn = null
})

async function start(env: Record<string, string> = {}, options: { databasePath?: string; standIn?: StandIn; adminEmail?: string } = {}) {
  standIn = options.standIn ?? (await startStandIn())
  server = await startServer({ env: { MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-ai-media-')), ANTHROPIC_BASE_URL: `http://127.0.0.1:${standIn.port}/v1`, ...env }, databasePath: options.databasePath, seed: options.databasePath ? false : undefined })
  const admin = await server.signIn('admin', options.adminEmail)
  const headers = { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }
  const s = server
  const api = {
    summary: async () => (await s.api('/api/admin/ai', { headers })).json.data,
    test: () => s.api('/api/admin/ai/connection-test', { method: 'POST', body: {}, headers }),
    put: (body: Record<string, unknown>) => s.api('/api/admin/ai/settings', { method: 'PUT', body, headers }),
    acknowledge: (id?: string) => s.api('/api/admin/ai/alerts/acknowledge', { method: 'POST', body: id ? { id } : {}, headers }),
    config: async () => (await s.api('/api/ai/config')).json.data,
  }
  const chat = async (text = 'Hello there', id = `conv-verify-${Math.random().toString(36).slice(2, 12).padEnd(10, '0')}`) => {
    const created = await s.api('/api/ai/session', { body: {} })
    if (created.status !== 201) return { status: created.status, chunks: [] as Record<string, unknown>[], reason: created.json?.error?.details?.reason as string | undefined }
    const response = await s.fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AI-Session': created.json.data.token as string }, body: JSON.stringify({ conversationId: id, trigger: 'submit-user-message', language: 'en', text }) })
    const text2 = await response.text()
    let reason: string | undefined
    try {
      reason = JSON.parse(text2)?.error?.details?.reason
    } catch {
      reason = undefined
    }
    return { status: response.status, chunks: response.status === 200 ? parseSse(text2) : [], reason }
  }
  return { s, standIn: standIn!, api, chat, headers }
}

type Started = Awaited<ReturnType<typeof start>>

/** The administrator's path: a successful connection test, then the switch. */
async function activate(t: Started) {
  const tested = await t.api.test()
  expect(tested.json.data.result.ok, JSON.stringify(tested.json)).toBe(true)
  expect((await t.api.put({ enabled: true })).status).toBe(200)
}

const alerts = (s: TestServer) => s.db.all<{ kind: string; level: string; acknowledged_at: string | null }>('SELECT kind, level, acknowledged_at FROM ai_alerts ORDER BY created_at, rowid')

describe('activation needs proof and a decision', () => {
  it('starts switched off and unverified: the website does not offer the assistant and the switch refuses', async () => {
    const t = await start()
    const config = await t.api.config()
    expect(config).toMatchObject({ available: false, unavailableReason: null })
    const summary = await t.api.summary()
    expect(summary.model).toMatchObject({ requiredName: 'Claude Haiku 5.5', id: HAIKU, provider: 'Anthropic', editable: false })
    expect(summary.connection).toMatchObject({ status: 'not_tested', keyConfigured: true, lastSuccessfulTest: null, lastError: null })
    expect(summary.settings.enabled).toBe(false)
    expect(summary.availability).toEqual({ available: false, reason: 'admin_disabled' })
    const refused = await t.api.put({ enabled: true })
    expect(refused.status).toBe(409)
    expect(refused.json.error.details).toMatchObject({ reason: 'verification_required', cause: 'model_unverified' })
    expect((await t.api.summary()).settings.enabled).toBe(false)
    expect(t.standIn.requests).toHaveLength(0)
  })

  it('verifies the model with a minimal request and the provider\'s own statement, and does NOT switch the assistant on by itself', async () => {
    const t = await start()
    const tested = await t.api.test()
    expect(tested.status).toBe(200)
    const { result } = tested.json.data
    expect(result).toMatchObject({ ok: true, outcome: 'verified', reason: null, requestedModel: HAIKU, reportedModel: HAIKU, endpoint: expect.stringContaining('127.0.0.1') })
    expect(result.usage.inputTokens).toBeGreaterThan(0)
    // One request, to the required model, with the server's key and nothing a browser could have chosen.
    expect(t.standIn.requests).toHaveLength(1)
    expect(t.standIn.requests[0].body.model).toBe(HAIKU)
    expect(t.standIn.requests[0].headers['x-api-key']).toBe(KEY)
    // Recorded.
    const summary = tested.json.data.summary
    expect(summary.connection.status).toBe('connected')
    expect(summary.connection.verification).toMatchObject({ status: 'verified', reportedModel: HAIKU, reason: null })
    expect(summary.connection.lastSuccessfulTest).toMatchObject({ reportedModel: HAIKU })
    expect(summary.connection.tests).toHaveLength(1)
    // The decision is still the administrator's.
    expect(summary.settings.enabled).toBe(false)
    expect(summary.availability).toEqual({ available: false, reason: 'admin_disabled' })
    expect((await t.api.config()).available).toBe(false)
    expect((await t.chat()).status).toBe(503)
    // The switch now works, and from then on the website offers the assistant.
    expect((await t.api.put({ enabled: true })).status).toBe(200)
    expect((await t.api.config()).available).toBe(true)
    expect((await t.chat('Hello')).status).toBe(200)
    // The administrator can switch it off again at any time, without a test.
    expect((await t.api.put({ enabled: false })).status).toBe(200)
    expect((await t.api.config()).available).toBe(false)
    const audited = t.s.db.all<{ action: string }>("SELECT action FROM audit_log WHERE action LIKE 'ai.%' ORDER BY id").map((row) => row.action)
    expect(audited).toEqual(['ai.connection_test', 'ai.activate', 'ai.deactivate'])
  })

  it('cannot have its model chosen: no field of the settings, the chat or the test names one', async () => {
    const t = await start()
    for (const field of ['model', 'modelId', 'ANTHROPIC_MODEL', 'provider', 'fallbackModel', 'models']) {
      const response = await t.api.put({ [field]: 'claude-sonnet-5-5' })
      expect(response.status, field).toBe(422)
      expect(response.json.error.details.fields[field]).toBe('unknown')
    }
    await activate(t)
    const created = await t.s.api('/api/ai/session', { body: {} })
    await t.s.fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AI-Session': created.json.data.token as string }, body: JSON.stringify({ conversationId: 'conv-choose-0123456789', trigger: 'submit-user-message', language: 'en', text: 'hi', model: 'claude-opus-5-5', provider: 'openai', fallbackModel: 'gpt-5' }) }).then((response) => response.text())
    for (const received of t.standIn.requests) expect(received.body.model).toBe(HAIKU)
    expect(t.standIn.requests.length).toBeGreaterThanOrEqual(2)
  })

  it('only an administrator may run the test, switch the assistant on or acknowledge alerts', async () => {
    const t = await start()
    const editor = await t.s.signIn('editor')
    const editorHeaders = { Cookie: editor.cookie, 'X-CSRF-Token': editor.csrf }
    expect((await t.s.api('/api/admin/ai/connection-test', { method: 'POST', body: {}, headers: editorHeaders })).status).toBe(403)
    expect((await t.s.api('/api/admin/ai/settings', { method: 'PUT', body: { enabled: false }, headers: editorHeaders })).status).toBe(403)
    expect((await t.s.api('/api/admin/ai/alerts/acknowledge', { method: 'POST', body: {}, headers: editorHeaders })).status).toBe(403)
    expect((await t.s.api('/api/admin/ai/connection-test', { method: 'POST', body: {} })).status).toBe(401)
    expect(t.standIn.requests).toHaveLength(0)
  })
})

describe('what the test says when the model cannot be verified', () => {
  const cases: Array<{ name: string; behaviour: { failStatus?: number; reportModel?: string | null }; reason: string; alert?: string }> = [
    { name: 'an invalid key (401)', behaviour: { failStatus: 401 }, reason: 'invalid_key', alert: 'provider_auth' },
    { name: 'no credit (402)', behaviour: { failStatus: 402 }, reason: 'billing', alert: 'provider_billing' },
    { name: 'a key not allowed to use the model (403)', behaviour: { failStatus: 403 }, reason: 'permission', alert: 'provider_auth' },
    { name: 'a model the provider does not know (404)', behaviour: { failStatus: 404 }, reason: 'model_not_found', alert: 'model_not_found' },
    { name: 'rate limiting (429)', behaviour: { failStatus: 429 }, reason: 'rate_limited' },
    { name: 'a provider outage (500)', behaviour: { failStatus: 500 }, reason: 'provider_unavailable' },
    { name: 'an overloaded provider (529)', behaviour: { failStatus: 529 }, reason: 'provider_unavailable' },
    { name: 'an answer from another model', behaviour: { reportModel: 'claude-sonnet-5-5' }, reason: 'model_mismatch', alert: 'model_mismatch' },
    { name: 'an answer from a look-alike identifier', behaviour: { reportModel: 'claude-haiku-5-5-20260101' }, reason: 'model_mismatch', alert: 'model_mismatch' },
    { name: 'an answer that does not say which model produced it', behaviour: { reportModel: null }, reason: 'model_unreported' },
  ]

  for (const { name, behaviour, reason, alert } of cases) {
    it(`fails safely on ${name}: recorded, alerted, nothing leaked, the assistant stays unavailable`, async () => {
      const t = await start()
      Object.assign(t.standIn.behaviour, behaviour)
      const tested = await t.api.test()
      expect(tested.status).toBe(200)
      const { result, summary } = tested.json.data
      expect(result).toMatchObject({ ok: false, outcome: 'failed', reason, requestedModel: HAIKU })
      // A safe sentence, never the provider's words, the key or a stack.
      expect(result.message.length).toBeGreaterThan(10)
      const everything = JSON.stringify(tested.json) + t.s.logs.join('\n')
      expect(everything).not.toContain(KEY)
      expect(everything).not.toMatch(/secret detail/)
      expect(summary.connection.verification).toMatchObject({ status: 'failed', reason })
      expect(summary.connection.status).toBe('failed')
      expect(summary.connection.lastError).toMatchObject({ source: 'test', code: reason })
      expect(summary.connection.tests[0]).toMatchObject({ outcome: 'failed', reason })
      // The alert for the administrator.
      const kinds = alerts(t.s).map((row) => row.kind)
      expect(kinds).toContain('model_unverified')
      if (alert) expect(kinds).toContain(alert)
      expect(summary.alerts.open).toBeGreaterThan(0)
      // And no way to switch the assistant on from here.
      const activation = await t.api.put({ enabled: true })
      expect(activation.status).toBe(409)
      expect((await t.api.config()).available).toBe(false)
      expect((await t.chat()).status).toBe(503)
    })
  }

  it('fails on a missing key without contacting anyone', async () => {
    const t = await start({ ANTHROPIC_API_KEY: '' })
    const tested = await t.api.test()
    expect(tested.json.data.result).toMatchObject({ ok: false, reason: 'no_api_key', latencyMs: null })
    expect(t.standIn.requests).toHaveLength(0)
    expect((await t.api.summary()).connection).toMatchObject({ status: 'no_key', keyConfigured: false })
    expect((await t.api.put({ enabled: true })).json.error.details.cause).toBe('no_api_key')
  })

  it('treats a leftover ANTHROPIC_MODEL naming another model as a lock, not as a choice', async () => {
    const t = await start({ ANTHROPIC_MODEL: 'claude-sonnet-5-5' })
    expect(t.s.config.ai.model).toBe(HAIKU)
    expect(t.s.config.ai.modelOverride).toBe('claude-sonnet-5-5')
    const tested = await t.api.test()
    expect(tested.json.data.result).toMatchObject({ ok: false, reason: 'model_lock' })
    expect(t.standIn.requests).toHaveLength(0)
    const summary = await t.api.summary()
    expect(summary.model.overrideRejected).toBe(true)
    expect(summary.connection.status).toBe('model_lock')
    expect((await t.api.put({ enabled: true })).json.error.details.cause).toBe('model_lock')
    expect(JSON.stringify(summary)).not.toContain('claude-sonnet-5-5')
  })

  it('accepts ANTHROPIC_MODEL when it names the required model, and starts the server whatever it says', async () => {
    const t = await start({ ANTHROPIC_MODEL: HAIKU })
    expect(t.s.config.ai.modelOverride).toBeNull()
    expect((await t.api.test()).json.data.result.ok).toBe(true)
    // A garbage value does not stop the server (the website must not depend on the assistant): it only keeps the assistant off.
    const odd = await startServer({ env: { ANTHROPIC_MODEL: 'not a model!!', ANTHROPIC_API_KEY: KEY } })
    expect(odd.config.ai.modelOverride).toBe('not a model!!')
    expect((await odd.api('/api/ready')).status).toBe(200)
    await odd.close()
  })
})

describe('a verification belongs to one key and one address', () => {
  it('is void for another key or address, until the test is run again', async () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), 'cc-ai-db-')), 'verification.sqlite')
    const first = await start({}, { databasePath })
    await activate(first)
    expect((await first.api.config()).available).toBe(true)
    await server?.close()
    // Same database, same address, another key: another account, so another proof is needed.
    const second = await start({ ANTHROPIC_API_KEY: 'another-key-not-real-0123456789abcdef' }, { databasePath, standIn: standIn!, adminEmail: 'second-admin@site.test' })
    const summary = await second.api.summary()
    expect(summary.settings.enabled).toBe(true)
    expect(summary.connection.verification.status).toBe('stale')
    expect(summary.connection.status).toBe('stale')
    expect(summary.availability).toEqual({ available: false, reason: 'model_unverified' })
    expect(await second.api.config()).toMatchObject({ available: false, unavailableReason: 'model' })
    expect((await second.chat()).status).toBe(503)
    // A fresh test with the new key restores it: the administrator's earlier decision (switched on) still stands.
    expect((await second.api.test()).json.data.result.ok).toBe(true)
    expect((await second.api.config()).available).toBe(true)
    expect(JSON.stringify(summary)).not.toContain('another-key-not-real')
    // The fingerprint is not the key.
    const stored = second.s.db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'ai.verification'")!.value
    expect(stored).not.toContain('another-key-not-real')
    expect(stored).not.toContain(KEY)
  })
})

describe('a request that is not answered by the required model', () => {
  it('discards a reply from another model before the visitor sees a word of it, and the assistant stays unavailable until verified again', async () => {
    const t = await start()
    await activate(t)
    const good = await t.chat('First question')
    expect(good.status).toBe(200)
    t.standIn.behaviour.reportModel = 'claude-sonnet-5-5'
    const bad = await t.chat('Second question')
    expect(bad.status).toBe(200)
    expect(bad.chunks.some((chunk) => chunk.type === 'text-delta')).toBe(false)
    expect(String(bad.chunks.find((chunk) => chunk.type === 'error')?.errorText)).toBe('model_mismatch')
    await new Promise((resolve) => setTimeout(resolve, 50))
    const rows = t.s.db.all<{ status: string; actual_model: string | null; model_verified: number; error_code: string | null }>('SELECT status, actual_model, model_verified, error_code FROM ai_requests ORDER BY rowid')
    expect(rows[0]).toMatchObject({ status: 'completed', actual_model: HAIKU, model_verified: 1 })
    expect(rows[1]).toMatchObject({ status: 'failed', actual_model: 'claude-sonnet-5-5', model_verified: 0, error_code: 'model_mismatch' })
    // From now on: unavailable, with the friendly reason for the visitor and the alert for the administrator.
    const summary = await t.api.summary()
    expect(summary.connection.verification).toMatchObject({ status: 'failed', reason: 'model_mismatch', reportedModel: 'claude-sonnet-5-5' })
    expect(summary.settings.enabled).toBe(true)
    expect(summary.totals).toMatchObject({ requests: 2, modelVerifiedRequests: 1, modelMismatchedRequests: 1 })
    expect(alerts(t.s).map((row) => row.kind)).toEqual(expect.arrayContaining(['model_mismatch', 'model_unverified']))
    expect(await t.api.config()).toMatchObject({ available: false, unavailableReason: 'model' })
    const before = t.standIn.requests.length
    const refused = await t.chat('Third question')
    expect(refused).toMatchObject({ status: 503, reason: 'model_unverified' })
    // The refused request never reached the provider: no retry, no other model.
    expect(t.standIn.requests.length).toBe(before)
    // Verified again (the stand-in tells the truth again): the earlier switch still stands.
    delete t.standIn.behaviour.reportModel
    expect((await t.api.test()).json.data.result.ok).toBe(true)
    expect((await t.chat('Fourth question')).status).toBe(200)
  })

  it('breaks the verification when the provider says the model does not exist, and keeps a refused key from doing the same', async () => {
    const t = await start()
    await activate(t)
    t.standIn.behaviour.failStatus = 401
    const unauthorised = await t.chat('Question')
    expect(String(unauthorised.chunks.find((chunk) => chunk.type === 'error')?.errorText)).toBe('provider_auth')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(alerts(t.s).map((row) => row.kind)).toContain('provider_auth')
    expect((await t.api.summary()).connection.verification.status).toBe('verified')
    t.standIn.behaviour.failStatus = 402
    const broke = await t.chat('Question')
    expect(String(broke.chunks.find((chunk) => chunk.type === 'error')?.errorText)).toBe('provider_billing')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(alerts(t.s).map((row) => row.kind)).toContain('provider_billing')
    t.standIn.behaviour.failStatus = 404
    const missing = await t.chat('Question')
    expect(String(missing.chunks.find((chunk) => chunk.type === 'error')?.errorText)).toBe('model_not_found')
    await new Promise((resolve) => setTimeout(resolve, 50))
    const summary = await t.api.summary()
    expect(summary.connection.verification).toMatchObject({ status: 'failed', reason: 'model_not_found' })
    expect(summary.connection.lastError).toMatchObject({ source: 'chat', code: 'model_not_found' })
    expect(alerts(t.s).map((row) => row.kind)).toContain('model_not_found')
    expect((await t.chat('Question')).status).toBe(503)
    const everything = JSON.stringify(summary) + t.s.logs.join('\n')
    expect(everything).not.toContain(KEY)
    expect(everything).not.toMatch(/secret detail/)
  })

  it('does not count an answer without a model statement as verified, and says so', async () => {
    const t = await start()
    await activate(t)
    t.standIn.behaviour.reportModel = null
    const answered = await t.chat('A question')
    expect(answered.status).toBe(200)
    expect(answered.chunks.some((chunk) => chunk.type === 'text-delta')).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(t.s.db.get<{ actual_model: string | null; model_verified: number; status: string }>('SELECT actual_model, model_verified, status FROM ai_requests')).toMatchObject({ status: 'completed', actual_model: null, model_verified: 0 })
    expect((await t.api.summary()).totals).toMatchObject({ requests: 1, modelVerifiedRequests: 0, modelUnreportedRequests: 1 })
  })
})

describe('the rest of the site does not depend on the assistant', () => {
  it('keeps taking quote requests and answering health checks while the model cannot be verified', async () => {
    const t = await start()
    t.standIn.behaviour.reportModel = 'claude-sonnet-5-5'
    expect((await t.api.test()).json.data.result.ok).toBe(false)
    expect((await t.chat()).status).toBe(503)
    expect((await t.s.api('/api/health')).status).toBe(200)
    expect((await t.s.api('/api/ready')).status).toBe(200)
    const sent = await t.s.api('/api/quote-requests', { body: quote({ description: 'A small website for a bakery with an order form.' }) })
    expect(sent.status).toBe(201)
    expect(t.s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM quote_requests')!.n).toBe(1)
  })
})

describe('budget alerts and limits', () => {
  /** Books a finished request at a cost, the way a real one is booked, so a limit is reached without sending thousands of messages. */
  function spend(s: TestServer, costUsd: number) {
    const settings = loadSettings(s.app.context)
    const session = createSession(s.db, s.clock, s.config.ai.sessionSecret, 'iphash')
    const conversation = createConversation(s.db, s.clock, session.id, `conv-spend-${Math.random().toString(36).slice(2, 12).padEnd(10, '0')}`, 'en')
    const reservation = reserve(s.app.context, { ...settings, dailyBudgetUsd: 1e6, monthlyBudgetUsd: 1e6, dailyTokenBudget: 1e9 }, { conversationId: conversation.id, sessionId: session.id, ipHash: 'iphash', model: HAIKU, promptTokens: 10, newConversation: false })
    // At the configured input price a token costs price/1e6 dollars: this many tokens cost this much.
    const inputTokens = Math.round((costUsd * 1_000_000) / settings.priceInputPerMTok)
    finish(s.app.context, settings, reservation, { status: 'completed', usage: { inputTokens, outputTokens: 0 }, steps: 1, toolCalls: 0, errorCode: null, latencyMs: 10, firstTokenMs: 5, actualModel: HAIKU, modelVerified: true })
  }

  it('warns once when a limit reaches the configured percentage, once more when it is used up, refuses further generation clearly, and keeps quote requests working', async () => {
    const t = await start()
    await activate(t)
    expect((await t.api.put({ dailyBudgetUsd: 1, monthlyBudgetUsd: 5, alertPercent: 80, priceInputPerMTok: 10, maxToolCalls: 1, maxOutputTokens: 200 })).status).toBe(200)
    spend(t.s, 0.79)
    expect((await t.chat('Under the warning level')).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 50))
    // 0.79 + the small cost of that answer is still under 80% of $1.
    expect(alerts(t.s).filter((row) => row.kind.startsWith('cost_day'))).toEqual([])
    spend(t.s, 0.05)
    expect((await t.chat('Over the warning level')).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(alerts(t.s).filter((row) => row.kind.startsWith('cost_day')).map((row) => [row.kind, row.level])).toEqual([['cost_day_warning', 'warning']])
    // More requests do not raise the same alert again.
    expect((await t.chat('Another')).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(alerts(t.s).filter((row) => row.kind === 'cost_day_warning')).toHaveLength(1)
    // Use the day up.
    spend(t.s, 0.2)
    const stopped = await t.chat('One too many')
    expect(stopped).toMatchObject({ status: 503, reason: 'daily_budget' })
    expect(alerts(t.s).map((row) => [row.kind, row.level])).toEqual(expect.arrayContaining([['cost_day_warning', 'warning'], ['cost_day_exhausted', 'critical']]))
    expect(alerts(t.s).filter((row) => row.kind === 'cost_day_exhausted')).toHaveLength(1)
    // The provider is not contacted for a refused request, and no other model is used to "make it fit".
    const contacted = t.standIn.requests.length
    expect((await t.chat('Still too many')).status).toBe(503)
    expect(t.standIn.requests.length).toBe(contacted)
    // The summary says where the day stands; the quote request system is untouched.
    const summary = await t.api.summary()
    expect(summary.budget.day).toMatchObject({ budgetUsd: 1, state: 'exhausted' })
    expect(summary.budget.alertPercent).toBe(80)
    expect(summary.alerts.open).toBe(2)
    expect((await t.s.api('/api/quote-requests', { body: quote({ description: 'A quote request made while the assistant is out of budget.' }) })).status).toBe(201)
    // The administrator raises the limit; generation resumes with the same model, and the alerts can be acknowledged.
    expect((await t.api.put({ dailyBudgetUsd: 3, monthlyBudgetUsd: 10 })).status).toBe(200)
    expect((await t.chat('Back again')).status).toBe(200)
    expect((await t.api.acknowledge()).status).toBe(200)
    expect((await t.api.summary()).alerts.open).toBe(0)
    expect(alerts(t.s).every((row) => row.acknowledged_at !== null)).toBe(true)
  })

  it('warns about the month on its own, with its own period', async () => {
    const t = await start()
    await activate(t)
    expect((await t.api.put({ dailyBudgetUsd: 4, monthlyBudgetUsd: 5, alertPercent: 50, priceInputPerMTok: 10, maxToolCalls: 1, maxOutputTokens: 200 })).status).toBe(200)
    spend(t.s, 2.6)
    expect((await t.chat('A question')).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 50))
    const kinds = alerts(t.s).map((row) => row.kind)
    expect(kinds).toContain('cost_month_warning')
    expect(kinds).toContain('cost_day_warning')
    const period = t.s.db.get<{ period: string }>("SELECT period FROM ai_alerts WHERE kind = 'cost_month_warning'")!.period
    expect(period).toMatch(/^\d{4}-\d{2}$/)
  })

  it('rejects an alert percentage outside 1 to 100 and a daily budget above the monthly one', async () => {
    const t = await start()
    expect((await t.api.put({ alertPercent: 0 })).status).toBe(422)
    expect((await t.api.put({ alertPercent: 101 })).status).toBe(422)
    expect((await t.api.put({ alertPercent: 55.5 })).status).toBe(422)
    expect((await t.api.put({ dailyBudgetUsd: 10, monthlyBudgetUsd: 5 })).status).toBe(422)
    expect((await t.api.put({ alertPercent: 90 })).status).toBe(200)
  })
})
