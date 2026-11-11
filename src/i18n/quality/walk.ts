import { LANGUAGES, type Language } from '../config'
import type { Finding, TextEntry } from './types'

/**
 * Finds every text that exists in more than one language inside a value (a module's export), without knowing the
 * shape of the content in advance. Two shapes carry the three versions of a text:
 *
 *   - a text leaf:        `{ hu: '…', en: '…', nl: '…' }`                (what `tri()` makes)
 *   - parallel trees:     `{ hu: { … }, en: { … }, nl: { … } }`          (the dictionaries, an e-mail's word list)
 *
 * Anything else (ids, numbers, flags, functions, plain strings) is language-neutral data and is passed over. An object that
 * has one or two of the three language keys is a finding: a language that went missing is exactly what this exists to catch.
 */

const LANGUAGE_SET = new Set<string>(LANGUAGES)
const MAX_DEPTH = 24

function languageKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) => LANGUAGE_SET.has(key))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function isTextLeaf(value: unknown): boolean {
  return isPlainObject(value) && languageKeys(value).length === LANGUAGES.length && LANGUAGES.every((lang) => typeof value[lang] === 'string')
}

export interface WalkResult {
  entries: Omit<TextEntry, 'source' | 'area'>[]
  findings: Omit<Finding, 'severity'>[]
}

/**
 * `seen` can be shared between calls: the same object reached through a second module (a re-export, an aggregate such as
 * `shopText`) is then counted once, under the module that was read first.
 */
export function walkTexts(root: unknown, rootId: string, seen: WeakSet<object> = new WeakSet<object>()): WalkResult {
  const entries: WalkResult['entries'] = []
  const findings: WalkResult['findings'] = []

  /** Collects every string leaf of one language's tree: `path -> text`. */
  function leaves(value: unknown, path: string, into: Map<string, string>, depth: number): void {
    if (depth > MAX_DEPTH) return
    if (typeof value === 'string') into.set(path, value)
    else if (Array.isArray(value)) value.forEach((item, index) => leaves(item, `${path}[${index}]`, into, depth + 1))
    else if (isPlainObject(value)) for (const [key, item] of Object.entries(value)) leaves(item, path ? `${path}.${key}` : key, into, depth + 1)
  }

  function visit(value: unknown, id: string, depth: number): void {
    if (depth > MAX_DEPTH || typeof value !== 'object' || value === null) return
    if (seen.has(value)) return
    seen.add(value)

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${id}[${index}]`, depth + 1))
      return
    }
    if (!isPlainObject(value)) return

    const present = languageKeys(value)
    if (present.length > 0) {
      const onlyLanguages = Object.keys(value).every((key) => LANGUAGE_SET.has(key))
      // A record of the languages' own names, `{ hu: tri('Magyar', 'Hungarian', 'Hongaars'), en: tri(…), nl: tri(…) }`, is a
      // map from a language to a text, not three versions of one text: it is read entry by entry, like any other record.
      const mapOfTexts = present.some((key) => isTextLeaf(value[key]))
      if (onlyLanguages && !mapOfTexts) {
        const stringLeaf = present.every((key) => typeof value[key] === 'string')
        if (stringLeaf) {
          const texts = Object.fromEntries(LANGUAGES.map((lang) => [lang, value[lang] as string | undefined])) as Record<Language, string | undefined>
          if (present.length < LANGUAGES.length) findings.push({ rule: 'missing', id, message: `only ${present.join(', ')} given; missing ${LANGUAGES.filter((l) => !present.includes(l)).join(', ')}` })
          entries.push({ id, texts })
          return
        }
        // Parallel trees: gather each language's leaves and join them by their path.
        const perLanguage = new Map<Language, Map<string, string>>()
        for (const lang of LANGUAGES) {
          const map = new Map<string, string>()
          leaves(value[lang], '', map, depth + 1)
          perLanguage.set(lang, map)
        }
        if (present.length < LANGUAGES.length) findings.push({ rule: 'missing', id, message: `a whole language tree is missing: has ${present.join(', ')}` })
        const paths = new Set<string>()
        for (const map of perLanguage.values()) for (const path of map.keys()) paths.add(path)
        for (const path of paths) {
          const texts = Object.fromEntries(LANGUAGES.map((lang) => [lang, perLanguage.get(lang)?.get(path)])) as Record<Language, string | undefined>
          entries.push({ id: path ? `${id}.${path}` : id, texts })
        }
        return
      }
      // A mix of language keys and ordinary keys: a text that lost a language, or a record that is not text at all.
      const strings = present.filter((key) => typeof value[key] === 'string')
      if (strings.length > 0 && strings.length < LANGUAGES.length) {
        findings.push({ rule: 'missing', id, message: `looks like a text but has only ${strings.join(', ')}` })
      }
    }
    for (const [key, item] of Object.entries(value)) visit(item, id ? `${id}.${key}` : key, depth + 1)
  }

  visit(root, rootId, 0)
  return { entries, findings }
}
