import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { purge, createConversation, getConversation, eraseConversation } from '../src/modules/ai/store.ts'
import { instructionsFor } from '../src/modules/ai/prompt.ts'
import { loadSettings } from '../src/modules/ai/settings.ts'
import { buildTools } from '../src/modules/ai/tools.ts'
import { readStoredPlan } from '../src/modules/ai/plan.ts'
import { callTool, parseSse, say, scriptedModel } from './aiMock.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * Project discovery on a real server (PROMPT 30): the visitor's panel API, the assistant's tools, the rules that keep a suggestion apart from a
 * confirmed requirement, ownership, concurrency, versions, the quote workflow and retention. The provider is a scripted mock: nothing is
 * requested from the real one.
 */

let server: TestServer | null = null
afterEach(async () => {
  await server?.close()
  server = null
})

async function start(env: Record<string, string> = {}, script: Parameters<typeof scriptedModel>[0] = []) {
  const model = scriptedModel(script)
  server = await startServer({ env: { MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-ai-media-')), ...env }, aiModel: async () => model })
  return { s: server, model }
}

interface Visitor {
  token: string
  sessionId: string
  headers: Record<string, string>
}
const visitor = async (s: TestServer): Promise<Visitor> => {
  const token = (await s.api('/api/ai/session', { body: {} })).json.data.token as string
  return { token, sessionId: token.split('.')[0], headers: { 'X-AI-Session': token } }
}
let counter = 0
const conversation = (s: TestServer, v: Visitor, id = `conv-disc-${String(counter++).padStart(10, '0')}`, language: 'hu' | 'en' | 'nl' = 'en') => {
  const app = s.app.context
  createConversation(app.db, app.clock, v.sessionId, id, language)
  return { id, row: () => getConversation(app.db, v.sessionId, id)! }
}
const url = (id: string, suffix = '') => `/api/ai/conversations/${id}/discovery${suffix}`
const get = (s: TestServer, v: Visitor, id: string, suffix = '') => s.api(url(id, suffix), { headers: v.headers })
const send = (s: TestServer, v: Visitor, id: string, method: string, suffix: string, body: Record<string, unknown>) => s.api(url(id, suffix), { method, body, headers: v.headers })
const version = async (s: TestServer, v: Visitor, id: string) => (await get(s, v, id)).json.data.version as number

/** What a visitor does in the panel to reach a plan that can be approved: a type, a goal, one confirmed requirement, then generate. */
async function build(s: TestServer, v: Visitor, id: string) {
  expect((await send(s, v, id, 'PUT', '/classification', { expectedVersion: await version(s, v, id), type: 'booking' })).status).toBe(200)
  expect((await send(s, v, id, 'PUT', '/facts', { expectedVersion: await version(s, v, id), facts: { projectName: 'Studio Booker', objective: 'Let clients book classes online', audience: 'Yoga students', maintenance: 'ongoing' } })).status).toBe(200)
  const added = await send(s, v, id, 'POST', '/requirements', { expectedVersion: await version(s, v, id), requirement: { title: 'Class calendar', category: 'booking', priority: 'essential' } })
  expect(added.status).toBe(201)
  return added.json.data.state.requirements[0].id as string
}
const generate = (s: TestServer, v: Visitor, id: string, extra: Record<string, unknown> = {}) => send(s, v, id, 'POST', '/plan', { expectedVersion: 0, ...extra })
const generateNow = async (s: TestServer, v: Visitor, id: string, extra: Record<string, unknown> = {}) => send(s, v, id, 'POST', '/plan', { expectedVersion: await version(s, v, id), ...extra })

describe('the visitor\'s panel API', () => {
  it('starts empty and builds a discovery: classification, facts, requirements, then a plan version', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    const empty = (await get(s, v, c.id)).json.data
    expect(empty).toMatchObject({ exists: false, version: 0, stage: 'idea', type: { value: null }, requirements: [], sent: false })
    expect(empty.progress).toHaveLength(13)
    expect(empty.missingForPlan).toEqual(['projectType', 'objective', 'requirements'])
    await build(s, v, c.id)
    const state = (await get(s, v, c.id)).json.data
    expect(state.type).toEqual({ value: 'booking', origin: 'visitor', confirmed: true })
    expect(state.facts.objective).toMatchObject({ value: 'Let clients book classes online', origin: 'visitor', confirmed: true })
    expect(state.requirements[0]).toMatchObject({ title: 'Class calendar', origin: 'visitor', status: 'confirmed', priority: 'essential', required: true })
    expect(state.plan.stale).toBe(true)
    expect(state.stage).toBe('features')
    const made = await generateNow(s, v, c.id)
    expect(made.status).toBe(201)
    expect(made.json.data.result).toMatchObject({ status: 'created', version: 1 })
    const after = made.json.data.state
    expect(after.plan.stale).toBe(false)
    expect(after.plan.latest).toMatchObject({ version: 1, origin: 'visitor' })
    expect(after.plan.latest.content.overview.projectType.value).toBe('booking')
    expect(after.missingForApproval).toEqual([])
    // The plan the quote workflow knows is the projection of that snapshot, bound to its version and hash.
    const projected = readStoredPlan(c.row().plan_json)!
    expect(projected).toMatchObject({ discoveryVersion: 1, discoveryHash: after.plan.latest.hash, businessGoal: 'Let clients book classes online' })
    expect(projected.requiredFeatures).toEqual(['Class calendar'])
  })

  it('refuses to make a plan without a type, a goal and a requirement, and says what is missing', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    const refused = await generate(s, v, c.id)
    expect(refused.status).toBe(422)
    expect(refused.json.error.details.fields.plan).toBe('required')
  })

  it('keeps a plan version immutable: later edits make the plan out of date and a regeneration makes a NEW version, never changing the old one', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    await build(s, v, c.id)
    await generateNow(s, v, c.id)
    const first = (await get(s, v, c.id, '/plans/1')).json.data
    await send(s, v, c.id, 'POST', '/requirements', { expectedVersion: await version(s, v, c.id), requirement: { title: 'Waiting list', category: 'booking', priority: 'optional' } })
    const stale = (await get(s, v, c.id)).json.data
    expect(stale.plan.stale).toBe(true)
    expect(stale.stage).toBe('plan')
    const second = (await generateNow(s, v, c.id)).json.data
    expect(second.result).toMatchObject({ status: 'created', version: 2 })
    expect(second.state.plan.latest.summary).toMatchObject({ requirementsAdded: 1, sections: ['overview', 'requirements', 'architecture', 'phases', 'risks', 'next_steps'] })
    expect((await get(s, v, c.id, '/plans/1')).json.data).toEqual(first)
    expect(second.state.plan.versions.map((meta: { version: number }) => meta.version)).toEqual([2, 1])
    // Nothing changed: no new version.
    const same = (await generateNow(s, v, c.id)).json.data
    expect(same.result).toMatchObject({ status: 'unchanged', version: 2 })
  })

  it('regenerates selected sections only, keeps the visitor\'s notes through it, and never touches what was confirmed', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    await build(s, v, c.id)
    await generateNow(s, v, c.id)
    expect((await send(s, v, c.id, 'PUT', '/notes', { expectedVersion: await version(s, v, c.id), section: 'architecture', note: 'We already have hosting.' })).status).toBe(200)
    await send(s, v, c.id, 'PUT', '/signals', { expectedVersion: await version(s, v, c.id), signals: { roles: 'many', security: 'elevated' } })
    const result = (await generateNow(s, v, c.id, { sections: ['architecture'] })).json.data
    expect(result.result.status).toBe('created')
    const latest = result.state.plan.latest.content
    expect(latest.notes.architecture).toBe('We already have hosting.')
    expect(latest.sections.architecture.discoveryVersion).toBeGreaterThan(latest.sections.overview.discoveryVersion)
    expect(result.state.plan.staleSections).toEqual(expect.arrayContaining(['overview']))
    expect(result.state.plan.stale).toBe(true)
    expect(latest.requirements.items.map((item: { title: string }) => item.title)).toEqual(['Class calendar'])
  })

  it('refuses a stale write with 409 and the current version, so two tabs never overwrite each other', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    const v0 = await version(s, v, c.id)
    expect((await send(s, v, c.id, 'PUT', '/facts', { expectedVersion: v0, facts: { objective: 'First tab' } })).status).toBe(200)
    const lost = await send(s, v, c.id, 'PUT', '/facts', { expectedVersion: v0, facts: { objective: 'Second tab' } })
    expect(lost.status).toBe(409)
    expect(lost.json.error.details).toMatchObject({ reason: 'discovery_conflict', version: 1 })
    expect((await get(s, v, c.id)).json.data.facts.objective.value).toBe('First tab')
    // Simultaneous writes on the same version: exactly one wins.
    const results = await Promise.all([1, 2, 3, 4].map((n) => send(s, v, c.id, 'PUT', '/facts', { expectedVersion: 1, facts: { problem: `Problem ${n}` } })))
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409])
  })

  it('validates every input: unknown keys, wrong types, lengths, enumerations, ids, versions', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    const put = (suffix: string, body: Record<string, unknown>, method = 'PUT') => send(s, v, c.id, method, suffix, body)
    expect((await put('/facts', { facts: { objective: 'x' } })).json.error.details.fields.expectedVersion).toBe('invalid')
    expect((await put('/facts', { expectedVersion: -1, facts: {} })).status).toBe(422)
    expect((await put('/facts', { expectedVersion: 0, facts: { secret: 'x' } })).json.error.details.fields.secret).toBe('unknown')
    expect((await put('/facts', { expectedVersion: 0, facts: { objective: 'x'.repeat(401) } })).json.error.details.fields.objective).toBe('tooLong')
    expect((await put('/facts', { expectedVersion: 0, facts: { maintenance: 'forever' } })).status).toBe(422)
    expect((await put('/classification', { expectedVersion: 0, type: 'spaceship' })).status).toBe(422)
    expect((await put('/signals', { expectedVersion: 0, signals: { roles: 'everyone' } })).status).toBe(422)
    expect((await put('/requirements', { expectedVersion: 0, requirement: { title: '' } }, 'POST')).json.error.details.fields.title).toBe('required')
    expect((await put('/requirements', { expectedVersion: 0, requirement: { title: 'ok', priority: 'urgent' } }, 'POST')).status).toBe(422)
    expect((await put('/requirements/not-an-id', { expectedVersion: 0, title: 'x' })).status).toBe(404)
    expect((await put('/skip', { expectedVersion: 0, stage: 'requirements', skip: true }, 'POST')).status).toBe(422)
    expect((await put('/skip', { expectedVersion: 0, stage: 'budget', skip: 'yes' }, 'POST')).status).toBe(422)
    expect((await put('/notes', { expectedVersion: 0, section: 'secrets', note: 'x' })).status).toBe(422)
    expect((await put('/notes', { expectedVersion: 0, section: 'risks', note: 'x'.repeat(1001) })).json.error.details.fields.note).toBe('tooLong')
    expect((await put('/plan', { expectedVersion: 0, sections: ['everything'] }, 'POST')).status).toBe(422)
    expect((await get(s, v, c.id, '/plans/0')).status).toBe(404)
    expect((await get(s, v, c.id, '/plans/9')).status).toBe(404)
    expect(s.db.all('SELECT 1 FROM ai_discovery')).toEqual([])
  })

  it('lets the visitor skip an optional stage and bring it back, and add, change, confirm, reject and delete requirements', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    const id = await build(s, v, c.id)
    expect((await send(s, v, c.id, 'POST', '/skip', { expectedVersion: await version(s, v, c.id), stage: 'budget', skip: true })).json.data.state.skipped).toEqual(['budget'])
    expect((await send(s, v, c.id, 'POST', '/skip', { expectedVersion: await version(s, v, c.id), stage: 'budget', skip: false })).json.data.state.skipped).toEqual([])
    const changed = await send(s, v, c.id, 'PUT', `/requirements/${id}`, { expectedVersion: await version(s, v, c.id), priority: 'important', description: 'Clients choose a class and a time.', complexity: 'high' })
    expect(changed.json.data.state.requirements[0]).toMatchObject({ priority: 'important', required: false, complexity: 'high', description: 'Clients choose a class and a time.' })
    const rejected = await send(s, v, c.id, 'PUT', `/requirements/${id}`, { expectedVersion: await version(s, v, c.id), status: 'rejected' })
    expect(rejected.json.data.state.requirements[0].status).toBe('rejected')
    const removed = await s.api(url(c.id, `/requirements/${id}?expectedVersion=${await version(s, v, c.id)}`), { method: 'DELETE', headers: v.headers })
    expect(removed.status).toBe(200)
    expect(removed.json.data.state.requirements).toEqual([])
    expect((await s.api(url(c.id, `/requirements/${id}?expectedVersion=${await version(s, v, c.id)}`), { method: 'DELETE', headers: v.headers })).status).toBe(404)
  })

  it('refuses a requirement that is already there, and a 61st one', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    const add = async (title: string) => send(s, v, c.id, 'POST', '/requirements', { expectedVersion: await version(s, v, c.id), requirement: { title } })
    expect((await add('Online payments')).status).toBe(201)
    expect((await add('  online   PAYMENTS ')).status).toBe(409)
    for (let n = 2; n <= 60; n += 1) expect((await add(`Feature number ${n}`)).status).toBe(201)
    const full = await add('One too many')
    expect(full.status).toBe(409)
    expect(full.json.error.details.reason).toBe('limit')
  })

  it('starts over: the discovery, its versions and the projected plan are cleared in one step', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    await build(s, v, c.id)
    await generateNow(s, v, c.id)
    expect(c.row().plan_json).not.toBeNull()
    const cleared = await s.api(`/api/ai/conversations/${c.id}/plan`, { method: 'DELETE', headers: v.headers })
    expect(cleared.status).toBe(200)
    expect(c.row().plan_json).toBeNull()
    for (const table of ['ai_discovery', 'ai_discovery_facts', 'ai_discovery_requirements', 'ai_discovery_plans']) expect(s.db.all(`SELECT 1 FROM ${table}`), table).toEqual([])
  })

  it('switches off with the administration\'s setting: the routes are not found and the older planner returns', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    const admin = await s.signIn('admin')
    const headers = { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }
    expect((await get(s, v, c.id)).status).toBe(200)
    expect((await s.api('/api/admin/ai/settings', { method: 'PUT', body: { discoveryEnabled: false }, headers })).status).toBe(200)
    expect((await get(s, v, c.id)).status).toBe(404)
    expect((await s.api('/api/ai/config')).json.data).toMatchObject({ plannerEnabled: true, discoveryEnabled: false })
    expect(s.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE action = 'ai.settings.update'")?.detail).toContain('discoveryEnabled')
  })
})

