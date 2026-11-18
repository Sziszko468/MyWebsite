import { STAGES, type Facts, type ProjectType, type Requirement, type Signals, type Stage } from './model.ts'

/**
 * The discovery STATE MACHINE (PROMPT 30). The stages are the thirteen of the brief, in order, and the server owns the order:
 *
 *  - which stages APPLY depends on the project type (a portfolio is not asked about scalability; a redesign must say what exists now);
 *  - a stage is DONE when what it asks for is recorded, or when the visitor SKIPPED it (only optional stages can be skipped);
 *  - the CURRENT stage is the first applicable stage that is neither done nor skipped, so the conversation moves on by itself when the visitor
 *    has answered, never asks again what is known, and can stop as soon as enough is known;
 *  - `summary` is current when every question stage is finished and no plan exists yet, `plan` when the plan is out of date.
 *
 * The assistant does not move the machine by saying so: it records facts, requirements and signals through its tools, and the stage follows.
 * It may skip an optional stage the visitor declined, or ask to revisit one.
 */

export interface StageState {
  type: ProjectType | null
  facts: Facts
  requirements: readonly Requirement[]
  signals: Signals
  skipped: readonly Stage[]
  hasPlan: boolean
  planStale: boolean
}

export type StageStatus = 'done' | 'current' | 'todo' | 'skipped' | 'not_applicable'
export interface StageProgress {
  stage: Stage
  status: StageStatus
  /** A stage the visitor may skip (every stage whose answer is optional). */
  skippable: boolean
}

/** The project types that do not need the complexity questions: their assessment is made from what the visitor lists, without asking. */
const SIMPLE_TYPES: readonly ProjectType[] = ['portfolio', 'business_site']

/** The stages that do not apply to a type. `idea`, `type`, `goal`, `requirements`, `summary` and `plan` always apply. */
function notApplicable(type: ProjectType | null): Stage[] {
  if (type !== null && SIMPLE_TYPES.includes(type)) return ['complexity']
  return []
}

/** The stages whose answer is optional and so can be skipped; the rest are needed before a plan can be made. */
export const SKIPPABLE_STAGES = ['audience', 'features', 'infrastructure', 'complexity', 'budget', 'timeline', 'maintenance'] as const satisfies readonly Stage[]
const SKIPPABLE: readonly Stage[] = SKIPPABLE_STAGES

export const isSkippable = (stage: Stage): boolean => SKIPPABLE.includes(stage)

/** The stages without which no plan can be made. */
const NEEDED: readonly Stage[] = ['idea', 'type', 'goal', 'requirements']

const live = (state: StageState) => state.requirements.filter((requirement) => requirement.status !== 'rejected')

/** Whether the stage's own question is answered (not counting a skip). */
function answered(stage: Stage, state: StageState): boolean {
  const facts = state.facts
  switch (stage) {
    case 'idea':
      return state.type !== null || Object.keys(facts).length > 0 || state.requirements.length > 0
    case 'type':
      return state.type !== null
    case 'goal':
      return Boolean(facts.objective || facts.problem)
    case 'audience':
      return Boolean(facts.audience)
    case 'requirements':
      return live(state).length > 0
    case 'features':
      return live(state).some((requirement) => requirement.priority !== 'essential')
    case 'infrastructure':
      return Boolean(facts.existingSite)
    case 'complexity':
      return Object.keys(state.signals).length >= 3
    case 'budget':
      return Boolean(facts.budget)
    case 'timeline':
      return Boolean(facts.timeline)
    case 'maintenance':
      return Boolean(facts.maintenance)
    case 'summary':
      return state.hasPlan
    case 'plan':
      return state.hasPlan && !state.planStale
  }
}

export function progress(state: StageState): StageProgress[] {
  const out = notApplicable(state.type)
  const result: StageProgress[] = []
  let currentFound = false
  for (const stage of STAGES) {
    const skippable = SKIPPABLE.includes(stage)
    if (out.includes(stage)) {
      result.push({ stage, status: 'not_applicable', skippable })
      continue
    }
    if (stage === 'summary' || stage === 'plan') {
      // Without a plan, every question stage must be finished (done or skipped) before the summary is current; with one, only the needed stages must be done.
      const questionsDone = state.hasPlan ? result.filter((item) => NEEDED.includes(item.stage)).every((item) => item.status === 'done') : result.every((item) => item.status !== 'current' && item.status !== 'todo')
      const done = answered(stage, state)
      const status: StageStatus = done ? 'done' : !currentFound && questionsDone && (stage === 'summary' ? !state.hasPlan : state.hasPlan) ? 'current' : 'todo'
      if (status === 'current') currentFound = true
      result.push({ stage, status, skippable: false })
      continue
    }
    if (answered(stage, state)) result.push({ stage, status: 'done', skippable })
    else if (skippable && state.skipped.includes(stage)) result.push({ stage, status: 'skipped', skippable })
    // Once a plan exists the visitor has chosen to look at it: optional questions that were never answered stay open ("todo") but no longer hold the conversation back.
    else if (skippable && state.hasPlan) result.push({ stage, status: 'todo', skippable })
    else if (!currentFound) {
      currentFound = true
      result.push({ stage, status: 'current', skippable })
    } else result.push({ stage, status: 'todo', skippable })
  }
  return result
}

