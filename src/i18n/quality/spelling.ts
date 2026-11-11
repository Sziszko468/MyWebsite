import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { LANGUAGES, type Language } from '../config'
import { allowedWords, hungarianSuffixes, spellingSkippedIds } from './allowedWords'
import type { Finding, TextEntry } from './types'

/**
 * Spelling of every text in its own language, with real dictionaries (Hunspell word lists, the same engine and the same
 * data as LibreOffice and Firefox):
 *
 *   - English: British English (`dictionary-en-gb`). The site uses one variant, and "colour", "centre", "customisation" are
 *     what its copy already says; an American spelling is a finding.
 *   - Dutch (Netherlands): `dictionary-nl`.
 *   - Hungarian: `dictionary-hu`, through `hunspell-asm` (WebAssembly Hunspell). The pure-JavaScript engine used for the other two
 *     (`nspell`) cannot hold Hungarian's affix rules in memory, and `hunspell-asm` pulls in an old dependency with published advisories, so it
 *     is NOT a dependency of the project: install it for the run (`npm install --no-save hunspell-asm`, as the CI workflow does). Without it
 *     the Hungarian spelling is reported as NOT CHECKED, never as passed.
 *
 * A spell checker finds misspelled words. It does not find a correctly spelled wrong word, bad grammar or unnatural phrasing:
 * that is what the human review is for, and no report from here says otherwise.
 */

export interface SpellChecker {
  engine: string
  correct(word: string): boolean
  suggest(word: string): string[]
  dispose?: () => void
}

export interface LoadedCheckers {
  checkers: Partial<Record<Language, SpellChecker>>
  /** Languages that could not be checked, and why. */
  skipped: Partial<Record<Language, string>>
}

export async function loadSpellCheckers(root: string): Promise<LoadedCheckers> {
  const require = createRequire(`${root.replace(/[\\/]+$/, '')}/package.json`)
  // Node's own import(), not the bundler's: the dictionaries and nspell are CommonJS/ESM packages that must load as they are.
  const nativeImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<{ default: never }>
  const importFrom = async (name: string) => await nativeImport(pathToFileURL(require.resolve(name)).href)
  const checkers: LoadedCheckers['checkers'] = {}
  const skipped: LoadedCheckers['skipped'] = {}

  const DICTIONARIES = { hu: 'dictionary-hu', en: 'dictionary-en-gb', nl: 'dictionary-nl' } as const

  // First choice for all three languages: Hunspell itself (hunspell-asm), which handles Hungarian's affix rules and Dutch's
  // compound words the way LibreOffice does. It is installed for the run, not a dependency of the project.
  let factory: HunspellFactory | null = null
  try {
    const { loadModule } = (await importFrom('hunspell-asm')) as unknown as { loadModule: () => Promise<HunspellFactory> }
    factory = await loadModule()
  } catch (error) {
    skipped.hu = `hunspell-asm is not installed (npm install --no-save hunspell-asm): ${(error as Error).message}`
  }
  if (factory) {
    for (const lang of LANGUAGES) {
      try {
        const dictionary = (await importFrom(DICTIONARIES[lang])).default as { aff: Uint8Array; dic: Uint8Array }
        const aff = factory.mountBuffer(new Uint8Array(dictionary.aff), `${lang}.aff`)
        const dic = factory.mountBuffer(new Uint8Array(dictionary.dic), `${lang}.dic`)
        const hunspell = factory.create(aff, dic)
        checkers[lang] = { engine: `Hunspell (hunspell-asm) + ${DICTIONARIES[lang]}`, correct: (word) => hunspell.spell(word), suggest: (word) => hunspell.suggest(word), dispose: () => hunspell.dispose() }
      } catch (error) {
        skipped[lang] = `${DICTIONARIES[lang]} could not be loaded: ${(error as Error).message}`
      }
    }
  }

  // Fallback without hunspell-asm: nspell for English and Dutch. It is weaker with Dutch compounds, so it can only over-report. Hungarian cannot be loaded by it at all.
  if (!factory) {
    try {
      const nspell = (await importFrom('nspell')).default as unknown as (dictionary: unknown) => { correct(w: string): boolean; suggest(w: string): string[] }
      for (const lang of ['en', 'nl'] as const) {
        try {
          const speller = nspell((await importFrom(DICTIONARIES[lang])).default)
          checkers[lang] = { engine: `nspell + ${DICTIONARIES[lang]} (fallback)`, correct: (word) => speller.correct(word), suggest: (word) => speller.suggest(word) }
          delete skipped[lang]
        } catch (error) {
          skipped[lang] = `${DICTIONARIES[lang]} could not be loaded: ${(error as Error).message}`
        }
      }
    } catch (error) {
      skipped.en = skipped.nl = `nspell could not be loaded: ${(error as Error).message}`
    }
  }
  return { checkers, skipped }
}

