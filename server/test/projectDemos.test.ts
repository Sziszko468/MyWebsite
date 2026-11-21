import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeContent, publicDemo, upgradeContent, emptyDemo } from '../src/modules/projects/content.ts'
import { DEMO_PROJECTS, DEMO_TYPES, INSTRUCTIONS_MAX, demoTypesFor, isDemoType, isEligible } from '../src/modules/projects/demo.ts'
import { seedProjects } from '../src/modules/projects/service.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * Interactive demos in the project CMS (PROMPT 35): the closed list of registered types, who may switch one on and for which project, what the public answer
 * carries, and that nothing an administrator types can become code. Everything goes through the real HTTP routes of an in-process server, like projects.test.ts.
 */

vi.setConfig({ testTimeout: 60_000 })

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (path: string): Promise<any> => import(/* @vite-ignore */ pathToFileURL(join(root, path)).href)

let server: TestServer
let admin: { cookie: string; csrf: string }
const as = (who: { cookie: string; csrf: string }) => ({ Cookie: who.cookie, 'X-CSRF-Token': who.csrf })

beforeEach(async () => {
  server = await startServer({ env: { MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-media-demos-')) } })
  admin = await server.signIn('admin')
  seedProjects(server.app.context)
})
afterEach(async () => {
  await server.close()
})

const tri = (text: string) => ({ hu: `${text} hu`, en: `${text} en`, nl: `${text} nl` })
const emptyTri = { hu: '', en: '', nl: '' }

/** A document that can be published, so a new project can be tried at its public address too. */
const document = (title = 'Demo test'): Record<string, unknown> => ({
  title: tri(title),
  cardDescription: tri('Card'),
  summary: tri('Summary'),
  detailPage: true,
  projectStatus: 'concept',
  overview: { what: tri('What it is'), audience: emptyTri, problem: emptyTri, goal: emptyTri },
  tags: ['React'],
})

const idOf = (slug: string): number => server.db.get<{ id: number }>('SELECT id FROM projects WHERE slug = ?', [slug])!.id
const contentOf = async (slug: string) => (await server.api(`/api/admin/projects/${idOf(slug)}`, { headers: as(admin) })).json.data.content as Record<string, unknown> & { demo: { enabled: boolean; type: string; instructions: Record<string, string> } }
const save = (slug: string, demo: unknown) =>
  server.api(`/api/admin/projects/${idOf(slug)}`, {
    method: 'PUT',
    body: { content: { ...contentBase, demo }, expectedUpdatedAt: undefined },
    headers: as(admin),
  })
let contentBase: Record<string, unknown> = {}
const withBase = async (slug: string) => {
  contentBase = (await contentOf(slug)) as Record<string, unknown>
}
const publicDetail = async (slug: string) => (await server.api(`/api/projects/${slug}`)).json.data.detail as { demo: { type: string; instructions: Record<string, string> | null } | null }

describe('the closed list of demos', () => {
  it('is the same list on the server, in the website and in the editor', async () => {
    const website = await load('src/demos/ids.ts')
    const editor = await load('src/admin/lib/projects.ts')
    expect([...website.DEMO_TYPES]).toEqual([...DEMO_TYPES])
    expect([...editor.DEMO_TYPES]).toEqual([...DEMO_TYPES])
    expect(website.DEMO_PROJECTS).toEqual(DEMO_PROJECTS)
    expect(editor.DEMO_PROJECTS).toEqual(DEMO_PROJECTS)
    expect(website.INSTRUCTIONS_MAX).toBe(INSTRUCTIONS_MAX)
    expect(editor.DEMO_INSTRUCTIONS_MAX).toBe(INSTRUCTIONS_MAX)
    for (const slug of ['spendly', 'bookinghub', 'logistics-platform', 'hollandia', 'anything']) {
      expect(website.demoTypesFor(slug), slug).toEqual(demoTypesFor(slug))
      expect(editor.demoTypesFor(slug), slug).toEqual(demoTypesFor(slug))
    }
  })

  it('has a type for each real project that documents the behaviour, and none for a project that does not exist or has no page', () => {
    expect(demoTypesFor('spendly')).toEqual(['finance-workbench'])
    expect(demoTypesFor('bookinghub')).toEqual(['booking-flow'])
    expect(demoTypesFor('logistics-platform')).toEqual(['shipment-board'])
    expect(demoTypesFor('hollandia')).toEqual([])
    expect(demoTypesFor('')).toEqual([])
    expect(isEligible('booking-flow', 'spendly')).toBe(false)
  })

  it('recognises only its own names, never an inherited property or a path', () => {
    for (const bad of ['', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '../x', 'finance-workbench ', 'FINANCE-WORKBENCH', '<script>', null, undefined, 3, {}, []]) expect(isDemoType(bad), String(bad)).toBe(false)
    for (const good of DEMO_TYPES) expect(isDemoType(good)).toBe(true)
  })
})

describe('what an administrator may send', () => {
  const run = (demo: unknown) => normalizeContent({ ...document(), demo })

  it('stores a registered type with plain-text instructions, and defaults to a demo that is off', () => {
    expect(normalizeContent(document()).content.demo).toEqual(emptyDemo())
    const ok = run({ enabled: true, type: 'booking-flow', instructions: { hu: 'Magyar', en: 'English', nl: '' } })
    expect(ok.errors).toEqual({})
    expect(ok.content.demo).toEqual({ enabled: true, type: 'booking-flow', instructions: { hu: 'Magyar', en: 'English', nl: '' } })
  })

  it('refuses a type that is not in the list, whatever it looks like', () => {
    for (const type of ['unknown-demo', 'constructor', '__proto__', '../../etc/passwd', 'https://evil.example/demo.js', 'javascript:alert(1)', '<img onerror=alert(1)>', 7, true, {}, ['finance-workbench']]) {
      const { content, errors } = run({ enabled: true, type })
      expect(errors['content.demo.type'], JSON.stringify(type)).toBe('invalid')
      expect(content.demo.type, JSON.stringify(type)).toBe('')
    }
  })

  it('does not let a demo be switched on without a type', () => {
    expect(run({ enabled: true }).errors['content.demo.type']).toBe('required')
    expect(run({ enabled: true, type: '' }).errors['content.demo.type']).toBe('required')
    expect(run({ enabled: false, type: '' }).errors).toEqual({})
  })

  it('refuses a demo that is not an object, and a component name or code field it did not ask for is dropped, not stored', () => {
    expect(run('finance-workbench').errors['content.demo']).toBe('invalid')
    expect(run([]).errors['content.demo']).toBe('invalid')
    const stored = run({ enabled: true, type: 'finance-workbench', component: '../evil', code: 'alert(1)', html: '<b>x</b>', src: 'https://evil.example/x.js', instructions: emptyTri }).content.demo
    expect(Object.keys(stored).sort()).toEqual(['enabled', 'instructions', 'type'])
  })

  it('bounds the instructions and refuses what is not text', () => {
    expect(run({ enabled: false, instructions: { en: 'x'.repeat(INSTRUCTIONS_MAX) } }).errors).toEqual({})
    expect(run({ enabled: false, instructions: { en: 'x'.repeat(INSTRUCTIONS_MAX + 1) } }).errors['content.demo.instructions.en']).toBe('tooLong')
    expect(run({ enabled: false, instructions: { en: 5 } }).errors['content.demo.instructions.en']).toBe('invalid')
    expect(run({ enabled: false, instructions: 'text' }).errors['content.demo.instructions']).toBe('invalid')
  })

  it('keeps markup as text: it is stored as typed, never interpreted, and the website draws it as text', () => {
    const hostile = '<img src=x onerror=alert(1)><script>fetch("//evil.example")</script>'
    const stored = run({ enabled: true, type: 'finance-workbench', instructions: { hu: '', en: hostile, nl: '' } }).content.demo.instructions.en
    expect(stored).toContain('<script>')
    expect(typeof stored).toBe('string')
  })

  it('reads a document saved before demos existed as a demo that is off, and a damaged stored demo as off too', () => {
    expect(upgradeContent({ title: tri('Old') }).demo).toEqual(emptyDemo())
    expect(upgradeContent({ demo: { enabled: true, type: 'nonsense' } }).demo).toEqual({ ...emptyDemo(), enabled: false })
    expect(upgradeContent({ demo: 'x' }).demo).toEqual(emptyDemo())
    expect(upgradeContent({ demo: { enabled: true, type: 'booking-flow', instructions: { hu: 3 } } }).demo.instructions.hu).toBe('')
  })

  it('shows a visitor a demo only when it is on, registered and made for this project', () => {
    const on = { enabled: true, type: 'finance-workbench' as const, instructions: emptyTri }
    expect(publicDemo(on, 'spendly')).toEqual({ type: 'finance-workbench', instructions: null })
    expect(publicDemo(on, 'bookinghub')).toBeNull()
    expect(publicDemo({ ...on, enabled: false }, 'spendly')).toBeNull()
    expect(publicDemo({ ...on, type: '' }, 'spendly')).toBeNull()
    expect(publicDemo({ ...on, instructions: { hu: '', en: 'Hi', nl: '' } }, 'spendly')?.instructions).toEqual({ hu: '', en: 'Hi', nl: '' })
  })
})

describe('through the administration and the public answer', () => {
  it('ships the three real projects with their demos switched on, and the public answer says so', async () => {
    expect((await publicDetail('spendly')).demo).toEqual({ type: 'finance-workbench', instructions: null })
    expect((await publicDetail('bookinghub')).demo).toEqual({ type: 'booking-flow', instructions: null })
    expect((await publicDetail('logistics-platform')).demo).toEqual({ type: 'shipment-board', instructions: null })
  })

  it('lets an administrator turn a demo off, write instructions, and turn it on again; the public answer follows', async () => {
    await withBase('spendly')
    expect((await save('spendly', { enabled: false, type: 'finance-workbench', instructions: emptyTri })).status).toBe(200)
    expect((await publicDetail('spendly')).demo).toBeNull()
    const written = await save('spendly', { enabled: true, type: 'finance-workbench', instructions: { hu: 'Próbáld ki', en: 'Try it', nl: '' } })
    expect(written.status).toBe(200)
    expect((await publicDetail('spendly')).demo).toEqual({ type: 'finance-workbench', instructions: { hu: 'Próbáld ki', en: 'Try it', nl: '' } })
  })

  it('refuses a registered type for a project it was not made for, and says which field', async () => {
    await withBase('spendly')
    const refused = await save('spendly', { enabled: true, type: 'booking-flow', instructions: emptyTri })
    expect(refused.status).toBe(422)
    expect(refused.json.error.details.fields['content.demo.type']).toBe('invalid')
    // Nothing was stored: the demo is still the one the project had.
    expect((await publicDetail('spendly')).demo?.type).toBe('finance-workbench')
  })

  it('gives a new project no demo at all: no registered type suits its address', async () => {
    const made = await server.api('/api/admin/projects', { body: { slug: 'brand-new', category: 'apps', content: { ...document(), demo: { enabled: true, type: 'finance-workbench', instructions: emptyTri } } }, headers: as(admin) })
    expect(made.status).toBe(422)
    expect(made.json.error.details.fields['content.demo.type']).toBe('invalid')
    const plain = await server.api('/api/admin/projects', { body: { slug: 'brand-new', category: 'apps', content: document() }, headers: as(admin) })
    expect(plain.status).toBe(201)
    expect(plain.json.data.content.demo).toEqual({ enabled: false, type: '', instructions: emptyTri })
    await server.api(`/api/admin/projects/${plain.json.data.id}/publish`, { body: {}, headers: as(admin) })
    expect((await publicDetail('brand-new')).demo).toBeNull()
  })

  it('refuses hostile values over the wire: nothing is stored, the response says why, and no script runs anywhere', async () => {
    await withBase('bookinghub')
    for (const type of ['constructor', '<script>alert(1)</script>', 'https://evil.example/demo.js', '../finance']) {
      const response = await save('bookinghub', { enabled: true, type, instructions: emptyTri })
      expect(response.status, type).toBe(422)
    }
    expect((await publicDetail('bookinghub')).demo?.type).toBe('booking-flow')
    // Markup in the instructions is accepted as text and returned as text; the website draws it as text (src/demos/demos.test.ts).
    const hostile = '<img src=x onerror=alert(1)>'
    expect((await save('bookinghub', { enabled: true, type: 'booking-flow', instructions: { hu: '', en: hostile, nl: '' } })).status).toBe(200)
    expect((await publicDetail('bookinghub')).demo?.instructions?.en).toBe(hostile)
  })

  it('starts a copy of a project without its demo, because the copy has another address', async () => {
    const copy = await server.api(`/api/admin/projects/${idOf('spendly')}/duplicate`, { body: {}, headers: as(admin) })
    expect(copy.status).toBe(201)
    expect(copy.json.data.content.demo).toMatchObject({ enabled: false })
  })

  it('serves a project saved before demos existed as a project with no demo, and the editor reads it as off', async () => {
    const id = idOf('spendly')
    const row = server.db.get<{ content_json: string }>('SELECT content_json FROM projects WHERE id = ?', [id])!
    const old = JSON.parse(row.content_json)
    delete old.demo
    server.db.run('UPDATE projects SET content_json = ? WHERE id = ?', [JSON.stringify(old), id])
    expect((await publicDetail('spendly')).demo).toBeNull()
    expect((await contentOf('spendly')).demo).toEqual(emptyDemo())
  })

  it('requires the permission to write content: a visitor and a stranger cannot change a demo', async () => {
    await withBase('spendly')
    const response = await server.api(`/api/admin/projects/${idOf('spendly')}`, { method: 'PUT', body: { content: { ...contentBase, demo: { enabled: false, type: '', instructions: emptyTri } } } })
    expect([401, 403]).toContain(response.status)
    expect((await publicDetail('spendly')).demo?.type).toBe('finance-workbench')
  })
})
