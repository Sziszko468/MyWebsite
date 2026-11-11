import { LANGUAGES, type Language } from '../../config.ts'

/**
 * The rule that keeps a half-translated text off the website (PROMPT 18). A record is on the website only while its status
 * is `active`; an `active` record must say the same things in all three languages. A text that one language has and another
 * lacks is "missing" in the same sense the translation screen uses (modules/catalog/translations.ts): empty in this language
 * while another language has it. A field that is empty in every language is left alone (it may be meant to be empty), and
 * a record that is `disabled` may be saved half-finished: that is how a draft is kept.
 */

type Value = string | readonly string[] | null | undefined

const isFilled = (value: Value): boolean => (Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value.trim() !== '')

export interface LanguageGap {
  language: Language
  field: string
}

/** The (language, field) pairs that stop a record from being published, in language order. */
export function languageGaps(translations: Record<Language, Record<string, Value>>, fields: readonly string[]): LanguageGap[] {
  const gaps: LanguageGap[] = []
  for (const field of fields) {
    const filled = LANGUAGES.filter((language) => isFilled(translations[language]?.[field]))
    if (filled.length === 0) continue
    for (const language of LANGUAGES) if (!filled.includes(language)) gaps.push({ language, field })
  }
  return gaps
}

/** The translatable fields of each kind of record, as the parsers in admin.ts name them. */
export const PUBLISH_FIELDS = {
  service: ['title', 'summary', 'tagline', 'overview', 'features'],
  package: ['name', 'tagline', 'audience', 'scope', 'customization', 'support', 'priceNote', 'includes', 'fits', 'deliverables'],
  extra: ['name', 'summary'],
  content: ['title', 'description'],
} as const

export type PublishKind = keyof typeof PUBLISH_FIELDS
