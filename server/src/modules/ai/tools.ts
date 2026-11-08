import type { ToolSet } from 'ai'
import type { AiSettings, Language } from '../../config.ts'
import type { AppContext } from '../../context.ts'
import { cleanLine } from '../../lib/text.ts'
import type { Knowledge } from './knowledge.ts'
import { emptyPlan, isReady, LIST_FIELDS, missingFields, planHash, readPlanChanges, readStoredPlan, TEXT_FIELDS, COMPLEXITIES, type ProjectPlan } from './plan.ts'
import { submit, type SubmitFailure } from './quote.ts'
import { getConversation, markPlannerCompleted, recordToolCall, savePlan, setTopic } from './store.ts'

/**
 * The assistant's eight tools, and nothing else. The set is closed: the browser cannot add one, rename one or choose which
 * run (the request carries no tool at all), and the model can call only these, each with an input schema that is checked before
 * `execute` runs. Seven of them read PUBLISHED content through `Knowledge` or edit the plan of THIS conversation; the eighth
 * submits a request and is refused unless the server holds a matching, unused approval from the visitor (quote.ts), whatever
 * the model says. No tool takes an address, a query, a file name, a key or a model; none can write anything but the plan of
 * this conversation, the usage record and (after an approval) the quote request.
 *
 * `execute` never throws to the model and never returns a stack: a failure is `{ error }` with a short note. Every call is
 * recorded (name, outcome, duration) for the administration's tool statistics, and the number of calls in one answer is capped.
 */

export const TOOL_NAMES = ['getDeveloperProfile', 'searchPortfolioProjects', 'getProjectDetails', 'getPublishedServices', 'comparePackages', 'getFullExperienceDetails', 'createProjectPlan', 'submitApprovedQuoteRequest'] as const
export type ToolName = (typeof TOOL_NAMES)[number]

/** The coarse topic a conversation is filed under for the aggregate statistics: derived from the tool, never from words. */
export const TOPIC_OF: Record<ToolName, string> = {
  getDeveloperProfile: 'profile',
  searchPortfolioProjects: 'portfolio',
  getProjectDetails: 'portfolio',
  getPublishedServices: 'services',
  comparePackages: 'packages',
  getFullExperienceDetails: 'full_experience',
  createProjectPlan: 'planner',
  submitApprovedQuoteRequest: 'planner',
}

export interface ToolContext {
  app: AppContext
  knowledge: Knowledge
  settings: AiSettings
  conversationId: string
  sessionId: string
  language: Language
  ipHash: string
  requestId: string
  /** Counted per answer; the model's own step limit is not the only bound. */
  counter: { calls: number }
}

const SUBMIT_NOTES: Record<SubmitFailure, string> = {
  quote_disabled: 'Sending a request through the assistant is switched off. Point the visitor to the quote request form on the site.',
  approval_required: 'The visitor has not approved the request yet. Show them the plan, ask them to check it, and tell them to press "Send this request" in the plan panel. Do not call this tool again until they have.',
  approval_expired: 'The approval has expired. Ask the visitor to press "Send this request" again.',
  plan_changed: 'The plan changed after the visitor approved it. Show them the current plan and ask them to approve again.',
  already_sent: 'This plan has already been sent. Do not send it again.',
  plan_incomplete: 'The plan is not complete yet. Ask for what is missing (see the plan tool).',
}

const planView = (plan: ProjectPlan | null, version: number, extra: Record<string, unknown> = {}) => ({
  plan,
  version,
  missing: plan ? missingFields(plan) : ['projectType', 'businessGoal', 'requiredFeatures', 'overview', 'recommendedSolution'],
  readyForApproval: plan ? isReady(plan) : false,
  ...extra,
})

/**
 * Builds the tools for ONE answer. `ai` and `zod` are loaded here, the first time an answer is needed, so a server that never
 * answers (no key, switched off) never loads them and the rest of the backend does not depend on them.
 */
