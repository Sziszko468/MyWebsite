/**
 * The project size guide of a FULL EXPERIENCE request (PROMPT 20): Basic, Moderate, Advanced or Custom, from the validated answers.
 * A planning aid for the owner, never a price or a deadline. The browser shows the same guide before it sends (src/shop/fullExperience/
 * estimate.ts, which carries the reasoning); the server works it out again from the answers it validated and stores that, so the
 * administrator never reads a value the browser sent. `test/contract.test.ts` compares the two over every combination.
 */

export type ProjectSizeLevel = 'basic' | 'moderate' | 'advanced' | 'custom'
export interface ProjectSize {
  level: ProjectSizeLevel
  points: number
}

export const SIZE_POINTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  type: { 'business-site': 0, 'shop-site': 1, 'web-app': 2, 'internal-app': 2, portal: 3, custom: 3 },
  stage: { redevelopment: 2, extension: 1 },
  components: { backend: 1, database: 1, auth: 1, admin: 1, api: 1, payments: 2, multilingual: 1, interactive: 1, mobile: 1 },
  complexity: { medium: 2, complex: 4 },
}

export const SIZE_BASIS = ['type', 'components', 'complexity'] as const
export const SIZE_LIMITS = { basic: 2, moderate: 6, advanced: 11 } as const

export function estimateSize(answers: Readonly<Record<string, readonly string[]>>): ProjectSize | null {
  const answered = SIZE_BASIS.some((question) => (answers[question] ?? []).some((id) => id !== 'unsure'))
  if (!answered) return null
  let points = 0
  for (const [question, options] of Object.entries(SIZE_POINTS)) {
    for (const id of new Set(answers[question] ?? [])) points += options[id] ?? 0
  }
  if ((answers.type ?? []).includes('custom')) return { level: 'custom', points }
  const level: ProjectSizeLevel = points <= SIZE_LIMITS.basic ? 'basic' : points <= SIZE_LIMITS.moderate ? 'moderate' : points <= SIZE_LIMITS.advanced ? 'advanced' : 'custom'
  return { level, points }
}

export const isProjectSize = (value: unknown): value is ProjectSize =>
  typeof value === 'object' && value !== null && ['basic', 'moderate', 'advanced', 'custom'].includes((value as ProjectSize).level) && Number.isInteger((value as ProjectSize).points)
