import { useEffect, useState } from 'react'
import { apiEndpoint } from '../config/api'
import type { Language } from '../i18n/config'

/**
 * Whether to offer the assistant at all, and with which texts. This is the only part of the assistant that runs on every page,
 * so it is deliberately tiny: one small cacheable request, made when the browser is idle, and no AI library. When there is no
 * backend, or it does not answer, or the assistant is switched off, the answer is "no" and the page is exactly what it was
 * before the assistant existed: the rest of the website never depends on it.
 */

export interface AiPublicConfig {
  available: boolean
  /** `model`: the assistant was switched on but the required AI model could not be verified; the page says so. Otherwise null. */
  unavailableReason?: 'model' | null
  languages: Language[]
  plannerEnabled: boolean
  quoteEnabled: boolean
  maxInputChars: number
  /** How many days the words of a conversation stay on the server. */
  retentionDays: number
  welcome: Record<Language, string>
  suggestions: Record<Language, string[]>
}

let pending: Promise<AiPublicConfig | null> | null = null
let known: AiPublicConfig | null | undefined

const valid = (value: unknown): value is AiPublicConfig => typeof value === 'object' && value !== null && typeof (value as AiPublicConfig).available === 'boolean' && Array.isArray((value as AiPublicConfig).languages)

export function loadAiConfig(force = false): Promise<AiPublicConfig | null> {
  if (force) pending = null
  pending ??= (async () => {
    const url = apiEndpoint('/api/ai/config')
    if (url === null) return null
    try {
      const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } })
      if (!response.ok) return null
      const body = (await response.json()) as { data?: unknown }
      return valid(body.data) ? body.data : null
    } catch {
      return null
    }
  })().then((config) => {
    known = config
    return config
  })
  return pending
}

/** What is known so far (`undefined`: not asked yet; `null`: no assistant). */
export const knownAiConfig = (): AiPublicConfig | null | undefined => known

const idle = (work: () => void): (() => void) => {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(work, { timeout: 3000 })
    return () => window.cancelIdleCallback(handle)
  }
  const timer = window.setTimeout(work, 1500)
  return () => window.clearTimeout(timer)
}

/** The configuration, asked for when the browser is idle (or at once with `immediately`, for the page that is the assistant). */
export function useAiConfig(immediately = false): { config: AiPublicConfig | null; ready: boolean } {
  const [state, setState] = useState<{ config: AiPublicConfig | null; ready: boolean }>(() => (known === undefined ? { config: null, ready: false } : { config: known, ready: true }))
  useEffect(() => {
    if (state.ready) return
    let alive = true
    const ask = () => void loadAiConfig().then((config) => alive && setState({ config, ready: true }))
    if (immediately) ask()
    else {
      const cancel = idle(ask)
      return () => {
        alive = false
        cancel()
      }
    }
    return () => {
      alive = false
    }
  }, [immediately, state.ready])
  return state
}
