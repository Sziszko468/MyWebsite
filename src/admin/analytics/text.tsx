import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { ANALYTICS_LANGUAGES, type AnalyticsLanguage } from '../api/analytics'
import { analyticsEn, analyticsText, type AnalyticsText } from '../i18n/analytics'

/**
 * The analytics screen's words (PROMPT 32). The administration speaks Hungarian or English; this screen speaks the language the administrator picked for it, which may also be Dutch
 * (the same arrangement as the assistant's screen). The pick is remembered in the browser (a convenience, never the only copy of anything) and starts as the administration's language.
 */

const STORAGE = 'cc-admin-analytics-language'

interface Value {
  language: AnalyticsLanguage
  t: AnalyticsText
}

const Context = createContext<Value>({ language: 'en', t: analyticsEn })

export function AnalyticsTextProvider({ language, children }: { language: AnalyticsLanguage; children: ReactNode }) {
  const value = useMemo(() => ({ language, t: analyticsText(language) }), [language])
  return <Context value={value}>{children}</Context>
}

export const useAnalyticsText = (): AnalyticsText => useContext(Context).t
export const useAnalyticsLanguage = (): AnalyticsLanguage => useContext(Context).language

export function readStoredLanguage(fallback: AnalyticsLanguage): AnalyticsLanguage {
  try {
    const stored = window.localStorage.getItem(STORAGE)
    return ANALYTICS_LANGUAGES.includes(stored as AnalyticsLanguage) ? (stored as AnalyticsLanguage) : fallback
  } catch {
    return fallback
  }
}

export function storeLanguage(language: AnalyticsLanguage): void {
  try {
    window.localStorage.setItem(STORAGE, language)
  } catch {
    // Private windows and blocked storage: the pick simply is not remembered.
  }
}
