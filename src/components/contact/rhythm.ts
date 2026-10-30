import type { SectionTone } from '../Section/tone'

/**
 * The contact page's band after the hero, with the id it is reachable by (/hu/contact#message) and
 * the tone it wears. The hero wears the page's own theme, so the form's band is the opposite of it.
 * contact.test.ts checks it.
 */
export const CONTACT_RHYTHM = [{ id: 'message', tone: 'inverse' }] as const satisfies ReadonlyArray<{
  id: string
  tone: SectionTone
}>

export type ContactSectionId = (typeof CONTACT_RHYTHM)[number]['id']

export function contactTone(id: ContactSectionId): SectionTone {
  const section = CONTACT_RHYTHM.find((candidate) => candidate.id === id)
  if (!section) throw new Error(`Unknown contact section: ${id}`)
  return section.tone
}
