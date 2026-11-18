import type { Language } from '../../../config.ts'
import { sha256Hex } from '../../../lib/crypto.ts'
import type { Brief, BriefQuestion } from '../../shop/brief.ts'
import type { ProjectPlan } from '../plan.ts'
import { assess, legacyComplexity, type Assessment } from './complexity.ts'
import { ARCHITECTURE, CATEGORIES, COMPLEXITY_LEVELS, FACTORS, FACTS, label, MAINTENANCE, NEXT_STEPS, PHASES, PRIORITIES, REASONS, RISKS, RISK_KINDS, SECTIONS as SECTION_LABELS, SIGNALS, STATUSES, TYPES, word } from './labels.ts'
import { SECTIONS, type Basis, type Category, type Fact, type Facts, type Origin, type Priority, type ProjectType, type Requirement, type RequirementComplexity, type RequirementStatus, type Section, type Signals, type Stage } from './model.ts'

/**
 * The project plan generator (PROMPT 30). A plan is built BY RULES from what the visitor said, and it is stored as an immutable, versioned
 * snapshot of CODES and the visitor's own words, never as prose the model wrote: that is what makes it checkable (the same facts give the same
 * plan), safe (nothing the model returns is put into it unvalidated) and translatable (the website words the codes in any language).
 *
 * What a plan is: a proposal for the conversation and for the studio to start from. Its architecture items are PROPOSALS with the reasons they
 * came from, not technical decisions; its phases are a sequence for THIS project, not a schedule; its risks name what is not known, assumed or
 * to be decided. It never contains a price, a delivery date or an estimate of hours, and nothing the visitor has not confirmed is presented
 * as confirmed: every requirement keeps its origin (the visitor's or the assistant's) and its status.
 */

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

export interface ArchitectureItem {
  area: 'frontend' | 'backend' | 'database' | 'integrations' | 'security' | 'hosting'
  code: string
  /** Why this was proposed: codes of `REASONS`. */
  why: string[]
}
export interface Phase {
  code: string
  requirementIds: string[]
}
export interface Risk {
  kind: 'missing_info' | 'external_dependency' | 'technical_risk' | 'assumption' | 'decision_needed'
  code: string
  /** What the risk is about (signal keys, fact keys, a count). */
  detail: string[]
}

export interface PlanContent {
  schema: 1
  language: Language
  /** When and from which version of the working draft each section was made: a section regenerated alone is newer than the rest. */
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
  architecture: ArchitectureItem[]
  phases: Phase[]
  risks: Risk[]
  nextSteps: string[]
  notes: Partial<Record<Section, string>>
}

export interface PlanSource {
  type: ProjectType | null
  typeOrigin: Origin | null
  typeConfirmed: boolean
  facts: Facts
  requirements: readonly Requirement[]
  signals: Signals
  skipped: readonly Stage[]
  notes: Partial<Record<Section, string>>
  language: Language
  discoveryVersion: number
  now: string
}

const PRIORITY_ORDER: Priority[] = ['essential', 'important', 'optional', 'future']
const live = (source: PlanSource) => source.requirements.filter((requirement) => requirement.status !== 'rejected')

// ---- the sections -----------------------------------------------------------------------------------------------------------------

function overviewSection(source: PlanSource): PlanContent['overview'] {
  const f = source.facts
  return {
    projectName: f.projectName ?? null,
    projectType: { value: source.type, origin: source.typeOrigin, confirmed: source.typeConfirmed },
    objective: f.objective ?? null,
    problem: f.problem ?? null,
    audience: f.audience ?? null,
    existingSite: f.existingSite ?? null,
    budget: f.budget ?? null,
    timeline: f.timeline ?? null,
    maintenance: f.maintenance ?? null,
    complexity: assess({ type: source.type, facts: source.facts, requirements: source.requirements, signals: source.signals }),
  }
}

