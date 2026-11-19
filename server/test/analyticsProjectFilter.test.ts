import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SECTIONS, type Metric, type Section } from '../src/modules/analytics/model.ts'
import { buildSectionFor } from '../src/modules/analytics/service.ts'
import { makeAdminAiKit, type AdminAiKit } from './aiAdminKit.ts'
import type { Customer } from './portalKit.ts'

/**
 * PROMPT 32.1: what the project-status filter (`projectStatus`, the project's CURRENT status) does to every figure of the analytics, and what the response says about it. The rules
 * (docs/business-intelligence/FILTER_SEMANTICS.md): a figure about projects as they are NOW is scoped to the selected status; a figure defined for active projects (or for projects
 * On hold) is `unavailable` with a reason, never a zero, when the selection lies outside that definition; an event of the period (a project or task completed, a duration) keeps its
 * historical meaning and is NOT reinterpreted by today's status; every other figure says that it is not about projects. With no status selected nothing changes and no note is added.
 *
 * The projects below make each case distinguishable. Today is 2026-11-03 and the period is the last 30 days.
 */

let k: AdminAiKit
let anna: Customer
const refs: Record<string, any> = {}
const ALL = { requests: true, clients: true, system: true }
const set = (sql: string, params: unknown[] = []) => k.s.db.run(sql, params as never[])

const build = (name: (typeof SECTIONS)[number], query = 'period=last_30_days', access = ALL): Section => buildSectionFor(k.s.app.context, access, name, new URLSearchParams(query)).section
const metric = (s: Section, id: string): Metric => s.metrics.find((m) => m.id === id)!
const dist = (s: Section, id: string) => s.distributions.find((d) => d.id === id)!
const table = (s: Section, id: string) => s.tables.find((t) => t.id === id)!
const keys = (s: Section, id: string) => Object.fromEntries(dist(s, id).items.map((i) => [i.key, i.value]))

async function project(name: string, status: string, over: { startedOn?: string | null; expectedOn?: string | null; completedAt?: string | null; updatedAt?: string } = {}) {
  const made = await k.portal.project(anna.id, { name })
  set('UPDATE client_projects SET status = ?, started_on = ?, expected_on = ?, completed_at = ?, updated_at = COALESCE(?, updated_at) WHERE id = ?', [status, over.startedOn ?? null, over.expectedOn ?? null, over.completedAt ?? null, over.updatedAt ?? null, made.id])
  return made
}
async function task(p: { id: string }, title: string, status: string, over: { dueOn?: string; completedAt?: string } = {}) {
  const made = await k.task(p, { title, ...(over.dueOn ? { dueOn: over.dueOn } : {}) })
  set('UPDATE project_tasks SET status = ?, completed_at = ? WHERE id = ?', [status, over.completedAt ?? null, made.id])
  return made
}
async function milestone(p: { id: string }, title: string, dueOn: string, completedAt: string | null = null) {
  const reply = await k.s.api(`/api/admin/client-projects/${p.id}/milestones`, { method: 'POST', body: { title, dueOn }, headers: k.headers.owner })
  expect(reply.status, reply.text).toBe(201)
  if (completedAt) set("UPDATE client_milestones SET completed_at = ?, status = 'completed' WHERE project_id = ? AND title = ?", [completedAt, p.id, title])
}

