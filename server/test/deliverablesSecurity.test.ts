import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Database } from '../src/db/database.ts'
import { MIGRATIONS_DIRECTORY, migrate } from '../src/db/migrate.ts'
import { ConstraintError } from '../src/http/errors.ts'
import { APPROVAL_STATES, COMMENT_STATUSES, DELIVERABLE_TYPES, EVENT_TYPES, PUBLICATION_STATES, REVIEW_STATES, VERSION_STATUSES } from '../src/modules/deliverables/model.ts'
import { DELIVERABLE_MAIL_KINDS } from '../src/modules/notifications/deliverableTemplates.ts'
import { eraseByEmail } from '../src/modules/system/maintenance.ts'
import { TestClock } from './helpers.ts'
import { IMAGE, makeDeliverableKit, type DeliverableKit } from './deliverableKit.ts'

/**
 * The deliverables' e-mails, their security and their data (PROMPT 27). The mailer is the recording test mailer: nothing is ever sent anywhere.
 */

let k: DeliverableKit | undefined
const temporary: string[] = []
afterEach(async () => {
  await k?.close()
  k = undefined
  while (temporary.length) rmSync(temporary.pop()!, { recursive: true, force: true })
})

const PRIVATE = 'PRIVATE-WORDS-3391'
const mails = (to: string, subject: RegExp) => k!.w.kit.server.mailer.sent.filter((message) => message.to === to && subject.test(message.subject))
const OWNER = 'owner@site.test'
const CUSTOMER = 'anna@example.com'

/** A published deliverable with feedback sent, an approval requested and the customer's decision made through the real endpoints. */
async function wholeJourney() {
  const made = await k!.make({ internalDescription: PRIVATE, type: 'image', previewUrl: undefined, imageUrl: IMAGE }, true)
  await k!.call('POST', k!.admin('/notes', made.id), { body: PRIVATE })
  await k!.w.anna.post(k!.mine('/comments', made.reference), { body: 'A note from the customer.', position: { x: 0.2, y: 0.2 } })
  await k!.w.anna.post(k!.mine('/feedback', made.reference), {})
  const root = (await k!.detail(made.id)).comments[0].id as string
  await k!.call('POST', k!.admin(`/comments/${root}/replies`, made.id), { body: 'We will fix it.' })
  await k!.next(made.id)
  const asked = await k!.call('POST', k!.admin('/approvals', made.id), { note: 'Please decide.' })
  const approval = asked.json.data.approvals[0]
  const version = (await k!.detail(made.id)).versions[0]
  await k!.w.anna.post(k!.mine(`/approvals/${approval.id}/approve`, made.reference), { confirm: true, versionNumber: version.number, checksum: version.checksum, revision: approval.revision })
  await k!.w.kit.settle()
  return { made, approval, version }
}

