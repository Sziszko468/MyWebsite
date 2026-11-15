import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AUDIT_TYPES, DOCUMENT_KINDS, PROJECT_CATEGORIES, PROJECT_EVENT_TYPES, PROJECT_STATUSES, PROJECT_TRANSITIONS, TERMINAL_STATUSES } from '../src/modules/customers/model.ts'
import { MIGRATIONS_DIRECTORY } from '../src/db/migrate.ts'
import { clientWords } from '../src/modules/notifications/clientTemplates.ts'
import { makePortalKit, type Customer, type PortalKit } from './portalKit.ts'

/**
 * The customer's projects (PROMPT 25): they exist only because the owner made them, they move through a documented set of statuses that only the owner
 * changes, and what the customer reads about them (a timeline, milestones, a count of what is done) is built from real records and nothing else.
 */

let kit: PortalKit
afterEach(async () => {
  await kit?.close()
})

const state = async () => {
  kit = await makePortalKit()
  const anna = await kit.customer('anna@example.com')
  return anna
}

const admin = (method: string, path: string, body?: unknown, headers: Record<string, string> = kit.admin) => kit.api(path, { method, body, headers })

async function oneProject(anna: Customer, body: Record<string, unknown> = {}) {
  const project = await kit.project(anna.id, body)
  return project
}

describe('the lists in the code are the lists in the database', () => {
  const sql = readFileSync(join(MIGRATIONS_DIRECTORY, '0012_client_portal.sql'), 'utf8')
  const listIn = (pattern: RegExp): string[] => {
    const match = pattern.exec(sql)
    if (!match) throw new Error(`not found in the migration: ${pattern}`)
    return [...match[1].matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1])
  }
  it('statuses, categories, events, documents and the account’s history', () => {
    expect(listIn(/status TEXT NOT NULL DEFAULT 'awaiting_start' CHECK \(status IN \(([^)]*)\)\)/)).toEqual([...PROJECT_STATUSES])
    expect(listIn(/category TEXT NOT NULL CHECK \(category IN \(([^)]*)\)\)/)).toEqual([...PROJECT_CATEGORIES])
    // The history was widened by migration 0013 (the project work): the list in the code is the rebuilt table's, and the first eight are 0012's.
    const rebuilt = readFileSync(join(MIGRATIONS_DIRECTORY, '0013_project_management.sql'), 'utf8')
    const kinds = [...(/CREATE TABLE client_project_events_rebuilt \([\s\S]*?event_type TEXT NOT NULL CHECK \(event_type IN \(\s*('created'[^)]*)\)\)/.exec(rebuilt)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1])
    expect(kinds).toEqual([...PROJECT_EVENT_TYPES])
    expect(listIn(/event_type TEXT NOT NULL CHECK \(event_type IN \(('created'[^)]*)\)\)/)).toEqual(kinds.slice(0, 8))
    expect(listIn(/kind TEXT NOT NULL CHECK \(kind IN \(('brief'[^)]*)\)\)/)).toEqual([...DOCUMENT_KINDS])
    expect(listIn(/event_type TEXT NOT NULL CHECK \(event_type IN \(\s*('invited'[^)]*)\)\)/)).toEqual([...AUDIT_TYPES])
  })

  it('every status can be left except by the rules: a finished project is only ever put on hold again', () => {
    expect(PROJECT_STATUSES).toHaveLength(11)
    for (const from of PROJECT_STATUSES) {
      expect(PROJECT_TRANSITIONS[from]).not.toContain(from)
      if (TERMINAL_STATUSES.includes(from)) expect(PROJECT_TRANSITIONS[from]).toEqual(['on_hold'])
      else expect(PROJECT_TRANSITIONS[from]).toHaveLength(10)
    }
  })

  it('every status has a word in every language in the e-mails', () => {
    for (const lang of ['hu', 'en', 'nl'] as const) for (const status of PROJECT_STATUSES) expect(clientWords(lang).statuses[status].length, `${lang} ${status}`).toBeGreaterThan(2)
  })
})

