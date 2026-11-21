/**
 * What the demos need from the browser, checked before one is loaded. A demo uses `Intl` for dates and money, `Array.prototype.at`, and the animation-frame
 * and media-query functions; a browser without them gets the "this browser cannot run the demo" state instead of a half-working workspace. The check takes the
 * environment as an argument so a test can hand it a poorer one.
 */

export interface Environment {
  Intl?: { DateTimeFormat?: unknown; NumberFormat?: unknown }
  Array?: { prototype: { at?: unknown } }
  requestAnimationFrame?: unknown
  matchMedia?: unknown
}

export const REQUIRED_FEATURES = ['Intl.DateTimeFormat', 'Intl.NumberFormat', 'Array.prototype.at', 'requestAnimationFrame', 'matchMedia'] as const
export type Feature = (typeof REQUIRED_FEATURES)[number]

/** The names of the required features this environment lacks. Empty means the demos can run. */
export function missingFeatures(env: Environment = globalThis as unknown as Environment): Feature[] {
  const have: Record<Feature, boolean> = {
    'Intl.DateTimeFormat': typeof env.Intl?.DateTimeFormat === 'function',
    'Intl.NumberFormat': typeof env.Intl?.NumberFormat === 'function',
    'Array.prototype.at': typeof env.Array?.prototype?.at === 'function',
    requestAnimationFrame: typeof env.requestAnimationFrame === 'function',
    matchMedia: typeof env.matchMedia === 'function',
  }
  return REQUIRED_FEATURES.filter((feature) => !have[feature])
}
