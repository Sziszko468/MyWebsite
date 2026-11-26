#!/usr/bin/env node
/**
 * Command Center and Digital Archive against a REAL backend (PROMPT 37.1): the production build served by the project's own server with a new scratch database, in headless
 * Chrome. The stored data is then damaged and changed directly in that scratch database (a record that is not a category, a name missing in a language, an unknown and a
 * colliding category key, a draft, demos switched off) and both pages are read again in hu / en / nl: no key is readable, the filter and its shared address work, nothing
 * unpublished or switched off is listed, nothing private is asked for. The pages only send GET requests; the server is this script's own child process on 127.0.0.1:8810
 * and is stopped at the end. It never touches data outside its scratch folder.
 *
 * First build with the backend on the same origin, then run (AUDIT_PLAYWRIGHT: see tools/audit/README.md):
 *   VITE_API_URL=/ VITE_SITE_URL=https://example.test npm run build        (Git Bash: prefix MSYS_NO_PATHCONV=1)
 *   node tools/e2e/archive-backend-check.cjs
 * Afterwards build again with the usual settings: dist/ is left as built for this check.
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')
const { DatabaseSync } = require('node:sqlite')

const repo = path.join(__dirname, '..', '..')
const { launch, newPage } = require(path.join(repo, 'tools/audit/lib.cjs'))
const BASE = 'http://127.0.0.1:8810'
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-archive-backend-'))
// Nothing of the shell's mail, assistant or Google settings reaches the scratch server.
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(ANTHROPIC|AI_|SMTP|RESEND|GMAIL|GOOGLE|APP_|PUBLIC_URL|DATABASE_PATH|MEDIA_DIR|STATIC_DIR|BACKUP|DEPLOY)/.test(name)))
Object.assign(env, { APP_ENV: 'development', DATABASE_PATH: path.join(dir, 'app.sqlite'), MEDIA_DIR: path.join(dir, 'media'), STATIC_DIR: path.join(repo, 'dist'), PORT: '8810', HOST: '127.0.0.1' })

const results = []
const check = (name, condition, detail = '') => {
  results.push({ name, ok: Boolean(condition) })
  console.log(`  ${condition ? '✓' : '✗'} ${name}${!condition && detail ? `: ${detail}` : ''}`)
}

async function main() {
  if (!fs.existsSync(path.join(repo, 'dist', 'en', 'archive', 'index.html'))) throw new Error('No build in dist/: see the top of this file.')
  const log = fs.openSync(path.join(dir, 'server.log'), 'w')
  const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/src/main.ts'], { cwd: repo, env, stdio: ['ignore', log, log] })
  let browser
  try {
    for (let i = 0; ; i += 1) {
      if (server.exitCode !== null || i > 100) throw new Error(`the server did not start:\n${fs.readFileSync(path.join(dir, 'server.log'), 'utf8').slice(-1500)}`)
      if (await fetch(`${BASE}/api/projects`).then((r) => r.ok).catch(() => false)) break
      await new Promise((done) => setTimeout(done, 200))
    }
    browser = await launch()
    const asked = []
    const errors = []
    const visitor = async () => {
      const { page: fresh } = await newPage(browser, { width: 1440, height: 900 })
      fresh.on('request', (request) => asked.push(new URL(request.url()).pathname))
      fresh.on('pageerror', (error) => errors.push(error.message))
      fresh.on('console', (message) => message.type() === 'error' && !/WebGL|Failed to load resource/i.test(message.text()) && errors.push(message.text().slice(0, 160)))
      return fresh
    }
    let page = await visitor()

    const open = async (lang, route) => {
      await page.goto(`${BASE}/${lang}${route}`, { waitUntil: 'load' })
      await page.locator(route.startsWith('/archive') ? '[data-archive] h2' : '[data-command-center] [data-sector]').first().waitFor({ timeout: 30000 })
      await page.waitForFunction(() => !(document.querySelector('main')?.textContent || '').includes('…'), null, { timeout: 15000 }).catch(() => undefined)
      await page.waitForTimeout(500)
    }
    const read = () =>
      page.evaluate(() => {
        const main = document.querySelector('main')
        const spoken = [...main.querySelectorAll('[aria-label],[alt],[title]')].flatMap((e) => ['aria-label', 'alt', 'title'].map((a) => e.getAttribute(a) || ''))
        const category = main.querySelectorAll('select')[0]
        return {
          text: `${main.innerText}\n${spoken.join('\n')}`,
          ids: [...main.querySelectorAll('article')].map((a) => a.id),
          options: category ? [...category.options].filter((o) => o.value).map((o) => `${o.value}=${o.textContent}`) : [],
          selected: category?.value ?? null,
        }
      })

    console.log('the seeded backend')
    await open('en', '/archive')
    let seen = await read()
    const seededIds = seen.ids
    check('the archive reads the backend', asked.includes('/api/projects'), asked.filter((p) => p.startsWith('/api')).join(','))
    check('the seeded category names show', seen.options.some((o) => o.startsWith('apps=Web and mobile apps')), seen.options.join(' | '))
    console.log(`    · entries: ${seededIds.join(' ')}`)

    console.log('the stored data damaged and changed')
    const db = new DatabaseSync(env.DATABASE_PATH)
    db.exec('PRAGMA busy_timeout = 5000')
    const tri = (hu, en, nl) => ({ hu, en, nl })
    db.prepare("UPDATE settings SET value = ? WHERE key = 'projects.categories'").run(
      JSON.stringify([null, 'apps', { key: 'apps', label: tri('', 'Apps, as supplied', '   ') }, { key: 'apps', label: tri('Második', 'Second', 'Tweede') }, { key: 'creative-coding', label: tri('Ügyfélkampányok', 'Client campaigns', 'Campagnes') }]),
    )
    db.prepare("UPDATE projects SET category = 'zz-secret-key' WHERE slug = 'logistics-platform'").run()
    db.prepare("UPDATE projects SET category = 'creative-coding' WHERE slug = 'bookinghub'").run()
    db.prepare("UPDATE projects SET status = 'draft' WHERE slug = 'hollandia'").run()
    // The demos: on for two projects, off for one, whatever the seed says.
    for (const [slug, demo] of [['spendly', { enabled: false, type: 'finance-workbench' }], ['bookinghub', { enabled: true, type: 'booking-flow' }], ['logistics-platform', { enabled: true, type: 'shipment-board' }]]) {
      const row = db.prepare('SELECT content_json FROM projects WHERE slug = ?').get(slug)
      const content = JSON.parse(row.content_json)
      content.demo = { ...demo, instructions: tri('', '', '') }
      db.prepare('UPDATE projects SET content_json = ? WHERE slug = ?').run(JSON.stringify(content), slug)
    }
    db.close()
    // The public answers may be cached by a browser for 30 s: the changed data is read by a new visitor.
    page = await visitor()

    const api = await fetch(`${BASE}/api/projects`)
    check('the public list still answers 200 with a malformed category record stored', api.status === 200, String(api.status))
    const expected = {
      en: { named: 'Apps, as supplied', unnamed: 'Unnamed category' },
      hu: { named: 'Második', unnamed: 'Névtelen kategória' },
      nl: { named: 'Tweede', unnamed: 'Naamloze categorie' },
    }
    for (const lang of ['en', 'hu', 'nl']) {
      await open(lang, '/archive')
      seen = await read()
      check(`${lang}: no category key is readable`, !/zz-secret-key|creative-coding/.test(seen.text), seen.text.match(/.{0,40}(zz-secret-key|creative-coding).{0,20}/)?.[0])
      check(`${lang}: the unnamed category has the neutral words and keeps its key as the value`, seen.options.some((o) => o.startsWith(`zz-secret-key=${expected[lang].unnamed} (`)), seen.options.join(' | '))
      check(`${lang}: the first readable name counts, as supplied`, seen.options.some((o) => o.startsWith(`apps=${expected[lang].named} (`)), seen.options.join(' | '))
      check(`${lang}: the CMS category with the Lab's key is its own choice, the Lab keeps six`, seen.options.some((o) => o.startsWith('project.creative-coding=')) && seen.options.some((o) => /^creative-coding=.*\(6\)$/.test(o)), seen.options.join(' | '))
      check(`${lang}: the draft is gone, the Lab is six, the tool one`, !seen.ids.includes('entry-project-hollandia') && seen.ids.filter((i) => i.startsWith('entry-lab-')).length === 6 && seen.ids.filter((i) => i.startsWith('entry-tool-')).length === 1, seen.ids.join(' '))
      check(`${lang}: only the demos switched on are listed`, JSON.stringify(seen.ids.filter((i) => i.startsWith('entry-demo-')).sort()) === JSON.stringify(['entry-demo-bookinghub', 'entry-demo-logistics-platform']), seen.ids.join(' '))
    }
    await open('en', '/archive?category=zz-secret-key')
    seen = await read()
    check('a shared address filters by the unnamed category and survives a reload', JSON.stringify(seen.ids) === JSON.stringify(['entry-project-logistics-platform', 'entry-demo-logistics-platform']) && seen.selected === 'zz-secret-key', `${seen.ids} / ${seen.selected}`)
    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-archive] article').first().waitFor()
    await page.waitForTimeout(800)
    check('after the reload', new URL(page.url()).search === '?category=zz-secret-key' && (await read()).selected === 'zz-secret-key', page.url())
    await open('en', '/archive?category=creative-coding')
    check('the Lab’s address still means the six experiences', (await read()).ids.every((i) => i.startsWith('entry-lab-')) && (await read()).ids.length === 6)
    await open('en', '/command-center')
    seen = await read()
    check('the Command Center shows no key and no draft', !/zz-secret-key|Hollandia/.test(seen.text), seen.text.match(/.{0,40}(zz-secret-key|Hollandia).{0,20}/)?.[0])
    // An administrator's preview flag, signed out: the public list.
    await open('en', '/archive?preview=1')
    const secret = asked.filter((p) => /^\/api\/(admin|portal|preview|quotes|requests|booking)(\/|$)/.test(p))
    check('no private address was asked for, the preview flag included', secret.length === 0, [...new Set(secret)].join(' '))
    console.log(`    · API paths asked for by the pages: ${[...new Set(asked.filter((p) => p.startsWith('/api')))].sort().join(' ')}`)
    check('no page error and no console error', errors.length === 0, errors.slice(0, 4).join(' || '))
  } finally {
    await browser?.close()
    server.kill()
  }
  const failed = results.filter((r) => !r.ok).length
  console.log(`${results.length - failed} / ${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
}
main().catch((error) => {
  console.error(error)
  process.exit(2)
})
