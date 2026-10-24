export const THEMES = ['dark', 'light'] as const
export type Theme = (typeof THEMES)[number]

// index.html carries an inline pre-paint script that mirrors this key and the
// resolution rule below. theme.test.ts keeps the two in sync.
export const THEME_STORAGE_KEY = 'theme'

const LIGHT_QUERY = '(prefers-color-scheme: light)'
const TRANSITION_ATTR = 'data-theme-transition'
const TRANSITION_MS = 400

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light'
}

/** A stored choice wins; otherwise follow the system; dark is the fallback. */
export function resolveTheme(stored: string | null, prefersLight: boolean): Theme {
  if (isTheme(stored)) return stored
  return prefersLight ? 'light' : 'dark'
}

export function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage can be blocked (private mode, policies); the choice then lasts for this visit only.
  }
}

export function systemPrefersLight(): boolean {
  return window.matchMedia(LIGHT_QUERY).matches
}

export function watchSystemTheme(onChange: (prefersLight: boolean) => void): () => void {
  const query = window.matchMedia(LIGHT_QUERY)
  const listener = (event: MediaQueryListEvent) => onChange(event.matches)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/** The theme the pre-paint script already applied, or a fresh resolution. */
export function getInitialTheme(): Theme {
  const applied = document.documentElement.getAttribute('data-theme')
  return isTheme(applied) ? applied : resolveTheme(readStoredTheme(), systemPrefersLight())
}

let transitionTimer: number | undefined

/**
 * Sets the theme on <html>. With `animate`, colours ease between themes for a
 * short window; without it (first paint, hydration) nothing animates.
 */
export function applyTheme(theme: Theme, { animate = false } = {}): void {
  const root = document.documentElement

  if (animate) {
    root.setAttribute(TRANSITION_ATTR, '')
    window.clearTimeout(transitionTimer)
    transitionTimer = window.setTimeout(() => root.removeAttribute(TRANSITION_ATTR), TRANSITION_MS)
  }

  root.setAttribute('data-theme', theme)

  const bg = getComputedStyle(root).getPropertyValue('--color-bg').trim()
  if (bg) {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
  }
}
