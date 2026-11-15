import { afterEach, describe, expect, it } from 'vitest'
import { ConstraintError } from '../src/http/errors.ts'
import { isEmbeddable, parsePreviewUrl } from '../src/modules/deliverables/preview.ts'
import { IMAGE, ORIGIN, SITE, makeDeliverableKit, type DeliverableKit } from './deliverableKit.ts'

/**
 * The deliverables and their versions (PROMPT 27): what the owner makes, edits and publishes, what is immutable, how numbers rise, what a customer can and cannot see, and which
 * addresses are accepted. Every call is the real endpoint; the database is read only to prove what a response was not asked to show.
 */

let k: DeliverableKit
afterEach(async () => {
  await k?.close()
})

describe('the addresses', () => {
  it('accepts a plain https address and writes it the way a browser reads it', () => {
    expect(parsePreviewUrl('https://Previews.Example.com/a b'.replace(' ', '%20'))).toMatchObject({ ok: true, value: { origin: 'https://previews.example.com', host: 'previews.example.com' } })
    expect(parsePreviewUrl('  https://example.com/x?y=1#z  ')).toMatchObject({ ok: true, value: { url: 'https://example.com/x?y=1#z' } })
  })

  it.each([
    ['http://example.com/', 'not_https'],
    ['javascript:alert(1)', 'not_https'],
    ['data:text/html,<script>alert(1)</script>', 'not_https'],
    ['file:///etc/passwd', 'not_https'],
    ['//example.com/x', 'not_https'],
    ['example.com/x', 'invalid'],
    ['/relative/path', 'invalid'],
    ['', 'invalid'],
    ['https://user:pass@example.com/', 'credentials'],
    ['https://example.com:8443/', 'port'],
    ['https://localhost/', 'host'],
    ['https://127.0.0.1/', 'host'],
    ['https://[::1]/', 'host'],
    ['https://10.0.0.5/', 'host'],
    ['https://intranet.local/', 'host'],
    ['https://printer.internal/', 'host'],
    ['https://nodots/', 'host'],
    ['https://exa mple.com/', 'invalid'],
    ['https://example.com/\nSet-Cookie: x=1', 'invalid'],
  ])('refuses %s', (raw, problem) => {
    expect(parsePreviewUrl(raw)).toEqual({ ok: false, problem })
  })

  it('stores markup in an address percent-encoded, never as markup', () => {
    expect(parsePreviewUrl('https://example.com/<script>alert(1)</script>')).toMatchObject({ ok: true, value: { url: 'https://example.com/%3Cscript%3Ealert(1)%3C/script%3E' } })
  })

  it('refuses an address that is too long', () => {
    expect(parsePreviewUrl(`https://example.com/${'a'.repeat(2000)}`)).toEqual({ ok: false, problem: 'too_long' })
  })

  it('embeds only an exact origin on the owner’s list: not a subdomain, not another scheme, not a look-alike', () => {
    expect(isEmbeddable(`${ORIGIN}/a`, [ORIGIN])).toBe(true)
    for (const url of ['https://sub.previews.example.test/a', 'https://previews.example.test.evil.test/a', 'https://evil.test/?https://previews.example.test', 'http://previews.example.test/a', null]) expect(isEmbeddable(url, [ORIGIN]), String(url)).toBe(false)
    expect(isEmbeddable(`${ORIGIN}/a`, [])).toBe(false)
  })
})

