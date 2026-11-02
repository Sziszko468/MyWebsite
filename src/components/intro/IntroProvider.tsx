import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { introConfig, type IntroConfig } from '../../config/intro'
import { IntroContext, type IntroPhase } from './introContext'
import { browserStores, markIntroSeen, readIntroOverride, shouldShowIntro } from './introPolicy'

/**
 * Holds the intro's state above the router, so it survives navigation and language changes: an
 * intro that has been entered never comes back until the next page load (and, per the
 * configuration, perhaps not even then). The decision whether to show it is made once, here,
 * from the configuration, what the browser remembers and the development override.
 */
export function IntroProvider({ children, config = introConfig }: { children: ReactNode; config?: IntroConfig }) {
  const [phase, setPhase] = useState<IntroPhase>(() =>
    shouldShowIntro(config, browserStores(), readIntroOverride(window.location.search), window.location.pathname) ? 'ready' : 'completed',
  )
  // The same value, readable synchronously, so two quick events cannot both pass a guard.
  const current = useRef(phase)

  const move = useCallback((next: IntroPhase) => {
    current.current = next
    setPhase(next)
  }, [])

  const engage = useCallback(() => {
    if (current.current === 'ready') move('active')
  }, [move])

  const enter = useCallback(() => {
    if (current.current !== 'ready' && current.current !== 'active') return false
    markIntroSeen(config, browserStores())
    move('exiting')
    return true
  }, [config, move])

  const finish = useCallback(() => {
    if (current.current === 'exiting') move('completed')
  }, [move])

  const value = useMemo(
    () => ({ phase, config, blocking: phase === 'ready' || phase === 'active', engage, enter, finish }),
    [phase, config, engage, enter, finish],
  )

  return <IntroContext.Provider value={value}>{children}</IntroContext.Provider>
}
