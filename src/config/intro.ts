/**
 * When and how the fullscreen intro appears. Change these values to change the behaviour; nothing
 * else needs to know. The decision is re-made on every page load, so the choice is never final.
 */

export type IntroFrequency =
  /** Once per browser: shown on the first visit, then remembered. */
  | 'first-visit'
  /** Once per browser session: shown again in every new session (a new tab or window). */
  | 'every-session'
  /** Never shown. */
  | 'never'

export interface IntroConfig {
  frequency: IntroFrequency
  /**
   * Offer a "don't show this again" choice on the intro. A visitor who ticks it skips the intro
   * from then on, whatever `frequency` says. It is stored in this browser only.
   */
  allowSkip: boolean
  /** Length of the leaving transition, in milliseconds. */
  exitMs: number
  /** The same under prefers-reduced-motion: a short, plain fade. */
  exitMsReduced: number
}

export const introConfig: IntroConfig = {
  frequency: 'first-visit',
  allowSkip: true,
  exitMs: 1000,
  exitMsReduced: 320,
}
