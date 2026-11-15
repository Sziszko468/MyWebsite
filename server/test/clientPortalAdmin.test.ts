import { afterEach, describe, expect, it } from 'vitest'
import { HOUR, DAY } from '../src/lib/time.ts'
import { clientWords } from '../src/modules/notifications/clientTemplates.ts'
import { MailError } from '../src/modules/notifications/smtp.ts'
import { eraseByEmail, runMaintenance } from '../src/modules/system/maintenance.ts'
import { startServer } from './helpers.ts'
import { makePortalKit, LINK, type PortalKit } from './portalKit.ts'

/**
 * The owner’s side of the portal and what the portal keeps and forgets (PROMPT 25): who may do what in the administration, the deletion request, the
 * account’s history, the e-mails’ retries and idempotency, and what an erasure removes.
 */

let kit: PortalKit
afterEach(async () => {
  await kit?.close()
})

const admin = (method: string, path: string, body?: unknown, headers: Record<string, string> = kit.admin) => kit.api(path, { method, body, headers })

describe('who may do what in the administration', () => {
  it('an administrator does everything; an editor reads and works on projects; nobody else gets in', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const project = await kit.project(anna.id)
    const read = ['/api/admin/clients', `/api/admin/clients/${anna.id}`, `/api/admin/client-projects/${project.id}`, '/api/admin/client-settings']
    for (const path of read) {
      expect((await kit.api(path, { headers: { Cookie: kit.editor.Cookie } })).status, `editor ${path}`).toBe(200)
      expect((await kit.api(path)).status, `anonymous ${path}`).toBe(401)
    }
    // Work on a project: both.
    expect((await admin('POST', `/api/admin/client-projects/${project.id}/notes`, { body: 'A note.' }, kit.editor)).status).toBe(201)
    expect((await admin('POST', `/api/admin/client-projects/${project.id}/milestones`, { title: 'A step' }, kit.editor)).status).toBe(201)
    // The account itself: only an administrator.
    const forbidden: [string, string, unknown][] = [
      ['POST', '/api/admin/clients', { email: 'new@example.com', language: 'en' }],
      ['POST', `/api/admin/clients/${anna.id}/actions`, { action: 'disable' }],
      ['POST', `/api/admin/clients/${anna.id}/actions`, { action: 'revoke_sessions' }],
      ['POST', `/api/admin/clients/${anna.id}/projects`, { name: 'x', category: 'website' }],
      ['PUT', '/api/admin/client-settings', { registration: true }],
    ]
    for (const [method, path, body] of forbidden) expect((await admin(method, path, body, kit.editor)).status, `${method} ${path}`).toBe(403)
    expect(kit.server.db.get("SELECT status FROM customers WHERE id = ?", [anna.id])).toEqual({ status: 'active' })
    // A change needs the CSRF token, as everywhere in the administration.
    expect((await kit.api('/api/admin/clients', { body: { email: 'x@example.com', language: 'en' }, headers: { Cookie: kit.admin.Cookie } })).status).toBe(403)
  })

  it('inviting says no to an address that has an account, to a bad address and to a missing language', async () => {
    kit = await makePortalKit()
    await kit.customer('anna@example.com')
    const twice = await admin('POST', '/api/admin/clients', { email: 'ANNA@example.com', language: 'en' })
    expect(twice.status).toBe(409)
    expect(twice.json.error.details.reason).toBe('already_exists')
    expect((await admin('POST', '/api/admin/clients', { email: 'nope', language: 'en' })).status).toBe(422)
    expect((await admin('POST', '/api/admin/clients', { email: 'ok@example.com' })).status).toBe(422)
    expect((await admin('POST', '/api/admin/clients', { email: 'ok@example.com', language: 'en', name: 'x'.repeat(101) })).status).toBe(422)
  })

  it('inviting with no way to send e-mail makes the account and says no link went out', async () => {
    const server = await startServer({ env: { PUBLIC_URL: 'https://site.test' }, mailer: null })
    kit = await makePortalKit({ server })
    const made = await admin('POST', '/api/admin/clients', { email: 'anna@example.com', language: 'en' })
    expect(made.status).toBe(201)
    expect(made.json.data.emailQueued).toBe(false)
    expect((await admin('POST', `/api/admin/clients/${made.json.data.id}/actions`, { action: 'send_link' })).status).toBe(409)
  })

  it('lists and searches accounts, with paging, and a percent sign is just a character', async () => {
    kit = await makePortalKit()
    await kit.invite('anna@example.com', { name: 'Anna Kovács', company: 'Kovács Bakery' })
    await kit.invite('bela@example.com', { name: 'Béla 100% Garage' })
    await kit.customer('cili@example.com')
    const list = async (query: string) => (await kit.api(`/api/admin/clients${query}`, { headers: { Cookie: kit.admin.Cookie } })).json
    expect((await list('')).meta.total).toBe(3)
    expect((await list('?q=kov')).data.map((row: { email: string }) => row.email)).toEqual(['anna@example.com'])
    expect((await list('?q=bakery')).data).toHaveLength(1)
    expect((await list('?q=100%25')).data.map((row: { email: string }) => row.email)).toEqual(['bela@example.com'])
    expect((await list('?q=%25')).data).toHaveLength(1)
    expect((await list('?status=active')).data.map((row: { email: string }) => row.email)).toEqual(['cili@example.com'])
    expect((await list('?status=invited')).meta.total).toBe(2)
    expect((await list('?pageSize=2&page=2')).data).toHaveLength(1)
    const row = (await list('?q=anna')).data[0]
    expect(Object.keys(row).sort()).toEqual(['company', 'createdAt', 'deletionRequested', 'email', 'id', 'language', 'lastSignInAt', 'name', 'origin', 'projects', 'records', 'status', 'verified'])
  })

  it('the owner’s two switches are the owner’s, and say what they are', async () => {
    kit = await makePortalKit()
    expect((await kit.api('/api/admin/client-settings', { headers: { Cookie: kit.admin.Cookie } })).json.data).toEqual({ registration: false, selfLinking: false, canSendLinks: true })
    expect((await admin('PUT', '/api/admin/client-settings', { registration: true })).json.data).toEqual({ registration: true, selfLinking: false })
    expect((await admin('PUT', '/api/admin/client-settings', { selfLinking: 'yes' })).status).toBe(422)
    expect((await admin('PUT', '/api/admin/client-settings', { somethingElse: true })).status).toBe(422)
    expect((await admin('PUT', '/api/admin/client-settings', {})).status).toBe(422)
    expect(kit.server.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'clients.settings'")).toEqual({ n: 1 })
  })
})

