import { useMemo, type ReactNode } from 'react'
import type { Language } from './config'
import { I18nContext } from './context'
import { dictionaries } from './dictionaries'

export function I18nProvider({ lang, children }: { lang: Language; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: dictionaries[lang] }), [lang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
