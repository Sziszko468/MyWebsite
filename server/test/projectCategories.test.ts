import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { categories, seedProjects } from '../src/modules/projects/service.ts'
import { setSetting } from '../src/modules/system/settings.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * PROMPT 37.1: what the public project list says about categories. The administration validates what it saves, but the stored value is read back from the database: a record that is
 * not a category must not take the public list down (the website would then fall back to its built-in copy, which can show what the administrator has since unpublished), and the
 * public answer must only name the categories of published projects.
 */

vi.setConfig({ testTimeout: 60_000 })

let server: TestServer
beforeEach(async () => {
  server = await startServer({ env: { MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-media-categories-')) } })
  seedProjects(server.app.context)
})
afterEach(async () => {
  await server.close()
})

const store = (value: string) => setSetting(server.db, server.app.context.clock, 'projects.categories', value, null)
type Answer = { status: number; json: { data: Array<{ slug: string; category: string }>; meta: { categories: Array<{ key: string; label: unknown }> } } }
const publicList = async (): Promise<Answer> => (await server.api('/api/projects')) as unknown as Answer

describe('the public categories', () => {
  it('answers the public list when the stored categories hold records that are not categories, and passes on only the usable ones', async () => {
    store(JSON.stringify([null, 5, 'apps', [], { label: { en: 'No key' } }, { key: 7 }, { key: 'apps' }, { key: 'platforms', label: { hu: 'Rendszerek', en: 'Systems', nl: 'Systemen' } }, { key: 'concepts', label: 'text' }]))
    const answer = await publicList()
    expect(answer.status).toBe(200)
    expect(answer.json.data.length).toBe(4)
    const empty = { hu: '', en: '', nl: '' }
    expect(answer.json.meta.categories).toEqual([
      { key: 'apps', label: empty },
      { key: 'platforms', label: { hu: 'Rendszerek', en: 'Systems', nl: 'Systemen' } },
      { key: 'concepts', label: empty },
    ])
  })

  it('keeps a name exactly as it is stored', async () => {
    const label = { hu: '  Appok – 2. ', en: 'APPS & more', nl: 'Apps (bèta)' }
    store(JSON.stringify([{ key: 'apps', label }]))
    expect(categories(server.app.context)).toEqual([{ key: 'apps', label }])
  })

  it.each([['not JSON', '{'], ['not a list', '{"key":"apps"}']])('answers the public list with no categories when the stored value is %s', async (_what, value) => {
    store(value)
    const answer = await publicList()
    expect(answer.status).toBe(200)
    expect(answer.json.data.length).toBe(4)
    expect(answer.json.meta.categories).toEqual([])
  })

  it('names no category that only an unpublished project uses', async () => {
    server.db.run("UPDATE projects SET status = 'draft' WHERE category = 'concepts'")
    server.db.run("UPDATE projects SET status = 'archived' WHERE category = 'platforms'")
    const answer = await publicList()
    expect(answer.json.data.every((project) => project.category === 'apps')).toBe(true)
    expect(answer.json.meta.categories.map((category) => category.key)).toEqual(['apps'])
  })
})
