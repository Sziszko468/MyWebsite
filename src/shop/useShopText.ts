import { useMemo } from 'react'
import { shopText } from '../content/shop'
import { applyTextOverrides } from '../content/textOverrides'
import { useTextOverrides } from '../content/textOverridesStore'
import { localize } from '../content/trilingual'
import { useI18n } from '../i18n/useI18n'

/** All of the shop's words in the visitor's language, picked once per language, with the wording an administrator changed laid over them. Used by the shop's own pages only. */
export function useShopText() {
  const { lang } = useI18n()
  const overrides = useTextOverrides()
  return useMemo(() => applyTextOverrides(localize(shopText, lang), overrides, 'shop', lang), [lang, overrides])
}