export const currentStage = (state: StageState): Stage => progress(state).find((item) => item.status === 'current')?.stage ?? (state.hasPlan ? 'plan' : 'summary')

// ---- what is missing --------------------------------------------------------------------------------------------------------------

export type Missing = 'projectType' | 'objective' | 'requirements' | 'confirmedRequirement' | 'plan' | 'planStale'

/** What must exist before a plan version can be made. */
export function missingForPlan(state: StageState): Missing[] {
  const missing: Missing[] = []
  if (state.type === null) missing.push('projectType')
  if (!state.facts.objective && !state.facts.problem) missing.push('objective')
  if (live(state).length === 0) missing.push('requirements')
  return missing
}

/** What must be true before the plan can be approved for sending: a plan that is up to date and at least one requirement the visitor confirmed. */
export function missingForApproval(state: StageState): Missing[] {
  const missing = missingForPlan(state)
  if (!state.hasPlan) missing.push('plan')
  else if (state.planStale) missing.push('planStale')
  // At least one core requirement (essential, or required) that the visitor themselves confirmed: a plan made only of the assistant's suggestions is not sent.
  if (!state.requirements.some((requirement) => requirement.status === 'confirmed' && (requirement.priority === 'essential' || requirement.required))) missing.push('confirmedRequirement')
  return missing
}

// ---- what to ask about ------------------------------------------------------------------------------------------------------------

/**
 * Topics worth asking about, per project type, as short hints for the MODEL (these words are instructions to the assistant, not interface
 * text: it asks in the visitor's language and one question at a time). They are suggestions that adapt the sequence, not a questionnaire:
 * the assistant asks about the one that matters most for what it has heard and skips what the visitor already told it.
 */
const TOPICS: Record<ProjectType | 'default', string[]> = {
  portfolio: ['what to show (work, about, contact)', 'the look and feel they like', 'languages of the site'],
  business_site: ['the services or products to present', 'how visitors should get in touch', 'content that exists already', 'languages of the site'],
  ecommerce: ['products and how many', 'checkout and payment methods', 'stock and inventory', 'shipping and taxes', 'integrations (accounting, shipping, marketing)'],
  booking: ['what is booked (services, resources, people)', 'availability and opening hours', 'customer accounts and management', 'notifications and reminders', 'payments or deposits'],
  web_app: ['the main workflows', 'who uses it and with which roles', 'what data it keeps', 'integrations with other systems'],
  saas: ['users, teams and roles', 'plans and subscriptions', 'dashboards and reports', 'how many users it should grow to'],
  dashboard: ['the data sources', 'who sees what (roles and permissions)', 'the reports and charts', 'refresh and export needs'],
  api_backend: ['who or what will call the API', 'the main resources and operations', 'authentication', 'documentation and versioning'],
  redesign: ['the current site or application and its address', 'what does not work today', 'what should change', 'content and data to migrate', 'the search ranking to keep'],
  custom_product: ['the core idea in one sentence', 'the first users', 'what makes it different', 'platforms (web, mobile)'],
  other: ['what they would like to achieve', 'who it is for', 'whether they have something already'],
  default: ['what they would like to achieve', 'who it is for'],
}

const GUIDANCE: Record<Stage, string> = {
  idea: 'Let the visitor describe the idea in their own words. Do not start a questionnaire; reflect what you heard in one sentence.',
  type: 'Work out what kind of project this is and record it with classifyProjectType. If it is not clear, ask in plain words; "other / not sure" is always an acceptable answer.',
  goal: 'Ask what problem the project should solve and what success looks like.',
  audience: 'Ask who will use it. Optional: the visitor may skip it.',
  requirements: 'Collect the essential features, one at a time, as requirements (extractProjectRequirements). Only record what the visitor said; mark your own ideas as suggestions.',
  features: 'Ask what would be useful but is not essential, and offer ONE or TWO relevant suggestions, clearly as suggestions. Optional.',
  infrastructure: 'Ask whether a website or application exists already and what is wrong with it. Optional unless this is a redesign.',
  complexity: 'Ask about the few characteristics that drive the scope (roles, integrations, sign-in, admin area, languages, sensitive data), only those not yet known. Record them with assessProjectComplexity. Optional.',
  budget: 'Ask ONLY if the visitor wants to share a budget idea; it is optional and not a promise. Never suggest a number.',
  timeline: 'Ask when they would like to launch; optional.',
  maintenance: 'Ask whether they will need ongoing maintenance and support after launch; optional.',
  summary: 'Summarise what you know in a few lines, separating what the visitor confirmed from your assumptions and suggestions, then offer to generate the plan (generateProjectPlan).',
  plan: 'The plan is out of date because something changed. Offer to regenerate it (generateProjectPlan or reviseProjectPlan), keeping what the visitor confirmed.',
}

export interface Guidance {
  stage: Stage
  instruction: string
  topics: string[]
}

export function guidance(state: StageState): Guidance {
  const stage = currentStage(state)
  const topics = stage === 'requirements' || stage === 'features' || stage === 'complexity' || stage === 'infrastructure' ? (TOPICS[state.type ?? 'default'] ?? TOPICS.default) : []
  return { stage, instruction: GUIDANCE[stage], topics: topics.slice(0, 5) }
}
