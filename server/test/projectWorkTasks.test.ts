import { afterEach, describe, expect, it } from 'vitest'
import { TASK_STATUSES, TASK_TRANSITIONS, canMoveTask } from '../src/modules/projectwork/model.ts'
import { makeWorkKit, type WorkKit } from './workKit.ts'

/**
 * The tasks of a project (PROMPT 26): what the owner may create, change and move, and what the rules refuse. Every call is the real endpoint; the database is
 * read only to prove what a response was not asked to show.
 */

let w: WorkKit
afterEach(async () => {
  await w?.close()
})

describe('creating and reading tasks', () => {
  it('creates a private task with sensible defaults, and the owner sees it in the workspace', async () => {
    w = await makeWorkKit()
    const { id, reference } = await w.task({ title: 'Sketch the layout', description: 'Internal: use the grid.', customerDescription: 'We draw the first sketch.' })
    expect(reference).toMatch(/^TSK-[A-Z0-9]{8}$/)
    const space = (await w.call('GET', w.at('/work'))).json.data
    expect(space.tasks).toHaveLength(1)
    expect(space.tasks[0]).toMatchObject({ id, status: 'backlog', priority: 'normal', customer_visible: 0, revision: 1, requiresCustomerAction: false, overdue: false })
    expect(space.today).toBe('2026-11-03')
    expect(space.allowed.backlog).toContain('in_progress')
  })

  it('refuses what is wrong, naming the fields, and creates nothing', async () => {
    w = await makeWorkKit()
    const bad = await w.call('POST', w.at('/tasks'), { title: '   ', dueOn: '2026-02-31', priority: 'whenever', startOn: '2026-12-01' })
    expect(bad.status).toBe(422)
    expect(Object.keys(bad.json.error.details.fields ?? bad.json.error.details).sort()).toEqual(['dueOn', 'priority', 'title'])
    const reversed = await w.call('POST', w.at('/tasks'), { title: 'A', startOn: '2026-12-10', dueOn: '2026-12-01' })
    expect(reversed.status).toBe(422)
    const tooLong = await w.call('POST', w.at('/tasks'), { title: 'x'.repeat(161) })
    expect(tooLong.status).toBe(422)
    expect((await w.call('GET', w.at('/work'))).json.data.tasks).toHaveLength(0)
  })

  it('refuses a field that does not exist (mass assignment): no id, creator, revision, completion time or reference can be set', async () => {
    w = await makeWorkKit()
    for (const field of ['id', 'reference', 'revision', 'completed_at', 'created_by', 'projectId', 'sort_order']) {
      const reply = await w.call('POST', w.at('/tasks'), { title: 'A', [field]: 'x' })
      expect(reply.status, field).toBe(422)
    }
    const { id } = await w.task()
    const edit = await w.call('PATCH', w.at(`/tasks/${id}`), { status: 'completed' })
    expect(edit.status, 'a status moves through its own door').toBe(422)
    expect((await w.call('PATCH', w.at(`/tasks/${id}`), { completedAt: '2026-01-01' })).status).toBe(422)
  })

  it('a task starts open: completed or cancelled cannot be the first status', async () => {
    w = await makeWorkKit()
    expect((await w.call('POST', w.at('/tasks'), { title: 'A', status: 'completed' })).status).toBe(409)
    expect((await w.call('POST', w.at('/tasks'), { title: 'A', status: 'in_progress' })).status).toBe(201)
  })

  it('a milestone, a category or an assignee of another project, a disabled category or an unknown user are refused', async () => {
    w = await makeWorkKit()
    const other = await w.kit.project(w.anna.id, { name: 'Other' })
    const foreign = (await w.call('POST', w.at('/milestones', other), { title: 'Elsewhere' })).json.data
    expect((await w.call('POST', w.at('/tasks'), { title: 'A', milestoneId: foreign.id })).status).toBe(422)
    expect((await w.call('POST', w.at('/tasks'), { title: 'A', assignedTo: 'no-such-user' })).status).toBe(422)
    expect((await w.call('POST', w.at('/tasks'), { title: 'A', categoryId: 'no-such-category' })).status).toBe(422)
    await w.call('POST', '/api/admin/task-categories/suggested')
    const design = (await w.call('GET', '/api/admin/task-categories')).json.data.find((entry: { code: string }) => entry.code === 'design')
    expect((await w.call('POST', w.at('/tasks'), { title: 'A', categoryId: design.id })).status).toBe(201)
    await w.call('PATCH', `/api/admin/task-categories/${design.id}`, { enabled: false })
    expect((await w.call('POST', w.at('/tasks'), { title: 'B', categoryId: design.id })).status).toBe(422)
  })

  it('a task belongs to ITS project: another project’s id answers not found for every read and write', async () => {
    w = await makeWorkKit()
    const other = await w.kit.project(w.anna.id, { name: 'Other' })
    const { id } = await w.task()
    for (const [method, path, body] of [
      ['GET', `/tasks/${id}`, undefined],
      ['PATCH', `/tasks/${id}`, { title: 'B' }],
      ['POST', `/tasks/${id}/status`, { status: 'planned' }],
      ['DELETE', `/tasks/${id}`, undefined],
      ['POST', `/tasks/${id}/notes`, { body: 'hello' }],
    ] as const) {
      expect((await w.call(method, w.at(path, other), body)).status, `${method} ${path}`).toBe(404)
    }
  })
})

