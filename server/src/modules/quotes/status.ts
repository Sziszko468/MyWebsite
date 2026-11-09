/**
 * The life of a quote request, and the rules for moving along it.
 *
 * Eleven states are shown to the administrator: the ten below and *archived*, which is a flag (`archived_at`) and not a place in the
 * sequence: an archived request keeps the status it had, and restoring it brings it back as it was.
 *
 * Accepting a quotation and starting the work are two different events, so `accepted` does not become `in_progress` by itself.
 * `quote_sent` is reached only by sending a quotation, and `accepted` / `declined` are reached by the customer's own act on the
 * quotation page; an administrator can record either of those only by saying (in a note) that it happened outside the page.
 */

export const REQUEST_STATUSES = ['new', 'under_review', 'waiting_customer', 'quote_preparation', 'quote_sent', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const isStatus = (value: unknown): value is RequestStatus => typeof value === 'string' && (REQUEST_STATUSES as readonly string[]).includes(value)

const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  new: ['under_review', 'waiting_customer', 'quote_preparation', 'cancelled'],
  under_review: ['waiting_customer', 'quote_preparation', 'cancelled'],
  waiting_customer: ['under_review', 'quote_preparation', 'cancelled'],
  quote_preparation: ['under_review', 'waiting_customer', 'cancelled'],
  quote_sent: ['under_review', 'quote_preparation', 'waiting_customer', 'accepted', 'declined', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  declined: ['under_review', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['in_progress'],
  cancelled: ['under_review'],
}

/** Whether the model allows this move at all. */
export const mayMove = (from: RequestStatus, to: RequestStatus): boolean => from !== to && TRANSITIONS[from].includes(to)

export const nextStatuses = (from: RequestStatus): readonly RequestStatus[] => TRANSITIONS[from]

/** Reached only through the quotation (sending it) or the customer: an administrator cannot pick it from the status list. */
export const SYSTEM_ONLY: readonly RequestStatus[] = ['quote_sent']

/** Moves that need the administrator to write down why: they stand in for something the customer should have done on the page. */
export const NEEDS_NOTE: readonly RequestStatus[] = ['accepted', 'declined']

export type ManualCheck = { ok: true } | { ok: false; reason: 'invalid_transition' | 'system_only' | 'note_required' }

/** What an administrator may do from `from` to `to`. */
export function checkManualMove(from: RequestStatus, to: RequestStatus, note: string): ManualCheck {
  if (from === to) return { ok: false, reason: 'invalid_transition' }
  if (SYSTEM_ONLY.includes(to)) return { ok: false, reason: 'system_only' }
  if (!mayMove(from, to)) return { ok: false, reason: 'invalid_transition' }
  if (NEEDS_NOTE.includes(to) && note.trim().length < 3) return { ok: false, reason: 'note_required' }
  return { ok: true }
}

export const REQUEST_TYPES = ['standard_inquiry', 'package_quote', 'custom_service', 'full_experience', 'custom_application', 'custom_website', 'ai_project', 'general_business'] as const
export type RequestType = (typeof REQUEST_TYPES)[number]
export const isRequestType = (value: unknown): value is RequestType => typeof value === 'string' && (REQUEST_TYPES as readonly string[]).includes(value)

export const SOURCES = ['shop', 'control_room_ai', 'contact_form', 'other'] as const
export type RequestSource = (typeof SOURCES)[number]

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]
export const isPriority = (value: unknown): value is Priority => typeof value === 'string' && (PRIORITIES as readonly string[]).includes(value)

/** The statuses that mean the customer's work with us is going on (for the overview's "active projects"). */
export const ACTIVE: readonly RequestStatus[] = ['in_progress']
