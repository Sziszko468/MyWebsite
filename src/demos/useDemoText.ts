import { useMemo } from 'react'
import { localize } from '../content/trilingual'
import type { Language } from '../i18n/config'
import { useI18n } from '../i18n/useI18n'

/** A demo's words (a table of three-language texts) in the page's language. The table is picked once per language, never per render. */
export function useDemoText<T>(table: T): ReturnType<typeof localize<T>> {
  const { lang } = useI18n()
  return useMemo(() => localize(table, lang as Language), [table, lang])
}
