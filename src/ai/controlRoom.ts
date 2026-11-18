import { Chat, useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useCallback, useSyncExternalStore } from 'react'
import { aiText } from '../content/ai'
import { apiEndpoint } from '../config/api'
import type { Language } from '../i18n/config'
import {
  AiError,
  approveRequest,
  clearStored,
  currentToken,
  deleteConversation,
  ensureSession,
  listConversations,
  newConversationId,
  readConversation,
  readStored,
  restartPlan,
  savePlan,
  writeStored,
  type ConversationSummary,
  type PlanState,
} from './client'
import { loadAiConfig, type AiPublicConfig } from './availability'
import * as discoveryApi from './discoveryClient'
import type { DiscoveryState, FactKey, ProjectType, Section, Stage } from './discoveryModel'

/** Why a discovery change did not happen, as a code the panel has words for (`content/ai/discovery.ts`, `errors`). */
export interface DiscoveryProblem {
  code: 'conflict' | 'invalid' | 'duplicate' | 'limit' | 'sent' | 'notEnough' | 'network' | 'generic'
  fields: Record<string, string>
}

function discoveryProblemOf(error: unknown): DiscoveryProblem {
  if (!(error instanceof AiError)) return { code: 'generic', fields: {} }
  if (error.code === 'network') return { code: 'network', fields: {} }
  if (error.status === 409) {
    if (error.reason === 'sent') return { code: 'sent', fields: {} }
    if (error.reason === 'duplicate') return { code: 'duplicate', fields: {} }
    if (error.reason === 'limit') return { code: 'limit', fields: {} }
    if (error.reason === 'unknown_dependency') return { code: 'invalid', fields: {} }
    return { code: 'conflict', fields: {} }
  }
  if (error.status === 422) return error.fields.plan ? { code: 'notEnough', fields: {} } : { code: 'invalid', fields: error.fields }
  return { code: 'generic', fields: {} }
}

/**
 * The one conversation both the floating assistant and the /control-room page show. It lives here, outside any component, so
 * opening the other surface continues the same conversation and nothing is duplicated: one `Chat` of the AI SDK (the messages,
 * the status, stop and retry), the list of the visitor's conversations, the project plan and the state of an approval. The
 * browser never sends history: the server keeps the conversation, and a request carries only the conversation's id, the language
 * and the one new message.
 *
 * This module (and with it the AI SDK's client) is loaded only when the assistant is opened.
 */

export interface Snapshot {
  chat: Chat<UIMessage>
  conversationId: string
  conversations: ConversationSummary[]
  plan: PlanState | null
  config: AiPublicConfig | null
  /** `idle`, then `approving` while the approval is sent, `approved` until the request has gone, `sent` after. */
  approval: 'idle' | 'approving' | 'approved' | 'sent'
  loading: boolean
  /** Why the assistant cannot start (no backend, switched off, a failed start), as an error code. */
  unavailable: string | null
  /** The visitor stopped the answer that was being written (the interface says so until the next message). */
  cancelled: boolean
  /** The structured project discovery the server holds for this conversation (`null`: not loaded, switched off, or nothing started yet). */
  discovery: DiscoveryState | null
  /** A discovery change is on its way (the panel disables its controls so two changes never race). */
  discoveryBusy: boolean
  /** Why the last discovery change did not happen. */
  discoveryProblem: DiscoveryProblem | null
}

type Listener = () => void

const lastUserText = (messages: UIMessage[]): string => {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role !== 'user') continue
    return messages[i].parts.map((part) => (part.type === 'text' ? part.text : '')).join('')
  }
  return ''
}

class ControlRoom {
  private state: Snapshot
  private readonly listeners = new Set<Listener>()
  language: Language = 'en'
  private started: Promise<void> | null = null

  constructor() {
    const stored = readStored()
    const id = stored.conversationId ?? newConversationId()
    this.state = { chat: this.makeChat(id, []), conversationId: id, conversations: [], plan: null, config: null, approval: 'idle', loading: true, unavailable: null, cancelled: false, discovery: null, discoveryBusy: false, discoveryProblem: null }
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): Snapshot => this.state

