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
    this.state = { chat: this.makeChat(id, []), conversationId: id, conversations: [], plan: null, config: null, approval: 'idle', loading: true, unavailable: null }
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
      this.set({ chat: this.makeChat(id, detail.messages as UIMessage[]), conversationId: id, plan: this.planOf(detail), approval: detail.sent ? 'sent' : 'idle' })
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
    this.set({ chat: this.makeChat(id, []), conversationId: id, plan: null, approval: 'idle' })
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
  }

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
    await ensureSession()
    writeStored({ conversationId: this.state.conversationId })
    await this.state.chat.sendMessage({ text })
  }

  async regenerate(): Promise<void> {
    await ensureSession()
    await this.state.chat.regenerate()
  }

  stop(): void {
    void this.state.chat.stop()
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
    this.set({ plan: next, approval: 'idle' })
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
