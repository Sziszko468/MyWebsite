import { afterEach, describe, expect, it } from 'vitest'
import { makeWorkKit, type WorkKit } from './workKit.ts'

/**
 * The customer actions (PROMPT 26): what the owner asks, what the customer may answer, what the review does, and what nobody but the owner ever reads. The
 * customer is a real signed-in customer; every call is the real endpoint.
 */

let w: WorkKit
afterEach(async () => {
  await w?.close()
})

const SECRET_NOTE = 'PRIVATE-REVIEW-NOTE-7741'
const SECRET_DESCRIPTION = 'INTERNAL-DESCRIPTION-5520'

/** A shared task with an action, ready to be answered. */
async function asked(options: { instruction?: string; task?: Record<string, unknown> } = {}) {
  const task = await w.task({ title: 'Send us your logo', customerDescription: 'We need it to start.', description: SECRET_DESCRIPTION, customerVisible: true, ...(options.task ?? {}) })
  const given = await w.call('POST', w.at(`/tasks/${task.id}/action`), { actionType: 'provide_content', instruction: options.instruction ?? 'Please write the text of the logo in a few lines.' })
  expect(given.status, given.text).toBe(201)
  return { ...task, actionId: given.json.data.action.id as string }
}

const mine = (path = '') => `/api/portal/projects/${w.project.reference}/tasks${path}`

describe('giving a customer an action', () => {
  it('needs a task the customer can see, that is not finished, in a project that is not closed, and only one per task', async () => {
    w = await makeWorkKit()
    const hidden = await w.task({ title: 'Private' })
    const refused = await w.call('POST', w.at(`/tasks/${hidden.id}/action`), { actionType: 'other', instruction: 'Please look at this.' })
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.reason).toBe('task_hidden')
    const { id } = await asked()
    const twice = await w.call('POST', w.at(`/tasks/${id}/action`), { actionType: 'other', instruction: 'Again please.' })
    expect(twice.json.error.details.reason).toBe('action_exists')
    const done = await w.task({ title: 'Done', customerVisible: true })
    await w.call('POST', w.at(`/tasks/${done.id}/status`), { status: 'completed' })
    expect((await w.call('POST', w.at(`/tasks/${done.id}/action`), { actionType: 'other', instruction: 'Too late.' })).json.error.details.reason).toBe('task_finished')
    await w.call('POST', w.at('/status'), { status: 'cancelled' })
    const open = await w.task({ title: 'After the end', customerVisible: true })
    expect((await w.call('POST', w.at(`/tasks/${open.id}/action`), { actionType: 'other', instruction: 'Too late.' })).json.error.details.reason).toBe('project_closed')
  })

  it('validates the type and the instruction', async () => {
    w = await makeWorkKit()
    const { id } = await w.task({ customerVisible: true })
    expect((await w.call('POST', w.at(`/tasks/${id}/action`), { actionType: 'sing', instruction: 'Please sing.' })).status).toBe(422)
    expect((await w.call('POST', w.at(`/tasks/${id}/action`), { actionType: 'other', instruction: 'x' })).status).toBe(422)
    expect((await w.call('POST', w.at(`/tasks/${id}/action`), { actionType: 'other', instruction: 'y'.repeat(2001) })).status).toBe(422)
    expect((await w.call('POST', w.at(`/tasks/${id}/action`), { actionType: 'other', instruction: 'Please look.', status: 'accepted' })).status, 'a status cannot be set').toBe(422)
    expect(w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_customer_actions')!.n).toBe(0)
  })

  it('a task that asks for something cannot be hidden, or completed, until the action is dealt with; cancelling the task cancels the action', async () => {
    w = await makeWorkKit()
    const t = await asked()
    expect((await w.call('PATCH', w.at(`/tasks/${t.id}`), { customerVisible: false })).json.error.details.reason).toBe('action_open')
    expect((await w.call('POST', w.at(`/tasks/${t.id}/status`), { status: 'completed' })).json.error.details.reason).toBe('action_open')
    expect((await w.call('POST', w.at(`/tasks/${t.id}/status`), { status: 'cancelled' })).status).toBe(200)
    const view = (await w.call('GET', w.at(`/tasks/${t.id}`))).json.data
    expect(view.action.status).toBe('cancelled')
    expect(view.action.transitions.map((entry: { to: string }) => entry.to)).toEqual(['not_started', 'cancelled'])
    expect(view.task.requiresCustomerAction).toBe(false)
    // The customer is not asked for anything any more.
    expect((await w.anna.post(mine(`/${t.reference}/respond`), { response: 'Too late for this one.' })).status).toBe(409)
  })
})

