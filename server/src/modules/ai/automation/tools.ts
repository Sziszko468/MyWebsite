import type { ToolSet, tool as makeTool } from 'ai'
import type { z as Zod } from 'zod'
import type { AppContext, SessionInfo } from '../../../context.ts'
import type { Language } from '../../../config.ts'
import { cleanLine } from '../../../lib/text.ts'
import { audit } from '../../system/audit.ts'
import { PROJECT_STATUSES } from '../../customers/model.ts'
import { containsMoney, cut, OUT_OF_CONTEXT, REFERENCE, ToolRefusal } from '../adminassistant/model.ts'
import type { ReadCtx } from '../adminassistant/readers/common.ts'
import { conversationByReference } from '../adminassistant/readers/conversations.ts'
import { projectByReference } from '../adminassistant/readers/projects.ts'
import { quoteByReference } from '../adminassistant/readers/quotes.ts'
import { isGeneral } from '../adminassistant/scope.ts'
import { findSensitive } from '../sensitive.ts'
import { ACTIONS, TRIAGE_TARGETS } from './actions.ts'
import { createProposal, ProposalRefused } from './lifecycle.ts'
import { ActionProblem, CATALOG, LIMITS, UNSUPPORTED, type ActionType, type FailureCode } from './model.ts'

/**
 * The assistant's tools for PROPOSING actions (PROMPT 33): five of them, one per supported action, and one that lists what is and is not supported. They exist only while the operator's
 * switch (`AI_AUTOMATION_ENABLED`) is on; with it off the assistant has no such tool at all.
 *
 * A proposing tool does NOT change the business. It records a proposal (a row of `ai_actions`, waiting for an administrator) and tells the model that nothing has been done. There is no
 * tool that approves, rejects, cancels or runs: the model cannot reach the approval control, and a chat message such as "looks good" is only a chat message. Each tool goes through
 * the same steps as every other tool of the assistant (`run` in tools.ts: the administrator's session and role are re-read, the conversation's context is re-resolved), then:
 *   1. the permission the ACTION needs is checked with the current role;
 *   2. the target is found by its public reference, inside the conversation's context (a record outside it is "not found");
 *   3. the parameters are parsed by the action's own strict parser and assessed against the business rules and the record's state now;
 *   4. the proposal is frozen (type, target, parameters, reason, the preview, the target's state), hashed and given an expiry.
 * Inputs are strict objects: an unknown key is an error, and no tool takes an administrator, a status of the proposal, a permission, SQL, a path or a URL.
 */

export const AUTOMATION_TOOL_NAMES = ['listSupportedActions', 'proposeDraftReply', 'proposeProjectNote', 'proposeProjectStatusChange', 'proposeQuoteRequestTriage', 'proposeConsultationClosure'] as const
export type AutomationToolName = (typeof AUTOMATION_TOOL_NAMES)[number]

type Run = <T extends object>(name: AutomationToolName, work: (rc: ReadCtx) => T, schema?: Zod.ZodType) => Promise<T | { error: string; note: string }>

export interface AutomationDeps {
  tool: typeof makeTool
  z: typeof Zod
  run: Run
  app: AppContext
  conversationId: string
  language: Language
}

const PROBLEM_NOTES: Record<FailureCode, string> = {
  permission_lost: 'This administrator\'s role may not prepare this action. Say so plainly; do not look for another way.',
  session_ended: 'The administrator\'s session has ended. Tell them to sign in again.',
  target_missing: 'There is no such record that you can see here. Do not guess a reference.',
  target_changed: 'The record changed. Look it up again.',
  validation_failed: 'The parameters are not acceptable: check the lengths, leave out amounts of money, use only the allowed statuses and valid dates, and write a draft in the customer\'s language.',
  invalid_transition: 'The business rules do not allow that move from the record\'s current status. Say so; do not try another route to the same result.',
  bookings_in_range: 'There are bookings in those days, so they cannot be closed from here. Tell the administrator to deal with those bookings first.',
  payload_tampered: 'This cannot be prepared.',
  automation_disabled: 'Controlled automation is switched off.',
  execution_error: 'This cannot be prepared right now.',
  interrupted: 'This cannot be prepared right now.',
}

const NOTICE = 'NOTHING HAS BEEN DONE. This is only a proposal. The administrator must open Administration > Automation, read it and approve it with the approval control; you cannot approve it, and a chat reply such as "looks good" is not an approval. Do not say it was done.'

