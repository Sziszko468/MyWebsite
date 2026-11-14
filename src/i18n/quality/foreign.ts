import { LANGUAGES, type Language } from '../config'
import wordLists from './foreignWords.json'

/**
 * Words of another language inside a text (PROMPT 23): the leftover of a sentence that was copied and never translated, or one that
 * starts in Hungarian and ends in English. `untranslated` (rules.ts) finds a text that is IDENTICAL in two languages; this finds the
 * words that do not belong, whatever the rest of the sentence says.
 *
 * It is a deterministic list, not a language detector: each language has a few dozen small words (the, and, with / és, hogy, nem /
 * het, niet, voor) that belong to it and to neither of the other two (`foreignWords.json`, which the browser journey reads too). A word
 * that means something in two of the languages is NOT on a list: "most" (Hungarian "now") is English too, "over" is English and Dutch,
 * "van" is Dutch and English, "is" is all three. The lists are short on purpose, so a finding is a real one; a longer list would find
 * more and be wrong more often.
 *
 * A name, a title or a fixed term that really is written in another language inside a sentence is not a finding: it is listed with
 * its reason in `allowances.ts` (`foreignPhrases`) and removed before the scan.
 */

const MARKERS: Record<Language, ReadonlySet<string>> = { hu: new Set(wordLists.hu), en: new Set(wordLists.en), nl: new Set(wordLists.nl) }

/** Letters that exist in one language's alphabet only: Hungarian ő and ű are in no English and no Dutch word (a name aside). */
const HUNGARIAN_LETTERS = /[őűŐŰ]/

export interface ForeignHit {
  /** The language the words belong to. */
  from: Language
  words: string[]
}

/** What is left of a text once the things that are not language are taken out: placeholders, addresses, code in backticks, and the phrases the allowances name. */
function readable(text: string, ignore: readonly RegExp[]): string {
  let out = text
    .replace(/\{[A-Za-z0-9_]+\}/g, ' ')
    .replace(/https?:\/\/\S+|[\w.+-]+@[\w-]+\.[\w.-]+/g, ' ')
    .replace(/`[^`]*`/g, ' ')
  for (const pattern of ignore) out = out.replace(pattern, ' ')
  return out
}

/**
 * The words of another language in `text`, which is written in `lang`. Empty when there are none. Hungarian ő/ű in English or Dutch text is
 * reported as one hit from Hungarian with the letters themselves.
 */
export function foreignIn(text: string, lang: Language, ignore: readonly RegExp[] = []): ForeignHit[] {
  const clean = readable(text, ignore)
  const found: ForeignHit[] = []
  const tokens = clean.toLowerCase().match(/[\p{L}][\p{L}'’-]*/gu) ?? []
  for (const from of LANGUAGES) {
    if (from === lang) continue
    const hits = [...new Set(tokens.filter((token) => MARKERS[from].has(token)))]
    if (hits.length > 0) found.push({ from, words: hits })
  }
  if (lang !== 'hu' && HUNGARIAN_LETTERS.test(clean)) {
    const letters = [...new Set(clean.match(/[őűŐŰ]/g) ?? [])]
    const existing = found.find((hit) => hit.from === 'hu')
    if (existing) existing.words.push(...letters)
    else found.push({ from: 'hu', words: letters })
  }
  return found
}
