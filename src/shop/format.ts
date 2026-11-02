import type { Timeline } from '../content/pricing'
import type { Language } from '../i18n/config'
import { fill } from '../utils/format'

/** The words `timelineText` needs: the dictionary's `landing.packages.timeline`, in the visitor's language. */
export interface TimelineText {
  scope: string
  estimate: string
  units: Record<'days' | 'weeks' | 'months', { one: string; other: string }>
}

/** "Depends on the project", or a published range with its unit in the right form for the language. */
export function timelineText(timeline: Timeline, lang: Language, copy: TimelineText): string {
  if (timeline.kind === 'scope') return copy.scope
  const { min, max, unit } = timeline
  const form = new Intl.PluralRules(lang).select(max) === 'one' ? 'one' : 'other'
  return fill(copy.estimate, { range: min === max ? String(min) : `${min}–${max}`, unit: copy.units[unit][form] })
}
