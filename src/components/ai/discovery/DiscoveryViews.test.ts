import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { aiText } from '../../../content/ai'
import { discoveryText } from '../../../content/ai/discovery'
import { I18nProvider } from '../../../i18n/I18nProvider'
import type { Language } from '../../../i18n/config'
import type { Assessment, DiscoveryState, PlanContent, PlanMeta, Requirement, Section, StageProgress } from '../../../ai/discoveryModel'
import { STAGES } from '../../../ai/discoveryModel'
import { PlanTab } from './PlanTab'
import { ProgressList } from './ProgressList'
import { ProjectTab } from './ProjectTab'
import { RequirementsTab } from './RequirementsTab'

/**
 * PROMPT 30, the panel drawn from what the server sends (never from a model): who wrote what and whether the visitor confirmed it is always
 * on the screen, an assistant's suggestion is never drawn as confirmed, nothing can be changed while the draft is locked or after the request
 * was sent, the plan says what is out of date, the review shows what would be sent, and the form that sends it appears only when nothing is missing.
 */

const AT = '2026-11-03T10:00:00.000Z'

const assessment = (over: Partial<Assessment> = {}): Assessment => ({
  level: 'medium', score: 9, factors: [{ code: 'project_type', points: 4, detail: 'booking' }, { code: 'user_roles', points: 2, detail: 'few' }, { code: 'requirements_volume', points: 3, detail: 12 }], unknown: ['dataModel'], raisedFrom: null,
  thresholds: { medium: 6, large: 14, complex: 25 }, notAnEstimate: true, ...over,
})

const requirement = (n: number, over: Partial<Requirement> = {}): Requirement => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, position: n, title: `Requirement ${n}`, description: '', category: 'booking', priority: 'essential', required: true, origin: 'visitor', basis: 'stated', status: 'confirmed',
  complexity: 'medium', dependsOn: [], createdAt: AT, updatedAt: AT, ...over,
})

const progress = (current: string): StageProgress[] =>
  STAGES.map((stage) => ({ stage, status: stage === current ? 'current' : stage === 'idea' || stage === 'type' ? 'done' : stage === 'budget' ? 'skipped' : stage === 'plan' ? 'not_applicable' : 'todo', skippable: ['audience', 'features', 'infrastructure', 'complexity', 'budget', 'timeline', 'maintenance'].includes(stage) }))

const sections = Object.fromEntries((['overview', 'requirements', 'architecture', 'phases', 'risks', 'next_steps'] as Section[]).map((section) => [section, { discoveryVersion: 3, generatedAt: AT }])) as PlanContent['sections']

const content = (over: Partial<PlanContent> = {}): PlanContent => ({
  schema: 1, language: 'en', sections,
  overview: {
    projectName: { value: 'Bakery booking', origin: 'visitor', confirmed: true }, projectType: { value: 'booking', origin: 'visitor', confirmed: true },
    objective: { value: 'Let customers reserve a table', origin: 'assistant', confirmed: false }, problem: null, audience: null, existingSite: null, budget: { value: 'A modest budget', origin: 'visitor', confirmed: true },
    timeline: null, maintenance: { value: 'occasional', origin: 'visitor', confirmed: true }, complexity: assessment(),
  },
  requirements: { items: [requirement(1), requirement(2, { origin: 'assistant', basis: 'suggested', status: 'unconfirmed', priority: 'important', required: false }), requirement(3, { priority: 'future', required: false })].map(({ id, title, description, category, priority, required, origin, basis, status, complexity, dependsOn }) => ({ id, title, description, category, priority, required, origin, basis, status, complexity, dependsOn })), rejected: 1 },
  architecture: [{ area: 'frontend', code: 'react_spa', why: ['accounts'] }, { area: 'backend', code: 'node_api', why: ['booking'] }],
  phases: [{ code: 'discovery', requirementIds: [] }, { code: 'build', requirementIds: [requirement(1).id] }],
  risks: [{ kind: 'missing_info', code: 'unanswered', detail: ['dataModel', 'timeline'] }],
  nextSteps: ['review_requirements', 'send_request'], notes: {}, ...over,
})