describe('making a project', () => {
  it('is the owner’s act: a reference that says nothing, the first status, a first line of history', async () => {
    const anna = await state()
    const project = await oneProject(anna, { name: 'The bakery website', category: 'website', startedOn: '2026-11-10', expectedOn: '2027-01-15' })
    expect(project.reference).toMatch(/^PRJ-[2-9A-HJKMNP-TV-Z]{8}$/)
    const detail = (await anna.get(`/api/portal/projects/${project.reference}`)).json.data
    expect(detail).toMatchObject({ name: 'The bakery website', category: 'website', status: 'awaiting_start', startedOn: '2026-11-10', expectedOn: '2027-01-15', completedAt: null, milestones: null, nextMilestone: null })
    expect(detail.timeline.map((entry: { type: string }) => entry.type)).toEqual(['created'])
    const history = kit.server.db.all<{ event_type: string }>("SELECT event_type FROM customer_audit_events WHERE event_type = 'project_created'")
    expect(history).toHaveLength(1)
  })

  it('needs an accepted quote when it comes from a request, and the request must be the customer’s own', async () => {
    const anna = await state()
    const bela = await kit.customer('bela@example.com')
    const accepted = await kit.accepted('anna@example.com')
    const open = await kit.request('anna@example.com', { description: 'Another request, still open and not yet answered at all.' })
    const body = (id: string) => ({ name: 'From a request', category: 'website', quoteRequestId: id })

    expect((await admin('POST', `/api/admin/clients/${anna.id}/projects`, body(accepted.id))).json.error.details.reason).toBe('request_not_linked')
    await kit.link(anna.id, 'quote_request', accepted.id)
    await kit.link(anna.id, 'quote_request', open.id)
    expect((await admin('POST', `/api/admin/clients/${anna.id}/projects`, body(open.id))).json.error.details.reason).toBe('quote_not_accepted')
    // A request that belongs to another customer is not usable, even with an accepted quote.
    expect((await admin('POST', `/api/admin/clients/${bela.id}/projects`, body(accepted.id))).json.error.details.reason).toBe('request_not_linked')
    const made = await admin('POST', `/api/admin/clients/${anna.id}/projects`, body(accepted.id))
    expect(made.status).toBe(201)
    const row = kit.server.db.get<{ quote_id: string; quote_request_id: string }>('SELECT quote_id, quote_request_id FROM client_projects WHERE reference = ?', [made.json.data.reference])!
    expect(row).toEqual({ quote_id: accepted.quoteId, quote_request_id: accepted.id })
    expect((await anna.get(`/api/portal/projects/${made.json.data.reference}`)).json.data.request).toEqual({ reference: accepted.reference })
  })

  it('can also stand on its own (agreed outside the site), but not for an account that is switched off, and not with a bad word in a field', async () => {
    const anna = await state()
    expect((await admin('POST', `/api/admin/clients/${anna.id}/projects`, { name: 'Agreed by phone', category: 'other' })).status).toBe(201)
    for (const body of [{ name: '', category: 'website' }, { name: 'x', category: 'spaceship' }, { name: 'x', category: 'website', startedOn: '2026-02-31' }, { name: 'x'.repeat(121), category: 'website' }]) {
      expect((await admin('POST', `/api/admin/clients/${anna.id}/projects`, body)).status, JSON.stringify(body)).toBe(422)
    }
    await admin('POST', `/api/admin/clients/${anna.id}/actions`, { action: 'disable' })
    expect((await admin('POST', `/api/admin/clients/${anna.id}/projects`, { name: 'x', category: 'website' })).json.error.details.reason).toBe('customer_disabled')
    expect((await admin('POST', '/api/admin/clients/nobody/projects', { name: 'x', category: 'website' })).status).toBe(404)
  })

  it('is never a side effect: a request, an acceptance or an invitation makes no project', async () => {
    kit = await makePortalKit()
    await kit.customer('anna@example.com')
    await kit.accepted('anna@example.com')
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM client_projects')).toEqual({ n: 0 })
  })
})