function requirementsSection(source: PlanSource): PlanContent['requirements'] {
  const items = live(source)
    .map<PlanRequirement>((r) => ({ id: r.id, title: r.title, description: r.description, category: r.category, priority: r.priority, required: r.required, origin: r.origin, basis: r.basis, status: r.status, complexity: r.complexity, dependsOn: r.dependsOn }))
    .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority))
  return { items, rejected: source.requirements.length - items.length }
}

const hasValue = (signals: Signals, key: keyof Signals, values: readonly string[]) => values.includes(String(signals[key]?.value))

function architectureSection(source: PlanSource): ArchitectureItem[] {
  const t = source.type
  const categories = new Set(live(source).map((requirement) => requirement.category))
  const s = source.signals
  const accounts = categories.has('accounts') || hasValue(s, 'authentication', ['basic', 'advanced']) || hasValue(s, 'roles', ['few', 'many'])
  const payments = categories.has('commerce') || t === 'ecommerce'
  const admin = categories.has('admin') || hasValue(s, 'adminArea', ['basic', 'full'])
  const booking = categories.has('booking') || t === 'booking'
  const data = categories.has('data') || hasValue(s, 'dataModel', ['moderate', 'complex']) || (t !== null && ['web_app', 'saas', 'dashboard', 'api_backend', 'custom_product'].includes(t))
  const integrations = Math.max(Number(s.integrations?.value ?? 0), live(source).filter((requirement) => requirement.category === 'integration').length)
  const contentOnly = !accounts && !payments && !admin && !data && !booking && (t === null || ['portfolio', 'business_site', 'redesign', 'other'].includes(t))
  const items: ArchitectureItem[] = []
  const reasons = (...codes: (string | false)[]) => codes.filter((code): code is string => code !== false)

  // front end
  if (t === 'api_backend') items.push({ area: 'frontend', code: 'no_frontend', why: ['api_only'] })
  else if (t === 'ecommerce') items.push({ area: 'frontend', code: 'storefront_app', why: ['payments'] })
  else if (contentOnly && t === 'redesign') items.push({ area: 'frontend', code: 'rebuild_frontend', why: ['existing'] })
  else if (contentOnly && t !== 'other' && t !== null) items.push({ area: 'frontend', code: 'static_or_prerendered', why: ['content_site'] })
  else if (t === null || t === 'other') items.push({ area: 'frontend', code: 'frontend_open', why: ['not_known'] })
  else items.push({ area: 'frontend', code: 'app_frontend', why: reasons(accounts && 'accounts', data && 'data', booking && 'accounts') })

  // back end and database
  const backend = t === 'api_backend' ? 'api_service' : accounts || payments || booking || data ? 'application_backend' : contentOnly && (categories.has('communication') || admin) ? 'light_backend' : t === null || t === 'other' ? null : 'no_backend'
  if (backend) items.push({ area: 'backend', code: backend, why: reasons(accounts && 'accounts', payments && 'payments', admin && 'admin_area', data && 'data', backend === 'no_backend' && 'no_accounts', t === 'api_backend' && 'api_only') })
  if (backend && backend !== 'no_backend') {
    const heavy = hasValue(s, 'dataModel', ['complex']) || t === 'saas' || hasValue(s, 'roles', ['many'])
    items.push({ area: 'database', code: heavy ? 'relational_with_migrations' : 'relational_database', why: reasons('data', hasValue(s, 'roles', ['many']) && 'many_roles') })
  } else if (backend === 'no_backend') items.push({ area: 'database', code: 'no_database', why: ['no_accounts'] })

  // integrations
  if (payments) items.push({ area: 'integrations', code: 'payments', why: ['payments'] })
  if (categories.has('communication') || booking) items.push({ area: 'integrations', code: 'email_notifications', why: ['integrations'] })
  if (booking && integrations > 0) items.push({ area: 'integrations', code: 'calendar_sync', why: ['integrations'] })
  if (t === 'ecommerce' && integrations > 0) items.push({ area: 'integrations', code: 'accounting_shipping', why: ['integrations'] })
  else if (integrations > 0) items.push({ area: 'integrations', code: 'third_party_apis', why: ['integrations'] })

  // security
  items.push({ area: 'security', code: 'standard_hardening', why: [] })
  if (accounts) items.push({ area: 'security', code: 'authentication_roles', why: reasons('accounts', hasValue(s, 'roles', ['many']) && 'many_roles') })
  if (payments) items.push({ area: 'security', code: 'payment_review', why: ['payments'] })
  if (hasValue(s, 'security', ['elevated', 'regulated'])) items.push({ area: 'security', code: 'sensitive_data', why: ['sensitive'] })
  if (hasValue(s, 'security', ['regulated'])) items.push({ area: 'security', code: 'regulated_review', why: ['sensitive'] })

  // hosting
  items.push({ area: 'hosting', code: backend && backend !== 'no_backend' ? 'managed_hosting' : 'static_hosting', why: backend && backend !== 'no_backend' ? ['data'] : ['content_site'] })
  if (hasValue(s, 'scalability', ['elevated', 'high'])) items.push({ area: 'hosting', code: 'scalable_hosting', why: ['scalability'] })
  return items
}