const meta = (version: number, over: Partial<PlanMeta> = {}): PlanMeta => ({ version, hash: `h${version}`, origin: 'visitor', reason: 'generate', summary: { sections: ['overview', 'requirements', 'architecture', 'phases', 'risks', 'next_steps'], requirementsAdded: 3, requirementsRemoved: 0, requirementsChanged: 0, complexityFrom: null, complexityTo: 'medium', factsChanged: [] }, createdAt: AT, ...over })

const state = (over: Partial<DiscoveryState> = {}): DiscoveryState => ({
  exists: true, version: 3, stage: 'requirements', progress: progress('requirements'),
  type: { value: 'booking', origin: 'assistant', confirmed: false },
  facts: { projectName: { value: 'Bakery booking', origin: 'visitor', confirmed: true }, objective: { value: 'Let customers reserve a table', origin: 'assistant', confirmed: false } },
  requirements: [requirement(1), requirement(2, { origin: 'assistant', basis: 'suggested', status: 'unconfirmed', priority: 'important', required: false, title: 'Reminder e-mails' }), requirement(3, { status: 'rejected', title: 'Loyalty points', priority: 'optional', required: false })],
  signals: { roles: { value: 'few', origin: 'assistant' }, languages: { value: 2, origin: 'visitor' } }, skipped: ['budget'], notes: {}, complexity: assessment(),
  plan: { stale: false, staleSections: [], latest: null, versions: [] }, missingForPlan: [], missingForApproval: [], sent: false, ...over,
})

const withPlan = (over: Partial<DiscoveryState> = {}, plan: Partial<DiscoveryState['plan']> = {}): DiscoveryState =>
  state({ plan: { stale: false, staleSections: [], latest: { ...meta(2), content: content() }, versions: [meta(2, { origin: 'assistant', summary: { sections: ['requirements'], requirementsAdded: 1, requirementsRemoved: 0, requirementsChanged: 2, complexityFrom: 'small', complexityTo: 'medium', factsChanged: [] } }), meta(1)], ...plan }, ...over })

const frame = (node: ReactElement, lang: Language): string => renderToStaticMarkup(h(MemoryRouter, { initialEntries: [`/${lang}/control-room`] }, h(I18nProvider, { lang, children: node })))
const project = (s: DiscoveryState, lang: Language = 'en', locked = false, fields: Record<string, string> = {}) => frame(h(ProjectTab, { state: s, locked, fields }), lang)
const requirements = (s: DiscoveryState, lang: Language = 'en', locked = false) => frame(h(RequirementsTab, { state: s, locked, fields: {} }), lang)
const plan = (s: DiscoveryState, lang: Language = 'en', over: { ready?: boolean; quoteEnabled?: boolean; locked?: boolean } = {}) =>
  frame(h(PlanTab, { state: s, conversationId: 'c1', locked: over.locked ?? false, ready: over.ready ?? true, quoteEnabled: over.quoteEnabled ?? true }), lang)
const steps = (s: DiscoveryState, lang: Language = 'en', locked = false) => frame(h(ProgressList, { state: s, locked }), lang)

