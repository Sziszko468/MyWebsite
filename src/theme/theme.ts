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

/** Forgets the stored choice, so the system setting decides again. */
export function clearStoredTheme(): void {
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEY)
  } catch {
    // Storage can be blocked; there is then nothing stored to forget.
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

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown }

/**
 * Sets the theme on <html>. With `animate`, the colours change smoothly; without it (first paint,
 * hydration) nothing animates. `commit` runs together with the attribute (the provider's React state), so
 * both are in the same picture.
 *
 * Where the browser has View Transitions, the change is a cross-fade of two pictures of the page: the
 * browser blends them without restyling anything every frame. Measured on the home page, the first frame
 * after the click took 60-100 ms with a colour transition on every element (the fallback below) and 20 ms
 * without; the cross-fade costs the 20 ms plus the blend. Reduced motion changes the theme at once.
 */
export function applyTheme(theme: Theme, { animate = false, commit }: { animate?: boolean; commit?: () => void } = {}): void {
  const root = document.documentElement
  const apply = () => {
    root.setAttribute('data-theme', theme)
    commit?.()
    const bg = getComputedStyle(root).getPropertyValue('--color-bg').trim()
    if (bg) {
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
    }
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const view = (document as ViewTransitionDocument).startViewTransition?.bind(document)
  if (animate && !reduced && view) {
    view(apply)
    return
  }

  if (animate) {
    root.setAttribute(TRANSITION_ATTR, '')
    window.clearTimeout(transitionTimer)
    transitionTimer = window.setTimeout(() => root.removeAttribute(TRANSITION_ATTR), TRANSITION_MS)
  }
  apply()
}
