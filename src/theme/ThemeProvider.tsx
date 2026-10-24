import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ThemeContext } from './context'
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getInitialTheme,
  isTheme,
  readStoredTheme,
  storeTheme,
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
    applyTheme(next, { animate: true })
    setThemeState(next)
  }, [])

  const setTheme = useCallback(
    (next: Theme) => {
      hasChoice.current = true
      storeTheme(next)
      change(next)
    },
    [change],
  )

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

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