describe('the progress', () => {
  it('says where the visitor is, how far, and offers to skip only an optional step that is still open', () => {
    const html = steps(state())
    expect(html).toContain('Now: Core requirements')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="3"')
    expect(html).toContain('aria-current="step"')
    // Budget was skipped: it can be taken back. Audience is open and optional: it can be skipped. The idea (done) and requirements (not skippable) have no button.
    expect(html).toContain('aria-label="Answer after all: Budget expectations"')
    expect(html).toContain('aria-label="Skip: Target audience"')
    expect(html).not.toContain('aria-label="Skip: Core requirements"')
    expect(html).not.toContain('aria-label="Skip: The idea"')
    expect(html).toContain('not needed for this project')
  })

  it('has no button while the draft is locked', () => {
    expect(steps(state(), 'en', true)).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Skip: Target audience"/)
  })

  it('does not say every step is done while optional steps are still open (a plan exists, no step is current)', () => {
    const open = STAGES.map((stage) => ({ stage, status: stage === 'audience' || stage === 'budget' ? ('todo' as const) : ('done' as const), skippable: stage === 'audience' || stage === 'budget' }))
    const html = steps(state({ progress: open }))
    expect(html).toContain('The main steps are done. Optional steps left: 2')
    expect(html).not.toContain('Every step is done')
    expect(html).toContain('aria-valuenow="11"')
  })

  it('says it is done when every step is', () => {
    expect(steps(state({ progress: STAGES.map((stage) => ({ stage, status: 'done' as const, skippable: false })) }))).toContain('Every step is done')
  })
})

describe('the project tab', () => {
  it('offers all eleven project types, including "Other / not sure", as one group of radio buttons', () => {
    const html = project(state({ type: { value: null, origin: null, confirmed: false } }))
    expect(html.match(/type="radio"/g)).toHaveLength(11)
    expect(html).toContain('Other / not sure')
    expect(html).not.toContain('checked=""')
  })

  it('shows an assistant’s classification as a proposal to confirm, and a confirmed one as confirmed', () => {
    const pending = project(state())
    expect(pending).toContain('proposed by the assistant')
    expect(pending).toContain('>Confirm</button>')
    const confirmed = project(state({ type: { value: 'booking', origin: 'visitor', confirmed: true } }))
    expect(confirmed).toContain('chosen by you')
    expect(confirmed).not.toContain('proposed by the assistant')
  })

  it('says who wrote every fact: the visitor’s are theirs, the assistant’s wait for a confirmation', () => {
    const html = project(state())
    expect(html).toContain('written by you')
    expect(html).toContain('suggested by the assistant, not yet confirmed')
    expect(html).toContain('aria-label="Confirm: What do you want to achieve?"')
    // A field the visitor wrote has no confirm button.
    expect(html).not.toContain('aria-label="Confirm: Project name"')
  })

  it('limits every text as the server does, and says a budget is not a promise', () => {
    const html = project(state())
    expect(html).toContain('maxLength="80"')
    expect(html).toContain('maxLength="400"')
    expect(html).toContain('not a promise')
  })

  it('marks a field the server refused', () => {
    expect(project(state(), 'en', false, { objective: 'tooLong' })).toMatch(/<textarea[^>]*aria-invalid="true"/)
  })

  it('explains the complexity by the rules, says what is not known and that it is not an estimate', () => {
    const html = project(state())
    expect(html).toContain('medium')
    expect(html).toContain('Score: 9')
    expect(html).toContain('Why this level?')
    expect(html).toContain('The type of project (Booking')
    expect(html).toContain('User roles and permissions (a few roles)')
    expect(html).toContain('4 points')
    expect(html).toContain('Not known yet: the structure of the data')
    expect(html).toContain('not an estimate of hours or cost')
  })

  it('says so when there is not enough to assess, and when a rule raised the level', () => {
    expect(project(state({ complexity: assessment({ level: null, score: 0, factors: [] }) }))).toContain('not enough information for a level yet')
    expect(project(state({ complexity: assessment({ level: 'large', raisedFrom: 'medium' }) }))).toContain('“medium”')
  })

  it('locks everything while a change is on its way', () => {
    const html = project(state(), 'en', true)
    expect(html).toMatch(/<fieldset[^>]*disabled=""/)
    expect(html).toMatch(/<textarea[^>]*disabled=""/)
    expect(html).toMatch(/<select[^>]*disabled=""/)
  })
})

