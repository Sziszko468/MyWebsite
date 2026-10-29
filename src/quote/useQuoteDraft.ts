import { useCallback, useState } from 'react'
import { EMPTY_DRAFT, type FieldId, type QuoteDraft } from './types'

/**
 * The visitor's answers, held in memory for as long as the page is open: the package picker, the
 * service buttons and the form all read and write the same draft. Nothing is saved anywhere, so a
 * reload starts a blank form, which is the point: personal details never sit in storage.
 */
export function useQuoteDraft(initial: Partial<QuoteDraft> = {}) {
  const [draft, setDraft] = useState<QuoteDraft>(() => ({ ...EMPTY_DRAFT, ...initial }))

  const set = useCallback(<K extends FieldId>(field: K, value: QuoteDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }, [])

  const reset = useCallback(() => setDraft(EMPTY_DRAFT), [])

  return { draft, set, reset }
}

export type QuoteDraftApi = ReturnType<typeof useQuoteDraft>
