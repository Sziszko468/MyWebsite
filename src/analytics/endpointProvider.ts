import { normalizeEndpoint } from '../forms/submit'
import type { AnalyticsEvent, AnalyticsProvider } from './events'

/**
 * A provider that posts each event as JSON to an address the owner runs or chooses (`VITE_ANALYTICS_ENDPOINT`):
 * a serverless function, a self-hosted collector, a vendor's HTTP API behind a small relay. It carries no
 * cookie and no identifier (the event has none), asks the browser to send no referrer and no credentials, and
 * uses `sendBeacon` where there is one so an event sent as the page closes still arrives.
 */
export function endpointProvider(endpoint: string): AnalyticsProvider {
  return {
    id: 'endpoint',
    send(event: AnalyticsEvent) {
      const body = JSON.stringify(event)
      // text/plain keeps a beacon a "simple" request: no preflight, so the collector needs no CORS handshake.
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        if (navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) return
      }
      void fetch(endpoint, {
        method: 'POST',
        body,
        keepalive: true,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      }).catch(() => undefined)
    },
  }
}

/** The configured collector, or `null` (nothing is measured). Only an https address is accepted (or a local http one while developing). */
export const analyticsEndpoint: string | null = normalizeEndpoint(import.meta.env.VITE_ANALYTICS_ENDPOINT, import.meta.env.DEV)
