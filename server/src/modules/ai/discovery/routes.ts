import type { RequestCtx } from '../../../context.ts'
import { HttpError, notFound, validationFailed } from '../../../http/errors.ts'
import { json } from '../../../http/reply.ts'
import type { RouteDef } from '../../../http/router.ts'
import { cleanBlock } from '../../../lib/text.ts'
import { loadSettings } from '../settings.ts'
import type { ConversationRow, SessionRow } from '../store.ts'
import { FACT_KEYS, isProjectType, isSection, isStage, LIMITS, readFactInput, readNewRequirement, readRequirementPatch, readSignalInput, SECTIONS, type FactKey, type Section } from './model.ts'
import * as service from './service.ts'
import { isSkippable } from './stages.ts'

/**
 * The visitor's side of project discovery: the panel's reads and writes, under `/api/ai/conversations/:id/discovery`. Like the rest of the
 * assistant's public API it is cookie-free (the session travels in `X-AI-Session`), refuses an unsafe request from another origin, is rate
 * limited, and reaches a conversation ONLY through the visitor's own session: another session's conversation, or a requirement id from another
 * conversation, is simply "not found". Every write names the version of the draft the visitor saw (`expectedVersion`); a stale one is a 409,
 * so two tabs, or the visitor and the assistant, never silently overwrite each other.
 *
 * What the visitor writes here is theirs: facts and requirements they add are confirmed; the assistant's suggestions become confirmed only
 * when they say so. Nothing here sends a quote request.
 */

interface Deps {
  requireSession(ctx: RequestCtx): SessionRow
  conversationOf(ctx: RequestCtx, session: SessionRow): ConversationRow
}

const ID = /^[0-9a-f-]{36}$/

