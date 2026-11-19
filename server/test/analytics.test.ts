import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SECTIONS } from '../src/modules/analytics/model.ts'
import { buildSectionFor } from '../src/modules/analytics/service.ts'
import { draftBody } from './quotationKit.ts'
import { makeAdminAiKit, type AdminAiKit } from './aiAdminKit.ts'
import type { Customer } from './portalKit.ts'

/**
 * PROMPT 32: the business analytics over HTTP, against a database filled through the real endpoints (quote requests, quotations in two currencies, projects, tasks, consultations,
 * conversations, the AI ledger). Every number below is checked against what was put in: nothing here is estimated by the test and nothing is computed by a model. Where the test has
 * to put the database in a state no endpoint can reach in one step (a task blocked, a quotation declined, a request that arrived 40 days ago) it says so: the clock cannot move
 * without ending the administrators' sessions.
 */

let k: AdminAiKit
let anna: Customer
let bela: Customer
const ZONE = 'Europe/Budapest'
const refs: Record<string, any> = {}

const api = async (who: 'owner' | 'editor' | 'second' | 'none', query = '', section = 'executive') => {
  const headers: Record<string, string> = who === 'none' ? {} : { Cookie: k.headers[who].Cookie as string }
  return k.s.api(`/api/admin/analytics?section=${section}${query ? `&${query}` : ''}`, { headers })
}
const section = async (name: string, query = 'period=last_30_days') => {
  const reply = await api('owner', query, name)
  expect(reply.status, reply.text).toBe(200)
  return reply.json.data.section as any
}
const metric = (s: any, id: string) => s.metrics.find((m: any) => m.id === id)
const money = (s: any, id: string) => s.money.find((m: any) => m.id === id)
const line = (m: any, currency: string) => m.lines.find((l: any) => l.currency === currency)
const distribution = (s: any, id: string) => s.distributions.find((d: any) => d.id === id)
const table = (s: any, id: string) => s.tables.find((t: any) => t.id === id)

/** A quotation that is OUT with the customer (sent, not answered). */
async function sentQuote(email: string, over: Record<string, unknown> = {}, requestOver: Record<string, unknown> = {}) {
  const request = await k.portal.request(email, requestOver)
  const draft = await k.s.api(`/api/admin/quote-requests/${request.id}/quotes`, { method: 'POST', body: {}, headers: k.headers.owner })
  expect(draft.status, draft.text).toBe(201)
  const quoteId = draft.json.data.quotation.id as string
  expect((await k.s.api(`/api/admin/quotes/${quoteId}`, { method: 'PUT', body: draftBody(over), headers: k.headers.owner })).status).toBe(200)
  const sent = await k.s.api(`/api/admin/quotes/${quoteId}/send`, { method: 'POST', body: { note: 'Looking forward to it.' }, headers: k.headers.owner })
  expect(sent.status, sent.text).toBe(200)
  await k.portal.settle()
  return { ...request, quoteId }
}