describe('editing, with the revision', () => {
  it('an edit counts the revision up; an edit made from an out-of-date screen is refused and changes nothing', async () => {
    w = await makeWorkKit()
    const { id } = await w.task()
    const first = await w.call('PATCH', w.at(`/tasks/${id}`), { title: 'New title', revision: 1 })
    expect(first.status, first.text).toBe(200)
    expect(first.json.data.task).toMatchObject({ title: 'New title', revision: 2 })
    const stale = await w.call('PATCH', w.at(`/tasks/${id}`), { title: 'Old screen', revision: 1 })
    expect(stale.status).toBe(409)
    expect(stale.json.error.details.reason).toBe('stale')
    expect((await w.call('GET', w.at(`/tasks/${id}`))).json.data.task.title).toBe('New title')
  })

  it('an edit that changes nothing does not count a revision or write a line of history', async () => {
    w = await makeWorkKit()
    const { id } = await w.task({ title: 'Same' })
    const before = (await w.call('GET', w.at(`/tasks/${id}`))).json.data
    const same = await w.call('PATCH', w.at(`/tasks/${id}`), { title: 'Same' })
    expect(same.json.data.task.revision).toBe(before.task.revision)
    expect(same.json.data.history).toHaveLength(before.history.length)
  })

  it('refuses a start date after the due date, also when only one of them is sent', async () => {
    w = await makeWorkKit()
    const { id } = await w.task({ startOn: '2026-12-01', dueOn: '2026-12-10' })
    expect((await w.call('PATCH', w.at(`/tasks/${id}`), { dueOn: '2026-11-20' })).status).toBe(422)
    expect((await w.call('PATCH', w.at(`/tasks/${id}`), { startOn: '2026-12-20' })).status).toBe(422)
    expect((await w.call('PATCH', w.at(`/tasks/${id}`), { startOn: null, dueOn: null })).status).toBe(200)
  })

  it('assigning a task is a line of the administration’s history, and unassigning clears it', async () => {
    w = await makeWorkKit()
    const { id } = await w.task()
    const me = w.kit.server.db.get<{ id: string }>('SELECT id FROM admin_users WHERE email = ?', ['owner@site.test'])!.id
    const assigned = (await w.call('PATCH', w.at(`/tasks/${id}`), { assignedTo: me })).json.data
    expect(assigned.task.assigneeEmail).toBe('owner@site.test')
    expect(assigned.history.map((entry: { event_type: string }) => entry.event_type)).toContain('task_assigned')
    expect((await w.call('PATCH', w.at(`/tasks/${id}`), { assignedTo: null })).json.data.task.assigneeEmail).toBeNull()
    expect((await w.call('GET', `/api/admin/work/tasks?assignee=none`)).json.data.tasks).toHaveLength(1)
    expect((await w.call('GET', `/api/admin/work/tasks?assignee=me`)).json.data.tasks).toHaveLength(0)
  })
})