describe('making a deliverable', () => {
  it('starts as a draft with a first draft version, visible only to the owner; nothing exists for the customer', async () => {
    k = await makeDeliverableKit()
    const made = await k.make()
    expect(made.reference).toMatch(/^DLV-[A-Z0-9]{8}$/)
    const detail = await k.detail(made.id)
    expect(detail.deliverable).toMatchObject({ publication_state: 'draft', review_state: 'not_submitted', current_version: 1, revision: 1 })
    expect(detail.versions).toHaveLength(1)
    expect(detail.versions[0]).toMatchObject({ number: 1, status: 'draft', checksum: null, published_at: null, preview_url: `${SITE}` })
    expect((await k.w.anna.get(k.mine())).json.data).toEqual([])
    expect((await k.w.anna.get(k.mine('', made.reference))).status).toBe(404)
  })

  it('validates what it is given, naming the fields, and creates nothing when it refuses', async () => {
    k = await makeDeliverableKit()
    const bad = await k.call('POST', k.admin(), { title: '  ', type: 'poster', previewUrl: 'http://example.com' })
    expect(bad.status).toBe(422)
    expect(Object.keys(bad.json.error.details.fields ?? bad.json.error.details).sort()).toEqual(['title', 'type'])
    for (const body of [{ previewUrl: 'javascript:alert(1)' }, { previewUrl: 'https://localhost/' }, { imageUrl: 'https://elsewhere.test/a.png' }, { imageUrl: `${ORIGIN}/a.png`.replace('https', 'http') }, { title: 'x'.repeat(161) }, { customerDescription: 'x'.repeat(4001) }]) {
      expect((await k.call('POST', k.admin(), { title: 'A', type: 'design', ...body })).status, JSON.stringify(body).slice(0, 60)).toBe(422)
    }
    expect(k.w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM deliverables')!.n).toBe(0)
  })

  it('refuses a field that does not exist (mass assignment): no id, state, number, checksum, project or author can be set', async () => {
    k = await makeDeliverableKit()
    for (const field of ['id', 'reference', 'project_id', 'projectId', 'publication_state', 'review_state', 'current_version', 'revision', 'created_by', 'checksum', 'published_at', 'status']) {
      expect((await k.call('POST', k.admin(), { title: 'A', type: 'design', [field]: 'x' })).status, field).toBe(422)
    }
    const { id } = await k.make()
    for (const field of ['review_state', 'current_version', 'publication_state', 'projectId', 'reference', 'checksum']) expect((await k.call('PATCH', k.admin('', id), { [field]: 'x' })).status, field).toBe(422)
  })

  it('a task must belong to the same project; an unknown or foreign task is refused', async () => {
    k = await makeDeliverableKit()
    const other = await k.w.kit.project(k.w.anna.id, { name: 'Other' })
    const foreign = await k.w.task({ title: 'Foreign' }, other)
    const mine = await k.w.task({ title: 'Mine', customerVisible: true })
    expect((await k.call('POST', k.admin(), { title: 'A', type: 'design', versionDescription: 'x', taskId: foreign.id })).status).toBe(422)
    expect((await k.call('POST', k.admin(), { title: 'A', type: 'design', versionDescription: 'x', taskId: 'ghost' })).status).toBe(422)
    const ok = await k.call('POST', k.admin(), { title: 'A', type: 'design', versionDescription: 'x', taskId: mine.id })
    expect(ok.status).toBe(201)
    expect(() => k.w.kit.server.db.run('UPDATE deliverables SET task_id = ? WHERE id = ?', [foreign.id, ok.json.data.id])).toThrow(ConstraintError)
  })

  it('a deliverable of another project is "not found" for every verb', async () => {
    k = await makeDeliverableKit()
    const other = await k.w.kit.project(k.w.anna.id, { name: 'Other' })
    const { id, versionId } = await k.make()
    for (const [method, suffix, body] of [
      ['GET', '', undefined], ['PATCH', '', { title: 'B' }], ['DELETE', '', undefined], ['POST', '/versions', {}], ['PATCH', `/versions/${versionId}`, { title: 'B' }],
      ['POST', `/versions/${versionId}/publish`, {}], ['POST', '/archive', {}], ['POST', '/notes', { body: 'hello' }], ['POST', '/approvals', {}],
    ] as const) {
      expect((await k.call(method, k.w.at(`/deliverables/${id}${suffix}`, other), body)).status, `${method} ${suffix}`).toBe(404)
    }
  })

  it('refuses a deliverable in a finished project', async () => {
    k = await makeDeliverableKit()
    await k.w.call('POST', k.w.at('/status'), { status: 'cancelled' })
    expect((await k.call('POST', k.admin(), { title: 'A', type: 'design', versionDescription: 'x' })).json.error.details.reason).toBe('project_closed')
  })
})

describe('publishing', () => {
  it('needs what the type needs: a website preview an address, an image a picture on the list, the rest some words or an address', async () => {
    k = await makeDeliverableKit()
    const site = await k.make({ title: 'S', type: 'website_preview', previewUrl: undefined })
    const refused = await k.call('POST', k.admin(`/versions/${(await k.detail(site.id)).versions[0].id}/publish`, site.id))
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.reason).toBe('version_incomplete')
    const image = await k.make({ title: 'I', type: 'image', previewUrl: undefined, imageUrl: undefined })
    expect((await k.call('POST', k.admin(`/versions/${image.versionId}/publish`, image.id))).json.error.details.reason).toBe('version_incomplete')
    const empty = await k.make({ title: 'E', type: 'design', versionDescription: '', previewUrl: undefined })
    expect((await k.call('POST', k.admin(`/versions/${empty.versionId}/publish`, empty.id))).status).toBe(409)
    const words = await k.make({ title: 'W', type: 'design', previewUrl: undefined, versionDescription: 'A description is enough for a design.' })
    expect((await k.call('POST', k.admin(`/versions/${words.versionId}/publish`, words.id))).status).toBe(200)
  })

  it('makes the version immutable and the deliverable visible: the customer sees it, the fingerprint is the SHA-256 of what was published', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({}, true)
    const detail = await k.detail(made.id)
    expect(detail.deliverable).toMatchObject({ publication_state: 'published', current_version: 1 })
    const version = detail.versions[0]
    expect(version).toMatchObject({ status: 'published', number: 1 })
    expect(version.checksum).toMatch(/^[0-9a-f]{64}$/)
    expect(version.published_at).not.toBeNull()
    const seen = await k.view(made.reference)
    expect(seen).toMatchObject({ reference: made.reference, title: 'Home page design', currentVersion: 1, reviewState: 'not_submitted', archived: false })
    expect(seen.versions[0]).toMatchObject({ number: 1, current: true, checksum: version.checksum, previewUrl: SITE, embeddable: true })
    expect((await k.w.anna.get(k.mine())).json.data.map((entry: { reference: string }) => entry.reference)).toEqual([made.reference])
  })

  it('a published version cannot be edited through the API, and the database refuses every change to it', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({}, true)
    const refused = await k.call('PATCH', k.admin(`/versions/${made.versionId}`, made.id), { title: 'Sneaky' })
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.reason).toBe('version_published')
    expect((await k.call('POST', k.admin(`/versions/${made.versionId}/publish`, made.id))).json.error.details.reason).toBe('version_published')
    const { db } = k.w.kit.server
    for (const sql of [
      "UPDATE deliverable_versions SET title = 'x'", "UPDATE deliverable_versions SET customer_description = 'x'", "UPDATE deliverable_versions SET preview_url = 'https://evil.test/'", "UPDATE deliverable_versions SET image_url = 'https://evil.test/x.png'",
      "UPDATE deliverable_versions SET checksum = '" + 'a'.repeat(64) + "'", 'UPDATE deliverable_versions SET number = 7', "UPDATE deliverable_versions SET status = 'draft', published_at = NULL, checksum = NULL", "UPDATE deliverable_versions SET published_at = '2020-01-01T00:00:00.000Z'",
    ]) expect(() => db.run(sql), sql).toThrow(ConstraintError)
    expect(db.get<{ title: string }>('SELECT title FROM deliverable_versions')!.title).toBe('Home page design')
  })

  it('a draft can be edited until it is published; a change of address is checked again', async () => {
    k = await makeDeliverableKit()
    const made = await k.make()
    const edited = await k.call('PATCH', k.admin(`/versions/${made.versionId}`, made.id), { title: 'Better title', customerDescription: 'Better words.', previewUrl: `${ORIGIN}/other`, imageUrl: IMAGE })
    expect(edited.status, edited.text).toBe(200)
    expect(edited.json.data.versions[0]).toMatchObject({ title: 'Better title', preview_url: `${ORIGIN}/other`, image_url: IMAGE })
    expect((await k.call('PATCH', k.admin(`/versions/${made.versionId}`, made.id), { previewUrl: 'ftp://x.test/' })).status).toBe(422)
    expect((await k.call('PATCH', k.admin(`/versions/${made.versionId}`, made.id), { imageUrl: 'https://elsewhere.test/a.png' })).status).toBe(422)
    const cleared = await k.call('PATCH', k.admin(`/versions/${made.versionId}`, made.id), { previewUrl: null, imageUrl: null })
    expect(cleared.json.data.versions[0]).toMatchObject({ preview_url: null, image_url: null })
  })
})

