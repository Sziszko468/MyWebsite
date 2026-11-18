import { cleanBlock, cleanLine, isRecord } from '../../../lib/text.ts'

/**
 * The vocabulary of project discovery (PROMPT 30). Every value here is DATA the server validates: the stages, the project types, the
 * requirement categories, priorities and statuses, the complexity signals, the facts a visitor can state. They are stored and sent as these
 * identifiers (never translated); the website and the quote brief word them in the visitor's language from their own tables.
 *
 * The rules this module encodes, in one place:
 *  - the assistant PROPOSES, the visitor CONFIRMS: anything the assistant writes is `origin: 'assistant'` and unconfirmed;
 *  - a value the visitor wrote or confirmed is never overwritten by the assistant (the write is refused and reported);
 *  - nothing here is a price, a quote or an estimate of hours.
 */

export const STAGES = ['idea', 'type', 'goal', 'audience', 'requirements', 'features', 'infrastructure', 'complexity', 'budget', 'timeline', 'maintenance', 'summary', 'plan'] as const
export type Stage = (typeof STAGES)[number]

/** `other` is "Other / not sure": the visitor can always choose it, and it is always an acceptable answer. */
export const PROJECT_TYPES = ['portfolio', 'business_site', 'ecommerce', 'booking', 'web_app', 'saas', 'dashboard', 'api_backend', 'redesign', 'custom_product', 'other'] as const
export type ProjectType = (typeof PROJECT_TYPES)[number]

export const CATEGORIES = ['content', 'design', 'accounts', 'commerce', 'booking', 'data', 'integration', 'admin', 'communication', 'automation', 'security', 'performance', 'localization', 'other'] as const
export type Category = (typeof CATEGORIES)[number]

export const PRIORITIES = ['essential', 'important', 'optional', 'future'] as const
export type Priority = (typeof PRIORITIES)[number]

export const REQUIREMENT_STATUSES = ['unconfirmed', 'confirmed', 'rejected'] as const
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number]

export const ORIGINS = ['visitor', 'assistant'] as const
export type Origin = (typeof ORIGINS)[number]

export const BASES = ['stated', 'suggested'] as const
export type Basis = (typeof BASES)[number]

export const REQUIREMENT_COMPLEXITIES = ['low', 'medium', 'high'] as const
export type RequirementComplexity = (typeof REQUIREMENT_COMPLEXITIES)[number]

export const MAINTENANCE = ['none', 'occasional', 'ongoing', 'unsure'] as const
export type Maintenance = (typeof MAINTENANCE)[number]

/** The sections of a plan the visitor can add a note to and ask to have regenerated. */
export const SECTIONS = ['overview', 'requirements', 'architecture', 'phases', 'risks', 'next_steps'] as const
export type Section = (typeof SECTIONS)[number]

/** What the visitor can say about the project, one fact each, with the length each may have. `maintenance` is an enumeration, the rest is text. */
export const FACT_LIMITS = { projectName: 80, objective: 400, problem: 400, audience: 300, existingSite: 300, budget: 120, timeline: 200, maintenance: 20 } as const
export const FACT_KEYS = Object.keys(FACT_LIMITS) as (keyof typeof FACT_LIMITS)[]
export type FactKey = keyof typeof FACT_LIMITS

export const LIMITS = {
  title: 100,
  description: 400,
  requirements: 60,
  perCall: 8,
  dependsOn: 5,
  note: 1000,
  planVersions: 40,
} as const

export interface Fact {
  value: string
  origin: Origin
  confirmed: boolean
}
export type Facts = Partial<Record<FactKey, Fact>>

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

// ---- complexity signals -----------------------------------------------------------------------------------------------------------

/** The characteristics the complexity assessment looks at (besides the requirements themselves). Each is an enumeration or a small number. */
export const SIGNAL_VALUES = {
  roles: ['single', 'few', 'many'],
  dataModel: ['simple', 'moderate', 'complex'],
  authentication: ['none', 'basic', 'advanced'],
  adminArea: ['none', 'basic', 'full'],
  automation: ['none', 'some', 'extensive'],
  security: ['standard', 'elevated', 'regulated'],
  scalability: ['standard', 'elevated', 'high'],
} as const
export const SIGNAL_COUNTS = { integrations: [0, 10], thirdParty: [0, 10], languages: [1, 6] } as const
export const SIGNAL_KEYS = [...Object.keys(SIGNAL_VALUES), ...Object.keys(SIGNAL_COUNTS)] as (keyof typeof SIGNAL_VALUES | keyof typeof SIGNAL_COUNTS)[]
export type SignalKey = (typeof SIGNAL_KEYS)[number]

