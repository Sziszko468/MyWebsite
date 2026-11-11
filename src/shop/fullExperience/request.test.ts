import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { baseFullExperience, CORE_QUESTION_IDS } from '../../content/shop/fullExperience'
import { buildSummary, emptyDraft, firstInvalidStep, FE_LIMITS, questionOf, stepsOf, toggleAnswer, toRequest, validateStep, type Draft } from './request'

const offer = baseFullExperience
const OPTIONS = { requireConsent: true }
const q = (id: string) => offer.configurator.questions.find((question) => question.id === id)!
const complete = (): Draft => ({
  ...emptyDraft('en'),
  answers: { type: ['web-app'], stage: ['idea'] },
  description: 'A booking platform for a small network of gyms, built from scratch.',
  name: 'Eszter Varga',
  email: 'eszter@example.com',
  consent: true,
})

describe('the FULL EXPERIENCE configurator\'s steps', () => {
  it('are the offer\'s questions in its order, then the description and the contact details', () => {
    const steps = stepsOf(offer)
    expect(steps.slice(0, -2)).toEqual(offer.configurator.questions.map((question) => `q:${question.id}`))
    expect(steps.slice(-2)).toEqual(['description', 'contact'])
    // The brief's eight steps: six questions, the description and the contact details.
    expect(steps).toHaveLength(8)
    expect(questionOf(offer, 'q:budget')?.id).toBe('budget')
    expect(questionOf(offer, 'contact')).toBeUndefined()
  })

  it('has the core questions, with the budget\'s way out and nothing that looks like a price', () => {
    for (const id of CORE_QUESTION_IDS) expect(q(id), id).toBeDefined()
    expect(q('budget').options.some((option) => option.unsure)).toBe(true)
    const everything = JSON.stringify(offer)
    expect(everything).not.toMatch(/[€$£]|\bEUR\b|\bHUF\b|\d\s?(Ft|eur)\b/i)
  })

  it('asks the project type and stage, and leaves the rest optional', () => {
    expect(offer.configurator.questions.filter((question) => question.required).map((question) => question.id)).toEqual(['type', 'stage'])
  })
})

describe('answering', () => {
  it('replaces the answer of a single question, and takes it back when chosen again', () => {
    let answers = toggleAnswer(q('type'), {}, 'web-app')
    expect(answers).toEqual({ type: ['web-app'] })
    answers = toggleAnswer(q('type'), answers, 'portal')
    expect(answers).toEqual({ type: ['portal'] })
    expect(toggleAnswer(q('type'), answers, 'portal')).toEqual({})
  })

  it('adds and removes options of a multiple question, and lets "not sure" stand alone', () => {
    const components = q('components')
    let answers = toggleAnswer(components, {}, 'frontend')
    answers = toggleAnswer(components, answers, 'backend')
    expect(answers.components).toEqual(['frontend', 'backend'])
    expect(toggleAnswer(components, answers, 'frontend').components).toEqual(['backend'])
    expect(toggleAnswer(components, toggleAnswer(components, answers, 'backend'), 'frontend')).toEqual({})
    // The seeded components question has no "not sure" option; one that has stands alone.
    const withUnsure = { ...components, options: [...components.options, { id: 'unsure', label: components.options[0].label, hint: components.options[0].hint, unsure: true }] }
    const only = toggleAnswer(withUnsure, answers, 'unsure')
    expect(only.components).toEqual(['unsure'])
    expect(toggleAnswer(withUnsure, only, 'database').components).toEqual(['database'])
  })

  it('ignores an option the question does not have', () => {
    const answers = { type: ['web-app'] }
    expect(toggleAnswer(q('type'), answers, 'space-station')).toBe(answers)
  })
})

