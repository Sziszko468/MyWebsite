import { useDraft } from '../forms/useDraft'
import { EMPTY_DRAFT, type QuoteDraft } from './types'

/**
 * The quote request's answers (see forms/useDraft.ts): the package picker, the service buttons and
 * the form all read and write the same draft.
 */
export function useQuoteDraft(initial: Partial<QuoteDraft> = {}) {
  return useDraft(EMPTY_DRAFT, initial)
}

export type QuoteDraftApi = ReturnType<typeof useQuoteDraft>
