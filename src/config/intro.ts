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
  /**
   * Show the intro only when the visit starts on the home page. A visitor who arrives on a project, the
   * About page or a Lab experience (from a search result or a shared link) wants that page, not a full
   * screen in front of it; it also costs every such entry the intro's 3D scene (measured: about 250 kB of
   * code and a long task on a phone). Set it to `false` to open the intro on any page except the shop.
   */
  onlyOnHome: boolean
  /** Length of the leaving transition, in milliseconds. */
  exitMs: number
  /** The same under prefers-reduced-motion: a short, plain fade. */
  exitMsReduced: number
}

export const introConfig: IntroConfig = {
  frequency: 'first-visit',
  allowSkip: true,
  onlyOnHome: true,
  exitMs: 1000,
  exitMsReduced: 320,
}