describe('versions', () => {
  it('rise by one, never overwrite an older one, and the new draft starts from the last version’s content', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({}, true)
    const created = await k.call('POST', k.admin('/versions', made.id))
    expect(created.status).toBe(201)
    const draft = created.json.data.versions[0]
    expect(draft).toMatchObject({ number: 2, status: 'draft', title: 'Home page design', preview_url: SITE })
    // The deliverable still shows version 1 as current until 2 is published, and the customer sees only version 1.
    expect(created.json.data.deliverable.current_version).toBe(1)
    expect((await k.view(made.reference)).versions.map((v: { number: number }) => v.number)).toEqual([1])
    await k.call('PATCH', k.admin(`/versions/${draft.id}`, made.id), { title: 'Second look', customerDescription: 'Now with a dark theme.' })
    await k.publish(made.id, draft.id)
    const detail = await k.detail(made.id)
    expect(detail.versions.map((v: { number: number; status: string }) => [v.number, v.status])).toEqual([[2, 'published'], [1, 'superseded']])
    expect(detail.versions[1]).toMatchObject({ title: 'Home page design', customer_description: 'The first look of the home page.' })
    const seen = await k.view(made.reference)
    expect(seen.currentVersion).toBe(2)
    expect(seen.versions.map((v: { number: number; current: boolean }) => [v.number, v.current])).toEqual([[2, true], [1, false]])
  })

  it('only one draft at a time, and only after the last version was published', async () => {
    k = await makeDeliverableKit()
    const made = await k.make()
    expect((await k.call('POST', k.admin('/versions', made.id))).json.error.details.reason).toBe('draft_exists')
    await k.publish(made.id, made.versionId)
    expect((await k.call('POST', k.admin('/versions', made.id))).status).toBe(201)
    expect((await k.call('POST', k.admin('/versions', made.id))).json.error.details.reason).toBe('draft_exists')
  })

  it('the database numbers versions by one: a gap, a repeat or a second draft is refused', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({}, true)
    const { db } = k.w.kit.server
    const insert = (number: number, status = 'draft') => db.run("INSERT INTO deliverable_versions (id, deliverable_id, number, title, status, created_at) VALUES (?, ?, ?, 'T', ?, '2026-11-03T10:00:00.000Z')", [`v-${Math.random()}`, made.id, number, status])
    expect(() => insert(1)).toThrow(ConstraintError)
    expect(() => insert(3)).toThrow(ConstraintError)
    insert(2)
    expect(() => insert(3)).toThrow(ConstraintError)
  })

  it('the type of a deliverable cannot change once it was published; a stale edit is refused', async () => {
    k = await makeDeliverableKit()
    const draft = await k.make()
    expect((await k.call('PATCH', k.admin('', draft.id), { type: 'design' })).status).toBe(200)
    await k.publish(draft.id, draft.versionId)
    expect((await k.call('PATCH', k.admin('', draft.id), { type: 'image' })).json.error.details.reason).toBe('type_locked')
    const detail = await k.detail(draft.id)
    const fresh = await k.call('PATCH', k.admin('', draft.id), { title: 'Renamed', revision: detail.deliverable.revision })
    expect(fresh.status).toBe(200)
    const stale = await k.call('PATCH', k.admin('', draft.id), { title: 'Old screen', revision: detail.deliverable.revision })
    expect(stale.status).toBe(409)
    expect(stale.json.error.details.reason).toBe('stale')
  })
})

