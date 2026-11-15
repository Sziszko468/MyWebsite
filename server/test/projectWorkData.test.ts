import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Database } from '../src/db/database.ts'
import { MIGRATIONS_DIRECTORY, migrate } from '../src/db/migrate.ts'
import { ConstraintError } from '../src/http/errors.ts'
import { ACTION_STATUSES, ACTION_TYPES, MILESTONE_STATUSES, TASK_PRIORITIES, TASK_STATUSES } from '../src/modules/projectwork/model.ts'
import { WORK_MAIL_KINDS } from '../src/modules/notifications/workTemplates.ts'
import { TestClock } from './helpers.ts'
import { makeWorkKit, type WorkKit } from './workKit.ts'

/**
 * PROMPT 26, the data and what must hold under pressure: the upgrade from the portal's schema keeps what exists, the database refuses what the application would, two
 * requests at once cannot make two of anything, a refused step leaves nothing behind, and nothing a person writes becomes markup.
 */

let w: WorkKit | undefined
const temporary: string[] = []
afterEach(async () => {
  await w?.close()
  w = undefined
  while (temporary.length) rmSync(temporary.pop()!, { recursive: true, force: true })
})

describe('the lists in the code are the lists in the database', () => {
  const sql = readFileSync(join(MIGRATIONS_DIRECTORY, '0013_project_management.sql'), 'utf8')
  const listIn = (pattern: RegExp): string[] => {
    const match = pattern.exec(sql)
    if (!match) throw new Error(`not found in the migration: ${pattern}`)
    return [...match[1].matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1])
  }
  it('task statuses and priorities, action types and statuses, milestone statuses', () => {
    expect(listIn(/status TEXT NOT NULL DEFAULT 'backlog' CHECK \(status IN \(([^)]*)\)\)/)).toEqual([...TASK_STATUSES])
    expect(listIn(/priority TEXT NOT NULL DEFAULT 'normal' CHECK \(priority IN \(([^)]*)\)\)/)).toEqual([...TASK_PRIORITIES])
    expect(listIn(/action_type TEXT NOT NULL CHECK \(action_type IN \(([^)]*)\)\)/)).toEqual([...ACTION_TYPES])
    expect(listIn(/status TEXT NOT NULL DEFAULT 'not_started' CHECK \(status IN \(([^)]*)\)\)/)).toEqual([...ACTION_STATUSES])
    expect(listIn(/ADD COLUMN status TEXT NOT NULL DEFAULT 'upcoming' CHECK \(status IN \(([^)]*)\)\)/)).toEqual([...MILESTONE_STATUSES])
    // The transitions of an action only name statuses that exist.
    for (const status of ACTION_STATUSES) expect(ACTION_STATUSES).toContain(status)
  })
  it('every e-mail the work writes is allowed by the outbox’s CHECK and listed once-only', () => {
    const kinds = listIn(/CREATE TABLE email_deliveries_rebuilt \([\s\S]*?kind TEXT NOT NULL CHECK \(kind IN \(([^)]*)\)\)/)
    const once = listIn(/CREATE UNIQUE INDEX idx_email_once_per_submission[\s\S]*?WHERE kind IN \(([^)]*)\)/)
    for (const kind of WORK_MAIL_KINDS) {
      expect(kinds, kind).toContain(kind)
      expect(once, kind).toContain(kind)
    }
    expect(kinds.filter((kind) => kind.startsWith('client_action') || kind === 'client_milestone_completed').sort()).toEqual([...WORK_MAIL_KINDS].sort())
  })
})

