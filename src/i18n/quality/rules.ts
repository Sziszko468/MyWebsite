import { LANGUAGES, type Language } from '../config'
import { glossary } from './glossary'
import type { Finding, Severity, TextEntry } from './types'

/**
 * The checks that need no dictionary: they compare the three versions of a text with each other and look for the
 * mistakes that machines are good at (a missing language, a lost placeholder, a number that changed in translation,
 * a broken character, a stray space, a straight quote, a word the glossary forbids).
 *
 * What a machine cannot tell (is this natural Dutch? is it plain enough?) is NOT decided here: that is the human
 * review, and the report says plainly which parts had one and which did not.
 */

export interface Allowances {
  /** Texts whose three versions may be identical on purpose (names, codes, symbols). */
  sameOnPurpose: (entry: TextEntry, text: string) => boolean
  /** Texts where a number may be written differently in the languages. */
  numbersMayDiffer: (entry: TextEntry) => boolean
}

export const noAllowances: Allowances = { sameOnPurpose: () => false, numbersMayDiffer: () => false }

const finding = (rule: string, severity: Severity, entry: TextEntry, message: string, lang?: Language, sample?: string): Finding => ({
  rule,
  severity,
  id: entry.id,
  ...(lang ? { lang } : {}),
  message,
  ...(sample === undefined ? {} : { sample: sample.length > 140 ? `${sample.slice(0, 137)}…` : sample }),
})

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g

export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]).sort()
}

/** The numbers in a text, ignoring the ones that are part of a placeholder name; `1,5` and `1.5` are the same number. */
export function numbersOf(text: string): string[] {
  return [...text.replace(PLACEHOLDER, ' ').matchAll(/\d+(?:[.,]\d+)*/g)].map((match) => match[0].replace(',', '.')).sort()
}