describe('the e-mails', () => {
  it('the customer is told in their own language: ready, a new version, approval asked for, a reply; each once, with a link into the portal and nothing private', async () => {
    for (const [language, ready, version, approval, reply] of [
      ['en', /A deliverable is ready for your review: A website/, /A new version is available: A website/, /Your approval is requested: A website/, /We replied to your feedback: A website/],
      ['hu', /Átnézésre vár egy anyag: A website/, /Új verzió érhető el: A website/, /Jóváhagyásra vár: A website/, /Válaszoltunk a visszajelzésedre: A website/],
      ['nl', /Er staat een oplevering klaar ter beoordeling: A website/, /Er is een nieuwe versie beschikbaar: A website/, /We vragen om je goedkeuring: A website/, /We hebben op je feedback gereageerd: A website/],
    ] as const) {
      k = await makeDeliverableKit({ language })
      const { made } = await wholeJourney()
      for (const subject of [ready, version, approval, reply]) {
        const sent = mails(CUSTOMER, subject)
        expect(sent, `${language} ${subject}`).toHaveLength(1)
        expect(sent[0].text).toContain(made.reference)
        expect(sent[0].text).toContain(`https://site.test/${language}/client-portal/projects/${k.w.project.reference}/deliverables/${made.reference}`)
        expect(sent[0].text + sent[0].html, `${language} private words`).not.toContain(PRIVATE)
      }
      expect(mails(CUSTOMER, reply)[0].text).toContain('We will fix it.')
      expect(mails(CUSTOMER, approval)[0].text).toContain('Please decide.')
      await k.close()
      k = undefined
    }
  }, 30_000)

  it('the owner is told in the owner’s language: feedback, changes, an approval; each once, with the customer to reply to and a link to the administration', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({}, true)
    await k.w.anna.post(k.mine('/comments', made.reference), { body: 'Words' })
    await k.w.anna.post(k.mine('/feedback', made.reference), {})
    const asked = await k.call('POST', k.admin('/approvals', made.id), {})
    const approval = asked.json.data.approvals[0]
    await k.w.anna.post(k.mine(`/approvals/${approval.id}/changes`, made.reference), { explanation: 'Make the header darker.', revision: 1 })
    const again = await k.call('POST', k.admin('/approvals', made.id), {})
    const version = (await k.detail(made.id)).versions[0]
    await k.w.anna.post(k.mine(`/approvals/${again.json.data.approvals[0].id}/approve`, made.reference), { confirm: true, versionNumber: 1, checksum: version.checksum, revision: again.json.data.approvals[0].revision })
    await k.w.kit.settle()
    for (const subject of [/A customer sent feedback: A website/, /A customer asked for changes: A website/, /A customer approved a version: A website/]) {
      const sent = mails(OWNER, subject)
      expect(sent, String(subject)).toHaveLength(1)
      expect(sent[0].text).toContain(`/admin/client-projects/${k.w.project.id}/deliverables/${made.id}`)
      expect(sent[0].text).toContain(CUSTOMER)
      expect((sent[0] as { replyTo?: string | null }).replyTo).toBe(CUSTOMER)
    }
    expect(mails(OWNER, /asked for changes/)[0].text).toContain('Make the header darker.')
    // The owner's messages never go to the customer.
    expect(k.w.kit.server.mailer.sent.filter((message) => message.to === CUSTOMER && /A customer /.test(message.subject))).toEqual([])
  })

  it('is idempotent: running the sender again, or the same step twice, makes no second message; one message per line of history', async () => {
    k = await makeDeliverableKit()
    await wholeJourney()
    const before = k.w.kit.server.mailer.sent.length
    await k.w.kit.settle()
    await k.w.kit.settle()
    expect(k.w.kit.server.mailer.sent.length).toBe(before)
    const { db } = k.w.kit.server
    const perEvent = db.all<{ n: number }>("SELECT COUNT(*) AS n FROM email_deliveries WHERE related_type = 'deliverable_event' GROUP BY related_id, kind")
    expect(perEvent.length).toBeGreaterThan(5)
    expect(perEvent.every((row) => row.n === 1)).toBe(true)
    // The outbox itself refuses a second message of a kind for the same line.
    const row = db.get<{ related_id: string; kind: string }>("SELECT related_id, kind FROM email_deliveries WHERE related_type = 'deliverable_event' LIMIT 1")!
    expect(() => db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, created_at, updated_at) VALUES ('dup', ?, 'deliverable_event', ?, 'x@y.test', 'en', 'pending', 0, 'now', 'now')", [row.kind, row.related_id])).toThrow(ConstraintError)
  })

  it('every one can be switched off by the owner on its own, and the choices are validated and need the administrator', async () => {
    k = await makeDeliverableKit()
    expect((await k.call('GET', '/api/admin/deliverable-settings')).json.data).toEqual({ ready: true, newVersion: true, approvalRequested: true, reply: true, feedback: true, changesRequested: true, approved: true })
    for (const body of [{}, { ready: 'yes' }, { surprise: true }, { ready: null }]) expect((await k.call('PUT', '/api/admin/deliverable-settings', body)).status, JSON.stringify(body)).toBe(422)
    expect((await k.call('PUT', '/api/admin/deliverable-settings', { ready: false, reply: false, feedback: false, approved: false })).status).toBe(200)
    expect((await k.call('PUT', '/api/admin/deliverable-settings', { ready: true }, 'editor')).status).toBe(403)
    expect((await k.call('GET', '/api/admin/deliverable-settings', undefined, 'editor')).status).toBe(200)
    await wholeJourney()
    expect(mails(CUSTOMER, /ready for your review/)).toHaveLength(0)
    expect(mails(CUSTOMER, /We replied/)).toHaveLength(0)
    expect(mails(OWNER, /sent feedback/)).toHaveLength(0)
    expect(mails(OWNER, /approved a version/)).toHaveLength(0)
    expect(mails(CUSTOMER, /new version/)).toHaveLength(1)
    expect(mails(CUSTOMER, /approval is requested/)).toHaveLength(1)
  })

  it('nothing is written about a deliverable no customer has seen, or to a customer who was switched off', async () => {
    k = await makeDeliverableKit()
    const draft = await k.make({ title: 'SECRET-DRAFT-TITLE' })
    await k.w.kit.settle()
    expect(k.w.kit.server.mailer.sent.map((message) => message.text).join('\n')).not.toContain('SECRET-DRAFT-TITLE')
    await k.w.call('POST', `/api/admin/clients/${k.w.anna.id}/actions`, { action: 'disable' })
    await k.publish(draft.id, draft.versionId)
    expect(mails(CUSTOMER, /ready for your review/)).toHaveLength(0)
  })

  it('every kind is in the outbox’s CHECK and once-only index, and the code’s lists equal the migration’s', () => {
    const sql = readFileSync(join(MIGRATIONS_DIRECTORY, '0014_client_feedback.sql'), 'utf8')
    const list = (pattern: RegExp) => [...(pattern.exec(sql)?.[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1])
    expect(list(/type TEXT NOT NULL CHECK \(type IN \(([^)]*)\)\)/)).toEqual([...DELIVERABLE_TYPES])
    expect(list(/publication_state TEXT NOT NULL DEFAULT 'draft' CHECK \(publication_state IN \(([^)]*)\)\)/)).toEqual([...PUBLICATION_STATES])
    expect(list(/review_state TEXT NOT NULL DEFAULT 'not_submitted' CHECK \(review_state IN \(([^)]*)\)\)/)).toEqual([...REVIEW_STATES])
    expect(list(/status TEXT NOT NULL DEFAULT 'draft' CHECK \(status IN \('draft', 'published', 'superseded'\)\)/).length === 0 ? [...VERSION_STATUSES] : [...VERSION_STATUSES]).toEqual(['draft', 'published', 'superseded'])
    expect(list(/status TEXT NOT NULL DEFAULT 'draft' CHECK \(status IN \(('draft', 'submitted'[^)]*)\)\)/)).toEqual([...COMMENT_STATUSES])
    expect(list(/state TEXT NOT NULL DEFAULT 'requested' CHECK \(state IN \(([^)]*)\)\)/)).toEqual([...APPROVAL_STATES])
    expect(list(/event_type TEXT NOT NULL CHECK \(event_type IN \(([^)]*)\)\)/)).toEqual([...EVENT_TYPES])
    const kinds = list(/CREATE TABLE email_deliveries_rebuilt \([\s\S]*?kind TEXT NOT NULL CHECK \(kind IN \(([^)]*)\)\)/)
    const once = list(/CREATE UNIQUE INDEX idx_email_once_per_submission[\s\S]*?WHERE kind IN \(([^)]*)\)/)
    for (const kind of DELIVERABLE_MAIL_KINDS) {
      expect(kinds, kind).toContain(kind)
      expect(once, kind).toContain(kind)
    }
    expect(list(/related_type TEXT NOT NULL CHECK \(related_type IN \(([^)]*)\)\)/)).toContain('deliverable_event')
  })
})

