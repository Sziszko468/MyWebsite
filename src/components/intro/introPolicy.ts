import type { IntroConfig } from '../../config/intro'
import { splitLanguage } from '../../i18n/paths'
import { isShopPath } from '../../shop/paths'

/**
 * Whether the intro should be shown, and how that is remembered. Pure apart from the storage it
 * is handed, so every case can be tested. Storage can be missing or blocked (private windows,
 * policies); every access is guarded and, when it fails, the intro simply behaves as if nothing
 * had been remembered.
 */

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface IntroStores {
  /** Survives the browser being closed. */
  persistent: KeyValueStore | null
  /** Lasts for the browser session. */
  session: KeyValueStore | null
}

export const INTRO_KEYS = { seen: 'intro:seen', skip: 'intro:skip' } as const

export type IntroOverride = 'show' | 'hide' | undefined

function read(store: KeyValueStore | null, key: string): string | null {
  try {
    return store?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(store: KeyValueStore | null, key: string, value: string | null): void {
  try {
    if (value === null) store?.removeItem(key)
    else store?.setItem(key, value)
  } catch {
    // Blocked or full: the choice then lasts for this visit only.
  }
}

export function browserStores(): IntroStores {
  const pick = (name: 'localStorage' | 'sessionStorage'): KeyValueStore | null => {
    try {
      return window[name]
    } catch {
      return null
    }
  }
  return { persistent: pick('localStorage'), session: pick('sessionStorage') }
}

export function readSkipPreference(stores: IntroStores): boolean {
  return read(stores.persistent, INTRO_KEYS.skip) === '1'
}

export function writeSkipPreference(stores: IntroStores, skip: boolean): void {
  write(stores.persistent, INTRO_KEYS.skip, skip ? '1' : null)
}

/**
 * Whether the intro is shown on this page load. `entryPath` is the address the visitor arrived at:
 * the shop (the services page and everything beneath it) is a buying flow, so it never opens with
 * the intro and its 3D scene. Skipping it there does not use it up: the next visit to the home page
 * still shows it.
 */
export function shouldShowIntro(config: IntroConfig, stores: IntroStores, override: IntroOverride = undefined, entryPath = ''): boolean {
  if (override === 'show') return true
  if (override === 'hide') return false
  if (isShopPath(splitLanguage(entryPath).rest)) return false
  if (config.frequency === 'never') return false
  if (config.allowSkip && readSkipPreference(stores)) return false

  if (config.frequency === 'first-visit') return read(stores.persistent, INTRO_KEYS.seen) !== '1'
  return read(stores.session, INTRO_KEYS.seen) !== '1'
}

/** Remembers that the visitor has entered, in the store the frequency calls for. */
export function markIntroSeen(config: IntroConfig, stores: IntroStores): void {
  if (config.frequency === 'first-visit') write(stores.persistent, INTRO_KEYS.seen, '1')
  else if (config.frequency === 'every-session') write(stores.session, INTRO_KEYS.seen, '1')
}

/** Development only: `?intro=1` forces the intro and `?intro=0` hides it. Production ignores the query. */
export function readIntroOverride(search: string): IntroOverride {
  if (!import.meta.env.DEV) return undefined
  const value = new URLSearchParams(search).get('intro')
  return value === '1' ? 'show' : value === '0' ? 'hide' : undefined
}
