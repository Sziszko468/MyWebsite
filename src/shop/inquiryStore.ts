import type { PlanId } from '../content/services/ids'
import { EMPTY_DETAILS, type Details, type StepId } from './inquiry'
import { createStore } from './store'

/**
 * The configurator's state besides the cart: the answers, the step the visitor is on and a package
 * they arrived with. It lives in memory for as long as the page is open and nowhere else: no
 * storage, no cookie, nothing in the address bar. A reload starts a blank request, which is the
 * point: personal details never sit in storage. Being a module-level store, it also survives a
 * visit to another page and a change of language.
 */

export interface InquiryState {
  details: Details
  step: StepId
  /** A package chosen on the services page; it is given to the first service the visitor then picks, if it suits it. */
  pendingPlan: PlanId | null
}

export const INITIAL_INQUIRY: InquiryState = { details: EMPTY_DETAILS, step: 'need', pendingPlan: null }

export const inquiryStore = createStore<InquiryState>(INITIAL_INQUIRY)

export const inquiryActions = {
  setDetail<K extends keyof Details>(field: K, value: Details[K]) {
    inquiryStore.update((state) => (state.details[field] === value ? state : { ...state, details: { ...state.details, [field]: value } }))
  },
  setStep: (step: StepId) => inquiryStore.update((state) => (state.step === step ? state : { ...state, step })),
  setPendingPlan: (pendingPlan: PlanId | null) =>
    inquiryStore.update((state) => (state.pendingPlan === pendingPlan ? state : { ...state, pendingPlan })),
  /** After a successful send: the answers go, the visitor starts again from the first step. */
  reset: () => inquiryStore.update(() => INITIAL_INQUIRY),
}
