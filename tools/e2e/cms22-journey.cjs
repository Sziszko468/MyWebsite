#!/usr/bin/env node
/**
 * The portfolio CMS completion (PROMPT 22), through the administration and the public website, at one screen width.
 *
 * Signs in through the administration, then follows ONE project (hand-written in Hungarian, English and Dutch, with services, content blocks, search
 * and sharing words, pictures) from a draft nobody can see, through a preview link opened by somebody with no account, to publication in the three
 * languages (the page, its head, the sitemap), an edit, a picture replaced in the library, the About page and contact details changed in the
 * administration, and back to a draft that has left every list, the sitemap and the pages. Every step also asks the PUBLIC side what a visitor sees.
 * The administration is driven by hand where a screen is what is being checked (sign-in, the list's search, the editor's tabs, preview links, the
 * picture library, the profile); the project's own text is entered through the API, because typing three languages of text proves nothing new
 * (that was done by tools/e2e/cms-journey.cjs).
 *
 * Set-up is the one in tools/e2e/README.md (the website built with VITE_API_URL=/, a scratch backend serving it, an administrator in a throw-away
 * database). The run changes that database: do not point it at real data.
 *
 *   node tools/e2e/cms22-journey.cjs --base=http://127.0.0.1:8802 --email=admin@example.test --password=... [--width=390 --height=844] [--out=<dir>] [--verbose]
 *
 * Exit status 1 when a step fails. Needs Playwright (AUDIT_PLAYWRIGHT, see tools/audit/README.md).
 */
const zlib = require('zlib')
const { launch, newPage, fs, path } = require('../audit/lib.cjs')

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, ...v]) => [k, v.join('=') || '1']))
const BASE = (args.base || 'http://127.0.0.1:8788').replace(/\/$/, '')
const EMAIL = args.email
const PASSWORD = args.password
const WIDTH = Number(args.width || 1440)
const HEIGHT = Number(args.height || 900)
const OUT = args.out || path.join(process.cwd(), 'e2e-out')
fs.mkdirSync(OUT, { recursive: true })
if (!EMAIL || !PASSWORD) {
  console.error('Give --email and --password of an administrator in a throw-away database.')
  process.exit(2)
}

const stamp = Date.now().toString(36)
const SLUG = `c22-${stamp}`
const LANGS = ['hu', 'en', 'nl']
const MARK = { hu: 'HUMARK', en: 'ENMARK', nl: 'NLMARK' }
const results = []
const log = (line) => console.log(line)
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}
/** A text in the three languages, each carrying its own marker, so a word of another language can never hide in a page. */
const tri = (text) => ({ hu: `${text} ${MARK.hu}`, en: `${text} ${MARK.en}`, nl: `${text} ${MARK.nl}` })
const titleOf = (lang) => ({ hu: `Próba ${stamp}`, en: `Trial ${stamp}`, nl: `Proef ${stamp}` })[lang]

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
    try { await page.screenshot({ path: path.join(OUT, `c22-fail-${WIDTH}-${results.length}.png`) }) } catch { /* the page may be gone */ }
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
      row[1 + x * 3] = (x * 255) / width + seed * 40
      row[2 + x * 3] = (y * 255) / height
      row[3 + x * 3] = 90 + seed * 30
    }
    rows.push(row)
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