interface HunspellFactory {
  mountBuffer(buffer: Uint8Array, name: string): string
  create(aff: string, dic: string): { spell(word: string): boolean; suggest(word: string): string[]; dispose(): void }
}

const WORD = /[\p{L}][\p{L}\p{M}'’-]*/gu
const STRIP = /\{[A-Za-z0-9_]+\}|https?:\/\/\S+|[\w.+-]+@[\w-]+(\.[\w-]+)+|\b[\w-]+\.(com|hu|nl|dev|io|xyz|test)\b/g

/** The words of a text that are worth looking up. */
export function wordsToCheck(text: string): string[] {
  // A closing quote before a hyphen (‘Vandaag’-knop) and the empty brackets of a call (Number()-rel) are punctuation, not part of the word.
  return (text.replace(STRIP, ' ').replace(/’-/g, '-').replace(/\(\)/g, '').match(WORD) ?? []).map((word) => word.replace(/^[-'’]+|[-'’]+$/g, '')).filter((word) => word.length >= 3)
}

/** "React-tel", "AI-ban", "OCR-rel": a name or an acronym with a Hungarian case ending; the name is not looked up, the ending must be a real one. */
function isNameWithSuffix(word: string, names: Set<string>, checker: SpellChecker): boolean {
  const parts = word.split('-')
  if (parts.length !== 2) return false
  const [stem, ending] = parts
  if (!hungarianSuffixes.has(ending.toLowerCase())) return false
  return names.has(stem.toLowerCase()) || /^[\p{Lu}\d]+$/u.test(stem) || checker.correct(stem) || checker.correct(stem.toLowerCase())
}

function isOk(word: string, lang: Language, checker: SpellChecker, cache: Map<string, boolean>): boolean {
  const key = `${lang}:${word}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const normal = word.replace(/’/g, "'")
  const lower = normal.toLowerCase()
  let ok: boolean
  if (allowedWords[lang].has(lower)) ok = true
  else if (/^[\p{Lu}\d]+$/u.test(normal)) ok = true // an acronym: API, SEO, FAQ
  else if (/\p{Ll}\p{Lu}/u.test(normal)) ok = true // a product name: GitHub, WebGL, iPhone
  else if (checker.correct(normal) || checker.correct(lower)) ok = true
  else if (lang === 'hu' && normal.includes('-') && isNameWithSuffix(normal, allowedWords.hu, checker)) ok = true
  else if (normal.includes('-')) {
    ok = normal
      .split('-')
      .filter((part) => part.length >= 3)
      .every((part) => allowedWords[lang].has(part.toLowerCase()) || /^[\p{Lu}\d]+$/u.test(part) || checker.correct(part) || checker.correct(part.toLowerCase()))
  } else ok = false
  cache.set(key, ok)
  return ok
}

export interface SpellingResult {
  findings: Finding[]
  /** How many distinct words were looked up, and how many were not found, per language. */
  stats: Record<Language, { checked: number; misspelled: number }>
}

export function checkSpelling(entries: readonly TextEntry[], loaded: LoadedCheckers): SpellingResult {
  const cache = new Map<string, boolean>()
  const findings: Finding[] = []
  const stats = Object.fromEntries(LANGUAGES.map((lang) => [lang, { checked: 0, misspelled: 0 }])) as SpellingResult['stats']
  const reported = new Set<string>()
  const distinct = new Map<Language, Set<string>>(LANGUAGES.map((lang) => [lang, new Set<string>()]))
  const wrong = new Map<Language, Set<string>>(LANGUAGES.map((lang) => [lang, new Set<string>()]))

  for (const entry of entries) {
    if (spellingSkippedIds.some((pattern) => pattern.test(entry.id))) continue
    for (const lang of LANGUAGES) {
      const checker = loaded.checkers[lang]
      const text = entry.texts[lang]
      if (!checker || typeof text !== 'string') continue
      for (const word of wordsToCheck(text)) {
        distinct.get(lang)!.add(word.toLowerCase())
        if (isOk(word, lang, checker, cache)) continue
        wrong.get(lang)!.add(word.toLowerCase())
        const key = `${lang}:${entry.id}:${word.toLowerCase()}`
        if (reported.has(key)) continue
        reported.add(key)
        const suggestions = checker.suggest(word.replace(/’/g, "'")).slice(0, 3)
        findings.push({
          rule: 'spelling',
          severity: 'error',
          id: entry.id,
          lang,
          message: `"${word}" is not in the ${lang.toUpperCase()} dictionary${suggestions.length > 0 ? ` (did you mean ${suggestions.join(', ')}?)` : ''}`,
          sample: text.length > 140 ? `${text.slice(0, 137)}…` : text,
        })
      }
    }
  }
  for (const lang of LANGUAGES) stats[lang] = { checked: distinct.get(lang)!.size, misspelled: wrong.get(lang)!.size }
  return { findings, stats }
}
