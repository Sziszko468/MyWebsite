import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { fill } from '../../utils/format'
import type { InterfaceLanguage } from '../api/types'
import { en, type AdminText } from './en'
import { hu } from './hu'

/**
 * The administration speaks Hungarian or English (the owner's two languages; the website's Dutch is for visitors).
 * Which one: the administrator's saved choice, else the browser's language, else English.
 */

export const INTERFACE_LANGUAGES: readonly InterfaceLanguage[] = ['hu', 'en']

const DICTIONARIES: Record<InterfaceLanguage, AdminText> = { en, hu }

export function browserLanguage(languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages): InterfaceLanguage {
  for (const language of languages) {
    const code = language.toLowerCase().split('-')[0]
    if (code === 'hu') return 'hu'
    if (code === 'en') return 'en'
  }
  return 'en'
}

interface TextContext {
  language: InterfaceLanguage
  t: AdminText
}

const Context = createContext<TextContext>({ language: 'en', t: en })

export function AdminTextProvider({ language, children }: { language: InterfaceLanguage; children: ReactNode }) {
  const value = useMemo(() => ({ language, t: DICTIONARIES[language] }), [language])
  return <Context value={value}>{children}</Context>
}

export const useText = (): AdminText => useContext(Context).t
export const useInterfaceLanguage = (): InterfaceLanguage => useContext(Context).language

export { fill }

const LOCALE: Record<InterfaceLanguage, string> = { hu: 'hu-HU', en: 'en-GB' }

/** An instant as "3 Nov 2026, 16:27" in the administrator's language, in the browser's time zone. `null` and nonsense read as a dash. */
export function formatDateTime(value: string | null | undefined, language: InterfaceLanguage): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(LOCALE[language], { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function formatDay(value: string | null | undefined, language: InterfaceLanguage): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(LOCALE[language], { dateStyle: 'medium' }).format(date)
}

export function formatNumber(value: number, language: InterfaceLanguage): string {
  return new Intl.NumberFormat(LOCALE[language]).format(value)
}

/** The word for a status of an inquiry or a quote request; one the application does not know is shown as it is, never hidden. */
export function statusLabel(t: AdminText, kind: 'inquiry' | 'quote', status: string): string {
  const labels = t.status[kind] as Record<string, string>
  return labels[status] ?? status
}