describe('moving a project through its statuses', () => {
  it('only the owner does it, along the documented rules, and the customer is told in the history', async () => {
    const anna = await state()
    const { id, reference } = await oneProject(anna)
    const move = (status: string, extra: Record<string, unknown> = {}, headers = kit.admin) => admin('POST', `/api/admin/client-projects/${id}/status`, { status, ...extra }, headers)

    expect((await move('awaiting_start')).json.error.details.reason).toBe('invalid_transition')
    expect((await move('flying')).status).toBe(422)
    expect((await move('discovery', { note: 'We start with a conversation.' })).status).toBe(200)
    // The day work began is recorded when it first leaves "awaiting start" for a working phase.
    expect((await anna.get(`/api/portal/projects/${reference}`)).json.data.startedOn).toBe('2026-11-03')
    expect((await move('completed')).status).toBe(200)
    expect(kit.server.db.get('SELECT completed_at FROM client_projects WHERE id = ?', [id])).toEqual({ completed_at: kit.server.clock.now().toISOString() })
    // A finished project can only be put on hold again.
    expect((await move('design')).json.error.details.reason).toBe('invalid_transition')
    expect((await move('on_hold')).status).toBe(200)
    expect(kit.server.db.get('SELECT completed_at FROM client_projects WHERE id = ?', [id])).toEqual({ completed_at: null })

    const timeline = (await anna.get(`/api/portal/projects/${reference}`)).json.data.timeline
    expect(timeline.map((entry: { type: string; toStatus: string | null }) => [entry.type, entry.toStatus])).toEqual([['status_changed', 'on_hold'], ['status_changed', 'completed'], ['status_changed', 'discovery'], ['created', 'awaiting_start']])
    expect(timeline[2].note).toBe('We start with a conversation.')
  })

  it('a customer cannot move it, and neither can anyone without the right: the editor can, a stranger cannot', async () => {
    const anna = await state()
    const { id } = await oneProject(anna)
    const path = `/api/admin/client-projects/${id}/status`
    expect((await kit.api(path, { body: { status: 'design' }, headers: anna.headers })).status).toBe(401)
    expect((await kit.api(path, { body: { status: 'design' } })).status).toBe(401)
    expect((await kit.api(path, { body: { status: 'design' }, headers: { Cookie: kit.admin.Cookie } })).status).toBe(403)
    expect((await kit.api(path, { body: { status: 'design' }, headers: kit.editor })).status).toBe(200)
  })

  it('counts a project as active, waiting for the customer or completed, from its status alone', async () => {
    const anna = await state()
    const a = await oneProject(anna, { name: 'One' })
    const b = await oneProject(anna, { name: 'Two' })
    const c = await oneProject(anna, { name: 'Three' })
    const d = await oneProject(anna, { name: 'Four' })
    await admin('POST', `/api/admin/client-projects/${a.id}/status`, { status: 'waiting_customer', notify: false })
    await admin('POST', `/api/admin/client-projects/${b.id}/status`, { status: 'development', notify: false })
    await admin('POST', `/api/admin/client-projects/${c.id}/status`, { status: 'completed', notify: false })
    await admin('POST', `/api/admin/client-projects/${d.id}/status`, { status: 'on_hold', notify: false })
    const overview = (await anna.get('/api/portal/overview')).json.data
    // Awaiting start counts as active (it is going to happen); on hold and completed do not.
    expect(overview.counts).toMatchObject({ active: 2, awaitingYou: 1, completed: 1 })
    expect(overview.awaitingYou).toEqual([{ reference: a.reference, name: 'One', status: 'waiting_customer' }])
    const list = (await anna.get('/api/portal/projects')).json.data.map((project: { name: string }) => project.name)
    // Unfinished first, then the finished ones.
    expect(list.indexOf('Three')).toBeGreaterThan(list.indexOf('One'))
  })
})