export interface SignalValue {
  value: string | number
  origin: Origin
}
export type Signals = Partial<Record<SignalKey, SignalValue>>

/** Reads the signals the caller sent (a visitor's edit or a tool call): unknown keys and values are errors, never silently dropped. */
export function readSignalInput(input: unknown): { value: Record<string, string | number | null>; errors: Record<string, 'invalid' | 'unknown'> } {
  const value: Record<string, string | number | null> = {}
  const errors: Record<string, 'invalid' | 'unknown'> = {}
  if (!isRecord(input)) return { value, errors: { signals: 'invalid' } }
  for (const [key, raw] of Object.entries(input)) {
    if (raw === undefined) continue
    if (key in SIGNAL_VALUES) {
      if (raw === null) value[key] = null
      else if (typeof raw === 'string' && (SIGNAL_VALUES[key as keyof typeof SIGNAL_VALUES] as readonly string[]).includes(raw)) value[key] = raw
      else errors[key] = 'invalid'
    } else if (key in SIGNAL_COUNTS) {
      const [min, max] = SIGNAL_COUNTS[key as keyof typeof SIGNAL_COUNTS]
      if (raw === null) value[key] = null
      else if (typeof raw === 'number' && Number.isInteger(raw) && raw >= min && raw <= max) value[key] = raw
      else errors[key] = 'invalid'
    } else errors[key] = 'unknown'
  }
  return { value, errors }
}

export function readStoredSignals(json: string | null): Signals {
  if (!json) return {}
  try {
    const parsed: unknown = JSON.parse(json)
    if (!isRecord(parsed)) return {}
    const signals: Signals = {}
    for (const [key, entry] of Object.entries(parsed)) {
      if (!isRecord(entry) || (entry.origin !== 'visitor' && entry.origin !== 'assistant')) continue
      const read = readSignalInput({ [key]: entry.value })
      if (Object.keys(read.errors).length === 0 && read.value[key] !== null && read.value[key] !== undefined) signals[key as SignalKey] = { value: read.value[key] as string | number, origin: entry.origin }
    }
    return signals
  } catch {
    return {}
  }
}

// ---- reading what a caller sent -----------------------------------------------------------------------------------------------------

export type Errors = Record<string, 'required' | 'tooLong' | 'tooShort' | 'tooMany' | 'invalid' | 'unknown' | 'duplicate'>

const oneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value)
export const isStage = (value: unknown): value is Stage => oneOf(STAGES, value)
export const isProjectType = (value: unknown): value is ProjectType => oneOf(PROJECT_TYPES, value)
export const isCategory = (value: unknown): value is Category => oneOf(CATEGORIES, value)
export const isPriority = (value: unknown): value is Priority => oneOf(PRIORITIES, value)
export const isSection = (value: unknown): value is Section => oneOf(SECTIONS, value)
export const isRequirementStatus = (value: unknown): value is RequirementStatus => oneOf(REQUIREMENT_STATUSES, value)
export const isComplexity = (value: unknown): value is RequirementComplexity => oneOf(REQUIREMENT_COMPLEXITIES, value)
export const isMaintenance = (value: unknown): value is Maintenance => oneOf(MAINTENANCE, value)

/** Facts a caller sent: `{ key: text }`, with `null` or an empty text meaning "forget it". Unknown keys, wrong types and over-long texts are errors. */
export function readFactInput(input: unknown): { facts: Partial<Record<FactKey, string | null>>; errors: Errors } {
  const facts: Partial<Record<FactKey, string | null>> = {}
  const errors: Errors = {}
  if (!isRecord(input)) return { facts, errors: { facts: 'invalid' } }
  for (const [key, raw] of Object.entries(input)) {
    if (raw === undefined) continue
    if (!(key in FACT_LIMITS)) {
      errors[key] = 'unknown'
      continue
    }
    if (raw === null) {
      facts[key as FactKey] = null
      continue
    }
    if (typeof raw !== 'string') {
      errors[key] = 'invalid'
      continue
    }
    const text = cleanLine(raw)
    if (text === '') facts[key as FactKey] = null
    else if (text.length > FACT_LIMITS[key as FactKey]) errors[key] = 'tooLong'
    else if (key === 'maintenance' && !isMaintenance(text)) errors[key] = 'invalid'
    else facts[key as FactKey] = text
  }
  return { facts, errors }
}

export interface RequirementInput {
  title: string
  description: string
  category: Category
  priority: Priority
  required: boolean
  complexity: RequirementComplexity
  dependsOn: string[]
}

