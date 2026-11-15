import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fetchConfig, fetchSession, portalUsable, setCsrf, signOutRequest, type CustomerView, type SessionData } from './api'
import { PortalContext, type PortalContextValue, type PortalState } from './context'

/**
 * Who is signed in, for the whole portal. The state is asked of the server (`GET /api/portal/session`) when the portal opens: the browser holds the cookie,
 * this code holds nothing but what the server just said, in memory. When any later request is answered "not signed in" the portal falls back to the sign-in
 * page at once and says the sign-in ended; nothing is retried with a stale identity.
 */

export function PortalSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PortalState>({ status: 'loading' })
  const [round, setRound] = useState(0)

  useEffect(() => {
    let current = true
    async function start() {
      if (!portalUsable()) {
        if (current) setState({ status: 'unusable' })
        return
      }
      const [config, session] = await Promise.all([fetchConfig(), fetchSession()])
      if (!current) return
      const loaded = config.ok ? config.data : null
      if (session.ok) {
        setCsrf(session.data.csrfToken)
        setState({ status: 'signedIn', config: loaded, session: session.data })
      } else {
        setCsrf(null)
        setState({ status: 'anonymous', config: loaded, ended: false })
      }
    }
    void start()
    return () => {
      current = false
    }
  }, [round])

  const adopt = useCallback((customer: CustomerView, csrfToken: string, features: SessionData['features'] = { selfLinking: false, documents: false }) => {
    setCsrf(csrfToken)
    setState((previous) => ({ status: 'signedIn', config: previous.status === 'loading' || previous.status === 'unusable' ? null : previous.config, session: { customer, csrfToken, features } }))
    // The features (what the owner switched on) come from the session itself.
    setRound((value) => value + 1)
  }, [])

  const ended = useCallback(() => {
    setCsrf(null)
    setState((previous) => ({ status: 'anonymous', config: previous.status === 'loading' || previous.status === 'unusable' ? null : previous.config, ended: true }))
  }, [])

  const signOut = useCallback(async () => {
    await signOutRequest()
    setCsrf(null)
    setState((previous) => ({ status: 'anonymous', config: previous.status === 'loading' || previous.status === 'unusable' ? null : previous.config, ended: false }))
  }, [])

  const updateCustomer = useCallback((customer: CustomerView) => {
    setState((previous) => (previous.status === 'signedIn' ? { ...previous, session: { ...previous.session, customer } } : previous))
  }, [])

  const refresh = useCallback(() => setRound((value) => value + 1), [])

  const value = useMemo<PortalContextValue>(() => ({ state, adopt, ended, signOut, updateCustomer, refresh }), [state, adopt, ended, signOut, updateCustomer, refresh])
  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>
}
