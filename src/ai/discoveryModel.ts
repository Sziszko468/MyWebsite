/**
 * The vocabulary of project discovery on the website's side: the same identifiers the server validates (server/src/modules/ai/discovery/model.ts,
 * checked against it by `discoveryText.test.ts`), and the shape of what the server sends. Identifiers are DATA: they are never translated,
 * the interface words them from `content/ai/discovery.ts`.
 */

export const STAGES = ['idea', 'type', 'goal', 'audience', 'requirements', 'features', 'infrastructure', 'complexity', 'budget', 'timeline', 'maintenance', 'summary', 'plan'] as const
export type Stage = (typeof STAGES)[number]

export const PROJECT_TYPES = ['portfolio', 'business_site', 'ecommerce', 'booking', 'web_app', 'saas', 'dashboard', 'api_backend', 'redesign', 'custom_product', 'other'] as const
export type ProjectType = (typeof PROJECT_TYPES)[number]

export const CATEGORIES = ['content', 'design', 'accounts', 'commerce', 'booking', 'data', 'integration', 'admin', 'communication', 'automation', 'security', 'performance', 'localization', 'other'] as const
export type Category = (typeof CATEGORIES)[number]

export const PRIORITIES = ['essential', 'important', 'optional', 'future'] as const
export type Priority = (typeof PRIORITIES)[number]

export type RequirementStatus = 'unconfirmed' | 'confirmed' | 'rejected'
export type Origin = 'visitor' | 'assistant'
export type Basis = 'stated' | 'suggested'
export const REQUIREMENT_COMPLEXITIES = ['low', 'medium', 'high'] as const
export type RequirementComplexity = (typeof REQUIREMENT_COMPLEXITIES)[number]

export const MAINTENANCE = ['none', 'occasional', 'ongoing', 'unsure'] as const
export type Maintenance = (typeof MAINTENANCE)[number]

export const SECTIONS = ['overview', 'requirements', 'architecture', 'phases', 'risks', 'next_steps'] as const
export type Section = (typeof SECTIONS)[number]

/** The facts a visitor can state, with the length each may have (the same limits as the server's). */
export const FACT_LIMITS = { projectName: 80, objective: 400, problem: 400, audience: 300, existingSite: 300, budget: 120, timeline: 200, maintenance: 20 } as const
export type FactKey = keyof typeof FACT_LIMITS

export const LIMITS = { title: 100, description: 400, requirements: 60, note: 1000 } as const

export const SKIPPABLE_STAGES = ['audience', 'features', 'infrastructure', 'complexity', 'budget', 'timeline', 'maintenance'] as const

/** The complexity signals: a choice among a few values, or a small whole number. */
export const SIGNAL_VALUES = {
  roles: ['single', 'few', 'many'],
  dataModel: ['simple', 'moderate', 'complex'],
  authentication: ['none', 'basic', 'advanced'],
  adminArea: ['none', 'basic', 'full'],
  automation: ['none', 'some', 'extensive'],
  security: ['standard', 'elevated', 'regulated'],
  scalability: ['standard', 'elevated', 'high'],
} as const
export type SignalChoice = keyof typeof SIGNAL_VALUES
export const SIGNAL_COUNTS = { integrations: [0, 10], thirdParty: [0, 10], languages: [1, 6] } as const
export type SignalCount = keyof typeof SIGNAL_COUNTS
export type SignalKey = SignalChoice | SignalCount

export interface Fact {
  value: string
  origin: Origin
  confirmed: boolean
}
export type Facts = Partial<Record<FactKey, Fact>>
export type Signals = Partial<Record<SignalKey, { value: string | number; origin: Origin }>>

export interface Requirement {
  id: string
  position: number
  title: string
  description: string
  category: Category
  priority: Priority
  required: boolean
  origin: Origin
  basis: Basis
  status: RequirementStatus
  complexity: RequirementComplexity
  dependsOn: string[]
  createdAt: string
  updatedAt: string
}

export type Level = 'small' | 'medium' | 'large' | 'complex'
export interface Factor {
  code: string
  points: number
  detail: string | number | null
}
export interface Assessment {
  level: Level | null
  score: number
  factors: Factor[]
  unknown: string[]
  raisedFrom: Level | null
  thresholds: { medium: number; large: number; complex: number }
  notAnEstimate: true
}

export type StageStatus = 'done' | 'current' | 'todo' | 'skipped' | 'not_applicable'
export interface StageProgress {
  stage: Stage
  status: StageStatus
  skippable: boolean
}

export type Missing = 'projectType' | 'objective' | 'requirements' | 'confirmedRequirement' | 'plan' | 'planStale'

export interface PlanRequirement {
  id: string
  title: string
  description: string
  category: Category
  priority: Priority
  required: boolean
  origin: Origin
  basis: Basis
  status: RequirementStatus
  complexity: RequirementComplexity
  dependsOn: string[]
}

export interface PlanContent {
  schema: 1
  language: 'hu' | 'en' | 'nl'
  sections: Record<Section, { discoveryVersion: number; generatedAt: string }>
  overview: {
    projectName: Fact | null
    projectType: { value: ProjectType | null; origin: Origin | null; confirmed: boolean }
    objective: Fact | null
    problem: Fact | null
    audience: Fact | null
    existingSite: Fact | null
    budget: Fact | null
    timeline: Fact | null
    maintenance: Fact | null
    complexity: Assessment
  }
  requirements: { items: PlanRequirement[]; rejected: number }
  architecture: { area: 'frontend' | 'backend' | 'database' | 'integrations' | 'security' | 'hosting'; code: string; why: string[] }[]
  phases: { code: string; requirementIds: string[] }[]
  risks: { kind: 'missing_info' | 'external_dependency' | 'technical_risk' | 'assumption' | 'decision_needed'; code: string; detail: string[] }[]
  nextSteps: string[]
  notes: Partial<Record<Section, string>>
}

export interface RevisionSummary {
  sections: Section[]
  requirementsAdded: number
  requirementsRemoved: number
  requirementsChanged: number
  complexityFrom: string | null
  complexityTo: string | null
  factsChanged: string[]
}

export interface PlanMeta {
  version: number
  hash: string
  origin: Origin
  reason: string
  summary: RevisionSummary | null
  createdAt: string
}

export interface DiscoveryState {
  exists: boolean
  version: number
  stage: Stage
  progress: StageProgress[]
  type: { value: ProjectType | null; origin: Origin | null; confirmed: boolean }
  facts: Facts
  requirements: Requirement[]
  signals: Signals
  skipped: Stage[]
  notes: Partial<Record<Section, string>>
  complexity: Assessment
  plan: { stale: boolean; staleSections: Section[]; latest: (PlanMeta & { content: PlanContent }) | null; versions: PlanMeta[] }
  missingForPlan: Missing[]
  missingForApproval: Missing[]
  sent: boolean
}

/** What a requirement's priority groups are shown in, most important first. */
export const PRIORITY_ORDER: readonly Priority[] = PRIORITIES

/** An assistant's value that the visitor has not accepted yet. */
export const awaitsConfirmation = (item: { origin: Origin; confirmed: boolean }): boolean => item.origin === 'assistant' && !item.confirmed
