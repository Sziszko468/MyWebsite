import { createContext } from 'react'
import type { Language } from './config'
import type { Dictionary } from './locales/hu'

export interface I18nContextValue {
  lang: Language
  t: Dictionary
}

export const I18nContext = createContext<I18nContextValue | null>(null)
