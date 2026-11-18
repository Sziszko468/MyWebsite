import { Chat, useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useCallback, useEffect, useState } from 'react'
import { assistant, newConversationId, type AssistantLanguage, type ConversationDetail } from '../api/assistant'
import { getCsrfToken, notifySessionEnded } from '../api/client'
import { GENERAL_CONTEXT, type ContextChoice } from './model'

/**
 * The conversation on the screen (PROMPT 31): one `Chat` of the AI SDK, talking to `/api/admin/ai-assistant/chat` with the administrator's own cookie and CSRF token. What
 * goes in the request is the conversation's id, the language, the one new message (or "again") and, for a NEW conversation, its context: never a model, a tool, a prompt, a
 * history or an administrator. The server keeps the conversation and decides everything else.
 */

export interface ActiveConversation {
  id: string
  context: ContextChoice
  /** Nothing has been stored for it yet (the first question has not been answered). */
  isNew: boolean
  /** False when the record of the context is gone or may no longer be read. */
  contextAvailable: boolean
  closed: boolean
  title: string | null
}

const lastUserText = (messages: UIMessage[]): string => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return messages[index].parts.map((part) => (part.type === 'text' ? part.text : '')).join('')
  }
  return ''
}

/** What a chat error means, as a code the screen has words for. The transport's errors carry the server's JSON (or the stream's code) as their message. */
export function chatErrorCode(error: Error | undefined): string | null {
  if (!error) return null
  const text = error.message.trim()
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const detail = (parsed as { error: { code?: string; details?: { reason?: string; fields?: Record<string, string> } } }).error
      const reason = detail.details?.reason
      if (reason === 'daily_budget' || reason === 'monthly_budget' || reason === 'daily_tokens' || reason === 'daily_requests') return 'budget'
      if (reason) return reason
      if (detail.details?.fields?.text === 'tooLong') return 'tooLong'
      if (detail.details?.fields?.text === 'required') return 'empty'
      if (detail.code === 'unauthorized') return 'unauthorized'
      if (detail.code === 'forbidden' || detail.code === 'csrf_failed') return 'forbidden'
      if (detail.code === 'rate_limited') return 'rate_limited'
      if (detail.code === 'not_found') return 'not_found'
      return detail.code ?? 'generic'
    }
  } catch {
    // Not JSON: a code from the stream, or a network failure.
  }
  if (/failed to fetch|networkerror|load failed|network/i.test(text)) return 'network'
  if (/^[a-z_]{3,40}$/.test(text)) return text
  return 'generic'
}

/** Errors that a second try cannot fix (the conversation has to be a new one, or somebody has to change a setting). */
export const NOT_RETRIABLE: readonly string[] = ['unauthorized', 'forbidden', 'admin_disabled', 'operator_disabled', 'no_api_key', 'key_malformed', 'model_lock', 'model_unverified', 'conversation_closed', 'conversation_expired', 'conversation_full', 'context_unavailable', 'sensitive_data', 'tooLong', 'empty', 'not_found', 'budget']
export const NEEDS_NEW_CONVERSATION: readonly string[] = ['conversation_closed', 'conversation_expired', 'conversation_full', 'context_unavailable', 'not_found']

/** What the transport reads when a request is made: the language, the context of a new conversation, and what to do when an answer is finished (all of it changes while the screen lives). */
interface Bridge {
  language: AssistantLanguage
  context: ContextChoice
  finished: () => void
}

/** One assistant screen is open at a time, so what its transport reads lives here (a plain object the screen's effects and handlers write to; render never reads it). */
const bridge: Bridge = { language: 'en', context: GENERAL_CONTEXT, finished: () => undefined }

