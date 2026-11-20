import { LANGUAGES, type Language } from '../../../config.ts'
import type { AppContext, SessionInfo } from '../../../context.ts'
import { HttpError } from '../../../http/errors.ts'
import { cleanBlock, cleanLine } from '../../../lib/text.ts'
import { can } from '../../auth/permissions.ts'
import { loadHours } from '../../bookings/availability.ts'
import { checkClosure, closeDays } from '../../bookings/admin.ts'
import { addProjectNote, setProjectStatus } from '../../customers/admin.ts'
import { canMoveProject, PROJECT_STATUSES, TERMINAL_STATUSES, type ProjectStatus } from '../../customers/model.ts'
import { getProject } from '../../customers/projects.ts'
import { changeStatus as changeQuoteRequestStatus } from '../../quotes/admin.ts'
import { getQuote } from '../../quotes/repository.ts'
import { checkManualMove } from '../../quotes/status.ts'
import { containsMoney, cut } from '../adminassistant/model.ts'
import { findSensitive } from '../sensitive.ts'
import { ActionProblem, CATALOG, fingerprintOf, LIMITS, type ActionType, type Payload, type Preview, type Target } from './model.ts'

/**
 * The five actions of controlled automation (PROMPT 33), each in the same three parts:
 *
 *   - `parse`: what the parameters may be (a closed set of keys, each checked; anything else is refused). Used when the assistant proposes AND again, on the stored payload, before it runs.
 *   - `assess`: the target as it is NOW, the business rules applied to it, the preview an administrator decides on, and a fingerprint of the part of the target's state the action depends on.
 *     Used when it is proposed, when it is approved and immediately before it runs; a different fingerprint means the approval no longer holds.
 *   - `execute`: the work, done by the EXISTING business function with the approving administrator's own session (so that function checks the permission again and writes its own
 *     history and audit line under that person's name). An action adds no rule of its own to what the function allows, only more refusals.
 *
 * None of them can send an e-mail or a message: every service call passes `notify: false` (and `show: false`), and the actions that would reach a customer's inbox are not here.
 */

export interface Assessed {
  target: Target
  preview: Preview
  fingerprint: string
  /** Whether this particular use needs the second confirmation. */
  secondConfirmation: boolean
}

interface Action {
  parse(raw: unknown): Record<string, unknown>
  assess(app: AppContext, session: SessionInfo, targetId: string | null, params: Record<string, unknown>, language: Language): Assessed
  execute(app: AppContext, session: SessionInfo, payload: Payload): Record<string, unknown>
}

const fail = (code: ConstructorParameters<typeof ActionProblem>[0] = 'validation_failed'): never => {
  throw new ActionProblem(code)
}

/** The permission this action needs, checked with the CURRENT role: the same `can` the rest of the administration uses. */
function need(session: SessionInfo, type: ActionType): void {
  if (!can(session.role, CATALOG[type].permission) || !can(session.role, 'assistant:use')) fail('permission_lost')
}

function strictObject(raw: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail()
  const record = raw as Record<string, unknown>
  for (const key of Object.keys(record)) if (!allowed.includes(key)) fail()
  return record
}

/** A text the assistant wrote: cleaned, within its length, and without an amount of money or anything that looks like a secret or a card number. */
function writtenText(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string') return fail()
  const text = cleanBlock(value)
  const length = [...text].length
  if (length < min || length > max) fail()
  if (containsMoney(text) || findSensitive(text) !== null) fail()
  return text
}

const asLanguage = (value: unknown): Language => ((LANGUAGES as readonly string[]).includes(value as string) ? (value as Language) : fail())

// ---- a draft reply to a customer: kept, never sent -------------------------------------------------------------------------------------------

interface ConversationRow {
  id: string
  reference: string
  status: string
  last_message_at: string | null
  customer_language: string
}

const conversationOf = (app: AppContext, id: string | null): ConversationRow | undefined =>
  id === null
    ? undefined
    : app.db.get<ConversationRow>("SELECT c.id, c.reference, c.status, c.last_message_at, cu.language AS customer_language FROM conversations c JOIN customers cu ON cu.id = c.customer_id WHERE c.id = ? AND c.kind = 'thread'", [id])

