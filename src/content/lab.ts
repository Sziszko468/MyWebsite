/**
 * The experiments of the Lab: the one list the Lab is built from. The gallery, the routes
 * (`/lab/<id>`), the Lab's own navigation, the previous/next links and the home page's teaser are
 * all derived from it, so adding an experiment is: one entry here, its words in content/labText.ts
 * and its component in components/lab/registry.tsx.
 *
 * An experiment is offered as a working page only when its status is `ready`. An `in-progress` or
 * `concept` entry is listed in the gallery with its honest status and has no page, no route and
 * no demo, so nothing unfinished is ever shown as if it worked.
 */

import { tri, type Trilingual } from './trilingual'

export type LabId =
  | 'particle-universe'
  | 'liquid-matter'
  | 'type-in-motion'
  | 'infinite-space'
  | 'chromatic-distortion'
  | 'generative-objects'

export type LabStatus = 'ready' | 'in-progress' | 'concept'

/** The brand colour an experiment's tile and numeral lean on. */
export type LabAccent = 'red' | 'blue' | 'paper' | 'graphite'

export interface LabExperiment {
  id: LabId
  /** Its place in the Lab, shown on the page and in the gallery. */
  number: string
  /** The experiment's name: a proper noun, shown as is in every language. */
  name: string
  /** One short line: what it is. Also the experiment's description in a search result. */
  tagline: Trilingual
  status: LabStatus
  accent: LabAccent
  /** What it is built with, as proper nouns and technical terms that are the same in every language. */
  tech: readonly string[]
}

export const experiments: readonly LabExperiment[] = [
  {
    id: 'particle-universe',
    number: '01',
    name: 'Particle Universe',
    tagline: tri(
      'Több ezer részecske, amely követ, elmenekül és újra összeáll.',
      'Thousands of particles that follow, flee and re-form.',
      'Duizenden deeltjes die volgen, vluchten en zich weer vormen.',
    ),
    status: 'ready',
    accent: 'red',
    tech: ['Three.js', 'GLSL', 'Typed-array simulation', 'Flow field'],
  },
  {
    id: 'liquid-matter',
    number: '02',
    name: 'Liquid Matter',
    tagline: tri(
      'Folyékony króm, lágy anyag, digitális üveg és izzó vörös.',
      'Liquid chrome, soft matter, digital glass and molten red.',
      'Vloeibaar chroom, zachte materie, digitaal glas en gesmolten rood.',
    ),
    status: 'ready',
    accent: 'graphite',
    tech: ['Three.js', 'GLSL vertex displacement', 'Simplex noise', 'Procedural studio light'],
  },
  {
    id: 'type-in-motion',
    number: '03',
    name: 'Type in Motion',
    tagline: tri('Betűk, amelyek a térben élnek.', 'Letters that live in space.', 'Letters die in de ruimte leven.'),
    status: 'ready',
    accent: 'paper',
    tech: ['Three.js', 'Canvas 2D glyphs', 'Instanced layers', 'Spring physics'],
  },
  {
    id: 'infinite-space',
    number: '04',
    name: 'Infinite Space',
    tagline: tri('Végtelen fényalagút.', 'A tunnel of light with no end.', 'Een tunnel van licht zonder einde.'),
    status: 'ready',
    accent: 'blue',
    tech: ['Three.js', 'GLSL', 'Instanced streaks', 'Perspective camera rig'],
  },
  {
    id: 'chromatic-distortion',
    number: '05',
    name: 'Chromatic Distortion',
    tagline: tri(
      'Fény és szín, szétszedve.',
      'Light and colour, pulled apart.',
      'Licht en kleur, uit elkaar getrokken.',
    ),
    status: 'ready',
    accent: 'red',
    tech: ['GLSL fragment shader', 'Signed distance fields', 'Per-channel sampling'],
  },
  {
    id: 'generative-objects',
    number: '06',
    name: 'Generative Objects',
    tagline: tri(
      'Absztrakt objektumok néhány paraméterből.',
      'Abstract objects from a handful of parameters.',
      'Abstracte objecten uit een handvol parameters.',
    ),
    status: 'ready',
    accent: 'graphite',
    tech: ['Three.js', 'Parametric surfaces', 'Seeded random', 'GLSL'],
  },
]

/** Whether the experiment has a working page. */
export function isPlayable(experiment: LabExperiment): boolean {
  return experiment.status === 'ready'
}

/** The experiments that have a page, in the Lab's order. */
export const playableExperiments: readonly LabExperiment[] = experiments.filter(isPlayable)

export function findExperiment(id: string): LabExperiment | undefined {
  return experiments.find((experiment) => experiment.id === id)
}

/** The route of an experiment's page, language-free. */
export function experimentPath(id: LabId): string {
  return `/lab/${id}`
}

/**
 * The playable experiment `step` places after (or before, when negative) the given one, wrapping
 * round at both ends. With nothing playable, or an id that is not playable, it returns null.
 */
export function neighbourExperiment(id: LabId, step: 1 | -1): LabExperiment | null {
  const index = playableExperiments.findIndex((experiment) => experiment.id === id)
  if (index < 0) return null
  const count = playableExperiments.length
  return playableExperiments[(index + step + count) % count]
}

/** The words for an experiment's state. They live here, with the states, because the home page shows them too. */
export const statusLabels: Record<LabStatus, Trilingual> = {
  ready: tri('Interaktív', 'Interactive', 'Interactief'),
  'in-progress': tri('Fejlesztés alatt', 'In progress', 'In ontwikkeling'),
  concept: tri('Koncepció', 'Concept', 'Concept'),
}