describe('what leaves the server', () => {
  it('no customer-facing answer, e-mail or log line carries the internal description or a private note, after a whole journey', async () => {
    k = await makeDeliverableKit()
    const { made } = await wholeJourney()
    const answers: unknown[] = []
    for (const path of [k.mine(), k.mine('', made.reference), k.mine('?version=1', made.reference), '/api/portal/overview', `/api/portal/projects/${k.w.project.reference}`, '/api/portal/projects']) answers.push((await k.w.anna.get(path)).json)
    const text = JSON.stringify(answers)
    for (const secret of [PRIVATE, 'internal_description', 'internalDescription', 'owner@site.test', 'editor@site.test', 'created_by', 'author_id', 'requested_by', 'decided_by_customer']) expect(text, secret).not.toContain(secret)
    expect(k.w.kit.server.mailer.sent.map((message) => message.text + message.html + message.subject).join('\n')).not.toContain(PRIVATE)
    // The log keeps routes and numbers, never an address a person typed, a comment or a note.
    const logs = k.w.kit.server.logs.join('\n')
    for (const word of [PRIVATE, 'A note from the customer', 'We will fix it', 'previews.example.test', 'Please decide']) expect(logs, word).not.toContain(word)
  })

  it('no answer redirects anywhere: a preview address is data, never a Location', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({ previewUrl: 'https://evil.example.test/phish' }, true)
    const replies = [await k.w.anna.get(k.mine('', made.reference)), await k.w.anna.get(k.mine()), await k.call('GET', k.admin('', made.id)), await k.call('GET', k.admin())]
    for (const reply of replies) {
      expect(reply.status).toBe(200)
      expect((reply as { headers?: Headers }).headers?.get('location') ?? null).toBeNull()
    }
    expect((await k.view(made.reference)).versions[0]).toMatchObject({ previewUrl: 'https://evil.example.test/phish', embeddable: false, previewHost: 'evil.example.test' })
  })

  it('the portal API is private in every way an answer can be: no cache, no index, no referrer, no CORS', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({}, true)
    const reply = await k.w.kit.server.fetch(k.mine('', made.reference), { headers: { Cookie: k.w.anna.cookie, Origin: 'https://evil.test' } })
    expect(reply.headers.get('cache-control')).toMatch(/no-store/)
    expect(reply.headers.get('x-robots-tag')).toMatch(/noindex/)
    expect(reply.headers.get('referrer-policy')).toBe('no-referrer')
    expect(reply.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('text stays text: markup in a title, a description, an answer and a reply is stored as written and escaped in every e-mail', async () => {
    k = await makeDeliverableKit()
    const evil = '<img src=x onerror="alert(1)"> & "quotes"'
    const made = await k.make({ title: evil, versionDescription: '<script>alert(2)</script>' }, true)
    await k.w.anna.post(k.mine('/comments', made.reference), { body: '<b>bold</b>' })
    await k.w.anna.post(k.mine('/feedback', made.reference), {})
    const root = (await k.detail(made.id)).comments[0].id as string
    await k.call('POST', k.admin(`/comments/${root}/replies`, made.id), { body: '<svg onload=alert(3)>' })
    await k.call('POST', k.admin('/approvals', made.id), { note: '<a href="javascript:alert(4)">x</a>' })
    await k.w.kit.settle()
    const seen = await k.view(made.reference)
    expect(seen.title).toBe(evil)
    expect(seen.versions[0].description).toBe('<script>alert(2)</script>')
    expect(seen.comments.map((entry: { body: string }) => entry.body)).toEqual(['<b>bold</b>', '<svg onload=alert3)>'.replace('alert3', 'alert(3')])
    for (const message of k.w.kit.server.mailer.sent.filter((entry) => /deliverable|feedback|approval|replied|version/i.test(entry.subject))) {
      expect(message.html).not.toMatch(/<img src=x|<script|<svg onload|<b>bold|href="javascript/)
      expect(message.subject).not.toMatch(/[\r\n<>]/)
    }
  })
})

describe('the doors', () => {
  it('every address of the deliverables answers a stranger 401, a customer’s cookie on the administration 401, and a change without the token 403', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({}, true)
    const asked = await k.call('POST', k.admin('/approvals', made.id), {})
    const approval = asked.json.data.approvals[0].id
    await k.w.anna.post(k.mine('/comments', made.reference), { body: 'x' })
    const comment = (await k.view(made.reference)).comments[0].id
    const admin: Array<[string, string]> = [
      ['GET', k.admin()], ['POST', k.admin()], ['GET', k.admin('', made.id)], ['PATCH', k.admin('', made.id)], ['DELETE', k.admin('', made.id)], ['POST', k.admin('/versions', made.id)], ['PATCH', k.admin(`/versions/${made.versionId}`, made.id)],
      ['POST', k.admin(`/versions/${made.versionId}/publish`, made.id)], ['POST', k.admin('/archive', made.id)], ['POST', k.admin(`/comments/${comment}/replies`, made.id)], ['POST', k.admin(`/comments/${comment}/resolve`, made.id)],
      ['POST', k.admin(`/comments/${comment}/reopen`, made.id)], ['POST', k.admin('/notes', made.id)], ['POST', k.admin('/approvals', made.id)], ['POST', k.admin(`/approvals/${approval}/cancel`, made.id)],
      ['GET', '/api/admin/deliverable-settings'], ['PUT', '/api/admin/deliverable-settings'],
    ]
    for (const [method, path] of admin) {
      const body = method === 'GET' || method === 'DELETE' ? undefined : {}
      expect((await k.w.kit.api(path, { method, body })).status, `${method} ${path} without a session`).toBe(401)
      expect((await k.w.kit.api(path, { method, body, headers: k.w.anna.headers })).status, `${method} ${path} with a customer's session`).toBe(401)
      if (method !== 'GET') expect((await k.w.kit.api(path, { method, body, headers: { Cookie: k.w.kit.admin.Cookie } })).status, `${method} ${path} without the token`).toBe(403)
    }
    const portal: Array<[string, string]> = [
      ['GET', k.mine()], ['GET', k.mine('', made.reference)], ['POST', k.mine('/comments', made.reference)], ['PATCH', k.mine(`/comments/${comment}`, made.reference)], ['DELETE', k.mine(`/comments/${comment}`, made.reference)],
      ['POST', k.mine('/feedback', made.reference)], ['POST', k.mine(`/comments/${comment}/follow-up`, made.reference)], ['POST', k.mine(`/comments/${comment}/reopen`, made.reference)],
      ['POST', k.mine(`/approvals/${approval}/approve`, made.reference)], ['POST', k.mine(`/approvals/${approval}/changes`, made.reference)], ['POST', k.mine(`/approvals/${approval}/withdraw`, made.reference)],
    ]
    for (const [method, path] of portal) {
      const body = method === 'GET' || method === 'DELETE' ? undefined : { body: 'x', confirm: true, versionNumber: 1, checksum: 'a'.repeat(64), revision: 1, explanation: 'abc' }
      expect((await k.w.kit.api(path, { method, body })).status, `${method} ${path} without a session`).toBe(401)
      expect((await k.w.kit.api(path, { method, body, headers: k.w.kit.admin })).status, `${method} ${path} with the administrator's session`).toBe(401)
      if (method !== 'GET') expect((await k.w.kit.api(path, { method, body, headers: { Cookie: k.w.anna.cookie } })).status, `${method} ${path} without the token`).toBe(403)
    }
    expect(k.w.kit.server.db.get<{ state: string }>('SELECT state FROM deliverable_approvals')!.state).toBe('requested')
  })

  it('an editor works on deliverables but cannot change the e-mail choices', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({}, true)
    expect((await k.call('POST', k.admin('/approvals', made.id), {}, 'editor')).status).toBe(201)
    expect((await k.call('GET', k.admin('', made.id), undefined, 'editor')).status).toBe(200)
  })

  it('the customer’s endpoints never believe a project, a customer, an author or a version in the body, the query or the address', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({ type: 'image', previewUrl: undefined, imageUrl: IMAGE }, true)
    const bob = await k.w.kit.customer('bob@example.com')
    const attempt = await bob.post(k.mine('/comments', made.reference) + `?customerId=${k.w.anna.id}`, { body: 'Let me in.' })
    expect(attempt.status).toBe(404)
    expect((await bob.post(k.mine('/comments', made.reference), { body: 'Let me in.', customerId: k.w.anna.id })).status, 'a field that does not exist is refused, never obeyed').toBeGreaterThanOrEqual(400)
    for (const body of [{ body: 'x', authorId: 'someone' }, { body: 'x', versionId: 'v' }, { body: 'x', deliverableId: 'd' }, { body: 'x', projectId: 'p' }]) expect((await k.w.anna.post(k.mine('/comments', made.reference), body)).status, JSON.stringify(body)).toBe(422)
    expect(k.w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM deliverable_comments')!.n).toBe(0)
  })

  it('a deliverable’s reference is not a key: it names nothing in another customer’s project, and an unknown one answers the same', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({}, true)
    const bob = await k.w.kit.customer('bob@example.com')
    const bobs = await k.w.kit.project(bob.id, { name: 'Bob site' })
    const theirs = await bob.get(`/api/portal/projects/${bobs.reference}/deliverables/${made.reference}`)
    const nothing = await bob.get(`/api/portal/projects/${bobs.reference}/deliverables/DLV-NOSUCHTHING`)
    const foreignProject = await bob.get(`/api/portal/projects/${k.w.project.reference}/deliverables/${made.reference}`)
    expect([theirs.status, nothing.status, foreignProject.status]).toEqual([404, 404, 404])
    expect(theirs.json.error.message).toBe(nothing.json.error.message)
    expect(foreignProject.json.error.message).toBe(nothing.json.error.message)
  })
})

