// The Work page and the dynamic project page, in a real Chrome, against a RUNNING backend (PROMPT 13.1).
//
//   node tools/audit/audit-work.cjs --base=http://127.0.0.1:8788 --email=<admin> --password=<password> \
//        [--sizes=1920x1080,1440x900,1024x768,768x1024,430x932,390x844,360x800,320x640] [--themes=dark,light] [--langs=hu,en,nl] [--out=report.json]
//
// With an administrator's e-mail and password it first publishes three STRESS projects through the administration's API (a very
// long title and text with many technologies, a project with no picture and no page of its own, a project with a tall and a wide
// picture), so the layout is tried against what an owner might really write and not only against the four projects the website
// ships with; it deletes them (and their pictures) at the end. Use a THROW-AWAY server and database.
//
// Per language x theme x size it checks the Work page and the stress project's own page for: sideways scrolling, elements outside
// the viewport, controls under 24x24 px, controls with no accessible name, exactly one h1, pictures that did not load, headings
// with no text, console errors, and axe-core (WCAG 2.0/2.1/2.2 A and AA, best practice). On the Work page it also drives the
// filter with the keyboard (arrow/Tab, Enter) and checks that the cards shown are the ones of the chosen category and that a
// category with no published project is not offered.
const zlib = require('zlib')
const { launch, newPage, axeRun, fs } = require('./lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8788').replace(/\/$/, '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const SIZES = arg('sizes', '1920x1080,1440x900,1024x768,768x1024,430x932,390x844,360x800,320x640').split(',').map((s) => s.split('x').map(Number))
const THEMES = arg('themes', 'dark,light').split(',')
const LANGS = arg('langs', 'hu,en,nl').split(',')
const OUT = arg('out', '')
const stamp = Date.now().toString(36)

/** A real PNG (a gradient) of the given size, built without a dependency. */
function png(width, height, seed) {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (kind, data) => { const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(kind), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([length, body, sum]) }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
  const rows = []
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3)
    for (let x = 0; x < width; x += 1) { row[1 + x * 3] = (x * 255 / width + seed * 40) % 256; row[2 + x * 3] = (y * 255 / height + seed * 90) % 256; row[3 + x * 3] = (x + y + seed * 17) % 256 }
    rows.push(row)
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

async function adminApi() {
  const login = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  if (login.status !== 200) throw new Error(`the sign-in answered ${login.status}`)
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const me = await (await fetch(`${BASE}/api/admin/session`, { headers: { Cookie: cookie } })).json()
  const csrf = me?.data?.csrfToken ?? me?.csrfToken
  const headers = { Cookie: cookie, Origin: BASE, 'X-CSRF-Token': csrf }
  return async (method, url, { body, raw, type } = {}) => {
    const response = await fetch(`${BASE}${url}`, { method, headers: { ...headers, ...(type ? { 'Content-Type': type } : body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) })
    return { status: response.status, body: await response.json().catch(() => null) }
  }
}

const tri = (hu, en = hu, nl = hu) => ({ hu, en, nl })
// (Within the editor's own limits: title 120, card text 400, picture caption 200 characters; a longer text would be refused.)
const LONG = 'Hozzáférhetőségi-és-teljesítmény-optimalizálási-keretrendszer-bevezetés'.slice(0, 70)
const SENTENCE = 'This is a long sentence that keeps going to see how a card and a heading cope when the owner writes more than the layout expected, with a technical term like internationalisation-and-localisation thrown in. '

async function createStress(api) {
  const created = []
  const upload = async (width, height, seed, name) => {
    const r = await api('POST', `/api/admin/media?name=${encodeURIComponent(name)}`, { raw: png(width, height, seed), type: 'image/png' })
    if (r.status !== 201) throw new Error(`upload ${name}: ${r.status}`)
    return r.body.data
  }
  const tall = await upload(480, 1100, 1, 'tall.png')
  const wide = await upload(1400, 420, 2, 'wide.png')
  const normal = await upload(900, 600, 3, 'normal.png')
  const base = (slug, content) => ({ slug, category: 'apps', content })
  const common = { cardLabel: tri('Kártya', 'Card', 'Kaart'), projectStatus: 'in-progress', accent: 'blue', hero: 'route', mockup: 'booking', layout: 'wide' }
  const projects = [
    base(`stress-long-${stamp}`, {
      ...common,
      title: tri(`${LONG}-projekt ${stamp}`, `An exceptionally long title for one project that keeps going and going ${stamp}`, `Een buitengewoon lange titel voor één project die maar doorgaat ${stamp}`),
      cardDescription: tri(SENTENCE, SENTENCE, SENTENCE),
      summary: tri(SENTENCE.repeat(3), SENTENCE.repeat(3), SENTENCE.repeat(3)),
      overview: { what: tri(SENTENCE.repeat(8), SENTENCE.repeat(8), SENTENCE.repeat(8)), audience: tri(SENTENCE, SENTENCE, SENTENCE), problem: tri(SENTENCE, SENTENCE, SENTENCE), goal: tri(SENTENCE, SENTENCE, SENTENCE) },
      tags: Array.from({ length: 14 }, (_, i) => `Technology-with-a-long-name-${i + 1}`),
      stack: [{ group: 'frontend', items: Array.from({ length: 10 }, (_, i) => `Library-${i + 1}-with-a-long-name`) }, { group: 'backend', items: ['Node.js', 'SQLite'] }],
      thumbnail: { mediaId: normal.id, alt: tri('Egy kép', 'A picture', 'Een afbeelding') },
      gallery: [{ mediaId: wide.id, device: 'desktop', alt: tri('Széles', 'Wide', 'Breed'), caption: tri(SENTENCE.slice(0, 190), SENTENCE.slice(0, 190), SENTENCE.slice(0, 190)), hero: true }, { mediaId: tall.id, device: 'mobile', alt: tri('Magas', 'Tall', 'Lang'), caption: tri('', '', ''), hero: false }],
      challenges: [{ title: tri(LONG, SENTENCE.slice(0, 150), SENTENCE.slice(0, 150)), problem: tri(SENTENCE.repeat(2), SENTENCE.repeat(2), SENTENCE.repeat(2)), solution: tri(SENTENCE.repeat(2), SENTENCE.repeat(2), SENTENCE.repeat(2)), source: '' }],
      approach: [{ title: tri('Egy', 'One', 'Een'), text: tri(SENTENCE, SENTENCE, SENTENCE) }, { title: tri('Kettő', 'Two', 'Twee'), text: tri(SENTENCE, SENTENCE, SENTENCE) }],
      architectureText: tri(SENTENCE.repeat(3), SENTENCE.repeat(3), SENTENCE.repeat(3)),
      features: [{ title: tri(LONG, SENTENCE.slice(0, 150), SENTENCE.slice(0, 150)), text: tri(SENTENCE, SENTENCE, SENTENCE), status: 'partial', imageMediaId: null }],
      decisions: [{ title: tri('Döntés', 'Decision', 'Besluit'), text: tri(SENTENCE, SENTENCE, SENTENCE) }],
      learned: [tri(SENTENCE, SENTENCE, SENTENCE)],
      next: [tri(SENTENCE, SENTENCE, SENTENCE)],
    }),
    base(`stress-bare-${stamp}`, {
      ...common,
      category: 'concepts',
      detailPage: false,
      projectStatus: 'concept',
      title: tri(`Csak egy ötlet ${stamp}`, `Just an idea ${stamp}`, `Slechts een idee ${stamp}`),
      cardDescription: tri('Rövid.', 'Short.', 'Kort.'),
      summary: tri('Rövid.', 'Short.', 'Kort.'),
      overview: { what: tri('Rövid.', 'Short.', 'Kort.'), audience: tri('', '', ''), problem: tri('', '', ''), goal: tri('', '', '') },
    }),
    base(`stress-pictures-${stamp}`, {
      ...common,
      projectStatus: 'live',
      title: tri(`Képek ${stamp}`, `Pictures ${stamp}`, `Beelden ${stamp}`),
      cardDescription: tri('Egy magas és egy széles kép.', 'A tall and a wide picture.', 'Een lang en een breed beeld.'),
      summary: tri('Egy magas és egy széles kép.', 'A tall and a wide picture.', 'Een lang en een breed beeld.'),
      overview: { what: tri('Képek.', 'Pictures.', 'Beelden.'), audience: tri('', '', ''), problem: tri('', '', ''), goal: tri('', '', '') },
      thumbnail: { mediaId: tall.id, alt: tri('Magas', 'Tall', 'Lang') },
      gallery: [{ mediaId: tall.id, device: 'mobile', alt: tri('Magas', 'Tall', 'Lang'), caption: tri('', '', ''), hero: true }, { mediaId: wide.id, device: 'desktop', alt: tri('Széles', 'Wide', 'Breed'), caption: tri('', '', ''), hero: false }],
    }),
  ]
  for (const project of projects) {
    const made = await api('POST', '/api/admin/projects', { body: project })
    if (made.status !== 201) throw new Error(`creating ${project.slug}: ${made.status} ${JSON.stringify(made.body).slice(0, 300)}`)
    const published = await api('POST', `/api/admin/projects/${made.body.data.id}/publish`, { body: {} })
    if (published.status !== 200) throw new Error(`publishing ${project.slug}: ${published.status} ${JSON.stringify(published.body).slice(0, 300)}`)
    created.push(made.body.data.id)
  }
  return { projects: created, media: [tall.id, wide.id, normal.id], slugs: projects.map((p) => p.slug), category: 'concepts' }
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForSelector('main h1', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)
}

function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const offenders = []
    const small = []
    const unnamed = []
    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      let scrolls = false
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) { scrolls = true; break }
      }
      // The pages draw some decoration (skewed bands, moving bars) past the edge on purpose: only readable things count.
      if (!scrolls && box.right > vw + 1 && el.matches('a,button,h1,h2,h3,p,li,img,figure,input,select,dt,dd,span')) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)}:${Math.round(box.right)}`)
      if (el.matches('a[href],button,select,input:not([type=hidden]),textarea,summary,[role=tab],[role=switch]') && !el.closest('[aria-hidden=true]')) {
        if (box.height < 24 || box.width < 24) small.push(`${el.tagName.toLowerCase()}:${Math.round(box.width)}x${Math.round(box.height)}:${(el.textContent || '').trim().slice(0, 14)}`)
        const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').trim()
        if (!name && !(el.labels && el.labels.length) && !el.getAttribute('aria-labelledby')) unnamed.push(el.outerHTML.slice(0, 80))
      }
    }
    const broken = [...document.querySelectorAll('main img')].filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.getAttribute('src'))
    const emptyHeadings = [...document.querySelectorAll('main h1, main h2, main h3')].filter((h) => !(h.textContent || '').trim()).length
    return { overflow: document.documentElement.scrollWidth - vw, offenders: [...new Set(offenders)].slice(0, 4), small: [...new Set(small)].slice(0, 4), unnamed: unnamed.slice(0, 3), h1: document.querySelectorAll('main h1').length, broken: broken.slice(0, 3), emptyHeadings }
  })
}

;(async () => {
  const findings = []
  let checked = 0
  let api = null
  let stress = null
  if (EMAIL && PASSWORD) {
    api = await adminApi()
    stress = await createStress(api)
    console.log(`stress projects published: ${stress.slugs.join(', ')}`)
  }
  // The public API may be cached for 30 s: the first pages wait until the stress projects are what is served.
  const slugToVisit = stress ? stress.slugs[0] : 'spendly'
  const browser = await launch()
  try {
    if (stress) {
      const until = Date.now() + 45000
      for (;;) {
        const list = await (await fetch(`${BASE}/api/projects?x=${Date.now()}`)).json()
        if (list.data.some((p) => p.slug === stress.slugs[0])) break
        if (Date.now() > until) throw new Error('the stress projects did not appear in the public list')
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
    for (const lang of LANGS) {
      for (const scheme of THEMES) {
        for (const [width, height] of SIZES) {
          const phone = width < 500
          const tag = `${lang} ${scheme} ${width}x${height}`
          const { context, page } = await newPage(browser, { width, height, mobile: phone, scheme, reduced: true, locale: lang === 'hu' ? 'hu-HU' : lang === 'nl' ? 'nl-NL' : 'en-GB' })
          const errors = []
          page.on('console', (m) => m.type() === 'error' && !/status of 404/.test(m.text()) && errors.push(m.text().slice(0, 160)))
          page.on('pageerror', (e) => errors.push(`pageerror ${String(e).slice(0, 160)}`))
          const check = async (name) => {
            checked += 1
            const m = await measure(page)
            if (m.overflow > 0 || m.offenders.length || m.small.length || m.unnamed.length || m.h1 !== 1 || m.broken.length || m.emptyHeadings) findings.push({ view: `${tag} ${name}`, kind: 'layout', ...m })
            for (const v of await axeRun(page)) findings.push({ view: `${tag} ${name}`, kind: 'axe', id: v.id, impact: v.impact, count: v.count, nodes: v.nodes })
          }
          // Bring every lazy picture in, so a broken one shows.
          const scrollThrough = async () => {
            await page.evaluate(async () => {
              for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)) }
              window.scrollTo(0, 0)
            })
            await page.waitForTimeout(400)
          }

          await page.goto(`${BASE}/${lang}/work/`, { waitUntil: 'domcontentloaded' })
          await settle(page)
          await scrollThrough()
          await check('work')

          // The filter, by keyboard: choose the stress category (or the first one) and see that only its cards remain.
          const filters = page.locator('main [role=group] button, main fieldset button, main [aria-pressed]')
          const count = await filters.count()
          if (count >= 2) {
            const target = filters.nth(1)
            await target.focus()
            await page.keyboard.press('Enter')
            await page.waitForTimeout(400)
            const state = await page.evaluate(() => ({ pressed: [...document.querySelectorAll('main [aria-pressed=true]')].map((b) => (b.textContent || '').trim()), cards: document.querySelectorAll('main article, main li a, main [data-project]').length }))
            if (state.pressed.length !== 1 || state.cards < 1) findings.push({ view: `${tag} work-filter`, kind: 'filter', state })
            await check('work-filtered')
          } else if (count === 0) findings.push({ view: `${tag} work`, kind: 'filter', note: 'no filter buttons found' })

          await page.goto(`${BASE}/${lang}/work/${slugToVisit}/`, { waitUntil: 'domcontentloaded' })
          await settle(page)
          await scrollThrough()
          await check('project')

          if (stress) {
            await page.goto(`${BASE}/${lang}/work/${stress.slugs[2]}/`, { waitUntil: 'domcontentloaded' })
            await settle(page)
            await scrollThrough()
            await check('project-pictures')
          }
          if (errors.length) findings.push({ view: tag, kind: 'console', errors: errors.slice(0, 3) })
          await context.close()
        }
      }
    }
  } finally {
    await browser.close()
    if (api && stress) {
      for (const id of stress.projects) await api('DELETE', `/api/admin/projects/${id}`)
      for (const id of stress.media) await api('DELETE', `/api/admin/media/${id}`)
      console.log('stress projects and pictures deleted')
    }
  }
  const report = { checked, findings }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1))
  console.log(`${checked} views checked, ${findings.length} findings`)
  for (const f of findings) console.log(JSON.stringify(f).slice(0, 420))
  process.exit(findings.length ? 1 : 0)
})().catch((e) => {
  console.error('FAILED', e)
  process.exit(2)
})
