export const LANGUAGES = ['hu', 'en', 'nl'] as const
export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'hu'

/** Language names are shown in their own language everywhere, so they are not translated. */
export const LANGUAGE_META: Record<Language, { code: string; name: string }> = {
  hu: { code: 'HU', name: 'Magyar' },
  en: { code: 'EN', name: 'English' },
  nl: { code: 'NL', name: 'Nederlands' },
}

export function isLanguage(value: string | undefined): value is Language {
  return LANGUAGES.some((language) => language === value)
}
