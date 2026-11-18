import { randomUUID } from 'node:crypto'
import type { LanguageModel, ToolSet, UIMessage } from 'ai'
import { LANGUAGES, type AiSettings, type Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { forbidden, HttpError, notFound, rateLimited, unauthorized, validationFailed } from '../../http/errors.ts'
import { newId } from '../../lib/crypto.ts'
import type { Logger } from '../../lib/logger.ts'
import { cleanBlock } from '../../lib/text.ts'
import { addMs, HOUR } from '../../lib/time.ts'
import { alertForRefusal, checkThresholds, raiseProviderAlert } from './alerts.ts'
import { BudgetRefusal, finish, IpLimiter, estimateTokens, recordLimitEvent, reserve, type Outcome, type Reservation, type Usage } from './budget.ts'
import { runConnectionTest, type ConnectionResult } from './connection.ts'
import { Knowledge } from './knowledge.ts'
import { AI_MODEL_ID, createAiModel, guardModel, ModelLockError, ModelObservation, type LockedModel } from './model.ts'
import { instructionsFor } from './prompt.ts'
import { findSensitive } from './sensitive.ts'
import { adminAvailability, availability, loadSettings } from './settings.ts'
import { createConversation, getConversation, loadMessages, saveMessages, setLanguage, setTitle, type StoredMessage } from './store.ts'
import { buildTools } from './tools.ts'
import { recordFailed, recordLastError } from './verification.ts'
import { AccessDenied, accessFor, type Authority, type Policy } from './adminassistant/access.ts'
import { adminInstructions } from './adminassistant/prompt.ts'
import { ContextUnavailable, resolveScope } from './adminassistant/scope.ts'
import { ADMIN_CONVERSATION_ID, closeAdminConversation, createAdminConversation, CONTEXT_TYPES, deleteAdminConversation, getAdminConversation, loadAdminMessages, saveAdminMessages, setAdminLanguage, setAdminTitle, type ContextType } from './adminassistant/store.ts'
import { buildAdminTools } from './adminassistant/tools.ts'
import { REFERENCE, RECORD_ID } from './adminassistant/model.ts'
import { audit } from '../system/audit.ts'

/**
 * The gateway: one visitor's message in, a streamed answer out, with every guard in front of the model and every number
 * recorded after it. In order: availability, the session and the client address, the shape of the message (the browser sends
 * only a conversation id, the language and ONE new message: never history, a model, a tool or an instruction), the
 * conversation's own limits, the global limit on answers at once, the budget reservation, then the model with the closed tool set,
 * and finally the reconciliation of what the provider reported. The conversation the model sees is the server's own copy.
 *
 * Streaming does not bypass any of it: the guards run before the first byte is streamed, the reservation is made before the provider is
 * called, and whatever ends the stream (done, failed, cut off, cancelled by the visitor, the server shutting down) reconciles it exactly once.
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
  /** The HTTP request's id (`X-Request-Id`): it is stored with the usage row and put on every log line, so one request can be followed end to end. */
  requestId?: string
  /** The HTTP request's logger (already carrying the request id). */
  log?: Logger
}

/** One administrator's message in (PROMPT 31). The administrator is the session, not a field of the body. */
export interface AdminChatRequest {
  authority: Authority
  ip: string
  ipHash: string
  conversationId: string
  language: Language
  /** Where a NEW conversation is about (ignored for an existing one: a conversation keeps the context it started with). */
  context: { type: ContextType; ref: string | null }
  trigger: Trigger
  text: string
  signal: AbortSignal
  requestId?: string
  log?: Logger
  /** Only tests hand in a stricter policy than the administration's own `can`. */
  policy?: Policy
}

/** Where the model comes from: the real provider by default; tests hand in a mock. */
export type ModelProvider = () => Promise<LanguageModel>

/** An answer in progress: how to cancel it, and a promise that resolves when it has been reconciled. */
interface Running {
  stop: () => void
  done: Promise<void>
}

/** The pieces the gateway keeps for the life of the server. */
export class Assistant {
  readonly app: AppContext
  readonly knowledge: Knowledge
  readonly ipLimiter: IpLimiter
  private readonly provider: ModelProvider | null
  /** Conversations with an answer in progress (one at a time each) and how many answers each session has going. */
  private readonly busy = new Set<string>()
  private readonly perSession = new Map<string, number>()
  /** The answers in progress, by usage row, so a shutdown can wait for them and cancel what is left. */
  private readonly running = new Map<string, Running>()
  /** Set when the server is shutting down: nothing new is accepted. */
  private draining = false