beforeAll(async () => {
  k = await makeAdminAiKit()
  anna = await k.customer('anna@example.com', { language: 'en' })

  // A: development, expected date passed (delayed), an overdue milestone, 2 tasks in progress, 1 blocked, 1 waiting for the customer.
  refs.a = await project('Alpha', 'development', { startedOn: '2026-09-01', expectedOn: '2026-10-30' })
  await task(refs.a, 'A in progress 1', 'in_progress')
  await task(refs.a, 'A in progress 2', 'in_progress')
  await task(refs.a, 'A blocked', 'blocked')
  const asked = await task(refs.a, 'A asks the customer', 'waiting_customer')
  set("INSERT INTO project_customer_actions (id, task_id, project_id, action_type, instruction, status, created_at, updated_at) VALUES ('act-a', ?, ?, 'provide_content', 'Send the texts.', 'not_started', '2026-10-20T10:00:00.000Z', '2026-10-20T10:00:00.000Z')", [asked.id, refs.a.id])
  await milestone(refs.a, 'A overdue', '2026-10-28')
  // B: design, on time, a milestone and a task due in the next two weeks.
  refs.b = await project('Bravo', 'design', { startedOn: '2026-10-15', expectedOn: '2026-12-31' })
  await task(refs.b, 'B in progress', 'in_progress', { dueOn: '2026-11-05' })
  await milestone(refs.b, 'B soon', '2026-11-10')
  // C: on hold, expected date passed, a blocked task.
  refs.c = await project('Charlie', 'on_hold', { startedOn: '2026-08-01', expectedOn: '2026-10-01' })
  await task(refs.c, 'C blocked', 'blocked')
  // D: completed in the period, with a task completed in the period and a completed milestone that was due in the period.
  refs.d = await project('Delta', 'completed', { startedOn: '2026-10-10', completedAt: '2026-11-02T09:00:00.000Z' })
  await task(refs.d, 'D done', 'completed', { completedAt: '2026-11-02T08:00:00.000Z' })
  await milestone(refs.d, 'D delivered', '2026-10-31', '2026-11-02T08:00:00.000Z')
  // E: cancelled in the period.
  refs.e = await project('Echo', 'cancelled', { updatedAt: '2026-10-20T10:00:00.000Z' })
  // F: was completed in the period and is in development again today: an EVENT of the period, a different status now.
  refs.f = await project('Foxtrot', 'development', { startedOn: '2026-10-01', completedAt: '2026-10-25T09:00:00.000Z' })
  await task(refs.f, 'F in progress', 'in_progress')
}, 180_000)

afterAll(async () => {
  await k?.close()
})

describe('with no status selected nothing changes and no note is added', () => {
  it('gives the figures of the data and carries no filter note or summary anywhere', () => {
    const s = build('projects')
    expect(Object.fromEntries(s.metrics.map((m) => [m.id, m.value]))).toMatchObject({ activeProjects: 4, completedProjects: 2, projectsOnHold: 1, delayedProjects: 2, overdueMilestones: 1, tasksCompleted: 1, tasksInProgress: 4, blockedTasks: 2, tasksAwaitingCustomer: 1, averageProjectDurationDays: 23.5, milestoneCompletionRate: 50 })
    for (const name of SECTIONS) {
      const section = build(name)
      expect(section.filterSummary, name).toBeUndefined()
      for (const item of [...section.metrics, ...section.money, ...section.series, ...section.distributions, ...section.tables]) expect((item as { filterNote?: unknown }).filterNote, `${name}.${item.id}`).toBeUndefined()
    }
  })
})

describe('a status that active projects can have (development): scoped figures, kept events, empty-by-definition for On hold', () => {
  const s = () => build('projects', 'period=last_30_days&projectStatus=development')

  it('scopes the figures about projects as they are now to the projects in that status, and says so', () => {
    const p = s()
    expect(Object.fromEntries(p.metrics.map((m) => [m.id, m.value]))).toMatchObject({ activeProjects: 2, delayedProjects: 1, overdueMilestones: 1, tasksInProgress: 3, blockedTasks: 1, tasksAwaitingCustomer: 1 })
    for (const id of ['activeProjects', 'delayedProjects', 'overdueMilestones', 'tasksInProgress', 'blockedTasks', 'tasksAwaitingCustomer', 'milestoneCompletionRate']) expect(metric(p, id).filterNote, id).toEqual({ filter: 'projectStatus', effect: 'applied', reason: null })
    // Milestones due in the period of projects in development: Alpha's overdue one only (Delta's belongs to a completed project).
    expect(metric(p, 'milestoneCompletionRate').value).toBe(0)
  })

  it('keeps the events of the period as they are: a project completed in the period is counted whatever status it has today, and the note says so', () => {
    const p = s()
    expect(metric(p, 'completedProjects')).toMatchObject({ value: 2, filterNote: { effect: 'not_applied', reason: 'historical_event' } })
    expect(metric(p, 'tasksCompleted')).toMatchObject({ value: 1, filterNote: { effect: 'not_applied', reason: 'historical_event' } })
    expect(metric(p, 'averageProjectDurationDays')).toMatchObject({ value: 23.5, filterNote: { effect: 'not_applied', reason: 'historical_event' } })
    const series = p.series.find((one) => one.id === 'completedProjectsSeries')!
    expect(series.points.reduce((sum, point) => sum + point.value, 0)).toBe(2)
    expect(series.filterNote).toEqual({ filter: 'projectStatus', effect: 'not_applied', reason: 'historical_event' })
    // The same two events, whatever status is selected.
    for (const status of ['design', 'completed', 'cancelled', 'on_hold']) expect(metric(build('projects', `period=last_30_days&projectStatus=${status}`), 'completedProjects').value, status).toBe(2)
  })

  it('says a figure defined for projects On hold has nothing to show for another status: unavailable with the reason, never a zero', () => {
    expect(metric(s(), 'projectsOnHold')).toMatchObject({ state: 'unavailable', value: null, reason: 'status_not_on_hold', filterNote: { effect: 'empty_by_definition', reason: 'status_not_on_hold' } })
    expect(metric(build('projects', 'period=last_30_days&projectStatus=on_hold'), 'projectsOnHold')).toMatchObject({ state: 'available', value: 1, filterNote: { effect: 'applied' } })
  })

  it('scopes the breakdowns and the tables, and keeps the lists to the projects of that status', () => {
    const p = s()
    expect(keys(p, 'projectsByStatus')).toEqual({ development: 2 })
    expect(dist(p, 'tasksByStatus').filterNote).toMatchObject({ effect: 'applied' })
    const direct = Object.fromEntries(
      k.s.db.all<{ s: string; n: number }>("SELECT t.status AS s, COUNT(*) AS n FROM project_tasks t JOIN client_projects p ON p.id = t.project_id WHERE p.status = 'development' GROUP BY t.status", []).map((row) => [row.s, row.n]),
    )
    expect(keys(p, 'tasksByStatus')).toEqual(direct)
    expect(keys(p, 'milestonesByStatus')).toEqual({ upcoming: 1 })
    expect(table(p, 'projectWorkload').rows.map((row) => row[0]).sort()).toEqual([refs.a.reference, refs.f.reference].sort())
    expect(table(p, 'projectWorkload').filterNote).toMatchObject({ effect: 'applied' })
    expect(table(p, 'upcomingDeadlines').rows).toEqual([])
    const design = table(build('projects', 'period=last_30_days&projectStatus=design'), 'upcomingDeadlines').rows
    expect(design.map((row) => row[0]).sort()).toEqual(['milestone', 'task'])
    expect(design.find((row) => row[0] === 'milestone')![1]).toBe(refs.b.reference)
  })

  it('says in the section summary that the filter applies to part of the section', () => {
    expect(s().filterSummary).toEqual({ projectStatus: { status: 'development', effect: 'partial' } })
  })
})

