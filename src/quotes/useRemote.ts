import { useCallback, useEffect, useState } from 'react'
import type { Failure, Result } from './api'

export type Remote<T> = { status: 'loading' } | { status: 'failed'; failure: Failure } | { status: 'ready'; data: T }

/** Loads one private page's data by its secret, and again on request (after the customer did something). Stale answers are dropped. */
export function useRemote<T>(token: string, load: (token: string) => Promise<Result<T>>): { state: Remote<T>; reload: () => void } {
  const [state, setState] = useState<Remote<T>>({ status: 'loading' })
  const [round, setRound] = useState(0)

  useEffect(() => {
    let current = true
    // Reading the address is not a side effect of rendering: a new secret, or a reload, starts a fresh request.
    void load(token).then((result) => {
      if (current) setState(result.ok ? { status: 'ready', data: result.data } : { status: 'failed', failure: result.failure })
    })
    return () => {
      current = false
    }
  }, [token, load, round])

  const reload = useCallback(() => setRound((value) => value + 1), [])
  return { state, reload }
}