describe('the status moves', () => {
  it('follows the table of allowed moves, and every refused move is a 409 that changes nothing', async () => {
    w = await makeWorkKit()
    for (const from of TASK_STATUSES) {
      for (const to of TASK_STATUSES) {
        expect(canMoveTask(from, to), `${from} to ${to}`).toBe(TASK_TRANSITIONS[from].includes(to))
        if (from === to) expect(TASK_TRANSITIONS[from]).not.toContain(to)
      }
    }
    const { id } = await w.task()
    const done = await w.call('POST', w.at(`/tasks/${id}/status`), { status: 'completed' })
    expect(done.status, done.text).toBe(200)
    expect(done.json.data.task.completed_at).not.toBeNull()
    expect((await w.call('POST', w.at(`/tasks/${id}/status`), { status: 'cancelled' })).status, 'completed cannot be cancelled').toBe(409)
    expect((await w.call('POST', w.at(`/tasks/${id}/status`), { status: 'blocked' })).status).toBe(409)
    const reopened = await w.call('POST', w.at(`/tasks/${id}/status`), { status: 'in_progress' })
    expect(reopened.json.data.task).toMatchObject({ status: 'in_progress', completed_at: null })
    expect((await w.call('POST', w.at(`/tasks/${id}/status`), { status: 'finished' })).status).toBe(422)
  })

  it('a cancelled task can be reinstated, and a status change records who, from and to', async () => {
    w = await makeWorkKit()
    const { id } = await w.task()
    await w.call('POST', w.at(`/tasks/${id}/status`), { status: 'cancelled' })
    const back = (await w.call('POST', w.at(`/tasks/${id}/status`), { status: 'planned' })).json.data
    expect(back.task.status).toBe('planned')
    const moves = back.history.filter((entry: { event_type: string }) => entry.event_type !== 'task_created')
    expect(moves.map((entry: { event_type: string; from_status: string; to_status: string }) => [entry.event_type, entry.from_status, entry.to_status])).toEqual([
      ['task_status_changed', 'cancelled', 'planned'],
      ['task_cancelled', 'backlog', 'cancelled'],
    ])
    expect(moves[0].adminEmail).toBe('owner@site.test')
  })

  it('a stale screen cannot move a task: the revision decides', async () => {
    w = await makeWorkKit()
    const { id } = await w.task()
    await w.call('PATCH', w.at(`/tasks/${id}`), { title: 'Changed elsewhere' })
    const stale = await w.call('POST', w.at(`/tasks/${id}/status`), { status: 'planned', revision: 1 })
    expect(stale.status).toBe(409)
    expect(stale.json.error.details.reason).toBe('stale')
  })

  it('a bulk move answers per task: the ones that can move move, the ones that cannot say why, and nothing else is touched', async () => {
    w = await makeWorkKit()
    const a = await w.task({ title: 'A' })
    const b = await w.task({ title: 'B' })
    const c = await w.task({ title: 'C' })
    await w.call('POST', w.at(`/tasks/${c.id}/status`), { status: 'completed' })
    await w.call('POST', w.at(`/tasks/${b.id}/dependencies`), { dependsOnId: a.id })
    const reply = await w.call('POST', w.at('/tasks/bulk-status'), { ids: [a.id, b.id, c.id, 'ghost'], status: 'in_progress' })
    expect(reply.status).toBe(200)
    const byId = Object.fromEntries(reply.json.data.map((entry: { id: string; ok: boolean; reason?: string }) => [entry.id, entry]))
    expect(byId[a.id].ok).toBe(true)
    expect(byId[b.id]).toMatchObject({ ok: false, reason: 'blocked_by_dependency' })
    expect(byId[c.id].ok, 'a completed task can be reopened').toBe(true)
    expect(byId.ghost).toMatchObject({ ok: false, reason: 'not_found' })
    expect((await w.call('POST', w.at('/tasks/bulk-status'), { ids: [], status: 'planned' })).status).toBe(422)
    expect((await w.call('POST', w.at('/tasks/bulk-status'), { ids: Array.from({ length: 101 }, (_, i) => `t${i}`), status: 'planned' })).status).toBe(422)
    expect((await w.call('POST', w.at('/tasks/bulk-status'), { ids: [a.id, a.id], status: 'planned' })).status).toBe(422)
  })

  it('reordering rearranges only the tasks named, among the places they held', async () => {
    w = await makeWorkKit()
    const a = await w.task({ title: 'A' })
    const b = await w.task({ title: 'B' })
    const c = await w.task({ title: 'C' })
    const d = await w.task({ title: 'D' })
    const order = async () => (await w.call('GET', w.at('/work'))).json.data.tasks.map((task: { title: string }) => task.title)
    expect(await order()).toEqual(['A', 'B', 'C', 'D'])
    expect((await w.call('POST', w.at('/tasks/reorder'), { ids: [d.id, b.id] })).status).toBe(200)
    expect(await order()).toEqual(['A', 'D', 'C', 'B'])
    expect((await w.call('POST', w.at('/tasks/reorder'), { ids: [c.id, a.id, c.id] })).status).toBe(422)
    expect((await w.call('POST', w.at('/tasks/reorder'), { ids: ['ghost'] })).status).toBe(404)
    void [a, b, c, d]
  })
})

