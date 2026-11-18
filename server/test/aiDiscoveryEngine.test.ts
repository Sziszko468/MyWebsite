import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Database } from '../src/db/database.ts'
import { MIGRATIONS_DIRECTORY, migrate } from '../src/db/migrate.ts'
import { assess, LEVELS, THRESHOLDS } from '../src/modules/ai/discovery/complexity.ts'
import * as labels from '../src/modules/ai/discovery/labels.ts'
import { CATEGORIES, FACT_LIMITS, PRIORITIES, PROJECT_TYPES, readFactInput, readNewRequirement, readRequirementPatch, readSignalInput, requiredFor, SECTIONS, SIGNAL_VALUES, STAGES, type Facts, type Requirement, type Signals } from '../src/modules/ai/discovery/model.ts'
import { ALL_CODES, briefQuestions, contentHash, generate, projectToPlan, staleSections, summarise, type PlanSource } from '../src/modules/ai/discovery/planner.ts'
import { currentStage, guidance, missingForApproval, missingForPlan, progress, type StageState } from '../src/modules/ai/discovery/stages.ts'
import { readPlanChanges } from '../src/modules/ai/plan.ts'
import { TestClock } from './helpers.ts'

/**
 * Project discovery's rule engines, without a server: the complexity assessment, the stage machine, the plan generator and the words.
 * What they must show: the same facts always give the same result, the result can be explained, nothing in it is a price or an estimate,
 * a suggestion is never a confirmed requirement, and every code a plan can hold has a label in all three languages.
 */

let counter = 0
const requirement = (over: Partial<Requirement> = {}): Requirement => ({
  id: `00000000-0000-4000-8000-${String(counter++).padStart(12, '0')}`,
  position: counter,
  title: `Requirement ${counter}`,
  description: '',
  category: 'content',
  priority: 'essential',
  required: true,
  origin: 'visitor',
  basis: 'stated',
  status: 'confirmed',
  complexity: 'medium',
  dependsOn: [],
  createdAt: '2026-11-18T10:00:00.000Z',
  updatedAt: '2026-11-18T10:00:00.000Z',
  ...over,
})
const fact = (value: string, origin: 'visitor' | 'assistant' = 'visitor', confirmed = true) => ({ value, origin, confirmed })
const signals = (input: Record<string, string | number>): Signals => Object.fromEntries(Object.entries(input).map(([key, value]) => [key, { value, origin: 'visitor' as const }])) as Signals

describe('the complexity assessment', () => {
  it('is a transparent sum of named factors: the same facts always give the same level, and every point can be traced', () => {
    const input = { type: 'ecommerce' as const, facts: {}, requirements: [requirement({ category: 'commerce' }), requirement({ category: 'accounts' }), requirement({ category: 'integration' })], signals: signals({ roles: 'few', authentication: 'basic', adminArea: 'full' }) }
    const a = assess(input)
    const b = assess(input)
    expect(a).toEqual(b)
    expect(a.score).toBe(a.factors.reduce((sum, factor) => sum + factor.points, 0))
    expect(a.factors.every((factor) => factor.points > 0)).toBe(true)
    expect(a.factors.map((factor) => factor.code)).toContain('project_type')
    expect(a.notAnEstimate).toBe(true)
    // It says what it does not know instead of guessing.
    expect(a.unknown).toEqual(expect.arrayContaining(['dataModel', 'automation', 'security', 'scalability']))
  })

  it('does not give a small project enterprise weight, and gives a large one its due', () => {
    const portfolio = assess({ type: 'portfolio', facts: {}, requirements: [requirement({ category: 'content' }), requirement({ category: 'design' })], signals: {} })
    expect(portfolio.level).toBe('small')
    const saas = assess({
      type: 'saas',
      facts: {},
      requirements: ['accounts', 'commerce', 'data', 'integration', 'admin', 'automation', 'security', 'performance'].map((category) => requirement({ category: category as never, complexity: 'high' })),
      signals: signals({ roles: 'many', dataModel: 'complex', authentication: 'advanced', adminArea: 'full', automation: 'extensive', security: 'elevated', scalability: 'elevated', integrations: 5, languages: 3 }),
    })
    expect(saas.level).toBe('complex')
    expect(LEVELS.indexOf(saas.level!)).toBeGreaterThan(LEVELS.indexOf(portfolio.level!))
  })

  it('knows when it does not know: no type and no requirement is "not enough information", never a level', () => {
    expect(assess({ type: null, facts: {}, requirements: [], signals: {} }).level).toBeNull()
    expect(assess({ type: 'other', facts: {}, requirements: [], signals: {} }).level).toBe('small')
  })

  it('applies floors that it reports: regulated data or a high load makes a project at least large, a SaaS at least medium', () => {
    const regulated = assess({ type: 'portfolio', facts: {}, requirements: [requirement()], signals: signals({ security: 'regulated' }) })
    expect(regulated.level).toBe('large')
    expect(regulated.raisedFrom).toBe('small')
    expect(assess({ type: 'saas', facts: {}, requirements: [], signals: {} }).level).toBe('medium')
  })

  it('counts a rejected requirement and a future consideration for nothing, and its thresholds are the published ones', () => {
    const base = { type: 'business_site' as const, facts: {}, signals: {} }
    const live = assess({ ...base, requirements: [requirement({ category: 'content' })] })
    const more = assess({ ...base, requirements: [requirement({ category: 'content' }), requirement({ category: 'commerce', status: 'rejected' }), requirement({ category: 'data', priority: 'future', required: false })] })
    expect(more.score).toBe(live.score)
    expect(live.thresholds).toEqual(THRESHOLDS)
  })

  it('never produces a price, an hour count or a currency: the result has no such field and no such word', () => {
    const result = assess({ type: 'saas', facts: {}, requirements: [requirement()], signals: signals({ roles: 'many' }) })
    expect(JSON.stringify(result)).not.toMatch(/price|cost|hours|eur|usd|huf|€|\$/i)
  })
})

