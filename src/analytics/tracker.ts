import { splitLanguage } from '../i18n/paths'
import { mayMeasure } from './consent'
import { EVENT_NAMES, type AnalyticsEvent, type AnalyticsEvents, type AnalyticsProvider, type EventName } from './events'

/**
 * The one function the site calls to report that something happened: `track('project_opened', { project })`.
 * It sends nothing unless the visitor has agreed (consent.ts) and a provider is registered, never queues
 * an event for later (an event from before the visitor agreed is gone), and can never break the page: a
 * provider that throws is ignored.
 */

const providers = new Map<string, AnalyticsProvider>()

/** Adds a destination for events. Call it once at start-up (src/main.tsx); a second provider with the same id replaces the first. */
export function registerProvider(provider: AnalyticsProvider): void {
  providers.set(provider.id, provider)
}

export const hasProviders = (): boolean => providers.size > 0

/** For tests. */
export function clearProviders(): void {
  providers.clear()
}

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/

/**
 * Keeps only what an event may carry: short ids (lower-case letters, digits, hyphens), small whole
 * numbers and yes/no. Anything else, text with spaces, an address, a long string, is dropped, so a
 * free-text value can never reach a provider whatever a call site passes.
 */
export function sanitize(props: object): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(props)) {
    if (!ID.test(key.replace(/_/g, '-'))) continue
    if (typeof value === 'boolean') clean[key] = value
    else if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999) clean[key] = value
    else if (typeof value === 'string' && ID.test(value)) clean[key] = value
  }
  return clean
}

export function track<N extends EventName>(name: N, props: AnalyticsEvents[N]): void {
  if (!EVENT_NAMES.includes(name) || providers.size === 0 || !mayMeasure()) return
  const { lang, rest } = typeof window === 'undefined' ? { lang: null, rest: '/' } : splitLanguage(window.location.pathname)
  const event: AnalyticsEvent = {
    name,
    props: sanitize(props),
    page: rest,
    lang: lang ?? 'hu',
    time: Date.now(),
  }
  for (const provider of providers.values()) {
    try {
      provider.send(event)
    } catch {
      // Measurement must never get in the way of the page.
    }
  }
}
