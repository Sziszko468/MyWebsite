import { useMemo } from 'react'
import { aiText } from '../content/ai'
import { localize } from '../content/trilingual'
import { useI18n } from '../i18n/useI18n'

/** All of the assistant's interface words in the visitor's language, picked once per language. */
export function useAiText() {
  const { lang } = useI18n()
  return useMemo(() => localize(aiText, lang), [lang])
}