describe('what each step needs', () => {
  it('lets an optional question be skipped and holds a required one', () => {
    expect(validateStep('q:budget', offer, emptyDraft('en'), OPTIONS)).toEqual({})
    expect(validateStep('q:type', offer, emptyDraft('en'), OPTIONS)).toEqual({ answer: 'required' })
    expect(validateStep('q:type', offer, complete(), OPTIONS)).toEqual({})
  })

  it('checks the description\'s length', () => {
    const draft = (description: string) => ({ ...complete(), description })
    expect(validateStep('description', offer, draft(''), OPTIONS).description).toBe('required')
    expect(validateStep('description', offer, draft('too short'), OPTIONS).description).toBe('tooShort')
    expect(validateStep('description', offer, draft('x'.repeat(FE_LIMITS.description.max + 1)), OPTIONS).description).toBe('tooLong')
    expect(validateStep('description', offer, draft('x'.repeat(FE_LIMITS.description.min)), OPTIONS)).toEqual({})
  })

  it('validates the contact details, with the company optional and consent required while the config says so', () => {
    const draft = { ...complete(), name: '', email: 'nope', consent: false }
    expect(validateStep('contact', offer, draft, OPTIONS)).toEqual({ name: 'required', email: 'invalidEmail', consent: 'consentRequired' })
    expect(validateStep('contact', offer, { ...draft, consent: false, name: 'Eszter', email: 'e@example.com' }, { requireConsent: false })).toEqual({})
    expect(validateStep('contact', offer, { ...complete(), company: '' }, OPTIONS)).toEqual({})
    expect(validateStep('contact', offer, { ...complete(), company: 'x'.repeat(FE_LIMITS.company.max + 1) }, OPTIONS).company).toBe('tooLong')
  })

  it('finds the first step that is not acceptable, in order', () => {
    expect(firstInvalidStep(offer, complete(), OPTIONS)).toBeNull()
    expect(firstInvalidStep(offer, { ...complete(), answers: {} }, OPTIONS)?.step).toBe('q:type')
    expect(firstInvalidStep(offer, { ...complete(), description: '' }, OPTIONS)?.step).toBe('description')
    expect(firstInvalidStep(offer, { ...complete(), email: '' }, OPTIONS)?.step).toBe('contact')
  })
})

describe('the request', () => {
  it('is what the server accepts: the form, the version, the answers that exist, the contact, no price', () => {
    const draft: Draft = { ...complete(), answers: { type: ['web-app'], stage: ['idea'], components: ['frontend', 'backend', 'ghost'], mood: ['calm'] }, company: ' Gym Network ', preferredLanguage: 'nl' }
    const request = toRequest(draft, offer, 'hu')
    expect(request).toEqual({
      form: 'full_experience',
      version: 1,
      language: 'hu',
      preferredLanguage: 'nl',
      answers: { type: ['web-app'], stage: ['idea'], components: ['frontend', 'backend'] },
      description: 'A booking platform for a small network of gyms, built from scratch.',
      name: 'Eszter Varga',
      email: 'eszter@example.com',
      company: 'Gym Network',
      marketing: false,
      consent: true,
    })
    expect(JSON.stringify(request)).not.toMatch(/price|amount|currency/)
    expect(toRequest({ ...complete(), company: '  ' }, offer, 'en')).not.toHaveProperty('company')
  })

  it('has a summary with every question, skipped ones marked, the description and the contact', () => {
    const text = buildSummary(offer, { ...complete(), answers: { type: ['web-app'], stage: ['idea'], components: ['frontend', 'database'] }, company: 'Gym Network' }, 'en', { skipped: '(skipped)', description: 'Description', contact: 'Contact', heading: 'Your request summary' })
    expect(text).toContain('What kind of project is it?: Web application')
    expect(text).toContain('What does your project need? (choose any): Screens that people see and use, Saving and managing information')
    expect(text).toContain('When would you like it?: (skipped)')
    expect(text).toContain('A booking platform for a small network of gyms')
    expect(text).toMatch(/Eszter Varga\neszter@example.com\nGym Network$/)
  })
})

describe('the numbers are the server\'s', () => {
  it('match modules/shop/fullExperience.ts', () => {
    const server = readFileSync(join(process.cwd(), 'server', 'src', 'modules', 'shop', 'fullExperience.ts'), 'utf8')
    const block = /export const FE_LIMITS = \{([\s\S]*?)\} as const/.exec(server)![1]
    const number = (field: string, key: string) => Number(new RegExp(`${field}: \\{[^}]*${key}: (\\d+)`).exec(block)?.[1])
    expect(number('description', 'min')).toBe(FE_LIMITS.description.min)
    expect(number('description', 'max')).toBe(FE_LIMITS.description.max)
    expect(number('name', 'min')).toBe(FE_LIMITS.name.min)
    expect(number('name', 'max')).toBe(FE_LIMITS.name.max)
    expect(number('email', 'max')).toBe(FE_LIMITS.email.max)
    expect(number('company', 'max')).toBe(FE_LIMITS.company.max)
  })
})