const draftReply: Action = {
  parse(raw) {
    const input = strictObject(raw, ['language', 'adminAskedForThisLanguage', 'draft'])
    return { language: asLanguage(input.language), adminAskedForThisLanguage: input.adminAskedForThisLanguage === true, draft: writtenText(input.draft, 10, LIMITS.draft) }
  },
  assess(app, session, targetId, params) {
    need(session, 'communication.draft_reply')
    const conversation = conversationOf(app, targetId) ?? fail('target_missing')
    // The draft follows the customer's own language unless the administrator asked for another (the assistant says so when it proposes).
    if (params.language !== conversation.customer_language && params.adminAskedForThisLanguage !== true) fail()
    return {
      target: { type: 'conversation', id: conversation.id, reference: conversation.reference },
      preview: {
        records: [{ type: 'conversation', reference: conversation.reference, label: null }],
        changes: [],
        contents: [{ kind: 'draft_reply', text: params.draft as string, language: params.language as Language }],
        sideEffects: [...CATALOG['communication.draft_reply'].sideEffects],
        reversible: 'not_applicable',
        customerVisible: false,
        secondConfirmation: false,
      },
      fingerprint: fingerprintOf({ id: conversation.id, status: conversation.status, lastMessageAt: conversation.last_message_at, customerLanguage: conversation.customer_language }),
      secondConfirmation: false,
    }
  },
  execute(_app, _session, payload) {
    // Nothing is written to a customer's record and nothing is sent. Approving keeps the wording with the action; the administrator copies it and sends it from the conversation page.
    return { draftKept: true, characters: [...(payload.params.draft as string)].length, canBeSentFromHere: false }
  },
}

// ---- an internal note on a project -----------------------------------------------------------------------------------------------------------

const projectNote: Action = {
  parse(raw) {
    const input = strictObject(raw, ['body'])
    return { body: writtenText(input.body, 2, LIMITS.note) }
  },
  assess(app, session, targetId, params) {
    need(session, 'project.note_add')
    const project = (targetId === null ? undefined : getProject(app, targetId)) ?? fail('target_missing')
    return {
      target: { type: 'project', id: project.id, reference: project.reference },
      preview: {
        records: [{ type: 'project', reference: project.reference, label: cut(project.name, 80) }],
        changes: [],
        contents: [{ kind: 'note', text: params.body as string }],
        sideEffects: [...CATALOG['project.note_add'].sideEffects],
        reversible: 'no',
        customerVisible: false,
        secondConfirmation: false,
      },
      fingerprint: fingerprintOf({ id: project.id, status: project.status }),
      secondConfirmation: false,
    }
  },
  execute(app, session, payload) {
    const made = addProjectNote(app, session, payload.target.id as string, { body: payload.params.body })
    return { noteAdded: true, noteId: made.id }
  },
}

// ---- a project's status -----------------------------------------------------------------------------------------------------------------------

const projectStatus: Action = {
  parse(raw) {
    const input = strictObject(raw, ['status', 'customerNote'])
    if (typeof input.status !== 'string' || !(PROJECT_STATUSES as readonly string[]).includes(input.status)) fail()
    // The words the customer will SEE next to the change in their portal: optional, short, no amounts, no secrets.
    const note = input.customerNote === undefined || input.customerNote === null || input.customerNote === '' ? null : writtenText(input.customerNote, 2, LIMITS.customerNote)
    return { status: input.status, customerNote: note }
  },
  assess(app, session, targetId, params) {
    need(session, 'project.status_change')
    const project = (targetId === null ? undefined : getProject(app, targetId)) ?? fail('target_missing')
    const to = params.status as ProjectStatus
    if (!canMoveProject(project.status, to)) fail('invalid_transition')
    const terminal = TERMINAL_STATUSES.includes(to)
    const starts = project.status === 'awaiting_start' && ['discovery', 'planning', 'design', 'development'].includes(to) && project.started_on === null
    const note = params.customerNote as string | null
    return {
      target: { type: 'project', id: project.id, reference: project.reference },
      preview: {
        records: [{ type: 'project', reference: project.reference, label: cut(project.name, 80) }],
        changes: [{ field: 'status', before: project.status, after: to }, ...(starts ? [{ field: 'startedOn', before: null, after: 'today' }] : []), ...(to === 'completed' ? [{ field: 'completedAt', before: null, after: 'now' }] : [])],
        contents: note ? [{ kind: 'customer_note', text: note }] : [],
        sideEffects: ['customer_sees_status', ...(note ? (['customer_sees_note'] as const) : []), 'history_line_recorded', 'no_email_sent', ...(terminal ? (['terminal_status'] as const) : []), ...(starts ? (['start_date_set'] as const) : [])],
        reversible: terminal || starts ? 'partly' : 'yes',
        customerVisible: true,
        secondConfirmation: terminal,
      },
      fingerprint: fingerprintOf({ id: project.id, status: project.status, startedOn: project.started_on, completedAt: project.completed_at }),
      // A project that is finished (completed or cancelled) can only be put back On hold: the administrator confirms that twice.
      secondConfirmation: terminal,
    }
  },
  execute(app, session, payload) {
    const note = payload.params.customerNote as string | null
    // `notify: false`: the customer is never e-mailed by an action. The status and the note appear in their portal, as any change of status does.
    const project = setProjectStatus(app, session, payload.target.id as string, { status: payload.params.status, notify: false, ...(note ? { note } : {}) })
    return { status: project.status, customerNoteShown: note !== null, emailQueued: false }
  },
}

// ---- a quote request's working status (internal triage only) ----------------------------------------------------------------------------------

/** The moves an action may make: between the three internal working states, from a request that has not been answered yet. Nothing that reaches the customer or a quotation. */
export const TRIAGE_TARGETS = ['under_review', 'waiting_customer', 'quote_preparation'] as const
export const TRIAGE_SOURCES = ['new', 'under_review', 'waiting_customer', 'quote_preparation'] as const