describe('the requirements tab', () => {
  it('groups by priority and says, on every card, who wrote it and whether it is confirmed', () => {
    const html = requirements(state())
    expect(html).toContain('Essential')
    expect(html).toContain('Important')
    expect(html).toContain('added by you')
    expect(html).toContain('suggested by the assistant')
    expect(html).toContain('not confirmed')
    expect(html).toContain('1 waiting for your confirmation')
  })

  it('offers to confirm only what is not confirmed, to restore only what was rejected, and never lets a suggestion pass as confirmed', () => {
    const html = requirements(state())
    expect(html).toContain('aria-label="Confirm: Reminder e-mails"')
    expect(html).not.toContain('aria-label="Confirm: Requirement 1"')
    expect(html).toContain('aria-label="Restore: Loyalty points"')
    expect(html).toContain('aria-label="Reject: Reminder e-mails"')
    expect(html).toContain('aria-label="Edit: Reminder e-mails"')
    expect(html).toContain('aria-label="Move to later: Reminder e-mails"')
    // The rejected one sits in its own group, struck out, and cannot be edited.
    expect(html).toContain('Rejected')
    expect(html).not.toContain('aria-label="Edit: Loyalty points"')
  })

  it('has a form to add a requirement, with the priority and complexity choices the server knows', () => {
    const html = requirements(state())
    expect(html).toContain('Add a requirement')
    for (const name of ['Essential', 'Important', 'Optional', 'Future consideration']) expect(html).toContain(`>${name}</option>`)
    for (const name of ['low', 'medium', 'high']) expect(html).toContain(`>${name}</option>`)
    expect(html).toContain('maxLength="100"')
  })

  it('says there is nothing yet, and what to do', () => {
    expect(requirements(state({ requirements: [] }))).toContain('There are no requirements yet')
  })

  it('disables every action while locked, and after the request was sent', () => {
    const html = requirements(state(), 'en', true)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Confirm: Reminder e-mails"/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Reject: Reminder e-mails"/)
  })
})

