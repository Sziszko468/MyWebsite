/**
 * How a package is priced. All of it is configuration: nothing here is a real figure until the
 * owner sets one in content/packages.ts.
 */

/** `quote`: the price depends on the project. `tbd`: not decided yet. `from`: a published starting price. */
export type ServicePrice =
  | { kind: 'from'; amount: number; currency: 'EUR' | 'HUF' }
  | { kind: 'quote' }
  | { kind: 'tbd' }

/**
 * How a published price treats VAT. `unspecified` is allowed only while no price is published: a
 * `from` price must say which of the other three it is (a test enforces it).
 */
export type VatMode = 'unspecified' | 'excluded' | 'included' | 'exempt'

/**
 * `scope`: the deadline is set per project, in the quote. `estimate`: a typical range the owner is
 * willing to publish; it is still shown as an estimate that the quote confirms, never as a promise.
 */
export type Timeline = { kind: 'scope' } | { kind: 'estimate'; min: number; max: number; unit: 'days' | 'weeks' | 'months' }