async function adminApi() {
  const login = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  if (login.status !== 200) throw new Error(`the API sign-in answered ${login.status}`)
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const me = await (await fetch(`${BASE}/api/admin/session`, { headers: { Cookie: cookie } })).json()
  const csrf = me?.data?.csrfToken ?? me?.csrfToken
  const call = async (method, url, body) => {
    const response = await fetch(`${BASE}${url}`, { method, headers: { Cookie: cookie, Origin: BASE, 'X-CSRF-Token': csrf, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: response.status, body: await response.json().catch(() => null) }
  }
  call.upload = async (bytes, name) => {
    const response = await fetch(`${BASE}/api/admin/media?name=${name}`, { method: 'POST', headers: { Cookie: cookie, Origin: BASE, 'X-CSRF-Token': csrf, 'Content-Type': 'image/png' }, body: bytes })
    return { status: response.status, body: await response.json().catch(() => null) }
  }
  return call
}
const publicJson = async (url) => {
  const response = await fetch(`${BASE}${url}`)
  return { status: response.status, body: await response.json().catch(() => null), headers: response.headers }
}
const inPublicList = async (slug) => ((await publicJson('/api/projects')).body?.data ?? []).some((project) => project.slug === slug)

;(async () => {
  const browser = await launch()
  const { context, page } = await newPage(browser, { reduced: true, locale: 'en-US', width: WIDTH, height: HEIGHT, mobile: WIDTH < 768 })
  page.setDefaultTimeout(15000)
  const errors = []
  const watch = (target) => {
    target.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      if (/status of (401|404|410)/.test(text)) return // the checks below ask for pages and links that must not work
      errors.push(text)
    })
    target.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  }
  watch(page)

  // The public API is cached for 30 s: a page is asked again until it shows the change.
  const eventually = async (test, limit = 50000) => {
    const started = Date.now()
    for (;;) {
      const value = await test()
      if (value) return Math.round((Date.now() - started) / 1000)
      if (Date.now() - started > limit) throw new Error(`no change after ${limit / 1000} s`)
      await new Promise((resolve) => setTimeout(resolve, 2500))
    }
  }
  const goAdmin = (route) => page.goto(`${BASE}/admin${route}`, { waitUntil: 'networkidle' })
  const toast = async () => (await page.locator('[role=status], [role=alert]').allInnerTexts()).join(' | ')
  const files = []
  const tmp = (name, bytes) => {
    const file = path.join(OUT, `${name}-${stamp}.png`)
    fs.writeFileSync(file, bytes)
    files.push(file)
    return file
  }

  let api
  let id
  let pictureA
  let pictureB
  let token
  try {
    log(`\nCMS 22  Content blocks, search words, preview links, pictures, About page and sitemap, at ${WIDTH} px`)
    api = await adminApi()

    await step(page, 'A  sign in through the administration', async () => {
      await goAdmin('')
      await page.getByLabel(/E-mail|Email/i).first().fill(EMAIL)
      await page.getByLabel(/Jelszó|Password/i).first().fill(PASSWORD)
      await page.getByRole('button', { name: /Bejelentkezés|Sign in/i }).first().click()
      await page.waitForFunction(() => !document.querySelector('input[type=password]') && document.querySelector('main, [role=main], nav'), undefined, { timeout: 15000 })
    })

    await step(page, 'the Projects list searches, filters and says so when nothing matches', async () => {
      await goAdmin('/projects')
      await page.waitForSelector('ul li h2')
      const before = await page.locator('ul li h2').count()
      const search = page.locator('form[role=search] input').first()
      await search.fill('spendly')
      await search.press('Enter')
      await page.waitForFunction((n) => document.querySelectorAll('ul li h2').length < n, before, { timeout: 8000 })
      expect((await page.locator('ul li h2').count()) === 1, 'the search did not narrow the list to one project')
      await search.fill('zzzz-nothing-matches')
      await search.press('Enter')
      await page.getByText('No project matches these filters.').waitFor()
      await page.getByRole('button', { name: 'Clear the filters' }).click()
      await page.waitForSelector('ul li h2')
      expect((await page.locator('ul li h2').count()) === before, 'clearing the filters did not bring the list back')
      return `${before} projects`
    })

    await step(page, 'B  a project is written in three languages, with pictures, services, blocks and search words, and saved as a draft', async () => {
      pictureA = await api.upload(png(1200, 630, 1), `share-${stamp}.png`)
      pictureB = await api.upload(png(900, 600, 2), `shot-${stamp}.png`)
      expect(pictureA.status === 201 && pictureB.status === 201, `upload answered ${pictureA.status}/${pictureB.status}`)
      const a = pictureA.body.data.id
      const b = pictureB.body.data.id
      const content = {
        internalTitle: `Client ${stamp}`,
        title: { hu: titleOf('hu'), en: titleOf('en'), nl: titleOf('nl') },
        cardLabel: tri('Label'),
        cardDescription: tri('Card'),
        summary: tri('Summary'),
        detailPage: true,
        projectStatus: 'demo',
        tags: ['React', 'Node'],
        thumbnail: { mediaId: b, alt: tri('Thumbnail') },
        gallery: [{ mediaId: b, device: 'desktop', alt: tri('Screenshot'), caption: tri('Caption'), hero: true }],
        overview: { what: tri('What it is'), audience: tri('Audience'), problem: tri('Problem'), goal: tri('Goal') },
        services: [tri('Design'), tri('Build')],
        blocks: [
          { type: 'text', heading: tri('Block text'), body: { hu: `Első bekezdés ${MARK.hu}\n\nMásodik <b>nem félkövér</b> ${MARK.hu}`, en: `First paragraph ${MARK.en}\n\nSecond <b>not bold</b> ${MARK.en}`, nl: `Eerste alinea ${MARK.nl}\n\nTweede <b>niet vet</b> ${MARK.nl}` } },
          { type: 'image', heading: tri('Block picture'), mediaId: a, alt: tri('Block picture alt'), caption: tri('Block caption') },
          { type: 'technologies', heading: tri('Block tech'), items: ['React', 'Node', 'SQLite'] },
          { type: 'highlight', heading: tri('Block highlight'), text: tri('Remember this') },
        ],
        seo: { title: tri('Search title'), description: tri('Search description'), ogTitle: tri('Share title'), ogDescription: tri('Share description'), imageMediaId: a, imageAlt: tri('Share picture') },
      }
      const made = await api('POST', '/api/admin/projects', { slug: SLUG, category: 'apps', content })
      expect(made.status === 201, `create answered ${made.status}: ${JSON.stringify(made.body?.error?.details ?? made.body).slice(0, 300)}`)
      id = made.body.data.id
      expect(made.body.data.status === 'draft', 'the new project is not a draft')
      return `project ${id}`
    })

    await step(page, 'C  a draft is invisible to visitors: not in the list, not at its address (404, noindex), not in the sitemap', async () => {
      expect(!(await inPublicList(SLUG)), 'the draft is in the public list')
      expect((await publicJson(`/api/projects/${SLUG}`)).status === 404, 'the public API shows the draft')
      for (const lang of LANGS) {
        const response = await fetch(`${BASE}/${lang}/work/${SLUG}/`)
        expect(response.status === 404, `/${lang}/work/${SLUG}/ answered ${response.status} for a draft`)
        expect((response.headers.get('x-robots-tag') ?? '').includes('noindex'), `/${lang} draft page is not noindex`)
        expect(!(await response.text()).includes(titleOf(lang)), 'the draft title is in the page HTML')
      }
      expect(!(await (await fetch(`${BASE}/sitemap.xml`)).text()).includes(SLUG), 'the draft is in the sitemap')
    })

    await step(page, 'the editor has the new tabs, shows every language complete, and the canonical address read-only', async () => {
      await goAdmin(`/projects/${id}`)
      await page.getByRole('tab', { name: /Blocks/ }).click()
      expect((await page.getByRole('tabpanel').innerText()).includes('Content blocks'), 'the Blocks tab does not show the blocks')
      await page.getByRole('tab', { name: /Search and sharing/ }).click()
      const seo = await page.getByRole('tabpanel').innerText()
      expect(seo.includes(`/hu/work/${SLUG}/`), 'the canonical address is not shown')
      expect(!(await page.getByRole('tabpanel').locator('input').evaluateAll((inputs) => inputs.some((input) => /canonical/i.test(input.name + input.id)))), 'the canonical address is an input')
      const bar = await page.locator('[role=group]').first().innerText()
      expect(/Hungarian complete/.test(bar.replace(/\n/g, ' ')) || /complete/.test(bar), 'the language bar does not say complete')
    })

    await step(page, 'D  the administrator makes a preview link in the editor', async () => {
      await page.getByRole('tab', { name: /Publication/ }).click()
      await page.getByLabel(/Who it is for/).fill('Journey client')
      await page.getByRole('button', { name: 'Make a link' }).click()
      await page.getByTestId('preview-link-url').waitFor()
      const shown = await page.getByTestId('preview-link-url').innerText()
      const match = /\/work\/preview\/link\/([A-Za-z0-9_-]{43})/.exec(shown)
      expect(match, `no link in "${shown.slice(0, 80)}"`)
      token = match[1]
    })

    await step(page, 'E  somebody with no account opens the draft by the link, in three languages, with a banner, and nothing is public', async () => {
      const guest = await newPage(browser, { reduced: true, locale: 'en-US', width: WIDTH, height: HEIGHT, mobile: WIDTH < 768 })
      watch(guest.page)
      try {
        for (const lang of LANGS) {
          const response = await guest.page.goto(`${BASE}/${lang}/work/preview/link/${token}`, { waitUntil: 'domcontentloaded' })
          expect((response.headers()['x-robots-tag'] ?? '').includes('noindex'), `${lang}: the link page is not noindex`)
          expect(response.headers()['cache-control'] === 'no-store', `${lang}: the link page is cached`)
          await guest.page.getByRole('heading', { level: 1 }).waitFor()
          const text = await guest.page.locator('main, body').first().innerText()
          expect(text.includes(titleOf(lang)), `${lang}: the draft title is not on the preview page`)
          expect(guest.page.url().includes('/work/preview/link/'), `${lang}: the address changed`)
          const robots = await guest.page.locator('meta[name=robots]').first().getAttribute('content')
          expect(/noindex/.test(robots ?? ''), `${lang}: the head does not say noindex (${robots})`)
          expect((await guest.page.locator('meta[name=referrer]').count()) > 0, `${lang}: no referrer policy on the preview page`)
          expect(!text.includes(MARK[lang === 'hu' ? 'en' : 'hu']), `${lang}: a word of another language is on the page`)
        }
        await guest.page.getByText(/Link naar een voorbeeld: dit project is nog niet openbaar/).first().waitFor({ timeout: 8000 })
        await guest.page.screenshot({ path: path.join(OUT, `c22-preview-link-${WIDTH}.png`) })
      } finally {
        await guest.context.close()
      }
      expect(!(await inPublicList(SLUG)), 'the draft became public through the link')
      expect((await fetch(`${BASE}/api/preview/projects/${'A'.repeat(43)}`)).status === 404, 'an unknown secret does not answer 404')
    })

    await step(page, 'the signed-in preview of the project shows the draft with a banner', async () => {
      await page.goto(`${BASE}/en/work/preview/${id}`, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { level: 1 }).waitFor()
      await page.getByText(/Preview: this project is not public yet/).first().waitFor({ timeout: 8000 })
    })

    await step(page, 'F  publishing, then the project is visible in the list, on its three addresses, with its head and its blocks', async () => {
      const published = await api('POST', `/api/admin/projects/${id}/publish`, {})
      expect(published.status === 200, `publish answered ${published.status}: ${JSON.stringify(published.body?.error?.details ?? '').slice(0, 300)}`)
      const seconds = await eventually(() => inPublicList(SLUG))
      const detail = (await publicJson(`/api/projects/${SLUG}`)).body.data
      expect(JSON.stringify(detail.card.languages) === '["hu","en","nl"]', 'the card does not say it can be shown in three languages')
      expect(detail.detail.blocks.length === 4 && detail.detail.services.length === 2, 'blocks or services missing from the public answer')
      expect(!JSON.stringify(detail).includes('Client '), 'the internal name is public')
      return `public after ${seconds} s`
    })

    for (const lang of LANGS) {
      await step(page, `G  the ${lang.toUpperCase()} page is right: only its own language, its blocks as text, its head, no overflow`, async () => {
        const marks = LANGS.filter((code) => code !== lang).map((code) => MARK[code])
        await eventually(async () => {
          await page.goto(`${BASE}/${lang}/work/${SLUG}/`, { waitUntil: 'domcontentloaded' })
          return page.waitForFunction((title) => document.body.innerText.includes(title), titleOf(lang), { timeout: 8000 }).then(() => true, () => false)
        })
        await page.waitForSelector('#block-1, #block-2, #block-3, #block-4')
        const text = await page.locator('body').innerText()
        for (const other of marks) expect(!text.includes(other), `${lang}: ${other} is on the page`)
        expect(text.includes(MARK[lang]), `${lang}: its own words are not on the page`)
        for (const word of ['Block text', 'Block picture', 'Block tech', 'Block highlight']) expect(text.includes(`${word} ${MARK[lang]}`), `${lang}: the block "${word}" is missing`)
        expect(text.includes(`Design ${MARK[lang]}`), `${lang}: the services are missing`)
        // Markup in a block is shown as the text it is.
        expect(/<b>(nem félkövér|not bold|niet vet)<\/b>/.test(text), `${lang}: the markup was interpreted`)
        expect((await page.locator('main b, section b').count()) === 0, `${lang}: a <b> element was made`)
        const head = await page.evaluate(() => ({
          title: document.title,
          canonical: document.querySelector('link[rel=canonical]')?.href,
          robots: document.querySelector('meta[name=robots]')?.content,
          ogTitle: document.querySelector('meta[property="og:title"]')?.content,
          ogDescription: document.querySelector('meta[property="og:description"]')?.content,
          ogImage: document.querySelector('meta[property="og:image"]')?.content,
          alternates: [...document.querySelectorAll('link[rel=alternate]')].map((l) => l.getAttribute('hreflang')),
          description: document.querySelector('meta[name=description]')?.content,
        }))
        expect(head.title.startsWith(`Search title ${MARK[lang]}`), `${lang}: title "${head.title}"`)
        expect(head.description === `Search description ${MARK[lang]}`, `${lang}: description "${head.description}"`)
        expect(head.ogTitle === `Share title ${MARK[lang]}` && head.ogDescription === `Share description ${MARK[lang]}`, `${lang}: og ${head.ogTitle} / ${head.ogDescription}`)
        expect(/^https:\/\/example\.test\/media\//.test(head.ogImage ?? ''), `${lang}: og:image ${head.ogImage}`)
        expect(head.canonical === `https://example.test/${lang}/work/${SLUG}/`, `${lang}: canonical ${head.canonical}`)
        expect(/^index/.test(head.robots ?? ''), `${lang}: robots ${head.robots}`)
        expect(['hu', 'en', 'nl', 'x-default'].every((code) => head.alternates.includes(code)), `${lang}: alternates ${head.alternates}`)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow <= 1, `${lang}: ${overflow}px of horizontal overflow`)
        const broken = await page.evaluate(() => [...document.images].filter((image) => image.complete && image.naturalWidth === 0).length)
        expect(broken === 0, `${lang}: ${broken} broken picture(s)`)
        await page.screenshot({ path: path.join(OUT, `c22-page-${lang}-${WIDTH}.png`), fullPage: true })
      })
    }

    await step(page, 'H  the sitemap lists the project in all three languages (live), once each, and not any draft', async () => {
      const xml = await (await fetch(`${BASE}/sitemap.xml`)).text()
      for (const lang of LANGS) expect(xml.split(`<loc>https://example.test/${lang}/work/${SLUG}/</loc>`).length === 2, `${lang} is not listed exactly once`)
      expect(xml.includes('hreflang="x-default"'), 'no x-default')
    })

    await step(page, 'I  an edit is republished: the block text changes for visitors and the project stays public', async () => {
      const current = (await api('GET', `/api/admin/projects/${id}`)).body.data
      const content = { ...current.content }
      content.blocks = content.blocks.map((block, index) => (index === 3 ? { ...block, text: tri('Edited highlight') } : block))
      const saved = await api('PUT', `/api/admin/projects/${id}`, { content, expectedUpdatedAt: current.updatedAt })
      expect(saved.status === 200 && saved.body.data.status === 'published', `save answered ${saved.status}`)
      const stale = await api('PUT', `/api/admin/projects/${id}`, { content, expectedUpdatedAt: current.updatedAt })
      expect(stale.status === 409, `a save from an out-of-date copy answered ${stale.status}`)
      const seconds = await eventually(async () => JSON.stringify((await publicJson(`/api/projects/${SLUG}`)).body?.data?.detail?.blocks ?? []).includes('Edited highlight'))
      return `visible after ${seconds} s`
    })

    await step(page, 'J  the picture library: storage is explained, a picture is uploaded and one that is used is replaced, the project follows', async () => {
      await goAdmin('/media')
      await page.getByTestId('media-storage-state').waitFor()
      const storage = await page.getByTestId('media-storage-state').innerText()
      expect(storage.length > 20, 'the storage state is empty')
      const upload = page.locator('#media-upload')
      const cardsBefore = await page.getByTestId('media-card').count()
      await upload.setInputFiles(tmp('uploaded', png(700, 500, 3)))
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid=media-card]').length > n, cardsBefore, { timeout: 15000 })
      const before = (await publicJson(`/api/projects/${SLUG}`)).body.data.card.thumbnail.src
      const card = page.getByTestId('media-card').filter({ hasText: titleOf('en') }).first()
      await card.waitFor()
      await card.locator('input[type=file]').setInputFiles(tmp('replacement', png(1000, 700, 4)))
      await page.getByRole('dialog').getByRole('button', { name: 'Replace this picture' }).click()
      await page.waitForFunction(() => /Replaced: \d+ project/.test(document.body.innerText), undefined, { timeout: 15000 })
      const seconds = await eventually(async () => (await publicJson(`/api/projects/${SLUG}`)).body?.data?.card?.thumbnail?.src !== before)
      expect((await fetch(`${BASE}${before}`)).status === 200, 'the old picture address stopped working')
      return `project switched after ${seconds} s`
    })

    await step(page, 'K  About page and contact: saved in the administration in three languages, shown to visitors, then reset', async () => {
      await goAdmin('/profile')
      await page.getByText(/Story/).first().waitFor()
      const heading = page.getByLabel('Heading').first()
      for (const [code, name] of [['hu', 'Hungarian'], ['en', 'English'], ['nl', 'Dutch']]) {
        await page.locator('[role=group]').getByRole('button', { name: new RegExp(`^${name}`) }).first().click()
        await heading.fill(`Profile ${stamp} ${MARK[code]}`)
      }
      await page.getByLabel('E-mail address').fill(`hello-${stamp}@example.test`)
      await page.getByRole('button', { name: /^Save$/ }).first().click()
      await page.waitForFunction(() => /Saved\./.test(document.body.innerText), undefined, { timeout: 15000 })
      const seconds = await eventually(async () => JSON.stringify((await publicJson('/api/profile')).body?.data?.story?.title ?? {}).includes(`Profile ${stamp}`))
      for (const lang of LANGS) {
        await eventually(async () => {
          await page.goto(`${BASE}/${lang}/about`, { waitUntil: 'domcontentloaded' })
          return page.waitForFunction((word) => document.body.innerText.includes(word), `Profile ${stamp} ${MARK[lang]}`, { timeout: 8000 }).then(() => true, () => false)
        })
        const text = await page.locator('body').innerText()
        expect(text.includes(`hello-${stamp}@example.test`), `${lang}: the e-mail address is not in the footer`)
        for (const other of LANGS.filter((code) => code !== lang)) expect(!text.includes(`Profile ${stamp} ${MARK[other]}`), `${lang}: the ${other} heading is on the page`)
      }
      // Back to the website's own content.
      await goAdmin('/profile')
      await page.getByRole('button', { name: 'Go back to the website’s own content' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Go back to the website’s own content' }).click()
      await page.waitForFunction(() => /own content again/.test(document.body.innerText), undefined, { timeout: 15000 })
      return `saved profile public after ${seconds} s`
    })

    await step(page, 'L  unpublishing: gone from the list, from its three addresses (404, noindex) and from the sitemap; the preview link still opens the draft, until it is withdrawn', async () => {
      const off = await api('POST', `/api/admin/projects/${id}/unpublish`, {})
      expect(off.status === 200, `unpublish answered ${off.status}`)
      for (const lang of LANGS) {
        const response = await fetch(`${BASE}/${lang}/work/${SLUG}/`)
        expect(response.status === 404 && (response.headers.get('x-robots-tag') ?? '').includes('noindex'), `/${lang} answered ${response.status} after unpublishing`)
      }
      expect(!(await (await fetch(`${BASE}/sitemap.xml`)).text()).includes(SLUG), 'the project is still in the sitemap')
      const seconds = await eventually(async () => !(await inPublicList(SLUG)))
      expect((await publicJson(`/api/preview/projects/${token}`)).status === 200, 'the preview link stopped working with the unpublishing')
      const links = (await api('GET', `/api/admin/projects/${id}/preview-links`)).body.data
      expect((await api('DELETE', `/api/admin/projects/${id}/preview-links/${links[0].id}`)).status === 200, 'revoking failed')
      expect((await publicJson(`/api/preview/projects/${token}`)).status === 410, 'a withdrawn link still opens')
      return `out of the list after ${seconds} s`
    })

    await step(page, 'M  the website\'s existing projects are untouched', async () => {
      const list = (await publicJson('/api/projects')).body.data.map((project) => project.slug)
      for (const slug of ['spendly', 'bookinghub', 'logistics-platform']) expect(list.includes(slug), `${slug} left the list`)
      const spendly = (await publicJson('/api/projects/spendly')).body.data
      expect(spendly.detail.gallery.length === 10, 'Spendly lost pictures')
      expect((await fetch(`${BASE}/en/work/spendly/`)).status === 200, 'the Spendly page is gone')
    })

    await step(page, 'N  clean-up: the project and its pictures are deleted, and the browser reported no errors', async () => {
      expect((await api('DELETE', `/api/admin/projects/${id}`)).status === 204, 'the project was not deleted')
      const library = (await api('GET', '/api/admin/media')).body.data
      for (const item of library.filter((entry) => (entry.name ?? '').includes(stamp) || (entry.uses ?? 0) === 0)) await api('DELETE', `/api/admin/media/${item.id}`)
      expect(errors.length === 0, `console errors: ${errors.slice(0, 3).join(' | ')}`)
    })
  } catch (error) {
    if (!(error && error.message === 'stop')) {
      log(`  ERROR ${error && error.stack ? error.stack.split('\n').slice(0, 3).join(' / ') : error}`)
      results.push({ step: 'unexpected', ok: false, detail: String(error) })
    }
  }
  await browser.close().catch(() => undefined)
  const failed = results.filter((entry) => !entry.ok)
  log(`\n${results.length - failed.length}/${results.length} steps passed at ${WIDTH} px${failed.length ? `; failed: ${failed.map((entry) => entry.step).join(', ')}` : ''}`)
  fs.writeFileSync(path.join(OUT, `cms22-journey-${WIDTH}.json`), JSON.stringify({ width: WIDTH, results }, null, 2))
  process.exit(failed.length ? 1 : 0)
})()
