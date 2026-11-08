import { LANGUAGES, type Language } from '../../config.ts'
import { sha256Hex } from '../../lib/crypto.ts'
import { cleanBlock, cleanLine, isRecord } from '../../lib/text.ts'
import type { Brief, BriefQuestion } from '../shop/brief.ts'

/**
 * The project plan a visitor and the assistant build together. It is DATA the server validates and stores per conversation:
 * the assistant proposes changes through a tool, the visitor may edit the same plan in the interface, and what is sent as a
 * quote request is built from this stored plan (never from text the model hands over later). It never contains a price or a
 * delivery date the studio promised: `timeline` and `budgetRange` are what the visitor SAID they would like.
 */

export const COMPLEXITIES = ['simple', 'medium', 'complex', 'unsure'] as const
export type Complexity = (typeof COMPLEXITIES)[number]

/** Every text field with its limit; lists with the number of items and the length of each. */
export const TEXT_FIELDS = {
  projectType: 80,
  businessGoal: 400,
  targetAudience: 300,
  frontend: 300,
  backend: 300,
  database: 300,
  authentication: 200,
  adminDashboard: 300,
  mobile: 200,
  timeline: 200,
  budgetRange: 120,
  overview: 600,
  recommendedSolution: 800,
} as const
export const LIST_FIELDS = {
  requiredFeatures: { items: 20, length: 140 },
  optionalFeatures: { items: 20, length: 140 },
  integrations: { items: 12, length: 100 },
  languages: { items: 6, length: 30 },
  technologyCategories: { items: 10, length: 60 },
  dependencies: { items: 10, length: 160 },
  openQuestions: { items: 10, length: 200 },
  nextSteps: { items: 8, length: 200 },
} as const

export type TextField = keyof typeof TEXT_FIELDS
export type ListField = keyof typeof LIST_FIELDS

export interface ProjectPlan {
  projectType: string
  businessGoal: string
  targetAudience: string
  requiredFeatures: string[]
  optionalFeatures: string[]
  frontend: string
  backend: string
  database: string
  integrations: string[]
  authentication: string
  adminDashboard: string
  languages: string[]
  mobile: string
  complexity: Complexity
  timeline: string
  budgetRange: string
  overview: string
  recommendedSolution: string
  technologyCategories: string[]
  dependencies: string[]
  openQuestions: string[]
  nextSteps: string[]
}

export const emptyPlan = (): ProjectPlan => ({
  projectType: '',
  businessGoal: '',
  targetAudience: '',
  requiredFeatures: [],
  optionalFeatures: [],
  frontend: '',
  backend: '',
  database: '',
  integrations: [],
  authentication: '',
  adminDashboard: '',
  languages: [],
  mobile: '',
  complexity: 'unsure',
  timeline: '',
  budgetRange: '',
  overview: '',
  recommendedSolution: '',
  technologyCategories: [],
  dependencies: [],
  openQuestions: [],
  nextSteps: [],
})

export type PlanErrors = Record<string, 'invalid' | 'tooLong' | 'tooMany'>

/**
 * Reads a partial plan (the fields present in `input`) and returns the cleaned values, or the problems by field. A field that
 * is present replaces the stored one (an empty string or list clears it); a field that is absent is left alone.
 */
export function readPlanChanges(input: unknown): { changes: Partial<ProjectPlan>; errors: PlanErrors } {
  const changes: Partial<ProjectPlan> = {}
  const errors: PlanErrors = {}
  if (!isRecord(input)) return { changes, errors: { plan: 'invalid' } }
  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    if (!(field in input) || input[field] === undefined || input[field] === null) continue
    const raw = input[field]
    if (typeof raw !== 'string') errors[field] = 'invalid'
    else {
      const value = field === 'overview' || field === 'recommendedSolution' ? cleanBlock(raw) : cleanLine(raw)
      if (value.length > max) errors[field] = 'tooLong'
      else (changes as Record<string, unknown>)[field] = value
    }
  }
  for (const [field, rule] of Object.entries(LIST_FIELDS)) {
    if (!(field in input) || input[field] === undefined || input[field] === null) continue
    const raw = input[field]
    if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) errors[field] = 'invalid'
    else {
      const items = [...new Set((raw as string[]).map((item) => cleanLine(item)).filter(Boolean))]
      if (items.length > rule.items) errors[field] = 'tooMany'
      else if (items.some((item) => item.length > rule.length)) errors[field] = 'tooLong'
      else (changes as Record<string, unknown>)[field] = items
    }
  }
  if ('complexity' in input && input.complexity !== undefined && input.complexity !== null) {
    if (typeof input.complexity === 'string' && (COMPLEXITIES as readonly string[]).includes(input.complexity)) changes.complexity = input.complexity as Complexity
    else errors.complexity = 'invalid'
  }
  return { changes, errors }
}

export function readStoredPlan(json: string | null): ProjectPlan | null {
  if (!json) return null
  try {
    const parsed: unknown = JSON.parse(json)
    const { changes, errors } = readPlanChanges(parsed)
    return Object.keys(errors).length === 0 ? { ...emptyPlan(), ...changes } : null
  } catch {
    return null
  }
}

/** What a plan still needs before it can be approved (field names; the interface and the assistant word them). */
export function missingFields(plan: ProjectPlan): string[] {
  const missing: string[] = []
  if (!plan.projectType) missing.push('projectType')
  if (!plan.businessGoal) missing.push('businessGoal')
  if (plan.requiredFeatures.length === 0) missing.push('requiredFeatures')
  if (!plan.overview) missing.push('overview')
  if (!plan.recommendedSolution) missing.push('recommendedSolution')
  return missing
}

