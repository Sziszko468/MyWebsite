import { useMemo } from 'react'
import { shopText } from '../content/shop'
import { localize } from '../content/trilingual'
import { useI18n } from '../i18n/useI18n'

/** All of the shop's words in the visitor's language, picked once per language. Used by the shop's own pages only. */
export function useShopText() {
  const { lang } = useI18n()
  return useMemo(() => localize(shopText, lang), [lang])
}