/** The consistency rule between priority and "required": an essential requirement is required, a future consideration is not. */
export function requiredFor(priority: Priority, asked: boolean | undefined): boolean {
  if (priority === 'essential') return true
  if (priority === 'future') return false
  return asked ?? false
}

/** A whole new requirement: title and category are needed, the rest has a default (medium complexity, important, optional). */
export function readNewRequirement(input: unknown): { value: RequirementInput | null; errors: Errors } {
  const errors: Errors = {}
  if (!isRecord(input)) return { value: null, errors: { requirement: 'invalid' } }
  const title = typeof input.title === 'string' ? cleanLine(input.title) : ''
  if (title === '') errors.title = 'required'
  else if ([...title].length > LIMITS.title) errors.title = 'tooLong'
  const description = input.description === undefined || input.description === null ? '' : typeof input.description === 'string' ? cleanBlock(input.description) : null
  if (description === null) errors.description = 'invalid'
  else if ([...description].length > LIMITS.description) errors.description = 'tooLong'
  const category = input.category === undefined ? 'other' : input.category
  if (!isCategory(category)) errors.category = 'invalid'
  const priority = input.priority === undefined ? 'important' : input.priority
  if (!isPriority(priority)) errors.priority = 'invalid'
  const complexity = input.complexity === undefined ? 'medium' : input.complexity
  if (!isComplexity(complexity)) errors.complexity = 'invalid'
  if (input.required !== undefined && typeof input.required !== 'boolean') errors.required = 'invalid'
  const dependsOn = readIdList(input.dependsOn)
  if (dependsOn === null) errors.dependsOn = 'invalid'
  else if (dependsOn.length > LIMITS.dependsOn) errors.dependsOn = 'tooMany'
  if (Object.keys(errors).length > 0) return { value: null, errors }
  const p = priority as Priority
  return { value: { title, description: description ?? '', category: category as Category, priority: p, required: requiredFor(p, input.required as boolean | undefined), complexity: complexity as RequirementComplexity, dependsOn: dependsOn ?? [] }, errors }
}

/** A change to an existing requirement: only the fields present. */
export interface RequirementPatch {
  title?: string
  description?: string
  category?: Category
  priority?: Priority
  required?: boolean
  complexity?: RequirementComplexity
  dependsOn?: string[]
  status?: RequirementStatus
}

export function readRequirementPatch(input: unknown): { value: RequirementPatch; errors: Errors } {
  const value: RequirementPatch = {}
  const errors: Errors = {}
  if (!isRecord(input)) return { value, errors: { requirement: 'invalid' } }
  if (input.title !== undefined) {
    const title = typeof input.title === 'string' ? cleanLine(input.title) : ''
    if (title === '') errors.title = 'required'
    else if ([...title].length > LIMITS.title) errors.title = 'tooLong'
    else value.title = title
  }
  if (input.description !== undefined) {
    const description = typeof input.description === 'string' ? cleanBlock(input.description) : null
    if (description === null) errors.description = 'invalid'
    else if ([...description].length > LIMITS.description) errors.description = 'tooLong'
    else value.description = description
  }
  if (input.category !== undefined) {
    if (isCategory(input.category)) value.category = input.category
    else errors.category = 'invalid'
  }
  if (input.priority !== undefined) {
    if (isPriority(input.priority)) value.priority = input.priority
    else errors.priority = 'invalid'
  }
  if (input.complexity !== undefined) {
    if (isComplexity(input.complexity)) value.complexity = input.complexity
    else errors.complexity = 'invalid'
  }
  if (input.status !== undefined) {
    if (isRequirementStatus(input.status)) value.status = input.status
    else errors.status = 'invalid'
  }
  if (input.required !== undefined) {
    if (typeof input.required === 'boolean') value.required = input.required
    else errors.required = 'invalid'
  }
  if (input.dependsOn !== undefined) {
    const list = readIdList(input.dependsOn)
    if (list === null) errors.dependsOn = 'invalid'
    else if (list.length > LIMITS.dependsOn) errors.dependsOn = 'tooMany'
    else value.dependsOn = list
  }
  return { value, errors }
}

function readIdList(input: unknown): string[] | null {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input) || input.some((item) => typeof item !== 'string' || item.length > 64)) return null
  return [...new Set(input as string[])]
}

/** A title compared loosely (case, spacing and accents) so a suggestion that repeats a requirement is not added twice. */
export const sameTitle = (a: string, b: string): boolean => normalise(a) === normalise(b)
const normalise = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

/** The reasons a write to a fact, a classification or a signal is refused (reported to the assistant, never thrown at it). */
export type Refusal = 'confirmed_by_visitor' | 'visitor_wrote_it'