beforeAll(async () => {
  k = await makeAdminAiKit()
  const set = (sql: string, params: unknown[] = []) => k.s.db.run(sql, params as never[])
  expect((await k.s.api('/api/admin/booking-settings', { method: 'PUT', body: { enabled: true, timeZone: ZONE, slotStepMinutes: 60, bufferMinutes: 0, minNoticeHours: 12, horizonDays: 365 }, headers: k.headers.owner })).status).toBe(200)
  anna = await k.customer('anna@example.com', { language: 'hu' })
  bela = await k.customer('bela@example.com', { language: 'nl' })

  // Projects, milestones and tasks.
  refs.annaProject = await k.portal.project(anna.id, { name: 'Anna site' })
  refs.belaProject = await k.portal.project(bela.id, { name: 'Bela shop' })
  refs.heldProject = await k.portal.project(bela.id, { name: 'Held project' })
  set("UPDATE client_projects SET status = 'on_hold' WHERE id = ?", [refs.heldProject.id])
  set("UPDATE client_projects SET status = 'development', started_on = '2026-09-01', expected_on = '2026-10-30' WHERE id = ?", [refs.annaProject.id])
  const overdue = await k.task(refs.annaProject, { title: 'Overdue logo', dueOn: '2026-10-28' })
  const done = await k.task(refs.annaProject, { title: 'Kickoff' })
  expect((await k.s.api(`/api/admin/client-projects/${refs.annaProject.id}/tasks/${done.id}/status`, { method: 'POST', body: { status: 'completed' }, headers: k.headers.owner })).status).toBe(200)
  const blocked = await k.task(refs.belaProject, { title: 'Blocked integration' })
  set("UPDATE project_tasks SET status = 'blocked' WHERE id = ?", [blocked.id])
  refs.overdueTask = overdue
  const milestone = await k.s.api(`/api/admin/client-projects/${refs.annaProject.id}/milestones`, { method: 'POST', body: { title: 'Design approved', dueOn: '2026-10-30' }, headers: k.headers.owner })
  expect(milestone.status, milestone.text).toBe(201)
  // A project that was completed in the period, with a start date.
  refs.doneProject = await k.portal.project(anna.id, { name: 'Finished site' })
  set("UPDATE client_projects SET status = 'completed', started_on = '2026-10-10', completed_at = '2026-11-02T09:00:00.000Z' WHERE id = ?", [refs.doneProject.id])

  // Quotations: accepted in EUR and in HUF (never added), one out with the customer, one with a price in words, one declined.
  refs.eur = await k.portal.accepted('carla@example.com')
  refs.huf = await k.portal.accepted('hungary@example.com', { quote: { currency: 'HUF', lines: [{ kind: 'item', description: 'Build', quantity: 1, unitPrice: '900000' }] } })
  refs.open = await sentQuote('open@example.com')
  refs.words = await sentQuote('words@example.com', { pricingMode: 'custom', pricingNote: 'A price on request.', lines: [], currency: null })
  refs.declined = await sentQuote('declined@example.com')
  set("UPDATE quotes SET status = 'declined', declined_at = ?, decline_reason = 'Too expensive for now.' WHERE id = ?", [k.s.clock.now().toISOString(), refs.declined.quoteId])
  // A request that arrived 40 days ago (the previous period of "last 30 days"): the clock cannot be moved without ending sessions.
  refs.old = await k.portal.request('old@example.com')
  set('UPDATE quote_requests SET created_at = ?, updated_at = ? WHERE id = ?', ['2026-09-25T10:00:00.000Z', '2026-09-25T10:00:00.000Z', refs.old.id])
  // The accepted EUR request becomes a project (cohort stage 6) which is completed (stage 7).
  const linked = await k.portal.link(anna.id, 'quote_request', refs.eur.id)
  expect(linked).toBeTruthy()
  refs.fromQuote = await k.portal.project(anna.id, { name: 'From the quotation', quoteRequestId: refs.eur.id })
  set("UPDATE client_projects SET status = 'completed', completed_at = '2026-11-03T09:00:00.000Z' WHERE id = ?", [refs.fromQuote.id])

  // Communication: the customer wrote last (waiting for the administrator); the administrator wrote last (waiting for the customer).
  refs.waiting = await k.talk(anna, 'Colours', 'We like crimson. A private-looking secret: PRIVATE-WORD-IN-A-MESSAGE.')
  refs.answered = await k.talk(bela, 'Prices', 'What does it cost?')
  // Three hours pass (the administrators' sessions idle out, so they sign in again: the pages below are read with the new ones).
  k.s.clock.advance(3 * 3_600_000)
  for (const [who, role, email] of [['owner', 'admin', 'owner2@site.test'], ['editor', 'editor', 'editor2@site.test']] as const) {
    const session = await k.s.signIn(role, email)
    k.headers[who] = { Cookie: session.cookie, 'X-CSRF-Token': session.csrf }
  }
  expect((await k.s.api(`/api/admin/communications/${refs.answered}/messages`, { method: 'POST', body: { kind: 'reply', body: 'About that.' }, headers: k.headers.owner })).status).toBe(201)
  expect((await k.s.api(`/api/admin/communications/${refs.waiting}/messages`, { method: 'POST', body: { kind: 'note', body: 'PRIVATE-NOTE-WORD' }, headers: k.headers.owner })).status).toBe(201)

  // Consultations.
  refs.confirmed = k.booking({ name: 'Anna', email: 'anna@example.com', language: 'hu', start_at: '2026-11-10T09:00:00.000Z', end_at: '2026-11-10T09:30:00.000Z' })
  refs.pending = k.booking({ name: 'Pending', email: 'p@example.com', language: 'en', status: 'pending', start_at: '2026-11-04T09:00:00.000Z', end_at: '2026-11-04T09:30:00.000Z' })
  refs.completed = k.booking({ name: 'Done', email: 'd@example.com', language: 'nl', status: 'confirmed', start_at: '2026-10-30T09:00:00.000Z', end_at: '2026-10-30T09:30:00.000Z' })
  set("UPDATE bookings SET status = 'completed', completed_at = '2026-10-30T10:00:00.000Z' WHERE id = ?", [refs.completed.id])

  // The AI ledger: one visitor request and one administrator request.
  const insert = (id: string, audience: string, status: string, cost: number | null, source: string | null) =>
    set('INSERT INTO ai_requests (id, ip_hash, model, status, reserved_cost_usd, actual_cost_usd, cost_source, input_tokens, output_tokens, day, created_at, finished_at, audience, latency_ms, tool_calls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, 'h', 'claude-haiku-5-5', status, 0.01, cost, source, 1000, 100, '2026-11-03', '2026-11-03T09:00:00.000Z', '2026-11-03T09:00:02.000Z', audience, 2000, 1])
  insert('v1', 'visitor', 'completed', 0.004, 'provider_usage')
  insert('a1', 'admin', 'completed', 0.006, 'provider_usage')
  insert('a2', 'admin', 'failed', null, null)
  insert('a3', 'admin', 'completed', null, null)
}, 180_000)

afterAll(async () => {
  await k?.close()
})

describe('every section answers, for every period, with the facts it was given', () => {
  // 90 requests through the real server: a little under 5 s on a quiet machine, so the default timeout is too tight for a loaded one (the full suite runs 160 files at once).
  it('answers all nine sections for all ten presets with a custom range, in one shape', { timeout: 60_000 }, async () => {
    for (const name of SECTIONS) {
      for (const preset of ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days', 'this_month', 'previous_month', 'this_year', 'previous_year', 'period=custom&from=2026-10-01&to=2026-11-30']) {
        const reply = await api('owner', preset.startsWith('period') ? preset : `period=${preset}`, name)
        expect(reply.status, `${name} ${preset}: ${reply.text.slice(0, 200)}`).toBe(200)
        const data = reply.json.data
        expect(data.section.name).toBe(name)
        expect(data.meta.period.zone).toBe(ZONE)
        expect(JSON.stringify(data)).not.toMatch(/NaN|Infinity|undefined/)
      }
    }
  })

  it('tells the period, the zone and the previous equivalent period, and is never cacheable or indexable', async () => {
    const reply = await api('owner', 'period=last_30_days')
    expect(reply.headers.get('cache-control')).toBe('private, no-store')
    expect(reply.headers.get('x-robots-tag')).toMatch(/noindex/)
    expect(reply.json.data.meta).toMatchObject({ currencyNote: 'never_summed_across_currencies', period: { preset: 'last_30_days', from: '2026-10-05', to: '2026-11-03', days: 30, zone: ZONE }, previous: { from: '2026-09-05', to: '2026-10-04' } })
    expect(reply.json.data.meta.generatedAt).toBe(k.s.clock.now().toISOString())
  })
})

describe('the executive overview', () => {
  it('counts what happened in the period and compares it with the one before', async () => {
    const s = await section('executive')
    expect(metric(s, 'newQuoteRequests')).toMatchObject({ state: 'available', kind: 'actual', value: 5, previous: 1, comparison: 'period', change: 4 })
    expect(metric(s, 'newCustomers').value).toBe(2)
    expect(metric(s, 'acceptedQuotations')).toMatchObject({ value: 2, previous: 0 })
    expect(metric(s, 'openQuotations')).toMatchObject({ value: 2, comparison: 'snapshot', previous: null, change: null })
    expect(metric(s, 'completedProjects').value).toBe(2)
    expect(metric(s, 'activeProjects')).toMatchObject({ comparison: 'snapshot' })
    expect(metric(s, 'customerWaitingForAdministrator')).toMatchObject({ value: 1, comparison: 'snapshot' })
    expect(metric(s, 'overdueMilestones').value).toBe(1)
  })

  it('never shows revenue as zero: it is unavailable, and so is an unknown comparison', async () => {
    const s = await section('executive')
    expect(metric(s, 'recordedRevenue')).toMatchObject({ state: 'unavailable', value: null, reason: 'no_payment_data' })
    const custom = await section('executive', 'period=custom&from=2000-01-01&to=2000-01-31')
    expect(metric(custom, 'newQuoteRequests')).toMatchObject({ value: 0, state: 'available', comparison: 'none', previous: null, changePercent: null })
  })
})

describe('the financial pipeline: contract value, not cash, one line per currency', () => {
  it('keeps EUR and HUF apart and uses the stored minor units exactly', async () => {
    const s = await section('financial')
    const accepted = money(s, 'acceptedQuotationValue')
    expect(accepted.lines.map((l: any) => l.currency)).toEqual(['EUR', 'HUF'])
    expect(line(accepted, 'EUR')).toMatchObject({ minor: 300050, count: 1, priced: 1 })
    expect(line(accepted, 'HUF')).toMatchObject({ minor: 900000, count: 1 })
    const stored = k.s.db.all<{ currency: string; total_minor: number }>("SELECT currency, total_minor FROM quotes WHERE status = 'accepted' ORDER BY currency")
    expect(stored).toEqual([{ currency: 'EUR', total_minor: 300050 }, { currency: 'HUF', total_minor: 900000 }])
    // No line anywhere adds the two.
    expect(JSON.stringify(s.money)).not.toMatch(/1200050|"currency":"(USD|ALL)"/)
  })

  it('counts a quotation with a price in words but gives it no value, and shows the open pipeline as a state', async () => {
    const s = await section('financial')
    const pipeline = money(s, 'potentialPipelineValue')
    expect(pipeline.comparison).toBe('snapshot')
    expect(line(pipeline, 'EUR')).toMatchObject({ minor: 300050, count: 1, priced: 1 })
    expect(pipeline.withoutAmount).toBe(1)
    expect(metric(s, 'openQuotations').value).toBe(2)
  })

  it('reports quoted, declined and average values per currency, from the stored figures', async () => {
    const s = await section('financial')
    // Quotations sent in the period that still stand: the two accepted, the open one, the price-in-words one, the declined one.
    expect(line(money(s, 'quotedValue'), 'EUR')).toMatchObject({ minor: 300050 * 3, count: 3 })
    expect(line(money(s, 'quotedValue'), 'HUF')).toMatchObject({ minor: 900000, count: 1 })
    expect(line(money(s, 'declinedQuotationValue'), 'EUR')).toMatchObject({ minor: 300050, count: 1 })
    expect(line(money(s, 'averageQuotationValue'), 'EUR')).toMatchObject({ minor: 300050 })
    expect(line(money(s, 'averageQuotationValue'), 'HUF')).toMatchObject({ minor: 900000 })
    expect(table(s, 'acceptedVersusDeclined').rows).toEqual([['EUR', 300050, 300050], ['HUF', 900000, 0]])
  })

  it('marks what the system does not store as unavailable, never as zero', async () => {
    const s = await section('financial')
    expect(metric(s, 'recordedRevenue')).toMatchObject({ state: 'unavailable', reason: 'no_payment_data', value: null })
    expect(metric(s, 'outstandingReceivables')).toMatchObject({ state: 'unavailable', reason: 'no_payment_data' })
    expect(metric(s, 'requestedBudgetAmount')).toMatchObject({ state: 'unavailable', reason: 'stored_as_text' })
    expect(money(s, 'recordedRevenueMoney')).toMatchObject({ state: 'unavailable', lines: [] })
    expect(s.limitations).toEqual(expect.arrayContaining(['no_payment_data', 'no_pipeline_history', 'currencies_not_summed']))
    expect(s.series.some((x: any) => /pipeline/i.test(x.id))).toBe(false)
  })

  it('filters by currency', async () => {
    const s = await section('financial', 'period=last_30_days&currency=HUF')
    expect(money(s, 'acceptedQuotationValue').lines.map((l: any) => l.currency)).toEqual(['HUF'])
    expect(money(s, 'potentialPipelineValue').lines).toEqual([])
  })

  it('draws accepted value over time per currency from the acceptance timestamps', async () => {
    const s = await section('financial')
    const eur = s.series.find((x: any) => x.id === 'acceptedValueSeries' && x.currency === 'EUR')
    expect(eur.points.reduce((sum: number, p: any) => sum + p.value, 0)).toBe(300050)
    expect(eur.points.find((p: any) => p.key === '2026-11-03').value).toBe(300050)
  })
})

describe('the conversion funnel is a cohort, not a snapshot', () => {
  it('follows the requests received in the period through real timestamps and events', async () => {
    const s = await section('funnel')
    const stages = s.extra.stages as any[]
    expect(stages.map((x) => x.stage)).toEqual(['received', 'reviewed', 'prepared', 'sent', 'accepted', 'project', 'completed'])
    const by = Object.fromEntries(stages.map((x) => [x.stage, x.count]))
    expect(by.received).toBe(5)
    expect(by.prepared).toBe(5)
    expect(by.sent).toBe(5)
    expect(by.reviewed).toBe(5)
    expect(by.accepted).toBe(2)
    expect(by.project).toBe(1)
    expect(by.completed).toBe(1)
    expect(stages.find((x) => x.stage === 'accepted').conversionFromPrevious).toBe(40)
    expect(stages.find((x) => x.stage === 'received').conversionFromPrevious).toBeNull()
    expect(s.limitations).toEqual(expect.arrayContaining(['cohort_not_matured', 'status_snapshot_not_a_funnel']))
  })

  it('keeps the current-state distribution apart from the funnel, and counts only recorded decline reasons', async () => {
    const s = await section('funnel')
    expect(distribution(s, 'cohortCurrentStatus').total).toBe(5)
    expect(metric(s, 'declinedWithRecordedReason').value).toBe(1)
    expect(JSON.stringify(s)).not.toContain('Too expensive')
    expect(metric(s, 'requestsAwaitingReview').comparison).toBe('snapshot')
  })

  it('a cohort in a period with no requests is empty, not an error, and has no invented rate', async () => {
    const s = await section('funnel', 'period=custom&from=2020-01-01&to=2020-01-31')
    expect((s.extra.stages as any[]).every((x) => x.count === 0 && (x.conversionFromPrevious === null))).toBe(true)
  })
})

describe('customers, projects, consultations and communication', () => {
  it('describes customers by stored facts and rules, and says what is not stored', async () => {
    const s = await section('customers')
    expect(metric(s, 'totalCustomers').value).toBe(2)
    expect(metric(s, 'customersByCountry')).toMatchObject({ state: 'unavailable', reason: 'country_not_stored' })
    expect(metric(s, 'customerAcquisitionSource')).toMatchObject({ state: 'unavailable' })
    expect(Object.fromEntries(distribution(s, 'customersByLanguage').items.map((i: any) => [i.key, i.value]))).toMatchObject({ hu: 1, nl: 1 })
    expect(distribution(s, 'customerSegments').items.map((i: any) => i.key)).toEqual(['segmentNew', 'segmentActiveProject', 'segmentCompletedProject', 'segmentReturning', 'segmentOpenInquiry', 'segmentAwaitingAction'])
    expect(distribution(s, 'customerLifecycle').items.map((i: any) => i.key)[0]).toBe('lifecycleAccount')
    expect(s.limitations).toContain('no_inference_about_people')
  })

  it('counts projects, tasks and milestones from their own statuses and dates', async () => {
    const s = await section('projects')
    expect(metric(s, 'completedProjects')).toMatchObject({ value: 2, previous: 0 })
    expect(metric(s, 'projectsOnHold').value).toBe(1)
    expect(metric(s, 'delayedProjects').value).toBe(1)
    expect(metric(s, 'overdueMilestones').value).toBe(1)
    expect(metric(s, 'blockedTasks').value).toBe(1)
    expect(metric(s, 'tasksCompleted').value).toBe(1)
    expect(metric(s, 'averageProjectDurationDays')).toMatchObject({ value: 23, kind: 'derived' })
    expect(metric(s, 'milestoneCompletionRate')).toMatchObject({ state: 'available', value: 0, kind: 'derived' })
    const noneDue = await section('projects', 'period=custom&from=2026-01-01&to=2026-01-31')
    expect(metric(noneDue, 'milestoneCompletionRate')).toMatchObject({ state: 'unavailable', value: null, reason: 'no_milestones_due_in_period' })
    expect(distribution(s, 'projectsByStatus').total).toBe(5)
    expect(table(s, 'projectWorkload').rows.map((r: any[]) => r[0])).toContain(refs.annaProject.reference)
    const filtered = await section('projects', 'period=last_30_days&projectStatus=on_hold')
    expect(distribution(filtered, 'projectsByStatus').items).toEqual([{ key: 'on_hold', value: 1 }])
  })

  it('counts consultations from their own timestamps and does not assume a past time was attended', async () => {
    const s = await section('consultations')
    expect(metric(s, 'consultationRequests').value).toBe(3)
    expect(metric(s, 'completedConsultations').value).toBe(1)
    expect(metric(s, 'upcomingConsultations')).toMatchObject({ value: 2, comparison: 'snapshot' })
    expect(metric(s, 'bookingConversionRate').kind).toBe('derived')
    expect(s.limitations).toEqual(expect.arrayContaining(['completed_is_a_status_an_administrator_set', 'past_time_is_not_attendance']))
    const hu = await section('consultations', 'period=last_30_days&language=hu')
    expect(metric(hu, 'consultationRequests').value).toBe(1)
  })

  it('separates the customer waiting for the administrator from the administrator waiting for the customer, and measures the answer time from the messages', async () => {
    const s = await section('communication')
    expect(metric(s, 'customerWaitingForAdministrator')).toMatchObject({ value: 1, comparison: 'snapshot' })
    expect(metric(s, 'administratorWaitingForCustomer')).toMatchObject({ value: 1 })
    expect(metric(s, 'openConversations').value).toBe(2)
    expect(metric(s, 'messagesFromCustomers').value).toBe(2)
    expect(metric(s, 'messagesFromAdministrators').value).toBe(1)
    expect(metric(s, 'averageResponseHours')).toMatchObject({ value: 3, kind: 'derived' })
    expect(metric(s, 'responsesMeasured').value).toBe(1)
    expect(Object.fromEntries(distribution(s, 'messagesByLanguage').items.map((i: any) => [i.key, i.value]))).toEqual({ hu: 1, nl: 2 })
  })

  it('never reads a private note or a message text', async () => {
    for (const name of SECTIONS) expect(JSON.stringify(await section(name))).not.toMatch(/PRIVATE-NOTE-WORD|PRIVATE-WORD-IN-A-MESSAGE|crimson|anna@example\.com|bela@example\.com/)
  })
})

describe('AI usage and cost', () => {
  it('keeps visitor and administrator usage apart, adds a combined total, and calls the cost an estimate', async () => {
    const s = await section('ai')
    const rows = table(s, 'aiUsageByAudience').rows as any[][]
    const by = Object.fromEntries(rows.map((r) => [r[0], r]))
    expect(by.visitor.slice(1, 4)).toEqual([1, 1, 0])
    expect(by.admin.slice(1, 4)).toEqual([3, 2, 1])
    expect(by.combined[1]).toBe(4)
    expect(by.combined[7]).toBeCloseTo(0.01, 6)
    expect(metric(s, 'aiEstimatedCostUsdCombined')).toMatchObject({ kind: 'estimate', value: 0.01 })
    expect(by.admin[10]).toBe(1)
    expect(s.limitations).toEqual(expect.arrayContaining(['cost_is_an_estimate', 'ledger_has_no_text']))
    expect(table(s, 'aiBudget').rows[0][0]).toBe('day')
  })
})

describe('operational alerts', () => {
  it('lists each condition once, with a severity, a reason, a reference, a date and a next action, and changes nothing', async () => {
    const before = k.s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM client_projects WHERE status = 'on_hold'")!.n
    const s = await section('alerts')
    const items = s.extra.items as any[]
    const kinds = new Set(items.map((i) => i.kind))
    for (const kind of ['overdue_milestone', 'project_on_hold', 'blocked_task', 'consultation_requires_attention']) expect(kinds.has(kind), kind).toBe(true)
    for (const item of items) {
      expect(['high', 'medium', 'low']).toContain(item.severity)
      expect(item).toMatchObject({ reason: expect.any(String), reference: expect.any(String), date: expect.any(String), nextAction: expect.any(String), path: expect.stringMatching(/^\//) })
      expect(item.id).toBe(`${item.kind}:${item.reference}`)
    }
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
    const order = { high: 0, medium: 1, low: 2 } as Record<string, number>
    expect(items.map((i) => order[i.severity])).toEqual([...items.map((i) => order[i.severity])].sort())
    expect(k.s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM client_projects WHERE status = 'on_hold'")!.n).toBe(before)
  })
})

describe('permissions and validation', () => {
  it('needs a signed-in administrator, and an editor sees what an editor may read, with the rest marked, not zeroed', async () => {
    expect((await api('none')).status).toBe(401)
    expect((await k.s.api('/api/admin/analytics/export?report=financial', {})).status).toBe(401)
    const editor = await api('editor', 'period=last_30_days', 'ai')
    expect(editor.status).toBe(200)
    expect(editor.json.data.section).toMatchObject({ state: 'not_permitted', metrics: [], limitations: ['not_permitted'] })
    expect(editor.json.data.access).toEqual({ requests: true, clients: true, system: false })
    expect((await api('editor', 'period=last_30_days', 'financial')).json.data.section.state).toBe('available')
    expect((await k.s.api('/api/admin/analytics/export?report=ai&period=last_7_days', { headers: { Cookie: k.headers.editor.Cookie } })).status).toBe(403)
  })

  it('applies a permission taken away at once (no cache of authority or of data)', async () => {
    const temp = await k.s.signIn('editor', 'revoked@site.test')
    const read = () => k.s.api('/api/admin/analytics?section=financial', { headers: { Cookie: temp.cookie } })
    expect((await read()).json.data.section.state).toBe('available')
    k.s.db.run("UPDATE admin_users SET status = 'disabled' WHERE email = ?", ['revoked@site.test'])
    expect((await read()).status).toBe(401)
  })

  it('refuses an unknown parameter, a wrong value, a bad range and an injection with a 422 naming the field', async () => {
    for (const query of ['currency=USD', 'currency=EUR%27%20OR%201%3D1', 'language=fr', 'period=next_week', 'period=custom', 'period=custom&from=2026-02-30&to=2026-03-01', 'period=custom&from=2026-03-02&to=2026-03-01', 'service=Robert%27);%20DROP%20TABLE%20quotes;--', 'package=A%20B', 'projectStatus=almost', 'quoteStatus=maybe', 'consultationStatus=attended', 'unknownFilter=1', 'lang=de']) {
      const reply = await api('owner', query)
      expect(reply.status, query).toBe(422)
    }
    expect((await api('owner', '', 'nonsense')).status).toBe(404)
    expect(k.s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM quotes')!.n).toBeGreaterThan(0)
  })

  it('treats a service or package filter as a value: a real one filters, an unknown one finds nothing', async () => {
    const s = await section('funnel', 'period=last_30_days&service=website')
    expect(s.extra.stages[0].count).toBeGreaterThan(0)
    const none = await section('funnel', 'period=last_30_days&service=nosuchservice')
    expect(none.extra.stages[0].count).toBe(0)
  })
})

describe('export', () => {
  it('is the screen\'s section as a CSV file with the period, the zone, the filters and the estimate notes, and it is audited without content', async () => {
    const reply = await k.s.fetch('/api/admin/analytics/export?report=financial&period=last_30_days&currency=EUR', { headers: { Cookie: k.headers.owner.Cookie } })
    expect(reply.status).toBe(200)
    expect(reply.headers.get('content-type')).toMatch(/text\/csv; charset=utf-8/)
    expect(reply.headers.get('content-disposition')).toBe('attachment; filename="analytics-financial-2026-10-05_2026-11-03.csv"')
    expect(reply.headers.get('cache-control')).toBe('private, no-store')
    expect(reply.headers.get('x-content-type-options')).toBe('nosniff')
    const csv = await reply.text()
    expect(csv).toContain('# Report: financial')
    expect(csv).toContain('Period: 2026-10-05 to 2026-11-03')
    expect(csv).toContain(`Business time zone: ${ZONE}`)
    expect(csv).toContain('Filters: currency=EUR')
    expect(csv).toMatch(/acceptedQuotationValue,actual,available,EUR,300050,/)
    expect(csv).not.toMatch(/acceptedQuotationValue,actual,available,HUF/)
    expect(csv).toContain('recordedRevenue')
    expect(csv).toContain('unavailable')
    expect(csv).not.toMatch(/PRIVATE-|anna@example|@example\.com/)
    const logged = k.s.db.get<{ action: string; detail: string | null }>("SELECT action, detail FROM audit_log WHERE action = 'analytics.export' ORDER BY id DESC LIMIT 1")
    expect(logged?.action).toBe('analytics.export')
    expect(String(logged?.detail)).not.toMatch(/300050|carla/)
  })

  it('exports the funnel and the alerts with their own tables, and every cell that could be a formula is defused', async () => {
    const funnel = await (await k.s.fetch('/api/admin/analytics/export?report=funnel&period=last_30_days', { headers: { Cookie: k.headers.owner.Cookie } })).text()
    expect(funnel).toContain('[funnel]')
    expect(funnel).toContain('received,5,')
    const alerts = await (await k.s.fetch('/api/admin/analytics/export?report=alerts', { headers: { Cookie: k.headers.owner.Cookie } })).text()
    expect(alerts).toContain('[alerts]')
    for (const row of (await section('alerts')).extra.items) expect(alerts).toContain(row.reference)
    expect(funnel + alerts).not.toMatch(/^[=+@]/m)
  })
})

describe('the service decides by the access it is given, not only by the route', () => {
  const build = (access: { requests: boolean; clients: boolean; system: boolean }, name: (typeof SECTIONS)[number]) => buildSectionFor(k.s.app.context, access, name, new URLSearchParams('period=last_30_days')).section
  const NONE = { requests: false, clients: false, system: false }

  it('builds nothing for an access that reads nothing: every section is not_permitted with no figure, and the overview marks each figure so', () => {
    for (const name of SECTIONS.filter((one) => one !== 'executive')) {
      const s = build(NONE, name)
      expect(s, name).toMatchObject({ state: 'not_permitted', metrics: [], money: [], series: [], distributions: [], tables: [], limitations: ['not_permitted'] })
    }
    const overview = build(NONE, 'executive')
    for (const m of overview.metrics.filter((one) => one.id !== 'recordedRevenue')) expect(m, m.id).toMatchObject({ state: 'not_permitted', value: null })
    for (const m of overview.money) expect(m, m.id).toMatchObject({ state: 'not_permitted', lines: [] })
  })

  it('opens each section only for the permission of the data behind it', () => {
    const state = (access: typeof NONE) => Object.fromEntries(SECTIONS.map((name) => [name, build(access, name).state === 'available']))
    expect(state({ requests: true, clients: false, system: false })).toEqual({ executive: true, financial: true, customers: false, funnel: true, projects: false, consultations: true, communication: false, ai: false, alerts: true })
    expect(state({ requests: false, clients: true, system: false })).toEqual({ executive: true, financial: false, customers: true, funnel: false, projects: true, consultations: false, communication: true, ai: false, alerts: true })
    expect(state({ requests: false, clients: false, system: true })).toEqual({ executive: true, financial: false, customers: false, funnel: false, projects: false, consultations: false, communication: false, ai: true, alerts: false })
  })

  it('builds only the alerts of the areas the access reads, and names the areas left out', () => {
    const requestsOnly = build({ requests: true, clients: false, system: false }, 'alerts')
    const kindsOf = (s: ReturnType<typeof build>) => new Set((s.extra!.items as Array<{ kind: string }>).map((item) => item.kind))
    expect(s_leftOut(requestsOnly)).toEqual(['projects_and_communication'])
    for (const kind of ['blocked_task', 'overdue_milestone', 'project_on_hold', 'unanswered_customer_message', 'pending_customer_approval']) expect(kindsOf(requestsOnly).has(kind), kind).toBe(false)
    expect(kindsOf(requestsOnly).has('consultation_requires_attention')).toBe(true)
    const clientsOnly = build({ requests: false, clients: true, system: false }, 'alerts')
    expect(s_leftOut(clientsOnly)).toEqual(['quotes_and_consultations'])
    for (const kind of ['request_not_reviewed', 'quotation_waiting_long', 'consultation_requires_attention']) expect(kindsOf(clientsOnly).has(kind), kind).toBe(false)
    expect(kindsOf(clientsOnly).has('blocked_task')).toBe(true)
  })

  it('never values a quotation priced in words, even when an amount sits on the row', () => {
    const id = refs.words.quoteId as string
    const before = k.s.db.get<{ currency: string | null; total_minor: number | null }>('SELECT currency, total_minor FROM quotes WHERE id = ?', [id])!
    const all = { requests: true, clients: true, system: true }
    const sums = () => build(all, 'financial').money.filter((m) => ['quotedValue', 'acceptedQuotationValue', 'declinedQuotationValue', 'averageQuotationValue', 'potentialPipelineValue'].includes(m.id)).map((m) => [m.id, m.lines.map((l) => [l.currency, l.minor, l.priced])])
    const unchanged = sums()
    // A sent quotation is never edited (a trigger says so): the guard is taken off for this one statement, in this test's own in-memory database, and put back.
    const guard = k.s.db.get<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'quotes' AND sql LIKE '%never edited%'")!
    k.s.db.exec('DROP TRIGGER ' + guard.name)
    k.s.db.run("UPDATE quotes SET currency = 'EUR', total_minor = 777700 WHERE id = ?", [id])
    try {
      const pipeline = build({ requests: true, clients: true, system: true }, 'financial').money.find((m) => m.id === 'potentialPipelineValue')!
      expect(pipeline.lines.find((l) => l.currency === 'EUR')).toMatchObject({ minor: 300050, count: 2, priced: 1 })
      expect(pipeline.withoutAmount).toBe(1)
      // None of the sums (quoted, accepted, declined, average, pipeline) moves because of an amount sitting on a quotation priced in words (it is counted, not valued).
      expect(sums()).toEqual(unchanged)
    } finally {
      k.s.db.run('UPDATE quotes SET currency = ?, total_minor = ? WHERE id = ?', [before.currency, before.total_minor, id])
      k.s.db.exec(guard.sql)
    }
  })

  it('counts only customer-visible messages, never a private note: what is counted for the administrators is what the customer can see', () => {
    const s = build({ requests: true, clients: true, system: true }, 'communication')
    const range = buildSectionFor(k.s.app.context, { requests: true, clients: true, system: true }, 'communication', new URLSearchParams('period=last_30_days')).section
    expect(range).toBeTruthy()
    const from = '2026-10-05T00:00:00.000Z'
    const visible = k.s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM conversation_messages WHERE sender_type = 'admin' AND visibility = 'customer' AND message_type = 'text' AND deleted_at IS NULL AND created_at >= ?", [from])!.n
    const everything = k.s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM conversation_messages WHERE sender_type = 'admin' AND created_at >= ?", [from])!.n
    expect(everything).toBeGreaterThan(visible)
    expect(s.metrics.find((m) => m.id === 'messagesFromAdministrators')!.value).toBe(visible)
  })
})

const s_leftOut = (section: { extra?: Record<string, unknown> }) => ((section.extra ?? {}).leftOut ?? []) as string[]
