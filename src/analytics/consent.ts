import { createStore } from '../shop/store'

/**
 * The visitor's choice about measurement. Nothing is measured until it is `granted`; `unknown` (no choice
 * yet) and `denied` both mean nothing is sent. The choice is kept in this browser only, as a small record
 * that says nothing about the visitor, and the browser's own signals (Global Privacy Control, Do Not Track)
 * count as a refusal even if a choice was stored.
 */

export type Consent = 'unknown' | 'granted' | 'denied'

export const CONSENT_STORAGE_KEY = 'cc-consent-v1'

interface ConsentRecord {
  v: 1
  analytics: boolean
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Reads a stored choice; anything that is not exactly a version-1 record counts as no choice. */
export function parseConsent(raw: string | null | undefined): Consent {
  if (!raw) return 'unknown'
  try {
    const value = JSON.parse(raw) as Partial<ConsentRecord> | null
    if (value && value.v === 1 && typeof value.analytics === 'boolean') return value.analytics ? 'granted' : 'denied'
  } catch {
    // A damaged record is the same as none.
  }
  return 'unknown'
}

type Signals = { doNotTrack?: string | null; globalPrivacyControl?: boolean }

/** Whether the browser asks not to be tracked (Global Privacy Control, or the older Do Not Track). */
export function privacySignal(nav: Signals | undefined = typeof navigator === 'undefined' ? undefined : (navigator as Signals)): boolean {
  if (!nav) return false
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1'
}

function readStored(): Consent {
  try {
    return parseConsent(storage()?.getItem(CONSENT_STORAGE_KEY))
  } catch {
    return 'unknown'
  }
}

export const consentStore = createStore<Consent>(readStored())

/** Whether the question is being asked again on request ("Measurement settings" in the footer). */
export const promptStore = createStore(false)

function write(choice: 'granted' | 'denied') {
  consentStore.update(() => choice)
  promptStore.update(() => false)
  try {
    const record: ConsentRecord = { v: 1, analytics: choice === 'granted' }
    storage()?.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record))
  } catch {
    // The choice then lasts for this visit only.
  }
}

export const consentActions = {
  grant: () => write('granted'),
  deny: () => write('denied'),
  /** Asks the question again, keeping the current choice until a new one is made. */
  reopen: () => promptStore.update(() => true),
  /** Forgets the choice, so the question is asked again. */
  reset() {
    consentStore.update(() => 'unknown')
    try {
      storage()?.removeItem(CONSENT_STORAGE_KEY)
    } catch {
      // Nothing to remove.
    }
  },
}

/** Whether events may be sent right now. */
export function mayMeasure(consent: Consent = consentStore.get(), signal: boolean = privacySignal()): boolean {
  return consent === 'granted' && !signal
}
