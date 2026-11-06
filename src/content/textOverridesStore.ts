import { useEffect, useSyncExternalStore } from 'react'
import { API_BASE, apiEndpoint } from '../config/api'
import type { TextOverrides } from './textOverrides'

/**
 * The wording an administrator changed, fetched once from the backend (`/api/texts`) and read by the dictionary's provider and the
 * shop's text hook. With no backend, or when it does not answer, there are no overrides and the website says what it always said.
 * The answer is checked before use: only `dict.` and `shop.` keys, only short strings, in the three languages.
 */

let overrides: TextOverrides | null = null
let requested = false
const listeners = new Set<() => void>()

function parse(data: unknown): TextOverrides | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const out: TextOverrides = {}
  for (const [key, values] of Object.entries(data as Record<string, unknown>)) {
    if (!/^(dict|shop)\.[A-Za-z0-9_.]+$/.test(key) || typeof values !== 'object' || values === null) continue
    const entry: TextOverrides[string] = {}
    for (const lang of ['hu', 'en', 'nl'] as const) {
      const value = (values as Record<string, unknown>)[lang]
      if (typeof value === 'string' && value !== '' && value.length <= 800) entry[lang] = value
    }
    if (Object.keys(entry).length > 0) out[key] = entry
  }
  return Object.keys(out).length > 0 ? out : null
}

export function ensureTextOverrides(): void {
  const url = apiEndpoint('/api/texts')
  if (requested || API_BASE === null || url === null) return
  requested = true
  fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { data?: unknown } | null) => {
      overrides = parse(body?.data)
      for (const listener of listeners) listener()
    })
    .catch(() => undefined)
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The overrides (or `null`), asking for them once. */
export function useTextOverrides(): TextOverrides | null {
  useEffect(ensureTextOverrides, [])
  return useSyncExternalStore(subscribe, () => overrides, () => null)
}