describe('the complexity thresholds, exactly', () => {
  // No requirements: the score is the type plus the characteristics, so each boundary is hit on the point.
  const at = (type: Parameters<typeof assess>[0]['type'], values: Record<string, string | number>) => assess({ type, facts: {}, requirements: [], signals: signals(values) })

  it('is small up to 5 points, medium from 6, large from 14 and complex from 25 (the thresholds the visitor is shown)', () => {
    expect(THRESHOLDS).toEqual({ medium: 6, large: 14, complex: 25 })
    // booking 4 + basic sign-in 1
    expect(at('booking', { authentication: 'basic' })).toMatchObject({ score: 5, level: 'small' })
    // booking 4 + a few roles 2
    expect(at('booking', { roles: 'few' })).toMatchObject({ score: 6, level: 'medium' })
    // web application 5 + many roles 5 + moderate data 2 + basic sign-in 1
    expect(at('web_app', { roles: 'many', dataModel: 'moderate', authentication: 'basic' })).toMatchObject({ score: 13, level: 'medium' })
    // ... + a basic admin area 1
    expect(at('web_app', { roles: 'many', dataModel: 'moderate', authentication: 'basic', adminArea: 'basic' })).toMatchObject({ score: 14, level: 'large' })
    // SaaS 8 + many roles 5 + complex data 5 + advanced sign-in 3 + a full admin area 3
    expect(at('saas', { roles: 'many', dataModel: 'complex', authentication: 'advanced', adminArea: 'full' })).toMatchObject({ score: 24, level: 'large' })
    // ... + some automation 1
    expect(at('saas', { roles: 'many', dataModel: 'complex', authentication: 'advanced', adminArea: 'full', automation: 'some' })).toMatchObject({ score: 25, level: 'complex' })
  })
})

