import { tri, type Trilingual } from '../trilingual'

/**
 * The four principles of how the owner works, in order. The names are proper nouns and read the same
 * in every language; each sentence is the owner's, written in all three. The page draws them as one
 * chain that loops back on itself.
 */

export type ApproachId = 'understand' | 'design' | 'build' | 'refine'

export interface ApproachStep {
  id: ApproachId
  /** Shown as is in every language. */
  name: string
  text: Trilingual
}

export const approachSteps: readonly ApproachStep[] = [
  {
    id: 'understand',
    name: 'Understand',
    text: tri(
      'Először megértem a problémát és a felhasználói igényeket.',
      'First I understand the problem and what users need.',
      'Eerst begrijp ik het probleem en wat gebruikers nodig hebben.',
    ),
  },
  {
    id: 'design',
    name: 'Design',
    text: tri(
      'Átgondolom a struktúrát, az élményt és a vizuális megjelenést.',
      'I think through the structure, the experience and the visual look.',
      'Ik denk de structuur, de ervaring en de visuele uitstraling goed door.',
    ),
  },
  {
    id: 'build',
    name: 'Build',
    text: tri(
      'A megfelelő technológiákkal megvalósítom a megoldást.',
      'I build the solution with the right technologies.',
      'Ik bouw de oplossing met de juiste technologieën.',
    ),
  },
  {
    id: 'refine',
    name: 'Refine',
    text: tri(
      'Tesztelem, finomítom és továbbfejlesztem a terméket.',
      'I test, refine and keep developing the product.',
      'Ik test, verfijn en ontwikkel het product verder.',
    ),
  },
]

/** Under the chain: the last step leads back to the first. */
export const approachLoop: Trilingual = tri(
  'Ez egy kör, nem egyenes: amit finomítás közben megtanulok, az a következő megértés kiindulópontja.',
  'It is a loop, not a line: what I learn while refining is where the next understanding starts.',
  'Het is een kring, geen rechte lijn: wat ik tijdens het verfijnen leer, is het beginpunt van het volgende begrijpen.',
)