function phasesSection(source: PlanSource, assessment: Assessment): Phase[] {
  const requirements = live(source)
  const ids = (priorities: Priority[]) => requirements.filter((requirement) => priorities.includes(requirement.priority)).map((requirement) => requirement.id)
  const architecture = architectureSection(source)
  const hasBackend = architecture.some((item) => item.area === 'backend' && item.code !== 'no_backend')
  const medium = assessment.level === 'medium' || assessment.level === 'large' || assessment.level === 'complex'
  const phases: Phase[] = [{ code: 'discovery_specification', requirementIds: [] }, { code: 'design', requirementIds: [] }]
  if (hasBackend || medium) phases.push({ code: 'technical_foundation', requirementIds: [] })
  if (source.type === 'redesign') phases.push({ code: 'content_migration', requirementIds: [] })
  phases.push({ code: 'core_development', requirementIds: ids(['essential']) })
  const extra = ids(['important', 'optional'])
  if (extra.length > 0) phases.push({ code: 'additional_functionality', requirementIds: extra })
  phases.push({ code: 'testing_optimization', requirementIds: [] }, { code: 'deployment', requirementIds: [] })
  const maintenance = source.facts.maintenance?.value
  if ((maintenance !== undefined && maintenance !== 'none') || medium) phases.push({ code: 'handover_maintenance', requirementIds: [] })
  return phases
}

