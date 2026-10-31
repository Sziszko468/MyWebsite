import { useMemo } from 'react'
import { experimentText, labText } from '../../../content/labText'
import { localize } from '../../../content/trilingual'
import type { Language } from '../../../i18n/config'
import { useI18n } from '../../../i18n/useI18n'

/** The Lab's shared words and every experiment's words in the current language. Changes with the language, never with the scene. */
export function useLabText() {
  const { lang } = useI18n()
  return useMemo(() => ({ lang, text: localize(labText, lang), experiments: localize(experimentText, lang) }), [lang])
}

/** One experiment's own words (its controls), picked in the current language. */
export function useLocalized<T>(text: T): ReturnType<typeof localize<T>> {
  const { lang } = useI18n()
  return useMemo(() => localize(text, lang as Language), [text, lang])
}

/** "{current} / {total}"-style templates. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}