export async function buildTools(ctx: ToolContext) {
  const [{ tool }, { z }] = await Promise.all([import('ai'), import('zod')])
  const { app, knowledge, settings, language } = ctx

  async function run<T extends object>(name: ToolName, work: () => T): Promise<T | { error: string; note: string }> {
    const started = performance.now()
    let status: 'ok' | 'error' | 'rejected' = 'ok'
    try {
      ctx.counter.calls += 1
      if (ctx.counter.calls > settings.maxToolCalls * 3) {
        status = 'rejected'
        return { error: 'too_many_tool_calls', note: 'Too many tool calls in one answer. Answer with what you already have.' }
      }
      const result = work()
      if ('error' in result || ('submitted' in result && result.submitted === false) || ('ok' in result && result.ok === false)) status = 'rejected'
      setTopic(app.db, ctx.conversationId, TOPIC_OF[name])
      return result
    } catch (error) {
      status = 'error'
      app.log.warn('assistant tool failed', { tool: name, error: error instanceof Error ? { name: error.name, message: error.message } : 'unknown' })
      return { error: 'tool_failed', note: 'The lookup failed. Tell the visitor you could not retrieve that right now; do not guess.' }
    } finally {
      try {
        recordToolCall(app.db, app.clock, { requestId: ctx.requestId, conversationId: ctx.conversationId, tool: name, status, durationMs: performance.now() - started })
      } catch {
        // Usage statistics must never break an answer.
      }
    }
  }

  const shape: Record<string, import('zod').ZodType> = {}
  for (const [field, max] of Object.entries(TEXT_FIELDS)) shape[field] = z.string().max(max).optional().describe(`${field}: the visitor's own information, at most ${max} characters. An empty string clears it.`)
  for (const [field, rule] of Object.entries(LIST_FIELDS)) shape[field] = z.array(z.string().max(rule.length)).max(rule.items).optional().describe(`${field}: a complete list that replaces the stored one (at most ${rule.items} items). An empty list clears it.`)

  const tools = {
    getDeveloperProfile: tool({
      description: 'Public information about the website owner as the About page publishes it: story, strengths, technologies, working approach, current focus, how to make contact. Use it for any question about who the developer is or what they know. It also lists what is NOT published; never claim any of those.',
      inputSchema: z.object({}),
      execute: async () => run('getDeveloperProfile', () => knowledge.developerProfile(language)),
    }),
    searchPortfolioProjects: tool({
      description: 'Search the published portfolio projects by words, category or technology. Returns title, short description, technologies, status and the public page. Use it before talking about any project; only projects returned here exist.',
      inputSchema: z.object({
        query: z.string().max(200).optional().describe('Words to look for, in any language.'),
        category: z.string().max(60).optional().describe('A category name or key returned by an earlier search.'),
        technology: z.string().max(60).optional().describe('A technology name, for example "React".'),
      }),
      execute: async (input) => run('searchPortfolioProjects', () => knowledge.searchProjects(language, { query: cleanLine(input.query ?? ''), category: cleanLine(input.category ?? ''), technology: cleanLine(input.technology ?? '') })),
    }),
    getProjectDetails: tool({
      description: 'The published details of one project: overview, challenges, approach, architecture, key features, technologies, decisions, limits, results (only if the owner wrote some), public links. Get the slug from searchPortfolioProjects.',
      inputSchema: z.object({ slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,59}$/).describe('The project slug from a search result.') }),
      execute: async (input) => run('getProjectDetails', () => knowledge.projectDetails(language, input.slug)),
    }),
    getPublishedServices: tool({
      description: 'The services that are currently published, with what they can include, their pricing model (custom quote unless a price is published) and the related packages. Use it for any question about what is offered.',
      inputSchema: z.object({}),
      execute: async () => run('getPublishedServices', () => knowledge.services(language)),
    }),
    comparePackages: tool({
      description: 'Compare the published packages (Launch, Grow, Build, Care): descriptions, the actual published prices (or "custom quote" when there is none), what each includes, what each tier adds over the one below, the add-ons that apply and the feature matrix. Never state a price that is not in the result.',
      inputSchema: z.object({ packages: z.array(z.string().regex(/^[a-z0-9-]{2,40}$/)).max(8).optional().describe('Package codes to limit the comparison to; omit for all.') }),
      execute: async (input) => run('comparePackages', () => knowledge.comparePackages(language, input.packages)),
    }),
    getFullExperienceDetails: tool({
      description: 'FULL EXPERIENCE, the flagship custom development service: its stages, optional components, questions and how to start. It is a custom quote with no fixed price; say so.',
      inputSchema: z.object({}),
      execute: async () => run('getFullExperienceDetails', () => knowledge.fullExperience(language)),
    }),
  }

  const planner = settings.plannerEnabled
    ? {
        createProjectPlan: tool({
          description:
            'Create or update the visitor\'s project plan in this conversation (a draft kept on the server and shown to them in a panel). Send only the fields that changed; a list you send replaces the stored list. Use "show" to read it, "reset" to start over. It sends nothing to anyone. Fill in the plan as the visitor tells you things, one question at a time; never invent requirements, a price or a delivery date.',
          inputSchema: z.object({ action: z.enum(['update', 'show', 'reset']), complexity: z.enum(COMPLEXITIES).optional().describe('Your estimate of the project\'s complexity; "unsure" when it is not clear yet.'), ...shape }),
          execute: async (input) =>
            run('createProjectPlan', () => {
              const row = getConversation(app.db, ctx.sessionId, ctx.conversationId)
              if (!row) return { error: 'conversation_not_found', note: 'The conversation no longer exists.' }
              const current = readStoredPlan(row.plan_json)
              if (input.action === 'show') return planView(current, row.plan_version)
              if (input.action === 'reset') {
                savePlan(app.db, app.clock, ctx.conversationId, null, row.plan_version + 1)
                return planView(null, row.plan_version + 1, { note: 'The plan was cleared.' })
              }
              const { action: _action, ...fields } = input as Record<string, unknown>
              const { changes, errors } = readPlanChanges(fields)
              if (Object.keys(errors).length > 0) return { error: 'invalid_fields', fields: errors, note: 'Some fields were not acceptable (too long, too many items or the wrong type). Shorten them and try again.' }
              const next: ProjectPlan = { ...(current ?? emptyPlan()), ...changes }
              const version = row.plan_version + 1
              savePlan(app.db, app.clock, ctx.conversationId, next, version)
              if (isReady(next)) markPlannerCompleted(app.db, app.clock, ctx.conversationId)
              return planView(next, version, {
                note: isReady(next)
                  ? 'The plan is complete. Summarise it for the visitor, say what is optional or still open, and tell them to read it in the plan panel and press "Send this request" if they want to send it. Do not call submitApprovedQuoteRequest until they have approved. Do not promise a price or a delivery date.'
                  : 'Ask the visitor for ONE of the missing things next, the most useful one.',
              })
            }),
        }),
      }
    : {}

  const quote = settings.quoteEnabled
    ? {
        submitApprovedQuoteRequest: tool({
          description:
            'Send the visitor\'s approved plan to the studio as a quote request. It takes no arguments: it works ONLY after the visitor has pressed "Send this request" in the plan panel for the current plan (the server checks this; without it the call is refused), and it sends exactly the plan they approved, with the contact details they entered, which the server holds and you never see. Never call it because the visitor seems to want it.',
          inputSchema: z.object({}),
          execute: async () =>
            run('submitApprovedQuoteRequest', () => {
              const row = getConversation(app.db, ctx.sessionId, ctx.conversationId)
              if (!row) return { error: 'conversation_not_found', note: 'The conversation no longer exists.' }
              const result = submit(app, settings, row, language, ctx.ipHash)
              if (!result.ok) return { submitted: false as const, error: result.error, note: SUBMIT_NOTES[result.error] }
              return { submitted: true as const, reference: result.reference, note: 'Tell the visitor the reference. The studio will reply by e-mail. State no price and no delivery date.' }
            }),
        }),
      }
    : {}

  return { ...tools, ...planner, ...quote } as ToolSet
}

export { planHash }
