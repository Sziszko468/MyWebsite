import { useCallback, useState } from 'react'

/**
 * A form's answers, held in memory for as long as the page is open, and nowhere else: no storage,
 * no cookie, nothing in the address bar. A reload starts a blank form, which is the point: personal
 * details never sit in storage. Several parts of a page can read and write the same draft.
 */
export function useDraft<T extends object>(empty: T, initial: Partial<T> = {}) {
  const [draft, setDraft] = useState<T>(() => ({ ...empty, ...initial }))

  const set = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }, [])

  const reset = useCallback(() => setDraft(empty), [empty])

  return { draft, set, reset }
}
