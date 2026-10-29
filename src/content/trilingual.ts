import type { Language } from '../i18n/config'

/** A text in every language the site speaks. All three are required, so a missing translation fails the build. */
export type Trilingual = Record<Language, string>

/** `tri(hungarian, english, dutch)`: keeps the three versions of a sentence side by side where it is written. */
export const tri = (hu: string, en: string, nl: string): Trilingual => ({ hu, en, nl })