function makeChat(id: string, messages: UIMessage[]): Chat<UIMessage> {
  return new Chat<UIMessage>({
    id,
    messages,
    transport: new DefaultChatTransport({
      api: assistant.chat,
      credentials: 'same-origin',
      headers: () => ({ 'X-CSRF-Token': getCsrfToken() ?? '' }),
      // The server keeps the conversation: it is told which one, in which language, and the one new message (or "again"). The context only matters for a new conversation.
      prepareSendMessagesRequest: ({ id: conversationId, messages: all, trigger }) => {
        const { context, language } = bridge
        const base = { conversationId, language }
        return {
          body:
            trigger === 'regenerate-message'
              ? { ...base, trigger: 'regenerate-assistant-message' }
              : { ...base, trigger: 'submit-user-message', text: lastUserText(all), ...(context.type === 'general' ? {} : { context: { type: context.type, ref: context.ref } }) },
        }
      },
    }),
    onFinish: () => bridge.finished(),
    onError: (error) => {
      if (chatErrorCode(error) === 'unauthorized') notifySessionEnded()
    },
  })
}

export function useAssistantChat(options: { language: AssistantLanguage; onFinished: () => void }) {
  // A screen that opens starts about the whole business, whatever the last one was about (this effect runs before the screen's own, which may start another context).
  useEffect(() => {
    bridge.context = GENERAL_CONTEXT
  }, [])
  useEffect(() => {
    bridge.language = options.language
    bridge.finished = options.onFinished
  })

  const [state, setState] = useState<{ chat: Chat<UIMessage>; active: ActiveConversation }>(() => {
    const id = newConversationId()
    return { chat: makeChat(id, []), active: { id, context: GENERAL_CONTEXT, isNew: true, contextAvailable: true, closed: false, title: null } }
  })
  const chat = useChat({ chat: state.chat })
  const busy = chat.status === 'submitted' || chat.status === 'streaming'
  const { setMessages } = chat

  const stopIfBusy = useCallback(() => {
    if (state.chat.status === 'submitted' || state.chat.status === 'streaming') void state.chat.stop()
  }, [state.chat])

  /** A new, empty conversation about a context. */
  const startNew = useCallback(
    (context: ContextChoice) => {
      stopIfBusy()
      const id = newConversationId()
      bridge.context = context
      setState({ chat: makeChat(id, []), active: { id, context, isNew: true, contextAvailable: true, closed: false, title: null } })
    },
    [stopIfBusy],
  )

  /** A stored conversation, with its messages and the context it started with. */
  const open = useCallback(
    (detail: ConversationDetail) => {
      stopIfBusy()
      const context: ContextChoice = { type: detail.contextType, ref: detail.contextRef, label: detail.contextRef }
      bridge.context = context
      setState({ chat: makeChat(detail.id, detail.messages), active: { id: detail.id, context, isNew: false, contextAvailable: detail.contextAvailable, closed: detail.status === 'closed', title: detail.title } })
    },
    [stopIfBusy],
  )

  const send = useCallback((text: string) => state.chat.sendMessage({ text }), [state.chat])
  const stop = useCallback(() => void state.chat.stop(), [state.chat])

  /**
   * Another try after an error. If the server stored the question (the answer failed), the answer is asked again; if it never stored it (a refusal before anything
   * happened), the question is sent again. Either way nothing is asked twice.
   */
  const retry = useCallback(async () => {
    const current = state.chat
    const stored = await assistant.read(current.id).catch(() => null)
    current.clearError()
    if (stored && stored.messages.at(-1)?.role === 'user') {
      await current.regenerate()
      return
    }
    const text = lastUserText(current.messages)
    if (!text) return
    setMessages((previous) => previous.slice(0, -1))
    await current.sendMessage({ text })
  }, [state.chat, setMessages])

  const regenerate = useCallback(() => state.chat.regenerate(), [state.chat])
  const setActive = useCallback((patch: Partial<ActiveConversation>) => setState((previous) => ({ ...previous, active: { ...previous.active, ...patch } })), [])

  return { ...chat, busy, active: state.active, setActive, startNew, open, send, stop, retry, regenerate }
}
