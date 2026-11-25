#!/usr/bin/env node
/**
 * Command Center and Digital Archive (PROMPT 37): the journey of a visitor, in a real browser. It checks, step by step and with its own words when something fails: the way in
 * (footer, Command Center, system bar), that every link of the Command Center leads to a real page, the archive's search, filters, sorting, empty state, address and direct
 * links, that nothing private is asked for or shown (an administrator's preview flag included), the keyboard, three languages, reduced motion, a phone, the existing pages
 * and what is left after leaving.
 *
 * Needs the DEVELOPMENT server (`npm run dev`, port 5173 by default). With no backend running the pages show the website's own content, as in a build without one.
 *
 *   AUDIT_PLAYWRIGHT=<path to playwright> node tools/e2e/archive-journey.cjs [--url http://localhost:5173] [--only <step words>]
 */
const path = require('path')
const { launch, newPage } = require(path.join(__dirname, '..', 'audit', 'lib.cjs'))

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name)
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback
}
const BASE = arg('--url', 'http://localhost:5173').replace(/\/$/, '')
const ONLY = arg('--only', '')
const LANGS = ['hu', 'en', 'nl']
const LABS = ['particle-universe', 'liquid-matter', 'type-in-motion', 'infinite-space', 'chromatic-distortion', 'generative-objects']

const results = []
const errorsOfPage = []
const note = (text) => console.log(`    · ${text}`)
const ok = (condition, message) => {
  if (!condition) throw new Error(message)
}

