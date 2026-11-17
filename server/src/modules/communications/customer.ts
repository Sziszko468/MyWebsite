import type { AppContext } from '../../context.ts'
import { refuse } from '../customers/projects.ts'
import type { ContextType, MessagePreferences } from './model.ts'
import { markRead } from './reads.ts'
import { readPreferences, savePreferences } from './preferences.ts'
import { createThread, postMessage, requestResolution, resolveContext, takesCustomerMessage } from './service.ts'
import { communicationSettings } from './settings.ts'
import { ownConversation, type PortalConversation, customerConversation } from './views.ts'

/**
 * What a customer can do (PROMPT 28). Every function takes the customer's id from the SESSION and looks every conversation up THROUGH it: a conversation that is not theirs, or is
 * not visible to them yet, is a 404 like one that does not exist. Who the sender is, which customer, which project, and what status a thread has are never read from a request.
 */

const PAGE = { before: null, limit: 30 } as const

export interface ContextOption {
  type: ContextType
  reference: string
  label: string
  project: string | null
}

/** What a thread can be about, for this customer: the records they can see in the portal, a few dozen of each. */
export function contextOptions(app: Pick<AppContext, 'db'>, customerId: string): ContextOption[] {
  const out: ContextOption[] = []
  for (const row of app.db.all<{ reference: string; name: string }>('SELECT reference, name FROM client_projects WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50', [customerId])) {
    out.push({ type: 'project', reference: row.reference, label: row.name, project: row.reference })
  }
  for (const row of app.db.all<{ reference: string; title: string; project: string }>(
    'SELECT d.reference, d.title, p.reference AS project FROM deliverables d JOIN client_projects p ON p.id = d.project_id WHERE p.customer_id = ? AND d.published_at IS NOT NULL ORDER BY d.published_at DESC LIMIT 50',
    [customerId],
  )) {
    out.push({ type: 'deliverable', reference: row.reference, label: row.title, project: row.project })
  }
  for (const row of app.db.all<{ reference: string; title: string; project: string }>(
    'SELECT t.reference, t.title, p.reference AS project FROM project_tasks t JOIN client_projects p ON p.id = t.project_id WHERE p.customer_id = ? AND t.customer_visible = 1 ORDER BY t.created_at DESC LIMIT 50',
    [customerId],
  )) {
    out.push({ type: 'task', reference: row.reference, label: row.title, project: row.project })
  }
  for (const row of app.db.all<{ reference: string }>('SELECT b.reference FROM bookings b JOIN customer_links l ON l.booking_id = b.id WHERE l.customer_id = ? ORDER BY b.start_at DESC LIMIT 50', [customerId])) {
    out.push({ type: 'booking', reference: row.reference, label: row.reference, project: null })
  }
  for (const row of app.db.all<{ reference: string }>('SELECT q.reference FROM quote_requests q JOIN customer_links l ON l.quote_request_id = q.id WHERE l.customer_id = ? ORDER BY q.created_at DESC LIMIT 50', [customerId])) {
    out.push({ type: 'quote', reference: row.reference, label: row.reference, project: null })
  }
  return out
}

/** A customer starts a conversation, when the owner has allowed it. */
export function startConversation(
  app: AppContext,
  customerId: string,
  input: { subject: string; body: string; context: { type: ContextType; reference: string } | null; clientToken: string | null },
): PortalConversation {
  if (!communicationSettings(app).customerCanStart) throw refuse('Starting a conversation is not open to customers.', 'start_closed')
  const context = resolveContext(app, customerId, input.context)
  const { conversation } = createThread(app, { customerId, starter: { type: 'customer', id: customerId }, subject: input.subject, body: input.body, context, clientToken: input.clientToken })
  return customerConversation(app, customerId, conversation.reference, PAGE)
}

/** A customer writes in a conversation of theirs. */
export function reply(app: AppContext, customerId: string, reference: string, input: { body: string; clientToken: string | null }): PortalConversation {
  const conversation = ownConversation(app, customerId, reference)
  if (!takesCustomerMessage(conversation)) throw refuse(conversation.kind === 'activity' ? 'An activity feed is read only.' : 'This conversation is archived.', conversation.kind === 'activity' ? 'read_only' : 'archived')
  postMessage(app, { conversation, sender: { type: 'customer', id: customerId }, kind: 'reply', body: input.body, clientToken: input.clientToken })
  return customerConversation(app, customerId, reference, PAGE)
}

/** The customer's screen has shown messages up to `upTo`: their marker moves there (never past what exists and is visible to them, never back). */
export function markConversationRead(app: AppContext, customerId: string, reference: string, upTo: number): { marker: number } {
  const conversation = ownConversation(app, customerId, reference)
  return { marker: markRead(app, conversation, { type: 'customer', id: customerId }, upTo) }
}

export function askForResolution(app: AppContext, customerId: string, reference: string): PortalConversation {
  const conversation = ownConversation(app, customerId, reference)
  requestResolution(app, conversation, customerId)
  return customerConversation(app, customerId, reference, PAGE)
}

export const preferencesOf = (app: Pick<AppContext, 'db'>, customerId: string): MessagePreferences & { customersCanStart: boolean; attachments: false } => ({
  ...readPreferences(app, customerId),
  customersCanStart: communicationSettings(app).customerCanStart,
  // There is no private place to keep a file, so a message carries words only (docs/client-communication/SECURITY.md).
  attachments: false,
})

export const savePreferencesOf = (app: AppContext, customerId: string, changes: Partial<MessagePreferences>): MessagePreferences => savePreferences(app, customerId, changes)