describe('a status outside "active" (completed, cancelled): figures defined for active projects are empty by definition', () => {
  it('marks every active-only figure unavailable with the reason, and empties the lists, instead of showing zeros', () => {
    for (const status of ['completed', 'cancelled']) {
      const p = build('projects', `period=last_30_days&projectStatus=${status}`)
      for (const id of ['activeProjects', 'delayedProjects', 'overdueMilestones', 'tasksInProgress', 'blockedTasks', 'tasksAwaitingCustomer']) {
        expect(metric(p, id), `${status} ${id}`).toMatchObject({ state: 'unavailable', value: null, reason: 'status_not_active', filterNote: { effect: 'empty_by_definition', reason: 'status_not_active' } })
      }
      expect(dist(p, 'tasksByStatus')).toMatchObject({ total: 0, items: [], filterNote: { effect: 'empty_by_definition' } })
      for (const id of ['projectWorkload', 'upcomingDeadlines']) expect(table(p, id), `${status} ${id}`).toMatchObject({ rows: [], filterNote: { effect: 'empty_by_definition', reason: 'status_not_active' } })
    }
  })

  it('still answers what can be answered for completed projects: their milestones, their count by status, and the events', () => {
    const p = build('projects', 'period=last_30_days&projectStatus=completed')
    expect(keys(p, 'projectsByStatus')).toEqual({ completed: 1 })
    expect(keys(p, 'milestonesByStatus')).toEqual({ completed: 1 })
    expect(metric(p, 'milestoneCompletionRate')).toMatchObject({ value: 100, filterNote: { effect: 'applied' } })
    expect(metric(p, 'completedProjects').value).toBe(2)
  })
})