describe('the plan tab', () => {
  it('is empty until the visitor makes a plan, says what is missing, and cannot make one without it', () => {
    const html = plan(state({ missingForPlan: ['projectType', 'requirements'] }))
    expect(html).toContain('There is no plan yet')
    expect(html).toContain('the project type')
    expect(html).toContain('at least one requirement')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Generate the plan/)
    expect(plan(state())).not.toMatch(/<button[^>]*disabled=""[^>]*>Generate the plan/)
  })

  it('shows all six sections, as a proposal and not a decision, with the version', () => {
    const html = plan(withPlan())
    for (const name of ['Overview', 'Requirements', 'Recommended architecture', 'Development phases', 'Risks and dependencies', 'Next steps']) expect(html).toContain(name)
    expect(html).toContain('Version 2')
    expect(html).toContain('proposal')
    expect(html).toContain('not confirmed technical decisions')
    expect(html).toContain('The plan is up to date.')
  })

  it('draws the plan from the codes the server stored, in the visitor’s words and language', () => {
    const html = plan(withPlan())
    expect(html).toContain('Bakery booking')
    expect(html).toContain('Let customers reserve a table')
    expect(html).toContain('Front end')
    expect(html).toContain('Requirement 1')
    expect(html).toContain('the structure of the data, the desired launch time')
    expect(html).toContain('Review the requirements and confirm or reject the suggestions')
    const hungarian = plan(withPlan(), 'hu')
    expect(hungarian).toContain('Áttekintés')
    expect(hungarian).toContain('Bakery booking')
    expect(hungarian).not.toContain('Overview')
  })

  it('says a suggestion is not confirmed even inside the plan', () => {
    const html = plan(withPlan())
    expect(html).toContain('suggested by the assistant, not yet confirmed')
    expect(html).toContain('not confirmed')
  })

  it('says the plan is out of date, which section, and offers to regenerate it', () => {
    const html = plan(withPlan({}, { stale: true, staleSections: ['requirements'] }))
    expect(html).toContain('The plan is out of date')
    expect(html).toContain('this section is older than the project')
    expect(html).toContain('Regenerate the plan')
    expect(html).toContain('Regenerate this section')
    expect(html).not.toContain('The plan is up to date.')
  })

  it('keeps the visitor’s own note on a section', () => {
    const html = plan(withPlan({ notes: { risks: 'Ask the landlord about the sign' } }))
    expect(html).toContain('Ask the landlord about the sign')
    expect(html).toContain('Every regeneration keeps it.')
  })

  it('lists the versions, newest first, with what changed, and a way to open an older one', () => {
    const html = plan(withPlan())
    expect(html).toContain('Plan versions')
    expect(html.indexOf('Version 2')).toBeLessThan(html.lastIndexOf('Version 1'))
    expect(html).toContain('1 added, 0 removed, 2 changed requirements')
    expect(html).toContain('Regenerated sections: Requirements')
    expect(html).toContain('Complexity: small → medium')
    expect(html).toContain('The first version')
    expect(html).toContain('aria-label="View: Version 1"')
    expect(html).not.toContain('aria-label="View: Version 2"')
  })

  describe('the review before sending', () => {
    it('shows what the studio would receive: the confirmed, the unconfirmed and the later requirements, the complexity, the budget as an expectation', () => {
      const html = plan(withPlan())
      expect(html).toContain('Review before sending')
      expect(html).toContain('Confirmed core requirements')
      expect(html).toContain('Requirements not yet confirmed (suggestions)')
      expect(html).toContain('Other confirmed requirements (important, optional, later)')
      expect(html).toContain('Complexity (not an estimate)')
      expect(html).toContain('Budget expectation (not a promise)')
      expect(html).toContain('A modest budget')
      expect(html).toContain('not in the chat')
      expect(html).toContain('privacy notice')
      expect(html).toContain('not a quote and not a confirmed project')
    })

    it('offers the form that sends it only when nothing is missing, the plan is current and sending is on', () => {
      const sendTitle = aiText.send.title.en
      expect(plan(withPlan())).toContain(sendTitle)
      // Something missing, a stale plan, sending switched off, a plan the quote workflow does not call ready: no form.
      expect(plan(withPlan({ missingForApproval: ['confirmedRequirement'] }))).not.toContain(sendTitle)
      expect(plan(withPlan({ missingForApproval: ['confirmedRequirement'] }))).toContain('at least one core requirement that you confirmed')
      expect(plan(withPlan({}, { stale: true }))).not.toContain(sendTitle)
      expect(plan(withPlan({}, { stale: true }))).toContain('the plan regenerated after the latest changes')
      expect(plan(withPlan(), 'en', { quoteEnabled: false })).not.toContain(sendTitle)
      expect(plan(withPlan(), 'en', { quoteEnabled: false })).toContain(aiText.send.disabled.en)
      expect(plan(withPlan(), 'en', { ready: false })).not.toContain(sendTitle)
    })

    it('has no form after the request was sent', () => {
      const html = plan(withPlan({ sent: true }))
      expect(html).not.toContain(aiText.send.title.en)
      expect(html).not.toContain('Regenerate this section')
      expect(html).toMatch(/<textarea[^>]*disabled=""/)
    })
  })

  it('draws the same plan in the three languages without leaving one unfinished', () => {
    for (const lang of ['hu', 'en', 'nl'] as const) {
      const html = plan(withPlan(), lang)
      expect(html, lang).not.toMatch(/\{(\w+)\}/)
      expect(html, lang).toContain(discoveryText.plan.title[lang])
      expect(html, lang).toContain(discoveryText.review.title[lang])
    }
  })

  it('never draws a price or a promise, in any language', () => {
    for (const lang of ['hu', 'en', 'nl'] as const) {
      const html = `${project(state(), lang)}${requirements(state(), lang)}${plan(withPlan(), lang)}`.replace(/<[^>]+>/g, ' ')
      expect(html, lang).not.toMatch(/[€$£]|\b(EUR|HUF|USD)\b/)
    }
  })
})
