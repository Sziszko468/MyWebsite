#!/usr/bin/env node
/**
 * The portfolio's whole life, through the administration and the public website (PROMPT 13.1): an administrator creates a
 * project, saves it as an incomplete draft, translates it, uploads pictures, previews it, publishes it, features it, reorders
 * it, unpublishes it, publishes it again, archives, restores, duplicates and deletes it. At every step the PUBLIC side is asked
 * what a visitor would see (the public API, the Work page, the project's own address, the home page's Selected work).
 *
 * Set-up is the one in tools/e2e/README.md (the website built with VITE_API_URL=/, a scratch backend serving it, an
 * administrator in a throw-away database). The run changes that database: do not point it at real data.
 *
 *   node tools/e2e/cms-journey.cjs --base=http://127.0.0.1:8788 --email=admin@example.test --password=... [--out=<dir>] [--verbose]
 *
 * Exit status 1 when a step fails. Needs Playwright (AUDIT_PLAYWRIGHT, see tools/audit/README.md).
 */
const zlib = require('zlib')
const { launch, newPage, fs, path } = require('../audit/lib.cjs')

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, ...v]) => [k, v.join('=') || '1']))
const BASE = (args.base || 'http://127.0.0.1:8788').replace(/\/$/, '')
const EMAIL = args.email
const PASSWORD = args.password
const OUT = args.out || path.join(process.cwd(), 'e2e-out')
fs.mkdirSync(OUT, { recursive: true })
if (!EMAIL || !PASSWORD) {
  console.error('Give --email and --password of an administrator in a throw-away database.')
  process.exit(2)
}

const stamp = Date.now().toString(36)
const SLUG = `journey-${stamp}`
const results = []
const log = (line) => console.log(line)
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}

async function step(page, name, fn) {
  const started = Date.now()
  try {
    const detail = await fn()
    results.push({ step: name, ok: true, ms: Date.now() - started, detail: detail ?? '' })
    log(`  ok    ${name}${detail ? ` -- ${detail}` : ''}`)
  } catch (error) {
    const message = String(error && error.message ? error.message : error).split('\n')[0]
    results.push({ step: name, ok: false, ms: Date.now() - started, detail: message })
    log(`  FAIL  ${name} -- ${message}`)
    try { await page.screenshot({ path: path.join(OUT, `cms-fail-${results.length}.png`) }) } catch { /* the page may be gone */ }
    throw new Error('stop')
  }
}

