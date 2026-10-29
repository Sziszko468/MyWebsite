import type { SectionTone } from '../Section/tone'

/**
 * The services page's bands after the hero, in order, with the id each one is reachable by
 * (/hu/services#quote) and the tone it wears. The hero wears the page's own theme, so the first
 * band is the opposite of it and every band after is the opposite of the one above, in either
 * theme; the closing call to action is Racing Red whatever the theme. services.test.ts checks it.
 */
export const SERVICES_RHYTHM = [
  { id: 'areas', tone: 'inverse' },
  { id: 'packages', tone: 'base' },
  { id: 'quote', tone: 'inverse' },
  { id: 'process', tone: 'base' },
  { id: 'faq', tone: 'inverse' },
  { id: 'start', tone: 'dark' },
] as const satisfies ReadonlyArray<{ id: string; tone: SectionTone }>

export type ServicesSectionId = (typeof SERVICES_RHYTHM)[number]['id']

/** The hero's short index of the page: the bands a visitor may want to jump to, in order. */
export const PAGE_INDEX = ['areas', 'packages', 'quote', 'process', 'faq'] as const satisfies ReadonlyArray<ServicesSectionId>

export function servicesTone(id: ServicesSectionId): SectionTone {
  const section = SERVICES_RHYTHM.find((candidate) => candidate.id === id)
  if (!section) throw new Error(`Unknown services section: ${id}`)
  return section.tone
}
