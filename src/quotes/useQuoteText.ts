import { useMemo } from 'react'
import { quoteText } from '../content/quotes'
import { localize } from '../content/trilingual'
import { useI18n } from '../i18n/useI18n'

/** The customer pages' words in the visitor's language. */
export function useQuoteText() {
  const { lang } = useI18n()
  return useMemo(() => localize(quoteText, lang), [lang])
}

export type QuoteWords = ReturnType<typeof useQuoteText>