describe('what the customer sees', () => {
  it('only the tasks the owner shared, in the owner’s words for the customer, never the internal description, priority, assignee or notes', async () => {
    w = await makeWorkKit()
    const t = await asked()
    const hidden = await w.task({ title: 'Hidden task', description: 'HIDDEN-TASK-BODY', priority: 'urgent' })
    await w.call('POST', w.at(`/tasks/${t.id}/notes`), { body: SECRET_NOTE })
    const list = await w.anna.get(mine())
    expect(list.status).toBe(200)
    const text = JSON.stringify(list.json)
    expect(list.json.data.tasks.map((task: { title: string }) => task.title)).toEqual(['Send us your logo'])
    for (const secret of [SECRET_NOTE, SECRET_DESCRIPTION, 'HIDDEN-TASK-BODY', 'Hidden task', hidden.reference, 'urgent', 'owner@site.test']) expect(text, secret).not.toContain(secret)
    expect(list.json.data.tasks[0]).toMatchObject({ description: 'We need it to start.', status: 'backlog', action: { awaiting: 'you', canRespond: true, status: 'not_started' } })
    expect(Object.keys(list.json.data.tasks[0]).sort()).toEqual(['action', 'category', 'completedAt', 'description', 'dueOn', 'milestone', 'overdue', 'reference', 'startOn', 'status', 'title', 'waitingFor'])
    // A hidden task is not reachable by its reference.
    expect((await w.anna.get(mine(`/${hidden.reference}`))).status).toBe(404)
  })

  it('a shared task shows only the shared tasks it waits for, and a milestone only if the customer can see it', async () => {
    w = await makeWorkKit()
    const first = await w.task({ title: 'Visible first', customerVisible: true })
    const secret = await w.task({ title: 'Secret first' })
    const last = await w.task({ title: 'Last', customerVisible: true })
    await w.call('POST', w.at(`/tasks/${last.id}/dependencies`), { dependsOnId: first.id })
    await w.call('POST', w.at(`/tasks/${last.id}/dependencies`), { dependsOnId: secret.id })
    const open = (await w.call('POST', w.at('/milestones'), { title: 'Launch', customerVisible: false })).json.data
    await w.call('PATCH', w.at(`/tasks/${last.id}`), { milestoneId: open.id })
    const view = (await w.anna.get(mine(`/${last.reference}`))).json.data
    expect(view.waitingFor).toEqual([{ reference: first.reference, title: 'Visible first' }])
    expect(view.milestone).toBeNull()
    expect(JSON.stringify(view)).not.toContain('Secret first')
    await w.call('PATCH', w.at(`/milestones/${open.id}`), { customerVisible: true })
    expect((await w.anna.get(mine(`/${last.reference}`))).json.data.milestone).toEqual({ title: 'Launch' })
  })

  it('shows the whole life of an action in the customer’s own words, never the owner’s private note', async () => {
    w = await makeWorkKit()
    const t = await asked()
    await w.anna.post(mine(`/${t.reference}/respond`), { response: 'FIRST-ANSWER' })
    await w.call('POST', w.at(`/actions/${t.actionId}/changes`), { customerNote: 'Please add the year.', internalNote: SECRET_NOTE })
    await w.anna.post(mine(`/${t.reference}/respond`), { response: 'SECOND-ANSWER' })
    await w.call('POST', w.at(`/actions/${t.actionId}/accept`), { customerNote: 'Perfect, thank you.', internalNote: SECRET_NOTE })
    const detail = await w.anna.get(mine(`/${t.reference}`))
    expect(detail.status).toBe(200)
    expect(JSON.stringify(detail.json)).not.toContain(SECRET_NOTE)
    expect(detail.json.data.submissions.map((entry: { revision: number; response: string }) => [entry.revision, entry.response])).toEqual([[1, 'FIRST-ANSWER'], [2, 'SECOND-ANSWER']])
    expect(detail.json.data.history.map((entry: { to: string; by: string; note: string | null }) => [entry.to, entry.by, entry.note])).toEqual([
      ['not_started', 'us', null],
      ['submitted', 'you', null],
      ['changes_requested', 'us', 'Please add the year.'],
      ['submitted', 'you', null],
      ['accepted', 'us', 'Perfect, thank you.'],
    ])
    expect(detail.json.data.action).toMatchObject({ status: 'accepted', awaiting: null, canRespond: false })
    // Nothing in the whole portal carries the note, in any answer.
    for (const path of ['/api/portal/overview', `/api/portal/projects/${w.project.reference}`, mine()]) expect(JSON.stringify((await w.anna.get(path)).json), path).not.toContain(SECRET_NOTE)
  })
})