export function automationTools({ tool, z, run, app, conversationId, language }: AutomationDeps): ToolSet {
  const reference = z.string().regex(REFERENCE).describe('A public reference exactly as an earlier result gave it. Never invent one.')
  const optionalRef = (what: string) => reference.optional().describe(`${what} Leave it out to use the record of this conversation's context.`)
  const reason = z.string().min(5).max(LIMITS.reason).describe('Why you propose this, in one or two plain sentences for the administrator. No amounts of money.')

  /** The shared part: validate the reason, assess, record the proposal, answer. */
  function propose(rc: ReadCtx, type: ActionType, resolve: () => { id: string | null } | { refusal: Record<string, unknown> }, rawParams: Record<string, unknown>, rawReason: string) {
    const session: SessionInfo = rc.access.need(CATALOG[type].permission)
    const why = cleanLine(rawReason)
    const refuse = (code: FailureCode | 'reason' | 'too_many_pending', note: string): never => {
      audit(app, session, 'ai_action.proposal_refused', 'ai_action', null, { type, code })
      throw new ToolRefusal('invalid', note)
    }
    if ([...why].length < 5 || containsMoney(why) || findSensitive(why) !== null) return refuse('reason', 'The reason must be one or two plain sentences without amounts of money or anything that looks like a secret.')
    const target = resolve()
    if ('refusal' in target) return target.refusal
    try {
      const action = ACTIONS[type]
      const params = action.parse(rawParams)
      const assessed = action.assess(app, session, target.id, params, language)
      const { row, duplicate } = createProposal(app, { session, conversationId, language, type, assessed, params, reason: why })
      return {
        basis: 'proposal' as const,
        status: 'awaiting_approval' as const,
        approvalRequired: true as const,
        canApproveFromHere: false as const,
        duplicate,
        notice: NOTICE,
        proposal: {
          reference: row.reference,
          type,
          target: assessed.target.reference === null ? { type: assessed.target.type } : { type: assessed.target.type, reference: assessed.target.reference },
          changes: assessed.preview.changes,
          contents: assessed.preview.contents.map((content) => ({ kind: content.kind, text: cut(content.text, 300) })),
          sideEffects: assessed.preview.sideEffects,
          reversible: assessed.preview.reversible,
          customerVisible: assessed.preview.customerVisible,
          requiresSecondConfirmation: assessed.secondConfirmation,
          expiresAt: row.expires_at,
        },
        link: { type: 'proposal' as const, reference: row.reference, path: `/automation/${row.reference}` },
      }
    } catch (error) {
      if (error instanceof ProposalRefused) return refuse(error.code, error.code === 'automation_disabled' ? PROBLEM_NOTES.automation_disabled : 'This administrator already has the most proposals waiting that are allowed. Tell them to decide some first; do not propose more.')
      if (error instanceof ActionProblem) {
        if (error.code === 'permission_lost') throw new ToolRefusal('not_available', PROBLEM_NOTES.permission_lost)
        return refuse(error.code, PROBLEM_NOTES[error.code])
      }
      throw error
    }
  }

  const refused = z.looseObject({ error: z.string() })
  const proposed = z.looseObject({ status: z.literal('awaiting_approval'), approvalRequired: z.literal(true), proposal: z.looseObject({ reference: z.string() }) }).or(refused)
  const intro = 'It only PREPARES a proposal for the administrator: it changes nothing, sends nothing and is not approved by anyone yet.'

  return {
    listSupportedActions: tool({
      description: `List the actions you may PROPOSE (each needs the administrator's approval in the Automation screen) and the kinds of action that are NOT supported, with why. Call it when asked to do something you are not sure you can prepare. ${intro}`,
      inputSchema: z.strictObject({}),
      execute: async () =>
        run(
          'listSupportedActions',
          (rc) => ({
            basis: 'actual' as const,
            note: 'You can only propose; the administrator approves. Anything not listed as supported is unsupported: say so plainly, and suggest what the administrator can do themselves.',
            supported: (Object.keys(CATALOG) as ActionType[]).map((type) => ({ type, target: CATALOG[type].target, reversible: CATALOG[type].reversible, customerVisible: CATALOG[type].customerVisible, secondConfirmation: CATALOG[type].secondConfirmation, permittedForThisAdministrator: rc.access.has(CATALOG[type].permission) })),
            unsupported: UNSUPPORTED.map((item) => ({ action: item.code, why: item.reason })),
          }),
          z.looseObject({ basis: z.literal('actual') }).or(refused),
        ),
    }),

    proposeDraftReply: tool({
      description: `Propose a DRAFT reply to a customer for a conversation. Approving it only keeps the wording; it is never sent, and you cannot send. Write it in the customer's preferred language (a result tells you which). No prices, discounts, delivery dates or promises. ${intro}`,
      inputSchema: z.strictObject({
        conversationRef: optionalRef('The conversation reference.'),
        language: z.enum(['hu', 'en', 'nl']).describe('The language the draft is written in.'),
        adminAskedForThisLanguage: z.boolean().optional().describe('True ONLY if the administrator explicitly asked for a language other than the customer\'s preferred one.'),
        draft: z.string().min(10).max(LIMITS.draft),
        reason,
      }),
      execute: async (input) =>
        run(
          'proposeDraftReply',
          (rc) => {
            const params = { language: input.language, adminAskedForThisLanguage: input.adminAskedForThisLanguage === true, draft: input.draft }
            return propose(
              rc,
              'communication.draft_reply',
              () => {
                const conversation = conversationByReference(rc, input.conversationRef)
                // The same rule as the read-only draft tool: the customer's own language, unless the administrator asked for another one.
                if (input.language !== conversation.customer_language && input.adminAskedForThisLanguage !== true) {
                  return { refusal: { error: 'language_mismatch', preferredLanguage: conversation.customer_language, note: `The customer's preferred language on file is ${conversation.customer_language}. Write the draft in it, or propose again with adminAskedForThisLanguage true only if the administrator explicitly asked for another language.` } }
                }
                return { id: conversation.id }
              },
              params,
              input.reason,
            )
          },
          proposed,
        ),
    }),

    proposeProjectNote: tool({
      description: `Propose an INTERNAL note on a project (the customer never sees it; there is no way to delete a note afterwards, so make it worth keeping). Facts only; no amounts of money, nothing that looks like a secret. ${intro}`,
      inputSchema: z.strictObject({ projectRef: optionalRef('The project reference.'), body: z.string().min(2).max(LIMITS.note), reason }),
      execute: async (input) =>
        run(
          'proposeProjectNote',
          (rc) =>
            propose(
              rc,
              'project.note_add',
              () => {
                rc.access.need('clients:projects')
                return { id: projectByReference(rc, input.projectRef).id }
              },
              { body: input.body },
              input.reason,
            ),
          proposed,
        ),
    }),

    proposeProjectStatusChange: tool({
      description: `Propose moving a project to another status (only a move the project's own rules allow). The customer SEES the new status (and the note, if you give one) in their portal, but is NOT e-mailed. Moving to completed or cancelled needs the administrator's second confirmation. The note is for the customer: short, plain, no amounts. ${intro}`,
      inputSchema: z.strictObject({ projectRef: optionalRef('The project reference.'), status: z.enum(PROJECT_STATUSES), customerNote: z.string().min(2).max(LIMITS.customerNote).optional().describe('Words the customer will see next to the change. Optional.'), reason }),
      execute: async (input) =>
        run(
          'proposeProjectStatusChange',
          (rc) =>
            propose(
              rc,
              'project.status_change',
              () => {
                rc.access.need('clients:projects')
                return { id: projectByReference(rc, input.projectRef).id }
              },
              { status: input.status, ...(input.customerNote ? { customerNote: input.customerNote } : {}) },
              input.reason,
            ),
          proposed,
        ),
    }),

    proposeQuoteRequestTriage: tool({
      description: `Propose moving a quote request between its internal working states (${TRIAGE_TARGETS.join(', ')}). It is internal: the customer is not told and does not see it. It cannot accept, decline, cancel or send anything, and it never touches a quotation. ${intro}`,
      inputSchema: z.strictObject({ quoteRef: optionalRef('The quote request reference.'), status: z.enum(TRIAGE_TARGETS), reason }),
      execute: async (input) =>
        run(
          'proposeQuoteRequestTriage',
          (rc) =>
            propose(
              rc,
              'quote_request.triage_status',
              () => {
                rc.access.need('requests:write')
                return { id: quoteByReference(rc, input.quoteRef).id }
              },
              { status: input.status },
              input.reason,
            ),
          proposed,
        ),
    }),

    proposeConsultationClosure: tool({
      description: `Propose CLOSING some days for consultation bookings (for example a holiday): customers will not be able to book those days. It only takes availability away; it never changes a booking that exists (it is refused if one falls in the days) and it never opens extra time. Needs the administrator's second confirmation. General business context only. ${intro}`,
      inputSchema: z.strictObject({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('First day to close (YYYY-MM-DD), today or later.'),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Last day to close (YYYY-MM-DD); the same as startDate for one day. At most 31 days.'),
        label: z.string().min(2).max(LIMITS.label).optional().describe('A short label for the administrator (for example "Christmas break").'),
        reason,
      }),
      execute: async (input) =>
        run(
          'proposeConsultationClosure',
          (rc) =>
            propose(
              rc,
              'consultation.close_days',
              () => {
                if (!isGeneral(rc.scope)) throw OUT_OF_CONTEXT()
                return { id: null }
              },
              { startDate: input.startDate, endDate: input.endDate, ...(input.label ? { label: input.label } : {}) },
              input.reason,
            ),
          proposed,
        ),
    }),
  } as unknown as ToolSet
}