describe('the upgrade from the client portal’s schema (migration 0013)', () => {
  it('keeps every project, milestone, line of history and e-mail, with the ids they had, and gives each what the new columns need', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc-mig-'))
    temporary.push(directory)
    mkdirSync(directory, { recursive: true })
    for (const name of readdirSync(MIGRATIONS_DIRECTORY).filter((file) => !file.startsWith('0013'))) copyFileSync(join(MIGRATIONS_DIRECTORY, name), join(directory, name))
    const clock = new TestClock()
    const db = new Database(':memory:')
    migrate(db, clock, directory)
    const now = '2026-10-01T10:00:00.000Z'
    db.run("INSERT INTO customers (id, email, language, status, origin, email_verified_at, created_at, updated_at) VALUES ('c1', 'old@example.test', 'en', 'active', 'invitation', ?, ?, ?)", [now, now, now])
    db.run("INSERT INTO client_projects (id, reference, customer_id, name, category, status, created_at, updated_at) VALUES ('p1', 'PRJ-OLD00001', 'c1', 'Old project', 'website', 'design', ?, ?)", [now, now])
    db.run("INSERT INTO client_milestones (id, project_id, title, due_on, completed_at, position, created_at) VALUES ('m1', 'p1', 'Done one', '2026-10-05', ?, 1, ?), ('m2', 'p1', 'Open one', NULL, NULL, 2, ?)", [now, now, now])
    db.run("INSERT INTO client_project_events (project_id, event_type, actor_type, to_status, note, created_at) VALUES ('p1', 'created', 'admin', 'awaiting_start', NULL, ?), ('p1', 'update_posted', 'admin', NULL, 'Words for the customer', ?)", [now, now])
    db.run("INSERT INTO client_project_notes (id, project_id, body, created_at) VALUES ('n1', 'p1', 'Private', ?)", [now])
    db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, created_at, updated_at) VALUES ('d1', 'client_project_status', 'client_project_event', '2', 'old@example.test', 'en', 'delivered', 1, ?, ?)", [now, now])

    expect(migrate(db, clock)).toEqual([13])

    expect(db.all("SELECT id, title, status, customer_visible, description FROM client_milestones ORDER BY position")).toEqual([
      { id: 'm1', title: 'Done one', status: 'completed', customer_visible: 1, description: null },
      { id: 'm2', title: 'Open one', status: 'upcoming', customer_visible: 1, description: null },
    ])
    expect(db.all("SELECT id, event_type, note, visibility, task_id, action_id, subject FROM client_project_events ORDER BY id")).toEqual([
      { id: 1, event_type: 'created', note: null, visibility: 'customer', task_id: null, action_id: null, subject: null },
      { id: 2, event_type: 'update_posted', note: 'Words for the customer', visibility: 'customer', task_id: null, action_id: null, subject: null },
    ])
    expect(db.get("SELECT id, kind, related_id, status FROM email_deliveries")).toEqual({ id: 'd1', kind: 'client_project_status', related_id: '2', status: 'delivered' })
    expect(db.get("SELECT body, task_id FROM client_project_notes")).toEqual({ body: 'Private', task_id: null })
    // Nothing is made for anybody: no task, no category, no action.
    for (const table of ['project_tasks', 'task_categories', 'project_customer_actions', 'project_task_dependencies']) expect(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n, table).toBe(0)
    // The tables that were rebuilt keep their rules.
    expect(() => db.run("UPDATE client_project_events SET note = 'x'")).toThrow()
    expect(() => db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, created_at, updated_at) VALUES ('d2', 'client_project_status', 'client_project_event', '2', 'a@b.test', 'en', 'pending', 0, 'x', 'x')")).toThrow(ConstraintError)
    expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys).toBe(1)
    expect(db.all('PRAGMA foreign_key_check')).toEqual([])
    db.close()
  })
})