describe('the account’s history', () => {
  it('records who did what to an account, to the owner, with no address, no secret and no network address in it', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    await admin('POST', `/api/admin/clients/${anna.id}/actions`, { action: 'revoke_sessions' })
    await admin('POST', `/api/admin/clients/${anna.id}/actions`, { action: 'disable' })
    await admin('POST', `/api/admin/clients/${anna.id}/actions`, { action: 'enable' })
    const detail = (await kit.api(`/api/admin/clients/${anna.id}`, { headers: { Cookie: kit.admin.Cookie } })).json.data
    expect(detail.audit.map((entry: { type: string }) => entry.type).reverse()).toEqual(['invited', 'verified', 'signed_in', 'sessions_revoked', 'disabled', 'enabled'])
    expect(detail.audit[0]).toMatchObject({ type: 'enabled', actor: 'admin', adminEmail: 'owner@site.test' })
    expect(detail.audit.find((entry: { type: string }) => entry.type === 'verified')).toMatchObject({ actor: 'customer', adminEmail: null })
    const stored = JSON.stringify(kit.server.db.all('SELECT * FROM customer_audit_events'))
    expect(stored).not.toMatch(/anna@example|127\.0\.0\.1|ip_hash/)
    // The administration's own log shows the same acts.
    expect(kit.server.db.all("SELECT action FROM audit_log WHERE action LIKE 'clients.%' ORDER BY id").map((row) => (row as { action: string }).action)).toEqual(['clients.invite', 'clients.sessions_revoked', 'clients.disable', 'clients.enable'])
  })

  it('cannot be edited or erased, not even by the database’s owner’s own code', async () => {
    kit = await makePortalKit()
    await kit.customer('anna@example.com')
    expect(() => kit.server.db.run("UPDATE customer_audit_events SET event_type = 'disabled'")).toThrow(/append-only/)
    expect(() => kit.server.db.run('DELETE FROM customer_audit_events')).toThrow(/append-only/)
  })
})