describe('the discovery stage machine', () => {
  const empty: StageState = { type: null, facts: {}, requirements: [], signals: {}, skipped: [], hasPlan: false, planStale: true }
  const stateOf = (over: Partial<StageState>): StageState => ({ ...empty, ...over })

  it('starts with the idea, moves on by itself as things are recorded, and never asks again what is known', () => {
    expect(currentStage(empty)).toBe('idea')
    expect(currentStage(stateOf({ facts: { objective: fact('Sell candles') } }))).toBe('type')
    expect(currentStage(stateOf({ type: 'ecommerce', facts: { objective: fact('Sell candles') } }))).toBe('audience')
    expect(currentStage(stateOf({ type: 'ecommerce', facts: { objective: fact('Sell candles'), audience: fact('Gift buyers') } }))).toBe('requirements')
    expect(currentStage(stateOf({ type: 'ecommerce', facts: { objective: fact('x'), audience: fact('y') }, requirements: [requirement()] }))).toBe('features')
  })

  it('adapts to the project: a portfolio is not asked the complexity questions, a redesign is asked about what exists', () => {
    const portfolio = progress(stateOf({ type: 'portfolio' }))
    expect(portfolio.find((item) => item.stage === 'complexity')?.status).toBe('not_applicable')
    expect(progress(stateOf({ type: 'saas' })).find((item) => item.stage === 'complexity')?.status).not.toBe('not_applicable')
    const redesign = guidance(stateOf({ type: 'redesign', facts: { objective: fact('x'), audience: fact('y') }, requirements: [requirement(), requirement({ priority: 'important', required: false })] }))
    expect(redesign.stage).toBe('infrastructure')
    expect(redesign.topics.join(' ')).toMatch(/current site/i)
    const shop = guidance(stateOf({ type: 'ecommerce', facts: { objective: fact('x'), audience: fact('y') }, requirements: [requirement()] }))
    expect(shop.topics.join(' ')).toMatch(/checkout|inventory|stock/i)
    const booking = guidance(stateOf({ type: 'booking', facts: { objective: fact('x'), audience: fact('y') }, requirements: [requirement()] }))
    expect(booking.topics.join(' ')).toMatch(/availability|scheduling/i)
    const saas = guidance(stateOf({ type: 'saas', facts: { objective: fact('x'), audience: fact('y') }, requirements: [requirement()] }))
    expect(saas.topics.join(' ')).toMatch(/roles|subscriptions|dashboards/i)
  })

  it('lets the visitor skip an optional stage, and only an optional one', () => {
    const base = stateOf({ type: 'saas', facts: { objective: fact('x') }, skipped: ['audience'] })
    const items = progress(base)
    expect(items.find((item) => item.stage === 'audience')?.status).toBe('skipped')
    expect(currentStage(base)).toBe('requirements')
    // A stage that is needed cannot be skipped: the list says which can.
    expect(items.filter((item) => item.skippable).map((item) => item.stage)).toEqual(['audience', 'features', 'infrastructure', 'complexity', 'budget', 'timeline', 'maintenance'])
  })

  it('reaches the summary when every question is answered or skipped, and the plan stage only when a plan is out of date', () => {
    const answered: StageState = {
      type: 'business_site',
      facts: { objective: fact('x'), audience: fact('y'), existingSite: fact('z'), budget: fact('b'), timeline: fact('t'), maintenance: fact('occasional') },
      requirements: [requirement(), requirement({ priority: 'optional', required: false })],
      signals: {},
      skipped: [],
      hasPlan: false,
      planStale: true,
    }
    expect(currentStage(answered)).toBe('summary')
    expect(currentStage({ ...answered, hasPlan: true, planStale: false })).toBe('plan')
    expect(progress({ ...answered, hasPlan: true, planStale: false }).every((item) => item.status === 'done' || item.status === 'not_applicable')).toBe(true)
    expect(currentStage({ ...answered, hasPlan: true, planStale: true })).toBe('plan')
  })

  it('says what a plan needs and what an approval needs, separately', () => {
    expect(missingForPlan(empty)).toEqual(['projectType', 'objective', 'requirements'])
    const ready = stateOf({ type: 'other', facts: { problem: fact('x') }, requirements: [requirement({ status: 'unconfirmed', origin: 'assistant' })] })
    expect(missingForPlan(ready)).toEqual([])
    expect(missingForApproval(ready)).toEqual(['plan', 'confirmedRequirement'])
    expect(missingForApproval({ ...ready, hasPlan: true, planStale: true })).toEqual(['planStale', 'confirmedRequirement'])
    expect(missingForApproval({ ...ready, hasPlan: true, planStale: false, requirements: [requirement()] })).toEqual([])
  })

  it('has exactly the thirteen stages of the brief, in order', () => {
    expect(STAGES).toEqual(['idea', 'type', 'goal', 'audience', 'requirements', 'features', 'infrastructure', 'complexity', 'budget', 'timeline', 'maintenance', 'summary', 'plan'])
    expect(PROJECT_TYPES).toHaveLength(11)
    expect(PROJECT_TYPES).toContain('other')
  })
})

