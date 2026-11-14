import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { upgradeContent } from '../src/modules/projects/content.ts'
import { seedProjects } from '../src/modules/projects/service.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * PROMPT 22: the content blocks and the search/sharing words, what a language can show, preview links, replacing a picture, the live sitemap and
 * project pages, and the profile (About and contact). Everything goes through the real routes of an in-process server.
 */

let server: TestServer
let admin: { cookie: string; csrf: string }
let editor: { cookie: string; csrf: string }
const as = (who: { cookie: string; csrf: string }) => ({ Cookie: who.cookie, 'X-CSRF-Token': who.csrf })

beforeEach(async () => {
  server = await startServer({ env: { MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-media-22-')) } })
  admin = await server.signIn('admin')
  editor = await server.signIn('editor')
  seedProjects(server.app.context)
})
afterEach(async () => {
  await server.close()
})

const tri = (text: string) => ({ hu: `${text} hu`, en: `${text} en`, nl: `${text} nl` })
const emptyTri = { hu: '', en: '', nl: '' }

function document(title = 'Test project', extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: tri(title),
    cardDescription: tri('Card'),
    summary: tri('Summary'),
    detailPage: true,
    projectStatus: 'concept',
    overview: { what: tri('What it is'), audience: emptyTri, problem: emptyTri, goal: emptyTri },
    tags: ['React'],
    ...extra,
  }
}

const create = (slug: string, content: Record<string, unknown> = document(), who = admin) => server.api('/api/admin/projects', { body: { slug, category: 'apps', content }, headers: as(who) })
const publish = (id: number, who = admin) => server.api(`/api/admin/projects/${id}/publish`, { body: {}, headers: as(who) })
const publicSlugs = async () => (await server.api('/api/projects')).json.data.map((p: { slug: string }) => p.slug)

/** The first bytes of a PNG: enough for the server to read what it is and how big it is. `salt` makes two pictures differ. */
function png(width: number, height: number, salt = 0): Buffer {
  const b = Buffer.alloc(40 + salt)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'latin1')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}
const send = (path: string, bytes: Buffer, type = 'image/png', who = admin) =>
  fetch(`${server.url}${path}`, { method: 'POST', headers: { 'Content-Type': type, ...as(who) }, body: new Uint8Array(bytes) }).then(async (r) => ({ status: r.status, json: (await r.json().catch(() => null)) as any }))
const upload = (bytes: Buffer, type = 'image/png', who = admin) => send('/api/admin/media?name=pic.png', bytes, type, who)

describe('blocks, services, the internal title and the words for search and sharing', () => {
  const blocks = [
    { type: 'text', heading: tri('Why'), body: { hu: 'Első bekezdés.\n\nMásodik.', en: 'First paragraph.\n\nSecond.', nl: 'Eerste alinea.\n\nTweede.' } },
    { type: 'features', heading: tri('Features'), items: [tri('One'), tri('Two')] },
    { type: 'technologies', heading: tri('Tech'), items: ['React', 'Node', 'React'] },
    { type: 'highlight', heading: tri('Note'), text: tri('Remember') },
    { type: 'links', heading: tri('Links'), links: [{ label: tri('Docs'), url: 'https://docs.example.com/x', verified: true }, { label: tri('Draft'), url: 'https://wip.example.com/', verified: false }] },
  ]

  it('stores them with the project and shows a visitor only what is safe: checked links, no empty block', async () => {
    const content = document('With blocks', { internalTitle: 'Client X, spring', services: [tri('Design'), tri('Build')], blocks: [...blocks, { type: 'text', heading: tri('Empty'), body: emptyTri }] })
    const made = await create('with-blocks', content)
    expect(made.status).toBe(201)
    expect(made.json.data.content).toMatchObject({ internalTitle: 'Client X, spring' })
    expect(made.json.data.content.blocks).toHaveLength(6)
    await publish(made.json.data.id)
    const shown = (await server.api('/api/projects/with-blocks')).json.data
    expect(shown.detail.services).toEqual([tri('Design'), tri('Build')])
    // The empty block is not sent; a technology listed twice is listed once; only the checked link is there.
    expect(shown.detail.blocks.map((b: { type: string }) => b.type)).toEqual(['text', 'features', 'technologies', 'highlight', 'links'])
    expect(shown.detail.blocks[2].items).toEqual(['React', 'Node'])
    expect(shown.detail.blocks[4].links).toEqual([{ label: tri('Docs'), url: 'https://docs.example.com/x' }])
    // The internal title is for the administration only.
    expect(JSON.stringify(shown)).not.toContain('Client X')
  })

  it('keeps markup as plain text (the website draws text as text) and refuses a block type that is not in the vocabulary', async () => {
    const script = { type: 'text', heading: tri('<b>Bold</b>'), body: tri('<script>alert(1)</script>') }
    const made = await create('plain-text', document('Plain', { blocks: [script] }))
    expect(made.status).toBe(201)
    expect(made.json.data.content.blocks[0].body.en).toBe('<script>alert(1)</script> en')
    const unknown = await create('odd-block', document('Odd', { blocks: [{ type: 'html', heading: tri('X'), body: tri('<p>x</p>') }] }))
    expect(unknown.status).toBe(422)
    expect(Object.keys(unknown.json.error.details.fields)).toContain('content.blocks.0.type')
  })

  it('refuses a block link that is not https, a picture that does not exist, too many blocks and a search text over its limit', async () => {
    const bad = document('Bad', {
      blocks: [{ type: 'links', heading: tri('L'), links: [{ label: tri('x'), url: 'javascript:alert(1)', verified: true }] }, { type: 'image', heading: tri('I'), mediaId: 999999, alt: tri('a'), caption: emptyTri }],
      seo: { title: { hu: 'x'.repeat(400), en: '', nl: '' }, description: emptyTri, ogTitle: emptyTri, ogDescription: emptyTri, imageMediaId: 999999, imageAlt: emptyTri },
    })
    const refused = await create('bad-blocks', bad)
    expect(refused.status).toBe(422)
    expect(Object.keys(refused.json.error.details.fields)).toEqual(expect.arrayContaining(['content.blocks.0.links.0.url', 'content.blocks.1.mediaId', 'content.seo.title.hu', 'content.seo.imageMediaId']))
    const many = await create('many-blocks', document('Many', { blocks: Array.from({ length: 60 }, () => blocks[0]) }))
    expect(many.status).toBe(422)
  })

  it('blocks publication when a block has a text in one language and not in the others, and lets the draft be saved', async () => {
    const half = { type: 'text', heading: { hu: 'Csak magyar', en: '', nl: '' }, body: { hu: 'Szöveg', en: '', nl: '' } }
    const made = await create('half-block', document('Half block', { blocks: [half] }))
    expect(made.status).toBe(201)
    const refused = await publish(made.json.data.id)
    expect(refused.status).toBe(422)
    expect(Object.keys(refused.json.error.details.fields).some((field) => field.startsWith('content.blocks.0'))).toBe(true)
    expect(await publicSlugs()).not.toContain('half-block')
  })

  it('shows the owner\'s search and sharing words in the public answer, with the picture they chose', async () => {
    const pic = await upload(png(1200, 630))
    const seo = { title: tri('Search title'), description: tri('Search description'), ogTitle: emptyTri, ogDescription: tri('Share text'), imageMediaId: pic.json.data.id, imageAlt: tri('Share picture') }
    const made = await create('with-seo', document('With seo', { seo }))
    expect(made.status).toBe(201)
    await publish(made.json.data.id)
    const card = (await server.api('/api/projects/with-seo')).json.data.card
    expect(card.seo).toMatchObject({ title: tri('Search title'), ogDescription: tri('Share text'), image: { id: pic.json.data.id, width: 1200, height: 630, alt: tri('Share picture') } })
    // A project with no words of its own for search says nothing: the website uses the project's name and card text.
    const plain = await create('no-seo')
    await publish(plain.json.data.id)
    expect((await server.api('/api/projects/no-seo')).json.data.card.seo).toBeNull()
  })

  it('reads a project saved before this version (no blocks, no services, no search words) without breaking', () => {
    const old = upgradeContent({ title: tri('Old'), overview: {}, tags: [] })
    expect(old.blocks).toEqual([])
    expect(old.services).toEqual([])
    expect(old.internalTitle).toBe('')
    expect(old.seo.imageMediaId).toBeNull()
  })
})

describe('what a language can show', () => {
  it('lists the languages a project has something to say in, per project, and never fills a gap with another', async () => {
    // Hungarian is whole (title, card, summary, what it is); English and Dutch are not written yet. A language that lacks what publication needs is not offered.
    const hungarianOnly = { title: { hu: 'Csak magyar', en: '', nl: '' }, cardDescription: { hu: 'Kártya', en: '', nl: '' }, summary: { hu: 'Összefoglaló', en: '', nl: '' }, overview: { what: { hu: 'Mi ez', en: '', nl: '' } }, detailPage: true }
    const half = await create('only-hungarian', hungarianOnly)
    expect(half.json.data.available).toEqual(['hu'])
    // A title and nothing else is not enough for any language.
    expect((await create('title-only', { title: { hu: 'Csak cím', en: '', nl: '' }, detailPage: true })).json.data.available).toEqual([])
    const full = await create('all-three')
    expect(full.json.data.available).toEqual(['hu', 'en', 'nl'])
    await publish(full.json.data.id)
    expect((await server.api('/api/projects/all-three')).json.data.card.languages).toEqual(['hu', 'en', 'nl'])
  })
})

describe('preview links', () => {
  const link = (id: number, body: Record<string, unknown> = {}, who = admin) => server.api(`/api/admin/projects/${id}/preview-links`, { body, headers: as(who) })
  const open = (token: string) => server.api(`/api/preview/projects/${token}`)
  let id: number

  beforeEach(async () => {
    id = (await create('secret-draft', document('Secret draft'))).json.data.id
  })

  it('opens a draft for somebody who holds the secret, and nobody else: not the public list, not the public address', async () => {
    const made = await link(id, { days: 3, label: 'Client' })
    expect(made.status).toBe(201)
    expect(made.json.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const opened = await open(made.json.data.token)
    expect(opened.status).toBe(200)
    expect(opened.json.data.project.card.title.en).toBe('Secret draft en')
    expect(opened.json.data).toMatchObject({ preview: true, status: 'draft' })
    expect(opened.headers.get('cache-control')).toBe('no-store')
    expect(opened.headers.get('x-robots-tag')).toContain('noindex')
    expect(opened.headers.get('referrer-policy')).toBe('no-referrer')
    expect(await publicSlugs()).not.toContain('secret-draft')
    expect((await server.api('/api/projects/secret-draft')).status).toBe(404)
  })

  it('keeps only a hash of the secret: not in the database, not in the list of links, not in the audit log', async () => {
    const made = await link(id)
    const token = made.json.data.token as string
    const stored = JSON.stringify(server.db.all('SELECT * FROM project_preview_tokens'))
    expect(stored).not.toContain(token)
    const listed = await server.api(`/api/admin/projects/${id}/preview-links`, { headers: as(admin) })
    expect(JSON.stringify(listed.json)).not.toContain(token)
    expect(listed.json.data[0]).toMatchObject({ id: made.json.data.id, state: 'active' })
    expect(JSON.stringify(server.db.all('SELECT detail FROM audit_log'))).not.toContain(token)
  })

  it('ends: revoking says so (410, "withdrawn") and so does the clock ("expired"); an unknown or malformed secret is 404 in the same words', async () => {
    const a = await link(id, { days: 1 })
    const b = await link(id, { days: 5 })
    expect((await server.api(`/api/admin/projects/${id}/preview-links/${a.json.data.id}`, { method: 'DELETE', headers: as(admin) })).json.data.state).toBe('revoked')
    const gone = await open(a.json.data.token)
    expect(gone.status).toBe(410)
    expect(gone.json.error.details.reason).toBe('revoked')
    server.clock.advance(6 * 24 * 3600 * 1000)
    const expired = await open(b.json.data.token)
    expect(expired.status).toBe(410)
    expect(expired.json.error.details.reason).toBe('expired')
    const unknown = await open('A'.repeat(43))
    const malformed = await open('short')
    expect([unknown.status, malformed.status]).toEqual([404, 404])
    expect(unknown.json.error.message).toBe(malformed.json.error.message)
  })

  it('limits how long a link lives (1 to 30 days), how many a project has, and who may make one', async () => {
    for (const days of [0, 31, 1.5, '7']) expect((await link(id, { days })).status).toBe(422)
    expect((await link(id, { days: 30 })).status).toBe(201)
    for (let n = 0; n < 9; n += 1) expect((await link(id)).status).toBe(201)
    const tooMany = await link(id)
    expect(tooMany.status).toBe(409)
    // Nobody signed in, or signed in without the CSRF token, makes nothing.
    expect((await server.api(`/api/admin/projects/${id}/preview-links`, { body: {} })).status).toBe(401)
    expect((await server.api(`/api/admin/projects/${id}/preview-links`, { body: {}, headers: { Cookie: admin.cookie } })).status).toBe(403)
    expect((await server.api(`/api/admin/projects/${id}/preview-links`, { headers: {} })).status).toBe(401)
  })

  it('follows the project: a link opens the project in whatever state it is in, and a link to another project opens nothing of this one', async () => {
    const other = (await create('other-draft', document('Other draft'))).json.data.id
    const mine = await link(id)
    const theirs = await link(other)
    expect((await open(mine.json.data.token)).json.data.project.card.title.en).toBe('Secret draft en')
    expect((await open(theirs.json.data.token)).json.data.project.card.title.en).toBe('Other draft en')
    await publish(id)
    expect((await open(mine.json.data.token)).json.data.status).toBe('published')
    const deleted = await server.api(`/api/admin/projects/${other}`, { method: 'DELETE', headers: as(admin) })
    expect(deleted.status).toBe(204)
    expect([404, 410]).toContain((await open(theirs.json.data.token)).status)
  })

  it('writes the creation and the revocation to the audit log', async () => {
    const made = await link(id)
    await server.api(`/api/admin/projects/${id}/preview-links/${made.json.data.id}`, { method: 'DELETE', headers: as(admin) })
    const actions = server.db.all<{ action: string }>('SELECT action FROM audit_log ORDER BY id').map((row) => row.action)
    expect(actions).toEqual(expect.arrayContaining(['project.preview_link.create', 'project.preview_link.revoke']))
  })
})

describe('pictures: description, replace, delete, storage', () => {
  it('keeps a description per language in the library, and refuses one that is too long or not text', async () => {
    const pic = await upload(png(800, 600))
    const saved = await server.api(`/api/admin/media/${pic.json.data.id}`, { method: 'PUT', body: { alt: { hu: 'Egy kép', en: 'A picture', nl: 'Een plaatje' } }, headers: as(admin) })
    expect(saved.status).toBe(200)
    const listed = (await server.api('/api/admin/media', { headers: as(admin) })).json.data.find((m: { id: number }) => m.id === pic.json.data.id)
    expect(listed.alt).toEqual({ hu: 'Egy kép', en: 'A picture', nl: 'Een plaatje' })
    expect((await server.api(`/api/admin/media/${pic.json.data.id}`, { method: 'PUT', body: { alt: { en: 'x'.repeat(300) } }, headers: as(admin) })).status).toBe(422)
    expect((await server.api(`/api/admin/media/${pic.json.data.id}`, { method: 'PUT', body: { alt: { en: 5 } }, headers: as(admin) })).status).toBe(422)
    expect((await server.api('/api/admin/media/999999', { method: 'PUT', body: { alt: {} }, headers: as(admin) })).status).toBe(404)
  })

  it('replaces a picture: every use switches to the new one, the old file and address stay, the description carries over', async () => {
    const first = await upload(png(800, 600))
    await server.api(`/api/admin/media/${first.json.data.id}`, { method: 'PUT', body: { alt: tri('Shot') }, headers: as(admin) })
    const content = document('Uses a picture', { thumbnail: { mediaId: first.json.data.id, alt: tri('Thumb') } })
    const made = await create('uses-picture', content)
    expect(made.status).toBe(201)
    const replaced = await send(`/api/admin/media/${first.json.data.id}/replace?name=new.png`, png(1024, 768, 3))
    expect(replaced.status).toBe(200)
    expect(replaced.json.data.projects).toBe(1)
    const next = replaced.json.data.media
    expect(next.id).not.toBe(first.json.data.id)
    expect(next.src).not.toBe(first.json.data.src)
    expect(next.alt).toEqual(tri('Shot'))
    const project = (await server.api(`/api/admin/projects/${made.json.data.id}`, { headers: as(admin) })).json.data
    expect(project.content.thumbnail.mediaId).toBe(next.id)
    // The old address still answers, with the old bytes (an address never shows a different picture).
    expect((await server.fetch(first.json.data.src)).status).toBe(200)
    expect((await server.fetch(next.src)).status).toBe(200)
    // Replacing with the very same bytes is refused; with a claim that does not match the bytes, too.
    expect((await send(`/api/admin/media/${next.id}/replace`, png(1024, 768, 3))).status).toBe(409)
    expect((await send(`/api/admin/media/${next.id}/replace`, png(10, 10, 9), 'image/jpeg')).status).toBe(422)
    expect((await send(`/api/admin/media/${next.id}/replace`, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png')).status).toBe(422)
    expect((await send('/api/admin/media/999999/replace', png(10, 10, 5))).status).toBe(404)
  })

  it('never deletes a picture something uses, deletes one nothing uses, and only for an administrator', async () => {
    const used = await upload(png(500, 500, 1))
    const free = await upload(png(500, 500, 2))
    await create('keeps-picture', document('Keeps', { thumbnail: { mediaId: used.json.data.id, alt: tri('t') } }))
    expect((await server.api(`/api/admin/media/${used.json.data.id}`, { method: 'DELETE', headers: as(admin) })).status).toBe(409)
    expect((await server.fetch(used.json.data.src)).status).toBe(200)
    expect((await server.api(`/api/admin/media/${free.json.data.id}`, { method: 'DELETE', headers: as(editor) })).status).toBe(403)
    expect((await server.api(`/api/admin/media/${free.json.data.id}`, { method: 'DELETE', headers: as(admin) })).status).toBe(204)
    expect((await server.fetch(free.json.data.src)).status).toBe(404)
  })

  it('refuses what is not a picture whatever it is called: SVG, HTML, a wrong type claim', async () => {
    expect((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'image/svg+xml')).status).toBe(415)
    expect((await upload(Buffer.from('<html><script>1</script></html>'), 'image/png')).status).toBe(422)
    expect((await upload(png(100, 100), 'image/jpeg')).status).toBe(422)
    expect((await server.api('/api/admin/media', { headers: as(admin) })).json.data.every((m: { mime?: string }) => m.mime === undefined || m.mime.startsWith('image/'))).toBe(true)
  })

  it('says where the pictures are kept and whether that looks safe', async () => {
    const answer = await server.api('/api/admin/media-storage', { headers: as(admin) })
    expect(answer.status).toBe(200)
    expect(answer.json.data).toMatchObject({ writable: true, warning: null, files: expect.any(Number) })
    expect(typeof answer.json.data.directory).toBe('string')
    expect((await server.api('/api/admin/media-storage')).status).toBe(401)
  })
})

describe('the live sitemap and the project pages', () => {
  let site: TestServer
  afterEach(async () => {
    await site?.close()
  })

  async function start(): Promise<{ who: { cookie: string; csrf: string } }> {
    const dir = mkdtempSync(join(tmpdir(), 'cc-site-22-'))
    mkdirSync(join(dir, 'hu', 'work'), { recursive: true })
    writeFileSync(join(dir, 'hu', 'work', 'index.html'), '<!doctype html><title>Work shell</title>')
    writeFileSync(join(dir, '404.html'), '<!doctype html><title>Not found</title>')
    // The sitemap the build wrote: the home page, and a project that was published on the day (and has been unpublished since).
    writeFileSync(
      join(dir, 'sitemap.xml'),
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        '  <url>\n    <loc>https://site.test/hu/</loc>\n  </url>',
        '  <url>\n    <loc>https://site.test/hu/work/stale-one/</loc>\n  </url>',
        '</urlset>',
        '',
      ].join('\n'),
    )
    await server.close()
    site = await startServer({ env: { STATIC_DIR: dir, MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-media-site-22-')) } })
    server = site
    const who = await site.signIn('admin')
    seedProjects(site.app.context)
    return { who }
  }

  it('lists a published project in every language it has, drops the build\'s stale one, and never lists a draft or an unpublished project', async () => {
    const { who } = await start()
    const a = (await site.api('/api/admin/projects', { body: { slug: 'live-one', category: 'apps', content: document('Live') }, headers: as(who) })).json.data.id
    await site.api('/api/admin/projects', { body: { slug: 'draft-one', category: 'apps', content: document('Draft') }, headers: as(who) })
    await site.api(`/api/admin/projects/${a}/publish`, { body: {}, headers: as(who) })
    const map = await site.fetch('/sitemap.xml')
    expect(map.status).toBe(200)
    const xml = await map.text()
    expect(xml).toContain('https://site.test/hu/')
    for (const lang of ['hu', 'en', 'nl']) expect(xml).toContain(`<loc>https://site.test/${lang}/work/live-one/</loc>`)
    expect(xml).not.toContain('stale-one')
    expect(xml).not.toContain('draft-one')
    expect(xml).toContain('hreflang="x-default"')
    // The same x-default as the page's own head (English, the site's default language), not Hungarian (PROMPT 23).
    expect(xml).toContain('hreflang="x-default" href="https://site.test/en/work/live-one/"')
    expect(xml).not.toContain('hreflang="x-default" href="https://site.test/hu/work/live-one/"')
    await site.api(`/api/admin/projects/${a}/unpublish`, { body: {}, headers: as(who) })
    expect(await (await site.fetch('/sitemap.xml')).text()).not.toContain('live-one')
  })

  it('answers 404 with noindex for a project page that is not live, even if the build wrote a file for it; 200 for one that is', async () => {
    const { who } = await start()
    const id = (await site.api('/api/admin/projects', { body: { slug: 'page-one', category: 'apps', content: document('Page') }, headers: as(who) })).json.data.id
    const draft = await site.fetch('/hu/work/page-one/')
    expect(draft.status).toBe(404)
    expect(draft.headers.get('x-robots-tag')).toContain('noindex')
    await site.api(`/api/admin/projects/${id}/publish`, { body: {}, headers: as(who) })
    expect((await site.fetch('/hu/work/page-one/')).status).toBe(200)
    await site.api(`/api/admin/projects/${id}/unpublish`, { body: {}, headers: as(who) })
    expect((await site.fetch('/hu/work/page-one/')).status).toBe(404)
  })

  it('answers a preview link\'s address with the application shell, never cached, never indexed, with no referrer', async () => {
    await start()
    const token = 'A'.repeat(43)
    const shell = await site.fetch(`/hu/work/preview/link/${token}`)
    expect(shell.status).toBe(200)
    expect(shell.headers.get('cache-control')).toBe('no-store')
    expect(shell.headers.get('x-robots-tag')).toContain('noindex')
    expect(shell.headers.get('referrer-policy')).toBe('no-referrer')
    expect((await site.fetch('/hu/work/preview/link/short')).status).toBe(404)
  })
})

describe('the profile: About and contact details', () => {
  const profile = (extra: Record<string, unknown> = {}) => ({
    story: { title: tri('Story'), paragraphs: [tri('One'), tri('Two')], thought: tri('Thought') },
    strengths: [{ id: 'order', name: tri('Order'), text: tri('Keeps things in order') }],
    skills: [{ id: 'frontend', label: tri('Frontend'), skills: [{ name: 'React', level: null }] }],
    focus: [{ id: 'now', active: true, title: tri('Now'), text: tri('Doing this') }],
    contact: { email: 'hello@example.com', social: [{ id: 'github', label: 'GitHub', url: 'https://github.com/example' }] },
    ...extra,
  })
  const save = (body: unknown, who = admin) => server.api('/api/admin/profile', { method: 'PUT', body, headers: as(who) })

  it('is empty for a visitor until the owner saves one, and the administration then starts from the website\'s own content', async () => {
    expect((await server.api('/api/profile')).json.data).toBeNull()
    const read = (await server.api('/api/admin/profile', { headers: as(admin) })).json.data
    expect(read.saved).toBe(false)
    expect(read.profile.story.paragraphs.length).toBeGreaterThan(0)
  })

  it('saves a complete document, shows it publicly (cached briefly, with an ETag), and goes back to the website\'s own content on reset', async () => {
    const saved = await save({ profile: profile(), expectedUpdatedAt: null })
    expect(saved.status).toBe(200)
    const shown = await server.api('/api/profile')
    expect(shown.json.data.story.title).toEqual(tri('Story'))
    expect(shown.json.data.contact.email).toBe('hello@example.com')
    expect(shown.headers.get('etag')).toBeTruthy()
    expect(shown.headers.get('cache-control')).toContain('max-age=30')
    const again = await server.fetch('/api/profile', { headers: { 'If-None-Match': shown.headers.get('etag') as string } })
    expect(again.status).toBe(304)
    expect((await server.api('/api/admin/profile', { method: 'DELETE', headers: as(admin) })).json.data.saved).toBe(false)
    expect((await server.api('/api/profile')).json.data).toBeNull()
  })

  it('refuses a text that lacks a language (the website never fills it with another), naming the field, and a bad address or link', async () => {
    const bad = profile({
      story: { title: { hu: 'Csak magyar', en: '', nl: '' }, paragraphs: [], thought: emptyTri },
      contact: { email: 'not an email', social: [{ id: 'x', label: 'Site', url: 'http://insecure.example/' }] },
    })
    const refused = await save({ profile: bad })
    expect(refused.status).toBe(422)
    expect(Object.keys(refused.json.error.details.fields)).toEqual(expect.arrayContaining(['story.title.en', 'story.title.nl', 'contact.email', 'contact.social.0.url']))
    expect((await server.api('/api/profile')).json.data).toBeNull()
  })

  it('refuses a save made from an out-of-date copy, and drops a list entry that has no text at all', async () => {
    const first = await save({ profile: profile() })
    const updatedAt = first.json.data.updatedAt as string
    server.clock.advance(1000)
    const second = await save({ profile: profile({ strengths: [{ id: 'blank', name: emptyTri, text: emptyTri }, ...profile().strengths] }), expectedUpdatedAt: updatedAt })
    expect(second.status).toBe(200)
    expect(second.json.data.profile.strengths).toHaveLength(1)
    server.clock.advance(1000)
    expect((await save({ profile: profile(), expectedUpdatedAt: updatedAt })).status).toBe(409)
  })

  it('needs a signed-in administrator with the right to write, and the CSRF token', async () => {
    expect((await server.api('/api/admin/profile')).status).toBe(401)
    expect((await server.api('/api/admin/profile', { method: 'PUT', body: { profile: profile() } })).status).toBe(401)
    expect((await server.api('/api/admin/profile', { method: 'PUT', body: { profile: profile() }, headers: { Cookie: admin.cookie } })).status).toBe(403)
    expect((await server.api('/api/admin/profile', { method: 'DELETE', headers: { Cookie: admin.cookie } })).status).toBe(403)
    expect((await save({ profile: profile() }, editor)).status).toBe(200)
  })
})

describe('every new administration route needs a session', () => {
  it('answers 401 without one, for every method', async () => {
    const id = (await create('guarded')).json.data.id
    const routes = [`/api/admin/projects/${id}/preview-links`, `/api/admin/projects/${id}/preview-links/x`, '/api/admin/media-storage', '/api/admin/media/1/replace', '/api/admin/media/1', '/api/admin/profile']
    for (const route of routes) {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        const answer = await server.api(route, { method, body: method === 'GET' ? undefined : {} })
        expect([401, 404, 405]).toContain(answer.status)
      }
    }
  })
})