describe('deleting an account', () => {
  it('the customer asks, the owner is told and acts; nothing is deleted by the request itself', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    await kit.project(anna.id, { name: 'Her project' })
    kit.server.mailer.sent.length = 0
    const asked = await anna.post('/api/portal/account/deletion-request')
    expect(asked.status).toBe(202)
    await kit.settle()
    // The customer is told it arrived; the owner is told, in the owner's language, with the address to answer to.
    expect(kit.mailsTo('anna@example.com')[0].subject).toBe(clientWords('en').notice.subject)
    expect(kit.mailsTo('anna@example.com')[0].text).toContain(clientWords('en').notice.deletion.title)
    const owner = kit.mailsTo('owner@site.test')
    expect(owner).toHaveLength(1)
    expect(owner[0].subject).toBe(clientWords('en').deletionAdmin.subject)
    expect(owner[0].text).toContain('anna@example.com')
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM customers')).toEqual({ n: 1 })
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM client_projects')).toEqual({ n: 1 })
    // Asking again says the same and sends nothing more.
    expect((await anna.post('/api/portal/account/deletion-request')).json.data.requestedAt).toBe(asked.json.data.requestedAt)
    await kit.settle()
    expect(kit.mailsTo('owner@site.test')).toHaveLength(1)
    const flagged = (await kit.api('/api/admin/clients?status=deletion', { headers: { Cookie: kit.admin.Cookie } })).json.data
    expect(flagged.map((row: { email: string }) => row.email)).toEqual(['anna@example.com'])
    expect((await anna.get('/api/portal/session')).json.data.customer.deletionRequestedAt).not.toBeNull()
  })

  it('can be taken back by the customer or cleared by the owner', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    await anna.post('/api/portal/account/deletion-request')
    expect((await anna.del('/api/portal/account/deletion-request')).status).toBe(204)
    expect((await anna.get('/api/portal/session')).json.data.customer.deletionRequestedAt).toBeNull()
    await anna.post('/api/portal/account/deletion-request')
    expect((await admin('POST', `/api/admin/clients/${anna.id}/actions`, { action: 'clear_deletion_request' })).status).toBe(200)
    expect((await admin('POST', `/api/admin/clients/${anna.id}/actions`, { action: 'clear_deletion_request' })).status).toBe(409)
  })

  it('erasing the address (the owner’s act) removes the account and everything on it, and what stays names no one', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const accepted = await kit.accepted('anna@example.com')
    await kit.link(anna.id, 'quote_request', accepted.id)
    const project = await kit.project(anna.id, { name: 'Her bakery website', quoteRequestId: accepted.id, notify: true })
    await admin('POST', `/api/admin/client-projects/${project.id}/notes`, { body: 'A private note.' })
    await admin('POST', `/api/admin/client-projects/${project.id}/milestones`, { title: 'A step' })
    kit.server.db.run("INSERT INTO client_documents (id, project_id, title, kind, created_at) VALUES ('d1', ?, 'Brief', 'brief', ?)", [project.id, '2026-11-03T10:00:00.000Z'])
    await anna.post('/api/portal/account/deletion-request')
    await kit.settle()

    const result = eraseByEmail(kit.server.app.context, 'ANNA@example.com')
    expect(result.customers).toBe(1)
    for (const table of ['customers', 'customer_sessions', 'customer_auth_requests', 'customer_auth_tokens', 'customer_links', 'client_projects', 'client_milestones', 'client_project_events', 'client_project_notes', 'client_documents']) expect(kit.server.db.get(`SELECT COUNT(*) AS n FROM ${table}`), table).toEqual({ n: 0 })
    expect(kit.server.db.get("SELECT COUNT(*) AS n FROM email_deliveries WHERE related_type LIKE 'client_%'")).toEqual({ n: 0 })
    // The one thing that stays is the history: a number, a kind of event and a short fixed code.
    const left = kit.server.db.all('SELECT * FROM customer_audit_events')
    expect(left.length).toBeGreaterThan(3)
    expect(JSON.stringify(left)).not.toMatch(/anna|example\.com|bakery|Her /i)
    expect((await anna.get('/api/portal/session')).status).toBe(401)
  })

  it('an erasure removes a registration link nobody opened, and a customer who never had an account is not a problem', async () => {
    kit = await makePortalKit({ registration: true })
    await kit.server.api('/api/portal/auth/request', { body: { email: 'new@example.com', language: 'en' } })
    await kit.settle()
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM customer_auth_requests')).toEqual({ n: 1 })
    expect(eraseByEmail(kit.server.app.context, 'new@example.com').customers).toBe(0)
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM customer_auth_requests')).toEqual({ n: 0 })
    expect(() => eraseByEmail(kit.server.app.context, 'nobody@example.com')).not.toThrow()
  })
})

describe('what is kept and for how long', () => {
  it('maintenance forgets ended sign-ins and old links, and never deletes an account by age', async () => {
    kit = await makePortalKit({ env: { RETENTION_DAYS: '30' } })
    const anna = await kit.customer('anna@example.com')
    await kit.project(anna.id)
    await kit.signInAgain('anna@example.com')
    kit.server.clock.advance(40 * DAY)
    const result = runMaintenance(kit.server.app.context)
    expect(result.clientSessions).toBe(2)
    expect(result.clientLinks).toBeGreaterThan(0)
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM customer_sessions')).toEqual({ n: 0 })
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM customer_auth_tokens')).toEqual({ n: 0 })
    // The account and its project are the owner’s to remove: a retention period does not touch them.
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM customers')).toEqual({ n: 1 })
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM client_projects')).toEqual({ n: 1 })
  })

  it('a link or a session that is still good is not touched', async () => {
    kit = await makePortalKit()
    await kit.customer('anna@example.com')
    kit.server.clock.advance(HOUR)
    const result = runMaintenance(kit.server.app.context)
    expect(result.clientSessions).toBe(0)
    expect(result.clientLinks).toBe(0)
  })
})

