import type { Language } from '../config'

/**
 * The words the site uses for its own concepts, one per language. A concept written two ways ("add-on" and "extra", "offerte" and
 * "prijsopgave") makes a page feel unsure of itself and, in a shop, makes a customer wonder whether the two are different
 * things. Each entry says which words are WRONG (`forbidden`, tested on every text) and which one to use (`use`).
 *
 * Keep the patterns narrow: they are tested on whole customer-facing sentences, so a word that is right in another meaning
 * must not match. Add a concept here when a review finds the same thing named two ways.
 */

export interface GlossaryTerm {
  concept: string
  /** The word to use, shown in the message. */
  use: Record<Language, string>
  /** Patterns that must not appear in that language. */
  forbidden: Partial<Record<Language, RegExp[]>>
}

export const glossary: GlossaryTerm[] = [
  {
    concept: 'add-on (an optional extra on a package or service)',
    use: { hu: 'kiegészítő', en: 'add-on', nl: 'extra (extra’s)' },
    // Dutch said "toevoeging", "optie" and "extra" for the same thing; English also said "extras" and "additional services".
    forbidden: { en: [/\b(?:optional|available|which|selected) extras\b/i, /\badditional services\b/i], nl: [/\btoevoeging(?:en)?\b/i] },
  },
  {
    concept: 'quote (what the customer asks for and receives)',
    use: { hu: 'ajánlat', en: 'quote', nl: 'offerte' },
    // The request and the document are one thing for the customer: a "quote request" gets a "quote", not a "quotation" (EN) or an "árajánlat" (HU).
    forbidden: { en: [/\bquotations?\b/i], hu: [/árajánlat/i], nl: [/\bprijsopgave\b/i] },
  },
  {
    concept: 'email',
    use: { hu: 'e-mail', en: 'email', nl: 'e-mail' },
    forbidden: { en: [/\be-mail\b/i] },
  },
  {
    concept: 'website',
    use: { hu: 'weboldal', en: 'website', nl: 'website' },
    forbidden: { en: [/\bweb site\b/i], hu: [/honlap/i], nl: [/\bwebstek\b/i] },
  },
  {
    concept: 'package (Launch, Grow, Build, Care)',
    use: { hu: 'csomag', en: 'package', nl: 'pakket' },
    forbidden: { nl: [/\bbundel\b/i], hu: [/\bpakk?et\b/i] },
  },
]
