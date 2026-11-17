import type { AppContext } from '../../context.ts'
import { getCustomer } from '../customers/accounts.ts'
import { queueClientMail } from '../customers/mail.ts'
import type { CommunicationMailKind } from '../notifications/communicationTemplates.ts'
import type { CommunicationSettings, MessagePreferences } from './model.ts'
import { readPreferences } from './preferences.ts'
import { communicationSettings } from './settings.ts'

/**
 * The e-mails of the communication system. Each is about ONE line of a conversation (`related_id` is the message's id) and the outbox allows one message of a kind per such line,
 * so a retried request, a double click or a handler that runs twice cannot make a second one. A message is queued only if BOTH the owner's switch and the customer's own choice
 * allow it; the owner's switch is the wider one (a message the owner switched off is never sent, whatever the customer chose). The words are written at the moment of sending
 * from the record (customers/mail.ts) and say nothing of what was written (communicationTemplates.ts); this file knows nothing of the text of a message at all.
 */

type CustomerKind = 'client_message_reply' | 'client_message_announcement' | 'client_message_important' | 'client_conversation_resolved'

const CUSTOMER_SWITCH: Record<CustomerKind, { owner: keyof CommunicationSettings; customer: keyof MessagePreferences }> = {
  client_message_reply: { owner: 'replies', customer: 'replies' },
  client_message_announcement: { owner: 'announcements', customer: 'announcements' },
  client_message_important: { owner: 'important', customer: 'important' },
  client_conversation_resolved: { owner: 'resolution', customer: 'resolution' },
}

const OWNER_SWITCH: Record<'message_received_admin' | 'resolution_requested_admin', keyof CommunicationSettings> = {
  message_received_admin: 'messageToOwner',
  resolution_requested_admin: 'resolutionRequested',
}

/** Queues the message for the customer (in their language) unless the owner or the customer switched it off, or the account is off. Never throws. */
export function tellCustomerAbout(app: AppContext, customerId: string, kind: CustomerKind, messageId: string): boolean {
  const gate = CUSTOMER_SWITCH[kind]
  if (!communicationSettings(app)[gate.owner]) return false
  const customer = getCustomer(app, customerId)
  if (!customer || customer.status === 'disabled') return false
  if (!readPreferences(app, customerId)[gate.customer]) return false
  return queueClientMail(app, { kind: kind as CommunicationMailKind, relatedType: 'conversation_message', relatedId: messageId, recipient: customer.email, language: customer.language })
}

/** Queues the message for the owner (`NOTIFY_TO`, in `NOTIFY_LANGUAGE`) unless it is switched off or there is nowhere to send it. Never throws. */
export function tellOwnerAbout(app: AppContext, kind: 'message_received_admin' | 'resolution_requested_admin', messageId: string): boolean {
  if (!communicationSettings(app)[OWNER_SWITCH[kind]]) return false
  const to = app.config.email.notifyTo
  if (!to) return false
  return queueClientMail(app, { kind: kind as CommunicationMailKind, relatedType: 'conversation_message', relatedId: messageId, recipient: to, language: app.config.email.notifyLanguage })
}