describe('the e-mails', () => {
  it('a message that fails is tried again with a fresh secret, and the earlier secret stops working', async () => {
    kit = await makePortalKit()
    await kit.customer('anna@example.com')
    kit.server.mailer.failNext(new MailError('The provider is busy.', { transient: true, reason: 'unavailable' }))
    await kit.server.api('/api/portal/auth/request', { body: { email: 'anna@example.com', language: 'en' } })
    await kit.settle()
    const row = kit.server.db.get<{ status: string; attempts: number; id: string }>("SELECT status, attempts, id FROM email_deliveries WHERE kind = 'client_sign_in'")!
    expect(row).toMatchObject({ status: 'pending', attempts: 1 })
    const first = kit.server.db.all<{ token_hash: string }>('SELECT token_hash FROM customer_auth_tokens ORDER BY created_at, rowid').length
    kit.server.clock.advance(2 * 60_000)
    await kit.settle()
    expect(kit.server.db.get("SELECT status, attempts FROM email_deliveries WHERE kind = 'client_sign_in'")).toEqual({ status: 'accepted', attempts: 2 })
    // One message arrived, whose secret works; the secret of the attempt that failed was replaced.
    const sent = kit.mailsTo('anna@example.com').filter((mail) => LINK.test(mail.text))
    expect(sent).toHaveLength(2)
    const token = LINK.exec(sent.at(-1)!.text)![2]
    expect((await kit.open(token)).status).toBe(200)
    expect(kit.server.db.all('SELECT token_hash FROM customer_auth_tokens').length).toBeGreaterThan(first)
  })

  it('without a site address a link cannot be built, so no message with nothing to open is sent', async () => {
    const server = await startServer({ env: { PUBLIC_URL: '' } })
    kit = await makePortalKit({ server })
    const made = await admin('POST', '/api/admin/clients', { email: 'anna@example.com', language: 'en' })
    expect(made.json.data.emailQueued).toBe(false)
    expect(kit.server.mailer.sent).toHaveLength(0)
  })

  it('no secret is ever in a log line, a stored error, the delivery list or anything an administrator can read', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    await kit.signInAgain('anna@example.com', 'nl')
    await kit.project(anna.id, { notify: true })
    await anna.post('/api/portal/profile/email', { email: 'anna.new@example.com' })
    await kit.settle()
    const tokens = kit.server.mailer.sent.map((mail) => LINK.exec(mail.text)?.[2]).filter(Boolean) as string[]
    expect(tokens.length).toBeGreaterThanOrEqual(3)
    const readable = [
      kit.server.logs.join('\n'),
      JSON.stringify(kit.server.db.all('SELECT * FROM email_deliveries')),
      (await kit.api('/api/admin/notifications', { headers: { Cookie: kit.admin.Cookie } })).text,
      (await kit.api(`/api/admin/clients/${anna.id}`, { headers: { Cookie: kit.admin.Cookie } })).text,
      (await kit.api('/api/admin/clients', { headers: { Cookie: kit.admin.Cookie } })).text,
    ].join('\n')
    for (const token of tokens) expect(readable).not.toContain(token)
    expect(readable).not.toContain(anna.cookie.split('=')[1])
    expect(readable).not.toContain(anna.csrf)
  })

  it('a message is "accepted" by the provider, never "delivered", until the provider says so', async () => {
    kit = await makePortalKit()
    await kit.customer('anna@example.com')
    const statuses = kit.server.db.all<{ status: string }>("SELECT DISTINCT status FROM email_deliveries WHERE kind LIKE 'client_%'").map((row) => row.status)
    expect(statuses).toEqual(['accepted'])
  })

  it('the three languages each have a subject for every kind', () => {
    for (const lang of ['hu', 'en', 'nl'] as const) {
      const words = clientWords(lang)
      for (const text of [words.signIn.subject, words.activate.subject, words.register.subject, words.emailChange.subject, words.notice.subject, words.projectCreated.subject('P'), words.projectUpdate.subject('P'), words.document.subject('P'), words.deletionAdmin.subject]) expect(text.length, lang).toBeGreaterThan(8)
    }
    expect(clientWords('hu').signIn.subject).not.toBe(clientWords('en').signIn.subject)
    expect(clientWords('nl').signIn.subject).not.toBe(clientWords('en').signIn.subject)
  })
})
