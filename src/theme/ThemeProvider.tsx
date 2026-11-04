import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { ThemeContext } from './context'
import {
  THEME_STORAGE_KEY,
  applyTheme,
  clearStoredTheme,
  getInitialTheme,
  isTheme,
  readStoredTheme,
  storeTheme,
  systemPrefersLight,
  watchSystemTheme,
  type Theme,
} from './theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  // Until the visitor picks a theme explicitly, the system setting keeps driving it.
  const hasChoice = useRef(readStoredTheme() !== null)

  // Sync <html> with the initial state on mount (also sets <meta name="theme-color">).
  // Later changes go through change(), which applies the theme itself.
  useEffect(() => {
    applyTheme(getInitialTheme())
  }, [])

  const change = useCallback((next: Theme) => {
    // The state is committed together with the attribute, so a view transition's new picture has both.
    applyTheme(next, { animate: true, commit: () => flushSync(() => setThemeState(next)) })
  }, [])

  const setTheme = useCallback(
    (next: Theme) => {
      hasChoice.current = true
      storeTheme(next)
      change(next)
    },
    [change],
  )

  const followSystem = useCallback(() => {
    hasChoice.current = false
    clearStoredTheme()
    change(systemPrefersLight() ? 'light' : 'dark')
  }, [change])

  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme, setTheme],
  )

  useEffect(
    () =>
      watchSystemTheme((prefersLight) => {
        if (!hasChoice.current) change(prefersLight ? 'light' : 'dark')
      }),
    [change],
  )

  // Another tab changed the stored theme.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY && isTheme(event.newValue)) {
        hasChoice.current = true
        change(event.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [change])

  const value = useMemo(() => ({ theme, setTheme, toggleTheme, followSystem }), [theme, setTheme, toggleTheme, followSystem])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
