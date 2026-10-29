import type { Language } from '../i18n/config'
import type { PackageId } from '../content/packages'

/**
 * The quote request: what the form collects, and what it hands to the part that sends it.
 *
 * Seven questions, asked in four steps. Everything is kept in memory while the form is open and
 * nowhere else: no storage, no cookies, nothing in the address bar.
 */

/** The kinds of project the form asks about. The first four are the service areas on the page. */
export const PROJECT_TYPES = ['website', 'webapp', 'ui', 'integrations', 'maintenance', 'unsure'] as const
export type ProjectTypeId = (typeof PROJECT_TYPES)[number]

/** The service areas shown on the page: the project types that are a service rather than "other". */
export type ServiceAreaId = Exclude<ProjectTypeId, 'maintenance' | 'unsure'>

/** A package, or "not sure yet". The visitor has to say which, so the answer is never an accident. */
export type PackageChoice = PackageId | 'unsure'
export const PACKAGE_CHOICES: readonly PackageChoice[] = ['launch', 'grow', 'build', 'care', 'unsure']

export const TIMINGS = ['unsure', 'asap', 'weeks', 'months', 'flexible'] as const
export type TimingId = (typeof TIMINGS)[number]

/** The four steps, in order. */
export const STEPS = ['project', 'details', 'extras', 'contact'] as const
export type StepId = (typeof STEPS)[number]

/** What the visitor has typed or chosen so far. Empty strings and `null` mean "not answered". */
export interface QuoteDraft {
  projectType: ProjectTypeId | null
  package: PackageChoice | null
  description: string
  reference: string
  budget: string
  timing: TimingId | null
  name: string
  email: string
  phone: string
  consent: boolean
}

export const EMPTY_DRAFT: QuoteDraft = {
  projectType: null,
  package: null,
  description: '',
  reference: '',
  budget: '',
  timing: null,
  name: '',
  email: '',
  phone: '',
  consent: false,
}

/** Every field, so a step can say which of them it owns. */
export type FieldId = keyof QuoteDraft

/** What the form sends. Optional answers that were left empty are `null`, not empty strings. */
export interface QuoteRequest {
  language: Language
  projectType: ProjectTypeId
  package: PackageChoice
  description: string
  reference: string | null
  budget: string | null
  timing: TimingId | null
  name: string
  email: string
  phone: string | null
}
