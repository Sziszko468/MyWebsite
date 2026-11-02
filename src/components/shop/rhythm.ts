import type { SectionTone } from '../Section/tone'

/**
 * The shop's front page: its bands after the hero, in order, with the id each one is reachable by
 * (/hu/services#packages) and the tone it wears. The hero wears the page's own theme, so the first
 * band is the opposite of it and every band after is the opposite of the one above, in either
 * theme; the closing call to action is Racing Red whatever the theme. shop.test.ts checks it.
 */
export const SHOP_RHYTHM = [
  { id: 'services', tone: 'inverse' },
  { id: 'packages', tone: 'base' },
  { id: 'configure', tone: 'inverse' },
  { id: 'process', tone: 'base' },
  { id: 'support', tone: 'inverse' },
  { id: 'work', tone: 'base' },
  { id: 'faq', tone: 'inverse' },
  { id: 'start', tone: 'dark' },
] as const satisfies ReadonlyArray<{ id: string; tone: SectionTone }>

export type ShopSectionId = (typeof SHOP_RHYTHM)[number]['id']

export function shopTone(id: ShopSectionId): SectionTone {
  const section = SHOP_RHYTHM.find((candidate) => candidate.id === id)
  if (!section) throw new Error(`Unknown shop section: ${id}`)
  return section.tone
}
