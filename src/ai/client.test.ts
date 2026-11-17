import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiError, errorFrom, newConversationId, readStored, writeStored, clearStored } from './client'
import { aiText } from '../content/ai'
import { chatErrorCode } from './controlRoom'

/**
 * The browser's half of the assistant's conversation with the server: what an error from the server or the stream means, and
 * what the tab remembers (a session token and a conversation id, never anything the visitor wrote).
 */

describe('what an error from the server means', () => {
  it('reads the code, the reason and the fields out of the server\'s error document', () => {
    const error = errorFrom(429, { error: { code: 'rate_limited', message: 'x', details: { reason: 'session_requests', fields: { text: 'tooLong' } } } })
    expect(error).toBeInstanceOf(AiError)
    expect(error).toMatchObject({ status: 429, code: 'rate_limited', reason: 'session_requests', fields: { text: 'tooLong' } })
  })

  it('survives a body that is not an error document', () => {
    for (const parsed of [null, 'oops', 42, {}, { error: null }, { error: { code: 7, details: 'x' } }]) {
      expect(errorFrom(500, parsed)).toMatchObject({ status: 500, code: 'error', reason: null, fields: {} })
    }
  })
})

describe('what a chat error means to the interface', () => {
  const json = (code: string, reason?: string) => new Error(JSON.stringify({ error: { code, details: reason ? { reason } : {} } }))

  it('has words, in all three languages, for every state the server can end an answer in (PROMPT 29): no code falls back to the generic sentence', () => {
    const states = [
      chatErrorCode(json('service_unavailable', 'capacity')),
      chatErrorCode(json('validation_failed', 'sensitive_data')),
      chatErrorCode(new Error('provider_invalid_response')),
      chatErrorCode(new Error('output_limit')),
      chatErrorCode(new Error('provider_rate_limit')),
      chatErrorCode(new Error('provider_unavailable')),
      chatErrorCode(new Error('timeout')),
      chatErrorCode(json('service_unavailable', 'daily_budget')),
      chatErrorCode(json('rate_limited')),
      chatErrorCode(json('rate_limited', 'session_requests')),
      chatErrorCode(json('service_unavailable', 'unavailable')),
      chatErrorCode(json('service_unavailable', 'model_unverified')),
    ]
    expect(states).toEqual(['capacity', 'sensitive_data', 'provider_invalid_response', 'output_limit', 'provider_rate_limit', 'provider_unavailable', 'timeout', 'budget', 'rate_limited', 'session_requests', 'unavailable', 'model_unverified'])
    const errors = aiText.errors as Record<string, { hu: string; en: string; nl: string }>
    for (const code of states) {
      for (const language of ['hu', 'en', 'nl'] as const) expect(errors[code as string]?.[language]?.trim(), `${code} in ${language}`).toBeTruthy()
    }
    // The two new notes (a stopped answer, an answer cut off at the output limit) exist in every language too.
    for (const language of ['hu', 'en', 'nl'] as const) {
      expect(aiText.status.cancelled[language].length).toBeGreaterThan(10)
      expect(aiText.status.truncated[language].length).toBeGreaterThan(10)
    }
    // The message about a card number or key must not echo one and must say where the contact details go.
    expect(aiText.errors.sensitive_data.en).not.toMatch(/\d{6}/)
  })

  it('turns every spent budget into one code, so the visitor is told one honest thing', () => {
    for (const reason of ['daily_budget', 'monthly_budget', 'daily_tokens', 'daily_requests', 'daily_conversations']) expect(chatErrorCode(json('service_unavailable', reason))).toBe('budget')
  })

  it('keeps the other reasons, falls back to the code, and knows when the assistant is off', () => {
    expect(chatErrorCode(json('rate_limited', 'session_requests'))).toBe('session_requests')
    expect(chatErrorCode(json('conflict', 'busy'))).toBe('busy')
    expect(chatErrorCode(json('not_found'))).toBe('not_found')
    expect(chatErrorCode(json('service_unavailable', 'unavailable'))).toBe('unavailable')
  })

  it('takes a code from the stream as it is', () => {
    expect(chatErrorCode(new Error('provider_unavailable'))).toBe('provider_unavailable')
    expect(chatErrorCode(new Error('timeout'))).toBe('timeout')
  })

  it('calls a dropped connection a network problem, in any browser\'s words', () => {
    for (const message of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'network connection was lost']) expect(chatErrorCode(new Error(message))).toBe('network')
  })

  it('never shows an unknown text: anything else is a generic failure', () => {
    expect(chatErrorCode(new Error('Something with a secret detail: 529 overloaded!'))).toBe('generic')
    expect(chatErrorCode(undefined)).toBeNull()
  })
})

describe('what the tab remembers', () => {
  const values = new Map<string, string>()
  beforeEach(() => {
    values.clear()
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps a token and a conversation id, and nothing else', () => {
    expect(readStored()).toEqual({ token: null, conversationId: null })
    writeStored({ token: 'abc.def' })
    writeStored({ conversationId: 'c123' })
    expect(readStored()).toEqual({ token: 'abc.def', conversationId: 'c123' })
    expect([...values.keys()]).toEqual(['cc-ai'])
    expect(Object.keys(JSON.parse(values.get('cc-ai') ?? '{}')).sort()).toEqual(['conversationId', 'token'])
    clearStored()
    expect(readStored()).toEqual({ token: null, conversationId: null })
  })

  it('ignores a stored value that is not what this code wrote', () => {
    for (const raw of ['not json', '42', '[]', '{"token":7,"conversationId":{}}']) {
      values.set('cc-ai', raw)
      expect(readStored()).toEqual({ token: null, conversationId: null })
    }
  })

  it('makes conversation ids the server accepts: a letter, then 32 hexadecimal characters', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '0123abcd-4567-89ef-0123-456789abcdef' })
    expect(newConversationId()).toMatch(/^c[0-9a-f]{32}$/)
  })
})