describe('milestones and the timeline', () => {
  it('show a count only when there are milestones, and a percentage only when it is counted from records', async () => {
    const anna = await state()
    const { id, reference } = await oneProject(anna)
    const before = (await anna.get(`/api/portal/projects/${reference}`)).json.data
    expect(before.milestones).toBeNull()
    // PROMPT 26: nothing recorded means nothing to count, never "0 %".
    expect(before.progress).toMatchObject({ percent: null, basis: null })
    const first = (await admin('POST', `/api/admin/client-projects/${id}/milestones`, { title: 'Design approved', dueOn: '2026-11-20' })).json.data
    await admin('POST', `/api/admin/client-projects/${id}/milestones`, { title: 'First version online', dueOn: '2026-12-15' })
    await admin('POST', `/api/admin/client-projects/${id}/milestones`, { title: 'Hand-over' })
    await admin('PATCH', `/api/admin/client-projects/${id}/milestones/${first.id}`, { done: true })
    const after = (await anna.get(`/api/portal/projects/${reference}`)).json.data
    expect(after.milestones).toEqual({ done: 1, total: 3 })
    expect(after.nextMilestone).toEqual({ title: 'First version online', dueOn: '2026-12-15' })
    expect(after.milestoneList.map((entry: { title: string; completedAt: string | null }) => [entry.title, entry.completedAt !== null])).toEqual([['Design approved', true], ['First version online', false], ['Hand-over', false]])
    expect(after.timeline.map((entry: { type: string; milestone: string | null }) => [entry.type, entry.milestone])).toEqual([['milestone_completed', 'Design approved'], ['milestone_added', 'Hand-over'], ['milestone_added', 'First version online'], ['milestone_added', 'Design approved'], ['created', null]])
    // The percentage is the milestones' own count (1 of 3), computed by the server; it is not a number anybody can set.
    expect(after.progress).toMatchObject({ percent: 33, basis: 'milestones' })
    expect((await admin('PATCH', `/api/admin/client-projects/${id}`, { percent: 90 })).status).toBeLessThan(500)
    expect((await anna.get(`/api/portal/projects/${reference}`)).json.data.progress.percent).toBe(33)
  })

  it('a completed milestone stays completed and cannot be removed; an open one can', async () => {
    const anna = await state()
    const { id } = await oneProject(anna)
    const done = (await admin('POST', `/api/admin/client-projects/${id}/milestones`, { title: 'Done' })).json.data
    const open = (await admin('POST', `/api/admin/client-projects/${id}/milestones`, { title: 'Open' })).json.data
    await admin('PATCH', `/api/admin/client-projects/${id}/milestones/${done.id}`, { done: true })
    expect((await admin('PATCH', `/api/admin/client-projects/${id}/milestones/${done.id}`, { done: false })).status).toBe(409)
    expect((await admin('DELETE', `/api/admin/client-projects/${id}/milestones/${done.id}`)).status).toBe(409)
    expect((await admin('DELETE', `/api/admin/client-projects/${id}/milestones/${open.id}`)).status).toBe(204)
    // A milestone of another project cannot be reached through this one.
    const other = await oneProject(anna, { name: 'Other' })
    expect((await admin('PATCH', `/api/admin/client-projects/${other.id}/milestones/${done.id}`, { done: true })).status).toBe(404)
  })

  it('the overview lists what is due, and says what is overdue', async () => {
    const anna = await state()
    const { id } = await oneProject(anna)
    await admin('POST', `/api/admin/client-projects/${id}/milestones`, { title: 'Late one', dueOn: '2026-11-01' })
    await admin('POST', `/api/admin/client-projects/${id}/milestones`, { title: 'Next week', dueOn: '2026-11-10' })
    await admin('POST', `/api/admin/client-projects/${id}/milestones`, { title: 'Whenever' })
    const upcoming = (await anna.get('/api/portal/overview')).json.data.upcoming
    expect(upcoming.map((entry: { title: string; overdue: boolean }) => [entry.title, entry.overdue])).toEqual([['Late one', true], ['Next week', false], ['Whenever', false]])
  })

  it('the owner’s own words are the only words on the timeline, and a private note is on no list a customer can read', async () => {
    const anna = await state()
    const { id, reference } = await oneProject(anna)
    await admin('POST', `/api/admin/client-projects/${id}/updates`, { kind: 'update', note: 'The first pages are ready for you to look at.', notify: false })
    await admin('POST', `/api/admin/client-projects/${id}/updates`, { kind: 'feedback', note: 'Which of the two colours do you prefer?' })
    await admin('POST', `/api/admin/client-projects/${id}/notes`, { body: 'PRIVATE: the customer pays late, be careful.' })
    const detail = await anna.get(`/api/portal/projects/${reference}`)
    expect(detail.json.data.timeline.map((entry: { type: string; note: string | null }) => [entry.type, entry.note])).toEqual([['feedback_requested', 'Which of the two colours do you prefer?'], ['update_posted', 'The first pages are ready for you to look at.'], ['created', null]])
    for (const path of ['/api/portal/overview', '/api/portal/projects', `/api/portal/projects/${reference}`]) expect((await anna.get(path)).text, path).not.toMatch(/PRIVATE|pays late/)
    const adminView = (await kit.api(`/api/admin/client-projects/${id}`, { headers: { Cookie: kit.admin.Cookie } })).json.data
    expect(adminView.notes.map((note: { body: string }) => note.body)).toEqual(['PRIVATE: the customer pays late, be careful.'])
    expect(adminView.notes[0].authorEmail).toBe('owner@site.test')
    // The history is append-only, even for the owner.
    expect(() => kit.server.db.run('UPDATE client_project_events SET note = ?', ['changed'])).toThrow()
  })

  it('a bad update is refused', async () => {
    const anna = await state()
    const { id } = await oneProject(anna)
    for (const body of [{ kind: 'update' }, { kind: 'update', note: 'x' }, { kind: 'gossip', note: 'Something about the project.' }, { kind: 'update', note: 'x'.repeat(1001) }]) {
      expect((await admin('POST', `/api/admin/client-projects/${id}/updates`, body)).status, JSON.stringify(body)).toBe(422)
    }
  })
})

