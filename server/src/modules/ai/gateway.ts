import type { LanguageModel, UIMessage } from 'ai'
import type { AiSettings, Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { HttpError, notFound, rateLimited } from '../../http/errors.ts'
import { newId } from '../../lib/crypto.ts'
import { cleanBlock } from '../../lib/text.ts'
import { addMs, HOUR } from '../../lib/time.ts'
import { finish, IpLimiter, estimateTokens, reserve, type Outcome, type Reservation, type Usage } from './budget.ts'
import { Knowledge } from './knowledge.ts'
import { instructionsFor } from './prompt.ts'
import { availability, loadSettings } from './settings.ts'
import { createConversation, getConversation, loadMessages, saveMessages, setLanguage, setTitle, type ConversationRow, type StoredMessage } from './store.ts'
import { buildTools } from './tools.ts'

/**
 * The gateway: one visitor's message in, a streamed answer out, with every guard in front of the model and every number
 * recorded after it. In order: availability, the session and the client address, the shape of the message (the browser sends
 * only a conversation id, the language and ONE new message: never history, a model, a tool or an instruction), the
 * conversation's own limits, the budget reservation, then the model with the closed tool set, and finally the reconciliation of
 * what the provider reported. The conversation the model sees is the server's own copy.
 */

export type Trigger = 'submit-user-message' | 'regenerate-assistant-message'

export interface ChatRequest {
  sessionId: string
  ip: string
  ipHash: string
  conversationId: string
  language: Language
  trigger: Trigger
  text: string
  /** Aborted when the client goes away. */
  signal: AbortSignal
}

/** Where the model comes from: the real provider by default; tests hand in a mock. */
export type ModelProvider = () => Promise<LanguageModel>

/** The pieces the gateway keeps for the life of the server. */
export class Assistant {
  readonly app: AppContext
  readonly knowledge: Knowledge
  readonly ipLimiter: IpLimiter
  private readonly provider: ModelProvider | null
  /** Conversations with an answer in progress (one at a time each) and how many answers each session has going. */
  private readonly busy = new Set<string>()
  private readonly perSession = new Map<string, number>()

  constructor(app: AppContext, provider: ModelProvider | null = null) {
    this.app = app
    this.knowledge = new Knowledge(app)
    this.ipLimiter = new IpLimiter(app)
    this.provider = provider
  }

  /** The configured model, created on first use (the provider's package is loaded then, not at start-up). */
  private async model(): Promise<LanguageModel> {
    if (this.provider) return this.provider()
    const { createAnthropic } = await import('@ai-sdk/anthropic')
    const { apiKey, baseUrl, model } = this.app.config.ai
    return createAnthropic({ apiKey: apiKey ?? undefined, ...(baseUrl ? { baseURL: baseUrl } : {}) })(model)
  }

  sweep(): void {
    this.ipLimiter.sweep()
  }

  /**
   * One small request to the configured model, outside any conversation, for the operator (`npm run server:cli -- ai check`):
   * proves the key, the model identifier and the address work, and shows the token counts the provider reports and what they
   * cost at the configured prices. It spends a few tokens of real money, so it only runs when asked.
   */
  async check(message: string): Promise<Record<string, unknown>> {
    const { app } = this
    if (!app.config.ai.apiKey) throw new Error('ANTHROPIC_API_KEY is not set.')
    const settings = loadSettings(app)
    const { generateText } = await import('ai')
    const started = performance.now()
    const result = await generateText({
      model: await this.model(),
      instructions: 'You are a connection test. Answer with one short sentence.',
      prompt: message,
      maxOutputTokens: 400,
      maxRetries: 0,
      providerOptions: { anthropic: { effort: 'low' } },
    })
    const usage = usageOf(result.usage)
    return {
      model: app.config.ai.model,
      baseUrl: app.config.ai.baseUrl ?? 'https://api.anthropic.com/v1 (default)',
      answer: result.text.slice(0, 300),
      finishReason: result.finishReason,
      latencyMs: Math.round(performance.now() - started),
      usage,
      estimatedCostUsd: usage ? (usage.inputTokens * settings.priceInputPerMTok + usage.outputTokens * settings.priceOutputPerMTok) / 1_000_000 : null,
      pricesUsed: { inputPerMTok: settings.priceInputPerMTok, outputPerMTok: settings.priceOutputPerMTok, asOf: settings.pricesAsOf },
      note: 'The cost is the reported tokens times the configured prices: an estimate, not a bill.',
    }
  }

  async chat(request: ChatRequest): Promise<Response> {
    const { app } = this
    const settings = loadSettings(app)
    const state = availability(app, settings)
    if (!state.available) throw new HttpError(503, 'service_unavailable', 'The assistant is not available right now.', { details: { reason: 'unavailable' } })
    if (!settings.languages.includes(request.language)) throw new HttpError(422, 'validation_failed', 'This language is not offered by the assistant.', { details: { fields: { language: 'invalid' } } })
    this.ipLimiter.check(request.ip, settings.maxRequestsPerIp)

    // ---- the message
    let text = ''
    if (request.trigger === 'submit-user-message') {
      text = cleanBlock(request.text)
      if (text === '') throw new HttpError(422, 'validation_failed', 'Write a message first.', { details: { fields: { text: 'required' } } })
      if ([...text].length > settings.maxInputChars) throw new HttpError(422, 'validation_failed', `The message is longer than ${settings.maxInputChars} characters.`, { details: { fields: { text: 'tooLong' }, max: settings.maxInputChars } })
    }

    // ---- the conversation
    const now = app.clock.now()
    let conversation = getConversation(app.db, request.sessionId, request.conversationId)
    const isNew = !conversation
    if (conversation?.deleted_at) throw notFound('The conversation')
    if (conversation && new Date(conversation.created_at).getTime() + settings.conversationMaxHours * HOUR < now.getTime()) throw new HttpError(409, 'conflict', 'This conversation has reached its time limit. Start a new one.', { details: { reason: 'conversation_expired' } })
    if (conversation && conversation.message_count >= settings.maxConversationMessages) throw new HttpError(409, 'conflict', 'This conversation has reached its length limit. Start a new one.', { details: { reason: 'conversation_full' } })
    if (!conversation && request.trigger === 'regenerate-assistant-message') throw notFound('The conversation')
    if (this.busy.has(request.conversationId)) throw new HttpError(409, 'conflict', 'An answer is already being written.', { details: { reason: 'busy' } })
    if ((this.perSession.get(request.sessionId) ?? 0) >= 2) throw rateLimited(10)

    const history: UIMessage[] = conversation ? loadMessages(app.db, conversation.id).map(parse) : []
    let messages = history
    if (request.trigger === 'regenerate-assistant-message') {
      // Drop the last answer (everything after the last visitor message); there must be a visitor message to answer.
      let cut = messages.length
      while (cut > 0 && messages[cut - 1].role === 'assistant') cut -= 1
      messages = messages.slice(0, cut)
      if (messages.length === 0) throw new HttpError(422, 'validation_failed', 'There is nothing to answer.', { details: { fields: { trigger: 'invalid' } } })
    } else {
      messages = [...messages, { id: newId(), role: 'user', parts: [{ type: 'text', text }] }]
    }

    // What the model is sent: the last N messages, starting with a visitor message so a cut never leaves an answer without its question.
    let windowed = messages.slice(-settings.maxHistoryMessages)
    while (windowed.length > 0 && windowed[0].role !== 'user') windowed = windowed.slice(1)

    const instructions = instructionsFor(request.language, settings)
    const promptTokens = estimateTokens(instructions.length + JSON.stringify(windowed).length)

    // ---- the conversation row and the reservation: one counts, the other can refuse
    if (!conversation) conversation = createConversation(app.db, app.clock, request.sessionId, request.conversationId, request.language)
    let reservation: Reservation
    try {
      reservation = reserve(app, settings, { conversationId: conversation.id, sessionId: request.sessionId, ipHash: request.ipHash, model: app.config.ai.model, promptTokens, newConversation: isNew })
    } catch (error) {
      // A brand-new conversation that was refused leaves nothing behind.
      if (isNew) app.db.run('DELETE FROM ai_conversations WHERE id = ?', [conversation.id])
      throw error
    }

    this.busy.add(conversation.id)
    this.perSession.set(request.sessionId, (this.perSession.get(request.sessionId) ?? 0) + 1)
    const release = () => {
      this.busy.delete(request.conversationId)
      const open = (this.perSession.get(request.sessionId) ?? 1) - 1
      if (open <= 0) this.perSession.delete(request.sessionId)
      else this.perSession.set(request.sessionId, open)
    }

    try {
      if (conversation.language !== request.language) setLanguage(app.db, conversation.id, request.language)
      if (request.trigger === 'submit-user-message') setTitle(app.db, conversation.id, [...text.replace(/\s+/g, ' ')].slice(0, 60).join(''))
      // The question is kept even if the answer fails: the visitor can retry.
      saveMessages(app.db, app.clock, conversation.id, messages.map(store))
      return await this.stream({ request, settings, conversation, reservation, messages, windowed, instructions, release })
    } catch (error) {
      release()
      finish(app, settings, reservation, { status: 'failed', usage: null, steps: 0, toolCalls: 0, errorCode: classify(error), latencyMs: 0, firstTokenMs: null })
      throw error
    }
  }

  private async stream(input: {
    request: ChatRequest
    settings: AiSettings
    conversation: ConversationRow
    reservation: Reservation
    messages: UIMessage[]
    windowed: UIMessage[]
    instructions: string
    release: () => void
  }): Promise<Response> {
    const { app } = this
    const { request, settings, conversation, reservation, messages, windowed, instructions, release } = input
    const { streamText, isStepCount, convertToModelMessages, toUIMessageStream, createUIMessageStreamResponse } = await import('ai')
    const model = await this.model()
    const counter = { calls: 0 }
    const tools = await buildTools({ app, knowledge: this.knowledge, settings, conversationId: conversation.id, sessionId: request.sessionId, language: request.language, ipHash: request.ipHash, requestId: reservation.id, counter })
    const modelMessages = await convertToModelMessages(windowed, { tools, ignoreIncompleteToolCalls: true })

    const started = performance.now()
    let firstToken: number | null = null
    let finalized = false
    let steps = 0
    let errorCode: string | null = null
    let timedOut = false
    const settle = (outcome: Pick<Outcome, 'status' | 'usage'>) => {
      if (finalized) return
      finalized = true
      release()
      finish(app, settings, reservation, { ...outcome, steps, toolCalls: counter.calls, errorCode: outcome.status === 'completed' ? null : errorCode ?? (outcome.status === 'aborted' ? 'aborted' : 'failed'), latencyMs: performance.now() - started, firstTokenMs: firstToken })
    }

    const thinking = settings.thinking === 'disabled' ? ({ type: 'disabled' } as const) : ({ type: 'adaptive' } as const)
    const result = streamText({
      model,
      instructions,
      messages: modelMessages,
      tools,
      stopWhen: isStepCount(settings.maxToolCalls),
      maxOutputTokens: settings.maxOutputTokens,
      maxRetries: 1,
      abortSignal: request.signal,
      timeout: { totalMs: app.config.ai.timeoutMs, stepMs: Math.ceil(app.config.ai.timeoutMs / 2), firstChunkMs: Math.ceil(app.config.ai.timeoutMs / 3) },
      providerOptions: { anthropic: { effort: settings.effort, thinking } },
      onChunk: ({ chunk }) => {
        if (firstToken === null && (chunk.type === 'text-delta' || chunk.type === 'tool-call')) firstToken = performance.now() - started
        if (chunk.type === 'finish-step') steps += 1
      },
      onError: ({ error }) => {
        errorCode = classify(error)
        app.log.warn('assistant request failed', { code: errorCode, error: error instanceof Error ? { name: error.name } : 'unknown' })
        settle({ status: 'failed', usage: null })
      },
      onAbort: ({ steps: done }) => {
        // The visitor going away aborts through the request's signal; the SDK's own timeouts abort without it.
        timedOut = !request.signal.aborted
        errorCode = timedOut ? 'timeout' : 'aborted'
        settle({ status: timedOut ? 'failed' : 'aborted', usage: sumUsage(done.map((step) => step.usage)) })
      },
      onEnd: (event) => {
        const usage = usageOf(event.usage)
        const failed = event.finishReason === 'error'
        if (failed && !errorCode) errorCode = 'provider_error'
        if (event.finishReason === 'content-filter' && !errorCode) errorCode = 'refusal'
        settle({ status: failed ? 'failed' : 'completed', usage })
      },
    })

    // The answer is written to the end even if the visitor has left, so what was paid for is kept (the abort signal still stops it).
    void result.consumeStream()

    const ui = toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      // Without an id of its own every answer would be stored as "" and the second answer of a conversation could not be kept.
      generateMessageId: newId,
      onError: (error) => classify(error),
      sendReasoning: false,
      onEnd: ({ messages: finalMessages }) => {
        try {
          saveMessages(app.db, app.clock, conversation.id, trim(finalMessages).map(store))
        } catch (error) {
          app.log.warn('assistant conversation could not be saved', { error: error instanceof Error ? { name: error.name } : 'unknown' })
        }
      },
    })
    // Whatever ends the response (done, cancelled, failed), the reservation is reconciled exactly once.
    const guard = new TransformStream<unknown, unknown>({
      // A stalled provider ends the stream without an error part of its own: the visitor is told, in a code.
      flush: (controller) => {
        if (timedOut) controller.enqueue({ type: 'error', errorText: 'timeout' })
        settle({ status: 'completed', usage: null })
      },
    })
    const response = createUIMessageStreamResponse({ stream: ui.pipeThrough(guard as unknown as TransformStream) })
    const body = response.body
    if (!body) throw new Error('The assistant produced no stream.')
    const watched = body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, controller) => controller.enqueue(chunk),
        cancel: () => settle({ status: 'aborted', usage: null }),
      }),
    )
    return new Response(watched, { status: 200, headers: response.headers })
  }
}

