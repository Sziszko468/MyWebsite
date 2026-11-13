/**
 * The project size guide (PROMPT 20): a planning aid shown with the FULL EXPERIENCE summary, never a price and never a deadline.
 *
 * From the answers to the configurator's questions it adds up a few points (a bigger kind of project, a system that already exists,
 * every part the visitor chose, and how complex they say it is) and names the size: Basic, Moderate, Advanced or Custom. The table
 * below is the whole rule: nothing else is read, nothing is guessed, "not sure yet" counts nothing, and an option the table does not
 * know (a question or option the administrator added) counts nothing. It says so on the screen: the final scope and price come after
 * we have looked at the project.
 *
 * The server applies the very same table to the validated answers (server/src/modules/shop/estimate.ts) and stores the result in the
 * brief, so what the administrator reads is never a value the browser sent. `server/test/contract.test.ts` fails if the two differ.
 */

export type ProjectSizeLevel = 'basic' | 'moderate' | 'advanced' | 'custom'
export interface ProjectSize {
  level: ProjectSizeLevel
  points: number
}

/** Points per question and option id. Anything not listed is worth nothing. */
export const SIZE_POINTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  type: { 'business-site': 0, 'shop-site': 1, 'web-app': 2, 'internal-app': 2, portal: 3, custom: 3 },
  stage: { redevelopment: 2, extension: 1 },
  components: { backend: 1, database: 1, auth: 1, admin: 1, api: 1, payments: 2, multilingual: 1, interactive: 1, mobile: 1 },
  complexity: { medium: 2, complex: 4 },
}

/** The questions whose answers the size is based on: without an answer to one of them there is nothing to base it on. */
export const SIZE_BASIS = ['type', 'components', 'complexity'] as const

/** Upper end of each level, in points; above the last it is Custom. */
export const SIZE_LIMITS = { basic: 2, moderate: 6, advanced: 11 } as const

export function estimateSize(answers: Readonly<Record<string, readonly string[]>>): ProjectSize | null {
  const answered = SIZE_BASIS.some((question) => (answers[question] ?? []).some((id) => id !== 'unsure'))
  if (!answered) return null
  let points = 0
  for (const [question, options] of Object.entries(SIZE_POINTS)) {
    for (const id of new Set(answers[question] ?? [])) points += options[id] ?? 0
  }
  // A custom digital product is custom by its nature, whatever else was chosen.
  if ((answers.type ?? []).includes('custom')) return { level: 'custom', points }
  const level: ProjectSizeLevel = points <= SIZE_LIMITS.basic ? 'basic' : points <= SIZE_LIMITS.moderate ? 'moderate' : points <= SIZE_LIMITS.advanced ? 'advanced' : 'custom'
  return { level, points }
}