function risksSection(source: PlanSource, assessment: Assessment): Risk[] {
  const risks: Risk[] = []
  const s = source.signals
  // What is not known: optional answers nobody gave and the visitor did not skip, the existing site of a redesign, the characteristics nobody answered.
  const missing: string[] = []
  for (const key of ['audience', 'timeline', 'budget', 'maintenance'] as const) if (!source.facts[key] && !source.skipped.includes(key)) missing.push(key)
  if (source.type === 'redesign' && !source.facts.existingSite && !source.skipped.includes('infrastructure')) missing.push('existingSite')
  if (source.type !== null && !['portfolio', 'business_site'].includes(source.type)) missing.push(...assessment.unknown)
  if (missing.length > 0) risks.push({ kind: 'missing_info', code: 'missing_facts', detail: [...new Set(missing)] })
  // External dependencies.
  const integrations = Math.max(Number(s.integrations?.value ?? 0), live(source).filter((requirement) => requirement.category === 'integration').length)
  if (integrations > 0 || Number(s.thirdParty?.value ?? 0) > 0) risks.push({ kind: 'external_dependency', code: 'third_party_services', detail: [String(integrations)] })
  if (source.type === 'ecommerce' || live(source).some((requirement) => requirement.category === 'commerce')) risks.push({ kind: 'external_dependency', code: 'payment_provider', detail: [] })
  risks.push({ kind: 'external_dependency', code: 'content_delivery', detail: [] })
  // Technical risks, from the characteristics.
  if (hasValue(s, 'dataModel', ['complex'])) risks.push({ kind: 'technical_risk', code: 'data_model_complex', detail: [] })
  if (hasValue(s, 'security', ['regulated'])) risks.push({ kind: 'technical_risk', code: 'regulated_security', detail: [] })
  if (hasValue(s, 'scalability', ['high'])) risks.push({ kind: 'technical_risk', code: 'scalability_high', detail: [] })
  if (source.type === 'redesign') risks.push({ kind: 'technical_risk', code: 'migration', detail: [] })
  if (hasValue(s, 'roles', ['many'])) risks.push({ kind: 'technical_risk', code: 'many_roles', detail: [] })
  if (hasValue(s, 'automation', ['extensive'])) risks.push({ kind: 'technical_risk', code: 'automation_extensive', detail: [] })
  // Assumptions: what the assistant wrote and the visitor has not confirmed, and what the visitor wished for.
  const unconfirmed = live(source).filter((requirement) => requirement.status === 'unconfirmed')
  if (unconfirmed.length > 0) risks.push({ kind: 'assumption', code: 'unconfirmed_requirements', detail: [String(unconfirmed.length)] })
  const unconfirmedFacts = (Object.entries(source.facts) as [string, Fact][]).filter(([, fact]) => !fact.confirmed).map(([key]) => key)
  if (unconfirmedFacts.length > 0) risks.push({ kind: 'assumption', code: 'unconfirmed_facts', detail: unconfirmedFacts })
  if (source.type !== null && !source.typeConfirmed) risks.push({ kind: 'assumption', code: 'type_unconfirmed', detail: [] })
  if (source.facts.budget) risks.push({ kind: 'assumption', code: 'budget_not_a_promise', detail: [] })
  if (source.facts.timeline) risks.push({ kind: 'assumption', code: 'timeline_not_confirmed', detail: [] })
  // Decisions the visitor has to take.
  risks.push({ kind: 'decision_needed', code: 'design_direction', detail: [] })
  risks.push({ kind: 'decision_needed', code: 'hosting_choice', detail: [] })
  risks.push({ kind: 'decision_needed', code: 'content_ownership', detail: [] })
  return risks
}

function nextStepsSection(risks: Risk[]): string[] {
  const steps: string[] = []
  const has = (code: string) => risks.some((risk) => risk.code === code)
  if (has('unconfirmed_requirements') || has('unconfirmed_facts') || has('type_unconfirmed')) steps.push('review_requirements')
  if (has('missing_facts')) steps.push('answer_open_questions')
  if (risks.some((risk) => risk.kind === 'decision_needed')) steps.push('decide_decisions')
  steps.push('prepare_content', 'send_request', 'studio_reply')
  return steps
}

// ---- the whole plan, or some of its sections ------------------------------------------------------------------------------------------

/**
 * Builds a plan version. `sections` are the sections to (re)make from the working draft; every other section is carried over from `previous`
 * unchanged (so regenerating the architecture never touches what was confirmed in the overview or the requirements). Without a previous
 * version every section is made.
 */
export function generate(source: PlanSource, previous: PlanContent | null, sections: readonly Section[] | 'all'): PlanContent {
  const make = (section: Section) => sections === 'all' || previous === null || sections.includes(section)
  const assessment = (previous !== null && !make('overview') ? previous.overview.complexity : null) ?? assess({ type: source.type, facts: source.facts, requirements: source.requirements, signals: source.signals })
  const risks = make('risks') || previous === null ? risksSection(source, assessment) : previous.risks
  const stamp = (section: Section) => (make(section) ? { discoveryVersion: source.discoveryVersion, generatedAt: source.now } : (previous?.sections[section] ?? { discoveryVersion: source.discoveryVersion, generatedAt: source.now }))
  return {
    schema: 1,
    language: source.language,
    sections: Object.fromEntries(SECTIONS.map((section) => [section, stamp(section)])) as PlanContent['sections'],
    overview: make('overview') ? overviewSection(source) : previous!.overview,
    requirements: make('requirements') ? requirementsSection(source) : previous!.requirements,
    architecture: make('architecture') ? architectureSection(source) : previous!.architecture,
    phases: make('phases') ? phasesSection(source, assessment) : previous!.phases,
    risks,
    nextSteps: make('next_steps') ? nextStepsSection(risks) : previous!.nextSteps,
    notes: { ...source.notes },
  }
}