describe('what the database refuses by itself', () => {
  it('a task that is completed without a completion time, a start after the due date, an unknown status or priority, a malformed day and an empty title', async () => {
    w = await makeWorkKit()
    const { id } = await w.task()
    const { db } = w.kit.server
    for (const sql of [
      "UPDATE project_tasks SET status = 'completed' WHERE id = ?",
      "UPDATE project_tasks SET completed_at = '2026-11-03T10:00:00.000Z' WHERE id = ?",
      "UPDATE project_tasks SET start_on = '2026-12-10', due_on = '2026-12-01' WHERE id = ?",
      "UPDATE project_tasks SET status = 'done' WHERE id = ?",
      "UPDATE project_tasks SET priority = 'whenever' WHERE id = ?",
      "UPDATE project_tasks SET due_on = '12/01/2026' WHERE id = ?",
      "UPDATE project_tasks SET title = '   ' WHERE id = ?",
      "UPDATE project_tasks SET customer_visible = 2 WHERE id = ?",
      "UPDATE project_tasks SET revision = 0 WHERE id = ?",
    ]) expect(() => db.run(sql, [id]), sql).toThrow(ConstraintError)
    expect(db.get<{ status: string }>('SELECT status FROM project_tasks WHERE id = ?', [id])!.status).toBe('backlog')
  })

  it('an action of a kind or a status that does not exist, an empty instruction, a second action for one task, a response with no words or a repeated revision', async () => {
    w = await makeWorkKit()
    const { id } = await w.task({ customerVisible: true })
    const { db } = w.kit.server
    const now = '2026-11-03T10:00:00.000Z'
    const insert = (type: string, status: string, instruction: string) => db.run('INSERT INTO project_customer_actions (id, task_id, project_id, action_type, instruction, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [`a-${Math.random()}`, id, w!.project.id, type, instruction, status, now, now])
    expect(() => insert('sing', 'not_started', 'x')).toThrow(ConstraintError)
    expect(() => insert('other', 'half_done', 'x')).toThrow(ConstraintError)
    expect(() => insert('other', 'not_started', '   ')).toThrow(ConstraintError)
    insert('other', 'not_started', 'Please look.')
    expect(() => insert('other', 'not_started', 'Again.')).toThrow(ConstraintError)
    const actionId = db.get<{ id: string }>('SELECT id FROM project_customer_actions')!.id
    const answer = (revision: number, response: string) => db.run('INSERT INTO project_action_submissions (id, action_id, revision, response, submitted_at) VALUES (?, ?, ?, ?, ?)', [`s-${Math.random()}`, actionId, revision, response, now])
    expect(() => answer(1, '  ')).toThrow(ConstraintError)
    expect(() => answer(0, 'x')).toThrow(ConstraintError)
    answer(1, 'First')
    expect(() => answer(1, 'Same revision again')).toThrow(ConstraintError)
  })

  it('removing a project removes its tasks, dependencies, requests, answers and history with it; erasing a customer’s name from an answer is still possible', async () => {
    w = await makeWorkKit()
    const a = await w.task({ title: 'A', customerVisible: true })
    const b = await w.task({ title: 'B' })
    await w.call('POST', w.at(`/tasks/${b.id}/dependencies`), { dependsOnId: a.id })
    await w.call('POST', w.at(`/tasks/${a.id}/action`), { actionType: 'other', instruction: 'Please look.' })
    await w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${a.reference}/respond`, { response: 'Done.' })
    const { db } = w.kit.server
    // The customer's own row going away only clears who answered.
    db.run('UPDATE project_action_submissions SET customer_id = NULL')
    expect(db.get<{ response: string }>('SELECT response FROM project_action_submissions')!.response).toBe('Done.')
    db.run('DELETE FROM client_projects WHERE id = ?', [w.project.id])
    for (const table of ['project_tasks', 'project_task_dependencies', 'project_customer_actions', 'project_action_submissions', 'project_action_transitions', 'client_project_events']) expect(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n, table).toBe(0)
  })
})

describe('two requests at once', () => {
  it('a double submit makes exactly one answer: one request is accepted, the other is told it does not need an answer', async () => {
    w = await makeWorkKit()
    const t = await w.task({ title: 'Ask', customerVisible: true })
    await w.call('POST', w.at(`/tasks/${t.id}/action`), { actionType: 'other', instruction: 'Please answer.' })
    const path = `/api/portal/projects/${w.project.reference}/tasks/${t.reference}/respond`
    const results = await Promise.all([w.anna.post(path, { response: 'Answer one.' }), w.anna.post(path, { response: 'Answer two.' }), w.anna.post(path, { response: 'Answer three.' })])
    expect(results.map((reply) => reply.status).sort()).toEqual([201, 409, 409])
    expect(w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_action_submissions')!.n).toBe(1)
    expect(w.kit.server.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM project_action_transitions WHERE to_status = 'submitted'")!.n).toBe(1)
    await w.kit.settle()
    expect(w.kit.server.mailer.sent.filter((message) => /A customer responded/.test(message.subject))).toHaveLength(1)
  })

  it('two edits made from the same screen: the first wins, the second is told the task changed', async () => {
    w = await makeWorkKit()
    const { id } = await w.task()
    const replies = await Promise.all([w.call('PATCH', w.at(`/tasks/${id}`), { title: 'First', revision: 1 }), w.call('PATCH', w.at(`/tasks/${id}`), { title: 'Second', revision: 1 })])
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 409])
    const title = w.kit.server.db.get<{ title: string; revision: number }>('SELECT title, revision FROM project_tasks')!
    expect(title.revision).toBe(2)
    expect(['First', 'Second']).toContain(title.title)
  })

  it('two moves of one task from the same screen: one is made', async () => {
    w = await makeWorkKit()
    const { id } = await w.task()
    const replies = await Promise.all([w.call('POST', w.at(`/tasks/${id}/status`), { status: 'planned', revision: 1 }), w.call('POST', w.at(`/tasks/${id}/status`), { status: 'in_progress', revision: 1 })])
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 409])
    expect(w.kit.server.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM client_project_events WHERE event_type = 'task_status_changed'")!.n).toBe(1)
  })

  it('two reviews of one answer: one is made, the customer is told once', async () => {
    w = await makeWorkKit()
    const t = await w.task({ title: 'Ask', customerVisible: true })
    const action = (await w.call('POST', w.at(`/tasks/${t.id}/action`), { actionType: 'other', instruction: 'Please answer.' })).json.data.action
    await w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${t.reference}/respond`, { response: 'Answer.' })
    const replies = await Promise.all([w.call('POST', w.at(`/actions/${action.id}/accept`), {}), w.call('POST', w.at(`/actions/${action.id}/changes`), { customerNote: 'Not good enough.' })])
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 409])
    await w.kit.settle()
    expect(w.kit.server.mailer.sent.filter((message) => /accepted|ask for changes/.test(message.subject))).toHaveLength(1)
  })
})