const quoteTriage: Action = {
  parse(raw) {
    const input = strictObject(raw, ['status'])
    if (typeof input.status !== 'string' || !(TRIAGE_TARGETS as readonly string[]).includes(input.status)) fail()
    return { status: input.status }
  },
  assess(app, session, targetId, params) {
    need(session, 'quote_request.triage_status')
    const quote = (targetId === null ? undefined : getQuote(app.db, targetId)) ?? fail('target_missing')
    const to = params.status as (typeof TRIAGE_TARGETS)[number]
    if (quote.archived_at !== null) fail('validation_failed')
    if (!(TRIAGE_SOURCES as readonly string[]).includes(quote.status)) fail('invalid_transition')
    if (!checkManualMove(quote.status, to, '').ok) fail('invalid_transition')
    const fromNew = quote.status === 'new'
    return {
      target: { type: 'quote_request', id: quote.id, reference: quote.reference },
      preview: {
        records: [{ type: 'quote_request', reference: quote.reference, label: null }],
        changes: [{ field: 'status', before: quote.status, after: to }],
        contents: [],
        sideEffects: [...CATALOG['quote_request.triage_status'].sideEffects, ...(fromNew ? (['cannot_return_to_new'] as const) : [])],
        reversible: fromNew ? 'partly' : 'yes',
        customerVisible: false,
        secondConfirmation: false,
      },
      fingerprint: fingerprintOf({ id: quote.id, status: quote.status, archived: quote.archived_at !== null }),
      secondConfirmation: false,
    }
  },
  execute(app, session, payload) {
    // Neither shown on the customer's status page nor e-mailed. A cancel, an acceptance or a declined offer is not among the targets, so no quotation is ever withdrawn from here.
    changeQuoteRequestStatus(app, session, payload.target.id as string, { status: payload.params.status, notify: false, show: false })
    return { status: payload.params.status, shownToCustomer: false, emailQueued: false }
  },
}

// ---- closing days of the consultations --------------------------------------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/

const closeConsultationDays: Action = {
  parse(raw) {
    const input = strictObject(raw, ['startDate', 'endDate', 'label'])
    if (typeof input.startDate !== 'string' || !DATE.test(input.startDate) || typeof input.endDate !== 'string' || !DATE.test(input.endDate)) fail()
    const label = input.label === undefined || input.label === null || input.label === '' ? null : typeof input.label === 'string' ? cleanLine(input.label).slice(0, LIMITS.label) : fail()
    if (label !== null && (containsMoney(label) || findSensitive(label) !== null)) fail()
    return { startDate: input.startDate, endDate: input.endDate, label }
  },
  assess(app, session, _targetId, params) {
    need(session, 'consultation.close_days')
    let plan
    try {
      plan = checkClosure(app, session, { startDate: params.startDate as string, endDate: params.endDate as string, label: params.label as string | null })
    } catch (error) {
      if (error instanceof HttpError && error.status === 403) return fail('permission_lost')
      if (error instanceof HttpError) return fail('validation_failed')
      throw error
    }
    if (plan.conflicts > 0) fail('bookings_in_range')
    return {
      target: { type: 'booking_hours', id: null, reference: null },
      preview: {
        records: [{ type: 'booking_hours', reference: null, label: plan.startDate === plan.endDate ? plan.startDate : `${plan.startDate} – ${plan.endDate}` }],
        changes: [{ field: 'closedDays', before: null, after: plan.startDate === plan.endDate ? plan.startDate : `${plan.startDate} – ${plan.endDate} (${plan.days})` }],
        contents: plan.label ? [{ kind: 'note', text: plan.label }] : [],
        sideEffects: [...CATALOG['consultation.close_days'].sideEffects],
        reversible: 'yes',
        customerVisible: true,
        secondConfirmation: true,
      },
      // The whole set of exceptions is part of the state it depends on: another closing, or one removed, since the proposal means the proposal was made on a different picture.
      fingerprint: fingerprintOf({ zone: plan.zone, start: plan.startDate, end: plan.endDate, exceptions: loadHours(app.db).exceptions.map((row) => [row.id, row.kind, row.start_date, row.end_date, row.start_minute, row.end_minute, row.label]).sort(), conflicts: plan.conflicts }),
      secondConfirmation: true,
    }
  },
  execute(app, session, payload) {
    const closed = closeDays(app, session, { startDate: payload.params.startDate as string, endDate: payload.params.endDate as string, label: payload.params.label as string | null })
    return { closed: true, days: closed.plan.days, emailQueued: false }
  },
}

export const ACTIONS: Readonly<Record<ActionType, Action>> = {
  'communication.draft_reply': draftReply,
  'project.note_add': projectNote,
  'project.status_change': projectStatus,
  'quote_request.triage_status': quoteTriage,
  'consultation.close_days': closeConsultationDays,
}
