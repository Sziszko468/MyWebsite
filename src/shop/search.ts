import { packages } from '../content/packages'
import { addons } from '../content/services/addons'
import { serviceAreas } from '../content/services/areas'
import { getServiceDetail } from '../content/services/detail'
import type { Language } from '../i18n/config'

/**
 * Search over the whole catalogue (services, packages, add-ons) in the language the page is in.
 * The index is built from the very texts the pages show, so what can be found is what can be read.
 * Matching ignores case and accents (so "weboldalfejlesztes" finds "weboldalfejlesztés"), and every
 * word of the query has to appear somewhere in an entry. Title matches come first.
 */

export type EntryKind = 'service' | 'package' | 'addon'
export const ENTRY_KINDS: readonly EntryKind[] = ['service', 'package', 'addon']

export interface SearchEntry {
  kind: EntryKind
  id: string
  title: string
  description: string
  /** Normalised text of the whole entry, for matching. */
  haystack: string
  /** Normalised title, for ranking. */
  heading: string
}

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function entry(kind: EntryKind, id: string, title: string, description: string, rest: readonly string[]): SearchEntry {
  return {
    kind,
    id,
    title,
    description,
    heading: normalize(title),
    haystack: normalize([title, description, ...rest].join(' ')),
  }
}

export function buildIndex(lang: Language): SearchEntry[] {
  const services = serviceAreas.map((area) => {
    const detail = getServiceDetail(area.id)
    return entry('service', area.id, area.name[lang], area.summary[lang], [
      detail.tagline[lang],
      detail.overview[lang],
      ...area.features.map((feature) => feature[lang]),
      ...detail.benefits.flatMap((benefit) => [benefit.title[lang], benefit.text[lang]]),
      ...detail.useCases.map((useCase) => useCase[lang]),
      ...detail.deliverables.map((item) => item[lang]),
    ])
  })
  const packageEntries = packages.map((pkg) =>
    entry('package', pkg.id, pkg.name, pkg.tagline[lang], [
      pkg.audience[lang],
      pkg.scope[lang],
      ...pkg.fits.map((item) => item[lang]),
      ...pkg.includes.map((item) => item[lang]),
      ...pkg.deliverables.map((item) => item[lang]),
    ]),
  )
  const addonEntries = addons.map((addon) => entry('addon', addon.id, addon.name[lang], addon.summary[lang], []))
  return [...services, ...packageEntries, ...addonEntries]
}

/** The entries that match, best first. An empty query matches everything of the chosen kind, in catalogue order. */
export function searchEntries(index: readonly SearchEntry[], query: string, kind: EntryKind | 'all' = 'all'): SearchEntry[] {
  const words = normalize(query).split(' ').filter(Boolean)
  const pool = index.filter((candidate) => kind === 'all' || candidate.kind === kind)
  if (words.length === 0) return pool

  return pool
    .filter((candidate) => words.every((word) => candidate.haystack.includes(word)))
    .map((candidate, position) => ({ candidate, position, rank: words.every((word) => candidate.heading.includes(word)) ? 0 : 1 }))
    .sort((a, b) => a.rank - b.rank || a.position - b.position)
    .map(({ candidate }) => candidate)
}