describe('the assistant proposes and the visitor confirms', () => {
  async function harness(env: Record<string, string> = {}) {
    const { s, model } = await start(env)
    const v = await visitor(s)
    const c = conversation(s, v)
    const app = s.app.context
    const tools = async (language: 'hu' | 'en' | 'nl' = 'en') => buildTools({ app, knowledge: app.assistant.knowledge, settings: loadSettings(app), conversationId: c.id, sessionId: v.sessionId, language, ipHash: 'h', requestId: 'req-1', counter: { calls: 0 } }) as unknown as Promise<Record<string, { execute: (input: unknown, options: unknown) => Promise<any>; inputSchema: { safeParse: (value: unknown) => { success: boolean } } }>>
    const run = async (name: string, input: Record<string, unknown> = {}) => (await tools())[name].execute(input, { toolCallId: 'c', messages: [] })
    return { s, model, v, c, run, tools }
  }

  it('offers exactly the discovery set (and not the free-form planner) with strict input schemas', async () => {
    const { tools } = await harness()
    const set = await tools()
    expect(Object.keys(set).sort()).toEqual(['assessProjectComplexity', 'classifyProjectType', 'comparePackages', 'extractProjectRequirements', 'generateProjectPlan', 'getDeveloperProfile', 'getFullExperienceDetails', 'getProjectDetails', 'getPublishedServices', 'reviseProjectPlan', 'searchPortfolioProjects', 'submitApprovedQuoteRequest', 'summarizeProjectDiscovery', 'updateDiscoveryStage', 'validateDiscoveryCompleteness'])
    const schema = (name: string) => set[name].inputSchema
    expect(schema('classifyProjectType').safeParse({ type: 'ecommerce' }).success).toBe(true)
    expect(schema('classifyProjectType').safeParse({ type: 'spaceship' }).success).toBe(false)
    expect(schema('classifyProjectType').safeParse({ type: 'saas', model: 'claude-sonnet-5-5' }).success).toBe(false)
    expect(schema('updateDiscoveryStage').safeParse({ facts: { price: '100' } }).success).toBe(false)
    expect(schema('updateDiscoveryStage').safeParse({ skipStages: ['requirements'] }).success).toBe(false)
    expect(schema('updateDiscoveryStage').safeParse({ facts: { maintenance: 'forever' } }).success).toBe(false)
    expect(schema('extractProjectRequirements').safeParse({ requirements: [{ title: 'x', statedByVisitor: true }] }).success).toBe(false)
    expect(schema('extractProjectRequirements').safeParse({ requirements: [{ title: 'Login', statedByVisitor: true, status: 'confirmed' }] }).success).toBe(false)
    expect(schema('extractProjectRequirements').safeParse({ requirements: Array.from({ length: 9 }, () => ({ title: 'Login', statedByVisitor: true })) }).success).toBe(false)
    expect(schema('assessProjectComplexity').safeParse({ signals: { integrations: 99 } }).success).toBe(false)
    expect(schema('reviseProjectPlan').safeParse({ sections: [] }).success).toBe(false)
    expect(schema('generateProjectPlan').safeParse({ anything: 1 }).success).toBe(false)
    // None of them can send a request, set a price or take an address, a key, a model or an identifier of someone else's conversation.
    expect(JSON.stringify(Object.keys(set))).not.toMatch(/price|quote.*create/i)
  })

  it('records what the assistant heard as UNCONFIRMED proposals, labelled with who wrote them', async () => {
    const { run, c, s, v } = await harness()
    expect(await run('classifyProjectType', { type: 'ecommerce', reason: 'Sells candles' })).toMatchObject({ ok: true, applied: true, view: { projectType: { value: 'ecommerce', origin: 'assistant', confirmed: false } } })
    const facts = await run('updateDiscoveryStage', { facts: { objective: 'Sell candles online', audience: 'Gift buyers' } })
    expect(facts).toMatchObject({ ok: true, applied: ['objective', 'audience'], refused: [] })
    const reqs = await run('extractProjectRequirements', { requirements: [{ title: 'Product catalogue', category: 'commerce', priority: 'essential', statedByVisitor: true }, { title: 'Gift wrapping option', category: 'commerce', priority: 'optional', statedByVisitor: false }] })
    expect(reqs).toMatchObject({ ok: true, added: 2, refused: [] })
    const state = (await get(s, v, c.id)).json.data
    expect(state.facts.objective).toMatchObject({ origin: 'assistant', confirmed: false })
    expect(state.requirements.map((r: { title: string; origin: string; basis: string; status: string }) => [r.title, r.origin, r.basis, r.status])).toEqual([
      ['Product catalogue', 'assistant', 'stated', 'unconfirmed'],
      ['Gift wrapping option', 'assistant', 'suggested', 'unconfirmed'],
    ])
    // Nothing the assistant does can make the plan sendable: it has no confirmed requirement.
    expect(state.missingForApproval).toEqual(['plan', 'confirmedRequirement'])
    const generated = await run('generateProjectPlan')
    expect(generated).toMatchObject({ ok: true, status: 'created', readyForApproval: false })
  })

  it('never overwrites what the visitor wrote or confirmed, and tells the model so as a result, not an error', async () => {
    const { run, c, s, v } = await harness()
    await send(s, v, c.id, 'PUT', '/facts', { expectedVersion: 0, facts: { objective: 'My own goal' } })
    await send(s, v, c.id, 'PUT', '/classification', { expectedVersion: 1, type: 'booking' })
    const facts = await run('updateDiscoveryStage', { facts: { objective: 'A goal the model prefers', audience: 'Everyone' } })
    expect(facts).toMatchObject({ ok: true, applied: ['audience'], refused: [{ key: 'objective', reason: 'visitor_wrote_it' }] })
    expect(facts.note).toMatch(/refused|visitor/i)
    expect(await run('classifyProjectType', { type: 'saas' })).toMatchObject({ applied: false, refused: [{ key: 'projectType', reason: 'confirmed_by_visitor' }] })
    expect((await get(s, v, c.id)).json.data.facts.objective.value).toBe('My own goal')
    expect((await get(s, v, c.id)).json.data.type.value).toBe('booking')
    // The visitor confirms an assistant proposal in the panel: it stays the assistant's in origin, and the assistant cannot change it afterwards.
    const version = (await get(s, v, c.id)).json.data.version
    await send(s, v, c.id, 'PUT', '/facts', { expectedVersion: version, facts: {}, confirm: ['audience'] })
    expect((await get(s, v, c.id)).json.data.facts.audience).toMatchObject({ origin: 'assistant', confirmed: true })
    expect(await run('updateDiscoveryStage', { facts: { audience: 'Someone else' } })).toMatchObject({ refused: [{ key: 'audience', reason: 'confirmed_by_visitor' }] })
  })

  it('never re-adds a requirement the visitor rejected, never touches a confirmed one, and refines only its own unconfirmed suggestions', async () => {
    const { run, c, s, v } = await harness()
    await run('extractProjectRequirements', { requirements: [{ title: 'Newsletter', priority: 'optional', statedByVisitor: false }, { title: 'Blog', priority: 'optional', statedByVisitor: false }] })
    const state = (await get(s, v, c.id)).json.data
    const [newsletter, blog] = state.requirements
    await send(s, v, c.id, 'PUT', `/requirements/${newsletter.id}`, { expectedVersion: state.version, status: 'rejected' })
    await send(s, v, c.id, 'PUT', `/requirements/${blog.id}`, { expectedVersion: state.version + 1, status: 'confirmed' })
    const again = await run('extractProjectRequirements', { requirements: [{ title: 'newsletter', statedByVisitor: false }, { title: 'Search', statedByVisitor: false }], changes: [{ id: blog.id, priority: 'essential' }] })
    expect(again.refused).toEqual(expect.arrayContaining([{ key: 'newsletter', reason: 'rejected_by_visitor' }, { key: blog.id, reason: 'confirmed_by_visitor' }]))
    const after = (await get(s, v, c.id)).json.data.requirements
    expect(after.find((r: { title: string }) => r.title === 'Blog')).toMatchObject({ priority: 'optional', status: 'confirmed' })
    // Its own unconfirmed suggestion it may refine.
    const search = after.find((r: { title: string }) => r.title === 'Search')
    expect(await run('extractProjectRequirements', { changes: [{ id: search.id, priority: 'important', description: 'Find products quickly' }] })).toMatchObject({ changed: 1 })
    expect((await get(s, v, c.id)).json.data.requirements.find((r: { id: string }) => r.id === search.id)).toMatchObject({ priority: 'important', description: 'Find products quickly', status: 'unconfirmed' })
  })

  it('assesses the complexity by rules from what it is told, explains it, and calls it no estimate', async () => {
    const { run } = await harness()
    await run('classifyProjectType', { type: 'saas' })
    await run('extractProjectRequirements', { requirements: [{ title: 'Team accounts', category: 'accounts', statedByVisitor: true }] })
    const result = await run('assessProjectComplexity', { signals: { roles: 'many', security: 'regulated', integrations: 4 } })
    expect(result.assessment).toMatchObject({ level: 'large', notAnEstimate: true })
    expect(result.assessment.factors.length).toBeGreaterThan(2)
    expect(result.assessment.unknown).toEqual(expect.arrayContaining(['dataModel']))
    expect(result.note).toMatch(/not an estimate/i)
    expect(JSON.stringify(result.assessment)).not.toMatch(/price|hours|cost|\$|€/i)
    expect(await run('assessProjectComplexity', { signals: { roles: 'single' } })).toMatchObject({ ok: true })
  })

  it('reads the state without changing it, and says what to ask next', async () => {
    const { run, c, s, v } = await harness()
    const before = await version(s, v, c.id)
    const summary = await run('summarizeProjectDiscovery')
    expect(summary).toMatchObject({ ok: true, view: { stage: 'idea', requirementCount: 0, missingForPlan: ['projectType', 'objective', 'requirements'] } })
    expect(summary.view.guidance.instruction).toMatch(/own words/i)
    expect(await version(s, v, c.id)).toBe(before)
    await run('updateDiscoveryStage', { facts: { objective: 'x' } })
    expect((await run('summarizeProjectDiscovery')).view.stage).toBe('type')
  })

  it('checks completeness without changing anything: what a plan needs, what an approval needs, what waits for the visitor, and the next action', async () => {
    const { run, c, s, v } = await harness()
    const before = await version(s, v, c.id)
    let result = await run('validateDiscoveryCompleteness')
    expect(result).toMatchObject({ ok: true, readyForPlan: false, readyForApproval: false, missingForPlan: ['projectType', 'objective', 'requirements'], unconfirmedRequirements: 0, nextAction: 'ask_for_missing' })
    expect(await version(s, v, c.id)).toBe(before)
    await run('classifyProjectType', { type: 'booking' })
    await run('updateDiscoveryStage', { facts: { objective: 'Let clients book classes' } })
    await run('extractProjectRequirements', { requirements: [{ title: 'Class calendar', priority: 'essential', statedByVisitor: true }] })
    result = await run('validateDiscoveryCompleteness')
    expect(result).toMatchObject({ readyForPlan: true, readyForApproval: false, missingForPlan: [], unconfirmedRequirements: 1, nextAction: 'offer_plan' })
    expect(result.unknownCharacteristics).toEqual(expect.arrayContaining(['roles', 'dataModel']))
    // A plan exists, but nothing is confirmed by the visitor yet: the assistant is told to ask the VISITOR to confirm (it cannot).
    await run('generateProjectPlan')
    result = await run('validateDiscoveryCompleteness')
    expect(result).toMatchObject({ readyForApproval: false, nextAction: 'ask_visitor_to_confirm' })
    expect(result.missingForApproval).toContain('confirmedRequirement')
    expect(result.note).toMatch(/only the visitor can confirm/i)
    // The visitor confirms in the panel: it is ready, and the assistant points them at the review.
    const id = (await get(s, v, c.id)).json.data.requirements[0].id
    await send(s, v, c.id, 'PUT', `/requirements/${id}`, { expectedVersion: await version(s, v, c.id), status: 'confirmed' })
    await send(s, v, c.id, 'POST', '/plan', { expectedVersion: await version(s, v, c.id) })
    expect(await run('validateDiscoveryCompleteness')).toMatchObject({ readyForApproval: true, missingForApproval: [], nextAction: 'point_to_review' })
    // A change after the plan makes it stale again.
    await send(s, v, c.id, 'PUT', '/facts', { expectedVersion: await version(s, v, c.id), facts: { timeline: 'autumn' } })
    expect(await run('validateDiscoveryCompleteness')).toMatchObject({ readyForApproval: false, nextAction: 'regenerate_plan' })
  })

  it('moves the stage by itself, lets the assistant skip only an optional stage, and revisits it', async () => {
    const { run } = await harness()
    await run('classifyProjectType', { type: 'business_site' })
    await run('updateDiscoveryStage', { facts: { objective: 'Present the firm' }, skipStages: ['audience'] })
    expect((await run('summarizeProjectDiscovery')).view).toMatchObject({ skippedStages: ['audience'], stage: 'requirements' })
    await run('updateDiscoveryStage', { revisitStages: ['audience'] })
    expect((await run('summarizeProjectDiscovery')).view.stage).toBe('audience')
  })

  it('regenerates chosen sections through the tool, and refuses to make a plan without enough information', async () => {
    const { run } = await harness()
    expect(await run('generateProjectPlan')).toMatchObject({ ok: false, status: 'not_enough_information', missing: ['projectType', 'objective', 'requirements'] })
    await run('classifyProjectType', { type: 'web_app' })
    await run('updateDiscoveryStage', { facts: { objective: 'Dispatch drivers faster' } })
    await run('extractProjectRequirements', { requirements: [{ title: 'Driver app', category: 'accounts', priority: 'essential', statedByVisitor: true }] })
    expect(await run('generateProjectPlan')).toMatchObject({ ok: true, status: 'created', version: 1 })
    await run('assessProjectComplexity', { signals: { roles: 'many', adminArea: 'full' } })
    expect(await run('reviseProjectPlan', { sections: ['architecture', 'risks'] })).toMatchObject({ ok: true, status: 'created', version: 2 })
    expect(await run('reviseProjectPlan', { sections: ['architecture', 'risks'] })).toMatchObject({ ok: true, status: 'unchanged', version: 2 })
  })

  it('works only on the conversation of the session it was built for: another session\'s tools find nothing', async () => {
    const { s, v, c, run } = await harness()
    await run('updateDiscoveryStage', { facts: { objective: 'Mine' } })
    const other = await visitor(s)
    const app = s.app.context
    const theirs = (await buildTools({ app, knowledge: app.assistant.knowledge, settings: loadSettings(app), conversationId: c.id, sessionId: other.sessionId, language: 'en', ipHash: 'h', requestId: 'r2', counter: { calls: 0 } })) as unknown as Record<string, { execute: (input: unknown, options: unknown) => Promise<any> }>
    for (const [name, input] of [['summarizeProjectDiscovery', {}], ['validateDiscoveryCompleteness', {}], ['updateDiscoveryStage', { facts: { objective: 'Stolen' } }], ['classifyProjectType', { type: 'saas' }], ['generateProjectPlan', {}]] as const) {
      expect(await theirs[name].execute(input, { toolCallId: 'x', messages: [] }), name).toMatchObject({ error: 'conversation_not_found' })
    }
    expect((await get(s, v, c.id)).json.data.facts.objective.value).toBe('Mine')
    expect(s.db.all('SELECT 1 FROM ai_discovery')).toHaveLength(1)
  })

  it('survives malformed tool calls from the model: an invalid input changes nothing and the answer still arrives', async () => {
    const { s, v, c } = await harness().then(async (h) => ({ s: h.s, v: h.v, c: h.c }))
    server = null
    await s.close()
    const model = scriptedModel([callTool('classifyProjectType', { type: 'spaceship' }), callTool('updateDiscoveryStage', { facts: { objective: 'x'.repeat(5000) } }), callTool('extractProjectRequirements', { requirements: 'not a list' }), say('I could not note that, but let us continue.')])
    server = await startServer({ env: { MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-ai-media-')), AI_MAX_TOOL_CALLS: '5' }, aiModel: async () => model })
    const visitor2 = await visitor(server)
    conversation(server, visitor2, c.id)
    const response = await server.fetch('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...visitor2.headers }, body: JSON.stringify({ conversationId: c.id, trigger: 'submit-user-message', language: 'en', text: 'I want a shop' }) })
    const chunks = parseSse(await response.text())
    expect(chunks.some((chunk) => chunk.type === 'text-delta')).toBe(true)
    expect(server.db.all('SELECT 1 FROM ai_discovery_facts')).toEqual([])
    expect(server.db.all('SELECT 1 FROM ai_discovery_requirements')).toEqual([])
    void s
    void v
  })

  it('turns a result that does not meet its output schema, or is oversized, into a rejected call and a safe failure for the model', async () => {
    const { s, run } = await harness()
    const app = s.app.context
    // A huge visitor-written fact set cannot make the view blow up: the view clips every value.
    await run('updateDiscoveryStage', { facts: { objective: 'o'.repeat(400), problem: 'p'.repeat(400), audience: 'a'.repeat(300), existingSite: 'e'.repeat(300) } })
    for (let n = 0; n < 8; n += 1) await run('extractProjectRequirements', { requirements: Array.from({ length: 8 }, (_, i) => ({ title: `Requirement ${n}-${i} ${'x'.repeat(70)}`, description: 'd'.repeat(400), statedByVisitor: false })) })
    const view = await run('summarizeProjectDiscovery')
    expect(JSON.stringify(view).length).toBeLessThan(24_000)
    expect(view.view.requirementCount).toBe(60)
    expect(app.db.all("SELECT status FROM ai_tool_calls WHERE status = 'rejected'")).toEqual([])
  })
})

describe('the visitor\'s data stays the visitor\'s', () => {
  it('cannot be read, changed, listed or guessed from another session: everything is "not found"', async () => {
    const { s } = await start()
    const a = await visitor(s)
    const b = await visitor(s)
    const ca = conversation(s, a)
    const cb = conversation(s, b)
    const requirementId = await build(s, a, ca.id)
    await generateNow(s, a, ca.id)
    const attempts: Array<[string, string, Record<string, unknown> | undefined]> = [
      ['GET', url(ca.id), undefined],
      ['GET', url(ca.id, '/plans/1'), undefined],
      ['PUT', url(ca.id, '/facts'), { expectedVersion: 5, facts: { objective: 'x' } }],
      ['PUT', url(ca.id, '/classification'), { expectedVersion: 5, type: 'saas' }],
      ['PUT', url(ca.id, '/signals'), { expectedVersion: 5, signals: { roles: 'many' } }],
      ['POST', url(ca.id, '/requirements'), { expectedVersion: 5, requirement: { title: 'x' } }],
      ['PUT', url(ca.id, `/requirements/${requirementId}`), { expectedVersion: 5, status: 'rejected' }],
      ['DELETE', url(ca.id, `/requirements/${requirementId}?expectedVersion=5`), undefined],
      ['POST', url(ca.id, '/skip'), { expectedVersion: 5, stage: 'budget', skip: true }],
      ['PUT', url(ca.id, '/notes'), { expectedVersion: 5, section: 'risks', note: 'x' }],
      ['POST', url(ca.id, '/plan'), { expectedVersion: 5 }],
      // Their own conversation, but a requirement id that belongs to someone else's.
      ['PUT', url(cb.id, `/requirements/${requirementId}`), { expectedVersion: 0, status: 'rejected' }],
      ['DELETE', url(cb.id, `/requirements/${requirementId}?expectedVersion=0`), undefined],
    ]
    for (const [method, path, body] of attempts) {
      const response = await s.api(path, { method, body, headers: b.headers })
      expect(response.status, `${method} ${path}`).toBe(404)
      expect(JSON.stringify(response.json)).not.toMatch(/Studio Booker|Class calendar|Yoga/)
    }
    // No session, a forged one, a malformed conversation id.
    expect((await s.api(url(ca.id))).status).toBe(401)
    expect((await s.api(url(ca.id), { headers: { 'X-AI-Session': `${a.sessionId}.forged` } })).status).toBe(401)
    expect((await s.api(url('short'), { headers: a.headers })).status).toBe(404)
    // Nothing of A's changed.
    const state = (await get(s, a, ca.id)).json.data
    expect(state.facts.objective.value).toBe('Let clients book classes online')
    expect(state.requirements).toHaveLength(1)
    expect(s.db.all('SELECT 1 FROM ai_discovery WHERE conversation_id = ?', [cb.id])).toEqual([])
  })

  it('treats SQL, markup and control characters in what is written as plain text: stored as given, returned as JSON, never executed', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    const evil = ["'; DROP TABLE ai_discovery; --", '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '${7*7}', '{{constructor}}', 'a\u0000b‮c']
    for (const text of evil) {
      const added = await send(s, v, c.id, 'POST', '/requirements', { expectedVersion: await version(s, v, c.id), requirement: { title: text.slice(0, 100), description: text } })
      expect(added.status, text).toBe(201)
    }
    await send(s, v, c.id, 'PUT', '/facts', { expectedVersion: await version(s, v, c.id), facts: { objective: evil[0], problem: evil[1] } })
    const read = await get(s, v, c.id)
    expect(read.headers.get('content-type')).toMatch(/application\/json/)
    expect(read.headers.get('x-content-type-options')).toBe('nosniff')
    expect(read.json.data.facts.objective.value).toBe(evil[0])
    expect(read.json.data.requirements.map((r: { title: string }) => r.title)).toContain('<script>alert(1)</script>')
    expect(JSON.stringify(read.json.data).includes(String.fromCharCode(0))).toBe(false)
    expect(s.db.all('SELECT 1 FROM ai_discovery')).toHaveLength(1)
    expect(s.db.all("SELECT name FROM sqlite_master WHERE name = 'ai_discovery'")).toHaveLength(1)
  })

  it('refuses another site\'s requests, an oversized body and a flood', async () => {
    const { s } = await start({ RATE_LIMITS: 'true' })
    const v = await visitor(s)
    const c = conversation(s, v)
    const foreign = await s.api(url(c.id, '/facts'), { method: 'PUT', body: { expectedVersion: 0, facts: { objective: 'x' } }, headers: { ...v.headers, Origin: 'https://evil.test' } })
    expect(foreign.status).toBe(403)
    expect(foreign.json.error.code).toBe('origin_not_allowed')
    expect(s.db.all('SELECT 1 FROM ai_discovery')).toEqual([])
    const big = await s.api(url(c.id, '/notes'), { method: 'PUT', raw: JSON.stringify({ expectedVersion: 0, section: 'risks', note: 'x'.repeat(2_000_000) }), headers: v.headers })
    expect(big.status).toBe(413)
    const statuses: number[] = []
    for (let n = 0; n < 95; n += 1) statuses.push((await get(s, v, c.id)).status)
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0)
    // The refused attempts above count against the same limit (90 a minute): the first requests are served, then the flood is stopped.
    expect(statuses.filter((status) => status === 200).length).toBeGreaterThanOrEqual(85)
    expect(statuses.slice(0, 80).every((status) => status === 200)).toBe(true)
  })

  it('holds no contact detail: the discovery tables and what the tools return never contain a name or an e-mail address', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    await build(s, v, c.id)
    await generateNow(s, v, c.id)
    const approval = await s.api(`/api/ai/conversations/${c.id}/quote-approval`, { body: { name: 'Eszter Varga', email: 'eszter@example.com', company: 'Gym Network Ltd', consent: true, planVersion: c.row().plan_version }, headers: v.headers })
    expect(approval.status).toBe(200)
    const dump = JSON.stringify([s.db.all('SELECT * FROM ai_discovery'), s.db.all('SELECT * FROM ai_discovery_facts'), s.db.all('SELECT * FROM ai_discovery_requirements'), s.db.all('SELECT * FROM ai_discovery_plans'), s.db.all('SELECT * FROM ai_discovery_notes'), c.row().plan_json])
    expect(dump).not.toMatch(/Eszter|eszter@|Gym Network/)
  })
})

describe('sending: only an approved discovery plan becomes a quote request, through the existing workflow', () => {
  const contact = { name: 'Eszter Varga', email: 'eszter@example.com', company: 'Gym Network Ltd', consent: true }
  async function ready(env: Record<string, string> = {}) {
    const { s } = await start(env)
    const v = await visitor(s)
    const c = conversation(s, v)
    await build(s, v, c.id)
    await generateNow(s, v, c.id)
    const app = s.app.context
    const submit = async () => ((await buildTools({ app, knowledge: app.assistant.knowledge, settings: loadSettings(app), conversationId: c.id, sessionId: v.sessionId, language: 'en', ipHash: 'h', requestId: 'r', counter: { calls: 0 } })) as unknown as Record<string, { execute: (i: unknown, o: unknown) => Promise<any> }>).submitApprovedQuoteRequest.execute({}, { toolCallId: 's', messages: [] })
    const approve = (extra: Record<string, unknown> = {}) => s.api(`/api/ai/conversations/${c.id}/quote-approval`, { body: { ...contact, planVersion: c.row().plan_version, ...extra }, headers: v.headers })
    return { s, v, c, submit, approve }
  }
  const quotes = (s: TestServer) => s.db.all<{ reference: string; kind: string; source: string; name: string; email: string; brief_json: string; description: string; language: string }>('SELECT * FROM quote_requests')

  it('refuses the model\'s attempt to submit without the visitor\'s approval, and creates nothing', async () => {
    const { s, submit } = await ready()
    expect(await submit()).toMatchObject({ submitted: false, error: 'approval_required' })
    expect(quotes(s)).toEqual([])
  })

  it('creates the request in the existing quote system after the approval, with the structured discovery plan as its brief, the usual reference and the owner notified', async () => {
    const { s, c, submit, approve } = await ready()
    expect((await approve()).status).toBe(200)
    const result = await submit()
    expect(result).toMatchObject({ submitted: true })
    const [quote] = quotes(s)
    expect(quote).toMatchObject({ source: 'control_room_ai', name: 'Eszter Varga', email: 'eszter@example.com', language: 'en' })
    expect(quote.reference).toBe(result.reference)
    expect(quote.reference).toMatch(/^[A-Z]{1,3}-?[A-Z0-9-]+$/)
    const brief = JSON.parse(quote.brief_json) as { questions: { id: string; title: { en: string }; answers: { label: { en: string } }[] }[] }
    const ids = brief.questions.map((question) => question.id)
    expect(ids).toEqual(expect.arrayContaining(['businessGoal', 'discovery', 'discovery-type', 'discovery-complexity', 'discovery-essential', 'discovery-architecture', 'discovery-phases', 'discovery-risks']))
    expect(brief.questions.find((question) => question.id === 'discovery')!.title.en).toMatch(/not a quote and not a confirmed project/i)
    expect(brief.questions.find((question) => question.id === 'discovery-essential')!.answers[0].label.en).toMatch(/Class calendar/)
    expect(JSON.stringify(brief)).not.toMatch(/\bprice\b|€|\$|\bUSD\b|\bEUR\b/i)
    expect(c.row().quote_reference).toBe(quote.reference)
    // The existing outbox and notifier did what they do for any request.
    expect(s.mailer.sent.length + s.db.all('SELECT 1 FROM email_deliveries').length).toBeGreaterThan(0)
    // No second quote: submitting again is refused.
    expect(await submit()).toMatchObject({ submitted: false, error: 'already_sent' })
    expect(quotes(s)).toHaveLength(1)
  })

  it('writes the request in the visitor\'s language: the plan words come from the plan\'s language, in Hungarian and Dutch too', async () => {
    for (const language of ['hu', 'nl'] as const) {
      const { s } = await start()
      const v = await visitor(s)
      const c = conversation(s, v, undefined, language)
      await build(s, v, c.id)
      await generateNow(s, v, c.id)
      await s.api(`/api/ai/conversations/${c.id}/quote-approval`, { body: { ...contact, planVersion: c.row().plan_version }, headers: v.headers })
      const app = s.app.context
      const tools = (await buildTools({ app, knowledge: app.assistant.knowledge, settings: loadSettings(app), conversationId: c.id, sessionId: v.sessionId, language, ipHash: 'h', requestId: 'r', counter: { calls: 0 } })) as unknown as Record<string, { execute: (i: unknown, o: unknown) => Promise<any> }>
      expect(await tools.submitApprovedQuoteRequest.execute({}, { toolCallId: 's', messages: [] })).toMatchObject({ submitted: true })
      const [quote] = quotes(s)
      const brief = JSON.parse(quote.brief_json) as { questions: { id: string; title: Record<string, string> }[] }
      expect(quote.language).toBe(language)
      expect(brief.questions.find((question) => question.id === 'discovery')!.title[language]).toBeTruthy()
      expect(quote.description).toMatch(language === 'hu' ? /Foglalási platform/ : /Boekings/)
      await s.close()
      server = null
    }
  })

  it('refuses an approval for a plan that is out of date, for a plan without a confirmed requirement, and never approves a stale snapshot', async () => {
    const { s, v, c, approve } = await ready()
    await send(s, v, c.id, 'POST', '/requirements', { expectedVersion: await version(s, v, c.id), requirement: { title: 'Waiting list', priority: 'optional' } })
    const stale = await approve()
    expect(stale.status).toBe(409)
    expect(stale.json.error.details.reason).toBe('plan_stale')
    await generateNow(s, v, c.id)
    expect((await approve()).status).toBe(200)
    expect(quotes(s)).toEqual([])
    // Only suggestions: the plan can be made, but not approved.
    const { s: s2 } = await start()
    const v2 = await visitor(s2)
    const c2 = conversation(s2, v2)
    await send(s2, v2, c2.id, 'PUT', '/facts', { expectedVersion: 0, facts: { objective: 'Something' } })
    const app = s2.app.context
    const t = (await buildTools({ app, knowledge: app.assistant.knowledge, settings: loadSettings(app), conversationId: c2.id, sessionId: v2.sessionId, language: 'en', ipHash: 'h', requestId: 'r', counter: { calls: 0 } })) as unknown as Record<string, { execute: (i: unknown, o: unknown) => Promise<any> }>
    await t.classifyProjectType.execute({ type: 'other' }, { toolCallId: '1', messages: [] })
    await t.extractProjectRequirements.execute({ requirements: [{ title: 'Something nice', priority: 'essential', statedByVisitor: true }] }, { toolCallId: '2', messages: [] })
    expect(await t.generateProjectPlan.execute({}, { toolCallId: '3', messages: [] })).toMatchObject({ status: 'created', readyForApproval: false })
    const refused = await s2.api(`/api/ai/conversations/${c2.id}/quote-approval`, { body: { ...contact, planVersion: c2.row().plan_version }, headers: v2.headers })
    expect(refused.status).toBe(422)
    expect(refused.json.error.details.fields.requirements).toBe('required')
  })

  it('drops an approval that was waiting the moment anything the plan is built from changes, so what is sent is exactly what was approved', async () => {
    const { s, v, c, submit, approve } = await ready()
    expect((await approve()).status).toBe(200)
    expect(s.db.all('SELECT 1 FROM ai_approvals WHERE consumed_at IS NULL')).toHaveLength(1)
    await send(s, v, c.id, 'PUT', '/facts', { expectedVersion: await version(s, v, c.id), facts: { timeline: 'next spring' } })
    expect(s.db.all('SELECT 1 FROM ai_approvals WHERE consumed_at IS NULL')).toEqual([])
    expect(await submit()).toMatchObject({ submitted: false, error: 'approval_required' })
    expect(quotes(s)).toEqual([])
  })

  it('refuses a submission when the snapshot the approval was for no longer matches (a tampered or replaced plan)', async () => {
    const { s, c, submit, approve } = await ready()
    expect((await approve()).status).toBe(200)
    s.db.run("UPDATE ai_discovery_plans SET content = REPLACE(content, 'Class calendar', 'Something else') WHERE conversation_id = ?", [c.id])
    expect(await submit()).toMatchObject({ submitted: false, error: 'plan_changed' })
    expect(quotes(s)).toEqual([])
  })

  it('refuses a submission when the draft moved on after the approval, even if the approval somehow survived (defence in depth)', async () => {
    const { s, c, submit, approve } = await ready()
    expect((await approve()).status).toBe(200)
    // Changing the draft through the API drops the approval; here it is changed behind the API's back, the way a bug or a manual edit could.
    s.db.run('UPDATE ai_discovery SET plan_stale = 1, version = version + 1 WHERE conversation_id = ?', [c.id])
    expect(s.db.all('SELECT 1 FROM ai_approvals WHERE consumed_at IS NULL')).toHaveLength(1)
    expect(await submit()).toMatchObject({ submitted: false, error: 'plan_changed' })
    expect(quotes(s)).toEqual([])
  })

  it('freezes the draft once the request is sent: nothing can be changed afterwards except by starting over', async () => {
    const { s, v, c, submit, approve } = await ready()
    await approve()
    expect(await submit()).toMatchObject({ submitted: true })
    // With the CURRENT version, so that it is "sent" that refuses and not a stale version.
    const current = await version(s, v, c.id)
    for (const [method, suffix, body] of [['PUT', '/facts', { expectedVersion: current, facts: { objective: 'Changed' } }], ['POST', '/plan', { expectedVersion: current }], ['POST', '/requirements', { expectedVersion: current, requirement: { title: 'Late' } }], ['PUT', '/notes', { expectedVersion: current, section: 'risks', note: 'Late' }], ['POST', '/skip', { expectedVersion: current, stage: 'budget', skip: true }]] as const) {
      const refused = await send(s, v, c.id, method, suffix, body)
      expect(refused.status, suffix).toBe(409)
      expect(refused.json.error.details.reason, suffix).toBe('sent')
    }
    expect((await get(s, v, c.id)).json.data.sent).toBe(true)
    expect((await s.api(`/api/ai/conversations/${c.id}/plan`, { method: 'DELETE', headers: v.headers })).status).toBe(409)
  })

  it('keeps the older free-form plan editor out of a discovery plan, so it cannot be edited around the rules', async () => {
    const { s, v, c } = await ready()
    const state = (await s.api(`/api/ai/conversations/${c.id}`, { headers: v.headers })).json.data
    const edited = await s.api(`/api/ai/conversations/${c.id}/plan`, { method: 'PUT', body: { expectedVersion: state.version, overview: 'Rewritten' }, headers: v.headers })
    expect(edited.status).toBe(409)
    expect(edited.json.error.details.reason).toBe('discovery_plan')
  })
})

describe('retention and deletion', () => {
  it('removes everything discovery holds when the visitor deletes the conversation, and keeps the numbers', async () => {
    const { s } = await start()
    const v = await visitor(s)
    const c = conversation(s, v)
    await build(s, v, c.id)
    await generateNow(s, v, c.id)
    expect((await s.api(`/api/ai/conversations/${c.id}`, { method: 'DELETE', headers: v.headers })).status).toBe(204)
    for (const table of ['ai_discovery', 'ai_discovery_facts', 'ai_discovery_requirements', 'ai_discovery_plans', 'ai_discovery_notes']) expect(s.db.all(`SELECT 1 FROM ${table}`), table).toEqual([])
    expect(c.row()).toMatchObject({ plan_json: null, title: null })
    expect((await get(s, v, c.id)).status).toBe(404)
  })

  it('removes it with the conversation\'s words after the retention period, by the same job', async () => {
    const { s } = await start({ AI_RETENTION_DAYS: '3' })
    const v = await visitor(s)
    const old = conversation(s, v)
    const recent = conversation(s, v)
    await build(s, v, old.id)
    await build(s, v, recent.id)
    const app = s.app.context
    s.clock.advance(2 * 86_400_000)
    app.db.run('UPDATE ai_conversations SET updated_at = ? WHERE id = ?', [s.clock.now().toISOString(), recent.id])
    s.clock.advance(2 * 86_400_000)
    expect(purge(app.db, app.clock, 3).conversations).toBeGreaterThanOrEqual(1)
    expect(s.db.all('SELECT conversation_id FROM ai_discovery')).toEqual([{ conversation_id: recent.id }])
    expect(s.db.all('SELECT DISTINCT conversation_id FROM ai_discovery_requirements')).toEqual([{ conversation_id: recent.id }])
    eraseConversation(app.db, app.clock, recent.id)
    expect(s.db.all('SELECT 1 FROM ai_discovery')).toEqual([])
  })
})

describe('the instructions', () => {
  it('tell the model to ask one thing at a time, only propose, never confirm, never price, and keep contact details out of the chat', () => {
    const settings = { plannerEnabled: true, quoteEnabled: true, maxOutputTokens: 1500, discoveryEnabled: true }
    const text = instructionsFor('en', settings)
    expect(text).toContain('PROJECT DISCOVERY')
    expect(text).not.toContain('PROJECT PLANNER')
    expect(text).toMatch(/ONE meaningful question at a time/)
    expect(text).toMatch(/You can only PROPOSE/)
    expect(text).toMatch(/never present an assumption or a suggestion as confirmed/i)
    expect(text).toMatch(/Never give a price/)
    expect(text).toMatch(/NOT an estimate of hours or cost/)
    expect(text).toMatch(/Do not ask them to type their e-mail address/)
    expect(instructionsFor('en', { ...settings, discoveryEnabled: false })).toContain('PROJECT PLANNER')
    expect(instructionsFor('hu', settings)).toContain('Answer in Hungarian')
    expect(instructionsFor('en', { ...settings, plannerEnabled: false })).not.toContain('PROJECT DISCOVERY')
  })
})
