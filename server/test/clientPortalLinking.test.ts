import { afterEach, describe, expect, it } from 'vitest'
import { findCustomerByEmail } from '../src/modules/customers/accounts.ts'
import { claimable, unlinkedWithAddress } from '../src/modules/customers/linking.ts'
import { makePortalKit, type PortalKit } from './portalKit.ts'

/**
 * Which records are whose (PROMPT 25, docs/client-portal/ACCOUNT_LINKING.md): nothing is linked because an address looks alike. A link is the owner's
 * decision or the customer's own claim of a record that carries the address they have PROVEN, only while the owner allows it, and never for an address nobody
 * has proven.
 */

let kit: PortalKit
afterEach(async () => {
  await kit?.close()
})

const links = () => kit.server.db.all<{ customer_id: string; method: string; quote_request_id: string | null }>('SELECT customer_id, method, quote_request_id FROM customer_links')

describe('nothing is linked by itself', () => {
  it('a request made with the same address, before or after the account exists, belongs to no one until it is linked', async () => {
    kit = await makePortalKit({ selfLinking: true })
    const before = await kit.request('anna@example.com')
    const anna = await kit.customer('anna@example.com')
    const after = await kit.request('anna@example.com', { description: 'A second, different request: a small web shop for the garage.' })
    expect(links()).toEqual([])
    expect((await anna.get('/api/portal/requests')).json.data).toEqual([])
    expect((await anna.get(`/api/portal/requests/${before.reference}`)).status).toBe(404)
    expect((await anna.get(`/api/portal/requests/${after.reference}`)).status).toBe(404)
    // They are offered as things that could be claimed, never shown.
    const found = (await anna.get('/api/portal/link-candidates')).json.data.map((entry: { reference: string }) => entry.reference).sort()
    expect(found).toEqual([before.reference, after.reference].sort())
  })

  it('an accepted quote does not make a project, and neither does an account', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const accepted = await kit.accepted('anna@example.com')
    await kit.link(anna.id, 'quote_request', accepted.id)
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM client_projects')).toEqual({ n: 0 })
    expect((await anna.get('/api/portal/projects')).json.data).toEqual([])
    const detail = (await anna.get(`/api/portal/requests/${accepted.reference}`)).json.data
    expect(detail.quotes[0].state).toBe('accepted')
    expect(detail.projects).toEqual([])
  })
})

describe('claiming a record by the verified address', () => {
  it('is switched off by default: no candidates, and a claim is refused', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const stray = await kit.request('anna@example.com')
    expect((await anna.get('/api/portal/link-candidates')).json.data).toEqual([])
    const claim = await anna.post('/api/portal/link-candidates/claim', { ids: [stray.id] })
    expect(claim.status).toBe(403)
    expect(links()).toEqual([])
    expect((await anna.get('/api/portal/session')).json.data.features.selfLinking).toBe(false)
  })

  it('when the owner allows it, links what the server finds for the verified address, in any letter case, and records it', async () => {
    kit = await makePortalKit({ selfLinking: true })
    const anna = await kit.customer('anna@example.com')
    const first = await kit.request('Anna@EXAMPLE.com')
    const second = await kit.request('anna@example.com', { description: 'A second, different request: a small web shop for the garage.' })
    const claimed = await anna.post('/api/portal/link-candidates/claim', {})
    expect(claimed.json.data.linked).toBe(2)
    expect(links().map((link) => link.method)).toEqual(['verified_email', 'verified_email'])
    for (const reference of [first.reference, second.reference]) expect((await anna.get(`/api/portal/requests/${reference}`)).status).toBe(200)
    const history = kit.server.db.all<{ event_type: string; actor_type: string; detail: string }>("SELECT event_type, actor_type, detail FROM customer_audit_events WHERE event_type = 'record_linked'")
    expect(history).toHaveLength(2)
    expect(history[0]).toMatchObject({ actor_type: 'customer' })
    expect(history[0].detail).toContain('verified_email')
    // A second claim finds nothing more.
    expect((await anna.post('/api/portal/link-candidates/claim', {})).json.data.linked).toBe(0)
  })

  it('never for an address nobody has proven: an invited account has no candidates, and no session to ask with', async () => {
    kit = await makePortalKit({ selfLinking: true })
    await kit.request('anna@example.com')
    await kit.invite('anna@example.com')
    const invited = findCustomerByEmail(kit.server.app.context, 'anna@example.com')!
    expect(invited.status).toBe('invited')
    expect(claimable(kit.server.app.context, invited)).toEqual([])
    // The owner, who sees the same address on a record, may still link it on purpose; the account is not claimed to be verified.
    const detail = await kit.api(`/api/admin/clients/${invited.id}`, { headers: { Cookie: kit.admin.Cookie } })
    expect(detail.json.data.candidates).toHaveLength(1)
    expect(detail.json.data.customer.verifiedAt).toBeNull()
  })

  it('a new address that has been asked for but not proven is not used: only the proven one counts', async () => {
    kit = await makePortalKit({ selfLinking: true })
    const anna = await kit.customer('anna@example.com')
    const theirs = await kit.request('new.address@example.com')
    await anna.post('/api/portal/profile/email', { email: 'new.address@example.com' })
    await kit.settle()
    expect((await anna.get('/api/portal/link-candidates')).json.data).toEqual([])
    expect((await anna.post('/api/portal/link-candidates/claim', { ids: [theirs.id] })).json.data.linked).toBe(0)
    // Once the new address is proven, it is the one that counts (and the old one no longer is).
    const old = await kit.request('anna@example.com')
    const opened = await kit.open(kit.linkTo('new.address@example.com').token)
    const fresh = kit.as((opened.headers.get('set-cookie') ?? '').split(';')[0], opened.json.data.csrfToken)
    const found = (await fresh.get('/api/portal/link-candidates')).json.data.map((entry: { reference: string }) => entry.reference)
    expect(found).toEqual([theirs.reference])
    expect(found).not.toContain(old.reference)
  })

  it('a switched-off account has nothing to claim', async () => {
    kit = await makePortalKit({ selfLinking: true })
    const anna = await kit.customer('anna@example.com')
    await kit.request('anna@example.com')
    await kit.api(`/api/admin/clients/${anna.id}/actions`, { body: { action: 'disable' }, headers: kit.admin })
    const account = findCustomerByEmail(kit.server.app.context, 'anna@example.com')!
    expect(claimable(kit.server.app.context, account)).toEqual([])
    expect((await anna.post('/api/portal/link-candidates/claim', {})).status).toBe(401)
  })

  it('a record claimed by one account cannot be claimed by another', async () => {
    kit = await makePortalKit({ selfLinking: true })
    const anna = await kit.customer('anna@example.com')
    const stray = await kit.request('anna@example.com')
    await anna.post('/api/portal/link-candidates/claim', {})
    expect(unlinkedWithAddress(kit.server.app.context, 'anna@example.com')).toEqual([])
    const bela = await kit.customer('bela@example.com')
    expect((await bela.post('/api/portal/link-candidates/claim', { ids: [stray.id] })).json.data.linked).toBe(0)
    expect(links()).toHaveLength(1)
  })
})

