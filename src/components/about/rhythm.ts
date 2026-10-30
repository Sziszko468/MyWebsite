import type { SectionTone } from '../Section/tone'

/**
 * The About page's bands after the hero, in order, with the id each one is reachable by
 * (/hu/about#skills) and the tone it wears. The hero wears the page's own theme, so the first band is
 * the opposite of it and every band after is the opposite of the one above, in either theme; the
 * closing call to action is Racing Red whatever the theme. about.test.ts checks it.
 */
export const ABOUT_RHYTHM = [
  { id: 'story', tone: 'inverse' },
  { id: 'approach', tone: 'base' },
  { id: 'skills', tone: 'inverse' },
  { id: 'focus', tone: 'base' },
  { id: 'start', tone: 'dark' },
] as const satisfies ReadonlyArray<{ id: string; tone: SectionTone }>

export type AboutSectionId = (typeof ABOUT_RHYTHM)[number]['id']

export function aboutTone(id: AboutSectionId): SectionTone {
  const section = ABOUT_RHYTHM.find((candidate) => candidate.id === id)
  if (!section) throw new Error(`Unknown About section: ${id}`)
  return section.tone
}
