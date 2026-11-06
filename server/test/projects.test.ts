import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sniffImage } from '../src/modules/media/image.ts'
import { completeness, normalizeContent, publishBlockers } from '../src/modules/projects/content.ts'
import { seedProjects } from '../src/modules/projects/service.ts'
import { quote, startServer, type TestServer } from './helpers.ts'

/**
 * The portfolio's content management (PROMPT 13.1): the projects' workflow, their translations, the pictures, the public
 * view and who may do what. Everything goes through the real HTTP routes of an in-process server.
 */

let server: TestServer
let admin: { cookie: string; csrf: string }
let editor: { cookie: string; csrf: string }
const as = (who: { cookie: string; csrf: string }) => ({ Cookie: who.cookie, 'X-CSRF-Token': who.csrf })

beforeEach(async () => {
  server = await startServer({ env: { MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-media-test-')) } })
  admin = await server.signIn('admin')
  editor = await server.signIn('editor')
  seedProjects(server.app.context)
})
afterEach(async () => {
  await server.close()
})

const tri = (text: string) => ({ hu: `${text} hu`, en: `${text} en`, nl: `${text} nl` })
const emptyTri = { hu: '', en: '', nl: '' }

/** A document with just enough for a draft, or for publication when `full` (every language has what it needs). */
function document(title = 'Test project', full = true): Record<string, unknown> {
  return {
    title: full ? tri(title) : { hu: title, en: '', nl: '' },
    cardDescription: full ? tri('Card') : emptyTri,
    summary: full ? tri('Summary') : emptyTri,
    detailPage: true,
    projectStatus: 'concept',
    overview: { what: full ? tri('What it is') : emptyTri, audience: emptyTri, problem: emptyTri, goal: emptyTri },
    tags: ['React'],
  }
}

async function create(slug: string, content: Record<string, unknown> = document(), who = admin) {
  return server.api('/api/admin/projects', { body: { slug, category: 'apps', content }, headers: as(who) })
}
const publish = (id: number, who = admin) => server.api(`/api/admin/projects/${id}/publish`, { body: {}, headers: as(who) })
const publicSlugs = async () => (await server.api('/api/projects')).json.data.map((p: { slug: string }) => p.slug)

/** The first bytes of a PNG: enough for the server to read what it is and how big it is (it never decodes the picture). */
function png(width: number, height: number, salt = 0): Buffer {
  const b = Buffer.alloc(40 + salt)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'latin1')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}
const upload = (bytes: Buffer, type = 'image/png', who = admin, name = 'pic.png') =>
  fetch(`${server.url}/api/admin/media?name=${name}`, { method: 'POST', headers: { 'Content-Type': type, ...as(who) }, body: new Uint8Array(bytes) }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => null) as any }))

