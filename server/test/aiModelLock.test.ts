import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MockLanguageModelV4 } from 'ai/test'
import { loadConfig } from '../src/config.ts'
import { AI_MODEL_ID, AI_MODEL_NAME, AI_PROVIDER, ModelLockError, ModelObservation, assertLockedModel, guardModel } from '../src/modules/ai/model.ts'
import { answerText, parseSse, say, scriptedModel } from './aiMock.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * THE MODEL LOCK. CONTROL ROOM AI runs on Anthropic Claude Haiku 5.5 and nothing else. These tests fail if anything in the
 * assistant's execution path could name another model, another provider, or a fallback:
 *
 *   - the source scans read the code (comments removed) and list every model identifier, provider package, model-selecting
 *     environment variable, fallback construct and model call that exists;
 *   - the runtime tests hand the gateway other models and a model that lies about its identity, and check it refuses them.
 *
 * If you are here because one of them failed after you added a model on purpose: that is a decision for the owner, not a
 * test to loosen (see docs/ai/README.md, "The model lock").
 */

const ROOT = join(import.meta.dirname, '..', '..')

function files(dir: string, extensions: string[]): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) found.push(...files(path, extensions))
    else if (extensions.some((extension) => name.endsWith(extension))) found.push(path)
  }
  return found
}

/** Source without comments, so a sentence that says "there is no fallback" is not mistaken for one. */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

const serverSources = files(join(ROOT, 'server', 'src'), ['.ts'])
const aiSources = serverSources.filter((path) => relative(ROOT, path).replace(/\\/g, '/').startsWith('server/src/modules/ai/'))
const rel = (path: string) => relative(ROOT, path).replace(/\\/g, '/')