describe('what a caller may send', () => {
  it('reads facts strictly: unknown keys, wrong types, over-long texts and a maintenance value that is not one are errors; an empty text forgets', () => {
    expect(readFactInput({ objective: 'Sell candles', audience: '  ' })).toMatchObject({ facts: { objective: 'Sell candles', audience: null }, errors: {} })
    expect(readFactInput({ colour: 'red' }).errors).toEqual({ colour: 'unknown' })
    expect(readFactInput({ objective: 42 }).errors).toEqual({ objective: 'invalid' })
    expect(readFactInput({ objective: 'x'.repeat(FACT_LIMITS.objective + 1) }).errors).toEqual({ objective: 'tooLong' })
    expect(readFactInput({ maintenance: 'forever' }).errors).toEqual({ maintenance: 'invalid' })
    expect(readFactInput({ maintenance: 'ongoing' }).facts).toEqual({ maintenance: 'ongoing' })
    expect(readFactInput('x').errors).toEqual({ facts: 'invalid' })
  })

  it('reads a requirement strictly and keeps priority and "required" consistent', () => {
    expect(readNewRequirement({ title: 'Booking calendar', category: 'booking', priority: 'essential' }).value).toMatchObject({ required: true, complexity: 'medium', description: '' })
    expect(readNewRequirement({ title: 'Blog', priority: 'future', required: true }).value?.required).toBe(false)
    expect(readNewRequirement({ title: 'Chat', priority: 'optional', required: true }).value?.required).toBe(true)
    expect(readNewRequirement({ title: '' }).errors).toEqual({ title: 'required' })
    expect(readNewRequirement({ title: 'x', category: 'weapons' }).errors).toEqual({ category: 'invalid' })
    expect(readNewRequirement({ title: 'x'.repeat(101) }).errors).toEqual({ title: 'tooLong' })
    expect(readNewRequirement({ title: 'x', dependsOn: ['a', 'b', 'c', 'd', 'e', 'f'] }).errors).toEqual({ dependsOn: 'tooMany' })
    expect(readNewRequirement({ title: 'x', priority: 'urgent' }).errors).toEqual({ priority: 'invalid' })
    expect(requiredFor('essential', false)).toBe(true)
    expect(requiredFor('future', true)).toBe(false)
    expect(readRequirementPatch({ status: 'confirmed', priority: 'optional' }).value).toEqual({ status: 'confirmed', priority: 'optional' })
    expect(readRequirementPatch({ status: 'maybe' }).errors).toEqual({ status: 'invalid' })
  })

  it('reads the complexity signals strictly', () => {
    expect(readSignalInput({ roles: 'few', integrations: 3, languages: 2 })).toMatchObject({ value: { roles: 'few', integrations: 3, languages: 2 }, errors: {} })
    expect(readSignalInput({ roles: 'everyone' }).errors).toEqual({ roles: 'invalid' })
    expect(readSignalInput({ integrations: 11 }).errors).toEqual({ integrations: 'invalid' })
    expect(readSignalInput({ languages: 0 }).errors).toEqual({ languages: 'invalid' })
    expect(readSignalInput({ madeUp: 1 }).errors).toEqual({ madeUp: 'unknown' })
    expect(Object.keys(SIGNAL_VALUES)).toContain('security')
  })
})

const source = (over: Partial<PlanSource> = {}): PlanSource => ({
  type: 'booking',
  typeOrigin: 'visitor',
  typeConfirmed: true,
  facts: { projectName: fact('Studio Booker'), objective: fact('Let clients book classes online'), audience: fact('Yoga students'), timeline: fact('before September', 'assistant', false), budget: fact('around a modest amount'), maintenance: fact('ongoing') } satisfies Facts,
  requirements: [
    requirement({ id: 'a0000000-0000-4000-8000-000000000001', title: 'Class calendar', category: 'booking', priority: 'essential' }),
    requirement({ id: 'a0000000-0000-4000-8000-000000000002', title: 'Customer accounts', category: 'accounts', priority: 'essential' }),
    requirement({ id: 'a0000000-0000-4000-8000-000000000003', title: 'Email reminders', category: 'communication', priority: 'important', required: false, origin: 'assistant', basis: 'suggested', status: 'unconfirmed' }),
    requirement({ id: 'a0000000-0000-4000-8000-000000000004', title: 'Gift cards', category: 'commerce', priority: 'future', required: false }),
    requirement({ id: 'a0000000-0000-4000-8000-000000000005', title: 'Mobile app', category: 'other', priority: 'optional', required: false, status: 'rejected' }),
  ],
  signals: signals({ roles: 'few', authentication: 'basic', adminArea: 'basic' }),
  skipped: [],
  notes: { architecture: 'We already pay for a hosting plan.' },
  language: 'en',
  discoveryVersion: 7,
  now: '2026-11-18T10:00:00.000Z',
  ...over,
})

