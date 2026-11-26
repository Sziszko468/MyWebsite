import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { startServer, type TestServer } from './helpers.ts'

/**
 * PROMPT 37.1: the website served by this process redirects an address without the final slash to its slash form. What follows the `?` is part of the address a visitor shared
 * (the Digital Archive keeps its search and filters there), so it goes along.
 */

let server: TestServer | null = null
const folders: string[] = []

function website(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cc-static-redirect-'))
  folders.push(dir)
  mkdirSync(join(dir, 'en', 'archive'), { recursive: true })
  writeFileSync(join(dir, 'en', 'archive', 'index.html'), '<!doctype html><title>archive</title>')
  writeFileSync(join(dir, '404.html'), '<!doctype html><title>404</title>')
  return dir
}

afterEach(async () => {
  await server?.close()
  server = null
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('the redirect to the slash form', () => {
  it.each([
    ['/en/archive', '/en/archive/'],
    ['/en/archive?category=apps', '/en/archive/?category=apps'],
    ['/en/archive?q=a%20b+c&kind=lab&sort=name-desc', '/en/archive/?q=a%20b+c&kind=lab&sort=name-desc'],
    ['/en/archive?category=project.creative-coding', '/en/archive/?category=project.creative-coding'],
    ['/en/archive?', '/en/archive/'],
  ])('sends %s to %s', async (asked, expected) => {
    server = await startServer({ seed: false, env: { STATIC_DIR: website() } })
    const response = await server.fetch(asked)
    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe(expected)
    const arrived = await server.fetch(expected)
    expect(arrived.status).toBe(200)
    expect(await arrived.text()).toContain('<title>archive</title>')
  })

  it('cannot be made to put anything else into the header', async () => {
    server = await startServer({ seed: false, env: { STATIC_DIR: website() } })
    const response = await server.fetch('/en/archive?q=%0d%0aSet-Cookie:%20x=1')
    expect(response.status).toBe(301)
    expect(response.headers.get('location')).toBe('/en/archive/?q=%0d%0aSet-Cookie:%20x=1')
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