describe('the seed: the website\'s own projects', () => {
  it('loads the four projects once, with their pictures and categories, all published and featured', async () => {
    const list = (await server.api('/api/projects')).json
    expect(list.data.map((p: { slug: string }) => p.slug)).toEqual(['spendly', 'bookinghub', 'hollandia', 'logistics-platform'])
    expect(list.data.every((p: { featured: boolean; status: string }) => p.featured && p.status === 'published')).toBe(true)
    expect(list.meta.categories.map((c: { key: string }) => c.key).sort()).toEqual(['apps', 'concepts', 'platforms'])
    expect(seedProjects(server.app.context).seeded).toBe(false)
  })

  it('keeps the pages the website has: a detail with its gallery, and a card without a page for the concept', async () => {
    const spendly = (await server.api('/api/projects/spendly')).json
    expect(spendly.data.detail.gallery.length).toBe(10)
    expect(spendly.data.detail.gallery[0]).toMatchObject({ width: expect.any(Number), height: expect.any(Number), src: expect.stringMatching(/^\/projects\/spendly\//) })
    expect(spendly.meta.neighbours.next.slug).toBe('bookinghub')
    // Hollandia is a concept card with no page: it is in the list and its address is not a page.
    expect((await server.api('/api/projects/hollandia')).status).toBe(404)
    const card = (await server.api('/api/projects')).json.data.find((p: { slug: string }) => p.slug === 'hollandia')
    expect(card.card).toMatchObject({ detailPage: false, projectStatus: 'concept' })
  })
})

describe('the workflow: draft, published, archived', () => {
  it('a draft is saved half written and is invisible to the public in every way', async () => {
    const made = await create('half-done', document('Half done', false))
    expect(made.status).toBe(201)
    expect(made.json.data.status).toBe('draft')
    expect(await publicSlugs()).not.toContain('half-done')
    expect((await server.api('/api/projects/half-done')).status).toBe(404)
    // Not acknowledged anywhere public: not in the list's neighbours, not as a card, not by a probe.
    expect(JSON.stringify((await server.api('/api/projects')).json)).not.toContain('Half done')
  })

  it('refuses to publish while a language lacks what publication needs, and says what', async () => {
    const id = (await create('needs-more', document('Needs more', false))).json.data.id
    const refused = await publish(id)
    expect(refused.status).toBe(422)
    expect(Object.keys(refused.json.error.details.fields)).toEqual(expect.arrayContaining(['content.title.en', 'content.cardDescription.nl', 'content.summary.hu']))
    expect((await server.api(`/api/admin/projects/${id}`, { headers: as(admin) })).json.data.status).toBe('draft')
  })

  it('publishes a complete project: it appears in the list and on its own address; unpublishing removes it and keeps its content', async () => {
    const id = (await create('complete-one')).json.data.id
    expect((await publish(id)).json.data.status).toBe('published')
    expect(await publicSlugs()).toContain('complete-one')
    expect((await server.api('/api/projects/complete-one')).json.data.card.title.en).toBe('Test project en')
    const back = await server.api(`/api/admin/projects/${id}/unpublish`, { body: {}, headers: as(admin) })
    expect(back.json.data.status).toBe('draft')
    expect(await publicSlugs()).not.toContain('complete-one')
    expect((await server.api('/api/projects/complete-one')).status).toBe(404)
    expect((await server.api(`/api/admin/projects/${id}`, { headers: as(admin) })).json.data.content.title.en).toBe('Test project en')
    // And it can be published again.
    expect((await publish(id)).status).toBe(200)
    expect(await publicSlugs()).toContain('complete-one')
  })

  it('archives (out of every public list, no longer featured) and restores as a draft', async () => {
    const id = (await create('to-archive')).json.data.id
    await publish(id)
    await server.api(`/api/admin/projects/${id}`, { method: 'PATCH', body: { featured: true }, headers: as(admin) })
    const archived = await server.api(`/api/admin/projects/${id}/archive`, { body: {}, headers: as(admin) })
    expect(archived.json.data).toMatchObject({ status: 'archived', featured: false })
    expect(await publicSlugs()).not.toContain('to-archive')
    expect((await server.api(`/api/admin/projects/${id}`, { method: 'PATCH', body: { featured: true }, headers: as(admin) })).status).toBe(409)
    const restored = await server.api(`/api/admin/projects/${id}/restore`, { body: {}, headers: as(admin) })
    expect(restored.json.data.status).toBe('draft')
    expect((await server.api(`/api/admin/projects/${id}/unpublish`, { body: {}, headers: as(admin) })).status).toBe(409)
  })

  it('features and unfeatures; reorders the whole list at once and refuses a partial or repeated order', async () => {
    const list = (await server.api('/api/admin/projects', { headers: as(admin) })).json.data.projects
    const ids = list.map((p: { id: number }) => p.id)
    const reversed = [...ids].reverse()
    expect((await server.api('/api/admin/project-order', { method: 'PUT', body: { ids: reversed }, headers: as(admin) })).status).toBe(204)
    expect(await publicSlugs()).toEqual(['logistics-platform', 'hollandia', 'bookinghub', 'spendly'])
    for (const bad of [ids.slice(1), [...ids, ids[0]], ['a', 'b'], [ids[0], ids[0], ids[1], ids[2]]]) {
      expect((await server.api('/api/admin/project-order', { method: 'PUT', body: { ids: bad }, headers: as(admin) })).status).toBe(422)
    }
    const off = await server.api(`/api/admin/projects/${ids[0]}`, { method: 'PATCH', body: { featured: false }, headers: as(admin) })
    expect(off.json.data.featured).toBe(false)
    expect((await server.api('/api/projects')).json.data.find((p: { slug: string }) => p.slug === 'spendly').featured).toBe(false)
  })

  it('duplicates as a draft with its own address, and deletes only for an administrator', async () => {
    const copy = await server.api(`/api/admin/projects/1/duplicate`, { body: {}, headers: as(admin) })
    expect(copy.status).toBe(201)
    expect(copy.json.data).toMatchObject({ slug: 'spendly-copy', status: 'draft', featured: false })
    expect((await server.api(`/api/admin/projects/${copy.json.data.id}`, { method: 'DELETE', headers: as(editor) })).status).toBe(403)
    expect((await server.api(`/api/admin/projects/${copy.json.data.id}`, { method: 'DELETE', headers: as(admin) })).status).toBe(204)
    expect((await server.api(`/api/admin/projects/${copy.json.data.id}`, { headers: as(admin) })).status).toBe(404)
  })

  it('leaves a line in the audit log for each change, naming the project and not its text', async () => {
    const id = (await create('audited')).json.data.id
    await publish(id)
    const log = server.db.all<{ action: string; detail: string | null }>("SELECT action, detail FROM audit_log WHERE entity_type = 'project' ORDER BY id")
    expect(log.map((row) => row.action)).toEqual(expect.arrayContaining(['project.create', 'project.publish']))
    expect(log.every((row) => !String(row.detail).includes('Test project'))).toBe(true)
  })
})

describe('editing: validation, addresses, two editors', () => {
  it('checks the address: letters, digits and hyphens, not reserved, not taken', async () => {
    for (const slug of ['A', 'x', 'has space', 'ünïcode', 'preview', 'new', 'a'.repeat(61)]) expect((await create(slug)).status).toBe(422)
    expect((await create('spendly')).json.error.details.fields.slug).toBe('duplicate')
    expect((await create('fine-slug')).status).toBe(201)
  })

  it('refuses a link that is not https, has credentials or is a script, and any text over its limit', async () => {
    const bad = { ...document(), links: { demo: { url: 'javascript:alert(1)', verified: true }, source: { url: 'http://insecure.example/x', verified: true }, extra: { url: 'https://user:pw@example.com/', label: tri('Extra'), verified: true } }, summary: { ...tri('S'), hu: 'x'.repeat(900) } }
    const refused = await create('bad-links', bad)
    expect(refused.status).toBe(422)
    expect(Object.keys(refused.json.error.details.fields)).toEqual(expect.arrayContaining(['content.links.demo.url', 'content.links.source.url', 'content.links.extra.url', 'content.summary.hu']))
  })

  it('shows a link to a visitor only when it was marked as checked', async () => {
    const content = { ...document(), links: { demo: { url: 'https://demo.example.com/app', verified: false }, source: { url: 'https://github.com/owner/repo', verified: true } } }
    const id = (await create('links-demo', content)).json.data.id
    await publish(id)
    const shown = (await server.api('/api/projects/links-demo')).json.data
    expect(shown.detail.links).toMatchObject({ demo: null, source: 'https://github.com/owner/repo' })
    expect(shown.card.demoUrl).toBeNull()
  })

  it('never serves a section the administrator hid, and strips its words from the public answer', async () => {
    const content = { ...document(), hidden: ['challenge', 'gallery'], challenges: [{ title: tri('Secret title'), problem: tri('Hidden problem'), solution: tri('Hidden solution'), source: '' }] }
    const id = (await create('hidden-parts', content)).json.data.id
    await publish(id)
    const text = (await server.api('/api/projects/hidden-parts')).text
    expect(text).not.toContain('Hidden problem')
    expect((await server.api(`/api/admin/projects/${id}`, { headers: as(admin) })).text).toContain('Hidden problem')
  })

  it('keeps an address once it has been public, and refuses a save that would make a public project unpublishable', async () => {
    const id = (await create('stable-address')).json.data.id
    await publish(id)
    const moved = await server.api(`/api/admin/projects/${id}`, { method: 'PUT', body: { slug: 'new-address', content: document() }, headers: as(admin) })
    expect(moved.status).toBe(422)
    const stripped = await server.api(`/api/admin/projects/${id}`, { method: 'PUT', body: { content: { ...document(), summary: emptyTri } }, headers: as(admin) })
    expect(stripped.status).toBe(422)
    expect((await server.api('/api/projects/stable-address')).status).toBe(200)
  })

  it('refuses a save made from an out-of-date copy', async () => {
    const made = (await create('two-editors')).json.data
    server.clock.advance(1000)
    const first = await server.api(`/api/admin/projects/${made.id}`, { method: 'PUT', body: { content: document('First'), expectedUpdatedAt: made.updatedAt }, headers: as(admin) })
    expect(first.status).toBe(200)
    server.clock.advance(1000)
    const second = await server.api(`/api/admin/projects/${made.id}`, { method: 'PUT', body: { content: document('Second'), expectedUpdatedAt: made.updatedAt }, headers: as(editor) })
    expect(second.status).toBe(409)
  })

  it('reports each language as complete, incomplete or missing', () => {
    const { content } = normalizeContent({ ...document('Report', false), summary: { hu: 'Összefoglaló', en: 'Summary', nl: '' } })
    const report = completeness(content)
    expect(report.hu.state).toBe('incomplete')
    expect(report.hu.blocking).toEqual(expect.arrayContaining(['cardDescription', 'overview.what']))
    expect(report.nl.untranslated).toContain('summary')
    expect(report.en.untranslated).toContain('title')
    const empty = completeness(normalizeContent({ title: { hu: 'Csak magyar' } }).content)
    expect(empty.nl.state).toBe('missing')
    // With the multilingual requirement off, a language with nothing in it does not block.
    expect(publishBlockers(normalizeContent({ title: { hu: 'Csak', en: '', nl: '' }, cardDescription: { hu: 'k', en: '', nl: '' }, summary: { hu: 's', en: '', nl: '' }, detailPage: false }).content, false)).toEqual([])
  })
})

describe('pictures', () => {
  it('reads the format and size from the first bytes and refuses what is not a PNG, JPEG, WebP or GIF', () => {
    expect(sniffImage(png(1200, 800))).toMatchObject({ mime: 'image/png', width: 1200, height: 800 })
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull()
    expect(sniffImage(Buffer.from('GIF89a\x10\x00\x20\x00', 'latin1'))).toMatchObject({ mime: 'image/gif', width: 16, height: 32 })
    expect(sniffImage(png(9000, 100))).toBeNull() // a side over the limit
    expect(sniffImage(png(7000, 7000))).toBeNull() // an area over the limit
    expect(sniffImage(Buffer.alloc(10))).toBeNull()
  })

  it('stores an upload by its hash, serves it with safe headers, and treats the same picture as one', async () => {
    const first = await upload(png(640, 480))
    expect(first.status).toBe(201)
    expect(first.json.data).toMatchObject({ width: 640, height: 480, mime: 'image/png', storage: 'upload', src: expect.stringMatching(/^\/media\/[a-f0-9]{24}\.png$/) })
    const again = await upload(png(640, 480))
    expect(again.json.data.id).toBe(first.json.data.id)
    const served = await server.fetch(first.json.data.src)
    expect(served.status).toBe(200)
    expect(served.headers.get('content-type')).toBe('image/png')
    expect(served.headers.get('cache-control')).toContain('immutable')
    expect(served.headers.get('content-security-policy')).toContain('sandbox')
    expect(served.headers.get('x-content-type-options')).toBe('nosniff')
    // A name that is not a hash, or climbs out of the folder, is not a picture.
    for (const path of ['/media/secret.txt', '/media/..%2F..%2Fapp.sqlite', '/media/AAAAAAAAAAAAAAAAAAAAAAAA.png']) expect((await server.fetch(path)).status).toBe(404)
  })

  it('refuses an upload that is not what it says, is too large, is not an image, or comes from nobody', async () => {
    expect((await upload(png(10, 10), 'image/jpeg')).status).toBe(422)
    expect((await upload(Buffer.from('<svg/>'), 'image/svg+xml')).status).toBe(415)
    expect((await upload(Buffer.from('plain text that is not an image at all'), 'image/png')).status).toBe(422)
    expect((await upload(Buffer.alloc(0))).status).toBe(422)
    const big = await startServer({ env: { MEDIA_MAX_BYTES: String(100 * 1024), MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-media-big-')) } })
    try {
      const who = await big.signIn('admin')
      const response = await fetch(`${big.url}/api/admin/media`, { method: 'POST', headers: { 'Content-Type': 'image/png', ...as(who) }, body: new Uint8Array(Buffer.concat([png(10, 10), Buffer.alloc(200 * 1024)])) })
      expect(response.status).toBe(413)
    } finally {
      await big.close()
    }
    const anonymous = await fetch(`${server.url}/api/admin/media`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(png(10, 10)) })
    expect(anonymous.status).toBe(401)
  })

  it('refuses a project that points at a picture that does not exist, and a picture that is still in use cannot be deleted', async () => {
    const dangling = await create('dangling', { ...document(), thumbnail: { mediaId: 9999, alt: tri('Alt') } })
    expect(dangling.status).toBe(422)
    const picture = (await upload(png(300, 200, 1))).json.data
    const id = (await create('with-picture', { ...document(), thumbnail: { mediaId: picture.id, alt: tri('Thumbnail') }, gallery: [{ mediaId: picture.id, device: 'desktop', alt: tri('Shot'), caption: emptyTri, hero: true }] })).json.data.id
    await publish(id)
    const shown = (await server.api('/api/projects/with-picture')).json.data
    expect(shown.card.thumbnail).toMatchObject({ src: picture.src, width: 300, height: 200 })
    expect(shown.detail.gallery[0]).toMatchObject({ src: picture.src, hero: true })
    expect((await server.api(`/api/admin/media/${picture.id}`, { method: 'DELETE', headers: as(admin) })).status).toBe(409)
    await server.api(`/api/admin/projects/${id}`, { method: 'DELETE', headers: as(admin) })
    expect((await server.api(`/api/admin/media/${picture.id}`, { method: 'DELETE', headers: as(admin) })).status).toBe(204)
    expect((await server.fetch(picture.src)).status).toBe(404)
  })

  it('does not let a picture that ships with the website be deleted from the administration', async () => {
    const shipped = server.db.get<{ id: number }>("SELECT id FROM media WHERE storage = 'public' LIMIT 1")!
    expect((await server.api(`/api/admin/media/${shipped.id}`, { method: 'DELETE', headers: as(admin) })).status).toBe(409)
  })
})

describe('who may do what', () => {
  it('answers 401 to every administration route of this module without a session, and 403 to a write without the token', async () => {
    const routes: Array<[string, string]> = [
      ['GET', '/api/admin/projects'], ['POST', '/api/admin/projects'], ['GET', '/api/admin/projects/1'], ['PUT', '/api/admin/projects/1'], ['PATCH', '/api/admin/projects/1'], ['DELETE', '/api/admin/projects/1'],
      ['POST', '/api/admin/projects/1/publish'], ['POST', '/api/admin/projects/1/unpublish'], ['POST', '/api/admin/projects/1/archive'], ['POST', '/api/admin/projects/1/duplicate'],
      ['GET', '/api/admin/projects/1/preview'], ['GET', '/api/admin/project-preview'], ['PUT', '/api/admin/project-order'], ['GET', '/api/admin/project-settings'], ['PUT', '/api/admin/project-settings'],
      ['GET', '/api/admin/media'], ['DELETE', '/api/admin/media/1'], ['GET', '/api/admin/texts'], ['PUT', '/api/admin/texts/dict.hero.titleLine1'],
    ]
    for (const [method, path] of routes) {
      const response = await server.api(path, { method, ...(method === 'GET' || method === 'DELETE' ? {} : { body: {} }) })
      expect([path, response.status]).toEqual([path, 401])
    }
    const noToken = await server.api('/api/admin/projects/1/publish', { method: 'POST', body: {}, headers: { Cookie: admin.cookie } })
    expect(noToken.status).toBe(403)
  })

  it('shows the preview of a draft only to a signed-in administrator, and never through the public routes', async () => {
    const id = (await create('secret-draft')).json.data.id
    expect((await server.api(`/api/admin/projects/${id}/preview`)).status).toBe(401)
    const preview = await server.api(`/api/admin/projects/${id}/preview`, { headers: as(editor) })
    expect(preview.status).toBe(200)
    expect(preview.json.data.project.slug).toBe('secret-draft')
    expect(preview.headers.get('cache-control')).toBe('no-store')
    expect(preview.headers.get('x-robots-tag')).toContain('noindex')
    const list = await server.api('/api/admin/project-preview', { headers: as(editor) })
    expect(list.json.data.projects.find((p: { slug: string }) => p.slug === 'secret-draft').draft).toBe(true)
    expect(JSON.stringify((await server.api('/api/projects')).json)).not.toContain('secret-draft')
  })

  it('never exposes administrative fields in the public answer', async () => {
    const text = (await server.api('/api/projects/spendly')).text + (await server.api('/api/projects')).text
    expect(text).not.toMatch(/"(content_json|created_by|sha256|original_name|updatedBy|password|csrf[A-Za-z]*|ip_hash)"\s*:/)
  })

  it('manages the categories: no unknown category on a project, no deleting one a project uses', async () => {
    expect((await server.api('/api/admin/projects', { body: { slug: 'odd-category', category: 'nope', content: document() }, headers: as(admin) })).status).toBe(422)
    const settings = (await server.api('/api/admin/project-settings', { headers: as(admin) })).json.data
    const without = settings.categories.filter((c: { key: string }) => c.key !== 'apps')
    expect((await server.api('/api/admin/project-settings', { method: 'PUT', body: { categories: without }, headers: as(admin) })).status).toBe(409)
    const added = await server.api('/api/admin/project-settings', { method: 'PUT', body: { categories: [...settings.categories, { key: 'experiments', label: tri('Experiments') }], requireAllLanguages: false }, headers: as(admin) })
    expect(added.json.data.categories.length).toBe(4)
    expect(added.json.data.requireAllLanguages).toBe(false)
  })
})

describe('the website\'s own wording', () => {
  const key = 'dict.hero.titleLine1'

  it('lists what can be overridden, with the wording the website ships, and shows an override publicly once it is saved', async () => {
    const all = (await server.api('/api/admin/texts', { headers: as(admin) })).json.data.keys
    const hero = all.find((k: { key: string }) => k.key === key)
    expect(hero.default.en).toBe('Digital experiences.')
    expect((await server.api('/api/texts')).json.data).toEqual({})
    const saved = await server.api(`/api/admin/texts/${encodeURIComponent(key)}`, { method: 'PUT', body: { values: { en: 'Websites with character.', hu: '', nl: '' } }, headers: as(admin) })
    expect(saved.json.data.values.en).toBe('Websites with character.')
    expect((await server.api('/api/texts')).json.data[key]).toEqual({ en: 'Websites with character.' })
    // Clearing it brings the website's own words back.
    await server.api(`/api/admin/texts/${encodeURIComponent(key)}`, { method: 'PUT', body: { values: { en: '' } }, headers: as(admin) })
    expect((await server.api('/api/texts')).json.data).toEqual({})
  })

  it('refuses a key that is not on the list, a text that is too long, and one that loses a {placeholder}', async () => {
    expect((await server.api('/api/admin/texts/dict.nothing.here', { method: 'PUT', body: { values: { en: 'x' } }, headers: as(admin) })).status).toBe(404)
    expect((await server.api(`/api/admin/texts/${key}`, { method: 'PUT', body: { values: { en: 'x'.repeat(700) } }, headers: as(admin) })).status).toBe(422)
    const withPlaceholder = (await server.api('/api/admin/texts', { headers: as(admin) })).json.data.keys.find((k: { placeholders?: string[] }) => (k.placeholders?.length ?? 0) > 0)
    expect((await server.api(`/api/admin/texts/${withPlaceholder.key}`, { method: 'PUT', body: { values: { en: 'no braces here' } }, headers: as(admin) })).status).toBe(422)
  })
})

describe('a project published after the site was built', () => {
  it('is answered with the Work page\'s shell (200), a draft or an unknown address with the 404', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-site-'))
    mkdirSync(join(dir, 'hu', 'work'), { recursive: true })
    writeFileSync(join(dir, 'hu', 'work', 'index.html'), '<!doctype html><title>Work shell</title>')
    writeFileSync(join(dir, '404.html'), '<!doctype html><title>Not found</title>')
    const site = await startServer({ env: { STATIC_DIR: dir, MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-media-site-')) } })
    try {
      const who = await site.signIn('admin')
      seedProjects(site.app.context)
      const made = await site.api('/api/admin/projects', { body: { slug: 'fresh-one', category: 'apps', content: document('Fresh') }, headers: as(who) })
      expect((await site.fetch('/hu/work/fresh-one/')).status).toBe(404)
      await site.api(`/api/admin/projects/${made.json.data.id}/publish`, { body: {}, headers: as(who) })
      const shell = await site.fetch('/hu/work/fresh-one/')
      expect(shell.status).toBe(200)
      expect(await shell.text()).toContain('Work shell')
      expect((await site.fetch('/hu/work/never-existed/')).status).toBe(404)
    } finally {
      await site.close()
    }
  })
})

describe('the shop: edits reach the public catalogue at once, and what was already requested stays as it was', () => {
  it('shows an edited package price and text on the public API within the cache time, and keeps the snapshot of an earlier request', async () => {
    const sent = await server.api('/api/quote-requests', { body: quote() })
    expect(sent.status).toBe(201)
    const before = server.db.get<{ price_snapshot: string }>('SELECT price_snapshot FROM quote_request_items')!.price_snapshot

    // The administrator changes the package: a price, its VAT mode, a text. (The website's pages read this API at run time.)
    const pack = (await server.api('/api/admin/packages/launch', { headers: as(admin) })).json.data
    const body = {
      ...pack,
      price: { kind: 'from', amount: 990, currency: 'EUR' },
      vat: 'excluded',
      translations: { ...pack.translations, en: { ...pack.translations.en, name: 'Launch, renamed', tagline: 'A new promise' } },
    }
    const saved = await server.api('/api/admin/packages/launch', { method: 'PUT', body, headers: as(admin) })
    expect(saved.status).toBe(200)
    const live = (await server.api('/api/shop/catalog')).json.data.packages.find((p: { code: string }) => p.code === 'launch')
    expect(live.price).toEqual({ kind: 'from', amount: 990, currency: 'EUR' })
    expect(live.translations.en).toMatchObject({ name: 'Launch, renamed', tagline: 'A new promise' })
    expect((await server.api('/api/shop/catalog')).headers.get('cache-control')).toContain('max-age=60')

    // The request that was sent earlier still says what it said, with the price it was offered at (a quote).
    expect(server.db.get<{ price_snapshot: string }>('SELECT price_snapshot FROM quote_request_items')!.price_snapshot).toBe(before)
    const stored = (await server.api('/api/admin/quote-requests', { headers: as(admin) })).json.data[0]
    const detail = (await server.api(`/api/admin/quote-requests/${stored.id}`, { headers: as(admin) })).json.data
    expect(JSON.stringify(detail)).toContain('launch')
    expect(JSON.stringify(detail)).not.toContain('990')
    expect(JSON.stringify(detail)).not.toContain('Launch, renamed')

    // Disabling the package stops new requests for it at once; the old one is untouched.
    await server.api('/api/admin/packages/launch', { method: 'PUT', body: { ...body, status: 'disabled' }, headers: as(admin) })
    expect((await server.api('/api/quote-requests', { body: quote({ email: 'second@example.com' }) })).status).toBeGreaterThanOrEqual(400)
    expect(server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM quote_requests')!.n).toBe(1)
  })
})