describe('what is e-mailed, and what is not', () => {
  const mails = () => kit.mailsTo('anna@example.com')

  it('a new project is announced; a working phase is not; an important change is; and the owner can overrule either way', async () => {
    const anna = await state()
    kit.server.mailer.sent.length = 0
    const { id, reference } = await oneProject(anna, { name: 'The bakery website', notify: true })
    await kit.settle()
    expect(mails()).toHaveLength(1)
    expect(mails()[0].subject).toBe(clientWords('en').projectCreated.subject('The bakery website'))
    expect(mails()[0].text).toContain(`https://site.test/en/client-portal/projects/${reference}`)
    expect(mails()[0].text).not.toMatch(/verify#/)

    const move = (status: string, notify?: boolean) => admin('POST', `/api/admin/client-projects/${id}/status`, { status, ...(notify === undefined ? {} : { notify }) })
    kit.server.mailer.sent.length = 0
    await move('discovery')
    await move('planning')
    await move('design')
    await kit.settle()
    expect(mails()).toHaveLength(0)
    await move('development', true)
    await move('review')
    await move('finalization', false)
    await move('waiting_customer')
    await kit.settle()
    const subjects = mails().map((mail) => mail.text)
    expect(subjects).toHaveLength(3)
    // A message says the status ITS change made, not the one the project has now.
    expect(subjects[0]).toContain(clientWords('en').statuses.development)
    expect(subjects[1]).toContain(clientWords('en').statuses.review)
    expect(subjects[2]).toContain(clientWords('en').statuses.waiting_customer)
  })

  it('a question is e-mailed, an update is not unless the owner says so, a milestone or a change of dates never is', async () => {
    const anna = await state()
    const { id } = await oneProject(anna)
    kit.server.mailer.sent.length = 0
    await admin('POST', `/api/admin/client-projects/${id}/updates`, { kind: 'update', note: 'The first pages are ready for you.' })
    await admin('POST', `/api/admin/client-projects/${id}/milestones`, { title: 'A step', dueOn: '2026-12-01' })
    await admin('PATCH', `/api/admin/client-projects/${id}`, { expectedOn: '2027-02-01' })
    await kit.settle()
    expect(mails()).toHaveLength(0)
    await admin('POST', `/api/admin/client-projects/${id}/updates`, { kind: 'feedback', note: 'Which colour do you prefer?' })
    await admin('POST', `/api/admin/client-projects/${id}/updates`, { kind: 'update', note: 'And a note for the record.', notify: true })
    await kit.settle()
    expect(mails()).toHaveLength(2)
    expect(mails()[0].subject).toBe(clientWords('en').projectUpdate.subject('A website'))
    expect(mails()[0].text).toContain('Which colour do you prefer?')
    expect(mails()[0].text).toContain(clientWords('en').projectUpdate.titleFeedback)
  })

  it('writes each message in the customer’s language, and one message per event whatever is repeated', async () => {
    kit = await makePortalKit()
    const bela = await kit.customer('bela@example.com', { language: 'nl', name: 'Béla' })
    kit.server.mailer.sent.length = 0
    const { id } = await kit.project(bela.id, { name: 'Webshop', notify: true })
    await admin('POST', `/api/admin/client-projects/${id}/status`, { status: 'review' })
    await kit.settle()
    const mailsToBela = kit.mailsTo('bela@example.com')
    expect(mailsToBela.map((mail) => mail.subject)).toEqual([clientWords('nl').projectCreated.subject('Webshop'), clientWords('nl').projectUpdate.subject('Webshop')])
    expect(mailsToBela[0].text).toContain('Béla')
    expect(mailsToBela[0].text).toContain('/nl/client-portal/projects/PRJ-')
    // The outbox allows one message per kind per event: asking again changes nothing.
    const events = kit.server.db.all<{ id: number }>('SELECT id FROM client_project_events ORDER BY id')
    const { queueClientMail } = await import('../src/modules/customers/mail.ts')
    for (const event of events) queueClientMail(kit.server.app.context, { kind: 'client_project_status', relatedType: 'client_project_event', relatedId: String(event.id), recipient: 'bela@example.com', language: 'nl' })
    expect(kit.server.db.get("SELECT COUNT(*) AS n FROM email_deliveries WHERE kind = 'client_project_status'")).toEqual({ n: 2 })
  })

  it('nothing is sent to an account that was switched off after the message was queued', async () => {
    const anna = await state()
    kit.server.mailer.sent.length = 0
    await oneProject(anna, { notify: true })
    // The outbox sends at once in the background; put the message back as waiting, as it is when the provider is slow.
    kit.server.db.run("UPDATE email_deliveries SET status = 'pending', attempts = 0, next_attempt_at = ? WHERE kind = 'client_project_created'", [kit.server.clock.now().toISOString()])
    kit.server.mailer.sent.length = 0
    await admin('POST', `/api/admin/clients/${anna.id}/actions`, { action: 'disable' })
    await kit.settle()
    expect(mails()).toHaveLength(0)
    expect(kit.server.db.get("SELECT status FROM email_deliveries WHERE kind = 'client_project_created'")).toEqual({ status: 'cancelled' })
  })
})

describe('documents', () => {
  it('cannot be published yet: the owner is told why, and the database agrees', async () => {
    const anna = await state()
    const { id, reference } = await oneProject(anna)
    const doc = 'doc-1'
    kit.server.db.run("INSERT INTO client_documents (id, project_id, title, kind, created_at) VALUES (?, ?, 'Brief', 'brief', ?)", [doc, id, '2026-11-03T10:00:00.000Z'])
    const refused = await admin('POST', `/api/admin/client-projects/${id}/documents/${doc}/publish`)
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.reason).toBe('storage_unavailable')
    // A document with nowhere to keep its bytes cannot be marked published, whatever code tries.
    expect(() => kit.server.db.run("UPDATE client_documents SET published_at = '2026-11-03T10:00:00.000Z' WHERE id = ?", [doc])).toThrow()
    expect((await anna.get('/api/portal/documents')).json.data).toEqual([])
    expect((await anna.get(`/api/portal/projects/${reference}`)).json.data.documents).toEqual([])
    expect((await anna.get('/api/portal/session')).json.data.features.documents).toBe(false)
  })
})
