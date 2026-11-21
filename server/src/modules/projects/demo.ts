/**
 * The interactive demos a project can have (PROMPT 35), as the backend knows them: a CLOSED list of registered types and, for each, the projects (by slug) whose own
 * behaviour it reproduces. The administration can switch a demo on only for a type in this list and a slug that suits it; the public answer carries a demo only
 * when both hold; nothing about a demo is ever code, markup or an address. The website keeps the same two lists in `src/demos/ids.ts` (the backend never
 * imports from `src/`), and `server/test/projectDemos.test.ts` fails when the two differ.
 */

export const DEMO_TYPES = ['finance-workbench', 'booking-flow', 'shipment-board'] as const
export type DemoType = (typeof DEMO_TYPES)[number]

export const DEMO_PROJECTS: Readonly<Record<DemoType, readonly string[]>> = {
  'finance-workbench': ['spendly'],
  'booking-flow': ['bookinghub'],
  'shipment-board': ['logistics-platform'],
}

/** The longest instruction text, per language. The website truncates at the same length. */
export const INSTRUCTIONS_MAX = 400

export const isDemoType = (value: unknown): value is DemoType => typeof value === 'string' && (DEMO_TYPES as readonly string[]).includes(value)

export const isEligible = (type: DemoType, slug: string): boolean => DEMO_PROJECTS[type].includes(slug)

/** The types that may be switched on for a project. */
export const demoTypesFor = (slug: string): DemoType[] => DEMO_TYPES.filter((type) => DEMO_PROJECTS[type].includes(slug))
