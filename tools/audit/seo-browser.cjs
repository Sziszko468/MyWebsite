// Loads every built page from a static server that applies dist/_headers (the real CSP) and checks:
//  - no console errors / CSP violations, an h1 appears
//  - the head the build wrote is still the head after the app ran (title, canonical, robots, alternates, JSON-LD, og)
//  - the document language
// then walks the site with in-app navigation and checks the head follows, with no duplicated tags.
const { start } = require('./serve.cjs')
const { launch, newPage, LANGS, PAGES } = require('./lib.cjs')
const path = require('path')

const DIST = process.env.DIST || path.join(__dirname, '..', '..', 'dist')
const PORT = 4195

const SNAP = () => {
  const q = (s) => [...document.head.querySelectorAll(s)]
  return {
    title: document.title,
    lang: document.documentElement.lang,
    robots: q('meta[name=robots]').map((e) => e.content),
    description: q('meta[name=description]').map((e) => e.content),
    canonical: q('link[rel=canonical]').map((e) => e.href),
    alternates: q('link[rel=alternate][hreflang]').map((e) => e.hreflang + '=' + e.href),
    og: q('meta[property^="og:"]').map((e) => e.getAttribute('property') + '=' + e.content).sort(),
    twitter: q('meta[name^="twitter:"]').map((e) => e.name + '=' + e.content).sort(),
    ld: q('script[type="application/ld+json"]').map((e) => e.textContent),
    counts: Object.fromEntries(['meta[name=description]', 'meta[name=robots]', 'link[rel=canonical]', 'meta[property="og:title"]', 'meta[property="og:url"]', 'script[type="application/ld+json"]', 'title'].map((s) => [s, q(s).length])),
  }
}

