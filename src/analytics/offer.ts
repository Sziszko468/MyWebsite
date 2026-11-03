import { privacySignal } from './consent'
import { hasProviders } from './tracker'

/** Whether the visitor can be asked about measurement at all: a destination for events exists and the browser has not asked not to be tracked. */
export function measurementIsOffered(): boolean {
  return hasProviders() && !privacySignal()
}
