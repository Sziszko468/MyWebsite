import type { ProjectStatus } from '../components/Badge/Badge'

/**
 * The experiments shown in "The Lab". The words live in the dictionaries under
 * `home.lab.items.<id>`.
 *
 * None of them is built yet, so all three are concepts and none links to a demo. When one is
 * built, set its status and `demoUrl` (a real, working address); the card then offers the link.
 */

export type LabId = 'particles' | 'liquid' | 'motion'

export interface LabExperiment {
  id: LabId
  /** The experiment's name: a proper noun, shown as is in every language. */
  name: string
  status: ProjectStatus
  /** Full https:// address of a working demo. `null` until one exists. */
  demoUrl: string | null
}

export const experiments: readonly LabExperiment[] = [
  { id: 'particles', name: 'Particle Playground', status: 'concept', demoUrl: null },
  { id: 'liquid', name: 'Liquid Geometry', status: 'concept', demoUrl: null },
  { id: 'motion', name: 'Motion Experiments', status: 'concept', demoUrl: null },
]
