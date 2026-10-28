import type { SectionTone } from '../Section/tone'

/**
 * The home page's bands, in order, with the id each one is reachable by (/hu/#work) and the tone
 * it wears. This is where the page's dark and light rhythm is decided: from the first section on,
 * every band is the opposite of the one above it, in either theme, and the closing call to action
 * is Racing Red whatever the theme. rhythm.test.ts checks it.
 */
export const HOME_RHYTHM = [
  { id: 'path', tone: 'base' },
  { id: 'work', tone: 'inverse' },
  { id: 'build', tone: 'base' },
  { id: 'about', tone: 'inverse' },
  { id: 'lab', tone: 'base' },
  { id: 'services', tone: 'inverse' },
  { id: 'start', tone: 'dark' },
] as const satisfies ReadonlyArray<{ id: string; tone: SectionTone }>

export type HomeSectionId = (typeof HOME_RHYTHM)[number]['id']

export function homeTone(id: HomeSectionId): SectionTone {
  const section = HOME_RHYTHM.find((candidate) => candidate.id === id)
  if (!section) throw new Error(`Unknown home section: ${id}`)
  return section.tone
}
