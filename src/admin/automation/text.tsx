import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { AUTOMATION_LANGUAGES, automationEn, automationText, type AutomationLanguage, type AutomationText } from '../i18n/automation'

/**
 * The automation screen's words (PROMPT 33). The administration speaks Hungarian or English; this screen speaks the language the administrator picked for it, which may also be Dutch.
 * The pick is remembered in the browser (a convenience, never the only copy of anything) and starts as the administration's own language.
 */

const STORAGE = 'cc-admin-automation-language'

interface Value {
  language: AutomationLanguage
  t: AutomationText
}

const Context = createContext<Value>({ language: 'en', t: automationEn })

export function AutomationTextProvider({ language, children }: { language: AutomationLanguage; children: ReactNode }) {
  const value = useMemo(() => ({ language, t: automationText(language) }), [language])
  return <Context value={value}>{children}</Context>
}

export const useAutomationText = (): AutomationText => useContext(Context).t
export const useAutomationLanguage = (): AutomationLanguage => useContext(Context).language

export function readStoredLanguage(fallback: AutomationLanguage): AutomationLanguage {
  try {
    const stored = window.localStorage.getItem(STORAGE)
    return AUTOMATION_LANGUAGES.includes(stored as AutomationLanguage) ? (stored as AutomationLanguage) : fallback
  } catch {
    return fallback
  }
}

export function storeLanguage(language: AutomationLanguage): void {
  try {
    window.localStorage.setItem(STORAGE, language)
  } catch {
    // Private windows and blocked storage: the pick simply is not remembered.
  }
}
