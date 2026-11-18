import type { ToolSet } from 'ai'
import type { z as Zod } from 'zod'
import type { AppContext } from '../../../context.ts'
import { HttpError } from '../../../http/errors.ts'
import { getConversation, type ConversationRow } from '../store.ts'
import type { ToolName } from '../tools.ts'
import { LEVELS } from './complexity.ts'
import { CATEGORIES, MAINTENANCE, PRIORITIES, PROJECT_TYPES, readFactInput, readNewRequirement, readRequirementPatch, readSignalInput, REQUIREMENT_COMPLEXITIES, SECTIONS, SIGNAL_COUNTS, SIGNAL_VALUES, STAGES } from './model.ts'
import * as service from './service.ts'
import { SKIPPABLE_STAGES } from './stages.ts'

/**
 * The assistant's project discovery tools (PROMPT 30). Eight tools, each with a strict input schema (checked before it runs) and a strict
 * output schema (checked before the model sees the result): classifyProjectType, updateDiscoveryStage, extractProjectRequirements,
 * assessProjectComplexity, generateProjectPlan, reviseProjectPlan, summarizeProjectDiscovery, validateDiscoveryCompleteness.
 *
 * What they can and cannot do, enforced by the server whatever the model sends:
 *  - they work on the discovery of THIS conversation of THIS session, found by the session, never by an id the model supplies;
 *  - the assistant PROPOSES: everything it writes is origin "assistant" and unconfirmed, it can never confirm anything, and it can never overwrite what
 *    the visitor wrote, confirmed or rejected (the refusal is a result, `confirmed_by_visitor`, that the model is told to respect);
 *  - they cannot send a quote request (that is `submitApprovedQuoteRequest` and the visitor's own approval), set a price, or read anything but the
 *    visitor's own discovery;
 *  - the answers are compact (a few thousand characters at most) and carry instructions for the next step, not the visitor's whole text back.
 */

type Tool = typeof import('ai').tool
export type RunTool = <T extends object>(name: ToolName, work: () => T, schema?: Zod.ZodType) => T | { error: string; note: string }

export interface DiscoveryToolDeps {
  app: AppContext
  z: typeof Zod
  tool: Tool
  run: RunTool
  sessionId: string
  conversationId: string
}

const TOOL_DISCOVERY_NAMES = ['classifyProjectType', 'updateDiscoveryStage', 'extractProjectRequirements', 'assessProjectComplexity', 'generateProjectPlan', 'reviseProjectPlan', 'summarizeProjectDiscovery', 'validateDiscoveryCompleteness'] as const
export const DISCOVERY_TOOL_NAMES: readonly string[] = TOOL_DISCOVERY_NAMES

const clip = (text: string, max: number): string => ([...text].length <= max ? text : `${[...text].slice(0, max - 1).join('')}…`)

/** The compact view the model gets back: enough to avoid asking again what is known, never the whole conversation's words. */
export function compactView(state: service.DiscoveryState) {
  const facts = Object.fromEntries(Object.entries(state.facts).map(([key, fact]) => [key, { value: clip(fact!.value, 200), origin: fact!.origin, confirmed: fact!.confirmed }]))
  const signals = Object.fromEntries(Object.entries(state.signals).map(([key, signal]) => [key, { value: signal!.value, origin: signal!.origin }]))
  return {
    stage: state.stage,
    progress: state.progress.map((item) => ({ stage: item.stage, status: item.status })),
    guidance: { instruction: state.guidance.instruction, topics: state.guidance.topics },
    projectType: { value: state.type.value, origin: state.type.origin, confirmed: state.type.confirmed },
    facts,
    requirements: state.requirements.slice(0, LIST_CAP).map((requirement) => ({ id: requirement.id, title: clip(requirement.title, 80), priority: requirement.priority, status: requirement.status, origin: requirement.origin })),
    requirementCount: state.requirements.length,
    unconfirmedRequirements: state.requirements.filter((requirement) => requirement.status === 'unconfirmed').length,
    signals,
    skippedStages: state.skipped,
    complexity: { level: state.complexity.level, score: state.complexity.score, unknown: state.complexity.unknown },
    plan: { latestVersion: state.plan.latest?.version ?? 0, stale: state.plan.stale, staleSections: state.plan.staleSections },
    missingForPlan: state.missingForPlan,
    missingForApproval: state.missingForApproval,
    sent: state.sent,
  }
}
const LIST_CAP = 60