describe('the overview: project figures follow the filter, every other figure says it is not about projects', () => {
  const o = () => build('executive', 'period=last_30_days&projectStatus=development')

  it('scopes the project KPIs of the overview like the projects section does', () => {
    const e = o()
    expect(metric(e, 'activeProjects')).toMatchObject({ value: 2, filterNote: { effect: 'applied' } })
    expect(metric(e, 'delayedProjects')).toMatchObject({ value: 1, filterNote: { effect: 'applied' } })
    expect(metric(e, 'overdueMilestones')).toMatchObject({ value: 1, filterNote: { effect: 'applied' } })
    expect(metric(e, 'completedProjects')).toMatchObject({ value: 2, filterNote: { effect: 'not_applied', reason: 'historical_event' } })
    expect(build('executive', 'period=last_30_days&projectStatus=completed').metrics.find((m) => m.id === 'activeProjects')).toMatchObject({ state: 'unavailable', reason: 'status_not_active' })
  })

  it('declares every figure that is not about projects as not filtered by project status, money included, and never claims it is the selected subset', () => {
    const e = o()
    for (const id of ['newQuoteRequests', 'newContactMessages', 'newCustomers', 'openQuotations', 'acceptedQuotations', 'customerWaitingForAdministrator', 'recordedRevenue']) expect(metric(e, id).filterNote, id).toEqual({ filter: 'projectStatus', effect: 'not_applied', reason: 'not_project_data' })
    for (const m of e.money) expect(m.filterNote, m.id).toEqual({ filter: 'projectStatus', effect: 'not_applied', reason: 'not_project_data' })
    expect(e.filterSummary).toEqual({ projectStatus: { status: 'development', effect: 'partial' } })
    // The values of the figures that are not about projects are exactly what they are without the filter.
    const plain = build('executive')
    for (const id of ['newQuoteRequests', 'openQuotations', 'acceptedQuotations', 'customerWaitingForAdministrator']) expect(metric(e, id).value, id).toBe(metric(plain, id).value)
  })

  it('leaves a figure the role may not read alone: nothing is said about it', () => {
    const e = build('executive', 'period=last_30_days&projectStatus=development', { requests: false, clients: true, system: false })
    for (const id of ['newQuoteRequests', 'openQuotations', 'acceptedQuotations']) expect(metric(e, id), id).toMatchObject({ state: 'not_permitted', value: null })
    for (const id of ['newQuoteRequests', 'openQuotations']) expect(metric(e, id).filterNote, id).toBeUndefined()
  })
})

describe('the alerts: the alerts about projects follow the filter, the others say they do not', () => {
  const kinds = (s: Section) => new Set((s.extra!.items as Array<{ kind: string }>).map((item) => item.kind))

  it('lists only the project alerts of projects in the selected status, and which kinds are and are not filtered', () => {
    const all = kinds(build('alerts'))
    for (const kind of ['overdue_milestone', 'blocked_task', 'project_on_hold']) expect(all.has(kind), kind).toBe(true)
    const development = build('alerts', 'period=last_30_days&projectStatus=development')
    expect([...kinds(development)].sort()).toEqual(['blocked_task', 'overdue_milestone'])
    const references = (development.extra!.items as Array<{ kind: string; reference: string }>).filter((item) => item.kind === 'overdue_milestone').map((item) => item.reference)
    expect(references).toEqual([refs.a.reference])
    expect(kinds(build('alerts', 'period=last_30_days&projectStatus=on_hold'))).toEqual(new Set(['project_on_hold', 'blocked_task']))
    expect(kinds(build('alerts', 'period=last_30_days&projectStatus=design')).size).toBe(0)
    expect(development.filterSummary).toEqual({
      projectStatus: {
        status: 'development',
        effect: 'partial',
        appliedKinds: ['overdue_milestone', 'project_on_hold', 'blocked_task', 'pending_customer_approval'],
        notAppliedKinds: ['unanswered_customer_message', 'quotation_waiting_long', 'request_not_reviewed', 'consultation_requires_attention'],
      },
    })
  })

  it('does not filter the alerts that are not about projects', () => {
    // Make one alert of a kind that is not about projects (a request that has been New for more than two days) and see it with and without the filter.
    set("INSERT INTO quote_requests (id, reference, language, name, email, description, status, source, content_hash, created_at, updated_at) VALUES ('syn-r', 'SYN-R-1', 'en', 'SYNTHETIC', 'syn@example.test', 'A synthetic request.', 'new', 'shop', 'h1', '2026-10-25T10:00:00.000Z', '2026-10-25T10:00:00.000Z')")
    try {
      expect(kinds(build('alerts')).has('request_not_reviewed')).toBe(true)
      expect(kinds(build('alerts', 'period=last_30_days&projectStatus=design')).has('request_not_reviewed')).toBe(true)
    } finally {
      set("DELETE FROM quote_requests WHERE id = 'syn-r'")
    }
  })
})

