import { createContext, useContext } from 'react'

/** What the navigation and the messages pages share about unread messages (see unread.tsx for who fills it). */
export interface UnreadValue {
  unread: number
  canStart: boolean
  refresh: () => void
}

export const UnreadContext = createContext<UnreadValue>({ unread: 0, canStart: false, refresh: () => undefined })

export const useUnread = (): UnreadValue => useContext(UnreadContext)