const wordsOf = (text: string): string[] => text.replace(PLACEHOLDER, ' ').match(/[\p{L}][\p{L}'’-]*/gu) ?? []

/** Words that only exist in a formal form of address (Hungarian "Ön") or in a different register than the site's. */
const FORMAL: Partial<Record<Language, RegExp>> = {
  // The site speaks to the visitor as "te" in Hungarian (Válassz, kérhetsz) and "je" in Dutch (Kies, je kunt).
  hu: /(^|[\s(„"])(Ön|Önnek|Önt|Önök|Önöknek|Önről|Kérjük|Kérem|Tisztelt|Szíves)(?=[\s,.;:!?)”"]|$)/,
  nl: /(^|[\s(‘'"“])(u|uw|U|Uw)(?=[\s,.;:!?)’'"”]|$)/,
}

export function checkEntry(entry: TextEntry, allowances: Allowances = noAllowances): Finding[] {
  const out: Finding[] = []
  const present = LANGUAGES.filter((lang) => typeof entry.texts[lang] === 'string') as Language[]

  // A field that is blank in every language is an optional field left blank on purpose (a help line, a note): not a translation gap.
  const blankEverywhere = present.length === LANGUAGES.length && LANGUAGES.every((lang) => (entry.texts[lang] ?? '').trim() === '')
  if (blankEverywhere) return out
  for (const lang of LANGUAGES) {
    const text = entry.texts[lang]
    if (typeof text !== 'string') out.push(finding('missing', 'error', entry, `no ${lang.toUpperCase()} text`, lang))
    else if (text.trim() === '') out.push(finding('empty', 'error', entry, `the ${lang.toUpperCase()} text is empty while another language has one`, lang))
  }
  if (present.length < LANGUAGES.length) return out

  const texts = entry.texts as Record<Language, string>

  // Placeholders: the same names in every language, none lost, none invented.
  const reference = placeholdersOf(texts.en)
  for (const lang of LANGUAGES) {
    const names = placeholdersOf(texts[lang])
    if (names.join('|') !== reference.join('|')) {
      out.push(finding('placeholders', 'error', entry, `placeholders differ from English: [${names.join(', ')}] instead of [${reference.join(', ')}]`, lang, texts[lang]))
    }
  }

  // Numbers: a price, a count or a duration must not change in translation.
  if (!allowances.numbersMayDiffer(entry)) {
    const numbers = numbersOf(texts.en).join('|')
    for (const lang of ['hu', 'nl'] as const) {
      if (numbersOf(texts[lang]).join('|') !== numbers) {
        out.push(finding('numbers', 'error', entry, `numbers differ from English: [${numbersOf(texts[lang]).join(', ')}] instead of [${numbersOf(texts.en).join(', ')}]`, lang, texts[lang]))
      }
    }
  }

  for (const lang of LANGUAGES) {
    const text = texts[lang]

    // Letters beyond ASCII (nulláról) must not count as a word boundary, so the word test uses Unicode lookarounds.
    if (/(?<![\p{L}\p{N}_])(undefined|TODO|FIXME|XXX|lorem ipsum)(?![\p{L}\p{N}_])|\[object Object\]/iu.test(text) || /^(null|NaN)$/.test(text.trim()) || /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+){2,}$/.test(text.trim())) {
      out.push(finding('junk', 'error', entry, 'looks like a raw key, a placeholder text or a programming leftover', lang, text))
    }
    if (/�|Ã[\u0080-¿]|Â[\u0080-¿]|â€|Å[\u0080-¿]|Ä[\u0080-¿]/.test(text)) {
      out.push(finding('encoding', 'error', entry, 'broken characters (text saved in the wrong encoding)', lang, text))
    }
    if (lang === 'hu' && /[õûÕÛ]/.test(text)) {
      out.push(finding('diacritics', 'error', entry, 'õ/û (Latin-2 letters) instead of ő/ű', lang, text))
    }
    if (/^\s|\s$/.test(text)) out.push(finding('whitespace', 'error', entry, 'starts or ends with a space', lang, JSON.stringify(text)))
    if (/\t/.test(text)) out.push(finding('whitespace', 'error', entry, 'contains a tab', lang, text))
    if (/ {2,}/.test(text)) out.push(finding('whitespace', 'error', entry, 'contains a double space', lang, text))
    // A list of the characters themselves ("the characters + ( ) - . /") is not punctuation to be spaced.
    if (/\s[,.;:!?](?=\s|$)/.test(text.replace(/…/g, '').replace(/\+ \( \) - \. \//g, ''))) out.push(finding('whitespace', 'error', entry, 'a space before punctuation', lang, text))
    if (/[,;:!?][A-Za-zÀ-ÿ]/.test(text.replace(PLACEHOLDER, 'x')) && !/https?:|\d[,.:]\d/.test(text)) {
      out.push(finding('whitespace', 'warning', entry, 'no space after punctuation', lang, text))
    }

    if (/"/.test(text)) out.push(finding('quotes', 'error', entry, 'a straight double quote: use the typographic quotes of the language (HU „…”, EN “…”, NL ‘…’)', lang, text))
    if (/[\p{L}]'[\p{L}]/u.test(text)) out.push(finding('quotes', 'error', entry, 'a straight apostrophe inside a word: use ’', lang, text))
    if (lang === 'hu' && /[“‘]/.test(text)) out.push(finding('quotes', 'error', entry, 'English quotation marks in Hungarian text: use „…”', lang, text))
    if ((lang === 'en' || lang === 'nl') && /[„]/.test(text)) out.push(finding('quotes', 'error', entry, 'Hungarian quotation marks in this language', lang, text))
    for (const [open, close] of [['(', ')'], ['[', ']']] as const) {
      if (text.split(open).length !== text.split(close).length) out.push(finding('brackets', 'error', entry, `unbalanced ${open}${close}`, lang, text))
    }

    const formal = FORMAL[lang]
    if (formal && formal.test(text)) out.push(finding('register', 'error', entry, lang === 'hu' ? 'formal address (Ön…) in a site that says "te"' : 'formal address (u/uw) in a site that says "je"', lang, text))

    for (const term of glossary) {
      for (const bad of term.forbidden[lang] ?? []) {
        if (bad.test(text)) out.push(finding('glossary', 'error', entry, `${lang.toUpperCase()}: "${term.concept}" must be written as ${term.use[lang]}`, lang, text))
      }
    }
  }

  // Untranslated text: two languages carrying the same sentence.
  const same = (a: Language, b: Language) => {
    const left = texts[a].trim().toLowerCase()
    return left === texts[b].trim().toLowerCase() && wordsOf(left).join('').length >= 12 && wordsOf(left).length >= 2 && !allowances.sameOnPurpose(entry, texts[a])
  }
  if (same('hu', 'en')) out.push(finding('untranslated', 'error', entry, 'the Hungarian text is identical to the English one', 'hu', texts.hu))
  if (same('nl', 'en')) out.push(finding('untranslated', 'error', entry, 'the Dutch text is identical to the English one', 'nl', texts.nl))
  if (same('hu', 'nl') && !same('hu', 'en')) out.push(finding('untranslated', 'error', entry, 'the Hungarian and Dutch texts are identical', 'hu', texts.hu))

  // A translation far shorter than the others has probably lost something.
  const lengths = LANGUAGES.map((lang) => texts[lang].length)
  const longest = Math.max(...lengths)
  if (longest >= 80) {
    for (const lang of LANGUAGES) {
      if (texts[lang].length < longest * 0.4) out.push(finding('length', 'warning', entry, `much shorter than the longest version (${texts[lang].length} vs ${longest} characters): check nothing was dropped`, lang, texts[lang]))
    }
  }
  return out
}

export function checkEntries(entries: readonly TextEntry[], allowances: Allowances = noAllowances): Finding[] {
  return entries.flatMap((entry) => checkEntry(entry, allowances))
}