const NOTE_RESPECT = 'Anything marked as refused was written or confirmed by the visitor: do not try to change it; tell them they can edit it in the plan panel.'

export function discoveryTools(deps: DiscoveryToolDeps): ToolSet {
  const { app, z, tool, run, sessionId, conversationId } = deps

  /** The conversation this tool call works on: found by the session (ownership), or the call fails. */
  const conversation = (): ConversationRow | null => getConversation(app.db, sessionId, conversationId) ?? null
  const gone = { error: 'conversation_not_found', note: 'The conversation no longer exists.' } as const
  const view = (row: ConversationRow) => compactView(service.stateOf(app, row))
  /** A domain refusal (a stale draft, a sent request) is a result the model can read, not a crash. */
  const guard = <T extends object>(work: () => T): T | { error: string; note: string } => {
    try {
      return work()
    } catch (error) {
      if (error instanceof HttpError) return { error: typeof error.details?.reason === 'string' ? error.details.reason : error.code, note: error.status === 409 ? 'The draft changed or was already sent. Call summarizeProjectDiscovery and continue from there.' : 'That could not be done.' }
      throw error
    }
  }

  const refusedSchema = z.array(z.strictObject({ key: z.string().max(120), reason: z.string().max(40) })).max(70)
  const viewSchema = z.looseObject({ stage: z.enum(STAGES), requirementCount: z.number().int().min(0).max(60) })
  const withView = (shape: Record<string, Zod.ZodType>) => z.looseObject({ ok: z.literal(true), view: viewSchema, ...shape })

  const factsInput = z.strictObject({
    projectName: z.string().max(80).optional().describe('A short name for the project, only if the visitor gave one.'),
    objective: z.string().max(400).optional().describe('What the project should achieve, in the visitor\'s own terms.'),
    problem: z.string().max(400).optional().describe('The problem it should solve.'),
    audience: z.string().max(300).optional().describe('Who will use it.'),
    existingSite: z.string().max(300).optional().describe('An existing website or application, and what is wrong with it.'),
    budget: z.string().max(120).optional().describe('Only if the visitor volunteered a budget idea. Never suggest one.'),
    timeline: z.string().max(200).optional().describe('When the visitor would like to launch.'),
    maintenance: z.enum(MAINTENANCE).optional().describe('Whether they need ongoing maintenance and support.'),
  })

  const signalsInput = z.strictObject({
    roles: z.enum(SIGNAL_VALUES.roles).optional(),
    dataModel: z.enum(SIGNAL_VALUES.dataModel).optional(),
    authentication: z.enum(SIGNAL_VALUES.authentication).optional(),
    adminArea: z.enum(SIGNAL_VALUES.adminArea).optional(),
    automation: z.enum(SIGNAL_VALUES.automation).optional(),
    security: z.enum(SIGNAL_VALUES.security).optional(),
    scalability: z.enum(SIGNAL_VALUES.scalability).optional(),
    integrations: z.number().int().min(SIGNAL_COUNTS.integrations[0]).max(SIGNAL_COUNTS.integrations[1]).optional(),
    thirdParty: z.number().int().min(SIGNAL_COUNTS.thirdParty[0]).max(SIGNAL_COUNTS.thirdParty[1]).optional(),
    languages: z.number().int().min(SIGNAL_COUNTS.languages[0]).max(SIGNAL_COUNTS.languages[1]).optional(),
  })

  const planResultSchema = z.looseObject({ ok: z.boolean(), status: z.enum(['created', 'unchanged', 'not_enough_information']), view: viewSchema })

  return {
    classifyProjectType: tool({
      description:
        'Record what kind of project this is, after you have understood the idea. Use "other" when it is not clear ("Other / not sure" is always an acceptable answer). It is a PROPOSAL: the visitor confirms it in the panel, and if they already chose a type you cannot change it. It does not ask anything of the visitor.',
      inputSchema: z.strictObject({ type: z.enum(PROJECT_TYPES), reason: z.string().max(200).optional().describe('One short sentence on why, for your own record.') }),
      execute: async (input) =>
        run(
          'classifyProjectType',
          () => {
            const row = conversation()
            if (!row) return gone
            return guard(() => {
              const result = service.applyClassification(app, row, { type: input.type }, 'assistant')
              return { ok: true as const, applied: result.applied, refused: result.refused ? [{ key: result.refused.key, reason: result.refused.reason }] : [], view: view(row), note: result.refused ? NOTE_RESPECT : 'Continue with the current stage; ask ONE question.' }
            })
          },
          withView({ applied: z.boolean(), refused: refusedSchema, note: z.string().max(300) }).or(z.looseObject({ error: z.string() })),
        ),
    }),

    updateDiscoveryStage: tool({
      description:
        'Record facts the visitor told you (the goal, the problem, the audience, an existing site, a budget idea, the timeline, the maintenance need) and, when the visitor declines an optional question, skip that stage. Send only what the visitor actually said; never invent or "improve" it. The server moves the stage on by itself. It returns the current stage, what is still missing and what to ask about next.',
      inputSchema: z.strictObject({
        facts: factsInput.optional(),
        skipStages: z.array(z.enum(SKIPPABLE_STAGES)).max(7).optional().describe('Optional stages the visitor chose not to answer.'),
        revisitStages: z.array(z.enum(SKIPPABLE_STAGES)).max(7).optional().describe('Stages the visitor now wants to answer after all.'),
      }),
      execute: async (input) =>
        run(
          'updateDiscoveryStage',
          () => {
            const row = conversation()
            if (!row) return gone
            return guard(() => {
              const read = readFactInput(input.facts ?? {})
              if (Object.keys(read.errors).length > 0) return { error: 'invalid_facts', note: 'Some facts were not acceptable (too long or the wrong value). Shorten them and try again.' }
              const written = Object.keys(read.facts).length > 0 ? service.applyFacts(app, row, { facts: read.facts }, 'assistant') : { applied: [], refused: [] }
              for (const stage of input.skipStages ?? []) service.setSkip(app, row, stage, true)
              for (const stage of input.revisitStages ?? []) service.setSkip(app, row, stage, false)
              return { ok: true as const, applied: written.applied, refused: written.refused.map((item) => ({ key: item.key, reason: item.reason })), view: view(row), note: written.refused.length > 0 ? NOTE_RESPECT : 'Ask ONE question about what is missing, following the guidance. Do not ask what is already recorded.' }
            })
          },
          withView({ applied: z.array(z.string().max(40)).max(10), refused: refusedSchema, note: z.string().max(300) }).or(z.looseObject({ error: z.string() })),
        ),
    }),

    extractProjectRequirements: tool({
      description:
        'Record requirements (features and needs) from what the visitor said, one to a few at a time. Set statedByVisitor to true ONLY for something the visitor actually said; anything you propose yourself must be statedByVisitor false and is shown to them as a suggestion. Everything you record is unconfirmed until the visitor confirms it in the panel; you cannot confirm anything, and you cannot re-add something they rejected. Use "changes" only to refine your own unconfirmed suggestions.',
      inputSchema: z.strictObject({
        requirements: z
          .array(
            z.strictObject({
              title: z.string().min(2).max(100),
              description: z.string().max(400).optional(),
              category: z.enum(CATEGORIES).optional(),
              priority: z.enum(PRIORITIES).optional().describe('essential: the project fails without it; important; optional; future: later.'),
              required: z.boolean().optional(),
              complexity: z.enum(REQUIREMENT_COMPLEXITIES).optional(),
              dependsOn: z.array(z.string().max(100)).max(5).optional().describe('Titles of other requirements this one needs.'),
              statedByVisitor: z.boolean(),
            }),
          )
          .max(8)
          .optional(),
        changes: z
          .array(z.strictObject({ id: z.string().max(64), description: z.string().max(400).optional(), category: z.enum(CATEGORIES).optional(), priority: z.enum(PRIORITIES).optional(), complexity: z.enum(REQUIREMENT_COMPLEXITIES).optional() }))
          .max(8)
          .optional(),
      }),
      execute: async (input) =>
        run(
          'extractProjectRequirements',
          () => {
            const row = conversation()
            if (!row) return gone
            return guard(() => {
              const items = []
              for (const candidate of input.requirements ?? []) {
                const read = readNewRequirement(candidate)
                if (!read.value) return { error: 'invalid_requirement', note: 'A requirement was not acceptable (title or text too long, or an unknown value). Fix it and try again.' }
                items.push({ value: read.value, basis: candidate.statedByVisitor ? ('stated' as const) : ('suggested' as const) })
              }
              const added = items.length > 0 ? service.addRequirements(app, row, items, 'assistant') : { added: [], skipped: [] }
              const refused = [...added.skipped]
              let changed = 0
              for (const change of input.changes ?? []) {
                const { id, ...rest } = change
                const patch = readRequirementPatch(rest)
                if (Object.keys(patch.errors).length > 0) continue
                const result = service.changeRequirement(app, row, id, patch.value, 'assistant')
                if (result.applied) changed += 1
                else if (result.refused) refused.push(result.refused)
              }
              return { ok: true as const, added: added.added.length, changed, refused: refused.map((item) => ({ key: clip(item.key, 120), reason: item.reason })), view: view(row), note: refused.length > 0 ? `${NOTE_RESPECT} Duplicates and rejected items were not added again.` : 'Tell the visitor in one short sentence what you noted, mention that suggestions need their confirmation in the panel, and ask ONE next question.' }
            })
          },
          withView({ added: z.number().int().min(0).max(8), changed: z.number().int().min(0).max(8), refused: refusedSchema, note: z.string().max(400) }).or(z.looseObject({ error: z.string() })),
        ),
    }),

    assessProjectComplexity: tool({
      description:
        'Record the characteristics that drive the scope (user roles, data complexity, sign-in, admin area, automation, security, scalability, number of integrations, third-party services, languages) as far as the visitor has told you, and get the rule-based complexity assessment back. Send only what you know. The assessment is NOT an estimate of hours or cost and you must never present it as one; explain it in plain words and say what is still unknown.',
      inputSchema: z.strictObject({ signals: signalsInput.optional() }),
      execute: async (input) =>
        run(
          'assessProjectComplexity',
          () => {
            const row = conversation()
            if (!row) return gone
            return guard(() => {
              const read = readSignalInput(input.signals ?? {})
              if (Object.keys(read.errors).length > 0) return { error: 'invalid_signals', note: 'Some characteristics were not acceptable. Use the values in the schema.' }
              const result = Object.keys(read.value).length > 0 ? service.applySignals(app, row, read.value, 'assistant') : { applied: [], refused: [] }
              const state = service.stateOf(app, row)
              return {
                ok: true as const,
                applied: result.applied,
                refused: result.refused.map((item) => ({ key: item.key, reason: item.reason })),
                assessment: { level: state.complexity.level, score: state.complexity.score, factors: state.complexity.factors.slice(0, 16), unknown: state.complexity.unknown, raisedFrom: state.complexity.raisedFrom, thresholds: state.complexity.thresholds, notAnEstimate: true as const },
                view: compactView(state),
                note: 'Explain the level in plain words using the factors, say it is not an estimate of hours or price, and name what is still unknown.',
              }
            })
          },
          withView({
            applied: z.array(z.string().max(40)).max(12),
            refused: refusedSchema,
            assessment: z.strictObject({ level: z.enum(LEVELS).nullable(), score: z.number().min(0).max(200), factors: z.array(z.looseObject({ code: z.string(), points: z.number() })).max(16), unknown: z.array(z.string()).max(12), raisedFrom: z.enum(LEVELS).nullable(), thresholds: z.looseObject({}), notAnEstimate: z.literal(true) }),
            note: z.string().max(300),
          }).or(z.looseObject({ error: z.string() })),
        ),
    }),

    generateProjectPlan: tool({
      description:
        'Generate a new version of the project plan from everything recorded so far. The server builds it from the facts, requirements and characteristics by rules; you do not write it. It needs a project type, a goal or problem and at least one requirement. After it is made, summarise it for the visitor (what is confirmed, what are suggestions, the complexity level and why, what is unknown), say it is a proposal and not a quote, and tell them to review it in the plan panel and press "Send this request" if they want to send it. Never promise a price or a date.',
      inputSchema: z.strictObject({}),
      execute: async () =>
        run(
          'generateProjectPlan',
          () => {
            const row = conversation()
            if (!row) return gone
            return guard(() => {
              const result = service.makePlan(app, row, 'all', 'assistant', 'generate')
              const state = service.stateOf(app, row)
              if (result.status === 'not_enough_information') return { ok: false as const, status: result.status, missing: result.missing, view: compactView(state), note: 'There is not enough information yet. Ask ONE question about what is missing.' }
              return { ok: true as const, status: result.status, version: result.version, readyForApproval: state.missingForApproval.length === 0, view: compactView(state), note: 'Summarise the plan for the visitor as described, and point them to the plan panel. Do not call submitApprovedQuoteRequest until they have pressed the button.' }
            })
          },
          planResultSchema.or(z.looseObject({ error: z.string() })),
        ),
    }),

    reviseProjectPlan: tool({
      description:
        'Regenerate only some sections of the plan (overview, requirements, architecture, phases, risks, next_steps) after something changed, keeping everything else and everything the visitor confirmed or wrote. It makes a new plan version; earlier versions stay available to the visitor.',
      inputSchema: z.strictObject({ sections: z.array(z.enum(SECTIONS)).min(1).max(6), reason: z.string().max(200).optional() }),
      execute: async (input) =>
        run(
          'reviseProjectPlan',
          () => {
            const row = conversation()
            if (!row) return gone
            return guard(() => {
              const result = service.makePlan(app, row, [...new Set(input.sections)], 'assistant', `regenerate:${[...new Set(input.sections)].join('+')}`)
              const state = service.stateOf(app, row)
              if (result.status === 'not_enough_information') return { ok: false as const, status: result.status, missing: result.missing, view: compactView(state), note: 'There is not enough information yet. Ask ONE question about what is missing.' }
              return { ok: true as const, status: result.status, version: result.version, readyForApproval: state.missingForApproval.length === 0, view: compactView(state), note: 'Tell the visitor which sections were updated and that earlier versions are kept.' }
            })
          },
          planResultSchema.or(z.looseObject({ error: z.string() })),
        ),
    }),

    summarizeProjectDiscovery: tool({
      description:
        'Read the current state of the visitor\'s project discovery: the stage, what is recorded (and who wrote it, and whether it is confirmed), the requirements, the characteristics, the plan state, and what is missing. Call it before asking a question if you are unsure what is already known, so that you never ask again what was answered. It changes nothing.',
      inputSchema: z.strictObject({}),
      execute: async () =>
        run(
          'summarizeProjectDiscovery',
          () => {
            const row = conversation()
            if (!row) return gone
            return { ok: true as const, view: view(row), note: 'Use this to decide the next question. Distinguish, when you speak, what the visitor confirmed from what you assumed or suggested.' }
          },
          withView({ note: z.string().max(300) }).or(z.looseObject({ error: z.string() })),
        ),
    }),

    validateDiscoveryCompleteness: tool({
      description:
        'Check whether the discovery is complete enough: for generating a plan, and for the visitor to approve sending it. It returns what is missing in each case, how many requirements still wait for the visitor\'s confirmation, which complexity characteristics are still unknown, and the next action to take. Call it before you offer to generate the plan or to send the request. It changes nothing.',
      inputSchema: z.strictObject({}),
      execute: async () =>
        run(
          'validateDiscoveryCompleteness',
          () => {
            const row = conversation()
            if (!row) return gone
            const state = service.stateOf(app, row)
            const waiting = state.requirements.filter((requirement) => requirement.status === 'unconfirmed').length
            const nextAction = state.sent
              ? ('nothing_more' as const)
              : state.missingForPlan.length > 0
                ? ('ask_for_missing' as const)
                : state.plan.latest === null
                  ? ('offer_plan' as const)
                  : state.plan.stale
                    ? ('regenerate_plan' as const)
                    : state.missingForApproval.length > 0
                      ? ('ask_visitor_to_confirm' as const)
                      : ('point_to_review' as const)
            return {
              ok: true as const,
              readyForPlan: state.missingForPlan.length === 0,
              readyForApproval: !state.sent && state.missingForApproval.length === 0,
              missingForPlan: state.missingForPlan,
              missingForApproval: state.missingForApproval,
              unconfirmedRequirements: waiting,
              unknownCharacteristics: state.complexity.unknown,
              nextAction,
              view: compactView(state),
              note: 'Ask ONE question about what is missing, or offer the next action. Only the visitor can confirm requirements: tell them to review and confirm them in the plan panel. Never promise a price or a date.',
            }
          },
          withView({
            readyForPlan: z.boolean(),
            readyForApproval: z.boolean(),
            missingForPlan: z.array(z.string().max(40)).max(8),
            missingForApproval: z.array(z.string().max(40)).max(8),
            unconfirmedRequirements: z.number().int().min(0).max(60),
            unknownCharacteristics: z.array(z.string().max(40)).max(12),
            nextAction: z.enum(['nothing_more', 'ask_for_missing', 'offer_plan', 'regenerate_plan', 'ask_visitor_to_confirm', 'point_to_review']),
            note: z.string().max(400),
          }).or(z.looseObject({ error: z.string() })),
        ),
    }),
  } as unknown as ToolSet
}

export { STAGES }