/** The sections whose snapshot is older than the working draft: what "the plan is out of date" means, section by section. */
export const staleSections = (content: PlanContent, draftVersion: number): Section[] => SECTIONS.filter((section) => content.sections[section].discoveryVersion !== draftVersion)

/** A stable text of the content without its timestamps, for the hash and for "nothing changed". */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => key !== 'generatedAt').sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
export const contentHash = (content: PlanContent): string => sha256Hex(canonical(content)).slice(0, 32)

export interface RevisionSummary {
  /** The sections that were (re)made in this version. */
  sections: Section[]
  requirementsAdded: number
  requirementsRemoved: number
  requirementsChanged: number
  complexityFrom: string | null
  complexityTo: string | null
  /** The facts whose value or confirmation differs from the previous version. */
  factsChanged: string[]
}

export function summarise(previous: PlanContent | null, next: PlanContent, sections: readonly Section[] | 'all'): RevisionSummary {
  const made = sections === 'all' || previous === null ? [...SECTIONS] : [...sections]
  if (previous === null) return { sections: made, requirementsAdded: next.requirements.items.length, requirementsRemoved: 0, requirementsChanged: 0, complexityFrom: null, complexityTo: next.overview.complexity.level, factsChanged: [] }
  const before = new Map(previous.requirements.items.map((item) => [item.id, item]))
  const after = new Map(next.requirements.items.map((item) => [item.id, item]))
  let changed = 0
  for (const [id, item] of after) {
    const old = before.get(id)
    if (old && canonical({ ...old }) !== canonical({ ...item })) changed += 1
  }
  const factKeys = ['projectName', 'objective', 'problem', 'audience', 'existingSite', 'budget', 'timeline', 'maintenance'] as const
  const factsChanged = factKeys.filter((key) => canonical(previous.overview[key]) !== canonical(next.overview[key])).map(String)
  if (canonical(previous.overview.projectType) !== canonical(next.overview.projectType)) factsChanged.push('projectType')
  return {
    sections: made,
    requirementsAdded: [...after.keys()].filter((id) => !before.has(id)).length,
    requirementsRemoved: [...before.keys()].filter((id) => !after.has(id)).length,
    requirementsChanged: changed,
    complexityFrom: previous.overview.complexity.level,
    complexityTo: next.overview.complexity.level,
    factsChanged,
  }
}

// ---- reading a stored plan back ----------------------------------------------------------------------------------------------------

/** A stored plan, or `null` when the JSON is not one (a damaged row never breaks a screen or a quote). */
export function readPlanContent(json: string | null): PlanContent | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as Partial<PlanContent> | null
    if (!raw || raw.schema !== 1 || !raw.overview || !raw.requirements || !Array.isArray(raw.requirements.items) || !Array.isArray(raw.architecture) || !Array.isArray(raw.phases) || !Array.isArray(raw.risks) || !Array.isArray(raw.nextSteps) || !raw.sections) return null
    return raw as PlanContent
  } catch {
    return null
  }
}

// ---- what the existing quote workflow carries ---------------------------------------------------------------------------------------------

const fit = (text: string, max: number): string => ([...text].length <= max ? text : `${[...text].slice(0, max - 1).join('').trimEnd()}…`)
const listFit = (items: string[], count: number, length: number): string[] => [...new Set(items.map((item) => fit(item, length)))].slice(0, count)
const AREA_WORD: Record<ArchitectureItem['area'], 'frontend' | 'backend' | 'database' | 'integrations' | 'security' | 'hosting'> = { frontend: 'frontend', backend: 'backend', database: 'database', integrations: 'integrations', security: 'security', hosting: 'hosting' }

