import type { Facts, ProjectType, Requirement, Signals } from './model.ts'

/**
 * The complexity assessment: a TRANSPARENT, rule-based reading of what is known about the project. Every factor adds a number of points
 * from a small table below; the points are added up and compared with the thresholds; the result lists every factor that counted and why.
 * Nothing here is learned, hidden or guessed by the model: the same facts always give the same assessment, and the visitor sees the factors.
 *
 * What this is NOT: an estimate of hours, effort or price. The levels describe how much there is to think about and build, in four steps,
 * to help the conversation and the plan. The disclaimer travels with the result, and the studio's quote is made by a person from a proper
 * evaluation.
 *
 * A factor the visitor has not said anything about counts for nothing and is listed as `unknown`: the assessment is then said to rest on
 * what is known so far, and the plan lists the missing information as a risk.
 */

export const LEVELS = ['small', 'medium', 'large', 'complex'] as const
export type Level = (typeof LEVELS)[number]

export const FACTOR_CODES = ['project_type', 'functional_areas', 'requirements_volume', 'requirement_complexity', 'user_roles', 'data_model', 'integrations', 'authentication', 'admin_area', 'automation', 'localization', 'security', 'third_party', 'scalability', 'existing_system'] as const
export type FactorCode = (typeof FACTOR_CODES)[number]

export interface Factor {
  code: FactorCode
  points: number
  /** The number or choice the points come from (the count of areas, "few", "regulated"…), for the sentence that explains it. */
  detail: string | number | null
}

export interface Assessment {
  /** `null`: not enough is known yet (no project type and no requirement). */
  level: Level | null
  score: number
  factors: Factor[]
  /** The signals nobody has answered yet (they counted for nothing). */
  unknown: string[]
  /** The level the score alone would give, when a floor rule raised it (`security: regulated`, a SaaS…). */
  raisedFrom: Level | null
  thresholds: { medium: number; large: number; complex: number }
  /** Always true: this is a way to reason about scope, not a number of hours or a price. */
  notAnEstimate: true
}

/** The score at which each level starts: small below `medium`, medium from `medium`, and so on. */
export const THRESHOLDS = { medium: 6, large: 14, complex: 25 } as const

const BASE_BY_TYPE: Record<ProjectType, number> = {
  portfolio: 0,
  business_site: 1,
  redesign: 2,
  other: 1,
  api_backend: 3,
  dashboard: 4,
  booking: 4,
  ecommerce: 4,
  custom_product: 5,
  web_app: 5,
  saas: 8,
}

const band = (n: number, bands: readonly (readonly [number, number])[]): number => {
  for (const [max, points] of bands) if (n <= max) return points
  return bands[bands.length - 1][1]
}
const pick = (value: string | number | undefined, table: Record<string, number>): number => (value === undefined ? 0 : (table[String(value)] ?? 0))

export interface AssessmentInput {
  type: ProjectType | null
  facts: Facts
  requirements: readonly Requirement[]
  signals: Signals
}

export function assess(input: AssessmentInput): Assessment {
  const live = input.requirements.filter((requirement) => requirement.status !== 'rejected')
  const present = live.filter((requirement) => requirement.priority !== 'future')
  const factors: Factor[] = []
  const add = (code: FactorCode, points: number, detail: string | number | null = null) => {
    if (points > 0) factors.push({ code, points, detail })
  }

  if (input.type) add('project_type', BASE_BY_TYPE[input.type], input.type)
  const areas = new Set(present.map((requirement) => requirement.category)).size
  add('functional_areas', band(areas, [[2, 0], [4, 1], [6, 2], [9, 4], [Infinity, 6]]), areas)
  add('requirements_volume', band(present.length, [[5, 0], [10, 1], [20, 3], [35, 5], [Infinity, 7]]), present.length)
  const high = present.filter((requirement) => requirement.complexity === 'high').length
  const medium = present.filter((requirement) => requirement.complexity === 'medium').length
  add('requirement_complexity', Math.min(high, 8) + Math.floor(medium / 5), high)

  const s = input.signals
  add('user_roles', pick(s.roles?.value, { single: 0, few: 2, many: 5 }), s.roles?.value ?? null)
  add('data_model', pick(s.dataModel?.value, { simple: 0, moderate: 2, complex: 5 }), s.dataModel?.value ?? null)
  const integrations = Math.max(Number(s.integrations?.value ?? 0), live.filter((requirement) => requirement.category === 'integration').length)
  add('integrations', band(integrations, [[0, 0], [2, 1], [4, 3], [Infinity, 5]]), integrations)
  add('authentication', pick(s.authentication?.value, { none: 0, basic: 1, advanced: 3 }), s.authentication?.value ?? null)
  add('admin_area', pick(s.adminArea?.value, { none: 0, basic: 1, full: 3 }), s.adminArea?.value ?? null)
  add('automation', pick(s.automation?.value, { none: 0, some: 1, extensive: 3 }), s.automation?.value ?? null)
  const languages = Number(s.languages?.value ?? 1)
  add('localization', band(languages, [[1, 0], [3, 1], [Infinity, 2]]), languages)
  add('security', pick(s.security?.value, { standard: 0, elevated: 2, regulated: 5 }), s.security?.value ?? null)
  add('third_party', band(Number(s.thirdParty?.value ?? 0), [[0, 0], [3, 1], [Infinity, 2]]), Number(s.thirdParty?.value ?? 0))
  add('scalability', pick(s.scalability?.value, { standard: 0, elevated: 2, high: 4 }), s.scalability?.value ?? null)
  // An existing system that has to be understood and moved is more than a new build of the same size.
  if (input.type === 'redesign' && input.facts.existingSite) add('existing_system', 2, 'redesign')

  const score = factors.reduce((sum, factor) => sum + factor.points, 0)
  const unknown = [...Object.keys({ roles: 1, dataModel: 1, authentication: 1, adminArea: 1, automation: 1, security: 1, scalability: 1 })].filter((key) => s[key as keyof Signals] === undefined)

  const enough = input.type !== null || live.length > 0
  let level: Level | null = enough ? (score >= THRESHOLDS.complex ? 'complex' : score >= THRESHOLDS.large ? 'large' : score >= THRESHOLDS.medium ? 'medium' : 'small') : null
  let raisedFrom: Level | null = null
  // Floors: a few facts make a project at least as large as their level, whatever else is small.
  const floor: Level | null = s.security?.value === 'regulated' || s.scalability?.value === 'high' ? 'large' : input.type === 'saas' ? 'medium' : null
  if (level && floor && LEVELS.indexOf(floor) > LEVELS.indexOf(level)) {
    raisedFrom = level
    level = floor
  }
  return { level, score, factors: factors.sort((a, b) => b.points - a.points), unknown, raisedFrom, thresholds: { ...THRESHOLDS }, notAnEstimate: true }
}

/** The older planner's three-step scale, for the quote request's "estimated complexity" row. */
export const legacyComplexity = (level: Level | null): 'simple' | 'medium' | 'complex' | 'unsure' => (level === null ? 'unsure' : level === 'small' ? 'simple' : level === 'medium' ? 'medium' : 'complex')
