import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startStandIn, type StandIn } from '../../tools/e2e/anthropic-standin.ts'
import { toolNamesFor } from '../src/modules/ai/tools.ts'
import { loadSettings } from '../src/modules/ai/settings.ts'
import { answerText, parseSse } from './aiMock.ts'
import { activateThroughAdmin, startServer, type TestServer } from './helpers.ts'

/**
 * The REAL provider package (`@ai-sdk/anthropic`) talking real HTTP to a local stand-in for Anthropic's Messages API: what the
 * integration actually sends (the model, the limits, the tools, the thinking setting, the key, nothing the model rejects) and how
 * it reads the streamed answer, the tool round and the provider's errors. The stand-in is not the model.
 */

let server: TestServer | null = null
let standIn: StandIn | null = null
afterEach(async () => {
  await server?.close()
  await standIn?.close()
  server = null
  standIn = null
})

async function start(env: Record<string, string> = {}) {
  standIn = await startStandIn()
  server = await startServer({ env: { MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-ai-media-')), ANTHROPIC_BASE_URL: `http://127.0.0.1:${standIn.port}/v1`, ...env } })
  // The real activation path: a connection test over HTTP that must verify the required model, then the administrator's switch.
  const activated = await activateThroughAdmin(server)
  if (activated.status !== 200) throw new Error(`the assistant could not be activated in the test: ${JSON.stringify(activated.result)}`)
  // The test itself is the stand-in's first request; the tests below count the requests of the conversation, so forget it.
  standIn.requests.length = 0
  const created = await server.api('/api/ai/session', { body: {} })
  const headers = { 'X-AI-Session': created.json.data.token as string }
  const say = async (text: string, id = 'conv-provider-0123456789', language = 'en') => {
    const response = await server!.fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ conversationId: id, trigger: 'submit-user-message', language, text }) })
    return { response, chunks: parseSse(await response.text()) }
  }
  return { s: server, standIn, headers, say }
}

