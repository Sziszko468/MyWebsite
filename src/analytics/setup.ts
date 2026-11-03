import { analyticsEndpoint, endpointProvider } from './endpointProvider'
import { registerProvider } from './tracker'

/**
 * Switches measurement on, if the owner configured a destination for it. Called once from src/main.tsx.
 * With no `VITE_ANALYTICS_ENDPOINT` nothing is registered, so there is no provider, no question to the
 * visitor (the consent banner and the footer's settings link render only when a provider exists), and
 * `track()` does nothing. To use a vendor's script instead, register your own provider here (see
 * analytics/events.ts for its shape): it is called only for visitors who have agreed.
 */
export function setupAnalytics(): void {
  if (analyticsEndpoint) registerProvider(endpointProvider(analyticsEndpoint))
}
