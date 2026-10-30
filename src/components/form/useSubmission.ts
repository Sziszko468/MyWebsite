import { useCallback, useEffect, useRef, useState } from 'react'
import type { Transport } from '../../forms/submit'

export type SubmissionPhase =
  | { kind: 'editing' }
  | { kind: 'sending' }
  | { kind: 'failed'; reason: 'network' | 'timeout' | 'rejected' }
  | { kind: 'unavailable' }
  | { kind: 'sent' }

/**
 * What happens between pressing "send" and a result, for any form that sends through a transport
 * (forms/submit.ts). The form is `sent` only when the transport says so: with no endpoint the
 * phase is `unavailable` and nothing leaves the page; a failure keeps the answers and says why.
 * A result takes focus, so a keyboard or screen-reader user is told what happened.
 */
export function useSubmission<T extends object>(transport: Transport<T>) {
  const [phase, setPhase] = useState<SubmissionPhase>({ kind: 'editing' })
  const panelRef = useRef<HTMLHeadingElement>(null)
  const sentRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (phase.kind === 'sent') sentRef.current?.focus()
    else if (phase.kind === 'failed' || phase.kind === 'unavailable') panelRef.current?.focus()
  }, [phase.kind])

  const submit = useCallback(
    async (request: T, onSent?: () => void) => {
      if (transport.id === 'none') {
        setPhase({ kind: 'unavailable' })
        return
      }
      setPhase({ kind: 'sending' })
      const outcome = await transport.submit(request)
      if (outcome.status === 'sent') {
        onSent?.()
        setPhase({ kind: 'sent' })
      } else if (outcome.status === 'unavailable') {
        setPhase({ kind: 'unavailable' })
      } else {
        setPhase({ kind: 'failed', reason: outcome.reason })
      }
    },
    [transport],
  )

  const reset = useCallback(() => setPhase({ kind: 'editing' }), [])

  return { phase, sending: phase.kind === 'sending', submit, reset, panelRef, sentRef }
}
