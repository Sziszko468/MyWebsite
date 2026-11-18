import { useMemo } from 'react'
import { discoveryText } from '../content/ai/discovery'
import { localize } from '../content/trilingual'
import { useI18n } from '../i18n/useI18n'

/** All of the project discovery panel's words in the visitor's language, picked once per language. */
export function useDiscoveryText() {
  const { lang } = useI18n()
  return useMemo(() => localize(discoveryText, lang), [lang])
}

export type DiscoveryWords = ReturnType<typeof useDiscoveryText>

/** A table of words looked up by a code the server sent; a code this build does not know is shown as itself rather than as nothing. */
export const word = (table: Record<string, string>, code: string | null | undefined): string => (code ? (table[code] ?? code) : '')
