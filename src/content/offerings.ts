/**
 * The areas shown in "What I build", in this order. Remove an entry to hide its block; the
 * words live in the dictionaries under `home.build.items.<id>`. An area is a description of
 * what is offered, not a claim of proven experience in it.
 */

export type OfferingId = 'websites' | 'webapps' | 'mobile' | 'integrations'

export interface Offering {
  id: OfferingId
}

export const offerings: readonly Offering[] = [
  { id: 'websites' },
  { id: 'webapps' },
  { id: 'mobile' },
  { id: 'integrations' },
]
