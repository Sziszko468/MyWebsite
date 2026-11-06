import { useMemo, type ReactNode } from 'react'
import { applyTextOverrides } from '../content/textOverrides'
import { useTextOverrides } from '../content/textOverridesStore'
import type { Language } from './config'
import { I18nContext } from './context'
import { dictionaries } from './dictionaries'

export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  // The wording the administrator changed is laid over the dictionary (content/textOverrides.ts); with none, it is the dictionary itself.
  const overrides = useTextOverrides()
  const value = useMemo(() => ({ lang, t: applyTextOverrides(dictionaries[lang], overrides, 'dict', lang) }), [lang, overrides])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