describe('the plan generator', () => {
  it('builds every section of the brief from the facts and requirements: overview, requirements, architecture, phases, risks, next steps', () => {
    const plan = generate(source(), null, 'all')
    expect(plan.overview.projectName?.value).toBe('Studio Booker')
    expect(plan.overview.complexity.level).not.toBeNull()
    expect(plan.requirements.items.map((item) => item.title)).toEqual(['Class calendar', 'Customer accounts', 'Email reminders', 'Gift cards'])
    expect(plan.requirements.rejected).toBe(1)
    expect(plan.architecture.map((item) => item.area)).toEqual(expect.arrayContaining(['frontend', 'backend', 'database', 'security', 'hosting']))
    expect(plan.phases.map((phase) => phase.code)).toEqual(expect.arrayContaining(['discovery_specification', 'design', 'core_development', 'testing_optimization', 'deployment']))
    expect(plan.phases.find((phase) => phase.code === 'core_development')?.requirementIds).toHaveLength(2)
    expect(plan.risks.some((risk) => risk.kind === 'assumption')).toBe(true)
    expect(plan.nextSteps).toEqual(expect.arrayContaining(['review_requirements', 'send_request', 'studio_reply']))
    expect(Object.keys(plan.sections)).toEqual([...SECTIONS])
  })

  it('keeps the visitor\'s words and the origin and status of every requirement: a suggestion is never presented as confirmed', () => {
    const plan = generate(source(), null, 'all')
    const reminders = plan.requirements.items.find((item) => item.title === 'Email reminders')!
    expect(reminders).toMatchObject({ origin: 'assistant', basis: 'suggested', status: 'unconfirmed' })
    expect(plan.overview.timeline).toMatchObject({ origin: 'assistant', confirmed: false })
    expect(plan.risks.find((risk) => risk.code === 'unconfirmed_requirements')?.detail).toEqual(['1'])
    expect(plan.risks.find((risk) => risk.code === 'unconfirmed_facts')?.detail).toEqual(['timeline'])
    // The projection into the quote workflow marks the unconfirmed one in words.
    const projected = projectToPlan(plan, 1, contentHash(plan), 'en')
    expect(projected.optionalFeatures.some((item) => /Email reminders.*not yet confirmed/.test(item))).toBe(true)
    expect(projected.requiredFeatures).toEqual(['Class calendar', 'Customer accounts'])
  })

  it('proposes an architecture that follows the project, and labels every item a proposal with its reasons', () => {
    const shop = generate(source({ type: 'ecommerce', requirements: [requirement({ category: 'commerce' })], signals: signals({ roles: 'single' }) }), null, 'all')
    expect(shop.architecture.map((item) => item.code)).toEqual(expect.arrayContaining(['storefront_app', 'application_backend', 'payments', 'payment_review']))
    const portfolio = generate(source({ type: 'portfolio', requirements: [requirement({ category: 'content' })], signals: {}, facts: { objective: fact('Show my work') } }), null, 'all')
    expect(portfolio.architecture.map((item) => item.code)).toEqual(expect.arrayContaining(['static_or_prerendered', 'no_backend', 'no_database', 'static_hosting']))
    expect(portfolio.architecture.map((item) => item.code)).not.toContain('relational_database')
    const api = generate(source({ type: 'api_backend', requirements: [requirement({ category: 'data' })], signals: {} }), null, 'all')
    expect(api.architecture.map((item) => item.code)).toEqual(expect.arrayContaining(['no_frontend', 'api_service']))
    // Not one stack for everything: the three differ.
    expect(new Set([shop, portfolio, api].map((plan) => plan.architecture.map((item) => item.code).join())).size).toBe(3)
    for (const plan of [shop, portfolio, api]) expect(plan.architecture.every((item) => item.code in labels.ARCHITECTURE)).toBe(true)
  })

  it('sequences the phases for THIS project: a small site is short, a redesign adds migration, a large build adds a foundation and extra functionality', () => {
    const small = generate(source({ type: 'portfolio', requirements: [requirement()], signals: {}, facts: { objective: fact('x') } }), null, 'all')
    expect(small.phases.map((phase) => phase.code)).toEqual(['discovery_specification', 'design', 'core_development', 'testing_optimization', 'deployment'])
    const redesign = generate(source({ type: 'redesign', requirements: [requirement()], signals: {}, facts: { objective: fact('x'), existingSite: fact('old site') } }), null, 'all')
    expect(redesign.phases.map((phase) => phase.code)).toContain('content_migration')
    expect(redesign.risks.map((risk) => risk.code)).toContain('migration')
    const large = generate(source(), null, 'all')
    expect(large.phases.map((phase) => phase.code)).toEqual(expect.arrayContaining(['technical_foundation', 'additional_functionality', 'handover_maintenance']))
  })

  it('names what is missing, assumed and still to be decided, and never the budget as a promise', () => {
    const plan = generate(source(), null, 'all')
    expect(plan.risks.map((risk) => risk.kind)).toEqual(expect.arrayContaining(['external_dependency', 'assumption', 'decision_needed']))
    expect(plan.risks.map((risk) => risk.code)).toEqual(expect.arrayContaining(['budget_not_a_promise', 'timeline_not_confirmed', 'design_direction']))
    const missing = generate(source({ facts: { objective: fact('x') } }), null, 'all').risks.find((risk) => risk.code === 'missing_facts')
    expect(missing?.detail).toEqual(expect.arrayContaining(['audience', 'timeline', 'budget']))
  })

  it('regenerates only the sections asked for, carries the rest over unchanged, and never loses what was confirmed', () => {
    const first = generate(source({ discoveryVersion: 3 }), null, 'all')
    const later = source({ discoveryVersion: 9, facts: { ...source().facts, objective: fact('A different objective') }, signals: signals({ roles: 'many', authentication: 'advanced', adminArea: 'full', security: 'elevated' }), now: '2026-11-19T10:00:00.000Z' })
    const revised = generate(later, first, ['architecture'])
    expect(revised.architecture).not.toEqual(first.architecture)
    expect(revised.overview).toEqual(first.overview)
    expect(revised.requirements).toEqual(first.requirements)
    expect(revised.phases).toEqual(first.phases)
    expect(revised.sections.architecture.discoveryVersion).toBe(9)
    expect(revised.sections.overview.discoveryVersion).toBe(3)
    expect(staleSections(revised, 9)).toEqual(['overview', 'requirements', 'phases', 'risks', 'next_steps'])
    expect(staleSections(generate(later, first, 'all'), 9)).toEqual([])
    // The visitor's notes are part of every version.
    expect(revised.notes.architecture).toBe('We already pay for a hosting plan.')
  })

  it('has a stable hash that ignores timestamps, and a summary of what changed between versions', () => {
    const one = generate(source(), null, 'all')
    const same = generate(source({ now: '2030-01-01T00:00:00.000Z' }), null, 'all')
    expect(contentHash(one)).toBe(contentHash(same))
    const changed = generate(source({ requirements: [...source().requirements, requirement({ title: 'Waiting list', category: 'booking' })] }), one, 'all')
    expect(contentHash(changed)).not.toBe(contentHash(one))
    expect(summarise(one, changed, 'all')).toMatchObject({ requirementsAdded: 1, requirementsRemoved: 0, factsChanged: [] })
    expect(summarise(null, one, 'all').requirementsAdded).toBe(4)
  })

  it('projects into the existing quote plan within its limits, in the visitor\'s language, with the snapshot\'s version and hash and no price', () => {
    for (const language of ['hu', 'en', 'nl'] as const) {
      const plan = generate(source({ language }), null, 'all')
      const projected = projectToPlan(plan, 4, contentHash(plan), language)
      const { errors } = readPlanChanges(projected)
      expect(errors, language).toEqual({})
      expect(projected.discoveryVersion).toBe(4)
      expect(projected.discoveryHash).toBe(contentHash(plan))
      expect(projected.projectType).toBe(labels.TYPES.booking[language])
      expect(projected.recommendedSolution.startsWith(labels.WORDS.proposalsLead[language])).toBe(true)
      expect(projected.complexity).toMatch(/simple|medium|complex/)
      // (`\b` does not see "á" as a letter, so "már" would match "ár": the boundaries are written out for letters and digits.)
      expect(JSON.stringify(projected)).not.toMatch(/(?<![\p{L}\p{N}])(price|ár|prijs)(?![\p{L}\p{N}])/iu)
    }
  })

  it('writes the quote brief in the brief\'s own shape, with every text in all three languages and the origin and status of each requirement', () => {
    const plan = generate(source(), null, 'all')
    const questions = briefQuestions(plan, 5)
    expect(questions.map((question) => question.id)).toEqual(expect.arrayContaining(['discovery', 'discovery-type', 'discovery-complexity', 'discovery-essential', 'discovery-important', 'discovery-architecture', 'discovery-phases', 'discovery-risks', 'discovery-notes']))
    for (const question of questions) {
      for (const language of ['hu', 'en', 'nl'] as const) {
        expect(question.title[language], `${question.id} title ${language}`).toBeTruthy()
        for (const answer of question.answers) expect(answer.label[language], `${question.id} answer ${language}`).toBeTruthy()
      }
    }
    const important = questions.find((question) => question.id === 'discovery-important')!
    expect(important.answers[0].label.en).toMatch(/Email reminders.*assistant.*not yet confirmed/)
    const intro = questions.find((question) => question.id === 'discovery')!
    expect(intro.title.en).toMatch(/not a quote/i)
  })
})