;(async () => {
  const srv = await start({ dir: path.resolve(DIST), port: PORT, fallback: '404', headers: true })
  const browser = await launch()
  const problems = []
  const note = (where, what) => problems.push(`${where}: ${what}`)

  // Pass 1: every page, loaded cold, static head vs live head.
  const urls = [['/', 'root']]
  for (const lang of LANGS) for (const p of PAGES) urls.push([`/${lang}${p === '/' ? '/' : p + '/'}`, `${lang}${p}`])
  const { context, page } = await newPage(browser, { seen: true })
  const violations = []
  await page.exposeFunction('__csp', (v) => violations.push(v))
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.__csp(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile || ''}:${e.lineNumber}`)))
  let errors = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => errors.push('pageerror ' + e.message.slice(0, 200)))
  let n = 0
  for (const [url, label] of urls) {
    errors = []
    const response = await page.goto(srv.url + url, { waitUntil: 'domcontentloaded' })
    if (response.status() !== 200) note(label, `status ${response.status()}`)
    const staticSnap = await page.evaluate(SNAP)
    const noscriptStatic = await page.evaluate(() => document.querySelector('noscript')?.textContent?.length ?? -1)
    if (label === 'root') {
      await page.waitForURL(/\/hu\/$/, { timeout: 10000 }).catch(() => note(label, 'did not move on to /hu/'))
    }
    await page.waitForSelector('h1', { timeout: 20000 }).catch(() => note(label, 'no h1 after 20 s'))
    await page.waitForTimeout(600)
    const live = await page.evaluate(SNAP)
    if (label !== 'root') {
      for (const k of ['title', 'lang', 'robots', 'description', 'canonical', 'alternates', 'og', 'twitter', 'ld', 'counts']) {
        if (JSON.stringify(staticSnap[k]) !== JSON.stringify(live[k])) note(label, `head "${k}" changed after the app ran: ${JSON.stringify(staticSnap[k]).slice(0, 120)} -> ${JSON.stringify(live[k]).slice(0, 120)}`)
      }
    }
    const h1s = await page.$$eval('h1', (els) => els.filter((e) => e.getClientRects().length).length)
    const filtered = errors.filter((e) => !/KHR_parallel_shader_compile|X4122|glGetProgramiv|GPU stall|WebGL/i.test(e))
    if (filtered.length) note(label, `console: ${filtered.slice(0, 2).join(' | ')}`)
    if (h1s !== 1 && !/\/lab\//.test(url)) note(label, `${h1s} visible <h1>`)
    if (noscriptStatic < 10) note(label, 'no <noscript> fallback in the static HTML')
    n++
  }
  if (violations.length) note('CSP', `${violations.length} violation(s): ${[...new Set(violations)].slice(0, 5).join(' | ')}`)
  console.log(`pass 1: ${n} pages loaded under the production CSP`)

  // Pass 2: in-app navigation keeps the head in step.
  await page.goto(srv.url + '/en/', { waitUntil: 'load' })
  await page.waitForSelector('h1')
  const clickNav = async (href) => {
    await page.locator(`header a[href="${href}"]:visible`).first().evaluate((el) => el.click())
    await page.waitForURL((u) => u.pathname.replace(/\/$/, '') === href.replace(/\/$/, ''), { timeout: 15000 })
    await page.waitForTimeout(900)
  }
  for (const href of ['/en/services', '/en/about', '/en/lab', '/en/contact']) {
    await clickNav(href)
    const s = await page.evaluate(SNAP)
    const expectCanonical = srv.url.replace('127.0.0.1:4195', '') // canonical is on example.test, so only compare the path
    if (!s.canonical[0]?.endsWith(href + '/')) note('nav ' + href, `canonical ${s.canonical[0]}`)
    if (s.lang !== 'en') note('nav ' + href, `lang ${s.lang}`)
    for (const [sel, c] of Object.entries(s.counts)) if (c !== 1) note('nav ' + href, `${c} x ${sel}`)
    const staticHtml = await (await fetch(srv.url + href + '/')).text()
    const staticTitle = staticHtml.match(/<title[^>]*>([^<]*)<\/title>/)[1].replace(/&amp;/g, '&')
    if (s.title !== staticTitle) note('nav ' + href, `title "${s.title}" differs from the built page's "${staticTitle}"`)
  }
  // language switch keeps the page, changes lang/canonical/title
  await page.locator('a[hreflang="nl"]:visible').first().evaluate((el) => el.click())
  await page.waitForURL(/\/nl\/contact/)
  await page.waitForTimeout(700)
  const nl = await page.evaluate(SNAP)
  if (nl.lang !== 'nl' || !nl.canonical[0].endsWith('/nl/contact/') || !/Contact/i.test(nl.title)) note('lang switch', JSON.stringify({ lang: nl.lang, c: nl.canonical, t: nl.title }))
  // a page that is not there: noindex, no canonical
  await page.goto(srv.url + '/en/does-not-exist', { waitUntil: 'load' })
  await page.waitForSelector('h1')
  const nf = await page.evaluate(SNAP)
  if (nf.robots[0] !== 'noindex, follow' || nf.canonical.length || nf.ld.length) note('404', JSON.stringify({ r: nf.robots, c: nf.canonical }))
  // cart: noindex
  await page.goto(srv.url + '/en/services/cart/', { waitUntil: 'load' })
  await page.waitForSelector('h1')
  const cart = await page.evaluate(SNAP)
  if (cart.robots[0] !== 'noindex, follow' || cart.canonical.length) note('cart', JSON.stringify(cart.robots))
  console.log('pass 2: in-app navigation, language switch, 404 and cart checked')

  // Pass 3: the intro (first visit) under the CSP
  const fresh = await newPage(browser, { seen: false })
  const v3 = []
  const e3 = []
  await fresh.page.exposeFunction('__csp', (v) => v3.push(v))
  await fresh.context.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => window.__csp(`${e.violatedDirective} ${e.blockedURI}`)))
  fresh.page.on('console', (m) => { if (m.type() === 'error') e3.push(m.text().slice(0, 160)) })
  await fresh.page.goto(srv.url + '/hu/', { waitUntil: 'load' })
  await fresh.page.waitForTimeout(4000)
  const dialog = await fresh.page.evaluate(() => !!document.querySelector('dialog[open]'))
  if (!dialog) note('intro', 'the intro did not open on a first visit to the home page')
  if (v3.length) note('intro CSP', [...new Set(v3)].join(' | '))
  const e3f = e3.filter((e) => !/KHR_parallel|X4122|glGetProgramiv/.test(e))
  if (e3f.length) note('intro console', e3f.slice(0, 2).join(' | '))
  const fresh2 = await newPage(browser, { seen: false })
  await fresh2.page.goto(srv.url + '/hu/about/', { waitUntil: 'load' })
  await fresh2.page.waitForTimeout(2500)
  if (await fresh2.page.evaluate(() => !!document.querySelector('dialog[open]'))) note('intro', 'the intro opened on /hu/about/ (onlyOnHome should prevent it)')
  console.log('pass 3: intro under CSP: dialog=' + dialog)

  await browser.close()
  await srv.close()
  if (problems.length) { console.log(`${problems.length} PROBLEM(S):`); problems.slice(0, 50).forEach((p) => console.log(' - ' + p)); process.exit(1) }
  console.log('ALL OK')
})().catch((e) => { console.error(e); process.exit(2) })