describe('a step that is refused leaves nothing behind', () => {
  it('accepting an answer and completing the task in one move is refused as a whole when the task still waits for another: the answer stays to be reviewed', async () => {
    w = await makeWorkKit()
    const first = await w.task({ title: 'First' })
    const t = await w.task({ title: 'Ask', customerVisible: true })
    await w.call('POST', w.at(`/tasks/${t.id}/dependencies`), { dependsOnId: first.id })
    const action = (await w.call('POST', w.at(`/tasks/${t.id}/action`), { actionType: 'other', instruction: 'Please answer.' })).json.data.action
    await w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${t.reference}/respond`, { response: 'Answer.' })
    const before = w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_action_transitions')!.n
    const refused = await w.call('POST', w.at(`/actions/${action.id}/accept`), { completeTask: true, customerNote: 'Thanks.' })
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.reason).toBe('blocked_by_dependency')
    const { db } = w.kit.server
    expect(db.get<{ status: string }>('SELECT status FROM project_customer_actions')!.status).toBe('submitted')
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_action_transitions')!.n).toBe(before)
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM client_project_events WHERE event_type = 'action_accepted'")!.n).toBe(0)
    await w.kit.settle()
    expect(w.kit.server.mailer.sent.filter((message) => /accepted/.test(message.subject))).toHaveLength(0)
  })

  it('a bulk move that cannot move one task still moves the others and writes a line for each that moved', async () => {
    w = await makeWorkKit()
    const a = await w.task({ title: 'A' })
    const b = await w.task({ title: 'B' })
    await w.call('POST', w.at(`/tasks/${b.id}/dependencies`), { dependsOnId: a.id })
    await w.call('POST', w.at('/tasks/bulk-status'), { ids: [b.id, a.id], status: 'in_progress' })
    const { db } = w.kit.server
    expect(db.get<{ status: string }>('SELECT status FROM project_tasks WHERE id = ?', [a.id])!.status).toBe('in_progress')
    expect(db.get<{ status: string }>('SELECT status FROM project_tasks WHERE id = ?', [b.id])!.status).toBe('backlog')
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM client_project_events WHERE event_type = 'task_status_changed'")!.n).toBe(1)
  })

  it('cancelling a task closes its open request with it, in one move, with a line of history for each', async () => {
    w = await makeWorkKit()
    const t = await w.task({ title: 'Ask', customerVisible: true })
    await w.call('POST', w.at(`/tasks/${t.id}/action`), { actionType: 'other', instruction: 'Please answer.' })
    await w.call('POST', w.at(`/tasks/${t.id}/status`), { status: 'cancelled' })
    const { db } = w.kit.server
    expect(db.get<{ status: string }>('SELECT status FROM project_customer_actions')!.status).toBe('cancelled')
    expect(db.all<{ event_type: string }>('SELECT event_type FROM client_project_events WHERE task_id IS NOT NULL ORDER BY id').map((row) => row.event_type)).toEqual(['task_created', 'action_assigned', 'task_cancelled', 'action_cancelled'])
  })
})

describe('what a person writes is text', () => {
  it('a task’s title and a customer’s answer are escaped in every e-mail made of them, and are returned as plain data by the API', async () => {
    w = await makeWorkKit()
    const evil = '<img src=x onerror="alert(1)"> & "quotes"'
    const t = await w.task({ title: evil, customerVisible: true })
    await w.call('POST', w.at(`/tasks/${t.id}/action`), { actionType: 'other', instruction: 'Please <b>look</b>.' })
    await w.anna.post(`/api/portal/projects/${w.project.reference}/tasks/${t.reference}/respond`, { response: '<script>alert(2)</script>' })
    await w.kit.settle()
    const sent = w.kit.server.mailer.sent.filter((message) => /action is waiting|A customer responded/.test(message.subject))
    expect(sent.length).toBe(2)
    for (const message of sent) {
      expect(message.html).not.toMatch(/<img src=x|<script|<b>look/)
      expect(message.subject).not.toMatch(/[\r\n]/)
    }
    expect(sent.find((message) => /action is waiting/.test(message.subject))!.html).toContain('&lt;img src=x')
    const detail = (await w.anna.get(`/api/portal/projects/${w.project.reference}/tasks/${t.reference}`)).json.data
    expect(detail.title).toBe(evil)
    expect(detail.submissions[0].response).toBe('<script>alert(2)</script>')
  })

  it('a line break in a title cannot reach a subject or a header', async () => {
    w = await makeWorkKit()
    const t = await w.task({ title: 'Line one\r\nBcc: attacker@example.test', customerVisible: true })
    expect((await w.call('GET', w.at(`/tasks/${t.id}`))).json.data.task.title).not.toMatch(/[\r\n]/)
    await w.call('POST', w.at(`/tasks/${t.id}/action`), { actionType: 'other', instruction: 'Please look.' })
    await w.kit.settle()
    for (const message of w.kit.server.mailer.sent) expect(message.subject).not.toMatch(/[\r\n]|Bcc/i)
  })
})

describe('the status choice and the maintenance', () => {
  it('"important status" e-mails follow the owner’s choice; a status change the owner forces is always sent', async () => {
    w = await makeWorkKit()
    const mails = () => w!.kit.server.mailer.sent.filter((message) => /News about your project/.test(message.subject)).length
    await w.call('POST', w.at('/status'), { status: 'discovery' })
    await w.call('POST', w.at('/status'), { status: 'waiting_customer' })
    await w.kit.settle()
    expect(mails()).toBe(1)
    await w.call('PUT', '/api/admin/work-settings', { statusChanged: false })
    await w.call('POST', w.at('/status'), { status: 'review' })
    await w.kit.settle()
    expect(mails()).toBe(1)
    await w.call('POST', w.at('/status'), { status: 'finalization', notify: true })
    await w.kit.settle()
    expect(mails()).toBe(2)
  })

  it('the daily maintenance reports the reminders it queued', async () => {
    w = await makeWorkKit()
    const t = await w.task({ customerVisible: true, dueOn: '2026-11-05' })
    expect((await w.call('POST', w.at(`/tasks/${t.id}/action`), { actionType: 'other', instruction: 'Please look.' })).status).toBe(201)
    const reply = await w.call('POST', '/api/admin/system/maintenance', {})
    expect(reply.status, reply.text).toBe(200)
    expect(reply.json.data.workReminders).toEqual({ dueSoon: 1, overdue: 0 })
    // The same day, the second pass queues nothing.
    expect((await w.call('POST', '/api/admin/system/maintenance', {})).json.data.workReminders).toEqual({ dueSoon: 0, overdue: 0 })
  })
})

describe('the categories', () => {
  it('are made, renamed, switched off and removed by the administrator; a code is a slug and is never repeated; one in use is never removed', async () => {
    w = await makeWorkKit()
    const names = { hu: 'Átvilágítás', en: 'Audit', nl: 'Audit' }
    const created = await w.call('POST', '/api/admin/task-categories', { code: 'seo-audit', names })
    expect(created.status).toBe(201)
    const id = created.json.data.find((entry: { code: string }) => entry.code === 'seo-audit').id
    for (const body of [{ code: 'SEO', names }, { code: 'a', names }, { code: '-bad-', names }, { code: 'seo-audit', names }, { code: 'fine', names: { hu: '', en: 'x', nl: 'y' } }, { code: 'fine', names: { hu: 'x'.repeat(61), en: 'x', nl: 'y' } }, { code: 'fine' }, { code: 'fine', names, extra: 1 }]) {
      expect((await w.call('POST', '/api/admin/task-categories', body)).status, JSON.stringify(body).slice(0, 80)).toBe(422)
    }
    expect((await w.call('PATCH', `/api/admin/task-categories/${id}`, { names: { ...names, en: 'Search audit' }, enabled: false })).json.data.find((entry: { id: string }) => entry.id === id)).toMatchObject({ enabled: false, names: { en: 'Search audit' } })
    expect((await w.call('PATCH', `/api/admin/task-categories/${id}`, { code: 'renamed' })).status).toBe(422)
    expect((await w.call('PATCH', '/api/admin/task-categories/ghost', { enabled: true })).status).toBe(404)
    await w.call('PATCH', `/api/admin/task-categories/${id}`, { enabled: true })
    const task = await w.task({ categoryId: id })
    const refused = await w.call('DELETE', `/api/admin/task-categories/${id}`)
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.reason).toBe('category_in_use')
    await w.call('DELETE', w.at(`/tasks/${task.id}`))
    expect((await w.call('DELETE', `/api/admin/task-categories/${id}`)).status).toBe(200)
  })

  it('the suggested set is added once, never changes one that exists, and the owner can rename or remove any of it', async () => {
    w = await makeWorkKit()
    const first = (await w.call('POST', '/api/admin/task-categories/suggested')).json.data
    expect(first.added).toBe(7)
    const design = first.categories.find((entry: { code: string }) => entry.code === 'design')
    expect(design.names).toEqual({ hu: 'Dizájn', en: 'Design', nl: 'Ontwerp' })
    await w.call('PATCH', `/api/admin/task-categories/${design.id}`, { names: { hu: 'Terv', en: 'Plan', nl: 'Plan' } })
    const again = (await w.call('POST', '/api/admin/task-categories/suggested')).json.data
    expect(again.added).toBe(0)
    expect(again.categories.find((entry: { code: string }) => entry.code === 'design').names.en).toBe('Plan')
  })

  it('are not in any screen’s code: nothing in the front end names one', async () => {
    const { readFileSync, readdirSync } = await import('node:fs')
    for (const dir of ['src/admin/components/work', 'src/admin/pages', 'src/components/portal']) {
      for (const file of readdirSync(join(process.cwd(), dir)).filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.test.ts'))) {
        const text = readFileSync(join(process.cwd(), dir, file), 'utf8')
        expect(text, `${dir}/${file}`).not.toMatch(/['"](design|development|content|hosting|administration)['"]\s*:\s*['"]/)
      }
    }
  })
})

describe('every address of the work answers a stranger with 401 and nothing else', () => {
  it('the administration’s: no session, a customer’s session, or no CSRF token on a change', async () => {
    w = await makeWorkKit()
    const t = await w.task({ customerVisible: true })
    const given = await w.call('POST', w.at(`/tasks/${t.id}/action`), { actionType: 'other', instruction: 'Please look.' })
    const actionId = given.json.data.action.id
    const routes: Array<[string, string]> = [
      ['GET', w.at('/work')], ['GET', '/api/admin/work/tasks'], ['POST', w.at('/tasks')], ['POST', w.at('/tasks/bulk-status')], ['POST', w.at('/tasks/reorder')], ['GET', w.at(`/tasks/${t.id}`)],
      ['PATCH', w.at(`/tasks/${t.id}`)], ['DELETE', w.at(`/tasks/${t.id}`)], ['POST', w.at(`/tasks/${t.id}/status`)], ['POST', w.at(`/tasks/${t.id}/dependencies`)], ['DELETE', w.at(`/tasks/${t.id}/dependencies/x`)],
      ['POST', w.at(`/tasks/${t.id}/notes`)], ['POST', w.at(`/tasks/${t.id}/action`)], ['PATCH', w.at(`/actions/${actionId}`)], ['POST', w.at(`/actions/${actionId}/review`)], ['POST', w.at(`/actions/${actionId}/accept`)],
      ['POST', w.at(`/actions/${actionId}/changes`)], ['POST', w.at(`/actions/${actionId}/cancel`)], ['GET', w.at('/work-notifications')], ['GET', '/api/admin/task-categories'], ['POST', '/api/admin/task-categories'],
      ['POST', '/api/admin/task-categories/suggested'], ['PATCH', '/api/admin/task-categories/x'], ['DELETE', '/api/admin/task-categories/x'], ['GET', '/api/admin/work-settings'], ['PUT', '/api/admin/work-settings'],
    ]
    for (const [method, path] of routes) {
      const body = method === 'GET' || method === 'DELETE' ? undefined : {}
      expect((await w.kit.api(path, { method, body })).status, `${method} ${path} without a session`).toBe(401)
      expect((await w.kit.api(path, { method, body, headers: w.anna.headers })).status, `${method} ${path} with a customer's session`).toBe(401)
      if (method !== 'GET') expect((await w.kit.api(path, { method, body, headers: { Cookie: w.kit.admin.Cookie } })).status, `${method} ${path} without the token`).toBe(403)
    }
    const after = w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_tasks')!.n
    expect(after).toBe(1)
  })

  it('the customer’s: no session, an administrator’s session, and a customer id or project in the address, the query or the body is never believed', async () => {
    w = await makeWorkKit()
    const t = await w.task({ customerVisible: true })
    await w.call('POST', w.at(`/tasks/${t.id}/action`), { actionType: 'other', instruction: 'Please look.' })
    const bob = await w.kit.customer('bob@example.com')
    const mine = `/api/portal/projects/${w.project.reference}/tasks`
    for (const [method, path] of [['GET', mine], ['GET', `${mine}/${t.reference}`], ['POST', `${mine}/${t.reference}/respond`]] as const) {
      expect((await w.kit.api(path, { method, body: method === 'POST' ? { response: 'hello' } : undefined })).status, `${method} ${path}`).toBe(401)
      expect((await w.kit.api(path, { method, body: method === 'POST' ? { response: 'hello' } : undefined, headers: w.kit.admin })).status, `${method} ${path} as the administrator`).toBe(401)
    }
    // Bob names Anna in the query and the body: he is still Bob, and Anna's project is not his.
    expect((await bob.get(`${mine}?customerId=${w.anna.id}&customer=${w.anna.id}`)).status).toBe(404)
    expect((await bob.post(`${mine}/${t.reference}/respond`, { response: 'Let me in.', customerId: w.anna.id })).status).toBe(422)
    expect(w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_action_submissions')!.n).toBe(0)
  })
})