/**
 * The plan in the shape the existing quote workflow already stores and approves (`ProjectPlan`). Nothing is added to the workflow: the
 * discovery plan is PROJECTED into it, together with the version and the hash of the snapshot it came from, so the approval the visitor gives
 * is for exactly that snapshot and the request can carry the full structured plan as its brief.
 */
export function projectToPlan(content: PlanContent, version: number, hash: string, language: Language): ProjectPlan {
  const o = content.overview
  const type = o.projectType.value
  const required = content.requirements.items.filter((item) => item.priority === 'essential' || (item.required && item.priority !== 'future'))
  const optional = content.requirements.items.filter((item) => !required.includes(item))
  const mark = (item: PlanRequirement, extra = ''): string => `${item.title}${item.status === 'unconfirmed' ? ` (${label(STATUSES, 'unconfirmed', language)})` : ''}${extra}`
  const byArea = (area: ArchitectureItem['area']) => content.architecture.filter((item) => item.area === area).map((item) => label(ARCHITECTURE, item.code, language))
  const areasPresent = (Object.keys(AREA_WORD) as ArchitectureItem['area'][]).filter((area) => byArea(area).length > 0)
  const name = o.projectName?.value ?? word('unnamed', language)
  const typeText = type ? label(TYPES, type, language) : label(COMPLEXITY_LEVELS, 'unknown', language)
  const sentence = word('overviewSentence', language).replace('{name}', name).replace('{type}', typeText).replace('{objective}', o.objective?.value ?? o.problem?.value ?? '')
  const unknown = content.risks.find((risk) => risk.code === 'missing_facts')
  return {
    projectType: fit(typeText, 80),
    businessGoal: fit(o.objective?.value ?? o.problem?.value ?? '', 400),
    targetAudience: fit(o.audience?.value ?? '', 300),
    requiredFeatures: listFit(required.map((item) => mark(item)), 20, 140),
    optionalFeatures: listFit(optional.map((item) => mark(item, item.priority === 'future' ? ` (${label(PRIORITIES, 'future', language)})` : '')), 20, 140),
    frontend: fit(byArea('frontend').join('; '), 300),
    backend: fit(byArea('backend').join('; '), 300),
    database: fit(byArea('database').join('; '), 300),
    integrations: listFit(byArea('integrations'), 12, 100),
    authentication: fit(content.architecture.some((item) => item.code === 'authentication_roles') ? label(ARCHITECTURE, 'authentication_roles', language) : '', 200),
    adminDashboard: fit(content.requirements.items.some((item) => item.category === 'admin') ? label(CATEGORIES, 'admin', language) : '', 300),
    languages: [],
    mobile: '',
    complexity: legacyComplexity(o.complexity.level),
    timeline: fit(o.timeline?.value ?? '', 200),
    budgetRange: fit(o.budget?.value ?? '', 120),
    overview: fit(sentence.trim(), 600),
    recommendedSolution: fit(`${word('proposalsLead', language)}${content.architecture.filter((item) => item.area !== 'security').map((item) => label(ARCHITECTURE, item.code, language)).join('; ')}`, 800),
    technologyCategories: areasPresent.map((area) => fit(word(AREA_WORD[area], language), 60)).slice(0, 10),
    dependencies: listFit(content.risks.filter((risk) => risk.kind === 'external_dependency').map((risk) => label(RISKS, risk.code, language)), 10, 160),
    openQuestions: listFit(unknown ? unknown.detail.map((key) => `${label(RISKS, 'missing_facts', language)}: ${FACTS[key] ? label(FACTS, key, language) : label(SIGNALS, key, language)}`) : [], 10, 200),
    nextSteps: listFit(content.nextSteps.map((code) => label(NEXT_STEPS, code, language)), 8, 200),
    discoveryVersion: version,
    discoveryHash: hash,
  }
}

