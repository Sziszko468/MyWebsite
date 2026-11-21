import type { Trilingual } from '../content/trilingual'
import { LANGUAGES } from '../i18n/config'

/**
 * The interactive demos (PROMPT 35): a CLOSED list. A demo is a component that ships with the website and reproduces, with invented sample data, a
 * behaviour the project's own repository documents. Nothing here is loaded by name from a database or a URL: the administration can only switch on a
 * type that is in this list, for a project that is in its eligibility list, and the website maps the type to its component through a fixed table
 * (`registry.ts`). An id that is not here is ignored wherever it comes from.
 *
 * This file has no dependency on React, so the rules can be tested alone. The backend keeps the same two lists in `server/src/modules/projects/demo.ts`
 * (it never imports from `src/`), and a test fails when the two differ.
 */

export const DEMO_TYPES = ['finance-workbench', 'booking-flow', 'shipment-board'] as const
export type DemoType = (typeof DEMO_TYPES)[number]

/**
 * The projects (by the slug of their page) whose own capabilities each demo reproduces. A demo can be switched on for those and no others: a booking
 * demo on a logistics project would present one project's behaviour as another's.
 */
export const DEMO_PROJECTS: Readonly<Record<DemoType, readonly string[]>> = {
  'finance-workbench': ['spendly'],
  'booking-flow': ['bookinghub'],
  'shipment-board': ['logistics-platform'],
}

export const isDemoType = (value: unknown): value is DemoType => typeof value === 'string' && (DEMO_TYPES as readonly string[]).includes(value)

/** The demo types that may be switched on for a project. Empty for a project with no matching demo. */
export const demoTypesFor = (slug: string): DemoType[] => DEMO_TYPES.filter((type) => DEMO_PROJECTS[type].includes(slug))

export const isEligible = (type: DemoType, slug: string): boolean => DEMO_PROJECTS[type].includes(slug)

/** The slugs that have a demo type, in a stable order. */
export const DEMO_SLUGS: readonly string[] = [...new Set(DEMO_TYPES.flatMap((type) => DEMO_PROJECTS[type]))]

/** The language-free path of a project's demo page. */
export const demoPath = (slug: string): string => `/work/${slug}/demo`

/** What a project says about its demo: which registered type, and the owner's own words for how to use it (plain text; empty means the demo's built-in instructions). */
export interface ProjectDemo {
  type: DemoType
  instructions: Trilingual | null
}

/** The longest instruction text the website will show, per language. The backend enforces the same limit. */
export const INSTRUCTIONS_MAX = 400

/**
 * Reads a project's demo from whatever the backend (or the website's own content) sent: a registered type that is eligible for this project, and
 * instructions that are short plain strings. Anything else, a missing field, an unknown type, a type for another project, a number where a text
 * should be, gives `null`: the project then simply has no demo. Never throws.
 */
export function parseProjectDemo(value: unknown, slug: string): ProjectDemo | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (!isDemoType(record.type) || !isEligible(record.type, slug)) return null
  const given = record.instructions
  let instructions: Trilingual | null = null
  if (typeof given === 'object' && given !== null) {
    const read = given as Record<string, unknown>
    const out = {} as Trilingual
    for (const language of LANGUAGES) {
      const text = read[language]
      out[language] = typeof text === 'string' ? text.trim().slice(0, INSTRUCTIONS_MAX) : ''
    }
    if (LANGUAGES.some((language) => out[language] !== '')) instructions = out
  }
  return { type: record.type, instructions }
}