describe('answering', () => {
  it('moves the action to submitted, keeps the answer, and a second click or tab changes nothing', async () => {
    w = await makeWorkKit()
    const t = await asked()
    const first = await w.anna.post(mine(`/${t.reference}/respond`), { response: '  The logo says: Racing Red.  ' })
    expect(first.status, first.text).toBe(201)
    expect(first.json.data.revision).toBe(1)
    expect(first.json.data.task.action).toMatchObject({ status: 'submitted', awaiting: 'us', canRespond: false })
    const again = await w.anna.post(mine(`/${t.reference}/respond`), { response: 'A double click.' })
    expect(again.status).toBe(409)
    expect(again.json.error.details.reason).toBe('not_awaiting_response')
    const rows = w.kit.server.db.all<{ revision: number; response: string }>('SELECT revision, response FROM project_action_submissions')
    expect(rows).toEqual([{ revision: 1, response: 'The logo says: Racing Red.' }])
  })

  it('validates the answer: required, a length, and nothing else in the body', async () => {
    w = await makeWorkKit()
    const t = await asked()
    expect((await w.anna.post(mine(`/${t.reference}/respond`), { response: '' })).status).toBe(422)
    expect((await w.anna.post(mine(`/${t.reference}/respond`), { response: 'x' })).status).toBe(422)
    expect((await w.anna.post(mine(`/${t.reference}/respond`), { response: 'y'.repeat(5001) })).status).toBe(422)
    expect((await w.anna.post(mine(`/${t.reference}/respond`), { response: 'fine answer', status: 'accepted' })).status, 'a customer cannot set a status').toBe(422)
    expect((await w.anna.post(mine(`/${t.reference}/respond`), { response: { nested: true } })).status).toBe(422)
    expect(w.kit.server.db.get<{ status: string }>('SELECT status FROM project_customer_actions')!.status).toBe('not_started')
  })

  it('stores markup as text: nothing an answer says is ever turned into HTML', async () => {
    w = await makeWorkKit()
    const t = await asked()
    await w.anna.post(mine(`/${t.reference}/respond`), { response: '<img src=x onerror=alert(1)> and <b>bold</b>' })
    const detail = (await w.call('GET', w.at(`/tasks/${t.id}`))).json.data
    expect(detail.action.submissions[0].response).toBe('<img src=x onerror=alert(1)> and <b>bold</b>')
  })

  it('a response is never changed: the database refuses an update, and the history is append-only', async () => {
    w = await makeWorkKit()
    const t = await asked()
    await w.anna.post(mine(`/${t.reference}/respond`), { response: 'As given.' })
    const { db } = w.kit.server
    expect(() => db.run("UPDATE project_action_submissions SET response = 'Altered'")).toThrow()
    expect(() => db.run("UPDATE project_action_transitions SET internal_note = 'Altered'")).toThrow()
    expect(() => db.run("UPDATE client_project_events SET note = 'Altered'")).toThrow()
    expect(db.get<{ response: string }>('SELECT response FROM project_action_submissions')!.response).toBe('As given.')
  })

  it('cannot answer a task that is not yours, not shared, finished or in a closed project; every one of them says not found or closed, never why', async () => {
    w = await makeWorkKit()
    const t = await asked()
    const bob = await w.kit.customer('bob@example.com')
    const stranger = await bob.post(mine(`/${t.reference}/respond`), { response: 'I am not the customer.' })
    expect(stranger.status).toBe(404)
    expect((await bob.get(mine(`/${t.reference}`))).status).toBe(404)
    expect((await bob.get(mine())).status).toBe(404)
    const missing = await w.anna.post(mine('/TSK-NOTREAL1/respond'), { response: 'Answer.' })
    expect(missing.status).toBe(404)
    expect(stranger.json.error.message).toBe(missing.json.error.message)
    const plain = await w.task({ title: 'No action here', customerVisible: true })
    expect((await w.anna.post(mine(`/${plain.reference}/respond`), { response: 'Answer.' })).status).toBe(404)
    // Sharing is the owner's: hiding is refused while the action is open, so close it first and then hide.
    await w.call('POST', w.at(`/actions/${t.actionId}/cancel`), {})
    await w.call('PATCH', w.at(`/tasks/${t.id}`), { customerVisible: false })
    expect((await w.anna.post(mine(`/${t.reference}/respond`), { response: 'Answer.' })).status).toBe(404)
    const second = await asked({ task: { title: 'Another' } })
    await w.call('POST', w.at('/status'), { status: 'cancelled' })
    expect((await w.anna.post(mine(`/${second.reference}/respond`), { response: 'Answer.' })).status).toBe(409)
  })

  it('needs a signed-in customer and the CSRF token', async () => {
    w = await makeWorkKit()
    const t = await asked()
    const anonymous = await w.kit.api(mine(`/${t.reference}/respond`), { method: 'POST', body: { response: 'Hello there.' } })
    expect(anonymous.status).toBe(401)
    const noToken = await w.kit.api(mine(`/${t.reference}/respond`), { method: 'POST', body: { response: 'Hello there.' }, headers: { Cookie: w.anna.cookie } })
    expect(noToken.status).toBe(403)
    expect((await w.kit.api(mine(), { headers: {} })).status).toBe(401)
    // An administrator's session is not a customer's.
    expect((await w.kit.api(mine(), { headers: { Cookie: w.kit.admin.Cookie } })).status).toBe(401)
    expect(w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_action_submissions')!.n).toBe(0)
  })

  it('only the customer who owns the project can answer, whatever the references say', async () => {
    w = await makeWorkKit()
    const t = await asked()
    const bob = await w.kit.customer('bob@example.com')
    const bobsProject = await w.kit.project(bob.id, { name: 'Bob site' })
    const bobRef = bobsProject.reference
    // Bob names his OWN project with Anna's task reference, and Anna's project with Anna's task: neither works.
    expect((await bob.post(`/api/portal/projects/${bobRef}/tasks/${t.reference}/respond`, { response: 'Mixed references.' })).status).toBe(404)
    expect((await bob.post(`/api/portal/projects/${w.project.reference}/tasks/${t.reference}/respond`, { response: 'Annas project.' })).status).toBe(404)
    expect(w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM project_action_submissions')!.n).toBe(0)
  })
})

describe('the review', () => {
  it('walks submitted → under review → accepted; the owner may complete the task in the same move, and only when asked to', async () => {
    w = await makeWorkKit()
    const t = await asked()
    await w.call('POST', w.at(`/tasks/${t.id}/status`), { status: 'waiting_customer' })
    await w.anna.post(mine(`/${t.reference}/respond`), { response: 'My answer.' })
    // The customer’s answer puts a task that waited for them back in review: a recorded move by the system.
    const afterAnswer = (await w.call('GET', w.at(`/tasks/${t.id}`))).json.data
    expect(afterAnswer.task.status).toBe('in_review')
    expect(afterAnswer.history[0]).toMatchObject({ event_type: 'task_status_changed', actor_type: 'system', from_status: 'waiting_customer', to_status: 'in_review' })
    expect((await w.call('POST', w.at(`/actions/${t.actionId}/review`), {})).json.data.action.status).toBe('under_review')
    const accepted = (await w.call('POST', w.at(`/actions/${t.actionId}/accept`), { customerNote: 'Thanks!', completeTask: true })).json.data
    expect(accepted.action.status).toBe('accepted')
    expect(accepted.task.status).toBe('completed')
    expect(accepted.action.reviewed_by).not.toBeNull()
    // Accepted is final.
    expect((await w.call('POST', w.at(`/actions/${t.actionId}/changes`), { customerNote: 'Wait, no.' })).status).toBe(409)
    expect((await w.call('POST', w.at(`/actions/${t.actionId}/cancel`), {})).status).toBe(409)
  })

  it('accepting does not complete the task unless the owner says so', async () => {
    w = await makeWorkKit()
    const t = await asked()
    await w.anna.post(mine(`/${t.reference}/respond`), { response: 'My answer.' })
    const accepted = (await w.call('POST', w.at(`/actions/${t.actionId}/accept`), {})).json.data
    expect(accepted.task.status).toBe('backlog')
    expect(accepted.task.requiresCustomerAction).toBe(false)
  })

  it('a request for changes MUST carry words for the customer, which the customer then sees; the customer answers again as the next revision', async () => {
    w = await makeWorkKit()
    const t = await asked()
    await w.anna.post(mine(`/${t.reference}/respond`), { response: 'A first try.' })
    for (const body of [{}, { customerNote: '' }, { customerNote: 'x' }, { customerNote: '   ' }, { internalNote: SECRET_NOTE }]) {
      expect((await w.call('POST', w.at(`/actions/${t.actionId}/changes`), body)).status, JSON.stringify(body)).toBe(422)
    }
    expect(w.kit.server.db.get<{ status: string }>('SELECT status FROM project_customer_actions')!.status).toBe('submitted')
    await w.call('POST', w.at(`/actions/${t.actionId}/changes`), { customerNote: 'Please make it shorter.', internalNote: SECRET_NOTE })
    const seen = (await w.anna.get(mine(`/${t.reference}`))).json.data
    expect(seen.action).toMatchObject({ status: 'changes_requested', awaiting: 'you', canRespond: true, changesRequested: 'Please make it shorter.', revision: 1 })
    const second = await w.anna.post(mine(`/${t.reference}/respond`), { response: 'Shorter now.' })
    expect(second.json.data.revision).toBe(2)
    expect(w.kit.server.db.all('SELECT revision FROM project_action_submissions ORDER BY revision').map((row) => (row as { revision: number }).revision)).toEqual([1, 2])
  })

  it('every move writes one transition (who, from, to, the words), in the owner’s view with the private note', async () => {
    w = await makeWorkKit()
    const t = await asked()
    await w.anna.post(mine(`/${t.reference}/respond`), { response: 'Done.' })
    await w.call('POST', w.at(`/actions/${t.actionId}/review`), { internalNote: 'Looking now.' })
    await w.call('POST', w.at(`/actions/${t.actionId}/accept`), { internalNote: SECRET_NOTE, customerNote: 'All good.' })
    const action = (await w.call('GET', w.at(`/tasks/${t.id}`))).json.data.action
    expect(action.transitions.map((entry: { from: string | null; to: string; actor: string }) => [entry.from, entry.to, entry.actor])).toEqual([
      [null, 'not_started', 'admin'],
      ['not_started', 'submitted', 'customer'],
      ['submitted', 'under_review', 'admin'],
      ['under_review', 'accepted', 'admin'],
    ].map((row) => row))
    expect(action.transitions.at(-1)).toMatchObject({ internalNote: SECRET_NOTE, customerNote: 'All good.', actorEmail: 'owner@site.test' })
  })

  it('is refused for a move the table does not allow, from a stale screen, and for another project’s action', async () => {
    w = await makeWorkKit()
    const t = await asked()
    expect((await w.call('POST', w.at(`/actions/${t.actionId}/accept`), {})).status, 'nothing to accept before an answer').toBe(409)
    expect((await w.call('POST', w.at(`/actions/${t.actionId}/review`), {})).status).toBe(409)
    const other = await w.kit.project(w.anna.id, { name: 'Other' })
    expect((await w.call('POST', w.at(`/actions/${t.actionId}/cancel`, other), {})).status).toBe(404)
    expect((await w.call('POST', w.at('/actions/ghost/cancel'), {})).status).toBe(404)
  })

  it('an editor may review, but a customer may not reach the review endpoints at all', async () => {
    w = await makeWorkKit()
    const t = await asked()
    await w.anna.post(mine(`/${t.reference}/respond`), { response: 'Answer.' })
    const asCustomer = await w.kit.api(w.at(`/actions/${t.actionId}/accept`), { method: 'POST', body: {}, headers: w.anna.headers })
    expect(asCustomer.status).toBe(401)
    expect((await w.call('POST', w.at(`/actions/${t.actionId}/accept`), {}, 'editor')).status).toBe(200)
  })

  it('rewording is only possible while the customer has not answered', async () => {
    w = await makeWorkKit()
    const t = await asked()
    expect((await w.call('PATCH', w.at(`/actions/${t.actionId}`), { instruction: 'A clearer question please.' })).status).toBe(200)
    expect((await w.anna.get(mine(`/${t.reference}`))).json.data.action.instruction).toBe('A clearer question please.')
    await w.anna.post(mine(`/${t.reference}/respond`), { response: 'Answer.' })
    expect((await w.call('PATCH', w.at(`/actions/${t.actionId}`), { instruction: 'Changed under their feet.' })).status).toBe(409)
  })
})

describe('the overview and the timeline', () => {
  it('the overview says what needs the customer, most urgent first, and counts the project as awaiting them', async () => {
    w = await makeWorkKit()
    const late = await asked({ task: { title: 'Late one', dueOn: '2026-11-01' } })
    await asked({ task: { title: 'Later', dueOn: '2026-12-01' } })
    const overview = (await w.anna.get('/api/portal/overview')).json.data
    expect(overview.needsYou.map((entry: { task: { title: string }; overdue: boolean }) => [entry.task.title, entry.overdue])).toEqual([['Late one', true], ['Later', false]])
    expect(overview.counts.awaitingYou).toBe(1)
    expect(overview.upcoming.map((entry: { kind: string; title: string }) => [entry.kind, entry.title])).toEqual([['task', 'Late one'], ['task', 'Later']])
    await w.anna.post(mine(`/${late.reference}/respond`), { response: 'Answered.' })
    expect((await w.anna.get('/api/portal/overview')).json.data.needsYou.map((entry: { task: { title: string } }) => entry.task.title)).toEqual(['Later'])
  })

  it('shows the customer the lines written for them and none of the administration’s own', async () => {
    w = await makeWorkKit()
    const hidden = await w.task({ title: 'Hidden work' })
    await w.call('PATCH', w.at(`/tasks/${hidden.id}`), { priority: 'high' })
    await w.call('POST', w.at(`/tasks/${hidden.id}/notes`), { body: SECRET_NOTE })
    await w.call('POST', w.at(`/tasks/${hidden.id}/status`), { status: 'in_progress' })
    const t = await asked()
    await w.anna.post(mine(`/${t.reference}/respond`), { response: 'Answer.' })
    await w.call('POST', w.at(`/actions/${t.actionId}/changes`), { customerNote: 'One more thing.', internalNote: SECRET_NOTE })
    const timeline = (await w.anna.get(`/api/portal/projects/${w.project.reference}`)).json.data.timeline
    expect(timeline.map((entry: { type: string }) => entry.type)).toEqual(['action_changes_requested', 'action_submitted', 'action_assigned', 'task_created', 'created'])
    const text = JSON.stringify(timeline)
    for (const secret of [SECRET_NOTE, 'Hidden work']) expect(text).not.toContain(secret)
    expect(timeline[0]).toMatchObject({ subject: 'Send us your logo', note: 'One more thing.' })
    // The owner’s own view has all of it, including the internal lines.
    const owner = (await w.call('GET', `/api/admin/client-projects/${w.project.id}`)).json.data.events.map((entry: { event_type: string; visibility: string }) => entry.visibility)
    expect(owner).toContain('internal')
  })

  it('keeps the owner’s own lines about a SHARED task off the customer’s timeline and overview: edits, assignments, dependencies and private notes', async () => {
    w = await makeWorkKit()
    const shared = await w.task({ title: 'Shared work', customerVisible: true })
    const other = await w.task({ title: 'Other work', customerVisible: true })
    const me = w.kit.server.db.get<{ id: string }>('SELECT id FROM admin_users WHERE email = ?', ['owner@site.test'])!.id
    await w.call('PATCH', w.at(`/tasks/${shared.id}`), { priority: 'urgent', assignedTo: me, description: SECRET_DESCRIPTION })
    await w.call('POST', w.at(`/tasks/${shared.id}/dependencies`), { dependsOnId: other.id })
    await w.call('POST', w.at(`/tasks/${shared.id}/notes`), { body: SECRET_NOTE })
    const internal = w.kit.server.db.all<{ event_type: string }>("SELECT event_type FROM client_project_events WHERE visibility = 'internal' ORDER BY id").map((row) => row.event_type)
    expect(internal).toEqual(expect.arrayContaining(['task_edited', 'task_assigned', 'dependency_added', 'note_added']))
    const timeline = (await w.anna.get(`/api/portal/projects/${w.project.reference}`)).json.data.timeline.map((entry: { type: string }) => entry.type)
    expect(timeline.filter((type: string) => type === 'task_created')).toHaveLength(2)
    for (const type of ['task_edited', 'task_assigned', 'dependency_added', 'dependency_removed', 'note_added']) expect(timeline, type).not.toContain(type)
    const activity = (await w.anna.get('/api/portal/overview')).json.data.activity.map((entry: { type: string }) => entry.type)
    for (const type of ['task_edited', 'task_assigned', 'dependency_added', 'note_added']) expect(activity, type).not.toContain(type)
  })

  it('hiding a task takes its lines off the customer’s timeline, and a task that is shared later appears as a new line', async () => {
    w = await makeWorkKit()
    const t = await w.task({ title: 'Shared then hidden', customerVisible: true })
    const types = async () => (await w.anna.get(`/api/portal/projects/${w.project.reference}`)).json.data.timeline.map((entry: { type: string }) => entry.type)
    expect(await types()).toContain('task_created')
    await w.call('PATCH', w.at(`/tasks/${t.id}`), { customerVisible: false })
    expect(await types()).not.toContain('task_created')
    await w.call('PATCH', w.at(`/tasks/${t.id}`), { customerVisible: true })
    expect(await types()).toContain('task_created')
  })
})

describe('progress', () => {
  it('is nothing at all when nothing is recorded, then counts tasks, then (without tasks) milestones, and never takes a number from anybody', async () => {
    w = await makeWorkKit()
    const read = async () => (await w.anna.get(mine())).json.data.progress
    expect(await read()).toMatchObject({ percent: null, basis: null })
    const a = await w.task({ title: 'A', customerVisible: true })
    const b = await w.task({ title: 'B', customerVisible: true })
    await w.task({ title: 'C', customerVisible: true })
    const hidden = await w.task({ title: 'Hidden' })
    await w.call('POST', w.at(`/tasks/${a.id}/status`), { status: 'completed' })
    expect(await read()).toMatchObject({ percent: 33, basis: 'tasks', tasks: { total: 3, completed: 1, open: 2 } })
    await w.call('POST', w.at(`/tasks/${b.id}/status`), { status: 'cancelled' })
    expect(await read()).toMatchObject({ percent: 50, tasks: { total: 2, completed: 1 } })
    // The owner’s count includes what the customer cannot see; the customer’s does not reveal it.
    const space = (await w.call('GET', w.at('/work'))).json.data
    expect(space.progress).toMatchObject({ percent: 33, tasks: { total: 3, completed: 1 } })
    expect(space.customerProgress.tasks.total).toBe(2)
    await w.call('POST', w.at(`/tasks/${hidden.id}/status`), { status: 'completed' })
    expect((await w.call('GET', w.at('/work'))).json.data.progress.percent).toBe(67)
    expect((await read()).percent).toBe(50)
    for (const field of ['percent', 'progress']) expect((await w.call('PATCH', w.at(''), { [field]: 100 })).status).toBe(422)
  })
})

describe('milestones', () => {
  it('have a description, a status and a visibility; a completed one stays completed; a hidden one is invisible to the customer', async () => {
    w = await makeWorkKit()
    const open = (await w.call('POST', w.at('/milestones'), { title: 'Beta', description: 'The first public version.', dueOn: '2026-12-01' })).json.data
    const secret = (await w.call('POST', w.at('/milestones'), { title: 'Internal checkpoint', customerVisible: false })).json.data
    expect(open).toMatchObject({ status: 'upcoming', description: 'The first public version.', customer_visible: 1 })
    expect((await w.call('PATCH', w.at(`/milestones/${open.id}`), { status: 'delayed' })).json.data.status).toBe('delayed')
    expect((await w.call('PATCH', w.at(`/milestones/${open.id}`), { status: 'in_progress' })).json.data.status).toBe('in_progress')
    expect((await w.call('PATCH', w.at(`/milestones/${open.id}`), { status: 'finished' })).status).toBe(422)
    const detail = (await w.anna.get(`/api/portal/projects/${w.project.reference}`)).json.data
    expect(detail.milestoneList.map((entry: { title: string; status: string }) => [entry.title, entry.status])).toEqual([['Beta', 'in_progress']])
    expect(JSON.stringify(detail)).not.toContain('Internal checkpoint')
    expect(detail.milestones).toEqual({ done: 0, total: 1 })
    const done = (await w.call('PATCH', w.at(`/milestones/${open.id}`), { status: 'completed' })).json.data
    expect(done).toMatchObject({ status: 'completed' })
    expect(done.completed_at).not.toBeNull()
    expect((await w.call('PATCH', w.at(`/milestones/${open.id}`), { status: 'upcoming' })).status).toBe(409)
    expect((await w.call('PATCH', w.at(`/milestones/${open.id}`), { status: 'cancelled' })).status).toBe(409)
    expect((await w.call('PATCH', w.at(`/milestones/${open.id}`), { done: false })).status).toBe(409)
    // A cancelled milestone is out of the count and can be reinstated.
    expect((await w.call('PATCH', w.at(`/milestones/${secret.id}`), { status: 'cancelled' })).status).toBe(200)
    expect((await w.call('PATCH', w.at(`/milestones/${secret.id}`), { status: 'upcoming' })).status).toBe(200)
  })

  it('completing a milestone does not complete its tasks, and a milestone of another project cannot be used', async () => {
    w = await makeWorkKit()
    const milestone = (await w.call('POST', w.at('/milestones'), { title: 'Launch' })).json.data
    const t = await w.task({ title: 'Needs doing', milestoneId: milestone.id })
    await w.call('PATCH', w.at(`/milestones/${milestone.id}`), { done: true })
    expect((await w.call('GET', w.at(`/tasks/${t.id}`))).json.data.task.status).toBe('backlog')
    const space = (await w.call('GET', w.at('/work'))).json.data
    expect(space.milestones[0]).toMatchObject({ tasks: 1, completedTasks: 0 })
    const other = await w.kit.project(w.anna.id, { name: 'Other' })
    expect((await w.call('PATCH', w.at(`/tasks/${t.id}`), { milestoneId: 'ghost' })).status).toBe(422)
    // The database holds the line too.
    const foreign = (await w.call('POST', w.at('/milestones', other), { title: 'Elsewhere' })).json.data
    expect(() => w.kit.server.db.run('UPDATE project_tasks SET milestone_id = ? WHERE id = ?', [foreign.id, t.id])).toThrow()
  })
})