describe('the words', () => {
  it('has all three languages, never empty, for every code a plan can hold: no fallback to Hungarian or English', () => {
    const tables: Record<string, Record<string, Record<'hu' | 'en' | 'nl', string>>> = { ...ALL_CODES, TYPES: labels.TYPES, CATEGORIES: labels.CATEGORIES, PRIORITIES: labels.PRIORITIES, FACTORS: labels.FACTORS, MAINTENANCE: labels.MAINTENANCE, RISK_KINDS: labels.RISK_KINDS, SECTIONS: labels.SECTIONS, FACTS: labels.FACTS, COMPLEXITY_LEVELS: labels.COMPLEXITY_LEVELS, STATUSES: labels.STATUSES, WORDS: labels.WORDS as never }
    for (const [name, table] of Object.entries(tables)) {
      for (const [code, text] of Object.entries(table)) {
        for (const language of ['hu', 'en', 'nl'] as const) expect(text[language]?.trim(), `${name}.${code}.${language}`).toBeTruthy()
        // A translation that is just the English word is allowed only where it is a name (Front end, Backend, Database…), never a whole sentence.
        if (text.en.split(' ').length > 3) expect(text.hu, `${name}.${code} (hu)`).not.toBe(text.en)
        if (text.en.split(' ').length > 3) expect(text.nl, `${name}.${code} (nl)`).not.toBe(text.en)
      }
    }
    for (const type of PROJECT_TYPES) expect(labels.TYPES[type], type).toBeTruthy()
    for (const category of CATEGORIES) expect(labels.CATEGORIES[category], category).toBeTruthy()
    for (const priority of PRIORITIES) expect(labels.PRIORITIES[priority], priority).toBeTruthy()
    for (const section of SECTIONS) expect(labels.SECTIONS[section], section).toBeTruthy()
    for (const level of LEVELS) expect(labels.COMPLEXITY_LEVELS[level], level).toBeTruthy()
  })

  it('has a label for every code the generator can produce, found by generating plans for every type', () => {
    for (const type of PROJECT_TYPES) {
      const plan = generate(source({ type, signals: signals({ roles: 'many', dataModel: 'complex', security: 'regulated', scalability: 'high', automation: 'extensive', authentication: 'advanced', adminArea: 'full', integrations: 4, thirdParty: 3, languages: 3 }), requirements: [requirement({ category: 'commerce' }), requirement({ category: 'booking' }), requirement({ category: 'communication' }), requirement({ category: 'integration' }), requirement({ category: 'admin' })] }), null, 'all')
      for (const item of plan.architecture) {
        expect(labels.ARCHITECTURE[item.code], `${type} ${item.code}`).toBeTruthy()
        for (const why of item.why) expect(labels.REASONS[why], `${type} reason ${why}`).toBeTruthy()
      }
      for (const phase of plan.phases) expect(labels.PHASES[phase.code], phase.code).toBeTruthy()
      for (const risk of plan.risks) {
        expect(labels.RISKS[risk.code], risk.code).toBeTruthy()
        expect(labels.RISK_KINDS[risk.kind], risk.kind).toBeTruthy()
      }
      for (const step of plan.nextSteps) expect(labels.NEXT_STEPS[step], step).toBeTruthy()
      for (const factor of plan.overview.complexity.factors) expect(labels.FACTORS[factor.code], factor.code).toBeTruthy()
    }
  })
})