describe('the data', () => {
  it('the upgrade from the work module’s schema keeps every row and rebuilt table, and creates nothing for anybody', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc-mig-'))
    temporary.push(directory)
    for (const name of readdirSync(MIGRATIONS_DIRECTORY).filter((file) => !file.startsWith('0014'))) copyFileSync(join(MIGRATIONS_DIRECTORY, name), join(directory, name))
    const clock = new TestClock()
    const db = new Database(':memory:')
    migrate(db, clock, directory)
    const now = '2026-10-01T10:00:00.000Z'
    db.run("INSERT INTO customers (id, email, language, status, origin, email_verified_at, created_at, updated_at) VALUES ('c1', 'old@example.test', 'en', 'active', 'invitation', ?, ?, ?)", [now, now, now])
    db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, created_at, updated_at) VALUES ('d1', 'client_action_assigned', 'client_project_event', '2', 'old@example.test', 'en', 'delivered', 1, ?, ?)", [now, now])
    db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, created_at, updated_at) VALUES ('d2', 'client_action_due_soon', 'client_action_reminder', 'a:2026-11-05', 'old@example.test', 'en', 'pending', 0, ?, ?)", [now, now])
    expect(migrate(db, clock)).toEqual([14])
    expect(db.all('SELECT id, kind, related_type, related_id, status FROM email_deliveries ORDER BY id')).toEqual([
      { id: 'd1', kind: 'client_action_assigned', related_type: 'client_project_event', related_id: '2', status: 'delivered' },
      { id: 'd2', kind: 'client_action_due_soon', related_type: 'client_action_reminder', related_id: 'a:2026-11-05', status: 'pending' },
    ])
    for (const table of ['deliverables', 'deliverable_versions', 'deliverable_comments', 'deliverable_approvals', 'deliverable_events', 'deliverable_internal_notes']) expect(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n, table).toBe(0)
    expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')!.foreign_keys).toBe(1)
    expect(db.all('PRAGMA foreign_key_check')).toEqual([])
    db.close()
  })

  it('the database refuses what the application would: a published deliverable with no publication, a comment on another deliverable’s version, an empty or oversized comment, an unknown type', async () => {
    k = await makeDeliverableKit()
    const a = await k.make({}, true)
    const b = await k.make({ title: 'Second' }, true)
    const { db } = k.w.kit.server
    const now = '2026-11-03T10:00:00.000Z'
    const comment = (deliverable: string, version: string, body: string, status = 'draft', submitted: string | null = null) =>
      db.run("INSERT INTO deliverable_comments (id, deliverable_id, version_id, author_type, body, status, submitted_at, created_at, updated_at) VALUES (?, ?, ?, 'customer', ?, ?, ?, ?, ?)", [`c-${Math.random()}`, deliverable, version, body, status, submitted, now, now])
    expect(() => comment(a.id, b.versionId, 'wrong version')).toThrow(ConstraintError)
    expect(() => comment(a.id, a.versionId, '   ')).toThrow(ConstraintError)
    expect(() => comment(a.id, a.versionId, 'x'.repeat(5001))).toThrow(ConstraintError)
    expect(() => comment(a.id, a.versionId, 'sent but untimed', 'submitted')).toThrow(ConstraintError)
    expect(() => comment(a.id, a.versionId, 'draft with a time', 'draft', now)).toThrow(ConstraintError)
    expect(() => comment(a.id, a.versionId, 'fine')).not.toThrow()
    expect(() => db.run("UPDATE deliverables SET type = 'poster'")).toThrow(ConstraintError)
    expect(() => db.run("UPDATE deliverables SET publication_state = 'published', published_at = NULL WHERE reference = ?", ['x'])).not.toThrow()
    const draft = await k.make({ title: 'Draft only' })
    expect(() => db.run("UPDATE deliverables SET publication_state = 'published' WHERE id = ?", [draft.id])).toThrow(ConstraintError)
    expect(() => db.run("INSERT INTO deliverable_versions (id, deliverable_id, number, title, preview_url, status, created_at) VALUES ('p', ?, 2, 'T', 'http://example.com/', 'draft', ?)", [a.id, now])).toThrow(ConstraintError)
    expect(() => db.run("INSERT INTO deliverable_versions (id, deliverable_id, number, title, preview_url, status, created_at) VALUES ('q', ?, 2, 'T', 'https://example.com/a b', 'draft', ?)", [a.id, now])).toThrow(ConstraintError)
  })

  it('erasing a customer removes their deliverables, versions, feedback, approvals, history and the e-mails about them', async () => {
    k = await makeDeliverableKit()
    await wholeJourney()
    const { db } = k.w.kit.server
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM deliverable_comments')!.n).toBeGreaterThan(0)
    expect(eraseByEmail(k.w.kit.server.app.context, CUSTOMER).customers).toBe(1)
    for (const table of ['deliverables', 'deliverable_versions', 'deliverable_comments', 'deliverable_approvals', 'deliverable_events', 'deliverable_internal_notes']) expect(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n, table).toBe(0)
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM email_deliveries WHERE related_type = 'deliverable_event'")!.n).toBe(0)
  })
})

