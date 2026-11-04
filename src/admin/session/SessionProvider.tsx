import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTheme } from '../../theme/useTheme'
import { ApiError, onSessionEnded, request, setCsrfToken } from '../api/client'
import * as endpoints from '../api/endpoints'
import type { InterfaceLanguage, Permission, Preferences, SessionData } from '../api/types'
import { AdminTextProvider, browserLanguage } from '../i18n'

/**
 * Who is signed in. The application asks the server once when it opens (the session lives in an `HttpOnly` cookie this
 * code cannot read), shows the sign-in when there is none, and goes back to it, with a reason, when the server says the
 * session ended. What the screens may offer comes from the server's list of permissions for the role; it only decides
 * what is shown, because the server refuses anything the role may not do whatever the screen offers.
 */

type State =
  | { status: 'loading' }
  | { status: 'anonymous'; reason: 'expired' | null }
  | { status: 'ready'; user: SessionData['user']; meta: SessionData['meta'] }
  | { status: 'failed'; error: unknown }

export interface Session {
  user: SessionData['user']
  meta: SessionData['meta']
  can: (permission: Permission) => boolean
  language: InterfaceLanguage
  signOut: () => Promise<void>
  savePreferences: (preferences: Partial<Preferences>) => Promise<Preferences>
}

interface Gate {
  state: State
  signIn: (email: string, password: string) => Promise<void>
  retry: () => void
  session: Session | null
}

const SessionContext = createContext<Gate | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const { setTheme, followSystem } = useTheme()

  const adopt = useCallback((data: SessionData) => {
    setCsrfToken(data.csrfToken)
    setState({ status: 'ready', user: data.user, meta: data.meta })
  }, [])

  // The first question: is there a session already? (A 401 here is the normal "no", not an ended session.)
  useEffect(() => {
    let current = true
    request<SessionData>('GET', '/api/admin/session', { anonymous: true })
      .then(({ data }) => current && adopt(data))
      .catch((error: unknown) => {
        if (!current) return
        if (error instanceof ApiError && error.status === 401) setState({ status: 'anonymous', reason: null })
        else setState({ status: 'failed', error })
      })
    return () => {
      current = false
    }
  }, [adopt, attempt])

  // Any later 401 means the session ended (it idles out): say so once, at the sign-in.
  useEffect(() => onSessionEnded(() => setState({ status: 'anonymous', reason: 'expired' })), [])

  // The saved theme applies as soon as it is known; with none saved, the device decides.
  const theme = state.status === 'ready' ? state.user.preferences.theme : undefined
  useEffect(() => {
    if (theme === undefined) return
    if (theme === null) followSystem()
    else setTheme(theme)
    // Applying a saved preference once per change of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { data } = await endpoints.session.login(email, password)
      setCsrfToken(data.csrfToken)
      const full = await endpoints.session.current()
      adopt(full.data)
    },
    [adopt],
  )

  const signOut = useCallback(async () => {
    try {
      await endpoints.session.logout()
    } catch {
      // Whether or not the server heard, this browser is done with the session.
    }
    setCsrfToken(null)
    setState({ status: 'anonymous', reason: null })
  }, [])

  const savePreferences = useCallback(async (preferences: Partial<Preferences>) => {
    const { data } = await endpoints.settings.savePreferences(preferences)
    setState((previous) => (previous.status === 'ready' ? { ...previous, user: { ...previous.user, preferences: data } } : previous))
    return data
  }, [])

  const language: InterfaceLanguage = state.status === 'ready' ? state.user.preferences.language ?? browserLanguage() : browserLanguage()

  const gate = useMemo<Gate>(() => {
    const session: Session | null =
      state.status === 'ready'
        ? { user: state.user, meta: state.meta, can: (permission) => state.user.permissions.includes(permission), language, signOut, savePreferences }
        : null
    return { state, signIn, retry: () => setAttempt((value) => value + 1), session }
  }, [state, signIn, signOut, savePreferences, language])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  return (
    <SessionContext value={gate}>
      <AdminTextProvider language={language}>{children}</AdminTextProvider>
    </SessionContext>
  )
}

export function useGate(): Gate {
  const gate = useContext(SessionContext)
  if (!gate) throw new Error('useGate must be used inside <SessionProvider>')
  return gate
}

/** The signed-in session. Only screens that are rendered behind the sign-in use it. */
export function useSession(): Session {
  const { session } = useGate()
  if (!session) throw new Error('useSession was used while nobody is signed in')
  return session
}
