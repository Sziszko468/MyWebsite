import type { LabId } from '../content/lab'
import type { ExtraId } from '../content/services/addons'
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
  /** A request or message was sent and the receiving end said it arrived. `full-experience`: the custom project request (no cart lines). */
  quote_request_submitted: { form: 'inquiry' | 'contact' | 'full-experience'; items: number }
  /** The Shop's front page was opened (PROMPT 20). */
  shop_opened: Record<string, never>
  /** A package's own page was opened. */
  package_viewed: { plan: PlanId }
  /** The package comparison came into view (once per visit to the front page). */
  comparison_viewed: Record<string, never>
  /** An add-on was put on a line of the cart: which service and which add-on (ids), never anything typed. */
  addon_selected: { need: NeedId; extra: ExtraId }
  /** The request builder or the FULL EXPERIENCE configurator was opened. */
  configurator_started: { flow: 'builder' | 'full-experience' }
  /** The package finder showed a suggestion: which package (an id). */
  recommendation_viewed: { plan: PlanId }
  /** The review of a request was on the screen before it was sent. */
  summary_viewed: { flow: 'builder' | 'full-experience' }
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
  'shop_opened',
  'package_viewed',
  'comparison_viewed',
  'addon_selected',
  'configurator_started',
  'recommendation_viewed',
  'summary_viewed',
  'project_opened',
  'lab_experience_opened',
]