async function step(name, fn) {
  if (ONLY && !name.toLowerCase().includes(ONLY.toLowerCase())) return
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`)
  } catch (error) {
    results.push({ name, ok: false, error: String(error && error.message ? error.message : error).split('\n').filter((line) => line.trim()).slice(0, 4).join(' | ').slice(0, 400) })
    console.log(`  ✗ ${name}: ${results[results.length - 1].error}`)
  }
}

const url = (lang, route) => `${BASE}/${lang}${route}`
const entries = (page) => page.locator('[data-archive] article')
const countText = (page) => page.getByTestId('archive-count').innerText()
const ids = (page) => entries(page).evaluateAll((els) => els.map((el) => el.id))
const titles = (page) => page.locator('[data-archive] article h3').allInnerTexts()
async function openArchive(page, lang = 'en', suffix = '') {
  await page.goto(url(lang, `/archive${suffix}`), { waitUntil: 'load' })
  await page.locator('[data-archive] article').first().waitFor({ timeout: 40000 }).catch(() => undefined)
  await page.waitForFunction(() => !document.querySelector('[data-archive] [class*="loading"]'), null, { timeout: 20000 }).catch(() => undefined)
  await page.waitForTimeout(400)
}
async function openCenter(page, lang = 'en') {
  await page.goto(url(lang, '/command-center'), { waitUntil: 'load' })
  await page.locator('[data-command-center] [data-sector]').first().waitFor({ timeout: 40000 })
  await page.waitForFunction(() => !document.querySelector('[data-command-center]')?.textContent.includes('…'), null, { timeout: 20000 }).catch(() => undefined)
  await page.waitForTimeout(400)
}
const search = (page) => page.getByRole('searchbox').first()
const kindRadio = (page, name) => page.locator('[data-archive] fieldset input[type=radio]').and(page.getByRole('radio', { name: new RegExp(`^${name}\\b`) }))
async function chooseKind(page, name) {
  const radio = page.getByRole('radio', { name: new RegExp(`^${name}\\b`) })
  await radio.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await radio.check({ force: true })
}
const select = (page, label) => page.getByRole('combobox', { name: label })

;(async () => {
  console.log(`Command Center and Archive journey against ${BASE}`)
  const browser = await launch()
  const { context, page } = await newPage(browser, { width: 1440, height: 900 })
  const requests = []
  page.on('pageerror', (error) => errorsOfPage.push(`${page.url()} :: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/WebGL|GPU stall|Failed to load resource|net::ERR|chunk|\/api\//i.test(message.text())) errorsOfPage.push(`console ${message.text().slice(0, 140)}`)
  })
  page.on('request', (request) => requests.push(request.url()))

  // ── The way in ─────────────────────────────────────────────────────────────────────
  await step('the footer of every page leads to the Command Center and the archive, beside the six main pages', async () => {
    await page.goto(url('en', '/about'), { waitUntil: 'load' })
    const footer = page.locator('footer')
    ok((await footer.locator('a[href="/en/command-center"]').count()) === 1, 'no Command Center link in the footer')
    ok((await footer.locator('a[href="/en/archive"]').count()) === 1, 'no archive link in the footer')
    ok((await page.locator('header a[href="/en/archive"]').count()) === 0, 'the header navigation changed')
    await footer.locator('a[href="/en/command-center"]').click()
    await page.locator('[data-command-center]').waitFor({ timeout: 40000 })
    ok(new URL(page.url()).pathname === '/en/command-center', `went to ${page.url()}`)
  })

  await step('Command Center: one h1, the system bar, seven sectors with the real counts', async () => {
    await openCenter(page)
    ok((await page.locator('h1').count()) === 1, 'not one h1')
    ok(/command\s*center/i.test(await page.locator('h1').innerText()), 'wrong h1')
    const bar = page.getByRole('navigation', { name: 'Command Center navigation' })
    ok((await bar.getByRole('link').count()) === 4, 'the system bar is not four stops')
    ok((await bar.locator('a[aria-current="page"]').innerText()).toLowerCase().includes('command center'), 'the current stop is not marked')
    const counts = await page.locator('[data-sector]').evaluateAll((els) => els.map((el) => [el.getAttribute('data-sector'), el.textContent.replace(/\s+/g, ' ')]))
    const expected = { archive: '14 entries', work: '4 projects', demos: '3 demos', lab: '6 experiences', tool: '1 tool', services: '4 services', people: '2 pages' }
    ok(counts.length === 7, `${counts.length} sectors`)
    for (const [id, text] of counts) ok(text.includes(expected[id]), `sector ${id} says "${text}", not "${expected[id]}"`)
    ok(/14 public entries · 3 languages/i.test(await page.locator('[data-command-center]').innerText()), 'the line does not state the entries and languages')
  })

  await step('Command Center: featured work, the six experiences, the demos, the services and the people, and every link leads to a real page', async () => {
    await openCenter(page)
    ok((await page.locator('#featured li').count()) === 4, 'not four featured projects')
    ok((await page.locator('#lab ol > li').count()) === 6, 'not six experiences')
    ok((await page.locator('#demos li').count()) === 3, 'not three demos')
    ok((await page.locator('#services li').count()) === 5, 'not four services and the full experience')
    ok((await page.locator('#people li').count()) === 2, 'not two doors')
    const hrefs = [...new Set(await page.locator('[data-command-center] a[href^="/en/"]').evaluateAll((els) => els.map((el) => el.getAttribute('href'))))]
    ok(hrefs.length >= 20, `${hrefs.length} links`)
    const visitor = await context.newPage()
    const broken = []
    for (const href of hrefs) {
      await visitor.goto(`${BASE}${href}`, { waitUntil: 'load' })
      await visitor.waitForSelector('h1', { timeout: 30000 }).catch(() => undefined)
      await visitor.waitForTimeout(250)
      const text = (await visitor.locator('main').innerText().catch(() => '')).toLowerCase()
      if (!text || /page not found|does not exist|404/.test(text.slice(0, 400))) broken.push(href)
    }
    await visitor.close()
    ok(broken.length === 0, `broken links: ${broken.join(', ')}`)
    note(`Command Center: ${hrefs.length} distinct internal links, all reached a page`)
  })

  // ── The archive ────────────────────────────────────────────────────────────────────
  await step('archive: 14 entries in the curated order, one h1, a labelled search, the count', async () => {
    await openArchive(page)
    ok((await entries(page).count()) === 14, `${await entries(page).count()} entries`)
    ok(/14 of 14 entries shown/.test(await countText(page)), await countText(page))
    const order = await ids(page)
    ok(order[0] === 'entry-project-spendly' && order[13] === 'entry-tool-design-system', order.join(','))
    ok((await page.locator('h1').count()) === 1, 'not one h1')
    ok((await page.getByRole('search').count()) === 1 && (await search(page).count()) === 1, 'no search landmark')
    ok((await page.locator('#entry-project-hollandia a[href="/en/work/hollandia"]').count()) === 0, 'Hollandia links to a page it does not have')
    ok(/No page of its own yet/.test(await page.locator('#entry-project-hollandia').innerText()), 'Hollandia does not say it has no page')
    ok((await page.locator('[data-archive] a[href^="http"]').count()) === 0, 'an outside link')
  })

  await step('search: live, any word, accents and case ignored, every word wanted, and an empty state with a way out', async () => {
    await openArchive(page)
    const before = requests.length
    await search(page).fill('django')
    await page.waitForTimeout(150)
    ok((await entries(page).count()) === 2 && /2 of 14/.test(await countText(page)), `django: ${await countText(page)}`)
    await search(page).fill('SPENDLY transactions')
    ok((await entries(page).count()) === 1, 'two words should find one')
    await search(page).fill('spendly booking')
    ok((await entries(page).count()) === 0, 'both words must match')
    ok(/Nothing matches/.test(await page.locator('[data-archive]').innerText()), 'no empty state')
    await page.getByRole('button', { name: 'Clear all' }).last().click()
    ok((await entries(page).count()) === 14, 'clearing did not bring everything back')
    ok((await search(page).inputValue()) === '', 'the search field kept its text')
    ok(requests.length === before || requests.slice(before).every((u) => /@vite|\/node_modules\/|\.hot-update|\/src\/|\.(woff2?|webp|png|svg)(\?|$)/.test(u)), `searching made requests: ${requests.slice(before).slice(0, 3).join(', ')}`)
    await openArchive(page, 'hu')
    await search(page).fill('idopont')
    const plain = await ids(page)
    await search(page).fill('IDŐPONT')
    const accented = await ids(page)
    ok(plain.length > 0 && JSON.stringify(plain) === JSON.stringify(accented), `accents change the result: ${plain} vs ${accented}`)
  })

  await step('filters: kind, category, status and their combinations, with the counts; Clear all resets them', async () => {
    await openArchive(page)
    const clear = page.getByRole('button', { name: 'Clear all' }).first()
    ok(await clear.isDisabled(), 'Clear all is enabled with nothing set')
    await chooseKind(page, 'Lab experiences')
    ok((await entries(page).count()) === 6, 'the lab filter')
    await select(page, 'Status').selectOption('concept')
    ok((await entries(page).count()) === 0, 'no experience is a concept')
    await chooseKind(page, 'All')
    ok((await entries(page).count()) === 1, 'one concept')
    await select(page, 'Status').selectOption('')
    await select(page, 'Category').selectOption('apps')
    ok((await entries(page).count()) === 4, `apps: ${await entries(page).count()}`)
    await chooseKind(page, 'Demos')
    ok((await entries(page).count()) === 2, 'two app demos')
    ok(await clear.isEnabled(), 'Clear all is disabled with filters set')
    await clear.click()
    ok((await entries(page).count()) === 14 && (await select(page, 'Category').inputValue()) === '' && (await page.getByRole('radio', { name: /^All/ }).isChecked()), 'Clear all did not reset')
    const options = await select(page, 'Category').locator('option').allInnerTexts()
    ok(options.length === 6 && options.some((o) => /Creative coding \(6\)/.test(o)), `category options: ${options.join(' | ')}`)
  })

  await step('sorting: curated, name both ways and kind, in the page language', async () => {
    await openArchive(page)
    const curated = await titles(page)
    await select(page, 'Sort by').selectOption('name')
    const az = await titles(page)
    ok(az.join('|') !== curated.join('|') && JSON.stringify(az) === JSON.stringify([...az].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))), `A–Z: ${az.slice(0, 5)}`)
    await select(page, 'Sort by').selectOption('name-desc')
    const za = await titles(page)
    ok(za[0] === az[az.length - 1] && za[za.length - 1] === az[0], 'Z–A is not the reverse')
    await select(page, 'Sort by').selectOption('kind')
    const kinds = await entries(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-kind')))
    const rank = { project: 0, demo: 1, lab: 2, tool: 3 }
    ok(kinds.every((k, i) => i === 0 || rank[k] >= rank[kinds[i - 1]]), `kind order: ${kinds}`)
    await select(page, 'Sort by').selectOption('')
    ok(JSON.stringify(await titles(page)) === JSON.stringify(curated), 'curated order did not come back')
  })

  await step('the address holds the search (replaced, not pushed), survives a reload, and Back leaves the archive', async () => {
    await page.goto(url('en', '/about'), { waitUntil: 'load' })
    await page.locator('footer a[href="/en/archive"]').click()
    await page.locator('[data-archive] article').first().waitFor({ timeout: 40000 })
    const history = await page.evaluate(() => history.length)
    await search(page).pressSequentially('react', { delay: 20 })
    await chooseKind(page, 'Projects')
    const params = new URL(page.url()).searchParams
    ok(params.get('q') === 'react' && params.get('kind') === 'project', page.url())
    ok((await page.evaluate(() => history.length)) === history, `typing pushed ${(await page.evaluate(() => history.length)) - history} history entries`)
    const shown = await ids(page)
    await page.reload({ waitUntil: 'load' })
    await page.locator('[data-archive] article').first().waitFor({ timeout: 40000 })
    ok((await search(page).inputValue()) === 'react' && JSON.stringify(await ids(page)) === JSON.stringify(shown), 'the search did not survive a reload')
    await page.goBack()
    await page.waitForTimeout(500)
    ok(new URL(page.url()).pathname === '/en/about', `Back went to ${page.url()}`)
  })

  await step('open an entry, come back: the archive is as it was left', async () => {
    await openArchive(page, 'en', '?kind=lab&sort=name')
    const before = await ids(page)
    await page.locator('#entry-lab-liquid-matter').getByRole('link', { name: /^Open Liquid Matter/ }).click()
    await page.waitForFunction(() => location.pathname === '/en/lab/liquid-matter', null, { timeout: 40000 })
    await page.goBack()
    await page.locator('[data-archive] article').first().waitFor({ timeout: 40000 })
    ok(new URL(page.url()).search === '?kind=lab&sort=name' && JSON.stringify(await ids(page)) === JSON.stringify(before), `came back to ${page.url()}`)
  })

  await step('direct links: open one entry, mark it, put the focus on it, win over a filter that would hide it; a bad link is ignored', async () => {
    await openArchive(page, 'en', '#entry-lab-liquid-matter')
    await page.waitForTimeout(700)
    const focused = await page.evaluate(() => document.activeElement?.id)
    ok(focused === 'entry-lab-liquid-matter', `focus is on "${focused}"`)
    const row = page.locator('#entry-lab-liquid-matter')
    ok((await row.getAttribute('data-linked')) === 'true' && /A direct link opened this entry/.test(await row.innerText()), 'the entry is not marked')
    const top = await row.evaluate((el) => el.getBoundingClientRect().top)
    ok(top >= 0 && top < 400, `the entry is at ${top}px, not in view below the header`)
    await openArchive(page, 'en', '?kind=project&q=spendly#entry-lab-infinite-space')
    await page.waitForTimeout(900)
    ok(new URL(page.url()).search === '' && (await entries(page).count()) === 14 && (await page.evaluate(() => document.activeElement?.id)) === 'entry-lab-infinite-space', `the filter was not cleared for the link: ${page.url()}`)
    await openArchive(page, 'en')
    await page.locator('#entry-demo-bookinghub').getByRole('link', { name: /^Direct link/ }).click()
    await page.waitForTimeout(600)
    ok(new URL(page.url()).hash === '#entry-demo-bookinghub' && (await page.evaluate(() => document.activeElement?.id)) === 'entry-demo-bookinghub', 'the Direct link did not go to the entry')
    await openArchive(page, 'en', '#entry-admin-secrets')
    ok((await page.locator('[data-linked]').count()) === 0 && (await entries(page).count()) === 14, 'a bad link did something')
  })

  // ── Nothing private ────────────────────────────────────────────────────────────────
  await step('privacy: an administrator’s preview flag changes nothing, nothing private is requested, nothing is stored', async () => {
    await openArchive(page)
    const stores = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]))
    const first = requests.length
    await openArchive(page, 'en', '?preview=1')
    ok((await entries(page).count()) === 14 && !/draft/i.test(await page.locator('[data-archive]').innerText()), 'the preview flag changed the archive')
    await search(page).fill('react')
    await chooseKind(page, 'Projects')
    await openCenter(page)
    const made = requests.slice(first)
    ok(!made.some((u) => /\/api\/(admin|portal|quotes?|booking|ai|requests)\b|project-preview|\/preview/.test(u)), `private requests: ${made.filter((u) => /\/api\//.test(u)).join(', ')}`)
    note(`API requests made by the pages: ${[...new Set(made.filter((u) => /\/api\//.test(u)).map((u) => new URL(u).pathname))].join(', ') || 'none'}`)
    ok((await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie]))).length <= stores.length + 400, 'a lot was stored')
    const own = await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)).filter((k) => /archive|command/i.test(k)))
    ok(own.length === 0, `the pages stored ${own}`)
    for (const u of [url('en', '/archive'), url('en', '/command-center')]) {
      await page.goto(u, { waitUntil: 'load' })
      await page.locator('h1').waitFor()
      ok(!(await page.locator('main').innerText()).match(/client portal|quotation|invoice|admin/i), 'private words on the page')
    }
  })

  await step('theme: the pages follow the site’s theme and never change it', async () => {
    await openArchive(page)
    const theme = await page.locator('html').getAttribute('data-theme')
    await search(page).fill('lab')
    await chooseKind(page, 'All')
    ok((await page.locator('html').getAttribute('data-theme')) === theme, 'the theme changed')
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const before = await bg()
    await page.locator('header').getByRole('switch').first().click().catch(async () => page.locator('header button[aria-label*="theme" i]').first().click())
    await page.waitForTimeout(600)
    ok((await bg()) !== before, 'the site theme toggle did not change the page')
    await page.locator('header').getByRole('switch').first().click().catch(async () => page.locator('header button[aria-label*="theme" i]').first().click())
    await page.waitForTimeout(600)
  })

  // ── Keyboard ───────────────────────────────────────────────────────────────────────
  await step('keyboard: search, rail, selects, clear, entries and direct links, with a visible focus and no trap', async () => {
    await openArchive(page)
    await search(page).focus()
    await page.keyboard.type('react')
    await page.waitForTimeout(150)
    ok((await entries(page).count()) < 14, 'typing did not filter')
    await page.keyboard.press('Tab')
    const radio = await page.evaluate(() => [document.activeElement.type, document.activeElement.value])
    ok(radio[0] === 'radio', `Tab from the search went to ${radio}`)
    await page.keyboard.press('ArrowRight')
    ok(new URL(page.url()).searchParams.get('kind') === 'project', `arrow keys did not choose a kind: ${page.url()}`)
    const ring = await page.evaluate(() => {
      const face = document.activeElement.nextElementSibling
      const style = getComputedStyle(face)
      return [style.outlineStyle, parseFloat(style.outlineWidth)]
    })
    ok(ring[0] !== 'none' && ring[1] >= 2, `no visible focus on the rail: ${ring}`)
    await page.keyboard.press('Tab')
    ok((await page.evaluate(() => document.activeElement.tagName)) === 'SELECT', 'Tab did not reach the category select')
    await page.getByRole('button', { name: 'Clear all' }).first().focus()
    await page.keyboard.press('Enter')
    ok((await entries(page).count()) === 14, 'Enter on Clear all did not clear')
    const link = page.locator('#entry-lab-particle-universe').getByRole('link', { name: /^Direct link/ })
    await link.focus()
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    ok((await page.evaluate(() => document.activeElement.id)) === 'entry-lab-particle-universe', 'Enter on a direct link did not move the focus')
    await page.locator('#entry-tool-design-system').getByRole('link', { name: /^Direct link/ }).focus()
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab')
      if (await page.evaluate(() => !!document.activeElement.closest('footer'))) return
    }
    throw new Error('Tab never reached the footer')
  })

  // ── Motion, languages, phone ───────────────────────────────────────────────────────
  await step('motion: rows arrive quietly, nothing loops; under reduced motion nothing moves', async () => {
    await openArchive(page)
    const moving = await page.locator('[data-archive] li:has(> article)').first().evaluate((el) => getComputedStyle(el).animationName)
    ok(moving !== 'none', 'no arrival animation when motion is allowed')
    await page.waitForTimeout(1500)
    const loops = await page.evaluate(() => document.querySelector('[data-archive]').getAnimations({ subtree: true }).filter((a) => a.effect.getComputedTiming().iterations === Infinity).length)
    ok(loops === 0, `${loops} looping animations`)
    const quiet = await newPage(browser, { width: 1440, height: 900, reduced: true })
    await openArchive(quiet.page)
    ok((await quiet.page.locator('[data-archive] li:has(> article)').first().evaluate((el) => getComputedStyle(el).animationName)) === 'none', 'rows animate under reduced motion')
    await openCenter(quiet.page)
    const running = await quiet.page.evaluate(() => document.querySelector('[data-command-center]').getAnimations({ subtree: true }).filter((a) => a.playState === 'running' && a.effect.getComputedTiming().duration > 20).length)
    ok(running === 0, `${running} animations run under reduced motion on the Command Center`)
    await quiet.context.close()
  })

  for (const lang of LANGS) {
    await step(`${lang}: both pages speak the language, with no raw key and the lang attribute`, async () => {
      await openCenter(page, lang)
      ok((await page.locator('html').getAttribute('lang')) === lang, '<html lang>')
      const center = (await page.locator('main').innerText()).toLowerCase()
      const probe = { hu: ['irányítóközpont', 'a térkép', 'a lab hat élménye', 'interaktív bemutatók'], en: ['command center', 'the map', 'the six experiences', 'interactive demos'], nl: ['commandocentrum', 'de kaart', 'de zes ervaringen', 'interactieve demo'] }[lang]
      for (const word of probe) ok(center.replace(/\s+/g, ' ').includes(word), `"${word}" missing`)
      ok(!/\{[a-z]+\}|undefined|archive\./.test(center), 'raw key on the Command Center')
      await openArchive(page, lang)
      const text = (await page.locator('main').innerText()).toLowerCase()
      const words = { hu: ['digitális', 'archívum', '14 / 14 bejegyzés látszik', 'rendezés', 'minden törlése'], en: ['digital', '14 of 14 entries shown', 'sort by', 'clear all'], nl: ['digitaal', '14 van 14 items zichtbaar', 'sorteren op', 'alles wissen'] }[lang]
      for (const word of words) ok(text.replace(/\s+/g, ' ').includes(word), `"${word}" missing on the archive`)
      ok(!/\{[a-z]+\}|undefined/.test(text), 'raw key on the archive')
      const ents = await entries(page).count()
      ok(ents === 14, `${ents} entries in ${lang}`)
    })
  }

  await step('a phone (390 x 844, touch) and 320 px: no sideways scroll, controls a finger wide, search and filters work by touch', async () => {
    for (const [w, h] of [[390, 844], [320, 568]]) {
      const phone = await newPage(browser, { width: w, height: h, mobile: true })
      const p = phone.page
      for (const open of [openArchive, openCenter]) {
        await open(p)
        ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}px: sideways scroll`)
        const small = await p.evaluate(() => [...document.querySelectorAll('main button, main input:not([type=radio]):not([type=checkbox]), main select, main a[href]')]
          .filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && !e.closest('p'))
          .map((e) => ({ r: e.getBoundingClientRect(), t: (e.textContent || e.getAttribute('aria-label') || e.type || '').trim().slice(0, 24) }))
          .filter(({ r }) => r.width > 0 && (r.height < 43 || r.width < 24)).slice(0, 5))
        ok(small.length === 0, `${w}px: small controls: ${JSON.stringify(small.map((s) => [s.t, Math.round(s.r.width), Math.round(s.r.height)]))}`)
      }
      await openArchive(p)
      await search(p).fill('react')
      await chooseKind(p, 'Projects')
      ok((await entries(p).count()) < 14 && (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}px: filtering broke the page`)
      await phone.context.close()
    }
  })

  // ── The rest of the site ───────────────────────────────────────────────────────────
  await step('the existing pages still work: work, a project, its demo, the Lab (six), the playground, services, about, contact', async () => {
    for (const [route, check] of [
      ['/work', 'article'],
      ['/work/spendly', '[data-demo-entry]'],
      ['/work/spendly/demo', '[data-demo-stage] section'],
      ['/lab', '#experiments article'],
      ['/lab/design-system', '#color'],
      ['/services', 'h1'],
      ['/about', 'h1'],
      ['/contact', 'h1'],
      ...LABS.slice(0, 2).map((id) => [`/lab/${id}`, 'h1']),
    ]) {
      await page.goto(url('en', route), { waitUntil: 'load' })
      await page.locator(check).first().waitFor({ timeout: 40000, state: 'attached' })
    }
    await page.goto(url('en', '/lab'), { waitUntil: 'load' })
    await page.locator('#experiments article').first().waitFor({ timeout: 40000 })
    ok((await page.locator('#experiments article').count()) === 6, 'the Lab does not list six')
  })

  await step('leaving: nothing is left behind after going back and forth', async () => {
    const counters = async () => {
      const client = await page.context().newCDPSession(page)
      await client.send('HeapProfiler.collectGarbage')
      const dom = await client.send('Memory.getDOMCounters')
      await client.detach()
      return dom
    }
    await openArchive(page)
    const away = async () => {
      await page.getByRole('navigation', { name: 'Command Center navigation' }).getByRole('link', { name: /Command Center/ }).click()
      await page.locator('[data-command-center] [data-sector]').first().waitFor({ timeout: 40000 })
      await page.waitForTimeout(400)
      await page.getByRole('navigation', { name: 'Command Center navigation' }).getByRole('link', { name: /^02 Archive|Archive/ }).click()
      await page.locator('[data-archive] article').first().waitFor({ timeout: 40000 })
      await page.waitForTimeout(400)
    }
    await away()
    const first = await counters()
    for (let i = 0; i < 4; i += 1) await away()
    const last = await counters()
    note(`after 4 more round trips: nodes ${first.nodes} → ${last.nodes}, listeners ${first.jsEventListeners} → ${last.jsEventListeners}, documents ${first.documents} → ${last.documents}`)
    ok(last.nodes <= first.nodes + 80 && last.jsEventListeners <= first.jsEventListeners + 20 && last.documents <= first.documents + 1, 'something grew')
  })

  const errorName = 'no page error or console error during the whole journey'
  if (errorsOfPage.length) {
    results.push({ name: errorName, ok: false, error: errorsOfPage.slice(0, 5).join(' || ') })
    console.log(`  ✗ ${errorName}: ${errorsOfPage.slice(0, 5).join(' || ')}`)
  } else {
    results.push({ name: errorName, ok: true })
    console.log(`  ✓ ${errorName}`)
  }

  await context.close()
  await browser.close()
  const failed = results.filter((result) => !result.ok)
  console.log(`\n${results.length - failed.length} / ${results.length} steps passed`)
  if (failed.length) for (const f of failed) console.log(`  FAILED: ${f.name}\n          ${f.error}`)
  process.exit(failed.length ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
