import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { ASSISTANT_LANGUAGES, type AssistantLanguage } from '../api/assistant'
import { assistantEn, assistantText, type AssistantText } from '../i18n/assistant'

/**
 * The assistant screen's words (PROMPT 31). The administration speaks Hungarian or English; this screen speaks the language the administrator picked for the assistant, which
 * may also be Dutch. The pick is remembered in the browser (a convenience, never the only copy of anything) and starts as the administration's own language.
 */

const STORAGE = 'cc-admin-assistant-language'

interface Value {
  language: AssistantLanguage
  t: AssistantText
}

const Context = createContext<Value>({ language: 'en', t: assistantEn })

export function AssistantTextProvider({ language, children }: { language: AssistantLanguage; children: ReactNode }) {
  const value = useMemo(() => ({ language, t: assistantText(language) }), [language])
  return <Context value={value}>{children}</Context>
}

export const useAssistantText = (): AssistantText => useContext(Context).t
export const useAssistantLanguage = (): AssistantLanguage => useContext(Context).language

export function readStoredLanguage(fallback: AssistantLanguage): AssistantLanguage {
  try {
    const stored = window.localStorage.getItem(STORAGE)
    return ASSISTANT_LANGUAGES.includes(stored as AssistantLanguage) ? (stored as AssistantLanguage) : fallback
  } catch {
    return fallback
  }
}

export function storeLanguage(language: AssistantLanguage): void {
  try {
    window.localStorage.setItem(STORAGE, language)
  } catch {
    // Private windows and blocked storage: the pick simply is not remembered.
  }
}
