import type { PageId } from '../routes/pages'

/**
 * The motion identity in one place: how long things take, how they accelerate, how far they move,
 * how a row of siblings is staggered, and how strong all of it is on each kind of page.
 *
 * The same values are CSS custom properties (styles/tokens.css, the "Motion" section and the scope
 * blocks) for everything that animates in a stylesheet; this file is for scripts (the page frame,
 * the scroll-linked and pointer hooks) and for tests. src/motion/config.test.ts keeps the two equal,
 * so there is one set of numbers, not two.
 *
 * The language: controlled acceleration, soft landings, one asymmetric "racing" curve (a late launch
 * and a long brake), a slight elastic settle for small deliberate moments, and Racing Red only on the
 * state that matters. Nothing moves for decoration: every use says what it is for.
 */

export const MOTION = {
  /** Milliseconds. The first four are the tokens `--dur-*` that every component already uses. */
  duration: { instant: 80, fast: 140, base: 240, slow: 420, scene: 700 },

  easing: {
    /** Fast start, soft landing: the default for anything that arrives (`--ease-out`). */
    standard: 'cubic-bezier(0.16, 1, 0.3, 1)',
    /** Slow in, slow out: a move between two states that are both on screen (`--ease-in-out`). */
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    /** Slow start then gone: for what leaves (`--ease-accelerate`). */
    accelerate: 'cubic-bezier(0.55, 0, 1, 0.45)',
    /** Asymmetric: a late launch and a long brake, the brand's own curve (`--ease-racing`). */
    racing: 'cubic-bezier(0.7, 0, 0.1, 1)',
    /** A slight overshoot that settles, for a small marker or a pop and nothing large (`--ease-elastic`). */
    elastic: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
  },

  /** Pixels at intensity 1 (`--motion-distance-*`). */
  distance: { sm: 8, md: 16, lg: 32 },

  /** Delay between siblings that arrive together, in ms; a row never waits longer than `max` for its last one. */
  stagger: { step: 60, max: 360 },

  /** The usual delays, in ms. */
  delay: { none: 0, short: 60, long: 160 },

  /**
   * How strong each kind of page is (`--motion-intensity`), how long its entrances take relative to the
   * tokens (`--motion-time`) and what its pages do on arrival. The
   * portfolio is refined, the shop is quick, the cart and the request builder are plain (nothing
   * between the visitor and the next step), the Lab is experimental.
   */
  scope: {
    site: { intensity: 1, time: 1, enter: { kind: 'fade', duration: 280 } },
    portfolio: { intensity: 1, time: 1, enter: { kind: 'fade', duration: 360 } },
    shop: { intensity: 0.5, time: 0.6, enter: { kind: 'fade', duration: 140 } },
    checkout: { intensity: 0.25, time: 0.4, enter: { kind: 'fade', duration: 100 } },
    lab: { intensity: 1.35, time: 1.25, enter: { kind: 'wipe', duration: 560 } },
  },

  /**
   * Under `prefers-reduced-motion: reduce`: nothing travels (intensity 0, no parallax, no wipe), every
   * duration collapses (tokens.css), looping decoration stops, and state changes are instant. What
   * says "this happened" (a tick, a message, a changed border) stays: feedback is not decoration.
   */
  reduced: { intensity: 0, parallax: 0 },

  /** A touch screen moves things half as far as a mouse does (`--motion-parallax`). */
  touch: { parallax: 0.5 },
} as const

export type MotionScope = keyof typeof MOTION.scope
export type EnterKind = (typeof MOTION.scope)[MotionScope]['enter']['kind']

export const MOTION_SCOPES = Object.keys(MOTION.scope) as MotionScope[]

/**
 * The scope of a page: the Lab's pages are experimental; the cart and the request builder are the
 * checkout and stay plain; the rest of the shop is quick; the portfolio's own pages are refined; the
 * home page and anything else take the site's default.
 */
export function scopeOfPage(id: PageId | undefined): MotionScope {
  if (!id) return 'site'
  if (id === 'lab' || id.startsWith('lab-')) return 'lab'
  if (id === 'configure' || id === 'cart') return 'checkout'
  if (id === 'services' || id.startsWith('service-')) return 'shop'
  if (id === 'work' || id === 'about' || id === 'contact' || id.startsWith('project-')) return 'portfolio'
  return 'site'
}

/** The delay of the n-th of a row of siblings, in ms, never beyond the row's cap. */
export function staggerDelay(index: number, { step, max } = MOTION.stagger): number {
  return Math.min(Math.max(0, Math.floor(index)) * step, max)
}

/** A distance in pixels at a scope's intensity (0 when motion is reduced). */
export function distanceAt(size: keyof typeof MOTION.distance, intensity: number): number {
  return MOTION.distance[size] * Math.max(0, intensity)
}
