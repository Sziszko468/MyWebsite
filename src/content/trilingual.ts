import type { Language } from '../i18n/config'

/** A text in every language the site speaks. All three are required, so a missing translation fails the build. */
export type Trilingual = Record<Language, string>

/** `tri(hungarian, english, dutch)`: keeps the three versions of a sentence side by side where it is written. */
export const tri = (hu: string, en: string, nl: string): Trilingual => ({ hu, en, nl })

/** What `localize` makes of a structure: every Trilingual inside it becomes the string of one language. */
export type Localized<T> = T extends Trilingual
  ? string
  : T extends readonly (infer Item)[]
    ? Localized<Item>[]
    : T extends object
      ? { [Key in keyof T]: Localized<T[Key]> }
      : T

function isTrilingual(value: unknown): value is Trilingual {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.hu === 'string' && typeof candidate.en === 'string' && typeof candidate.nl === 'string'
}

/**
 * Picks one language out of a whole structure of Trilingual texts (objects, lists, nested), so a
 * component writes `localize(text, lang)` once instead of indexing every string. Anything that is
 * not a Trilingual (numbers, ids, flags) is passed through unchanged.
 */
export function localize<T>(value: T, lang: Language): Localized<T> {
  if (isTrilingual(value)) return value[lang] as Localized<T>
  if (Array.isArray(value)) return value.map((item) => localize(item, lang)) as Localized<T>
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).map(([key, item]) => [key, localize(item, lang)])
    return Object.fromEntries(entries) as Localized<T>
  }
  return value as Localized<T>
}
