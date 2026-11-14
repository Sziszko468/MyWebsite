import { useCallback, useEffect, useMemo, useState } from 'react'
import { consultationText } from '../content/consultation'
import { localize } from '../content/trilingual'
import { API_BASE } from '../config/api'
import type { Language } from '../i18n/config'
import { useI18n } from '../i18n/useI18n'
import { fetchConfig, type Failure, type PublicConfig, type Result } from './api'

/** The booking page's words in the visitor's language. */
export function useConsultationText() {
  const { lang } = useI18n()
  return useMemo(() => localize(consultationText, lang), [lang])
}

export type ConsultationWords = ReturnType<typeof useConsultationText>

export type Remote<T> = { status: 'loading' } | { status: 'failed'; failure: Failure } | { status: 'ready'; data: T }

/** Loads something once for a key (a language, a secret), and again on request. A late answer for an old key is dropped. */
export function useRemote<T>(key: string, load: () => Promise<Result<T>>): { state: Remote<T>; reload: () => void } {
  const [state, setState] = useState<Remote<T>>({ status: 'loading' })
  const [round, setRound] = useState(0)

  useEffect(() => {
    let current = true
    void load().then((result) => {
      if (current) setState(result.ok ? { status: 'ready', data: result.data } : { status: 'failed', failure: result.failure })
    })
    return () => {
      current = false
    }
    // `load` is made fresh on every render; the key is what says it is a different request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, round])

  const reload = useCallback(() => setRound((value) => value + 1), [])
  return { state, reload }
}

const knownConfig = new Map<Language, Promise<PublicConfig | null>>()

/**
 * Whether online booking is open, for the places that offer it (a link in the footer, a button on the contact page). It is asked once per page load and
 * language; `null` while it is not known and when there is no backend or it cannot be reached, so nothing offers a booking it cannot be sure of.
 */
export function useBookingOpen(): boolean | null {
  const { lang } = useI18n()
  const [open, setOpen] = useState<boolean | null>(null)
  useEffect(() => {
    if (API_BASE === null) return
    let current = true
    let pending = knownConfig.get(lang)
    if (!pending) {
      pending = fetchConfig(lang).then((result) => (result.ok ? result.data : null))
      knownConfig.set(lang, pending)
    }
    void pending.then((config) => {
      if (current) setOpen(config ? config.open : null)
    })
    return () => {
      current = false
    }
  }, [lang])
  return open
}

/** For tests: forget what was asked. */
export const forgetBookingConfig = (): void => knownConfig.clear()