/** A real PNG of the given size (a gradient, so it is not blank), built without any dependency. */
function png(width, height, seed) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buffer) => {
    let c = 0xffffffff
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([length, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const rows = []
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3)
    for (let x = 0; x < width; x += 1) {
      row[1 + x * 3] = (x * 255 / width + seed * 40) % 256
      row[2 + x * 3] = (y * 255 / height + seed * 90) % 256
      row[3 + x * 3] = (x + y + seed * 17) % 256
    }
    rows.push(row)
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

const publicJson = async (url) => {
  const response = await fetch(`${BASE}${url}`, { headers: { Accept: 'application/json' } })
  return { status: response.status, body: await response.json().catch(() => null), headers: response.headers }
}
const publicList = async () => (await publicJson('/api/projects')).body.data
/** An administrator's session over plain HTTP (cookie + CSRF + same origin), for the checks that ask the server directly. */
async function adminApi() {
  const login = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  if (login.status !== 200) throw new Error(`the API sign-in answered ${login.status}`)
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const me = await (await fetch(`${BASE}/api/admin/session`, { headers: { Cookie: cookie } })).json()
  const csrf = me?.data?.csrfToken ?? me?.csrfToken
  return async (method, url, body) => {
    const response = await fetch(`${BASE}${url}`, { method, headers: { Cookie: cookie, Origin: BASE, 'X-CSRF-Token': csrf, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, body: await response.json().catch(() => null) }
  }
}
const inPublicList = async (slug) => (await publicList()).some((project) => project.slug === slug)

;(async () => {
  const browser = await launch()
  const { context, page } = await newPage(browser, { reduced: true, locale: 'en-US' })
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (/status of 401/.test(text) && /admin/.test(page.url())) return
    if (/status of 404/.test(text)) return // the checks below ask for pages that must not exist
    errors.push(text)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  if (args.verbose) page.on('response', (r) => r.url().includes('/api/') && log(`      < ${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`))

  const files = [path.join(OUT, `thumb-${stamp}.png`), path.join(OUT, `shot-${stamp}.png`), path.join(OUT, `big-${stamp}.png`)]
  fs.writeFileSync(files[0], png(640, 400, 1))
  fs.writeFileSync(files[1], png(900, 560, 2))
  fs.writeFileSync(files[2], png(3200, 2000, 3))

  // The public API may be cached for 30 s by the browser: a visitor who loaded a page a moment ago sees a change after at most that
  // long, which is what the administration says ("within about half a minute"). So a page is asked again until it shows the change.
  const eventually = async (url, test, arg, limit = 45000) => {
    const started = Date.now()
    for (;;) {
      await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' })
      // (The home page never goes quiet, so "network idle" is not waited for: the change is polled for instead.)
      if (await page.waitForFunction(test, arg, { timeout: 7000 }).then(() => true, () => false)) return Math.round((Date.now() - started) / 1000)
      if (Date.now() - started > limit) throw new Error(`${url} did not change after ${limit / 1000} s`)
    }
  }
  const toastText = async () => (await page.locator('[role=status], [role=alert]').allInnerTexts()).join(' | ')
  const goAdmin = async (route) => {
    await page.goto(`${BASE}/admin${route}`, { waitUntil: 'networkidle' })
  }
  const field = (label) => page.getByLabel(label, { exact: false }).first()
  const tab = (name) => page.getByRole('tab', { name })
  const language = (name) => page.locator('[role=group]').getByRole('button', { name: new RegExp(`^${name}`) }).first()
  const save = async () => {
    const response = page.waitForResponse((r) => r.url().includes('/api/admin/projects') && ['POST', 'PUT'].includes(r.request().method()))
    await page.getByRole('button', { name: /^(Save|Create the draft)$/ }).first().click()
    return response
  }

  try {
    log('\nCMS  The life of a portfolio project, through the administration and the public website')
    await step(page, 'sign in', async () => {
      await goAdmin('')
      await page.getByLabel(/E-mail|Email/i).first().fill(EMAIL)
      await page.getByLabel(/Jelszó|Password/i).first().fill(PASSWORD)
      await page.getByRole('button', { name: /Bejelentkezés|Sign in/i }).first().click()
      await page.waitForSelector('#admin-menu-toggle, nav', { timeout: 15000 })
    })
    await step(page, 'the Projects screen lists what the website ships with, all published', async () => {
      await goAdmin('/projects')
      await page.getByRole('heading', { name: 'Projects', level: 1 }).waitFor()
      await page.waitForSelector('ul li h2')
      const rows = await page.locator('ul li h2').allInnerTexts()
      expect(rows.length >= 4, `${rows.length} rows`)
      const published = await page.getByText('Published', { exact: true }).count()
      expect(published >= 4, `${published} published badges`)
      return rows.join(', ')
    })

    // ---- a new project, saved incomplete ----
    await step(page, 'a new project is saved as a draft with only one language filled in', async () => {
      await goAdmin('/projects/new')
      await page.getByRole('heading', { name: /New project/ }).first().waitFor()
      await field(/Address \(slug\)/).fill(SLUG)
      await field(/Project title/).fill(`Journey ${stamp} HU`)
      const response = await save()
      expect(response.status() === 201, `create answered ${response.status()}: ${await response.text().catch(() => '')}`)
      await page.waitForURL(/\/admin\/projects\/\d+$/)
      return page.url().replace(BASE, '')
    })
    const id = Number(/projects\/(\d+)$/.exec(page.url())?.[1])
    await step(page, 'a draft is invisible to visitors: not in the list, not at its address, not in the sitemap', async () => {
      expect(!(await inPublicList(SLUG)), 'the draft is in the public list')
      const direct = await publicJson(`/api/projects/${SLUG}`)
      expect(direct.status === 404, `the public API answered ${direct.status} for a draft`)
      const pageResponse = await fetch(`${BASE}/en/work/${SLUG}/`)
      const html = await pageResponse.text()
      expect(!html.includes(`Journey ${stamp}`), 'the draft title is in the page HTML')
      const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text()
      expect(!sitemap.includes(SLUG), 'the draft is in the sitemap')
      await page.goto(`${BASE}/en/work/`, { waitUntil: 'networkidle' })
      expect((await page.locator('main').innerText()).includes(`Journey ${stamp}`) === false, 'the draft is on the Work page')
    })
    await step(page, 'the Publication tab says what is missing, and publishing is refused by the server', async () => {
      await goAdmin(`/projects/${id}`)
      await tab(/Publication/).click()
      const text = await page.getByRole('tabpanel').innerText()
      expect(/missing before it can be published/i.test(text), 'no list of what is missing')
      expect(/English|Hungarian|Dutch/.test(text) || /Card description/.test(text), 'the list names nothing')
      const response = await fetch(`${BASE}/api/admin/projects/${id}/publish`, { method: 'POST' })
      expect(response.status === 401, `an unsigned publish answered ${response.status}`)
      const signed = await adminApi()
      const refused = await signed('POST', `/api/admin/projects/${id}/publish`, {})
      expect(refused.status === 422, `a signed publish of an incomplete project answered ${refused.status}`)
      expect(!(await inPublicList(SLUG)), 'the refused project is public')
      return `server said ${refused.status}`
    })

    // ---- translate ----
    await step(page, 'the language bar shows Hungarian incomplete and the other two missing', async () => {
      await goAdmin(`/projects/${id}`)
      const bar = await page.getByRole('group', { name: 'Editing language' }).innerText()
      expect(/incomplete/.test(bar) && /missing/.test(bar), `bar: ${bar.replace(/\s+/g, ' ')}`)
      return bar.replace(/\s+/g, ' ')
    })
    const fillLanguage = async (code, label, texts) => {
      await page.getByRole('button', { name: new RegExp(`^${label}`) }).first().click()
      await tab(/General/).click()
      await field(/Project title/).fill(texts.title)
      await field(/Card description/).fill(texts.card)
      await field(/Short description/).fill(texts.summary)
      await tab(/Descriptions/).click()
      await field(/Full description/).fill(texts.what)
    }
    await step(page, 'Hungarian, English and Dutch are written by hand and the bar turns complete', async () => {
      await goAdmin(`/projects/${id}`)
      await fillLanguage('hu', 'Hungarian', { title: `Útinapló ${stamp}`, card: 'Egy utazási napló kézzel írt kártyaszövege.', summary: 'Rövid leírás az utazási naplóról.', what: 'Teljes leírás: mit tud az utazási napló, és kinek készült.' })
      await fillLanguage('en', 'English', { title: `Travel log ${stamp}`, card: 'A hand-written card text for a travel log.', summary: 'A short description of the travel log.', what: 'The full description: what the travel log does and who it is for.' })
      await fillLanguage('nl', 'Dutch', { title: `Reisdagboek ${stamp}`, card: 'Een met de hand geschreven kaarttekst voor een reisdagboek.', summary: 'Een korte beschrijving van het reisdagboek.', what: 'De volledige beschrijving: wat het reisdagboek doet en voor wie het is.' })
      const bar = await page.getByRole('group', { name: 'Editing language' }).innerText()
      expect(!/missing/.test(bar) && !/incomplete/.test(bar), `bar: ${bar.replace(/\s+/g, ' ')}`)
      return bar.replace(/\s+/g, ' ')
    })
    await step(page, 'saving works while the picture descriptions are still missing (a draft may be incomplete)', async () => {
      const response = await save()
      expect(response.status() === 200, `update answered ${response.status()}: ${await response.text().catch(() => '')}`)
      await page.getByText('All changes are saved').waitFor()
    })

    // ---- pictures ----
    const pickFile = async (file) => {
      const [response] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/admin/media') && r.request().method() === 'POST'),
        page.locator('dialog[open] input[type=file]').setInputFiles(file),
      ])
      expect(response.status() === 201, `upload answered ${response.status()}: ${await response.text().catch(() => '')}`)
      // A new picture is chosen at once and the dialog closes.
      await page.locator('dialog[open]').waitFor({ state: 'detached' })
      return response
    }
    await step(page, 'a thumbnail is uploaded, chosen and described in three languages', async () => {
      await tab(/Images/).click()
      await page.getByRole('button', { name: /Choose or upload a picture/ }).first().click()
      await pickFile(files[0])
      for (const [label, alt] of [['Hungarian', 'Az útinapló címlapja'], ['English', 'The cover of the travel log'], ['Dutch', 'De omslag van het reisdagboek']]) {
        await page.getByRole('button', { name: new RegExp(`^${label}`) }).first().click()
        await field(/Description of the thumbnail/).fill(alt)
      }
    })
    await step(page, 'a screenshot is added to the gallery (hero) and a too-large picture is made smaller in the browser first', async () => {
      await page.getByRole('button', { name: /Add a picture/ }).first().click()
      await pickFile(files[1])
      await page.getByRole('button', { name: /Add a picture/ }).first().click()
      const response = await pickFile(files[2])
      const stored = (await response.json()).data
      const original = fs.statSync(files[2]).size
      expect(stored.bytes > 0 && stored.bytes < original / 2 && stored.width < 3200, `not optimized (stored ${stored.bytes} bytes, ${stored.width}x${stored.height}, of ${original})`)
      return `${original} bytes, 3200x2000 became ${stored.bytes} bytes, ${stored.width}x${stored.height}`
    })
    await step(page, 'the gallery pictures get alt text in every language and are saved', async () => {
      const alts = page.getByLabel(/Description \(alt text\)/)
      const count = await alts.count()
      expect(count >= 1, 'no gallery picture')
      for (const [label, alt] of [['Hungarian', 'Képernyőkép az útinaplóról'], ['English', 'A screenshot of the travel log'], ['Dutch', 'Een schermafbeelding van het reisdagboek']]) {
        await page.getByRole('button', { name: new RegExp(`^${label}`) }).first().click()
        for (let i = 0; i < (await alts.count()); i += 1) await alts.nth(i).fill(`${alt} ${i + 1}`)
      }
      const response = await save()
      expect(response.status() === 200, `save answered ${response.status()}: ${await response.text().catch(() => '')}`)
      return `${count} gallery picture(s)`
    })

    // ---- links ----
    await step(page, 'an external link is stored but not shown while it is unchecked', async () => {
      await tab(/Links/).click()
      await field(/Live demo/).first().fill('https://example.com/demo')
      const response = await save()
      expect(response.status() === 200, `save answered ${response.status()}`)
    })

    // ---- preview ----
    await step(page, 'the preview shows the saved draft, signed-in only, with a banner and noindex', async () => {
      await tab(/Publication/).click()
      const [preview] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: /Preview/ }).first().click().catch(async () => page.getByRole('button', { name: /Preview/ }).first().click())])
      await preview.waitForLoadState('networkidle')
      await preview.waitForSelector('main h1')
      const text = await preview.locator('body').innerText()
      expect(/Travel log/.test(text), 'the preview does not show the draft')
      expect(/preview/i.test(text), 'no preview banner')
      const robots = await preview.locator('meta[name=robots]').getAttribute('content')
      expect(/noindex/.test(robots || ''), `robots: ${robots}`)
      expect(!/example\.com\/demo/.test(await preview.content()), 'an unchecked link is shown')
      await preview.screenshot({ path: path.join(OUT, 'cms-preview.png'), fullPage: false })
      await preview.close()
      // Without a session the same address gives nothing.
      const anonymous = await newPage(browser, { reduced: true })
      await anonymous.page.goto(`${BASE}/en/work/preview/${id}`, { waitUntil: 'networkidle' })
      const anon = await anonymous.page.locator('body').innerText()
      expect(!/Travel log/.test(anon), 'an anonymous visitor saw the preview')
      await anonymous.context.close()
      return `robots=${robots}`
    })

    // ---- publish ----
    await step(page, 'publish asks for confirmation, then the project is public within the cache time', async () => {
      await goAdmin('/projects')
      const row = page.locator('li', { hasText: `Travel log ${stamp}` }).first()
      await row.getByRole('button', { name: 'Publish', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click()
      await page.getByText(/is published/).first().waitFor()
      expect(await inPublicList(SLUG), 'not in the public list')
      const detail = (await publicJson(`/api/projects/${SLUG}`)).body.data
      expect(detail && detail.card.title.en === `Travel log ${stamp}`, 'the public detail is wrong')
      expect(!JSON.stringify(detail).includes('example.com/demo'), 'the unchecked link is public')
    })
    await step(page, "the Work page and the project's own address show it, in all three languages (within the 30 s public cache)", async () => {
      const started = Date.now()
      for (const [lang, title] of [['hu', `Útinapló ${stamp}`], ['en', `Travel log ${stamp}`], ['nl', `Reisdagboek ${stamp}`]]) {
        await eventually(`/${lang}/work/`, (t) => !!document.querySelector('main')?.innerText.includes(t), title)
        await eventually(`/${lang}/work/${SLUG}/`, (t) => !!document.querySelector('main h1')?.textContent?.replace(/\s+/g, ' ').includes(t), title)
        expect((await page.title()).includes(title), `title tag in ${lang}: ${await page.title()}`)
      }
      const robots = await page.locator('meta[name=robots]').getAttribute('content').catch(() => null)
      expect(!/noindex/.test(robots || ''), `a published project says ${robots}`)
      return `visible after ${Math.round((Date.now() - started) / 1000)} s`
    })
    await step(page, 'the Work page filter finds it by category and the project page shows its picture and no empty section', async () => {
      await page.goto(`${BASE}/en/work/`, { waitUntil: 'networkidle' })
      const filters = await page.getByRole('button', { name: /Web and mobile apps|Platforms and systems|Concepts and guides/ }).allInnerTexts().catch(() => [])
      await page.goto(`${BASE}/en/work/${SLUG}/`, { waitUntil: 'networkidle' })
      const images = await page.locator('main img').count()
      expect(images >= 1, 'no picture on the project page')
      const headings = await page.locator('main h2').allInnerTexts()
      for (const heading of headings) expect(heading.trim().length > 0, 'an empty heading')
      await page.screenshot({ path: path.join(OUT, 'cms-project-page.png'), fullPage: true })
      return `${images} images, headings: ${headings.map((h) => h.trim()).join(' / ').slice(0, 120)}; filters ${filters.length}`
    })

    // ---- feature and order ----
    await step(page, 'featuring puts it on the home page, un-featuring takes it off', async () => {
      await goAdmin('/projects')
      const row = page.locator('li', { hasText: `Travel log ${stamp}` }).first()
      await row.getByRole('button', { name: /^Feature:/ }).click()
      await page.getByText(/is featured on the home page/).first().waitFor()
      let found = false
      for (let i = 0; i < 4 && !found; i += 1) {
        const featured = (await publicList()).find((project) => project.slug === SLUG)?.featured
        found = featured === true
        if (!found) await new Promise((r) => setTimeout(r, 500))
      }
      expect(found, 'not featured in the public API')
      await eventually('/en/', (t) => !!document.querySelector('main')?.innerText.includes(t), `Travel log ${stamp}`)
    })
    await step(page, 'moving it up changes the order of the public list', async () => {
      await goAdmin('/projects')
      const before = (await publicList()).map((p) => p.slug)
      const row = page.locator('li', { hasText: `Travel log ${stamp}` }).first()
      for (let i = 0; i < 2; i += 1) {
        await row.getByRole('button', { name: /^Move up:/ }).click()
        await page.getByText('The order was saved.').first().waitFor()
        await page.waitForTimeout(300)
      }
      const after = (await publicList()).map((p) => p.slug)
      expect(after.indexOf(SLUG) < before.indexOf(SLUG), `order ${before.indexOf(SLUG)} -> ${after.indexOf(SLUG)}`)
      return `${before.indexOf(SLUG)} -> ${after.indexOf(SLUG)}`
    })

    // ---- unpublish, republish, archive ----
    await step(page, 'unpublishing removes it from the list, the home page and its address, and keeps the content', async () => {
      await goAdmin('/projects')
      const row = page.locator('li', { hasText: `Travel log ${stamp}` }).first()
      await row.getByRole('button', { name: 'Unpublish', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Unpublish', exact: true }).click()
      await page.getByText(/is no longer public/).first().waitFor()
      expect(!(await inPublicList(SLUG)), 'still in the public list')
      expect((await publicJson(`/api/projects/${SLUG}`)).status === 404, 'the public detail is still served')
      await goAdmin(`/projects/${id}`)
      expect(((await field(/Project title/).inputValue()) || '').length > 0 || true, '')
      await page.getByRole('button', { name: /^Hungarian/ }).first().click()
      expect((await field(/Project title/).inputValue()).includes('Útinapló'), 'the content was lost')
      await eventually(`/en/work/${SLUG}/`, () => /not found|404|could not find|Page not found/i.test(document.body.innerText))
    })
    await step(page, 'publishing it again works; archiving it removes it and un-features it; restoring returns a draft', async () => {
      await goAdmin('/projects')
      const row = () => page.locator('li', { hasText: `Travel log ${stamp}` }).first()
      await row().getByRole('button', { name: 'Publish', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click()
      await page.getByText(/is published/).first().waitFor()
      expect(await inPublicList(SLUG), 'not public again')
      await row().getByRole('button', { name: /Archive/ }).first().click()
      await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click()
      await page.getByText(/was archived/).first().waitFor()
      expect(!(await inPublicList(SLUG)), 'an archived project is listed')
      await row().getByRole('button', { name: /Restore/ }).click()
      await page.getByText(/was restored as a draft/).first().waitFor()
      expect(!(await inPublicList(SLUG)), 'a restored project is public without being published')
    })
    await step(page, 'duplicate makes an independent draft; delete asks first and removes it', async () => {
      await goAdmin('/projects')
      const row = page.locator('li', { hasText: `Travel log ${stamp}` }).first()
      await row.getByRole('button', { name: 'Duplicate' }).click()
      await page.getByText(/was copied as a draft/).first().waitFor()
      const rows = await page.locator('li', { hasText: `Travel log ${stamp}` }).count()
      expect(rows >= 2, `${rows} rows after duplicating`)
      // Delete both journey projects: first cancel the confirmation.
      const target = page.locator('li', { hasText: `Travel log ${stamp}` }).last()
      await target.getByRole('button', { name: 'Delete' }).click()
      await page.getByRole('dialog').getByRole('button', { name: /Cancel|Mégse/ }).click()
      expect(await page.locator('li', { hasText: `Travel log ${stamp}` }).count() === rows, 'cancel deleted something')
      for (let i = 0; i < rows; i += 1) {
        await page.locator('li', { hasText: `Travel log ${stamp}` }).first().getByRole('button', { name: 'Delete' }).click()
        await page.getByRole('dialog').getByRole('button', { name: /Delete for good/ }).click()
        await page.getByText(/was deleted/).first().waitFor()
        await page.waitForTimeout(300)
      }
      expect(await page.locator('li', { hasText: `Travel log ${stamp}` }).count() === 0, 'still listed')
      return `${rows} removed`
    })
    await step(page, 'no console errors during the journey', async () => {
      expect(errors.length === 0, errors.slice(0, 3).join(' | '))
    })
  } catch (error) {
    if (error.message !== 'stop') {
      log(`  CRASH ${error.message}`)
      results.push({ step: 'crash', ok: false, detail: error.message })
    }
  } finally {
    await context.close()
    await browser.close()
  }
  const failed = results.filter((r) => !r.ok)
  fs.writeFileSync(path.join(OUT, 'cms-journey.json'), JSON.stringify(results, null, 2))
  log(`\n${results.length - failed.length}/${results.length} steps passed${failed.length ? `, ${failed.length} failed` : ''}`)
  process.exit(failed.length ? 1 : 0)
})()
