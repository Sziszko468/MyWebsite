import type { FullExperience, Question } from '../../content/shop/fullExperience'
import type { Language } from '../../i18n/config'
import { isEmail } from '../../forms/validate'

/**
 * The FULL EXPERIENCE configurator without a screen: its steps (the offer's questions in the administrator's order, then the
 * description and the contact details), how an answer is toggled, what a step needs before the visitor may go on, and the request
 * that is sent. The same endpoint as the request builder's (`/api/quote-requests`), told apart by `form: 'full_experience'`. The
 * numbers are the server's (modules/shop/fullExperience.ts; `contractWithServer.test.ts` compares them). A price is never in it.
 */

export const FE_LIMITS = {
  description: { min: 20, max: 4000 },
  name: { min: 2, max: 100 },
  email: { max: 254 },
  company: { max: 100 },
} as const

export type Answers = Record<string, string[]>

export interface Draft {
  answers: Answers
  description: string
  name: string
  email: string
  company: string
  preferredLanguage: Language
  consent: boolean
}

export const emptyDraft = (language: Language): Draft => ({ answers: {}, description: '', name: '', email: '', company: '', preferredLanguage: language, consent: false })

/** A step is a question (`q:type`), the description, or the contact details. */
export type StepKey = `q:${string}` | 'description' | 'contact'

export const stepsOf = (offer: FullExperience): StepKey[] => [...offer.configurator.questions.map((question): StepKey => `q:${question.id}`), 'description', 'contact']

export const questionOf = (offer: FullExperience, step: StepKey): Question | undefined => (step.startsWith('q:') ? offer.configurator.questions.find((question) => `q:${question.id}` === step) : undefined)

/**
 * Chooses or un-chooses an option. A single question has at most one answer (choosing the chosen one again takes it back, so an
 * optional question can be left unanswered after a slip). In a multiple question any number may be chosen, except that "not sure yet"
 * stands alone: choosing it clears the others, and choosing another clears it.
 */
export function toggleAnswer(question: Question, answers: Answers, optionId: string): Answers {
  const current = answers[question.id] ?? []
  const option = question.options.find((candidate) => candidate.id === optionId)
  if (!option) return answers
  let next: string[]
  if (question.kind === 'single') next = current.includes(optionId) ? [] : [optionId]
  else if (current.includes(optionId)) next = current.filter((id) => id !== optionId)
  else if (option.unsure) next = [optionId]
  else next = [...current.filter((id) => !question.options.find((candidate) => candidate.id === id)?.unsure), optionId]
  const out = { ...answers }
  if (next.length === 0) delete out[question.id]
  else out[question.id] = next
  return out
}

export type ErrorCode = 'required' | 'tooShort' | 'tooLong' | 'invalidEmail' | 'consentRequired'
export type Errors = Partial<Record<'answer' | 'description' | 'name' | 'email' | 'company' | 'consent', ErrorCode>>

const lengthOf = (value: string): number => [...value.trim()].length

export function validateStep(step: StepKey, offer: FullExperience, draft: Draft, options: { requireConsent: boolean }): Errors {
  const errors: Errors = {}
  const question = questionOf(offer, step)
  if (question) {
    if (question.required && (draft.answers[question.id] ?? []).length === 0) errors.answer = 'required'
    return errors
  }
  if (step === 'description') {
    const size = lengthOf(draft.description)
    if (size === 0) errors.description = 'required'
    else if (size < FE_LIMITS.description.min) errors.description = 'tooShort'
    else if (size > FE_LIMITS.description.max) errors.description = 'tooLong'
    return errors
  }
  const name = lengthOf(draft.name)
  if (name === 0) errors.name = 'required'
  else if (name < FE_LIMITS.name.min) errors.name = 'tooShort'
  else if (name > FE_LIMITS.name.max) errors.name = 'tooLong'
  const email = draft.email.trim()
  if (email === '') errors.email = 'required'
  else if (email.length > FE_LIMITS.email.max || !isEmail(email)) errors.email = 'invalidEmail'
  if (lengthOf(draft.company) > FE_LIMITS.company.max) errors.company = 'tooLong'
  if (options.requireConsent && !draft.consent) errors.consent = 'consentRequired'
  return errors
}

/** The first step that is not acceptable, so a send never skips what the way here let slip. */
export function firstInvalidStep(offer: FullExperience, draft: Draft, options: { requireConsent: boolean }): { step: StepKey; errors: Errors } | null {
  for (const step of stepsOf(offer)) {
    const errors = validateStep(step, offer, draft, options)
    if (Object.keys(errors).length > 0) return { step, errors }
  }
  return null
}

export interface FullExperienceRequest {
  form: 'full_experience'
  version: 1
  language: Language
  preferredLanguage: Language
  answers: Answers
  description: string
  name: string
  email: string
  company?: string
  consent: boolean
}

export function toRequest(draft: Draft, offer: FullExperience, language: Language): FullExperienceRequest {
  // Only answers to questions the offer has, with options it has: what the server would accept.
  const answers: Answers = {}
  for (const question of offer.configurator.questions) {
    const chosen = (draft.answers[question.id] ?? []).filter((id) => question.options.some((option) => option.id === id))
    if (chosen.length > 0) answers[question.id] = chosen
  }
  const company = draft.company.trim()
  return {
    form: 'full_experience',
    version: 1,
    language,
    preferredLanguage: draft.preferredLanguage,
    answers,
    description: draft.description.trim(),
    name: draft.name.trim(),
    email: draft.email.trim(),
    ...(company ? { company } : {}),
    consent: draft.consent,
  }
}

export interface SummaryText {
  skipped: string
  description: string
  contact: string
  heading: string
}

/** The request as text a visitor can copy when nothing can be sent: every question and answer, the description and the contact. */
export function buildSummary(offer: FullExperience, draft: Draft, lang: Language, text: SummaryText): string {
  const lines = [`${offer.hero.eyebrow[lang]} — ${text.heading}`, '']
  for (const question of offer.configurator.questions) {
    const chosen = (draft.answers[question.id] ?? []).map((id) => question.options.find((option) => option.id === id)?.label[lang]).filter(Boolean)
    lines.push(`${question.title[lang]}: ${chosen.length > 0 ? chosen.join(', ') : text.skipped}`)
  }
  lines.push('', `${text.description}:`, draft.description.trim(), '', `${text.contact}:`, draft.name.trim(), draft.email.trim())
  if (draft.company.trim()) lines.push(draft.company.trim())
  return lines.join('\n')
}
