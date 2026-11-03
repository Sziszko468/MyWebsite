// Mock collector/endpoints + the project's Vite dev server (so local http endpoints are accepted), then:
//  A. analytics: nothing before consent, events after, only ids, decline/withdraw stops them, GPC means no banner
//  B. forms: success only after a 2xx; 500, dropped and hung requests show a failure and keep the answers
//  C. errors: a lazy page's code failing to load shows the error panel with a reload, and the rest of the site still works
const http = require('http')
const path = require('path')
const { pathToFileURL } = require('url')
const { launch, newPage } = require('./lib.cjs')

const PROJECT = path.resolve(__dirname, '..', '..')
const MOCK = 4301
const DEV = 5190
const hits = []
const modes = { contact: 'ok', quote: 'ok', collect: 'ok' }

const mock = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
  const name = req.url.split('?')[0].slice(1)
  if (req.method === 'OPTIONS') { res.writeHead(204, cors).end(); return }
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    hits.push({ name, body, headers: req.headers })
    const mode = modes[name]
    if (mode === 'drop') { req.socket.destroy(); return }
    if (mode === 'hang') return
    if (mode === '500') { res.writeHead(500, cors).end('nope'); return }
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end('{"ok":true}')
  })
})

const problems = []
const note = (what) => { problems.push(what); console.log('  ✗ ' + what) }
const ok = (what) => console.log('  ✓ ' + what)
const check = (cond, what) => (cond ? ok(what) : note(what))
const events = () => hits.filter((h) => h.name === 'collect').map((h) => JSON.parse(h.body))

