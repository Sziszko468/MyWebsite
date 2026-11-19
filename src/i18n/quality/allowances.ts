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

/**
 * Texts that are blank in every language ON PURPOSE (PROMPT 32.1): an optional field the site draws only when it has text. `i18n validate` counted them as "not complete" (4221 of 4225);
 * they are not missing translations. Each is listed with the reason and with the place that guards it, so a text that is blank because somebody forgot it is an error (rule `blank`).
 */
const BLANK_ON_PURPOSE: Array<{ id: string; reason: string }> = [
  {
    id: 'content/shop/comparison.ts#baseComparison.features[1].description',
    reason: 'The "works on phones, tablets and computers" row of the tier comparison needs no explanation; the row draws its explain button only when the description is not empty (FeatureName, components/shop/tiers/marks.tsx).',
  },
  {
    id: 'content/shop/fullExperience.ts#baseFullExperience.configurator.questions[0].help',
    reason: 'The one shared blank text (`EMPTY`) that the FULL EXPERIENCE configurator uses for every help line and option hint that has no words (the inventory reads a shared object once, at the first question). The configurator draws a help line only when it has text (FullExperienceConfigurator.tsx).',
  },
  {
    id: 'content/shop/fullExperience.ts#fullExperience.configurator.questions[0].help',
    reason: 'The same shared blank text in the working copy of the offer (a clone of the base, the one that the published document of the owner replaces): blank for the same reason and guarded in the same place.',
  },
  {
    id: 'content/quotes/index.ts#quoteText.quote.price.tax.unspecified',
    reason: 'When the tax mode of a quotation is not specified the quotation shows no tax sentence at all (the studio has not said whether prices include VAT, and inventing a sentence would be a statement about tax); the page draws the note only when it has text (CustomerPages.tsx).',
  },
]

/** Entries whose numbers are written differently per language on purpose (none yet). */
const NUMBERS_MAY_DIFFER: RegExp[] = []

export const allowances: Allowances = {
  sameOnPurpose: (_entry, text) => SAME_ON_PURPOSE.some((pattern) => pattern.test(text.trim())),
  numbersMayDiffer: (entry) => NUMBERS_MAY_DIFFER.some((pattern) => pattern.test(entry.id)),
  foreignPhrases: FOREIGN_PHRASES.map((phrase) => phrase.pattern),
  blankOnPurpose: (entry) => BLANK_ON_PURPOSE.some((blank) => blank.id === entry.id),
}

/** The texts that are blank on purpose, with their reasons, for the documentation and the tests. */
export const blankOnPurposeReasons = BLANK_ON_PURPOSE

/** The list with its reasons, for the documentation and the tests. */
export const foreignPhraseReasons = FOREIGN_PHRASES.map(({ pattern, reason }) => ({ phrase: pattern.source, reason }))
