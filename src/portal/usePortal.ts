import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { Failure, Result, SessionData } from './api'
import { PortalContext, type PortalContextValue } from './context'

export function usePortal(): PortalContextValue {
  const value = useContext(PortalContext)
  if (!value) throw new Error('usePortal must be used inside <PortalSessionProvider>')
  return value
}

/** The signed-in customer's session. Only used by pages that are drawn when signed in. */
export function useSessionData(): SessionData {
  const { state } = usePortal()
  if (state.status !== 'signedIn') throw new Error('useSessionData needs a signed-in customer.')
  return state.session
}

export type Loaded<T> = { status: 'loading' } | { status: 'failed'; failure: Failure } | { status: 'ready'; data: T }

/** Loads one thing for the signed-in customer, and again on request. An answer of "not signed in" ends the session for the whole portal. */
export function useLoad<T>(load: () => Promise<Result<T>>, key: string): { state: Loaded<T>; reload: () => void } {
  const { ended } = usePortal()
  const [state, setState] = useState<Loaded<T>>({ status: 'loading' })
  const [round, setRound] = useState(0)
  const loader = useRef(load)
  useEffect(() => {
    loader.current = load
  })

  useEffect(() => {
    let current = true
    void loader.current().then((result) => {
      if (!current) return
      if (result.ok) setState({ status: 'ready', data: result.data })
      else if (result.failure.kind === 'unauthorized') ended()
      else setState({ status: 'failed', failure: result.failure })
    })
    return () => {
      current = false
    }
    // `key` stands for what is loaded (a reference); `round` for "again".
  }, [key, round, ended])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setRound((value) => value + 1)
  }, [])
  return { state, reload }
}