describe('dependencies', () => {
  it('a task cannot be started, reviewed or completed while what it depends on is open; the answer names what; finishing the predecessor releases it', async () => {
    w = await makeWorkKit()
    const design = await w.task({ title: 'Design' })
    const build = await w.task({ title: 'Build' })
    expect((await w.call('POST', w.at(`/tasks/${build.id}/dependencies`), { dependsOnId: design.id })).status).toBe(201)
    for (const status of ['in_progress', 'in_review', 'completed']) {
      const refused = await w.call('POST', w.at(`/tasks/${build.id}/status`), { status })
      expect(refused.status, status).toBe(409)
      expect(refused.json.error.details).toMatchObject({ reason: 'blocked_by_dependency', blockedBy: [{ title: 'Design', status: 'backlog' }] })
    }
    // Planned, blocked and "waiting for the customer" are not starting the work.
    expect((await w.call('POST', w.at(`/tasks/${build.id}/status`), { status: 'planned' })).status).toBe(200)
    const view = (await w.call('GET', w.at(`/tasks/${build.id}`))).json.data
    expect(view.task.blockedBy.map((entry: { title: string }) => entry.title)).toEqual(['Design'])
    expect(view.predecessors.map((entry: { title: string }) => entry.title)).toEqual(['Design'])
    await w.call('POST', w.at(`/tasks/${design.id}/status`), { status: 'completed' })
    const released = (await w.call('GET', w.at(`/tasks/${build.id}`))).json.data
    expect(released.task.blockedBy).toEqual([])
    // Completing the predecessor did NOT complete or start the dependent: it is only released.
    expect(released.task.status).toBe('planned')
    expect((await w.call('POST', w.at(`/tasks/${build.id}/status`), { status: 'in_progress' })).status).toBe(200)
  })

  it('a cancelled predecessor no longer holds anything up', async () => {
    w = await makeWorkKit()
    const a = await w.task({ title: 'A' })
    const b = await w.task({ title: 'B' })
    await w.call('POST', w.at(`/tasks/${b.id}/dependencies`), { dependsOnId: a.id })
    await w.call('POST', w.at(`/tasks/${a.id}/status`), { status: 'cancelled' })
    expect((await w.call('POST', w.at(`/tasks/${b.id}/status`), { status: 'in_progress' })).status).toBe(200)
  })

  it('refuses a task on itself, a duplicate, a task of another project, an unknown task, and every loop (naming it)', async () => {
    w = await makeWorkKit()
    const a = await w.task({ title: 'A' })
    const b = await w.task({ title: 'B' })
    const c = await w.task({ title: 'C' })
    const dep = (task: string, on: string) => w.call('POST', w.at(`/tasks/${task}/dependencies`), { dependsOnId: on })
    const self = await dep(a.id, a.id)
    expect(self.status).toBe(409)
    expect(self.json.error.details.reason).toBe('self_dependency')
    expect((await dep(b.id, a.id)).status).toBe(201)
    expect((await dep(b.id, a.id)).json.error.details.reason).toBe('dependency_exists')
    expect((await dep(c.id, b.id)).status).toBe(201)
    const direct = await dep(a.id, b.id)
    expect(direct.status).toBe(409)
    expect(direct.json.error.details.reason).toBe('dependency_cycle')
    const long = await dep(a.id, c.id)
    expect(long.status).toBe(409)
    expect(long.json.error.details.path).toEqual(['A', 'C', 'B', 'A'])
    const other = await w.kit.project(w.anna.id, { name: 'Other' })
    const foreign = await w.task({ title: 'Foreign' }, other)
    expect((await dep(a.id, foreign.id)).status).toBe(404)
    expect((await dep(a.id, 'ghost')).status).toBe(404)
    // Nothing was written by the refusals.
    expect(w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_task_dependencies')!.n).toBe(2)
  })

  it('a dependency can be removed, and removing a task removes its dependencies', async () => {
    w = await makeWorkKit()
    const a = await w.task({ title: 'A' })
    const b = await w.task({ title: 'B' })
    await w.call('POST', w.at(`/tasks/${b.id}/dependencies`), { dependsOnId: a.id })
    expect((await w.call('DELETE', w.at(`/tasks/${b.id}/dependencies/${a.id}`))).status).toBe(200)
    expect((await w.call('DELETE', w.at(`/tasks/${b.id}/dependencies/${a.id}`))).status).toBe(404)
    await w.call('POST', w.at(`/tasks/${b.id}/dependencies`), { dependsOnId: a.id })
    expect((await w.call('DELETE', w.at(`/tasks/${a.id}`))).status).toBe(204)
    expect((await w.call('GET', w.at(`/tasks/${b.id}`))).json.data.task.dependsOn).toEqual([])
    expect(w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_task_dependencies')!.n).toBe(0)
  })

  it('the database refuses what the application would: a loop, a task on itself and a pair across projects', async () => {
    w = await makeWorkKit()
    const a = await w.task({ title: 'A' })
    const b = await w.task({ title: 'B' })
    const other = await w.kit.project(w.anna.id, { name: 'Other' })
    const foreign = await w.task({ title: 'F' }, other)
    const { db } = w.kit.server
    const insert = (task: string, on: string) => db.run('INSERT INTO project_task_dependencies (task_id, depends_on_id, created_at) VALUES (?, ?, ?)', [task, on, '2026-11-03T10:00:00.000Z'])
    insert(b.id, a.id)
    expect(() => insert(a.id, b.id)).toThrow()
    expect(() => insert(a.id, a.id)).toThrow()
    expect(() => insert(a.id, foreign.id)).toThrow()
  })
})

describe('deleting', () => {
  it('removes a task nobody has worked on, keeps a line saying so, and refuses a completed one', async () => {
    w = await makeWorkKit()
    const a = await w.task({ title: 'Gone' })
    const b = await w.task({ title: 'Kept' })
    expect((await w.call('DELETE', w.at(`/tasks/${a.id}`))).status).toBe(204)
    expect((await w.call('GET', w.at(`/tasks/${a.id}`))).status).toBe(404)
    await w.call('POST', w.at(`/tasks/${b.id}/status`), { status: 'completed' })
    const refused = await w.call('DELETE', w.at(`/tasks/${b.id}`))
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.reason).toBe('task_completed')
    const lines = w.kit.server.db.all<{ note: string }>("SELECT note FROM client_project_events WHERE event_type = 'task_edited' AND subject = 'Gone'")
    expect(lines.map((line) => line.note)).toContain('deleted')
  })
})

describe('who may do what', () => {
  it('needs a session and a CSRF token; an editor works on tasks but not on categories or the notification choices', async () => {
    w = await makeWorkKit()
    const { id } = await w.task()
    expect((await w.call('GET', w.at('/work'), undefined, 'none')).status).toBe(401)
    expect((await w.call('POST', w.at('/tasks'), { title: 'A' }, 'none')).status).toBe(401)
    const noToken = await w.kit.api(w.at('/tasks'), { method: 'POST', body: { title: 'A' }, headers: { Cookie: w.kit.admin.Cookie } })
    expect(noToken.status).toBe(403)
    // An editor reads and works.
    expect((await w.call('GET', w.at('/work'), undefined, 'editor')).status).toBe(200)
    expect((await w.call('POST', w.at(`/tasks/${id}/status`), { status: 'planned' }, 'editor')).status).toBe(200)
    expect((await w.call('GET', '/api/admin/task-categories', undefined, 'editor')).status).toBe(200)
    // The categories and the choices about what is e-mailed are the administrator's.
    expect((await w.call('POST', '/api/admin/task-categories', { code: 'x-ray', names: { hu: 'a', en: 'b', nl: 'c' } }, 'editor')).status).toBe(403)
    expect((await w.call('POST', '/api/admin/task-categories/suggested', undefined, 'editor')).status).toBe(403)
    expect((await w.call('PUT', '/api/admin/work-settings', { actionOverdue: true }, 'editor')).status).toBe(403)
    expect((await w.call('GET', '/api/admin/work-settings', undefined, 'editor')).status).toBe(200)
  })

  it('a customer’s session is not an administrator’s: the administration answers 401 to it', async () => {
    w = await makeWorkKit()
    const { id } = await w.task()
    const asCustomer = await w.kit.api(w.at(`/tasks/${id}`), { headers: { Cookie: w.anna.cookie } })
    expect(asCustomer.status).toBe(401)
    const write = await w.kit.api(w.at('/tasks'), { method: 'POST', body: { title: 'A' }, headers: w.anna.headers })
    expect(write.status).toBe(401)
  })
})

describe('filters, sorting and search', () => {
  it('filters by status, priority, visibility, overdue, assignee and text, safely', async () => {
    w = await makeWorkKit()
    const a = await w.task({ title: 'Logo draft', priority: 'urgent', dueOn: '2026-11-01' })
    const b = await w.task({ title: 'Footer text', priority: 'low', customerVisible: true })
    await w.task({ title: '100% done_ok' })
    await w.call('POST', w.at(`/tasks/${b.id}/status`), { status: 'in_progress' })
    const list = async (query: string) => (await w.call('GET', w.at(`/work?${query}`))).json.data.tasks.map((task: { title: string }) => task.title)
    expect(await list('status=in_progress')).toEqual(['Footer text'])
    expect(await list('status=backlog,in_progress')).toHaveLength(3)
    expect(await list('priority=urgent')).toEqual(['Logo draft'])
    expect(await list('visible=yes')).toEqual(['Footer text'])
    expect(await list('visible=no')).toHaveLength(2)
    expect(await list('overdue=1')).toEqual(['Logo draft'])
    expect(await list('q=footer')).toEqual(['Footer text'])
    expect(await list('q=100%25')).toEqual(['100% done_ok'])
    expect(await list('q=%25')).toEqual(['100% done_ok'])
    expect(await list('q=_')).toEqual(['100% done_ok'])
    expect(await list(`q=${encodeURIComponent("' OR 1=1 --")}`)).toEqual([])
    expect(await list('sort=priority')).toEqual(['Logo draft', '100% done_ok', 'Footer text'])
    expect(await list('sort=title')).toEqual(['100% done_ok', 'Footer text', 'Logo draft'])
    expect(await list('status=nonsense')).toHaveLength(3)
    void a
  })
})