const triOf = (build: (language: Language) => string): Record<Language, string> => ({ hu: build('hu'), en: build('en'), nl: build('nl') })
const same = (text: string): Record<Language, string> => ({ hu: text, en: text, nl: text })

/**
 * The questions the quote request's brief gets from the discovery plan, in the brief's own shape (the administration and the e-mails already
 * show it): the classification, the complexity with the reasons, every requirement under its priority with its origin and status, the
 * architecture as proposals, the phases, the risks, the maintenance wish and a line saying this is a discovery plan and not a quote.
 */
export function briefQuestions(content: PlanContent, version: number): BriefQuestion[] {
  const o = content.overview
  const questions: BriefQuestion[] = []
  const add = (id: string, title: Record<Language, string>, kind: 'single' | 'multi', answers: Record<Language, string>[]) => {
    if (answers.length > 0) questions.push({ id, kind, title, answers: answers.map((labelText, index) => ({ id: `${id}-${index + 1}`, label: labelText })) })
  }
  add('discovery', triOf((l) => word('discoveryPlan', l)), 'single', [triOf((l) => `${word('version', l)} ${version}`)])
  if (o.projectType.value) add('discovery-type', triOf((l) => word('classification', l)), 'single', [TYPES[o.projectType.value]])
  const level = o.complexity.level
  add('discovery-complexity', triOf((l) => word('complexity', l)), 'multi', [
    triOf((l) => `${label(COMPLEXITY_LEVELS, level ?? 'unknown', l)} — ${word('complexityNote', l)}`),
    ...o.complexity.factors.slice(0, 6).map((factor) => triOf((l) => `${label(FACTORS, factor.code, l)}${factor.detail !== null && typeof factor.detail === 'number' ? `: ${factor.detail}` : ''}`)),
  ])
  if (o.maintenance) add('discovery-maintenance', triOf((l) => word('maintenance', l)), 'single', [MAINTENANCE[o.maintenance.value] ?? same(o.maintenance.value)])
  for (const priority of PRIORITY_ORDER) {
    const items = content.requirements.items.filter((item) => item.priority === priority)
    add(`discovery-${priority}`, triOf((l) => word(priority, l)), 'multi', items.map((item) =>
      triOf((l) => `${item.title} [${label(CATEGORIES, item.category, l)}; ${item.origin === 'visitor' ? word('addedByVisitor', l) : item.basis === 'stated' ? word('stated', l) : word('assistantSuggestion', l)}; ${label(STATUSES, item.status, l)}]${item.description ? ` — ${item.description}` : ''}`),
    ))
  }
  add('discovery-architecture', SECTION_LABELS.architecture, 'multi', content.architecture.map((item) => triOf((l) => `${label(ARCHITECTURE, item.code, l)} (${word('proposal', l)})`)))
  add('discovery-phases', SECTION_LABELS.phases, 'multi', content.phases.map((phase) => PHASES[phase.code] ?? same(phase.code)))
  add('discovery-risks', SECTION_LABELS.risks, 'multi', content.risks.map((risk) => triOf((l) => `${label(RISK_KINDS, risk.kind, l)}: ${label(RISKS, risk.code, l)}`)))
  const notes = Object.entries(content.notes).filter(([, note]) => note)
  add('discovery-notes', triOf((l) => word('notes', l)), 'multi', notes.map(([section, note]) => triOf((l) => `${label(SECTION_LABELS, section, l)}: ${note}`)))
  return questions
}

/** A brief with the discovery questions appended to the plan's own. */
export const withDiscovery = (brief: Brief, content: PlanContent, version: number): Brief => ({ ...brief, questions: [...brief.questions, ...briefQuestions(content, version)] })

// kept for the checks that every code a plan can contain has a label
export const ALL_CODES = { ARCHITECTURE, PHASES, RISKS, NEXT_STEPS, REASONS, SIGNALS }
