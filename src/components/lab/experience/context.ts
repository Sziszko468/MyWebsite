import { createContext, useContext } from 'react'
import type { LabId } from '../../../content/lab'
import type { LabViewState } from '../core/useLabView'

export interface ExperienceContextValue {
  id: LabId
  /** How the stage is shown and at which quality: the same rules as every Lab stage. */
  view: LabViewState
}

export const ExperienceContext = createContext<ExperienceContextValue | null>(null)

export function useExperience(): ExperienceContextValue {
  const value = useContext(ExperienceContext)
  if (!value) throw new Error('useExperience must be used inside <ExperienceFrame>')
  return value
}
