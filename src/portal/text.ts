import { useEffect, useMemo, useRef } from 'react'
import { portalText } from '../content/portal'
import { localize } from '../content/trilingual'
import { useI18n } from '../i18n/useI18n'
import type { Failure } from './api'

/** The portal's words in the visitor's language. */
export function usePortalText() {
  const { lang } = useI18n()
  return useMemo(() => localize(portalText, lang), [lang])
}
export type PortalWords = ReturnType<typeof usePortalText>

/** Moves focus to the page's heading when a page appears, so a keyboard or screen-reader user starts at the top of what changed. */
export function useFocusHeading<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
  }, [key])
  return ref
}

/** What a failed request says to the customer, in their language. */
export function failureText(failure: Failure, words: PortalWords): string {
  switch (failure.kind) {
    case 'network':
      return words.problems.network
    case 'rate_limited':
      return words.problems.rateLimited
    case 'not_found':
      return words.problems.notFound
    case 'no_backend':
      return words.problems.noBackend
    case 'refused':
      return words.problems.refused
    case 'unauthorized':
      return words.problems.ended
    default:
      return words.problems.unavailable
  }
}