  constructor(app: AppContext, provider: ModelProvider | null = null) {
    this.app = app
    this.knowledge = new Knowledge(app)
    this.ipLimiter = new IpLimiter(app)
    this.provider = provider
  }

  /** How many answers are being written right now (all visitors together). */
  get inFlight(): number {
    return this.running.size
  }

  get shuttingDown(): boolean {
    return this.draining
  }

  /**
   * THE model instance: Claude Haiku 5.5 from the Anthropic provider (model.ts), created once, on first use. The only other
   * way to get a model here is the `provider` a test hands in, and it passes the same lock (`guardModel`): it must be named
   * `claude-haiku-5-5` and come from an `anthropic…` provider, or it is refused.
   */
  private base: Promise<LockedModel> | null = null
  private baseModel(): Promise<LockedModel> {
    this.base ??= (async () => {
      if (this.provider) return (await this.provider()) as LockedModel
      const { apiKey, baseUrl, connectTimeoutMs } = this.app.config.ai
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.')
      return createAiModel({ apiKey, baseUrl, connectTimeoutMs })
    })()
    return this.base
  }

  /** The model for one request, wrapped so that what the provider reports about itself is checked and kept in `observation`. */
  private async model(observation: ModelObservation): Promise<LockedModel> {
    if (this.app.config.ai.modelOverride !== null) throw new ModelLockError('model_not_locked', this.app.config.ai.modelOverride)
    return guardModel(await this.baseModel(), observation)
  }

  sweep(): void {
    this.ipLimiter.sweep()
  }

