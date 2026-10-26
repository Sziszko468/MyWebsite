import { createContext } from 'react'
import type { IntroConfig } from '../../config/intro'

/**
 * The intro's life, in order:
 *   ready      shown and usable; the visitor has not touched it yet
 *   active     the visitor has engaged (moved the pointer or touched it)
 *   exiting    the leaving transition is running; no further entry is accepted
 *   completed  gone for good (until the next page load): nothing renders or runs any more
 */
export type IntroPhase = 'ready' | 'active' | 'exiting' | 'completed'

export interface IntroContextValue {
  phase: IntroPhase
  config: IntroConfig
  /** True while the intro covers the page and the page behind it should stay quiet. */
  blocking: boolean
  /** The visitor has engaged. Does nothing after the first call. */
  engage: () => void
  /** Starts the leaving transition. Returns false, and does nothing, unless the intro is ready or active. */
  enter: () => boolean
  /** The leaving transition has ended. */
  finish: () => void
}

export const IntroContext = createContext<IntroContextValue | null>(null)
