import type { Allowances } from './rules'

/**
 * What the machine checks may let through, each with the reason. Like the spelling list (allowedWords.ts), an entry here is
 * a decision somebody made after reading the text; nothing is added to make a run pass.
 */

/** Texts that are the same in all three languages on purpose. Matched against the English text. */
const SAME_ON_PURPOSE: RegExp[] = [
  // A name or a technology on its own, or a short list of them ("React, TypeScript, Vite").
  /^[A-Z0-9][\w .&+/#,:()’-]*$/,
  // The technical labels of an architecture diagram: tokens joined by a middle dot ("React 19 · TypeScript · Vite",
  // "routers · services · repositories", "/api/send-email · /api/email-status"). They name parts of the code and stay English.
  /^[\w./:@+#-]+(?: [\w./:@+#-]+)* · [\w./:@+# ·-]+$/,
  // The title of a project is its name.
  /^Hollandia Kezdőknek$/,
]

/**
 * Names and fixed terms written in another language inside a sentence, on purpose. Each is removed from the text before `foreign` (foreign.ts)
 * looks for words of another language, so a sentence that really mixes languages is still found. A phrase is added after reading the
 * text, never to make a run pass.
 */
const FOREIGN_PHRASES: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /Do Not Track/g, reason: 'the name of a browser privacy signal; it is written in English in every language' },
  { pattern: /Global Privacy Control/g, reason: 'the name of a browser privacy signal; it is written in English in every language' },
  { pattern: /Hollandia Kezdőknek/g, reason: 'the title of a project (a Hungarian name, shown as it is on the English and Dutch pages)' },
]

/** Entries whose numbers are written differently per language on purpose (none yet). */
const NUMBERS_MAY_DIFFER: RegExp[] = []

export const allowances: Allowances = {
  sameOnPurpose: (_entry, text) => SAME_ON_PURPOSE.some((pattern) => pattern.test(text.trim())),
  numbersMayDiffer: (entry) => NUMBERS_MAY_DIFFER.some((pattern) => pattern.test(entry.id)),
  foreignPhrases: FOREIGN_PHRASES.map((phrase) => phrase.pattern),
}

/** The list with its reasons, for the documentation and the tests. */
export const foreignPhraseReasons = FOREIGN_PHRASES.map(({ pattern, reason }) => ({ phrase: pattern.source, reason }))