describe('a section that is not about projects says so, and the filter cannot bypass authorization', () => {
  it('says the project status filter does not apply to the other sections and changes none of their figures', () => {
    for (const name of ['financial', 'customers', 'funnel', 'consultations', 'communication', 'ai'] as const) {
      const filtered = build(name, 'period=last_30_days&projectStatus=design')
      expect(filtered.filterSummary, name).toEqual({ projectStatus: { status: 'design', effect: 'not_applicable' } })
      const plain = build(name)
      expect(filtered.metrics.map((m) => [m.id, m.value, m.state]), name).toEqual(plain.metrics.map((m) => [m.id, m.value, m.state]))
      expect(filtered.money.map((m) => [m.id, m.lines]), name).toEqual(plain.money.map((m) => [m.id, m.lines]))
    }
  })

  it('builds nothing for an access that may not read a section, whatever filter is asked: no figure, no summary, no hint', () => {
    for (const name of SECTIONS.filter((one) => one !== 'executive')) {
      const s = build(name, 'period=last_30_days&projectStatus=development', { requests: false, clients: false, system: false })
      expect(s, name).toMatchObject({ state: 'not_permitted', metrics: [], money: [], series: [], distributions: [], tables: [] })
      expect(s.filterSummary, name).toBeUndefined()
    }
  })

  it('answers the same through the API for an editor, refuses the AI section for them, and refuses a wrong status or an injection with a 422', async () => {
    const asEditor = (query: string) => k.s.api(`/api/admin/analytics?${query}`, { headers: { Cookie: k.headers.editor.Cookie as string } })
    const projects = await asEditor('section=projects&projectStatus=development')
    expect(projects.status, projects.text).toBe(200)
    expect(projects.json.data.section.filterSummary.projectStatus.effect).toBe('partial')
    const ai = await asEditor('section=ai&projectStatus=development')
    expect(ai.json.data.section).toMatchObject({ state: 'not_permitted', metrics: [] })
    expect(ai.json.data.section.filterSummary).toBeUndefined()
    for (const value of ['finished', "development'; DROP TABLE client_projects; --", '', 'DEVELOPMENT']) {
      const reply = await asEditor(`section=projects&projectStatus=${encodeURIComponent(value)}`)
      if (value === '') expect(reply.status).toBe(200)
      else expect(reply.status, value).toBe(422)
    }
    expect(k.s.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM client_projects', [])!.n).toBe(6)
  })
})

describe('the CSV says what the filter did to each figure, and still holds nothing private', () => {
  it('has the filter note, a [filter-scope] block with each figure\'s effect, and the alert kinds', async () => {
    const reply = await k.s.api('/api/admin/analytics/export?report=projects&period=last_30_days&projectStatus=development', { headers: { Cookie: k.headers.owner.Cookie as string } })
    expect(reply.status).toBe(200)
    const text = reply.text
    expect(text).toContain('# Project status filter: development (applies to part of this report')
    expect(text).toContain('[filter-scope]')
    expect(text).toMatch(/metric,completedProjects,projectStatus,not_applied,historical_event/)
    expect(text).toMatch(/metric,activeProjects,projectStatus,applied,/)
    expect(text).toMatch(/series,completedProjectsSeries,projectStatus,not_applied,historical_event/)
    expect(text).toMatch(/table,projectWorkload,projectStatus,applied,/)
    expect(text).not.toMatch(/@example\.|PRIVATE|password|secret/i)
    const alerts = await k.s.api('/api/admin/analytics/export?report=alerts&period=last_30_days&projectStatus=development', { headers: { Cookie: k.headers.owner.Cookie as string } })
    expect(alerts.text).toMatch(/alert,overdue_milestone,projectStatus,applied,/)
    expect(alerts.text).toMatch(/alert,request_not_reviewed,projectStatus,not_applied,not_project_data/)
    const none = await k.s.api('/api/admin/analytics/export?report=projects&period=last_30_days', { headers: { Cookie: k.headers.owner.Cookie as string } })
    expect(none.text).not.toContain('[filter-scope]')
    const editorAi = await k.s.api('/api/admin/analytics/export?report=ai&projectStatus=development', { headers: { Cookie: k.headers.editor.Cookie as string } })
    expect(editorAi.status).toBe(403)
  })
})

describe('the AI admin assistant cannot be handed the filter', () => {
  it('rejects a project status in the analytics tools\' inputs (their input has no such field)', async () => {
    const conversation = k.conversation(k.owner)
    const tools = await k.tools(k.owner, conversation, { maxToolCalls: 20 })
    for (const name of ['getAnalyticsOverview', 'getFinancialAnalytics', 'getFunnelAnalytics'] as const) expect(await tools.call(name, { projectStatus: 'development' })).toEqual({ schemaRejected: true })
    const overview = (await tools.call('getAnalyticsOverview', {})) as { metrics: Array<{ id: string; filterNote?: unknown }> }
    expect(overview.metrics.some((m) => 'filterNote' in m)).toBe(false)
  })
})
