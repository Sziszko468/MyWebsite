import type { Language } from '../i18n/config'

/**
 * What the About section can say about the person, kept apart from the page. Everything personal
 * is empty on purpose: nothing about a story, a career, an education or a skill is made up, and
 * an empty list renders nothing (in development, a muted note shows where it will appear).
 *
 * Text a visitor reads is a `Localized` value, one string per language; you may give only the
 * languages you have (a missing one falls back to Hungarian). Proper nouns (employers, schools,
 * technologies) go in as they are.
 */

export type Localized = Partial<Record<Language, string>> & { hu: string }

export interface TimelineEntry {
  /** e.g. "2021 – 2023". Free text, shown as is. */
  period: string
  title: Localized
  /** Employer or school, shown as is. */
  place?: string
  summary?: Localized
}

export interface SkillGroup {
  label: Localized
  items: readonly string[]
}

export interface AboutProfile {
  /** A few short paragraphs in the first person. */
  story: readonly Localized[]
  experience: readonly TimelineEntry[]
  education: readonly TimelineEntry[]
  skills: readonly SkillGroup[]
}

export const aboutProfile: AboutProfile = {
  story: [],
  experience: [],
  education: [],
  skills: [],
}

/**
 * The tools this very site is built with, read from its own package.json. It is a fact about the
 * site, shown as such ("what this site is built with"), and not a claim about anything else.
 */
export const siteStack: readonly string[] = [
  'React',
  'TypeScript',
  'Vite',
  'SCSS Modules',
  'Three.js',
  'React Three Fiber',
  'React Router',
]

/** Picks the text for a language, falling back to Hungarian. */
export function localize(value: Localized, lang: Language): string {
  return value[lang] ?? value.hu
}