// ---- helpers ----------------------------------------------------------------------------------------------------------

const parse = (stored: StoredMessage): UIMessage => JSON.parse(stored.json) as UIMessage
const store = (message: UIMessage): StoredMessage => ({ id: message.id, role: message.role === 'user' ? 'user' : 'assistant', json: JSON.stringify(message) })

/** What is kept of an answer: no reasoning (nothing to show, and it is not replayed), and the step markers the interface does not need. */
function trim(messages: UIMessage[]): UIMessage[] {
  const kept = messages.map((message) => ({ ...message, parts: message.parts.filter((part) => part.type !== 'reasoning') }))
  // An answer that produced nothing (the provider failed first) is not kept: it would be an empty turn in the next prompt.
  return kept.filter((message) => message.role !== 'assistant' || message.parts.some((part) => (part.type === 'text' ? part.text.trim() !== '' : part.type !== 'step-start')))
}

interface UsageLike {
  inputTokens?: number | undefined
  outputTokens?: number | undefined
  inputTokenDetails?: { cacheReadTokens?: number | undefined; cacheWriteTokens?: number | undefined } | undefined
  outputTokenDetails?: { reasoningTokens?: number | undefined } | undefined
}

function usageOf(usage: UsageLike | undefined): Usage | null {
  if (!usage || (usage.inputTokens === undefined && usage.outputTokens === undefined)) return null
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens,
  }
}