describe('the model lock: what the code contains', () => {
  it('names exactly one model in the whole server, and it is Claude Haiku 5.5', () => {
    const found = new Map<string, string[]>()
    for (const path of serverSources) {
      for (const match of code(path).matchAll(/['"`](claude[-.\w]*)['"`]/gi)) found.set(match[1], [...(found.get(match[1]) ?? []), rel(path)])
    }
    expect([...found.keys()]).toEqual(['claude-haiku-5-5'])
    // ... and it is written in one place: the constant everything else uses.
    expect(found.get('claude-haiku-5-5')).toEqual(['server/src/modules/ai/model.ts'])
    expect(AI_MODEL_ID).toBe('claude-haiku-5-5')
    expect(AI_MODEL_NAME).toBe('Claude Haiku 5.5')
    expect(AI_PROVIDER).toBe('anthropic')
  })

  it('names no model of any other family anywhere in the server', () => {
    const other = /\b(gpt-?\d[\w.-]*|gpt-?[a-z]+[\w.-]*|o[134]-(mini|pro|preview)|chatgpt|gemini[\w.-]*|llama[\w.-]*|mistral[\w.-]*|mixtral|deepseek[\w.-]*|command-r[\w.-]*|grok[\w.-]*|claude-(sonnet|opus|instant|2|3|4)[\w.-]*|haiku-?[0-4][\w.-]*)\b/i
    const hits = serverSources.flatMap((path) => (other.test(code(path)) ? [rel(path)] : []))
    expect(hits).toEqual([])
  })

  it('has no provider package other than the Anthropic one, and instantiates that one in a single file', () => {
    const imports = new Map<string, Set<string>>()
    for (const path of serverSources) {
      for (const match of code(path).matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
        const name = match[1]
        if (name.startsWith('.') || name.startsWith('node:')) continue
        imports.set(name, new Set([...(imports.get(name) ?? []), rel(path)]))
      }
    }
    const providers = [...imports.keys()].filter((name) => /^@ai-sdk\//.test(name) || /openai|google|mistral|cohere|groq|ollama|bedrock|vertex|azure|together|deepseek|perplexity|xai|fireworks|replicate|huggingface|langchain|llamaindex/i.test(name))
    expect(providers).toEqual(['@ai-sdk/anthropic'])
    expect([...imports.get('@ai-sdk/anthropic')!]).toEqual(['server/src/modules/ai/model.ts'])
    const creators = serverSources.filter((path) => /createAnthropic\s*\(/.test(code(path))).map(rel)
    expect(creators).toEqual(['server/src/modules/ai/model.ts'])
    // The SDK's own "model by name" and gateway routes are never used: a plain string would be resolved by the Vercel AI Gateway.
    expect(serverSources.filter((path) => /\bcreateGateway\b|\bgateway\s*\(|customProvider|createProviderRegistry|providerRegistry|experimental_createProviderRegistry/.test(code(path))).map(rel)).toEqual([])
  })

  it('declares no other AI provider as a dependency of the project', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    const aiPackages = names.filter((name) => /^@ai-sdk\//.test(name) || /^(ai|openai|@google\/|@anthropic-ai\/|@mistralai\/|cohere|groq|ollama|@langchain\/|langchain|@huggingface\/|replicate)/i.test(name))
    expect(aiPackages.sort()).toEqual(['@ai-sdk/anthropic', '@ai-sdk/react', 'ai'])
  })

  it('has no setting, variable, parameter or list that could select or replace the model', () => {
    // Model-selecting names: only the rejected-leftover detection (config.ts) reads ANTHROPIC_MODEL, and the connection test's
    // message tells the operator to remove it; nothing else mentions it.
    const usesEnv = serverSources.filter((path) => /ANTHROPIC_MODEL/.test(code(path))).map(rel)
    expect(usesEnv).toEqual(['server/src/config.ts', 'server/src/modules/ai/connection.ts'])
    expect(code(join(ROOT, 'server', 'src', 'config.ts')).match(/ANTHROPIC_MODEL/g)).toHaveLength(1)
    const selectors = /\b(AI_MODEL(?!_ID|_NAME)|AI_FALLBACK\w*|FALLBACK_MODEL\w*|MODEL_FALLBACK\w*|OPENAI_\w+|GOOGLE_GENERATIVE_AI\w*|fallbackModels?|fallbacks|modelFallback\w*|modelList|models\s*:\s*\[|alternativeModel\w*|backupModel\w*|secondaryModel\w*|modelRouter|routeModel|selectModel|chooseModel|pickModel)\b/
    expect(aiSources.filter((path) => selectors.test(code(path))).map(rel)).toEqual([])
    // The model is not a field of the settings an administrator can save, nor of the settings' defaults.
    const config = loadConfig({ APP_ENV: 'test', DATABASE_PATH: ':memory:', EMAIL_PROVIDER: 'none' })
    expect(Object.keys(config.ai.defaults).filter((key) => /model/i.test(key))).toEqual([])
    // The model and the provider are not part of what a request to the gateway may carry (the route reads named fields only).
    const routes = code(join(ROOT, 'server', 'src', 'modules', 'ai', 'routes.ts'))
    expect(routes).not.toMatch(/body\.(model|provider|tools|system|instructions|messages)\b/)
  })

  it('sends every model call through the one guarded model, and nowhere else', () => {
    const callers = serverSources.filter((path) => /\b(streamText|generateText|generateObject|streamObject|embed|embedMany|generateImage|experimental_generate\w*)\s*\(/.test(code(path))).map(rel)
    expect(callers.sort()).toEqual(['server/src/modules/ai/connection.ts', 'server/src/modules/ai/gateway.ts'])
    const gateway = code(join(ROOT, 'server', 'src', 'modules', 'ai', 'gateway.ts'))
    const connection = code(join(ROOT, 'server', 'src', 'modules', 'ai', 'connection.ts'))
    // The gateway's model is the guarded one; the connection test is handed the same factory.
    expect(gateway).toMatch(/const model = await this\.model\(observation\)/)
    expect(gateway).toMatch(/streamText\(\{\s*model,/)
    expect(gateway).toMatch(/runConnectionTest\(this\.app, \(observation\) => this\.model\(observation\)/)
    expect(connection).toMatch(/model: await modelFor\(observation\)/)
    // A model comes from exactly one place in the gateway: no second instance, no alternative, no retry with another.
    expect(gateway.match(/guardModel\(/g)).toHaveLength(1)
    expect(gateway.match(/createAiModel\(/g)).toHaveLength(1)
    expect(gateway).not.toMatch(/maxRetries:\s*[2-9]/)
    // The only retry the SDK makes is a second try against the same model (maxRetries: 1); there is no catch that starts another request.
    expect(gateway.match(/\bstreamText\(/g)).toHaveLength(1)
  })

  it('keeps the model identifier and the provider out of every browser bundle and every key out of the source', () => {
    const front = files(join(ROOT, 'src'), ['.ts', '.tsx']).filter((path) => !/\.test\.tsx?$/.test(path))
    // The admin names the model it is told about; the identifier itself must come from the server, not be written in the website.
    expect(front.filter((path) => /claude-haiku|claude-sonnet|claude-opus|@ai-sdk\/anthropic|createAnthropic|api\.anthropic\.com/.test(code(path))).map(rel)).toEqual([])
    // No secret has a VITE_ name (those are baked into the browser bundle), and no key is written anywhere.
    const env = readFileSync(join(ROOT, '.env.example'), 'utf8')
    expect(env).not.toMatch(/^\s*VITE_\w*(ANTHROPIC|API_KEY|SECRET|TOKEN)\w*\s*=/im)
    const everything = [...serverSources, ...front, ...files(join(ROOT, 'tools'), ['.ts', '.cjs', '.mjs'])]
    expect(everything.filter((path) => /sk-ant-[A-Za-z0-9_-]{10,}/.test(readFileSync(path, 'utf8'))).map(rel)).toEqual([])
    expect(env).not.toMatch(/sk-ant-[A-Za-z0-9_-]{10,}/)
    expect(env).not.toMatch(/^\s*ANTHROPIC_MODEL\s*=\s*(?!claude-haiku-5-5\s*$)\S+/im)
  })

  it('writes the API key to no log line and to no response of the assistant', () => {
    const logging = serverSources.filter((path) => /(log|logger)\.(info|warn|error|debug)\([^)]*\b(apiKey|API_KEY)/.test(code(path))).map(rel)
    expect(logging).toEqual([])
    // The key is held in configuration only; the redacted view that the System page shows names it "set" or "missing".
    const config = readFileSync(join(ROOT, 'server', 'src', 'config.ts'), 'utf8')
    expect(config).toMatch(/apiKey: config\.ai\.apiKey \? 'set' : 'missing'/)
  })
})

describe('the model lock: what the runtime does', () => {
  let server: TestServer | null = null
  afterEach(async () => {
    await server?.close()
    server = null
  })

  const mock = (modelId: string, provider = 'anthropic.messages') => new MockLanguageModelV4({ modelId, provider })

  it('accepts only the required model of the Anthropic provider', () => {
    expect(() => assertLockedModel(mock(AI_MODEL_ID))).not.toThrow()
    expect(() => assertLockedModel(mock('claude-sonnet-5-5'))).toThrow(ModelLockError)
    expect(() => assertLockedModel(mock('claude-opus-5-5'))).toThrow(ModelLockError)
    expect(() => assertLockedModel(mock('claude-haiku-4-5'))).toThrow(ModelLockError)
    expect(() => assertLockedModel(mock('gpt-5'))).toThrow(ModelLockError)
    // The right name from the wrong provider is not the required model.
    expect(() => assertLockedModel(mock(AI_MODEL_ID, 'openai.chat'))).toThrow(/model_not_anthropic/)
    expect(() => assertLockedModel(mock(AI_MODEL_ID, 'google.generative-ai'))).toThrow(/model_not_anthropic/)
    // A bare string would be resolved by the AI SDK through the Vercel AI Gateway: never.
    expect(() => assertLockedModel('anthropic/claude-haiku-5-5')).toThrow(ModelLockError)
    expect(() => assertLockedModel(AI_MODEL_ID)).toThrow(ModelLockError)
    expect(() => assertLockedModel(null)).toThrow(ModelLockError)
    expect(() => assertLockedModel({})).toThrow(ModelLockError)
  })

  it('refuses an answer from any other identifier, exactly, including look-alikes', () => {
    for (const reported of ['claude-sonnet-5-5', 'claude-haiku-5', 'claude-haiku-5-5-20260101', 'CLAUDE-HAIKU-5-5', 'claude-haiku-5-5 ', 'claude-haiku-4-5', '']) {
      const observation = new ModelObservation()
      expect(() => observation.see(reported)).toThrow(ModelLockError)
      expect(observation.verified).toBe(false)
      expect(observation.mismatch).toBe(reported)
    }
    const good = new ModelObservation()
    good.see(AI_MODEL_ID)
    expect(good.verified).toBe(true)
    // Nothing reported is not verification.
    const silent = new ModelObservation()
    silent.see(undefined)
    expect(silent.verified).toBe(false)
  })

  it('stops a streamed answer that names another model before any of it is passed on', async () => {
    const observation = new ModelObservation()
    const model = await guardModel(scriptedModel([say('Hello from somebody else', { input: 10, output: 5 }, { reportedModel: 'claude-sonnet-5-5' })]), observation)
    const { stream } = await model.doStream({ prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }] })
    const seen: string[] = []
    let failure: unknown = null
    const reader = stream.getReader()
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      seen.push(next.value.type)
      if (next.value.type === 'error') failure = next.value.error
    }
    // The stream ends with the lock's error, and none of what the other model wrote comes out of it.
    expect(failure).toBeInstanceOf(ModelLockError)
    expect((failure as ModelLockError).code).toBe('model_mismatch')
    expect(seen).not.toContain('text-delta')
    expect(seen).not.toContain('finish')
    expect(observation.mismatch).toBe('claude-sonnet-5-5')
  })

  it('does not let a gateway be built on another model: it is refused and the visitor is told the assistant is unavailable', async () => {
    const wrong = new MockLanguageModelV4({ modelId: 'claude-sonnet-5-5', provider: 'anthropic.messages' })
    server = await startServer({ env: { MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-ai-media-')) }, aiModel: async () => wrong })
    const created = await server.api('/api/ai/session', { body: {} })
    const response = await server.fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AI-Session': created.json.data.token as string }, body: JSON.stringify({ conversationId: 'conv-lock-0123456789', trigger: 'submit-user-message', language: 'en', text: 'hello' }) })
    expect(response.status).toBe(503)
    expect(((await response.json()) as any).error.details.reason).toBe('model_unverified')
    // Nothing was requested from the wrong model.
    expect(wrong.doStreamCalls).toHaveLength(0)
    expect(wrong.doGenerateCalls).toHaveLength(0)
  })

  it('answers with the required model and records the provider\'s own word for it', async () => {
    const model = scriptedModel([say('A normal answer. ')])
    server = await startServer({ env: { MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-ai-media-')) }, aiModel: async () => model })
    const created = await server.api('/api/ai/session', { body: {} })
    const response = await server.fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AI-Session': created.json.data.token as string }, body: JSON.stringify({ conversationId: 'conv-lock-9876543210', trigger: 'submit-user-message', language: 'en', text: 'hello', model: 'claude-sonnet-5-5', provider: 'openai' }) })
    expect(answerText(parseSse(await response.text()))).toBe('A normal answer. ')
    const row = server.db.get<{ model: string; actual_model: string; model_verified: number; status: string }>('SELECT model, actual_model, model_verified, status FROM ai_requests')
    expect(row).toMatchObject({ model: 'claude-haiku-5-5', actual_model: 'claude-haiku-5-5', model_verified: 1, status: 'completed' })
    // The model and the provider that came in the request body were ignored: the one model call was made to the required model.
    expect(model.doStreamCalls).toHaveLength(1)
    expect(model.modelId).toBe('claude-haiku-5-5')
  })
})