describe('archiving and removing', () => {
  it('a published deliverable is archived: still readable to the customer, read-only; a never-published one is removed instead', async () => {
    k = await makeDeliverableKit()
    const draft = await k.make({ title: 'Never seen' })
    expect((await k.call('POST', k.admin('/archive', draft.id))).json.error.details.reason).toBe('not_published')
    expect((await k.call('DELETE', k.admin('', draft.id))).status).toBe(204)
    expect((await k.call('GET', k.admin('', draft.id))).status).toBe(404)
    const shared = await k.make({}, true)
    expect((await k.call('DELETE', k.admin('', shared.id))).json.error.details.reason).toBe('published')
    const archived = await k.call('POST', k.admin('/archive', shared.id))
    expect(archived.json.data.deliverable.publication_state).toBe('archived')
    const seen = await k.view(shared.reference)
    expect(seen).toMatchObject({ archived: true })
    expect(seen.can).toEqual({ comment: false, decide: false, follow: false })
    expect((await k.call('POST', k.admin('/versions', shared.id))).json.error.details.reason).toBe('archived')
    expect((await k.w.anna.post(k.mine('/comments', shared.reference), { body: 'Too late.' })).status).toBe(409)
  })
})

describe('what a customer never sees', () => {
  it('the internal description, the administrators, the drafts of versions, the private notes and other projects’ deliverables', async () => {
    k = await makeDeliverableKit()
    const made = await k.make({ internalDescription: 'INTERNAL-ONLY-DESCRIPTION' }, true)
    const draft = await k.call('POST', k.admin('/versions', made.id))
    await k.call('PATCH', k.admin(`/versions/${draft.json.data.versions[0].id}`, made.id), { title: 'DRAFT-TITLE-NOT-SHOWN' })
    await k.call('POST', k.admin('/notes', made.id), { body: 'PRIVATE-NOTE-TEXT' })
    const other = await k.w.kit.project(k.w.anna.id, { name: 'Other' })
    const hidden = await k.call('POST', k.w.at('/deliverables', other), { title: 'Other project deliverable', type: 'design', versionDescription: 'words' })
    await k.call('POST', k.w.at(`/deliverables/${hidden.json.data.id}/versions/${(await k.call('GET', k.w.at(`/deliverables/${hidden.json.data.id}`, other))).json.data.versions[0].id}/publish`, other))
    const text = JSON.stringify([(await k.w.anna.get(k.mine())).json, (await k.w.anna.get(k.mine('', made.reference))).json])
    for (const secret of ['INTERNAL-ONLY-DESCRIPTION', 'DRAFT-TITLE-NOT-SHOWN', 'PRIVATE-NOTE-TEXT', 'owner@site.test', 'editor@site.test', 'internal_description', 'created_by', 'Other project deliverable']) expect(text, secret).not.toContain(secret)
    // The other project's deliverable is in the other project, and a stranger gets "not found" for it here.
    const bob = await k.w.kit.customer('bob@example.com')
    expect((await bob.get(k.mine('', made.reference))).status).toBe(404)
    expect((await bob.get(k.mine())).status).toBe(404)
  })
})
