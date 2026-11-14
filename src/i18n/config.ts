export const LANGUAGES = ['hu', 'en', 'nl'] as const
export type Language = (typeof LANGUAGES)[number]

/**
 * The language of every visitor the site cannot place: the fallback of the language rule (i18n/locale.ts), the language
 * of the `x-default` alternate and of the root document. Hungary and the Netherlands start in their own language
 * (decided by the country, not by this constant); everyone else, and every unknown country, starts in English.
 */
export const DEFAULT_LANGUAGE: Language = 'en'

/**
 * The full locale of each language, for every date, number and amount the site writes (`Intl`, and the same tags in the server's e-mails and
 * quotations: `server/test/localization23.test.ts` keeps them equal). English is British, like its spelling: a bare `en` would write
 * "11/14/26" and "November 14, 2026", which a reader in Europe takes for another date.
 */
export const LOCALE_TAGS: Record<Language, string> = { hu: 'hu-HU', en: 'en-GB', nl: 'nl-NL' }

/** Language names are shown in their own language everywhere, so they are not translated. */
export const LANGUAGE_META: Record<Language, { code: string; name: string }> = {
  hu: { code: 'HU', name: 'Magyar' },
  en: { code: 'EN', name: 'English' },
  nl: { code: 'NL', name: 'Nederlands' },
}

export function isLanguage(value: string | undefined): value is Language {
  return LANGUAGES.some((language) => language === value)
}
