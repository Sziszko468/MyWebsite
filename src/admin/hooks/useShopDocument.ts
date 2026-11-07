import { useState } from 'react'
import { ApiError } from '../api/client'
import * as endpoints from '../api/endpoints'
import { useToast } from '../components/Toast'
import { useText } from '../i18n'
import { describeError, fieldErrors } from '../lib/errors'
import { sameDocument, type DocumentCode, type DocumentView } from '../lib/shop'
import { useUnsavedChanges } from './useUnsavedChanges'

/**
 * The state of one shop document in its editor: what the server last said (`view`), the draft being written, what is wrong with
 * it by path, and the three things the administrator can do with it (save the draft, publish it, take it off the site). Saving
 * and publishing are separate on purpose: a draft is never public, and publishing goes live as it was last SAVED, so "publish"
 * is refused while there are unsaved changes (it asks to save first, rather than publishing something other than what is on screen).
 */
export function useShopDocument<T>(code: DocumentCode, initial: DocumentView<T>, finalize: (document: T) => T) {
  const t = useText()
  const toast = useToast()
  const [view, setView] = useState(initial)
  const [draft, setDraft] = useState<T>(initial.draft)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<'save' | 'publish' | 'unpublish' | null>(null)
  const dirty = !sameDocument(draft, view.draft)
  useUnsavedChanges(dirty)

  const run = async <R,>(kind: 'save' | 'publish' | 'unpublish', work: () => Promise<DocumentView<T>>, done: string): Promise<R | void> => {
    setBusy(kind)
    setErrors({})
    try {
      const next = await work()
      setView(next)
      setDraft(next.draft)
      toast.success(done)
    } catch (error) {
      setErrors(fieldErrors(t, error))
      toast.error(error instanceof ApiError && error.status === 422 ? t.shop.messages.invalid : describeError(t, error))
    } finally {
      setBusy(null)
    }
  }

  return {
    view,
    draft,
    setDraft,
    errors,
    busy,
    dirty,
    save: () => run('save', () => endpoints.shop.save<T>(code, finalize(draft), view.updatedAt), t.shop.messages.saved),
    publish: () => {
      if (dirty) {
        toast.error(t.shop.messages.saveFirst)
        return
      }
      return run('publish', () => endpoints.shop.publish<T>(code), t.shop.messages.published)
    },
    unpublish: () => run('unpublish', () => endpoints.shop.unpublish<T>(code), t.shop.messages.unpublished),
  }
}
