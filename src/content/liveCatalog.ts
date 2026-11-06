import { use, useSyncExternalStore } from 'react'
import { API_BASE, apiEndpoint } from '../config/api'
import { overlayAddons, overlayFaq, overlayPackages, overlayServiceAreas, overlayServiceDetails } from './catalogOverlay'
import { basePackages, packages } from './packages'
import { baseAddons, addons } from './services/addons'
import { baseServiceAreas, serviceAreas } from './services/areas'
import { baseServiceDetails, serviceDetails } from './services/detail'
import { baseFaq, faq } from './services/faq'

/**
 * What the owner edited in the administration (prices, texts, the FAQ) shown on the website WITHOUT a new build. At start the
 * browser asks the backend for its catalogue (`/api/shop/catalog`, the answer the build-time `catalog:pull` also uses) and lays
 * it over the website's own content with the very same rules (content/catalogOverlay.ts: only what the page already has, only
 * complete prices, never what a package or service IS). The lists the pages read are updated in place, so no page needed to
 * change how it reads them. The shop's own pages wait for the answer (at most 1.5 seconds: a slow or absent backend never holds
 * a page back, the website's own content is shown instead); the header's menu and the home page re-draw when it arrives.
 *
 * What this does NOT do: show a service, package or add-on that exists only in the administration (the pages, the cart and the
 * quote request are built around the ones the website knows), or change the head a search engine reads (that comes from the
 * build: `catalog:pull` then `npm run build`).
 */

const WAIT_MS = 1500

let version = 0
let started: Promise<void> | null = null
// With no backend there is nothing to wait for, from the very start (this is also what a page rendered in a test sees).
let settled = API_BASE === null
const listeners = new Set<() => void>()

const replace = <T>(live: readonly T[], next: readonly T[]) => {
  ;(live as T[]).splice(0, live.length, ...next)
}

/** Lays a catalogue over the website's own lists, in place. Returns whether anything is different from before. */
export function applyLiveCatalog(catalog: unknown): boolean {
  const before = JSON.stringify([packages, addons, serviceAreas, serviceDetails, faq])
  replace(packages, overlayPackages(basePackages, catalog))
  replace(addons, overlayAddons(baseAddons, catalog))
  replace(serviceAreas, overlayServiceAreas(baseServiceAreas, catalog))
  replace(serviceDetails, overlayServiceDetails(baseServiceDetails, catalog))
  replace(faq, overlayFaq(baseFaq, catalog))
  return JSON.stringify([packages, addons, serviceAreas, serviceDetails, faq]) !== before
}

function settle(changed: boolean): void {
  settled = true
  if (changed) {
    version += 1
    for (const listener of listeners) listener()
  }
}

/** Starts reading the backend's catalogue (once). With no backend configured it is settled at once. */
export function startLiveCatalog(): Promise<void> {
  if (started) return started
  const url = apiEndpoint('/api/shop/catalog')
  if (API_BASE === null || url === null) {
    settled = true
    return (started = Promise.resolve())
  }
  started = fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { data?: unknown } | null) => settle(body?.data ? applyLiveCatalog(body.data) : false))
    .catch(() => settle(false))
  return started
}

let waiting: Promise<void> | null = null

/** What a shop page waits for: the catalogue, or 1.5 seconds, whichever is first. The same promise every time, so it suspends once. */
export function catalogReady(): Promise<void> {
  if (settled) return Promise.resolve()
  waiting ??= Promise.race([startLiveCatalog(), new Promise<void>((resolve) => setTimeout(resolve, WAIT_MS))])
  return waiting
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The shop's pages call this first: they wait (at most 1.5 s) for the live catalogue, so the first thing drawn is already the current one. */
export const useCatalogGate = (): void => {
  // Nothing to wait for: no backend, or the answer is already in. (A page rendered with nothing to wait for must not suspend at all.)
  if (settled) return
  use(catalogReady())
}

/** A number that changes when the live catalogue changed something: a component that reads the lists outside a shop page reads it to re-draw. */
export const useCatalogVersion = (): number => useSyncExternalStore(subscribe, () => version, () => 0)

/** For tests: forget everything. */
export function resetLiveCatalog(): void {
  version = 0
  started = null
  waiting = null
  settled = API_BASE === null
}
