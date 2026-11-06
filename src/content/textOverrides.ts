import type { Language } from '../i18n/config'

/**
 * The wording an administrator changed (what the backend's /api/texts returns) laid over the website's own words at run time.
 * Keys are paths: `dict.home.final.title` into the language's dictionary, `shop.configurator...` into the shop's already
 * localised texts. Nothing is added: an override replaces a string that exists, an unknown path is ignored, and a text that
 * lost a `{placeholder}` the original had is ignored too (the page would show the braces). With no overrides the original
 * object is returned untouched, so the site with no backend is exactly the site it was.
 */

export type TextOverrides = Record<string, Partial<Record<Language, string>>>

export const isTrilingualLeaf = (value: unknown): value is Record<Language, string> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.hu === 'string' && typeof candidate.en === 'string' && typeof candidate.nl === 'string'
}

const PLACEHOLDER = /\{[a-zA-Z0-9]+\}/g
const keepsPlaceholders = (original: string, replacement: string): boolean => (original.match(PLACEHOLDER) ?? []).every((token) => replacement.includes(token))

/** A copy of `source` with the overrides of one language written in at the paths below `prefix` (`dict` or `shop`). */
export function applyTextOverrides<T>(source: T, overrides: TextOverrides | null, prefix: 'dict' | 'shop', lang: Language): T {
  if (!overrides) return source
  const wanted = Object.entries(overrides).filter(([key, values]) => key.startsWith(`${prefix}.`) && typeof values[lang] === 'string' && values[lang] !== '')
  if (wanted.length === 0) return source
  const copy = structuredClone(source) as unknown
  for (const [key, values] of wanted) {
    const segments = key.slice(prefix.length + 1).split('.')
    let node = copy as Record<string, unknown> | unknown[]
    for (const segment of segments.slice(0, -1)) {
      const next = (node as Record<string, unknown>)[segment]
      if (typeof next !== 'object' || next === null) {
        node = null as unknown as Record<string, unknown>
        break
      }
      node = next as Record<string, unknown>
    }
    if (!node) continue
    const last = segments[segments.length - 1]
    const current = (node as Record<string, unknown>)[last]
    const value = values[lang] as string
    if (typeof current === 'string' && keepsPlaceholders(current, value)) (node as Record<string, unknown>)[last] = value
  }
  return copy as T
}