;(async () => {
  await new Promise((r) => mock.listen(MOCK, '127.0.0.1', r))
  Object.assign(process.env, {
    VITE_CONTACT_ENDPOINT: `http://127.0.0.1:${MOCK}/contact`,
    VITE_QUOTE_ENDPOINT: `http://127.0.0.1:${MOCK}/quote`,
    VITE_ANALYTICS_ENDPOINT: `http://127.0.0.1:${MOCK}/collect`,
  })
  const { createServer } = await import(pathToFileURL(PROJECT + '/node_modules/vite/dist/node/index.js').href)
  const vite = await createServer({ root: PROJECT, server: { port: DEV, strictPort: true, host: '127.0.0.1' }, logLevel: 'error' })
  await vite.listen()
  const base = `http://127.0.0.1:${DEV}`
  const browser = await launch()
  const filterErr = (e) => !/KHR_parallel|X4122|glGetProgramiv|Failed to load resource/.test(e)

  // warm the dev server (first request of each page compiles it)
  { const { context, page } = await newPage(browser, { seen: true }); for (const u of ['/en/', '/en/contact', '/en/work/spendly', '/en/services/website', '/en/services/configure', '/en/lab/liquid-matter']) { await page.goto(base + u, { waitUntil: 'load' }); await page.waitForSelector('h1', { timeout: 60000 }).catch(() => {}) } await context.close() }

  console.log('A. analytics')
  {
    const { context, page } = await newPage(browser, { seen: true, reduced: true })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message))
    await page.goto(base + '/en/', { waitUntil: 'load' })
    const banner = page.getByRole('region', { name: 'Measurement and privacy' })
    await banner.waitFor({ timeout: 15000 }).then(() => ok('the question is asked, as a region (not a dialog)'), () => note('no consent banner although a collector is configured'))
    check(await page.evaluate(() => !document.querySelector('dialog[open]')), 'the banner takes no focus and opens no dialog')
    hits.length = 0
    await page.goto(base + '/en/work/spendly', { waitUntil: 'load' }); await page.waitForSelector('h1'); await page.waitForTimeout(700)
    check(events().length === 0, 'no event is sent before the visitor answers')
    await banner.getByRole('button', { name: 'Accept' }).click()
    check(await banner.count() === 0, 'the banner goes away after the answer')
    check(await page.evaluate(() => JSON.parse(localStorage.getItem('cc-consent-v1')).analytics === true), 'the choice is stored as a small record')
    // navigate within the app and open things
    await page.goto(base + '/en/work/bookinghub', { waitUntil: 'load' }); await page.waitForSelector('h1'); await page.waitForTimeout(700)
    await page.goto(base + '/en/services/website', { waitUntil: 'load' }); await page.waitForSelector('h1'); await page.waitForTimeout(700)
    await page.goto(base + '/en/lab/liquid-matter', { waitUntil: 'load' }); await page.waitForTimeout(1800)
    const names = events().map((e) => e.name)
    check(names.includes('project_opened') && names.includes('service_viewed') && names.includes('lab_experience_opened'), `events after consent: ${names.join(', ')}`)
    const proj = events().find((e) => e.name === 'project_opened')
    check(JSON.stringify(proj.props) === '{"project":"bookinghub"}' && proj.page === '/work/bookinghub' && proj.lang === 'en', `payload is ids only: ${JSON.stringify(proj)}`)
    const h = hits.find((x) => x.name === 'collect').headers
    check(!h.cookie && !h.authorization && /text\/plain/.test(h['content-type']), 'no cookie or credential on the request; plain-text body (no preflight)')
    // builder: reach the last step and choose a package
    await page.goto(base + '/en/services/configure', { waitUntil: 'load' }); await page.waitForSelector('h1')
    const radio = page.locator('main input[type=radio]').first()
    await radio.waitFor({ timeout: 10000 })
    await radio.check({ force: true }).catch(async () => { await page.locator('main label').first().click() })
    for (let i = 0; i < 6; i++) {
      const next = page.getByRole('button', { name: /^(Next|Continue|Review)/ }).first()
      if (!(await next.count())) break
      // pick the first option on steps that need one
      const unchecked = page.locator('main input[type=radio]:visible').first()
      if (await unchecked.count()) await unchecked.check({ force: true }).catch(() => {})
      await next.click().catch(() => {})
      await page.waitForTimeout(250)
      if (events().some((e) => e.name === 'configurator_completed')) break
    }
    await page.waitForTimeout(400)
    const names2 = events().map((e) => e.name)
    console.log('     events so far:', [...new Set(names2)].join(', '))
    // withdraw through the footer, then nothing is sent
    await page.goto(base + '/en/', { waitUntil: 'load' }); await page.waitForSelector('h1')
    await page.getByRole('button', { name: 'Measurement settings' }).click()
    await page.getByRole('region', { name: 'Measurement and privacy' }).getByRole('button', { name: 'No, thanks' }).click()
    const before = events().length
    await page.goto(base + '/en/work/spendly', { waitUntil: 'load' }); await page.waitForSelector('h1'); await page.waitForTimeout(800)
    check(events().length === before, 'after "No, thanks" (via the footer) nothing more is sent')
    check(errs.length === 0, 'no uncaught errors')
    await context.close()
  }
  {
    // Global Privacy Control: no question, no events
    const { context, page } = await newPage(browser, { seen: true, reduced: true })
    await context.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }))
    hits.length = 0
    await page.goto(base + '/en/work/spendly', { waitUntil: 'load' }); await page.waitForSelector('h1'); await page.waitForTimeout(1500)
    check(await page.getByRole('region', { name: 'Measurement and privacy' }).count() === 0, 'with Global Privacy Control the visitor is not asked')
    check(await page.getByRole('button', { name: 'Measurement settings' }).count() === 0, '...and the footer offers no settings')
    check(events().length === 0, '...and nothing is sent')
    await context.close()
  }
  {
    // declined at the first question
    const { context, page } = await newPage(browser, { seen: true, reduced: true })
    hits.length = 0
    await page.goto(base + '/en/', { waitUntil: 'load' })
    await page.getByRole('region', { name: 'Measurement and privacy' }).getByRole('button', { name: 'No, thanks' }).click()
    await page.goto(base + '/en/work/spendly', { waitUntil: 'load' }); await page.waitForSelector('h1'); await page.waitForTimeout(800)
    check(events().length === 0, 'a visitor who declines is never measured')
    await page.goto(base + '/en/privacy', { waitUntil: 'load' }); await page.waitForSelector('h1')
    const txt = await page.locator('main').innerText()
    check(/Measurement/.test(txt) && /anonymous events/.test(txt) && /cc-consent-v1/.test(txt), 'the privacy page describes measurement and lists the consent record when measuring is on')
    await context.close()
  }

  console.log('B. forms (contact)')
  const fillContact = async (page) => {
    await page.goto(base + '/en/contact', { waitUntil: 'load' }); await page.waitForSelector('h1')
    await page.getByLabel('Your name', { exact: true }).fill('Test Person')
    await page.getByLabel('Email address', { exact: true }).fill('test@example.com')
    await page.getByLabel('A web development project').check({ force: true })
    await page.getByLabel('Subject', { exact: true }).fill('SECRET-SUBJECT-777')
    await page.getByLabel('Message', { exact: true }).fill('SECRET-MESSAGE-777 a private description of my project')
    const consent = page.getByLabel(/I understand that the details/)
    if (await consent.count()) await consent.check({ force: true })
  }
  for (const [mode, expect] of [['ok', 'sent'], ['500', 'failed'], ['drop', 'failed']]) {
    const { context, page } = await newPage(browser, { seen: true, reduced: true })
    await context.addInitScript(() => localStorage.setItem('cc-consent-v1', JSON.stringify({ v: 1, analytics: true })))
    modes.contact = mode
    hits.length = 0
    await fillContact(page)
    await page.getByRole('button', { name: 'Send message' }).click()
    await page.waitForTimeout(mode === 'ok' ? 1200 : 2200)
    const body = await page.locator('main').innerText()
    if (expect === 'sent') {
      check(/Your message has been sent/.test(body), `200 -> success shown`)
      const ev = events().find((e) => e.name === 'quote_request_submitted')
      check(ev && JSON.stringify(ev.props) === '{"form":"contact","items":0}', `analytics event carries no text: ${JSON.stringify(ev && ev.props)}`)
      check(!JSON.stringify(hits.filter((h) => h.name === 'collect')).includes('SECRET'), 'no typed text reached the collector')
      check(hits.some((h) => h.name === 'contact' && h.body.includes('SECRET-MESSAGE-777')), 'the message itself reached the contact endpoint (as intended)')
    } else {
      check(/Sending did not work/.test(body) && !/Your message has been sent/.test(body), `${mode} -> failure shown, no success`)
      check(await page.getByLabel('Message', { exact: true }).inputValue().then((v) => v.includes('SECRET-MESSAGE-777')), '...and the answers are still there')
      check(!events().some((e) => e.name === 'quote_request_submitted'), '...and no "submitted" event was sent')
    }
    await context.close()
  }
  {
    // hung request: busy state, then a timeout message (12 s)
    const { context, page } = await newPage(browser, { seen: true, reduced: true })
    modes.contact = 'hang'
    await fillContact(page)
    await page.getByRole('button', { name: 'Send message' }).click()
    await page.waitForTimeout(500)
    check(await page.getByRole('button', { name: /Sending/ }).count() > 0, 'a slow request shows the busy state')
    await page.waitForTimeout(12500)
    const body = await page.locator('main').innerText()
    check(/took too long/.test(body) && !/Your message has been sent/.test(body), 'a hung request ends in a timeout message, never success')
    modes.contact = 'ok'
    await context.close()
  }

  console.log('C. a page whose code fails to load')
  {
    const { context, page } = await newPage(browser, { seen: true, reduced: true })
    const errs = []
    page.on('pageerror', (e) => errs.push(e.message))
    await page.goto(base + '/en/', { waitUntil: 'load' }); await page.waitForSelector('h1')
    // break the About page's module, then navigate to it from the header
    await page.route(/\/src\/pages\/AboutPage\.tsx/, (r) => r.abort())
    await page.locator('header a[href="/en/about"]:visible').first().evaluate((e) => e.click())
    await page.waitForTimeout(2500)
    const h1 = await page.locator('h1:visible').first().innerText()
    check(/didn.t load/i.test(h1), `the error panel replaces the page: "${h1}"`)
    check(await page.locator('header').count() > 0 && await page.locator('footer').count() > 0, 'the header and footer stay')
    check(await page.evaluate(() => document.activeElement && document.activeElement.tagName === 'H1'), 'focus moves to the panel heading')
    check(await page.getByRole('button', { name: /reload|try again/i }).count() > 0, 'there is a way to retry')
    await page.unroute(/\/src\/pages\/AboutPage\.tsx/)
    // another page still works, and the error is gone
    await page.locator('header a[href="/en/contact"]:visible').first().evaluate((e) => e.click())
    await page.waitForTimeout(2000)
    check(/Got a good idea/.test(await page.locator('h1:visible').first().innerText()), 'navigating to another page clears the error and works')
    await context.close()
  }
  {
    // a Lab experiment whose chunk fails: the Lab's own panel, the site stays
    const { context, page } = await newPage(browser, { seen: true, reduced: true })
    await page.route(/\/src\/components\/lab\/experiments\/liquid\//, (r) => r.abort())
    await page.goto(base + '/en/lab/liquid-matter', { waitUntil: 'load' })
    await page.waitForTimeout(3000)
    const text = await page.locator('body').innerText()
    check(await page.locator('h1:visible').count() > 0 && /Back|Lab/i.test(text), 'a failed experiment leaves a page with a way back, not a blank screen')
    await context.close()
  }

  await browser.close(); await vite.close(); mock.close()
  console.log(problems.length ? `\n${problems.length} PROBLEM(S)` : '\nALL OK')
  process.exit(problems.length ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
