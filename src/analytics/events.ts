import type { LabId } from '../content/lab'
import type { NeedId, PlanId, ServiceId } from '../content/services/ids'

/**
 * Every event the site can report, and the only things an event may carry: the id of something the
 * visitor looked at (a service, a package, a project, an experiment), a yes/no, or a count. There is no
 * free-text property on purpose: a project description, a name, an e-mail address or anything typed
 * into a form has no place in this list, and `sanitize` (tracker.ts) drops whatever does not fit as
 * well, so a mistake at a call site cannot leak text.
 */
export interface AnalyticsEvents {
  /** A service's page was opened. */
  service_viewed: { service: ServiceId }
  /** A package (or "custom") was chosen for a need, on a service page, in the builder or in the cart. */
  package_selected: { need: NeedId; plan: PlanId }
  /** The request builder reached its last step. `needs` is how many services are in the request. */
  configurator_completed: { needs: number }
  /** A request or message was sent and the receiving end said it arrived. */
  quote_request_submitted: { form: 'inquiry' | 'contact'; items: number }
  /** A project's page was opened. The project is its address (a slug: lowercase letters, digits and hyphens, chosen by the owner). */
  project_opened: { project: string }
  /** A Lab experience was opened. */
  lab_experience_opened: { experiment: LabId }
}

export type EventName = keyof AnalyticsEvents

/** What a provider receives. `page` is the path only (no query, no fragment). */
export interface AnalyticsEvent {
  name: EventName
  props: Record<string, string | number | boolean>
  page: string
  lang: string
  /** Milliseconds since 1970, set when the event happened. */
  time: number
}

/** A destination for events. The site knows nothing about any vendor: a provider is anything with this shape. */
export interface AnalyticsProvider {
  id: string
  send(event: AnalyticsEvent): void
}

export const EVENT_NAMES: readonly EventName[] = [
  'service_viewed',
  'package_selected',
  'configurator_completed',
  'quote_request_submitted',
  'project_opened',
  'lab_experience_opened',
]