export function discoveryRoutes({ requireSession, conversationOf }: Deps): RouteDef[] {
  const base = '/api/ai/conversations/:id/discovery'
  const route = (method: RouteDef['method'], suffix: string, handler: (ctx: RequestCtx, conversation: ConversationRow) => Promise<ReturnType<typeof json>> | ReturnType<typeof json>): RouteDef => ({
    method,
    pattern: `${base}${suffix}`,
    area: 'api',
    limit: 'aiDiscovery',
    handler: async (ctx) => {
      const session = requireSession(ctx)
      const conversation = conversationOf(ctx, session)
      const settings = loadSettings(ctx.app)
      if (!settings.plannerEnabled || !settings.discoveryEnabled) throw notFound('The project discovery')
      return handler(ctx, conversation)
    },
  })

  const expected = (body: Record<string, unknown>): number => {
    const value = body.expectedVersion
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1_000_000) throw validationFailed({ expectedVersion: 'invalid' })
    return value
  }
  const state = (ctx: RequestCtx, conversation: ConversationRow) => service.stateOf(ctx.app, conversation)
  const rejectErrors = (errors: Record<string, string>) => {
    if (Object.keys(errors).length > 0) throw validationFailed(errors as never)
  }

  return [
    route('GET', '', (ctx, conversation) => json(state(ctx, conversation))),

    route('PUT', '/facts', async (ctx, conversation) => {
      const body = await ctx.json()
      const version = expected(body)
      const read = readFactInput(body.facts ?? {})
      rejectErrors(read.errors)
      const confirm = body.confirm === undefined ? [] : body.confirm
      if (!Array.isArray(confirm) || confirm.some((key) => typeof key !== 'string' || !(FACT_KEYS as string[]).includes(key))) throw validationFailed({ confirm: 'invalid' })
      const result = service.applyFacts(ctx.app, conversation, { facts: read.facts, confirm: confirm as FactKey[] }, 'visitor', version)
      return json({ result, state: state(ctx, conversation) })
    }),

    route('PUT', '/classification', async (ctx, conversation) => {
      const body = await ctx.json()
      const version = expected(body)
      if (body.type !== undefined && !isProjectType(body.type)) throw validationFailed({ type: 'invalid' })
      if (body.confirm !== undefined && typeof body.confirm !== 'boolean') throw validationFailed({ confirm: 'invalid' })
      const result = service.applyClassification(ctx.app, conversation, { ...(body.type ? { type: body.type as never } : {}), ...(body.confirm ? { confirm: true } : {}) }, 'visitor', version)
      return json({ result, state: state(ctx, conversation) })
    }),

    route('PUT', '/signals', async (ctx, conversation) => {
      const body = await ctx.json()
      const version = expected(body)
      const read = readSignalInput(body.signals ?? {})
      rejectErrors(read.errors)
      const result = service.applySignals(ctx.app, conversation, read.value, 'visitor', version)
      return json({ result, state: state(ctx, conversation) })
    }),

    route('POST', '/requirements', async (ctx, conversation) => {
      const body = await ctx.json()
      const version = expected(body)
      const read = readNewRequirement(body.requirement)
      if (!read.value) throw validationFailed(read.errors as never)
      const result = service.addRequirements(ctx.app, conversation, [{ value: read.value }], 'visitor', version)
      if (result.added.length === 0) throw new HttpError(409, 'conflict', 'That requirement is already in the list, or the list is full.', { details: { reason: result.skipped[0]?.reason ?? 'duplicate' } })
      return json({ result, state: state(ctx, conversation) }, { status: 201 })
    }),

    route('PUT', '/requirements/:rid', async (ctx, conversation) => {
      if (!ID.test(ctx.params.rid)) throw notFound('The requirement')
      const body = await ctx.json()
      const version = expected(body)
      const { expectedVersion: _expected, ...fields } = body
      const read = readRequirementPatch(fields)
      rejectErrors(read.errors)
      const result = service.changeRequirement(ctx.app, conversation, ctx.params.rid, read.value, 'visitor', version)
      if (result.refused?.reason === 'not_found') throw notFound('The requirement')
      if (result.refused) throw new HttpError(409, 'conflict', 'That change could not be made.', { details: { reason: result.refused.reason } })
      return json({ result, state: state(ctx, conversation) })
    }),

    route('DELETE', '/requirements/:rid', (ctx, conversation) => {
      if (!ID.test(ctx.params.rid)) throw notFound('The requirement')
      const raw = Number(ctx.query.get('expectedVersion'))
      if (!Number.isInteger(raw) || raw < 0) throw validationFailed({ expectedVersion: 'invalid' })
      if (!service.deleteRequirement(ctx.app, conversation, ctx.params.rid, raw)) throw notFound('The requirement')
      return json({ state: state(ctx, conversation) })
    }),

    route('POST', '/skip', async (ctx, conversation) => {
      const body = await ctx.json()
      const version = expected(body)
      if (!isStage(body.stage) || !isSkippable(body.stage)) throw validationFailed({ stage: 'invalid' })
      if (typeof body.skip !== 'boolean') throw validationFailed({ skip: 'invalid' })
      service.setSkip(ctx.app, conversation, body.stage, body.skip, version)
      return json({ state: state(ctx, conversation) })
    }),

    route('PUT', '/notes', async (ctx, conversation) => {
      const body = await ctx.json()
      const version = expected(body)
      if (!isSection(body.section)) throw validationFailed({ section: 'invalid' })
      const note = typeof body.note === 'string' ? cleanBlock(body.note) : null
      if (note === null) throw validationFailed({ note: 'invalid' })
      if ([...note].length > LIMITS.note) throw validationFailed({ note: 'tooLong' })
      service.setNote(ctx.app, conversation, body.section, note, version)
      return json({ state: state(ctx, conversation) })
    }),

    route('POST', '/plan', async (ctx, conversation) => {
      const body = await ctx.json()
      const version = expected(body)
      let sections: readonly Section[] | 'all' = 'all'
      if (body.sections !== undefined && body.sections !== 'all') {
        if (!Array.isArray(body.sections) || body.sections.length === 0 || body.sections.length > SECTIONS.length || body.sections.some((item) => !isSection(item))) throw validationFailed({ sections: 'invalid' })
        sections = [...new Set(body.sections as Section[])]
      }
      const result = service.makePlan(ctx.app, conversation, sections, 'visitor', sections === 'all' ? 'generate' : `regenerate:${sections.join('+')}`, version)
      if (result.status === 'not_enough_information') throw validationFailed({ plan: 'required' }, 'There is not enough information for a plan yet.')
      return json({ result, state: state(ctx, conversation) }, { status: result.status === 'created' ? 201 : 200 })
    }),

    route('GET', '/plans/:version', (ctx, conversation) => {
      const version = Number(ctx.params.version)
      if (!Number.isInteger(version) || version < 1) throw notFound('The plan version')
      const plan = service.planVersion(ctx.app, conversation.id, version)
      if (!plan) throw notFound('The plan version')
      return json(plan)
    }),
  ]
}

