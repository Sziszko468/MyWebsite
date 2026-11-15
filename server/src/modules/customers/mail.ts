import type { Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { ConstraintError } from '../../http/errors.ts'
import { renderWorkMail, type WorkMailKind } from '../notifications/workTemplates.ts'
import { AWAITING_RESPONSE, FINISHED_TASK, type ActionRow, type TaskRow } from '../projectwork/model.ts'
import { renderClientLink, renderDeletionRequested, renderDocumentPublished, renderProjectCreated, renderProjectUpdate, renderSecurityNotice, maskEmail, type ClientMailKind, type NoticeKind } from '../notifications/clientTemplates.ts'
import { MailError } from '../notifications/smtp.ts'
import type { Rendered } from '../notifications/templates.ts'
import { getCustomer } from './accounts.ts'
import { mintLinkToken } from './auth.ts'
import type { AuthRequestRow, DocumentRow, ProjectEventRow, ProjectRow, ProjectStatus } from './model.ts'

/**
 * Putting the portal's messages in the outbox, and writing them when they are sent. The outbox keeps only the kind and what the message is about (a request for
 * a link, a line of the account's history, a project's event, a document, an account); the words, the project's current name and the secret in a link are made
 * at the moment of sending. A message about something that was erased since is not sent (the outbox marks it cancelled), and a customer who was switched off
 * gets nothing more.
 */

type Deps = Pick<AppContext, 'db' | 'config' | 'clock'>

export type ClientRelated = 'client_auth' | 'client_audit' | 'client_project_event' | 'client_document' | 'client_action_reminder'

/** Queues one message. The database allows one of each kind per thing it is about, so a retried request or a handler that runs twice makes no second message. Never throws: a message that cannot be queued must not undo what it announces. */
export function queueClientMail(app: Pick<AppContext, 'notifier' | 'log'>, input: { kind: ClientMailKind; relatedType: ClientRelated; relatedId: string; recipient: string; language: Language }): boolean {
  if (!app.notifier.enabled) return false
  try {
    app.notifier.enqueue({ kind: input.kind, relatedType: input.relatedType, relatedId: input.relatedId, recipient: input.recipient, language: input.language })
    return true
  } catch (error) {
    if (error instanceof ConstraintError && error.kind === 'unique') return true
    app.log.error('could not queue a portal e-mail', { kind: input.kind, error })
    return false
  }
}

const portalUrl = (deps: Deps, lang: Language, path = ''): string | null => (deps.config.publicUrl ? `${deps.config.publicUrl}/${lang}/client-portal/${path}` : null)

export function renderClientDelivery(deps: Deps, row: { kind: string; related_type: string; related_id: string; language: Language }, brand: string): Rendered | null {
  const { db, config } = deps
  const lang = row.language
  switch (row.related_type) {
    case 'client_auth': {
      const request = db.get<AuthRequestRow>('SELECT * FROM customer_auth_requests WHERE id = ?', [row.related_id])
      if (!request) return null
      const customer = request.customer_id ? getCustomer(deps, request.customer_id) : undefined
      // The account was switched off or erased after the link was asked for: nobody is sent a way in.
      if (request.customer_id && (!customer || customer.status === 'disabled')) return null
      // A link that cannot be built is not a link: refuse to write the message rather than send one with nothing to open.
      if (!config.publicUrl) throw new MailError('The site address (PUBLIC_URL) is not set, so the link cannot be built.', { transient: false, reason: 'rejected' })
      const minted = mintLinkToken(deps, request)
      // The secret is after the `#`: a browser never sends that part to a server, a log or another site.
      const url = `${config.publicUrl}/${lang}/client-portal/verify#${minted.token}`
      const validFor = request.purpose === 'activate' ? { unit: 'hours' as const, count: config.client.inviteHours } : { unit: 'minutes' as const, count: config.client.linkMinutes }
      return renderClientLink(row.kind as 'client_sign_in' | 'client_activate' | 'client_register' | 'client_email_change', { name: customer?.name ?? null, url, validFor }, lang, brand)
    }
    case 'client_audit': {
      const event = db.get<{ customer_id: string; event_type: string; detail: string | null; created_at: string }>('SELECT customer_id, event_type, detail, created_at FROM customer_audit_events WHERE id = ?', [Number(row.related_id)])
      if (!event) return null
      const customer = getCustomer(deps, event.customer_id)
      if (!customer) return null
      // The owner's notice that this customer asked to be deleted (about the same line of history as the customer's own receipt).
      if (row.kind === 'client_deletion_requested_admin') return renderDeletionRequested({ name: customer.name, email: customer.email, company: customer.company }, lang, brand, config.publicUrl ? `${config.publicUrl}/admin/clients/${customer.id}` : null)
      const kind = event.event_type as NoticeKind
      const pending = kind === 'email_change_requested' ? db.get<{ email: string }>("SELECT email FROM customer_auth_requests WHERE customer_id = ? AND purpose = 'email_change' ORDER BY created_at DESC, rowid DESC LIMIT 1", [customer.id]) : undefined
      return renderSecurityNotice(kind, { name: customer.name, at: event.created_at, maskedNewAddress: pending ? maskEmail(pending.email) : null }, lang, brand)
    }
    case 'client_project_event': {
      const event = db.get<ProjectEventRow>('SELECT * FROM client_project_events WHERE id = ?', [Number(row.related_id)])
      if (!event) return null
      const project = db.get<ProjectRow>('SELECT * FROM client_projects WHERE id = ?', [event.project_id])
      const customer = project ? getCustomer(deps, project.customer_id) : undefined
      if (!project || !customer || customer.status === 'disabled') return null
      // A message about a change says the status that change made, not the one the project has by the time the message is written.
      const mail = { name: project.name, reference: project.reference, status: (event.event_type === 'status_changed' ? (event.to_status as ProjectStatus | null) : null) ?? project.status, customerName: customer.name }
      const url = portalUrl(deps, lang, `projects/${project.reference}`)
      if (event.event_type === 'created') return renderProjectCreated(mail, lang, brand, url)
      if (event.event_type === 'status_changed' || event.event_type === 'feedback_requested' || event.event_type === 'update_posted') return renderProjectUpdate(event.event_type, mail, event.note, lang, brand, url)
      // The project work: the message is about ONE line of the history, and says what that line says.
      if (row.kind === 'client_milestone_completed') {
        const milestone = event.milestone_id ? db.get<{ title: string; customer_visible: number }>('SELECT title, customer_visible FROM client_milestones WHERE id = ?', [event.milestone_id]) : undefined
        if (!milestone || milestone.customer_visible !== 1) return null
        return renderWorkMail('client_milestone_completed', { project: mail, customerName: customer.name, task: null, dueOn: null, milestone: milestone.title, note: null }, lang, brand, url)
      }
      if (isWorkKind(row.kind)) {
        const action = event.action_id ? db.get<ActionRow>('SELECT * FROM project_customer_actions WHERE id = ?', [event.action_id]) : undefined
        const task = action ? db.get<TaskRow>('SELECT * FROM project_tasks WHERE id = ?', [action.task_id]) : undefined
        // A task the customer cannot see is never written about, and an action that is gone is not announced.
        if (!action || !task || task.customer_visible !== 1) return null
        const input = { project: mail, customerName: customer.name, task: task.title, dueOn: task.due_on, note: null as string | null }
        if (row.kind === 'client_action_submitted_admin') return renderWorkMail(row.kind, { ...input, customerEmail: customer.email }, lang, brand, config.publicUrl ? `${config.publicUrl}/admin/client-projects/${project.id}` : null)
        if (row.kind === 'client_action_assigned') return renderWorkMail(row.kind, { ...input, note: action.instruction }, lang, brand, url)
        if (row.kind === 'client_action_changes_requested') return renderWorkMail(row.kind, { ...input, note: event.note }, lang, brand, url)
        return renderWorkMail(row.kind, input, lang, brand, url)
      }
      return null
    }
    case 'client_action_reminder': {
      // `related_id` is `<action id>:<due date>`: a reminder is about one action on ONE date, so a date that moved is a different reminder and an old one is not sent.
      const [actionId, dueOn] = row.related_id.split(':')
      const action = db.get<ActionRow>('SELECT * FROM project_customer_actions WHERE id = ?', [actionId])
      const task = action ? db.get<TaskRow>('SELECT * FROM project_tasks WHERE id = ?', [action.task_id]) : undefined
      const project = action ? db.get<ProjectRow>('SELECT * FROM client_projects WHERE id = ?', [action.project_id]) : undefined
      const customer = project ? getCustomer(deps, project.customer_id) : undefined
      if (!action || !task || !project || !customer || customer.status === 'disabled') return null
      // Nothing to remind about once the customer answered, the action or the task was finished, the task was hidden, or its date moved.
      if (!AWAITING_RESPONSE.includes(action.status) || FINISHED_TASK.includes(task.status) || task.customer_visible !== 1 || task.due_on !== dueOn) return null
      const kind = row.kind as WorkMailKind
      if (kind !== 'client_action_due_soon' && kind !== 'client_action_overdue') return null
      return renderWorkMail(kind, { project: { name: project.name, reference: project.reference, status: project.status }, customerName: customer.name, task: task.title, dueOn: task.due_on, note: action.instruction }, lang, brand, portalUrl(deps, lang, `projects/${project.reference}`))
    }
    case 'client_document': {
      const doc = db.get<DocumentRow>('SELECT * FROM client_documents WHERE id = ?', [row.related_id])
      // A document that is not published (any more) is not announced.
      if (!doc || !doc.published_at) return null
      const project = db.get<ProjectRow>('SELECT * FROM client_projects WHERE id = ?', [doc.project_id])
      const customer = project ? getCustomer(deps, project.customer_id) : undefined
      if (!project || !customer || customer.status === 'disabled') return null
      return renderDocumentPublished({ name: project.name, reference: project.reference, status: project.status, customerName: customer.name }, doc.title, lang, brand, portalUrl(deps, lang, 'documents'))
    }
    default:
      return null
  }
}

const WORK_KINDS: readonly string[] = ['client_action_assigned', 'client_action_reviewed', 'client_action_changes_requested', 'client_action_submitted_admin']
const isWorkKind = (kind: string): kind is 'client_action_assigned' | 'client_action_reviewed' | 'client_action_changes_requested' | 'client_action_submitted_admin' => WORK_KINDS.includes(kind)

/** The address of the customer a message to the owner is about (through the line of their history it is about), so the owner can answer them straight from the mail program. */
export function clientCustomerAddress(deps: Pick<AppContext, 'db'>, relatedType: string, relatedId: string): string | null {
  if (relatedType === 'client_project_event') {
    const owner = deps.db.get<{ customer_id: string }>('SELECT p.customer_id FROM client_project_events e JOIN client_projects p ON p.id = e.project_id WHERE e.id = ?', [Number(relatedId)])
    return owner ? (getCustomer(deps, owner.customer_id)?.email ?? null) : null
  }
  const event = deps.db.get<{ customer_id: string }>('SELECT customer_id FROM customer_audit_events WHERE id = ?', [Number(relatedId)])
  return event ? (getCustomer(deps, event.customer_id)?.email ?? null) : null
}