describe('the owner linking on purpose', () => {
  it('links a record whatever its address, once, and says so in the history', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const other = await kit.request('someone.else@example.com')
    const id = await kit.link(anna.id, 'quote_request', other.id)
    expect(id).toBeTruthy()
    expect(links()).toEqual([{ customer_id: anna.id, method: 'admin', quote_request_id: other.id }])
    expect((await anna.get(`/api/portal/requests/${other.reference}`)).status).toBe(200)
    const history = (await kit.api(`/api/admin/clients/${anna.id}`, { headers: { Cookie: kit.admin.Cookie } })).json.data.audit
    expect(history.find((entry: { type: string }) => entry.type === 'record_linked')).toMatchObject({ actor: 'admin', adminEmail: 'owner@site.test', detail: `quote_request:${other.reference}` })
  })

  it('refuses a record that does not exist, a bad type and a second link', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const bela = await kit.customer('bela@example.com')
    const request = await kit.request('anna@example.com')
    expect((await kit.api(`/api/admin/clients/${anna.id}/links`, { body: { type: 'quote_request', recordId: 'nope' }, headers: kit.admin })).status).toBe(404)
    expect((await kit.api(`/api/admin/clients/${anna.id}/links`, { body: { type: 'project', recordId: request.id }, headers: kit.admin })).status).toBe(422)
    expect((await kit.api(`/api/admin/clients/${anna.id}/links`, { body: { type: 'quote_request' }, headers: kit.admin })).status).toBe(422)
    await kit.link(anna.id, 'quote_request', request.id)
    expect((await kit.api(`/api/admin/clients/${bela.id}/links`, { body: { type: 'quote_request', recordId: request.id }, headers: kit.admin })).status).toBe(409)
    expect((await kit.api('/api/admin/clients/not-a-customer/links', { body: { type: 'quote_request', recordId: request.id }, headers: kit.admin })).status).toBe(404)
  })

  it('only an administrator may link or unlink: an editor reads, and is refused', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const request = await kit.request('anna@example.com')
    const refused = await kit.api(`/api/admin/clients/${anna.id}/links`, { body: { type: 'quote_request', recordId: request.id }, headers: kit.editor })
    expect(refused.status).toBe(403)
    const id = await kit.link(anna.id, 'quote_request', request.id)
    expect((await kit.api(`/api/admin/clients/${anna.id}/links/${id}`, { method: 'DELETE', headers: kit.editor })).status).toBe(403)
    expect((await kit.api(`/api/admin/clients/${anna.id}`, { headers: { Cookie: kit.editor.Cookie } })).status).toBe(200)
    expect(links()).toHaveLength(1)
  })

  it('an unlinked record and an erased customer leave nothing dangling', async () => {
    kit = await makePortalKit()
    const anna = await kit.customer('anna@example.com')
    const request = await kit.request('anna@example.com')
    await kit.link(anna.id, 'quote_request', request.id)
    kit.server.db.run('DELETE FROM quote_requests WHERE id = ?', [request.id])
    expect(links()).toEqual([])
    const second = await kit.request('anna@example.com')
    await kit.link(anna.id, 'quote_request', second.id)
    kit.server.db.run('DELETE FROM customers WHERE id = ?', [anna.id])
    expect(links()).toEqual([])
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM quote_requests WHERE id = ?', [second.id])).toEqual({ n: 1 })
  })
})
