import type { UIMessage } from 'ai'
import { del, get } from './client'

/**
 * The AI admin assistant's endpoints (`/api/admin/ai-assistant/*`, server/src/modules/ai/adminassistant/routes.ts). The assistant is read-only; these are the only calls the
 * screen makes besides the streamed chat itself. Nothing here carries a model, a tool, a prompt or an administrator: the server takes who is asking from the session.
 */

export type AssistantLanguage = 'hu' | 'en' | 'nl'
export const ASSISTANT_LANGUAGES: readonly AssistantLanguage[] = ['hu', 'en', 'nl']

export type ContextType = 'general' | 'project' | 'quote' | 'customer' | 'conversation' | 'consultation'
export const RECORD_CONTEXTS: readonly Exclude<ContextType, 'general'>[] = ['project', 'quote', 'customer', 'conversation', 'consultation']
export const CONTEXT_TYPES: readonly ContextType[] = ['general', ...RECORD_CONTEXTS]

export type UnavailableReason = 'operator_disabled' | 'admin_disabled' | 'no_api_key' | 'key_malformed' | 'model_lock' | 'model_unverified'

export interface AssistantConfig {
  available: boolean
  reason: UnavailableReason | null
  languages: AssistantLanguage[]
  maxInputChars: number
  retentionDays: number
  /** Whether this administrator may change the settings (the switch and the limits live on the AI screen). */
  canManage: boolean
  model: { name: string; provider: string }
  /** Which records this administrator's role may ask about: the screen offers a context only where it can work. */
  access: { quotes: boolean; consultations: boolean; customers: boolean; projects: boolean; conversations: boolean }
}

export interface ConversationSummary {
  id: string
  title: string | null
  language: AssistantLanguage
  contextType: ContextType
  contextRef: string | null
  status: 'active' | 'closed'
  messageCount: number
  updatedAt: string
  createdAt: string
}

export interface ConversationDetail extends ConversationSummary {
  /** False when the record of the context is gone or this administrator may no longer read it: the conversation can be read and deleted, not continued. */
  contextAvailable: boolean
  messages: UIMessage[]
}

export interface ContextOption {
  ref: string
  label: string
}

export interface AssistantUsage {
  range: 'today' | 'last_7_days' | 'month'
  from: string
  enabled: boolean
  availability: { available: true } | { available: false; reason: UnavailableReason }
  limits: { requestsPerHourPerAdministrator: number; toolStepsPerAnswer: number; outputTokensPerAnswer: number; inputCharsPerMessage: number }
  requests: number
  completedRequests: number
  failedRequests: number
  inputTokens: number
  outputTokens: number
  estimatedCostUsd: number
  requestsWithReportedUsage: number
  averageResponseMs: number | null
  toolCalls: number
  tools: { tool: string; calls: number; failed: number; averageMs: number | null }[]
  errors: { code: string; n: number }[]
  recentFailures: { at: string; code: string; status: string }[]
  conversationsStarted: number
  reportsGenerated: number
  dailySeries: { day: string; requests: number; tokens: number; costUsd: number }[]
  note: string
}

const base = '/api/admin/ai-assistant'

export const assistant = {
  config: (signal?: AbortSignal) => get<AssistantConfig>(`${base}/config`, { signal }).then((answer) => answer.data),
  list: (q: string, signal?: AbortSignal) => get<ConversationSummary[]>(`${base}/conversations`, { query: { q }, signal }).then((answer) => answer.data),
  read: (id: string, signal?: AbortSignal) => get<ConversationDetail>(`${base}/conversations/${encodeURIComponent(id)}`, { signal }).then((answer) => answer.data),
  remove: (id: string) => del(`${base}/conversations/${encodeURIComponent(id)}`),
  contexts: (type: Exclude<ContextType, 'general'>, q: string, signal?: AbortSignal) => get<ContextOption[]>(`${base}/contexts`, { query: { type, q }, signal }).then((answer) => answer.data),
  usage: (range: AssistantUsage['range'], signal?: AbortSignal) => get<AssistantUsage>(`${base}/usage`, { query: { range }, signal }).then((answer) => answer.data),
  /** Where the streamed chat is posted (the browser's own `fetch`, through the AI SDK's transport). */
  chat: `${base}/chat`,
}

/** A new conversation's id: long and random; the server only uses it as a key and finds the conversation through the signed-in administrator. */
export function newConversationId(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return `ac-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