describe('the Anthropic provider, over HTTP', () => {
  it('sends the configured model, the key, the limits, the closed tool set and the thinking setting, and nothing the model rejects', async () => {
    const { s: backend, standIn: provider, say } = await start({ AI_EFFORT: 'low', AI_MAX_OUTPUT_TOKENS: '900' })
    const { chunks } = await say('Hello there')
    expect(answerText(chunks)).toBe('Stand-in answer. ')

    expect(provider.requests).toHaveLength(1)
    const { headers, body } = provider.requests[0]
    expect(headers['x-api-key']).toBe('test-key-not-real-0123456789abcdef')
    expect(headers['anthropic-version']).toBeTruthy()
    expect(body.model).toBe('claude-haiku-5-5')
    expect(body.stream).toBe(true)
    expect(body.max_tokens).toBe(900)
    // The instructions are the operator's; the visitor's words are a user message.
    expect(JSON.stringify(body.system)).toContain('CONTROL ROOM AI')
    expect(body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'Hello there' }] }])
    // The closed tool set, each with a schema.
    expect(body.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([...toolNamesFor(loadSettings(backend.app.context))].sort())
    expect(body.tools.every((tool: { input_schema: { type: string } }) => tool.input_schema.type === 'object')).toBe(true)
    // Haiku 5.5 rejects sampling settings and forced tool use: neither is sent.
    for (const forbidden of ['temperature', 'top_p', 'top_k']) expect(body).not.toHaveProperty(forbidden)
    expect(JSON.stringify(body.tool_choice ?? { type: 'auto' })).not.toMatch(/"type":"(any|tool)"/)
    // Adaptive thinking with a low effort (the provider decides how to word it; both must be there).
    expect(JSON.stringify(body)).toMatch(/adaptive/)
    expect(JSON.stringify(body)).toMatch(/"effort":"low"/)
    // The key and the model are the operator's: nothing in the visitor's request reached these fields.
    expect(JSON.stringify(body)).not.toMatch(/test-key-not-real/)
  })

  it('runs a tool round over the wire: the stand-in asks for a tool, the result is sent back, and the answer follows, with usage reconciled', async () => {
    const { s, standIn: provider, say } = await start()
    const { chunks } = await say('TOOL:searchPortfolioProjects:{"query":"booking"} please')
    expect(chunks.map((chunk) => chunk.type)).toEqual(expect.arrayContaining(['tool-input-available', 'tool-output-available', 'text-delta']))
    expect(answerText(chunks)).toBe('Tool result received. ')
    expect(provider.requests).toHaveLength(2)
    const second = provider.requests[1].body
    const last = second.messages.at(-1)
    expect(last.role).toBe('user')
    expect(last.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1' })
    expect(JSON.stringify(last)).toMatch(/results/)
    const [row] = s.db.all<{ status: string; input_tokens: number; output_tokens: number; steps: number; cost_source: string }>('SELECT * FROM ai_requests')
    expect(row).toMatchObject({ status: 'completed', steps: 2, cost_source: 'provider_usage', output_tokens: 18 + 12 })
    expect(row.input_tokens).toBeGreaterThan(200)
  })

  it('turns the provider\'s errors into short codes without quoting them, and records the failure', async () => {
    const { s, say } = await start()
    const { response, chunks } = await say('FAIL:529 now')
    expect(response.status).toBe(200)
    const error = chunks.find((chunk) => chunk.type === 'error')
    expect(String(error?.errorText)).toBe('provider_unavailable')
    expect(JSON.stringify(chunks)).not.toMatch(/secret detail|overloaded/)
    const until = Date.now() + 3000
    while (s.db.get<{ status: string }>('SELECT status FROM ai_requests')?.status === 'reserved' && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20))
    expect(s.db.get<{ status: string; error_code: string }>('SELECT status, error_code FROM ai_requests')).toMatchObject({ status: 'failed', error_code: 'provider_unavailable' })
  })

  const failed = async (s: TestServer) => {
    const until = Date.now() + 8000
    while (s.db.get<{ status: string }>('SELECT status FROM ai_requests')?.status === 'reserved' && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 20))
    return s.db.get<{ status: string; error_code: string | null; finish_reason: string | null; cost_state: string | null }>('SELECT status, error_code, finish_reason, cost_state FROM ai_requests')
  }

  it('reads what the provider says about the end of an answer: one cut off at the output limit is kept and marked; an empty one and one that cannot be parsed are failures with one code (PROMPT 29)', async () => {
    const { s, say } = await start()
    // Cut off at the output limit (stop_reason max_tokens): the text is kept, the stream says why it stopped, the usage row records it.
    const cut = await say('LENGTH write a lot', 'conv-wire-length-0123456')
    expect(answerText(cut.chunks)).toBe('Stand-in answer. ')
    expect(JSON.stringify(cut.chunks)).toContain('"finishReason":"length"')
    expect(cut.chunks.find((chunk) => chunk.type === 'error')).toBeUndefined()
    expect(await failed(s)).toMatchObject({ status: 'completed', finish_reason: 'length', cost_state: 'reported' })

    // An answer with no content at all is not shown as a success.
    s.db.run('DELETE FROM ai_requests')
    const empty = await say('EMPTY please', 'conv-wire-empty-01234567')
    expect(String(empty.chunks.find((chunk) => chunk.type === 'error')?.errorText)).toBe('provider_invalid_response')
    expect(await failed(s)).toMatchObject({ status: 'failed', error_code: 'provider_invalid_response' })

    // A stream event that is not JSON: the SDK cannot parse it, the visitor gets the same code, and the provider's text is never quoted.
    s.db.run('DELETE FROM ai_requests')
    const bad = await say('BADJSON please', 'conv-wire-badjson-012345')
    expect(String(bad.chunks.find((chunk) => chunk.type === 'error')?.errorText)).toBe('provider_invalid_response')
    expect(JSON.stringify(bad.chunks)).not.toMatch(/this is not json|JSON/i)
    expect(await failed(s)).toMatchObject({ status: 'failed', error_code: 'provider_invalid_response' })
  })

  it('cuts off a provider that does not even start answering after the connection timeout, with a controlled code, no cost and no other model', async () => {
    const { s, say } = await start({ AI_CONNECT_TIMEOUT_MS: '500' })
    const started = Date.now()
    const { chunks } = await say('HANG forever', 'conv-wire-hang-0123456789')
    expect(String(chunks.find((chunk) => chunk.type === 'error')?.errorText)).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(8000)
    expect(await failed(s)).toMatchObject({ status: 'failed', error_code: 'timeout', cost_state: 'none' })
  })

  it('maps the provider\'s own refusals of the key, the account and the model to codes the interface words, and never retries with another model', async () => {
    const { s, standIn: provider, say } = await start()
    const expected: Array<[number, string]> = [
      [401, 'provider_auth'],
      [402, 'provider_billing'],
      [429, 'provider_rate_limit'],
      [529, 'provider_unavailable'],
    ]
    for (const [status, code] of expected) {
      s.db.run('DELETE FROM ai_requests')
      provider.requests.length = 0
      const { chunks } = await say(`FAIL:${status} now`, `conv-wire-${status}-0123456789`)
      expect(String(chunks.find((chunk) => chunk.type === 'error')?.errorText), String(status)).toBe(code)
      expect(await failed(s)).toMatchObject({ status: 'failed', error_code: code })
      // Whatever was asked, it was asked of Claude Haiku 5.5 and nothing else (one retry at most, with the same model).
      for (const request of provider.requests) expect(request.body.model).toBe('claude-haiku-5-5')
      expect(provider.requests.length).toBeLessThanOrEqual(2)
    }
  }, 40_000)

  it('asks the model for the language the visitor chose, in the operator\'s instructions', async () => {
    const { standIn: provider, say } = await start()
    await say('Szia!', 'conv-provider-hu-0123456', 'hu')
    expect(JSON.stringify(provider.requests[0].body.system)).toContain('Answer in Hungarian')
  })
})
