import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { fetchMessageSummary } from './api'
import { UnreadContext } from './unreadContext'

/**
 * How many messages are waiting for the customer, for the navigation's badge (PROMPT 28). The number comes from the server (computed from the customer's own read markers, never
 * kept in the browser); it is asked again when the customer moves to another page, and when a conversation says it has been read. A failure shows no badge, never a wrong one.
 */
export function UnreadProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [state, setState] = useState({ unread: 0, canStart: false })
  const [round, setRound] = useState(0)
  useEffect(() => {
    let current = true
    void fetchMessageSummary().then((result) => {
      if (current && result.ok) setState({ unread: result.data.unread, canStart: result.data.canStart })
    })
    return () => {
      current = false
    }
  }, [location.pathname, round])
  const refresh = useCallback(() => setRound((value) => value + 1), [])
  const value = useMemo(() => ({ ...state, refresh }), [state, refresh])
  return <UnreadContext value={value}>{children}</UnreadContext>
}