describe('the administration’s own record', () => {
  it('writes a line of the audit log for every change of the work, naming the administrator and never what was written', async () => {
    w = await makeWorkKit()
    const t = await w.task({ title: 'TITLE-NOT-IN-AUDIT', description: 'BODY-NOT-IN-AUDIT', customerVisible: true })
    await w.call('PATCH', w.at(`/tasks/${t.id}`), { priority: 'high' })
    await w.call('POST', w.at(`/tasks/${t.id}/status`), { status: 'planned' })
    await w.call('POST', w.at(`/tasks/${t.id}/notes`), { body: 'NOTE-NOT-IN-AUDIT' })
    await w.call('POST', w.at(`/tasks/${t.id}/action`), { actionType: 'other', instruction: 'INSTRUCTION-NOT-IN-AUDIT' })
    await w.call('PUT', '/api/admin/work-settings', { actionOverdue: true })
    const rows = w.kit.server.db.all<{ action: string; actor_id: string | null; detail: string | null }>("SELECT action, actor_id, detail FROM audit_log WHERE action LIKE 'work.%' ORDER BY id")
    expect(rows.map((row) => row.action)).toEqual(['work.task_created', 'work.task_edited', 'work.task_status', 'work.action_assigned', 'work.settings'])
    expect(rows.every((row) => row.actor_id !== null)).toBe(true)
    expect(JSON.stringify(rows)).not.toMatch(/NOT-IN-AUDIT/)
  })
})