describe('the upgrade to migration 0017', () => {
  const folders: string[] = []
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })

  it('keeps every earlier row, adds only empty tables, enforces its enumerations and cascades with the draft', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc-mig-discovery-'))
    folders.push(directory)
    for (const name of readdirSync(MIGRATIONS_DIRECTORY).filter((file) => file < '0017')) copyFileSync(join(MIGRATIONS_DIRECTORY, name), join(directory, name))
    const clock = new TestClock()
    const db = new Database(':memory:')
    migrate(db, clock, directory)
    const now = '2026-11-18T10:00:00.000Z'
    db.run("INSERT INTO ai_sessions (id, ip_hash, created_at, last_seen_at, request_count) VALUES ('s1', 'h', ?, ?, 0)", [now, now])
    db.run("INSERT INTO ai_conversations (id, session_id, language, topic, created_at, updated_at) VALUES ('c1', 's1', 'en', 'general', ?, ?)", [now, now])
    expect(migrate(db, clock).filter((version) => version === 17)).toEqual([17])
    expect(db.all('SELECT id FROM ai_conversations')).toEqual([{ id: 'c1' }])
    for (const table of ['ai_discovery', 'ai_discovery_facts', 'ai_discovery_requirements', 'ai_discovery_plans', 'ai_discovery_notes']) expect(db.all(`SELECT 1 FROM ${table}`), table).toEqual([])
    db.run('INSERT INTO ai_discovery (conversation_id, created_at, updated_at) VALUES (?, ?, ?)', ['c1', now, now])
    expect(() => db.run("UPDATE ai_discovery SET stage = 'nonsense' WHERE conversation_id = 'c1'")).toThrow()
    expect(() => db.run("UPDATE ai_discovery SET project_type = 'spaceship' WHERE conversation_id = 'c1'")).toThrow()
    expect(() => db.run("INSERT INTO ai_discovery_facts (conversation_id, key, value, origin, updated_at) VALUES ('c1', 'price', '1', 'visitor', ?)", [now])).toThrow()
    expect(() => db.run("INSERT INTO ai_discovery_requirements (id, conversation_id, position, title, category, priority, origin, basis, status, complexity, created_at, updated_at) VALUES ('r', 'c1', 1, 't', 'content', 'urgent', 'visitor', 'stated', 'confirmed', 'low', ?, ?)", [now, now])).toThrow()
    expect(() => db.run("INSERT INTO ai_discovery_facts (conversation_id, key, value, origin, updated_at) VALUES ('nobody', 'objective', 'x', 'visitor', ?)", [now])).toThrow()
    db.run("INSERT INTO ai_discovery_facts (conversation_id, key, value, origin, confirmed, updated_at) VALUES ('c1', 'objective', 'x', 'visitor', 1, ?)", [now])
    db.run("INSERT INTO ai_discovery_plans (id, conversation_id, version, content, content_hash, origin, reason, summary, created_at) VALUES ('p', 'c1', 1, '{}', 'h', 'assistant', 'generate', '{}', ?)", [now])
    expect(() => db.run("INSERT INTO ai_discovery_plans (id, conversation_id, version, content, content_hash, origin, reason, summary, created_at) VALUES ('p2', 'c1', 1, '{}', 'h', 'assistant', 'generate', '{}', ?)", [now])).toThrow()
    db.run("DELETE FROM ai_discovery WHERE conversation_id = 'c1'")
    for (const table of ['ai_discovery_facts', 'ai_discovery_plans']) expect(db.all(`SELECT 1 FROM ${table}`), table).toEqual([])
    db.close()
  })
})
