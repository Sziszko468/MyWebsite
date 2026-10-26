import { useContext } from 'react'
import { introConfig } from '../../config/intro'
import { IntroContext, type IntroContextValue } from './introContext'

/** Without a provider (tests, isolated components) there is simply no intro. */
const NO_INTRO: IntroContextValue = {
  phase: 'completed',
  config: introConfig,
  blocking: false,
  engage: () => undefined,
  enter: () => false,
  finish: () => undefined,
}

export function useIntro(): IntroContextValue {
  return useContext(IntroContext) ?? NO_INTRO
}
