import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startStandIn, type StandIn } from '../../tools/e2e/anthropic-standin.ts'
import { TOOL_NAMES } from '../src/modules/ai/tools.ts'
import { answerText, parseSse } from './aiMock.ts'
import { startServer, type TestServer } from './helpers.ts'

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
    const { standIn: provider, say } = await start({ AI_EFFORT: 'low', AI_MAX_OUTPUT_TOKENS: '900' })
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
    expect(body.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([...TOOL_NAMES].sort())
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

  it('asks the model for the language the visitor chose, in the operator\'s instructions', async () => {
    const { standIn: provider, say } = await start()
    await say('Szia!', 'conv-provider-hu-0123456', 'hu')
    expect(JSON.stringify(provider.requests[0].body.system)).toContain('Answer in Hungarian')
  })
})
