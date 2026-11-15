import type { AppContext } from '../../context.ts'
import { getCustomer } from '../customers/accounts.ts'
import { queueClientMail } from '../customers/mail.ts'
import type { DeliverableMailKind } from '../notifications/deliverableTemplates.ts'
import type { DeliverableSettings } from './model.ts'
import { deliverableSettings } from './settings.ts'

/**
 * The e-mails of the feedback and approval work. Each is about ONE line of the deliverable's history (`related_id` is the event's id), and the outbox allows one message of a
 * kind per such line, so a retried request, a double click or a handler that runs twice cannot make a second one. Each is switchable by the owner; a message that would go to a
 * customer who was switched off is not queued; the words are written at the moment of sending from the record (customers/mail.ts), and never carry a private note.
 */

const SWITCH: Record<DeliverableMailKind, keyof DeliverableSettings> = {
  client_deliverable_ready: 'ready',
  client_deliverable_new_version: 'newVersion',
  client_deliverable_approval_requested: 'approvalRequested',
  client_deliverable_reply: 'reply',
  deliverable_feedback_admin: 'feedback',
  deliverable_changes_requested_admin: 'changesRequested',
  deliverable_approved_admin: 'approved',
}

/** Queues the message for the project's customer (in their language), unless the owner switched it off or the account is off. Never throws. */
export function tellCustomer(app: AppContext, customerId: string, kind: DeliverableMailKind, eventId: number): void {
  if (!deliverableSettings(app)[SWITCH[kind]]) return
  const customer = getCustomer(app, customerId)
  if (!customer || customer.status === 'disabled') return
  queueClientMail(app, { kind, relatedType: 'deliverable_event', relatedId: String(eventId), recipient: customer.email, language: customer.language })
}

/** Queues the message for the owner (`NOTIFY_TO`, in `NOTIFY_LANGUAGE`), unless it is switched off or there is nowhere to send it. Never throws. */
export function tellOwner(app: AppContext, kind: DeliverableMailKind, eventId: number): void {
  if (!deliverableSettings(app)[SWITCH[kind]]) return
  const to = app.config.email.notifyTo
  if (!to) return
  queueClientMail(app, { kind, relatedType: 'deliverable_event', relatedId: String(eventId), recipient: to, language: app.config.email.notifyLanguage })
}