export const isReady = (plan: ProjectPlan): boolean => missingFields(plan).length === 0

/** A stable fingerprint of the plan: an approval is for exactly this content. */
export function planHash(plan: ProjectPlan): string {
  const sorted = Object.fromEntries(Object.entries(plan).sort(([a], [b]) => (a < b ? -1 : 1)))
  return sha256Hex(JSON.stringify(sorted)).slice(0, 32)
}

// ---- what the quote request carries ---------------------------------------------------------------------------------

const FIELD_LABELS: Record<keyof ProjectPlan, Record<Language, string>> = {
  projectType: { hu: 'Projekt típusa', en: 'Project type', nl: 'Type project' },
  businessGoal: { hu: 'Üzleti cél', en: 'Business goal', nl: 'Zakelijk doel' },
  targetAudience: { hu: 'Célközönség', en: 'Target audience', nl: 'Doelgroep' },
  requiredFeatures: { hu: 'Szükséges funkciók', en: 'Required features', nl: 'Vereiste functies' },
  optionalFeatures: { hu: 'Opcionális funkciók', en: 'Optional features', nl: 'Optionele functies' },
  frontend: { hu: 'Frontend', en: 'Frontend', nl: 'Frontend' },
  backend: { hu: 'Backend', en: 'Backend', nl: 'Backend' },
  database: { hu: 'Adatbázis', en: 'Database', nl: 'Database' },
  integrations: { hu: 'Integrációk', en: 'Integrations', nl: 'Integraties' },
  authentication: { hu: 'Hitelesítés', en: 'Authentication', nl: 'Authenticatie' },
  adminDashboard: { hu: 'Adminisztrációs felület', en: 'Admin dashboard', nl: 'Beheeromgeving' },
  languages: { hu: 'Nyelvek', en: 'Languages', nl: 'Talen' },
  mobile: { hu: 'Mobil igények', en: 'Mobile requirements', nl: 'Mobiele eisen' },
  complexity: { hu: 'Becsült összetettség', en: 'Estimated complexity', nl: 'Geschatte complexiteit' },
  timeline: { hu: 'Kívánt ütemezés', en: 'Desired timeline', nl: 'Gewenste planning' },
  budgetRange: { hu: 'Költségvetési elképzelés', en: 'Budget in mind', nl: 'Budget in gedachten' },
  overview: { hu: 'Áttekintés', en: 'Overview', nl: 'Overzicht' },
  recommendedSolution: { hu: 'Javasolt megoldás', en: 'Recommended solution', nl: 'Aanbevolen oplossing' },
  technologyCategories: { hu: 'Technológiai kategóriák', en: 'Technology categories', nl: 'Technologiecategorieën' },
  dependencies: { hu: 'Függőségek', en: 'Dependencies', nl: 'Afhankelijkheden' },
  openQuestions: { hu: 'Nyitott kérdések', en: 'Open questions', nl: 'Openstaande vragen' },
  nextSteps: { hu: 'Következő lépések', en: 'Next steps', nl: 'Volgende stappen' },
}

const COMPLEXITY_LABELS: Record<Complexity, Record<Language, string>> = {
  simple: { hu: 'egyszerű', en: 'simple', nl: 'eenvoudig' },
  medium: { hu: 'közepes', en: 'medium', nl: 'gemiddeld' },
  complex: { hu: 'összetett', en: 'complex', nl: 'complex' },
  unsure: { hu: 'még nem eldöntött', en: 'not decided yet', nl: 'nog niet bepaald' },
}

export const planFieldLabel = (field: keyof ProjectPlan, lang: Language): string => FIELD_LABELS[field][lang]

const sameInEveryLanguage = (text: string): Record<Language, string> => Object.fromEntries(LANGUAGES.map((lang) => [lang, text])) as Record<Language, string>

/**
 * The brief stored with the request: one question per filled field, with the title in every language and the answer exactly as
 * the visitor and the assistant wrote it (the visitor's words are not translated). It is the same shape as a FULL EXPERIENCE
 * brief, so the administration and the e-mails already know how to show it.
 */
export function planBrief(plan: ProjectPlan, preferredLanguage: Language): Brief {
  const questions: BriefQuestion[] = []
  for (const field of Object.keys(FIELD_LABELS) as (keyof ProjectPlan)[]) {
    const value = plan[field]
    if (field === 'complexity') {
      questions.push({ id: field, kind: 'single', title: FIELD_LABELS[field], answers: [{ id: plan.complexity, label: COMPLEXITY_LABELS[plan.complexity] }] })
      continue
    }
    if (Array.isArray(value)) {
      if (value.length > 0) questions.push({ id: field, kind: 'multi', title: FIELD_LABELS[field], answers: value.map((item, index) => ({ id: `${field}-${index + 1}`, label: sameInEveryLanguage(item) })) })
    } else if (typeof value === 'string' && value !== '') {
      questions.push({ id: field, kind: 'single', title: FIELD_LABELS[field], answers: [{ id: `${field}-1`, label: sameInEveryLanguage(value) }] })
    }
  }
  return { version: 1, preferredLanguage, questions }
}

/** The request's free-text description: the overview first, then the goal and the required features (limits: 20 to 4000 characters). */
export function planDescription(plan: ProjectPlan, lang: Language): string {
  const lines = [plan.overview, plan.businessGoal && `${FIELD_LABELS.businessGoal[lang]}: ${plan.businessGoal}`, plan.requiredFeatures.length > 0 && `${FIELD_LABELS.requiredFeatures[lang]}: ${plan.requiredFeatures.join('; ')}`]
  const text = lines.filter(Boolean).join('\n\n')
  return text.length > 4000 ? `${text.slice(0, 3990).trimEnd()}…` : text
}