  /**
   * Graceful shutdown: no new answer is accepted, the ones under way are given `graceMs` to finish, and what is left is cancelled (each is
   * reconciled as `aborted`, so what was paid for is booked and no reservation is left hanging). Resolves when every answer is settled.
   */
  async shutdown(graceMs = 4000): Promise<void> {
    this.draining = true
    const pause = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms).unref()
      })
    const settled = () => Promise.all([...this.running.values()].map((entry) => entry.done)).then(() => undefined)
    await Promise.race([settled(), pause(graceMs)])
    for (const entry of this.running.values()) entry.stop()
    await Promise.race([settled(), pause(2000)])
  }

  /**
   * The connection test (administration and `npm run server:cli -- ai check`): one minimal request to the required model that
   * proves the key, the address and the model identifier work AND that the provider names Claude Haiku 5.5 as the model that
   * answered. It spends a few tokens of real money, so it only runs when asked. The result is recorded; it never switches the
   * assistant on.
   */
  async connectionTest(actorId: string | null): Promise<ConnectionResult> {
    return runConnectionTest(this.app, (observation) => this.model(observation), actorId)
  }

  async chat(request: ChatRequest): Promise<Response> {
    const { app } = this
    const settings = loadSettings(app)
    const state = availability(app, settings)
    if (!state.available) throw unavailable(state.reason)
    if (this.draining) {
      recordLimitEvent(app, 'shutting_down')
      throw new HttpError(503, 'service_unavailable', 'The assistant is not available right now.', { details: { reason: 'unavailable' }, headers: { 'Retry-After': '30' } })
    }
    if (!settings.languages.includes(request.language)) throw new HttpError(422, 'validation_failed', 'This language is not offered by the assistant.', { details: { fields: { language: 'invalid' } } })
    try {
      this.ipLimiter.check(request.ip, settings.maxRequestsPerIp)
    } catch (error) {
      recordLimitEvent(app, 'ip_rate')
      throw error
    }

    // ---- the message
    let text = ''
    if (request.trigger === 'submit-user-message') {
      text = cleanBlock(request.text)
      if (text === '') throw new HttpError(422, 'validation_failed', 'Write a message first.', { details: { fields: { text: 'required' } } })
      if ([...text].length > settings.maxInputChars) throw new HttpError(422, 'validation_failed', `The message is longer than ${settings.maxInputChars} characters.`, { details: { fields: { text: 'tooLong' }, max: settings.maxInputChars } })
      // A payment card number or a credential is refused before it is stored or sent anywhere (the kind is not even logged with the text).
      if (findSensitive(text) !== null) {
        recordLimitEvent(app, 'sensitive_input')
        throw new HttpError(422, 'validation_failed', 'That message looks like it contains a payment card number or a secret key. Please leave it out.', { details: { reason: 'sensitive_data', fields: { text: 'invalid' } } })
      }
    }

    // ---- the conversation
    const now = app.clock.now()
    let conversation = getConversation(app.db, request.sessionId, request.conversationId)
    const isNew = !conversation
    if (conversation?.deleted_at) throw notFound('The conversation')
    if (conversation && new Date(conversation.created_at).getTime() + settings.conversationMaxHours * HOUR < now.getTime()) throw new HttpError(409, 'conflict', 'This conversation has reached its time limit. Start a new one.', { details: { reason: 'conversation_expired' } })
    if (conversation && conversation.message_count >= settings.maxConversationMessages) throw new HttpError(409, 'conflict', 'This conversation has reached its length limit. Start a new one.', { details: { reason: 'conversation_full' } })
    if (!conversation && request.trigger === 'regenerate-assistant-message') throw notFound('The conversation')
    // One answer at a time per conversation: a double click, or the same request sent twice, is refused instead of being processed twice.
    if (this.busy.has(request.conversationId)) {
      recordLimitEvent(app, 'conversation_busy')
      throw new HttpError(409, 'conflict', 'An answer is already being written.', { details: { reason: 'busy' } })
    }
    if ((this.perSession.get(request.sessionId) ?? 0) >= 2) {
      recordLimitEvent(app, 'session_concurrent')
      throw rateLimited(10)
    }
    // The global limit on answers being written at the same moment (all visitors together): refused at once, not queued, so a burst cannot pile up work.
    if (this.running.size >= settings.maxConcurrentRequests) {
      recordLimitEvent(app, 'concurrent_global')
      throw new HttpError(503, 'service_unavailable', 'The assistant is busy right now.', { details: { reason: 'capacity' }, headers: { 'Retry-After': '5' } })
    }

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
    const requestId = request.requestId ?? randomUUID()
    let reservation: Reservation
    try {
      reservation = reserve(app, settings, { conversationId: conversation.id, sessionId: request.sessionId, ipHash: request.ipHash, model: AI_MODEL_ID, correlationId: requestId, promptTokens, newConversation: isNew })
    } catch (error) {
      // A brand-new conversation that was refused leaves nothing behind.
      if (isNew) app.db.run('DELETE FROM ai_conversations WHERE id = ?', [conversation.id])
      // A limit that stopped a visitor is something the administrator should hear about (once a day / month per limit), and a counter keeps the number.
      if (error instanceof BudgetRefusal) {
        recordLimitEvent(app, error.reason)
        alertForRefusal(app, settings, error.reason)
      }
      throw error
    }

    this.busy.add(conversation.id)
    this.perSession.set(request.sessionId, (this.perSession.get(request.sessionId) ?? 0) + 1)
    // Registered now, before any await: the global limit and a shutdown see this answer from the moment it is accepted, not from the moment
    // the model starts (two requests sent in the same instant cannot both slip under the limit).
    const stopper = new AbortController()
    let resolveDone: () => void = () => undefined
    this.running.set(reservation.id, { stop: () => stopper.abort(), done: new Promise<void>((resolve) => (resolveDone = resolve)) })
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
      return await this.stream({
        signal: request.signal,
        log: request.log,
        requestId,
        settings,
        conversationId: conversation.id,
        reservation,
        messages,
        windowed,
        instructions,
        tools: (counter, rid, log) => buildTools({ app, knowledge: this.knowledge, settings, conversationId: conversation.id, sessionId: request.sessionId, language: request.language, ipHash: request.ipHash, requestId: rid, counter, log }),
        persist: (final) => saveMessages(app.db, app.clock, conversation.id, final.map(store)),
        release,
        stopper,
        resolveDone: () => resolveDone(),
      })
    } catch (error) {
      release()
      this.running.delete(reservation.id)
      resolveDone()
      const code = classify(error)
      finish(app, settings, reservation, { status: 'failed', usage: null, steps: 0, toolCalls: 0, errorCode: code, latencyMs: 0, firstTokenMs: null })
      this.afterFailure(code, null)
      ;(request.log ?? app.log).warn('assistant request could not start', { aiRequest: reservation.id, code })
      // A model that is not the required one is refused before a single token is requested: a controlled "not available".
      throw error instanceof ModelLockError ? unavailable('model_unverified') : error
    }
  }

  /**
   * The AI admin assistant's entry point (PROMPT 31). The same guarded core as `chat()` (the model lock, the budget RESERVATION before the provider is called, the
   * global limit on answers, usage reconciled exactly once however the stream ends) with the differences that matter for an administrator's copilot:
   *
   *  - who is asking is the administrator's SESSION (`authority`), taken from the cookie by the route, never from the body; `assistant:use` is checked here, and every tool
   *    re-checks the session and the data permission when it runs;
   *  - the conversation belongs to that administrator and has ONE context, fixed when it starts and re-validated against the database on every turn;
   *  - the tools are the read-only admin set (adminassistant/tools.ts), the instructions are the admin ones, and the limits are the admin assistant's own
   *    (`adminMax…`), plus one hourly limit per administrator, counted from the shared ledger;
   *  - the ledger row is `audience = 'admin'`, so the public assistant's analytics never include it, while the budget (one ledger) protects the money for both.
   */
  async adminChat(request: AdminChatRequest): Promise<Response> {
    const { app } = this
    const settings = loadSettings(app)
    const state = adminAvailability(app, settings)
    if (!state.available) throw new HttpError(503, 'service_unavailable', 'The admin assistant is not available right now.', { details: { reason: state.reason } })
    const access = accessFor(app, request.authority, request.policy)
    let actor
    try {
      actor = access.need('assistant:use')
    } catch (error) {
      throw error instanceof AccessDenied && error.reason === 'session_ended' ? unauthorized() : forbidden()
    }
    if (this.draining) {
      recordLimitEvent(app, 'shutting_down')
      throw new HttpError(503, 'service_unavailable', 'The assistant is not available right now.', { details: { reason: 'unavailable' }, headers: { 'Retry-After': '30' } })
    }
    if (!(LANGUAGES as readonly string[]).includes(request.language)) throw validationFailed({ language: 'invalid' })
    if (!ADMIN_CONVERSATION_ID.test(request.conversationId)) throw validationFailed({ conversationId: 'invalid' })

    // ---- the message
    let text = ''
    if (request.trigger === 'submit-user-message') {
      text = cleanBlock(request.text)
      if (text === '') throw new HttpError(422, 'validation_failed', 'Write a message first.', { details: { fields: { text: 'required' } } })
      if ([...text].length > settings.adminMaxInputChars) throw new HttpError(422, 'validation_failed', `The message is longer than ${settings.adminMaxInputChars} characters.`, { details: { fields: { text: 'tooLong' }, max: settings.adminMaxInputChars } })
      // A card number or a credential is refused before it is stored or sent anywhere, as for visitors.
      if (findSensitive(text) !== null) {
        recordLimitEvent(app, 'sensitive_input')
        throw new HttpError(422, 'validation_failed', 'That message looks like it contains a payment card number or a secret key. Please leave it out.', { details: { reason: 'sensitive_data', fields: { text: 'invalid' } } })
      }
    }

    // ---- the conversation and its context
    const now = app.clock.now()
    let conversation = getAdminConversation(app.db, request.authority.userId, request.conversationId)
    const isNew = !conversation
    if (!conversation && request.trigger === 'regenerate-assistant-message') throw notFound('The conversation')
    // An id that belongs to ANOTHER administrator's conversation is answered like one that does not exist (and never reaches the insert below, which would collide with it).
    if (!conversation && app.db.get('SELECT 1 AS present FROM ai_admin_conversations WHERE id = ?', [request.conversationId])) throw notFound('The conversation')
    const contextType: ContextType = conversation ? conversation.context_type : request.context.type
    const contextRef: string | null = conversation ? conversation.context_ref : request.context.ref
    if (!(CONTEXT_TYPES as readonly string[]).includes(contextType) || (contextType === 'general' ? contextRef !== null : contextRef === null || !(REFERENCE.test(contextRef) || RECORD_ID.test(contextRef)))) throw validationFailed({ context: 'invalid' })
    try {
      // The context is a reference, not an authorization: it is resolved against the database, with this administrator's permissions, on EVERY turn.
      resolveScope(app, access, contextType, contextRef)
    } catch (error) {
      if (error instanceof ContextUnavailable) throw new HttpError(404, 'not_found', 'That context is not available.', { details: { reason: 'context_unavailable' } })
      throw error
    }
    if (conversation?.status === 'closed') throw new HttpError(409, 'conflict', 'This conversation is closed. Start a new one.', { details: { reason: 'conversation_closed' } })
    if (conversation && new Date(conversation.created_at).getTime() + settings.conversationMaxHours * HOUR < now.getTime()) throw new HttpError(409, 'conflict', 'This conversation has reached its time limit. Start a new one.', { details: { reason: 'conversation_expired' } })
    if (conversation && conversation.message_count >= settings.maxConversationMessages) throw new HttpError(409, 'conflict', 'This conversation has reached its length limit. Start a new one.', { details: { reason: 'conversation_full' } })
    const key = `admin:${request.authority.userId}`
    if (this.busy.has(request.conversationId)) {
      recordLimitEvent(app, 'conversation_busy')
      throw new HttpError(409, 'conflict', 'An answer is already being written.', { details: { reason: 'busy' } })
    }
    if ((this.perSession.get(key) ?? 0) >= 2) {
      recordLimitEvent(app, 'session_concurrent')
      throw rateLimited(10)
    }
    if (this.running.size >= settings.maxConcurrentRequests) {
      recordLimitEvent(app, 'concurrent_global')
      throw new HttpError(503, 'service_unavailable', 'The assistant is busy right now.', { details: { reason: 'capacity' }, headers: { 'Retry-After': '5' } })
    }

    const history: UIMessage[] = conversation ? loadAdminMessages(app.db, conversation.id).map(parse) : []
    let messages = history
    if (request.trigger === 'regenerate-assistant-message') {
      let cut = messages.length
      while (cut > 0 && messages[cut - 1].role === 'assistant') cut -= 1
      messages = messages.slice(0, cut)
      if (messages.length === 0) throw new HttpError(422, 'validation_failed', 'There is nothing to answer.', { details: { fields: { trigger: 'invalid' } } })
    } else {
      messages = [...messages, { id: newId(), role: 'user', parts: [{ type: 'text', text }] }]
    }
    let windowed = messages.slice(-settings.maxHistoryMessages)
    while (windowed.length > 0 && windowed[0].role !== 'user') windowed = windowed.slice(1)

    // The settings THIS answer runs with: the admin assistant's own tool and output limits (the budgets, prices and effort are the shared ones).
    const adminSettings: AiSettings = { ...settings, maxToolCalls: settings.adminMaxToolCalls, maxOutputTokens: settings.adminMaxOutputTokens }
    const instructions = adminInstructions(request.language, { type: contextType, ref: contextRef }, now)
    const promptTokens = estimateTokens(instructions.length + JSON.stringify(windowed).length)

    if (!conversation) conversation = createAdminConversation(app.db, app.clock, { id: request.conversationId, userId: request.authority.userId, language: request.language, contextType, contextRef })
    const requestId = request.requestId ?? randomUUID()
    let reservation: Reservation
    try {
      reservation = reserve(app, adminSettings, { conversationId: conversation.id, sessionId: key, ipHash: request.ipHash, model: AI_MODEL_ID, correlationId: requestId, promptTokens, newConversation: false, audience: 'admin', admin: { userId: request.authority.userId, perHour: settings.adminMaxRequestsPerHour } })
    } catch (error) {
      if (isNew) deleteAdminConversation(app.db, request.authority.userId, conversation.id)
      if (error instanceof BudgetRefusal) {
        recordLimitEvent(app, error.reason)
        alertForRefusal(app, settings, error.reason)
      }
      throw error
    }
    // The audit log records that a conversation was started, in which kind of context and by whom: never what was said.
    if (isNew) audit(app, actor, 'ai.admin_assistant.conversation', 'ai_admin_conversation', conversation.id, { context: contextType })

    this.busy.add(conversation.id)
    this.perSession.set(key, (this.perSession.get(key) ?? 0) + 1)
    const stopper = new AbortController()
    let resolveDone: () => void = () => undefined
    this.running.set(reservation.id, { stop: () => stopper.abort(), done: new Promise<void>((resolve) => (resolveDone = resolve)) })
    const release = () => {
      this.busy.delete(request.conversationId)
      const open = (this.perSession.get(key) ?? 1) - 1
      if (open <= 0) this.perSession.delete(key)
      else this.perSession.set(key, open)
    }
    const conversationId = conversation.id
    try {
      if (conversation.language !== request.language) setAdminLanguage(app.db, conversationId, request.language)
      if (request.trigger === 'submit-user-message') setAdminTitle(app.db, conversationId, [...text.replace(/\s+/g, ' ')].slice(0, 60).join(''))
      saveAdminMessages(app.db, app.clock, conversationId, messages.map(store))
      return await this.stream({
        signal: request.signal,
        log: request.log,
        requestId,
        settings: adminSettings,
        conversationId,
        reservation,
        messages,
        windowed,
        instructions,
        tools: (counter, rid, log) =>
          buildAdminTools({ app, authority: request.authority, policy: request.policy, conversationId, language: request.language, requestId: rid, maxToolCalls: adminSettings.maxToolCalls, counter, log }),
        persist: (final) => {
          saveAdminMessages(app.db, app.clock, conversationId, final.map(store))
          if (final.length >= settings.maxConversationMessages) closeAdminConversation(app.db, conversationId)
        },
        release,
        stopper,
        resolveDone: () => resolveDone(),
      })
    } catch (error) {
      release()
      this.running.delete(reservation.id)
      resolveDone()
      const code = classify(error)
      finish(app, adminSettings, reservation, { status: 'failed', usage: null, steps: 0, toolCalls: 0, errorCode: code, latencyMs: 0, firstTokenMs: null })
      this.afterFailure(code, null)
      ;(request.log ?? app.log).warn('admin assistant request could not start', { aiRequest: reservation.id, code })
      throw error instanceof ModelLockError ? new HttpError(503, 'service_unavailable', 'The admin assistant is not available right now.', { details: { reason: 'model_unverified' } }) : error
    }
  }

  /**
   * What a failed request means for the administration. A reply from another model, or a provider that does not know the
   * required model, breaks the verification on the spot (the assistant is unavailable until a connection test succeeds again);
   * a refused key or an empty account raises an alert. Whatever happened, nothing is retried with another model: there is none.
   */
  private afterFailure(code: string, observation: ModelObservation | null): void {
    const { app } = this
    try {
      if (code === 'model_mismatch') {
        recordFailed(app, 'model_mismatch', observation?.mismatch ?? null, null)
        raiseProviderAlert(app, 'model_mismatch', { reported: observation?.mismatch ?? null })
        raiseProviderAlert(app, 'model_unverified', { reason: 'model_mismatch' })
      } else if (code === 'model_not_found') {
        recordFailed(app, 'model_not_found', null, null)
        raiseProviderAlert(app, 'model_not_found')
        raiseProviderAlert(app, 'model_unverified', { reason: 'model_not_found' })
      } else if (code === 'provider_auth') raiseProviderAlert(app, 'provider_auth')
      else if (code === 'provider_billing') raiseProviderAlert(app, 'provider_billing')
      if (code.startsWith('provider_') || code.startsWith('model_') || code === 'timeout' || code === 'output_limit') recordLastError(app, 'chat', code)
    } catch (error) {
      app.log.warn('assistant failure could not be recorded', { errorKind: kindOf(error) })
    }
  }

  private async stream(input: {
    /** Aborted when the client goes away. */
    signal: AbortSignal
    log?: Logger | undefined
    requestId: string
    /** The settings THIS answer runs with (the admin assistant hands in its own tool and output limits). */
    settings: AiSettings
    conversationId: string
    reservation: Reservation
    messages: UIMessage[]
    windowed: UIMessage[]
    instructions: string
    /** The tool set for this answer, built after the model is chosen (the visitor assistant's, or the admin assistant's read-only set). */
    tools: (counter: { calls: number }, reservationId: string, log: Logger) => Promise<ToolSet>
    /** Keeps the conversation as the server will replay it (the visitor's tables, or the administrator's). */
    persist: (messages: UIMessage[]) => void
    release: () => void
    /** Cancels this answer (a shutdown); registered with the answer in `running` by `chat()`. */
    stopper: AbortController
    resolveDone: () => void
  }): Promise<Response> {
    const { app } = this
    const { requestId, settings, reservation, messages, windowed, instructions, release, stopper, resolveDone } = input
    const log = (input.log ?? app.log).child({ aiRequest: reservation.id })
    const { streamText, isStepCount, convertToModelMessages, toUIMessageStream, createUIMessageStreamResponse } = await import('ai')
    const observation = new ModelObservation()
    const model = await this.model(observation)
    const counter = { calls: 0 }
    const tools = await input.tools(counter, reservation.id, log)
    const modelMessages = await convertToModelMessages(windowed, { tools, ignoreIncompleteToolCalls: true })

    const started = performance.now()
    let firstToken: number | null = null
    let finalized = false
    let steps = 0
    let errorCode: string | null = null
    /** An error the visitor must be told about even though the provider's stream ended normally (a stalled provider, an empty answer, a cut-off). */
    let lateError: string | null = null
    let finishReason: string | null = null
    let wroteText = false
    // The visitor going away and the server shutting down both end the request through this one signal; the SDK's own timeouts abort without either.
    const signal = AbortSignal.any([input.signal, stopper.signal])

    const settle = (outcome: Pick<Outcome, 'status' | 'usage'>) => {
      if (finalized) return
      finalized = true
      release()
      const latencyMs = performance.now() - started
      const code = outcome.status === 'completed' ? null : (errorCode ?? (outcome.status === 'aborted' ? 'aborted' : 'failed'))
      finish(app, settings, reservation, { ...outcome, steps, toolCalls: counter.calls, errorCode: code, latencyMs, firstTokenMs: firstToken, actualModel: observation.reported, modelVerified: observation.verified, finishReason })
      // One structured line per request: identifiers, codes and numbers only (never a prompt, an answer or a key).
      // (The logger masks any field whose NAME looks like a secret, so the token counts are called `inTok` / `outTok`.)
      log.info('assistant request finished', {
        requestRef: requestId,
        status: outcome.status,
        code,
        finish: finishReason,
        ms: Math.round(latencyMs),
        ttfbMs: firstToken === null ? null : Math.round(firstToken),
        inTok: outcome.usage?.inputTokens ?? null,
        outTok: outcome.usage?.outputTokens ?? null,
        steps,
        toolCalls: counter.calls,
        modelVerified: observation.verified,
      })
      this.running.delete(reservation.id)
      resolveDone()
      // What this request used may have taken a limit to its warning level; the administrator hears about it (never fatal).
      try {
        checkThresholds(app, settings)
      } catch (error) {
        log.warn('assistant threshold check failed', { errorKind: kindOf(error) })
      }
    }

    const thinking = settings.thinking === 'disabled' ? ({ type: 'disabled' } as const) : ({ type: 'adaptive' } as const)
    const result = streamText({
      model,
      instructions,
      messages: modelMessages,
      tools,
      stopWhen: isStepCount(settings.maxToolCalls),
      maxOutputTokens: settings.maxOutputTokens,
      // One retry against the same model for a transient error; never another model, never an unbounded loop.
      maxRetries: 1,
      abortSignal: signal,
      timeout: { totalMs: app.config.ai.timeoutMs, stepMs: Math.ceil(app.config.ai.timeoutMs / 2), firstChunkMs: Math.ceil(app.config.ai.timeoutMs / 3) },
      providerOptions: { anthropic: { effort: settings.effort, thinking } },
      onChunk: ({ chunk }) => {
        if (firstToken === null && (chunk.type === 'text-delta' || chunk.type === 'tool-call')) firstToken = performance.now() - started
        if (chunk.type === 'text-delta' && chunk.text.trim() !== '') wroteText = true
        if (chunk.type === 'finish-step') steps += 1
      },
      onError: ({ error }) => {
        errorCode = classify(error)
        log.warn('assistant request failed', { code: errorCode, errorKind: kindOf(error) })
        settle({ status: 'failed', usage: null })
        this.afterFailure(errorCode, observation)
      },
      onAbort: ({ steps: done }) => {
        // The visitor going away aborts through the request's signal, a shutdown through the stopper; the SDK's own timeouts abort without either.
        const byVisitor = input.signal.aborted
        const byShutdown = !byVisitor && stopper.signal.aborted
        errorCode = byVisitor ? 'aborted' : byShutdown ? 'shutdown' : 'timeout'
        lateError = byVisitor ? null : byShutdown ? 'unavailable' : 'timeout'
        settle({ status: byVisitor || byShutdown ? 'aborted' : 'failed', usage: sumUsage(done.map((step) => step.usage)) })
      },
      onEnd: (event) => {
        const usage = usageOf(event.usage)
        finishReason = event.finishReason
        let failed = event.finishReason === 'error'
        if (failed && !errorCode) errorCode = 'provider_error'
        if (event.finishReason === 'content-filter' && !errorCode) errorCode = 'refusal'
        // Validation of what the provider returned: an answer with neither text nor a tool call is not an answer, and a reply that stopped
        // because the output limit was reached before any text came out (the model's thinking used it up) has nothing to show. Both are told
        // to the visitor as a failure of this request (retry), not shown as an empty success.
        if (!failed && !errorCode && !wroteText && counter.calls === 0) {
          errorCode = event.finishReason === 'length' ? 'output_limit' : 'provider_invalid_response'
          lateError = errorCode
          failed = true
          log.warn('assistant answer unusable', { code: errorCode, finish: event.finishReason })
          this.afterFailure(errorCode, observation)
        }
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
      // An answer cut off at the output limit says so (the interface shows a note); every other answer carries no metadata.
      messageMetadata: ({ part }) => (part.type === 'finish' && (part as { finishReason?: string }).finishReason === 'length' ? { finishReason: 'length' } : undefined),
      onEnd: ({ messages: finalMessages }) => {
        try {
          input.persist(trim(finalMessages))
        } catch (error) {
          log.warn('assistant conversation could not be saved', { errorKind: kindOf(error) })
        }
      },
    })
    // Whatever ends the response (done, cancelled, failed), the reservation is reconciled exactly once.
    const guard = new TransformStream<unknown, unknown>({
      // A stalled provider, an empty answer or a shutdown ends the stream without an error part of its own: the visitor is told, in a code.
      flush: (controller) => {
        if (lateError !== null) controller.enqueue({ type: 'error', errorText: lateError })
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

/** The class of an error, for a log line (the logger masks any field called `name`; a class name is safe and useful). */
const kindOf = (error: unknown): string => (error instanceof Error ? error.name : 'unknown')

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

/** The AI SDK's errors for a provider reply that cannot be used (a body that is not what the API returns, an empty one, a stream that does not parse). */
const INVALID_RESPONSE = new Set(['AI_InvalidResponseDataError', 'AI_JSONParseError', 'AI_TypeValidationError', 'AI_NoContentGeneratedError', 'AI_NoOutputGeneratedError', 'AI_EmptyResponseBodyError', 'AI_UnsupportedFunctionalityError'])

/**
 * A short code for what went wrong, safe to show a visitor (the website words it in three languages) and to store: the
 * provider's message, which may quote a request, is never sent to the browser or kept.
 *
 * Codes that mean "the required model is not usable" (`model_mismatch`, `model_not_found`, `model_unverified`) and the ones
 * for an account the provider will not serve (`provider_auth`, `provider_billing`) are shown to a visitor as one friendly
 * "not available" message with the contact alternative; the difference is for the administration.
 */
export function classify(error: unknown): string {
  if (error instanceof HttpError) return error.code
  if (error instanceof ModelLockError) return 'model_mismatch'
  const e = error as { name?: string; statusCode?: number; status?: number; isRetryable?: boolean; lastError?: unknown } | null
  // The SDK wraps a failed retry; what matters is what the last attempt failed with.
  if (e?.name === 'AI_RetryError' && e.lastError !== undefined && e.lastError !== error) {
    const inner = classify(e.lastError)
    if (inner !== 'assistant_error') return inner
  }
  const status = e?.statusCode ?? e?.status
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') return 'timeout'
  if (typeof e?.name === 'string' && INVALID_RESPONSE.has(e.name)) return 'provider_invalid_response'
  if (status === 401 || status === 403) return 'provider_auth'
  if (status === 402) return 'provider_billing'
  if (status === 404) return 'model_not_found'
  if (status === 429) return 'provider_rate_limit'
  if (status === 529 || (typeof status === 'number' && status >= 500)) return 'provider_unavailable'
  if (typeof status === 'number' && status >= 400) return 'provider_error'
  if (e?.name === 'AI_RetryError' || e?.name === 'AI_APICallError') return 'provider_unavailable'
  return 'assistant_error'
}

/** The 503 a visitor gets when the assistant is not available; the reason says only whether it is the model (the website words that). */
export function unavailable(reason: string): HttpError {
  const model = reason === 'model_unverified' || reason === 'model_lock'
  return new HttpError(503, 'service_unavailable', 'The assistant is not available right now.', { details: { reason: model ? 'model_unverified' : 'unavailable' } })
}

export { addMs }