  private set(patch: Partial<Snapshot>): void {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  private makeChat(id: string, messages: UIMessage[]): Chat<UIMessage> {
    return new Chat<UIMessage>({
      id,
      messages,
      transport: new DefaultChatTransport({
        api: apiEndpoint('/api/ai/chat') ?? '/api/ai/chat',
        credentials: 'omit',
        headers: () => ({ 'X-AI-Session': currentToken() ?? '' }),
        // The server keeps the conversation: it is told which one, in which language, and the one new message (or "again").
        prepareSendMessagesRequest: ({ id: conversationId, messages: all, trigger }) => ({
          body: trigger === 'regenerate-message' ? { conversationId, language: this.language, trigger: 'regenerate-assistant-message' } : { conversationId, language: this.language, trigger: 'submit-user-message', text: lastUserText(all) },
        }),
      }),
      onFinish: () => void this.afterTurn(),
    })
  }

  /** Reads the stored conversation (if this tab has one), the list and the configuration. Safe to call from both surfaces. */
  start(): Promise<void> {
    this.started ??= (async () => {
      const config = await loadAiConfig()
      if (!config || !config.available) {
        this.set({ config, loading: false, unavailable: config ? (config.unavailableReason === 'model' ? 'model_unverified' : 'unavailable') : 'no_backend' })
        return
      }
      this.set({ config })
      try {
        await ensureSession()
        const stored = readStored().conversationId
        if (stored) await this.openStored(stored)
        await this.refreshList()
      } catch (error) {
        this.set({ unavailable: error instanceof AiError ? error.reason ?? error.code : 'network' })
      }
      this.set({ loading: false })
    })()
    return this.started
  }

  private async openStored(id: string): Promise<void> {
    try {
      const detail = await readConversation(id)
      this.set({ chat: this.makeChat(id, detail.messages as UIMessage[]), conversationId: id, plan: this.planOf(detail), approval: detail.sent ? 'sent' : 'idle', cancelled: false, discovery: null, discoveryProblem: null })
      await this.loadDiscovery(id)
    } catch (error) {
      // A conversation that no longer exists (deleted, expired, another session) is simply not there: start fresh.
      if (!(error instanceof AiError) || error.status !== 404) throw error
      this.freshConversation()
    }
  }

  private planOf(detail: PlanState): PlanState {
    return { plan: detail.plan, version: detail.version, missing: detail.missing, ready: detail.ready, sent: detail.sent, reference: detail.reference }
  }

  private freshConversation(): void {
    const id = newConversationId()
    writeStored({ conversationId: id })
    this.set({ chat: this.makeChat(id, []), conversationId: id, plan: null, approval: 'idle', cancelled: false, discovery: null, discoveryProblem: null })
  }

  private async refreshList(): Promise<void> {
    try {
      this.set({ conversations: await listConversations() })
    } catch {
      // The list is a convenience; the conversation works without it.
    }
  }

  /** After an answer: the list, and the plan the server holds (the model may have changed it). */
  private async afterTurn(): Promise<void> {
    const { conversationId } = this.state
    writeStored({ conversationId })
    await this.refreshList()
    await this.refreshPlan()
    await this.refreshDiscovery()
  }

  /** Whether the structured project discovery is on (the plan panel is then the discovery panel). */
  get discoveryOn(): boolean {
    return this.state.config?.discoveryEnabled === true
  }

  private async loadDiscovery(id: string): Promise<void> {
    if (!this.discoveryOn) return
    try {
      const discovery = await discoveryApi.readDiscovery(id)
      if (id === this.state.conversationId) this.set({ discovery })
    } catch (error) {
      // "Not found": the discovery is no longer offered (the administrator switched it off after this page read its configuration, which is cached for a minute): ask again what is offered.
      // Anything else: keep what is shown, the panel works from the last state it had.
      if (error instanceof AiError && error.status === 404) await this.refreshConfig()
    }
  }

  /** Asks again what the assistant offers, and follows the answer: the plan side becomes the discovery panel, or the older plan form, as the administrator set it. */
  private async refreshConfig(): Promise<void> {
    const config = await loadAiConfig(true)
    const known = this.state.config
    if (!config || !known || (config.discoveryEnabled === known.discoveryEnabled && config.plannerEnabled === known.plannerEnabled && config.quoteEnabled === known.quoteEnabled)) return
    this.set({ config, discovery: null })
    if (config.discoveryEnabled === true) await this.loadDiscovery(this.state.conversationId)
  }

  /** Reads the discovery the server holds (after an answer: the assistant may have recorded something). Nothing is asked for a conversation the server does not know yet. */
  async refreshDiscovery(): Promise<void> {
    const { conversationId } = this.state
    if (!this.discoveryOn || !this.state.conversations.some((conversation) => conversation.id === conversationId)) return
    await this.loadDiscovery(conversationId)
  }

  /**
   * Runs one change of the discovery draft. It names the version the visitor saw; a draft that moved on answers 409 and the panel is refreshed
   * instead of overwritten. One change at a time. Returns whether it happened (and what the server said about it).
   */
  private async discoveryRun<T>(work: (id: string, version: number) => Promise<discoveryApi.Mutation<T>>): Promise<{ ok: boolean; result?: T }> {
    const { conversationId, discovery, discoveryBusy } = this.state
    if (discoveryBusy) return { ok: false }
    this.set({ discoveryBusy: true, discoveryProblem: null })
    try {
      const out = await work(conversationId, discovery?.version ?? 0)
      if (conversationId === this.state.conversationId) this.set({ discovery: out.state, approval: this.state.approval === 'sent' ? 'sent' : 'idle' })
      await this.refreshPlan()
      return { ok: true, result: out.result }
    } catch (error) {
      const problem = discoveryProblemOf(error)
      this.set({ discoveryProblem: problem })
      if (problem.code === 'conflict' || problem.code === 'sent') await this.loadDiscovery(conversationId)
      else if (error instanceof AiError && error.status === 404) await this.refreshConfig()
      return { ok: false }
    } finally {
      this.set({ discoveryBusy: false })
    }
  }

  clearDiscoveryProblem(): void {
    if (this.state.discoveryProblem) this.set({ discoveryProblem: null })
  }

  discoveryFacts = (facts: Partial<Record<FactKey, string | null>>, confirm: FactKey[] = []) => this.discoveryRun((id, version) => discoveryApi.saveFacts(id, version, facts, confirm))
  discoveryType = (change: { type?: ProjectType; confirm?: boolean }) => this.discoveryRun((id, version) => discoveryApi.saveClassification(id, version, change))
  discoverySignals = (signals: Record<string, string | number | null>) => this.discoveryRun((id, version) => discoveryApi.saveSignals(id, version, signals))
  discoveryAdd = (requirement: Partial<discoveryApi.RequirementFields>) => this.discoveryRun((id, version) => discoveryApi.addRequirement(id, version, requirement))
  discoveryChange = (requirementId: string, change: discoveryApi.RequirementChange) => this.discoveryRun((id, version) => discoveryApi.changeRequirement(id, version, requirementId, change))
  discoveryRemove = (requirementId: string) => this.discoveryRun((id, version) => discoveryApi.removeRequirement(id, version, requirementId))
  discoverySkip = (stage: Stage, skip: boolean) => this.discoveryRun((id, version) => discoveryApi.skipStage(id, version, stage, skip))
  discoveryNote = (section: Section, note: string) => this.discoveryRun((id, version) => discoveryApi.saveNote(id, version, section, note))
  discoveryGenerate = (sections?: Section[]) => this.discoveryRun((id, version) => discoveryApi.generatePlan(id, version, sections))

  async refreshPlan(): Promise<void> {
    const { conversationId } = this.state
    if (!this.state.conversations.some((conversation) => conversation.id === conversationId)) return
    try {
      const detail = await readConversation(conversationId)
      if (conversationId !== this.state.conversationId) return
      this.set({ plan: this.planOf(detail), approval: detail.sent ? 'sent' : this.state.approval === 'sent' ? 'idle' : this.state.approval })
    } catch {
      // Keep what is shown.
    }
  }

  async send(text: string): Promise<void> {
    if (this.state.cancelled) this.set({ cancelled: false })
    await ensureSession()
    writeStored({ conversationId: this.state.conversationId })
    await this.state.chat.sendMessage({ text })
  }

  async regenerate(): Promise<void> {
    if (this.state.cancelled) this.set({ cancelled: false })
    await ensureSession()
    await this.state.chat.regenerate()
  }

  stop(): void {
    const { status } = this.state.chat
    void this.state.chat.stop()
    // Said only when there was something to stop: the visitor is told the answer ended because they asked.
    if (status === 'submitted' || status === 'streaming') this.set({ cancelled: true })
  }

  newConversation(): void {
    if (this.state.chat.status === 'streaming' || this.state.chat.status === 'submitted') void this.state.chat.stop()
    this.freshConversation()
  }

  async open(id: string): Promise<void> {
    if (id === this.state.conversationId) return
    if (this.state.chat.status === 'streaming' || this.state.chat.status === 'submitted') void this.state.chat.stop()
    writeStored({ conversationId: id })
    await this.openStored(id)
  }

  /** Deletes a conversation on the server (its words go at once). The one on screen is replaced by a new one. */
  async remove(id: string): Promise<void> {
    await deleteConversation(id)
    if (id === this.state.conversationId) this.freshConversation()
    await this.refreshList()
  }

  async editPlan(fields: Record<string, unknown>): Promise<void> {
    const { conversationId, plan } = this.state
    const next = await savePlan(conversationId, plan?.version ?? 0, fields)
    this.set({ plan: next, approval: 'idle' })
  }

  async startOverPlan(): Promise<void> {
    const next = await restartPlan(this.state.conversationId)
    // Starting over clears the discovery draft, its requirements and its plan versions on the server too.
    this.set({ plan: next, approval: 'idle', discovery: null, discoveryProblem: null })
    await this.loadDiscovery(this.state.conversationId)
  }

  /** The visitor's "Send this request": the approval is recorded on the server, then the assistant is asked to send it. */
  async approve(contact: { name: string; email: string; company: string | null; consent: boolean }): Promise<void> {
    const { conversationId, plan } = this.state
    if (!plan) throw new AiError(0, 'validation_failed', null, { plan: 'required' })
    this.set({ approval: 'approving' })
    try {
      await approveRequest(conversationId, { ...contact, planVersion: plan.version })
    } catch (error) {
      this.set({ approval: 'idle' })
      throw error
    }
    this.set({ approval: 'approved' })
    await this.send(aiText.send.asked[this.language])
  }

  /** Forgets this tab's session (after the visitor deletes everything). */
  forget(): void {
    clearStored()
  }
}

export const controlRoom = new ControlRoom()

/** What a chat error means, as a code the interface has words for. The transport's errors carry the server's JSON or the stream's code as their message. */
export function chatErrorCode(error: Error | undefined): string | null {
  if (!error) return null
  const text = error.message.trim()
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const detail = (parsed as { error: { code?: string; details?: { reason?: string } } }).error
      const reason = detail.details?.reason
      if (reason === 'daily_budget' || reason === 'monthly_budget' || reason === 'daily_tokens' || reason === 'daily_requests' || reason === 'daily_conversations') return 'budget'
      if (reason === 'unavailable') return 'unavailable'
      return reason ?? detail.code ?? 'generic'
    }
  } catch {
    // Not JSON: a code from the stream, or a network failure.
  }
  if (/^[a-z_]{3,40}$/.test(text)) return text
  if (/failed to fetch|networkerror|load failed|network/i.test(text)) return 'network'
  return 'generic'
}

export function useControlRoom() {
  const snapshot = useSyncExternalStore(controlRoom.subscribe, controlRoom.getSnapshot, controlRoom.getSnapshot)
  const chat = useChat({ chat: snapshot.chat })
  const send = useCallback((text: string) => controlRoom.send(text), [])
  return { ...snapshot, ...chat, send, controlRoom }
}