function sumUsage(list: UsageLike[]): Usage | null {
  const used = list.map(usageOf).filter((usage): usage is Usage => usage !== null)
  if (used.length === 0) return null
  return {
    inputTokens: used.reduce((sum, usage) => sum + usage.inputTokens, 0),
    outputTokens: used.reduce((sum, usage) => sum + usage.outputTokens, 0),
    cacheReadTokens: used.reduce((sum, usage) => sum + (usage.cacheReadTokens ?? 0), 0),
    cacheWriteTokens: used.reduce((sum, usage) => sum + (usage.cacheWriteTokens ?? 0), 0),
    reasoningTokens: used.reduce((sum, usage) => sum + (usage.reasoningTokens ?? 0), 0),
  }
}

/**
 * A short code for what went wrong, safe to show a visitor (the website words it in three languages) and to store: the
 * provider's message, which may quote a request, is never sent to the browser or kept.
 */
export function classify(error: unknown): string {
  if (error instanceof HttpError) return error.code
  const e = error as { name?: string; statusCode?: number; status?: number; isRetryable?: boolean } | null
  const status = e?.statusCode ?? e?.status
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return 'timeout'
  if (status === 401 || status === 403) return 'provider_auth'
  if (status === 429) return 'provider_rate_limit'
  if (status === 529 || (typeof status === 'number' && status >= 500)) return 'provider_unavailable'
  if (typeof status === 'number' && status >= 400) return 'provider_error'
  if (e?.name === 'AI_RetryError' || e?.name === 'AI_APICallError') return 'provider_unavailable'
  return 'assistant_error'
}

export { addMs }
