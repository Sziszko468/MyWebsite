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
  | 'model-studio'
  | 'racing'
  | 'track-architect'
  | 'performance-lab'
  | 'generative-art'

/**
 * `experiment` is a short piece of art that answers the pointer; `experience` is a small
 * application: it has tools, a state the visitor builds and, where it makes sense, a way to hand
 * that state to another experience (a track, a car setup).
 */
export type LabKind = 'experiment' | 'experience'

export type LabStatus = 'ready' | 'in-progress' | 'concept'

/** The brand colour an experiment's tile and numeral lean on. */
export type LabAccent = 'red' | 'blue' | 'paper' | 'graphite'

export interface LabExperiment {
  id: LabId
  kind: LabKind
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
    kind: 'experiment',
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
    kind: 'experiment',
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
    kind: 'experiment',
    number: '03',
    name: 'Type in Motion',
    tagline: tri('Betűk, amelyek a térben élnek.', 'Letters that live in space.', 'Letters die in de ruimte leven.'),
    status: 'ready',
    accent: 'paper',
    tech: ['Three.js', 'Canvas 2D glyphs', 'Instanced layers', 'Spring physics'],
  },
  {
    id: 'infinite-space',
    kind: 'experiment',
    number: '04',
    name: 'Infinite Space',
    tagline: tri('Végtelen fényalagút.', 'A tunnel of light with no end.', 'Een tunnel van licht zonder einde.'),
    status: 'ready',
    accent: 'blue',
    tech: ['Three.js', 'GLSL', 'Instanced streaks', 'Perspective camera rig'],
  },
  {
    id: 'chromatic-distortion',
    kind: 'experiment',
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
    kind: 'experiment',
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
  {
    id: 'model-studio',
    kind: 'experience',
    number: '07',
    name: 'Model Studio',
    tagline: tri(
      'Interaktív 3D modellezőstúdió a böngészőben.',
      'An interactive 3D modelling studio in your browser.',
      'Een interactieve 3D-modelleerstudio in je browser.',
    ),
    status: 'ready',
    accent: 'paper',
    tech: ['Three.js', 'Custom transform gizmos', 'PBR materials', 'GLB export'],
  },
  {
    id: 'racing',
    kind: 'experience',
    number: '08',
    name: 'Racing Experience',
    tagline: tri(
      'Vezess egy 3D versenyautót egy valódi pályán.',
      'Drive a 3D race car round a real circuit.',
      'Bestuur een 3D-raceauto over een echt circuit.',
    ),
    status: 'ready',
    accent: 'red',
    tech: ['Three.js', 'Bicycle-model car physics', 'Spline track generation', 'Touch controls'],
  },
  {
    id: 'track-architect',
    kind: 'experience',
    number: '09',
    name: 'Track Architect',
    tagline: tri(
      'Tervezd meg a saját versenypályádat, és vezesd végig.',
      'Design your own circuit, then drive it.',
      'Ontwerp je eigen circuit en bestuur het.',
    ),
    status: 'ready',
    accent: 'blue',
    tech: ['SVG editor', 'Catmull-Rom splines', 'Track validation', 'Procedural 3D geometry'],
  },
  {
    id: 'performance-lab',
    kind: 'experience',
    number: '10',
    name: 'Performance Lab',
    tagline: tri(
      'Hangold a versenyautót, és hasonlítsd össze a beállításokat.',
      'Tune the race car and compare setups.',
      'Stem de raceauto af en vergelijk setups.',
    ),
    status: 'ready',
    accent: 'graphite',
    tech: ['Simplified lap simulation', 'Aero flow visualisation', 'A/B comparison', 'Shared car model'],
  },
  {
    id: 'generative-art',
    kind: 'experience',
    number: '11',
    name: 'Generative Art Engine',
    tagline: tri(
      'Hozz létre saját generatív alkotást: részecskék, formák, színek.',
      'Make your own generative artwork: particles, forms, colour.',
      'Maak je eigen generatieve kunst: deeltjes, vormen, kleur.',
    ),
    status: 'ready',
    accent: 'red',
    tech: ['Three.js', 'CPU particle simulation', 'Seeded generation', 'PNG export'],
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
