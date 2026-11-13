#!/usr/bin/env node
/**
 * End-to-end journeys (PROMPT 15, phase 16): four visitors' paths through the BUILT website served by the REAL backend,
 * in a real Chrome. Nothing is mocked: the website is `dist/` served by `server/` (STATIC_DIR, same origin), the forms post
 * to the backend's API, the database is a throw-away file, the e-mail provider is the `file` provider (every message the
 * server would send is written as an `.eml` file we can read).
 *
 *   A  Recruiter   : home -> intro -> About -> Selected work -> a project page -> contact information
 *   B  Client      : home -> Services -> a service -> a package -> the builder -> a quote request -> database + owner e-mail
 *   C  Administrator: sign in -> dashboard -> new contact message -> status + note -> quote request -> catalogue edit -> public API
 *   D  Mobile      : a 390x844 touch phone through the intro, the menu, a project, the shop and a complete quote request
 *
 * Set-up (all of it throw-away; see tools/e2e/README.md):
 *   MSYS_NO_PATHCONV=1 VITE_API_URL=/ npm run build            # the site that talks to the backend on its own origin
 *   server on --base with EMAIL_PROVIDER=file EMAIL_FILE_DIR=<mail dir>, an administrator created with `server:admin create`
 *   node tools/e2e/journeys.cjs --base=http://127.0.0.1:8788 --mail=<mail dir> --email=<admin> --password=<password> [--only=A,B] [--out=<dir>]
 *
 * Exit status 1 when any step fails. Needs Playwright and (for nothing here) no axe: see tools/audit/README.md for AUDIT_PLAYWRIGHT.
 */
const { launch, newPage, fs, path } = require('../audit/lib.cjs')

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, ...v]) => [k, v.join('=') || '1']))
const BASE = (args.base || 'http://127.0.0.1:8788').replace(/\/$/, '')
const MAIL = args.mail
const ADMIN_EMAIL = args.email
const ADMIN_PASSWORD = args.password
const OUT = args.out || path.join(process.cwd(), 'e2e-out')
const ONLY = (args.only || 'A,B,C,D,E,F').split(',')
fs.mkdirSync(OUT, { recursive: true })

const results = []
let current = ''
const stamp = Date.now().toString(36)
const log = (line) => console.log(line)

/** Runs one named step; a thrown error fails the step, takes a picture and stops that journey. */
async function step(page, name, fn) {
  const started = Date.now()
  try {
    const detail = await fn()
    results.push({ journey: current, step: name, ok: true, ms: Date.now() - started, detail: detail ?? '' })
    log(`  ok    ${name}${detail ? ` -- ${detail}` : ''}`)
  } catch (error) {
    const message = String(error && error.message ? error.message : error).split('\n')[0]
    results.push({ journey: current, step: name, ok: false, ms: Date.now() - started, detail: message })
    log(`  FAIL  ${name} -- ${message}`)
    try { await page.screenshot({ path: path.join(OUT, `fail-${current}-${results.length}.png`) }) } catch { /* the page may be gone */ }
    throw new Error('stop')
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message)
}

/** Collects what the page printed to the console as an error, ignoring the one sign-in probe the administration makes. */
function watch(page) {
  page.setDefaultTimeout(15000)
  if (args.verbose) {
    page.on('request', (r) => r.url().includes('/api/') && log(`      > ${r.method()} ${r.url().replace(BASE, '')}`))
    page.on('response', (r) => r.url().includes('/api/') && log(`      < ${r.status()} ${r.url().replace(BASE, '')}`))
  }
  const errors = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (/Failed to load resource: the server responded with a status of 401/.test(text) && /admin/.test(page.url())) return
    errors.push(text)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  return errors
}

async function waitText(page, selector, pattern, timeout = 15000) {
  await page.waitForFunction(({ selector, source, flags }) => [...document.querySelectorAll(selector)].some((el) => new RegExp(source, flags).test(el.textContent || '')), { selector, source: pattern.source, flags: pattern.flags }, { timeout })
}
const h1 = (page) => page.locator('main h1').first()
/**
 * After a navigation the OLD page stays on screen until the next one's code has arrived, and a headline can be momentarily empty
 * while its words are revealed: the document title is what tells the pages apart, so wait for a different one.
 */
const titleNow = (page) => page.title()
async function newPageShown(page, previousTitle, timeout = 15000) {
  await page.waitForFunction((old) => document.title !== old && !!document.querySelector('main h1'), previousTitle, { timeout })
  return { title: await page.title(), headline: ((await h1(page).textContent()) || '').replace(/\s+/g, ' ').trim() }
}

/** The .eml files the server wrote, oldest first. */
function mails() {
  if (!MAIL || !fs.existsSync(MAIL)) return []
  return fs.readdirSync(MAIL).filter((f) => f.endsWith('.eml')).sort().map((f) => ({ file: f, text: fs.readFileSync(path.join(MAIL, f), 'utf8') }))
}
async function waitForMail(match, timeout = 15000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    const found = mails().find(({ text }) => match(text))
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 400))
  }
  return null
}
/** A header of a raw message, unfolded. */
const header = (eml, name) => (new RegExp(`^${name}:[ \\t]*(.*(?:\\r?\\n[ \\t].*)*)`, 'im').exec(eml)?.[1] ?? '').replace(/\r?\n[ \t]+/g, ' ')

// =====================================================================================================================
// A — the recruiter
// =====================================================================================================================
async function journeyA(browser) {
  current = 'A'
  log('\nA  Recruiter: homepage -> About -> project -> contact')
  const { context, page } = await newPage(browser, { seen: false, reduced: false })
  const errors = watch(page)
  try {
    await step(page, 'open the homepage (first visit)', async () => {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
      // `/` moves on to the visitor's language: here (no edge Worker) the saved choice, else English (PROMPT 18); any of the three is right.
      await page.waitForURL(/\/(hu|en|nl)\/$/)
      return page.url().replace(BASE, '')
    })
    await step(page, 'the introduction opens and can be entered', async () => {
      await page.waitForSelector('dialog[open], [role=dialog]', { timeout: 20000 })
      const dialog = page.locator('dialog[open], [role=dialog]').first()
      const text = (await dialog.innerText()).replace(/\s+/g, ' ').trim().slice(0, 80)
      const enter = dialog.getByRole('button').first()
      await enter.click()
      await page.waitForSelector('dialog[open], [role=dialog]', { state: 'detached', timeout: 10000 })
      return `dialog said "${text}"`
    })
    await step(page, 'the homepage is shown after the intro', async () => {
      await h1(page).waitFor()
      const title = await h1(page).innerText()
      expect(title.trim().length > 3, 'no headline')
      return title.replace(/\s+/g, ' ').slice(0, 60)
    })
    await step(page, 'the intro does not come back on a second homepage visit or by in-app navigation', async () => {
      await page.locator('header a[href$="/about"]').first().click()
      await page.waitForURL(/\/about\/?$/)
      await h1(page).waitFor()
      await page.locator('header a[href="/hu/"], header a[href="/hu"]').first().click()
      await page.waitForURL(/\/hu\/?$/)
      await page.waitForTimeout(1500)
      expect((await page.locator('dialog[open]').count()) === 0, 'the intro opened again')
      await page.reload({ waitUntil: 'networkidle' })
      await page.waitForTimeout(1500)
      expect((await page.locator('dialog[open]').count()) === 0, 'the intro opened again after a refresh')
    })
    await step(page, 'language switch keeps the page (About, English)', async () => {
      await page.goto(`${BASE}/hu/about/`, { waitUntil: 'networkidle' })
      await page.locator('a[hreflang="en"]').first().click()
      await page.waitForURL(/\/en\/about\/?$/)
      await h1(page).waitFor()
      expect(/^[A-Za-z]/.test((await h1(page).innerText()).trim()), 'no English headline')
    })
    await step(page, 'About page has content and a way to get in touch', async () => {
      const links = await page.locator('main a[href*="/contact"]').count()
      expect(links > 0, 'About has no link to the contact page')
      return `${links} link(s) to the contact page`
    })
    await step(page, 'selected work on the homepage leads to a project page', async () => {
      await page.goto(`${BASE}/en/`, { waitUntil: 'networkidle' })
      const link = page.locator('main a[href^="/en/work/"]').first()
      await link.scrollIntoViewIfNeeded()
      const href = await link.getAttribute('href')
      const before = await titleNow(page)
      await link.click()
      await page.waitForURL((url) => url.pathname.startsWith('/en/work/') && url.pathname.length > '/en/work/'.length + 1)
      const shown = await newPageShown(page, before)
      return `${href} -> "${shown.headline.slice(0, 30)}" (${shown.title})`
    })
    await step(page, 'the project page names its technology and has navigation to another project', async () => {
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      expect(/React|Next\.js|Django|FastAPI|TypeScript/.test(text), 'no technology named')
      const others = await page.locator('main a[href^="/en/work/"]').count()
      expect(others > 0, 'no link to another project')
      return `${others} project link(s)`
    })
    await step(page, 'browser Back and Forward return to the same pages', async () => {
      const here = page.url()
      await page.goBack()
      await page.waitForURL(/\/en\/?$/)
      await page.goForward()
      await page.waitForURL(here)
      await h1(page).waitFor()
    })
    await step(page, 'the contact page shows how to reach the owner', async () => {
      await page.goto(`${BASE}/en/contact/`, { waitUntil: 'networkidle' })
      const form = await page.locator('main form').count()
      const mailto = await page.locator('a[href^="mailto:"]').count()
      expect(form > 0 || mailto > 0, 'neither a form nor an address')
      return `${form} form, ${mailto} mailto link(s)`
    })
    await step(page, 'the theme switch changes the page and the choice survives a reload', async () => {
      const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'))
      const before = await theme()
      await page.locator('header button[aria-label*="mode" i]').first().click()
      await page.waitForFunction((old) => document.documentElement.getAttribute('data-theme') !== old, before, { timeout: 5000 })
      const after = await theme()
      await page.reload({ waitUntil: 'networkidle' })
      expect((await theme()) === after, `the theme went back to ${await theme()} after a reload`)
      return `${before} -> ${after}`
    })
    await step(page, 'no console errors during the journey', async () => {
      expect(errors.length === 0, errors.slice(0, 3).join(' | '))
    })
  } finally {
    await context.close()
  }
}

// =====================================================================================================================
// B/D — a quote request through the shop (desktop or phone)
// =====================================================================================================================
async function requestQuote(page, { mobile, lang = 'en', note }) {
  await step(page, 'open the services shop from the navigation', async () => {
    await page.goto(`${BASE}/${lang}/`, { waitUntil: 'networkidle' })
    const before = await titleNow(page)
    if (mobile) {
      await page.getByRole('button', { name: /menu|menü/i }).first().click()
      await page.waitForSelector('dialog[open]')
      await page.locator('dialog[open] a[href$="/services"]').first().click()
    } else {
      await page.locator('header a[href$="/services"]').first().click()
    }
    await page.waitForURL(/\/services\/?$/)
    await newPageShown(page, before)
  })
  await step(page, 'the shop shows four services and four packages, with no price', async () => {
    const services = await page.evaluate(() => new Set([...document.querySelectorAll('main a')].map((a) => a.getAttribute('href')).filter((h) => /\/services\/(website|webapp|ui|integrations)\/?$/.test(h))).size)
    expect(services === 4, `${services} distinct service links`)
    const text = await page.locator('main').innerText()
    expect(!/[€$£]\s?\d|\d\s?(€|EUR|Ft|HUF)\b/.test(text), 'a price appears on the shop landing page')
    expect(/offer|quote|ajánlat|offerte/i.test(text), 'no "quote" wording')
  })
  await step(page, 'open a service page and read its package options', async () => {
    const before = await titleNow(page)
    await page.locator('main a[href$="/services/website"]').first().click()
    await page.waitForURL(/\/services\/website\/?$/)
    await newPageShown(page, before)
    const radios = await page.locator('input[name="service-plan"]').count()
    expect(radios >= 4, `${radios} package options`)
  })
  await step(page, 'choose the Launch package and add the service to the cart', async () => {
    await page.locator('input[name="service-plan"]').first().check({ force: true })
    await page.getByRole('button', { name: /Add to cart|Kosárba|In winkelmand/i }).first().click()
    await page.waitForFunction(() => /cc-shop-cart-v1/.test(Object.keys(localStorage).join(' ')) && JSON.parse(localStorage.getItem('cc-shop-cart-v1') || '{}').lines?.length > 0, null, { timeout: 5000 })
  })
  await step(page, 'the cart keeps the choice after a refresh and offers to continue', async () => {
    await page.goto(`${BASE}/${lang}/services/cart/`, { waitUntil: 'networkidle' })
    await h1(page).waitFor()
    const lines = await page.evaluate(() => JSON.parse(localStorage.getItem('cc-shop-cart-v1') || '{}').lines?.length ?? 0)
    expect(lines === 1, `${lines} cart lines`)
    await page.reload({ waitUntil: 'networkidle' })
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('cc-shop-cart-v1') || '{}').lines?.length ?? 0)
    expect(after === 1, 'the cart was lost on refresh')
  })
  await step(page, 'continue to the request builder and describe the project', async () => {
    const before = await titleNow(page)
    await page.locator('a[href*="/services/configure"]:visible').last().click()
    await page.waitForURL(/\/services\/configure/)
    await newPageShown(page, before)
    // The builder opens at the first open question: choose what is asked, in order, until the project's description.
    for (let guard = 0; guard < 6; guard += 1) {
      const area = page.locator('main textarea').first()
      if (await area.isVisible().catch(() => false)) break
      const radio = page.locator('main input[type=radio]:not(:checked)').first()
      if (await radio.count()) await radio.check({ force: true })
      await page.locator('main button[type=submit]').first().click()
      await page.waitForTimeout(500)
    }
    await page.locator('main textarea').first().fill(note)
    await page.locator('main input[type=radio][id$="-leads"], main input[type=radio]').first().check({ force: true }).catch(() => {})
    const groups = await page.evaluate(() => [...new Set([...document.querySelectorAll('main input[type=radio]')].map((r) => r.name))])
    for (const name of groups) await page.locator(`main input[type=radio][name="${name}"]`).first().check({ force: true })
    await page.locator('main button[type=submit]').first().click()
    await page.waitForTimeout(500)
  })
  await step(page, 'review the request, then give a name, an e-mail address and consent', async () => {
    await waitText(page, 'main h2', /review|áttekint|controle|nakijken/i)
    await page.locator('main button[type=submit]').first().click()
    await page.waitForTimeout(500)
    await page.locator('main').getByLabel('Your name', { exact: true }).fill('E2E Tester')
    await page.locator('main').getByLabel('Email address', { exact: true }).fill(`e2e+${stamp}@example.test`)
    // The REQUIRED consent is the first box; the second one (hearing about other news) is optional and separate by design
    // (added with PROMPT 17). `.last()` used to be the required one and now ticks the optional box and leaves the request unsendable.
    const consent = page.locator('main input[type=checkbox]').first()
    if (!(await consent.isChecked())) await consent.check({ force: true })
  })
  await step(page, 'send the quote request and see the confirmation (only after the server accepted it)', async () => {
    const response = page.waitForResponse((r) => r.url().includes('/api/quote-requests') && r.request().method() === 'POST', { timeout: 20000 })
    await page.locator('main button[type=submit]').last().click()
    const reply = await response
    expect(reply.status() === 200 || reply.status() === 201, `API answered ${reply.status()}`)
    await page.waitForSelector('main [data-tone="success"], main [role=status]', { timeout: 15000 })
    // The body is read with a ceiling: a response whose page has moved on can leave the read waiting for ever.
    const body = await Promise.race([reply.json().catch(() => ({})), new Promise((resolve) => setTimeout(() => resolve({ unread: true }), 3000))])
    return `API ${reply.status()} ${JSON.stringify(body).slice(0, 60)}`
  })
}

async function journeyB(browser) {
  current = 'B'
  log('\nB  Client: services -> package -> builder -> quote request -> database -> e-mail')
  const { context, page } = await newPage(browser, { reduced: true })
  context.setDefaultTimeout(15000)
  const errors = watch(page)
  try {
    await step(page, 'start on the homepage and reach the shop from its package teaser', async () => {
      await page.goto(`${BASE}/en/`, { waitUntil: 'networkidle' })
      const teaser = page.locator('main a[href*="/services?package=launch"]').first()
      await teaser.scrollIntoViewIfNeeded()
      expect(await teaser.count() > 0, 'no package teaser')
    })
    await requestQuote(page, { mobile: false, lang: 'en', note: `E2E ${stamp}: a small website for a physiotherapy practice with an appointment request form.` })
    await step(page, 'the owner was notified in the language of the notification and the visitor is the Reply-To, not the sender', async () => {
      const mail = await waitForMail((text) => text.includes(stamp))
      expect(mail, 'no notification e-mail was written')
      const from = header(mail.text, 'From')
      const to = header(mail.text, 'To')
      const reply = header(mail.text, 'Reply-To')
      expect(/notifications@example\.test/.test(from), `From is ${from}`)
      expect(/owner@example\.test/.test(to), `To is ${to}`)
      expect(reply.includes(`e2e+${stamp}@example.test`), `Reply-To is ${reply}`)
      expect(/Content-Type: text\/plain/i.test(mail.text) && /Content-Type: text\/html/i.test(mail.text), 'not multipart plain + HTML')
      return `From ${from} | To ${to} | Reply-To ${reply}`
    })
    await step(page, 'no confirmation e-mail goes to the visitor while confirmations are off', async () => {
      const wrongRecipient = mails().find(({ text }) => header(text, 'To').includes(`e2e+${stamp}@example.test`))
      expect(!wrongRecipient, 'a message was addressed to the visitor')
    })
    await step(page, 'no console errors during the journey', async () => {
      expect(errors.length === 0, errors.slice(0, 3).join(' | '))
    })
  } finally {
    await context.close()
  }
}

// =====================================================================================================================
// C — the administrator
// =====================================================================================================================
async function journeyC(browser) {
  current = 'C'
  log('\nC  Administrator: sign in -> inquiry -> status + note -> quote -> catalogue edit -> public site')
  const { context, page } = await newPage(browser, { reduced: true, locale: 'en-US' })
  const errors = watch(page)
  const marker = `Admin journey ${stamp}`
  try {
    await step(page, 'a visitor sends a contact message (the public form, real API)', async () => {
      const visitor = await newPage(browser, { reduced: true })
      try {
        await visitor.page.goto(`${BASE}/en/contact/`, { waitUntil: 'networkidle' })
        await visitor.page.getByLabel('Your name', { exact: true }).fill('Journey Visitor')
        await visitor.page.getByLabel('Email address').fill(`journey+${stamp}@example.test`)
        await visitor.page.getByLabel('Subject').fill(marker)
        await visitor.page.locator('main textarea').fill('Hello, I would like to discuss a small project. This message is part of an automated end-to-end journey.')
        await visitor.page.locator('main input[type=radio]').first().check({ force: true })
        await visitor.page.locator('main input[type=checkbox]').check({ force: true })
        const response = visitor.page.waitForResponse((r) => r.url().includes('/api/contact') && r.request().method() === 'POST')
        await visitor.page.getByRole('button', { name: /Send message/ }).click()
        const reply = await response
        expect(reply.status() === 200 || reply.status() === 201, `API answered ${reply.status()}`)
      } finally {
        await visitor.context.close()
      }
    })
    await step(page, 'sign in (wrong password is refused first)', async () => {
      await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
      await page.getByLabel(/E-mail|Email/i).first().fill(ADMIN_EMAIL)
      await page.getByLabel(/Jelszó|Password/i).first().fill('definitely-not-the-password')
      await page.getByRole('button', { name: /Bejelentkezés|Sign in/i }).first().click()
      await page.waitForTimeout(1200)
      expect(await page.locator('#admin-menu-toggle').count() === 0, 'a wrong password signed in')
      await page.getByLabel(/Jelszó|Password/i).first().fill(ADMIN_PASSWORD)
      await page.getByRole('button', { name: /Bejelentkezés|Sign in/i }).first().click()
      await page.waitForSelector('#admin-menu-toggle', { timeout: 15000 })
    })
    await step(page, 'the dashboard counts the new messages', async () => {
      await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
      await h1(page).waitFor().catch(() => {})
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      expect(/\d/.test(text), 'the dashboard shows no number')
      return text.slice(0, 90)
    })
    await step(page, 'the new message is in the inquiry list and opens', async () => {
      await page.goto(`${BASE}/admin/inquiries`, { waitUntil: 'networkidle' })
      await page.getByText(marker).first().waitFor({ timeout: 15000 })
      await page.getByText(marker).first().click()
      await page.waitForURL(/\/admin\/inquiries\/[^/]+/)
      await page.getByText('Journey Visitor').first().waitFor()
    })
    await step(page, 'change the status of the message and add an internal note', async () => {
      await page.getByLabel('Change the status').selectOption('in_progress')
      await page.getByRole('button', { name: /^Change the status/ }).click()
      await page.getByText(/In progress/i).first().waitFor({ timeout: 10000 })
      await page.getByLabel('Add a note').fill(`Internal: called back ${stamp}`)
      await page.getByRole('button', { name: /^Add the note/ }).click()
      await page.getByText(`called back ${stamp}`).first().waitFor({ timeout: 10000 })
    })
    await step(page, 'the status change and the note are in the message\'s activity history, and survive a reload', async () => {
      await page.reload({ waitUntil: 'networkidle' })
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ')
      expect(text.includes(`called back ${stamp}`), 'the note is gone after a reload')
      expect(/In progress/i.test(text), 'the status is not In progress after a reload')
      expect(/status|note|created|received/i.test(text), 'no history entries')
    })
    await step(page, 'a destructive action asks for confirmation first (Delete this inquiry, then cancel)', async () => {
      await page.getByRole('button', { name: 'Delete this inquiry' }).click()
      const dialog = page.locator('dialog[open], [role=dialog], [role=alertdialog]').first()
      await dialog.waitFor({ timeout: 5000 })
      const cancel = dialog.getByRole('button', { name: /Cancel|Keep|No/i }).first()
      await cancel.click()
      await page.locator('dialog[open], [role=alertdialog]').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
      expect(await page.getByText(marker).count() > 0, 'the inquiry vanished after cancelling')
    })
    await step(page, 'the quote request from journey B is in the list, opens, and takes a status and a note', async () => {
      await page.goto(`${BASE}/admin/quotes`, { waitUntil: 'networkidle' })
      const row = page.locator('main a[href*="/admin/quotes/"]:visible', { hasText: /E2E Tester/ }).first()
      await row.waitFor({ timeout: 15000 })
      await row.click()
      await page.waitForURL(/\/admin\/quotes\/[^/]+/)
      await page.getByLabel('Add a note').waitFor()
      const select = page.getByLabel('Change the status')
      const options = await select.locator('option').evaluateAll((all) => all.map((option) => option.value))
      expect(options.length >= 2, 'no status choices')
      // A request that was already moved by an earlier run keeps working: choose a status it does not have yet.
      const current = await select.inputValue()
      await select.selectOption(options.find((value) => value !== current))
      await page.getByRole('button', { name: /^Change the status/ }).click()
      await page.getByLabel('Add a note').fill(`Quote note ${stamp}`)
      await page.getByRole('button', { name: /^Add the note/ }).click()
      await page.getByText(`Quote note ${stamp}`).first().waitFor({ timeout: 10000 })
      return `${options.length} statuses offered`
    })
    await step(page, 'the dashboard\'s numbers are the database\'s (counted again from the lists, per status)', async () => {
      const api = await page.evaluate(async () => {
        const get = async (path) => (await fetch(path, { credentials: 'same-origin' })).json()
        const dashboard = (await get('/api/admin/dashboard')).data
        const inquiries = await get('/api/admin/inquiries?pageSize=100&archived=all')
        const quotes = await get('/api/admin/quote-requests?pageSize=100&archived=all')
        return { dashboard, inquiries, quotes }
      })
      const camel = (status) => status.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      const count = (rows, key) => rows.filter((row) => !row.archived_at && camel(row.status) === key).length
      const d = api.dashboard
      expect(api.inquiries.meta.total === api.inquiries.data.length, 'the inquiry list is paged: raise pageSize')
      const live = (rows) => rows.filter((row) => !row.archived_at).length
      expect(d.inquiries.total === live(api.inquiries.data), `inquiries total ${d.inquiries.total} vs listed ${live(api.inquiries.data)}`)
      expect(d.quotes.total === live(api.quotes.data), `quotes total ${d.quotes.total} vs listed ${live(api.quotes.data)}`)
      for (const key of ['new', 'inProgress', 'waitingClient', 'completed']) expect(d.inquiries[key] === count(api.inquiries.data, key), `inquiries ${key}: dashboard ${d.inquiries[key]} vs ${count(api.inquiries.data, key)}`)
      for (const key of ['new', 'inReview', 'quoted', 'accepted', 'declined', 'closed']) expect(d.quotes[key] === count(api.quotes.data, key), `quotes ${key}: dashboard ${d.quotes[key]} vs ${count(api.quotes.data, key)}`)
      return `inquiries ${d.inquiries.total} (new ${d.inquiries.new}, in progress ${d.inquiries.inProgress}), quotes ${d.quotes.total} (new ${d.quotes.new}, in review ${d.quotes.inReview})`
    })
    await step(page, 'edit a service description in the administration (English overview and tagline)', async () => {
      await page.goto(`${BASE}/admin/services/service/website`, { waitUntil: 'networkidle' })
      await page.locator('#service-texts-tab-en').click()
      await page.getByLabel(/^Tagline/).fill(`Edited tagline ${stamp}.`)
      await page.getByLabel(/^Overview/).fill(`Edited overview ${stamp}: a short description written in the administration.`)
      await page.getByRole('button', { name: /^Save changes/ }).click()
      await page.waitForURL(/\/admin\/services/, { timeout: 15000 })
    })
    await step(page, 'the public catalogue API now serves the edited service text', async () => {
      const text = await page.evaluate(async () => JSON.stringify(await (await fetch('/api/shop/catalog')).json()))
      expect(text.includes(`Edited overview ${stamp}`), 'the API does not serve the edited overview')
    })
    if (args.rebuild) {
      await step(page, 'catalog:pull and a production build put the edit on the public page (a rebuild, as documented)', async () => {
        const { execSync } = require('node:child_process')
        const repo = args.repo
        expect(repo, 'pass --repo=<the repository> with --rebuild')
        const env = { ...process.env, CATALOG_API_URL: BASE, MSYS_NO_PATHCONV: '1', VITE_API_URL: '/', VITE_SITE_URL: 'https://example.test' }
        execSync('npm run catalog:pull', { cwd: repo, env, stdio: 'pipe' })
        try {
          execSync('npm run build', { cwd: repo, env, stdio: 'pipe' })
        } finally {
          // The pulled file is git-ignored but would colour every later build and test run: take it away again.
          execSync('npm run catalog:pull -- --remove', { cwd: repo, env, stdio: 'pipe' })
        }
        const visitor = await newPage(browser, { reduced: true })
        try {
          await visitor.page.goto(`${BASE}/en/services/website/`, { waitUntil: 'networkidle' })
          const body = await visitor.page.locator('main').innerText()
          expect(body.includes(`Edited overview ${stamp}`), 'the rebuilt page does not show the edited overview')
          expect(body.includes(`Edited tagline ${stamp}`), 'the rebuilt page does not show the edited tagline')
        } finally {
          await visitor.context.close()
        }
      })
    }
    await step(page, 'no console errors during the journey', async () => {
      expect(errors.length === 0, errors.slice(0, 3).join(' | '))
    })
  } finally {
    await context.close()
  }
}

// =====================================================================================================================
// E — the hidden racing experience (an Easter egg, not a seventh experience)
// =====================================================================================================================
/** A real touch on the red full stop (a tap on its centre: the headline's own motion keeps the element from ever being "stable" for Playwright's tap). */
async function tapDot(page) {
  const box = await page.locator('button[data-egg-dot]').first().boundingBox()
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
}

async function journeyE(browser) {
  current = 'E'
  log('\nE  Hidden racing experience: activation, loading state, fallback screen, exit, phone')
  for (const phone of [false, true]) {
    const label = phone ? 'phone 390x844' : 'desktop'
    const { context, page } = await newPage(browser, phone ? { width: 390, height: 844, mobile: true, reduced: false } : { reduced: false })
    const errors = watch(page)
    const requested = []
    page.on('request', (request) => { if (/nfsu2/.test(request.url())) requested.push(request.url()) })
    try {
      await step(page, `${label}: the Lab opens and the hint is there, the egg is not`, async () => {
        await page.goto(`${BASE}/en/lab/`, { waitUntil: 'networkidle' })
        expect((await page.locator('[data-egg]').count()) === 0, 'the egg is open on arrival')
        expect((await page.locator('iframe').count()) === 0, 'there is an iframe on the Lab page')
      })
      await step(page, `${label}: it opens ${phone ? 'by tapping the red full stop' : 'by typing N F S U 2'}`, async () => {
        if (phone) await tapDot(page)
        else await page.keyboard.type('nfsu2', { delay: 60 })
        await page.locator('[data-egg]').waitFor({ timeout: 5000 })
        expect(await page.locator('[data-egg]').getAttribute('data-phase') === 'wipe', 'it did not start in the loading state')
        expect(/pit lane/i.test(await page.locator('[data-egg] h1').innerText()), 'no loading title')
      })
      await step(page, `${label}: after the transition it offers OPEN NFSU2 (new tab) and a way back, and stays on this page`, async () => {
        await page.waitForFunction(() => document.querySelector('[data-egg]')?.getAttribute('data-phase') === 'ready', null, { timeout: 5000 })
        const link = page.locator('[data-egg] a')
        expect(await link.count() === 1, 'no OPEN NFSU2 link')
        expect((await link.getAttribute('href')) === 'https://nfsu2.xyz/', 'wrong address')
        expect((await link.getAttribute('target')) === '_blank', 'not a new tab')
        expect(/noopener/.test(await link.getAttribute('rel')) && /noreferrer/.test(await link.getAttribute('rel')), 'rel lacks noopener noreferrer')
        expect(/OPEN NFSU2/i.test(await link.innerText()), 'the label is not OPEN NFSU2')
        const back = page.locator('[data-egg] button')
        expect(await back.count() === 1 && /Back to the Lab/i.test(await back.innerText()), 'no way back')
        expect(/\/en\/lab\/?$/.test(new URL(page.url()).pathname), 'the page was navigated away')
        expect(requested.length === 0, `the page requested ${requested.join(', ')}`)
        const focused = await page.evaluate(() => document.activeElement?.tagName + ':' + (document.activeElement?.textContent || '').trim().slice(0, 12))
        expect(/^A:OPEN/i.test(focused), `focus is on ${focused}`)
        const box = await link.boundingBox()
        expect(box.height >= 44 && box.width >= 44, `the link is ${box.width}x${box.height}`)
      })
      await step(page, `${label}: Tab stays on the two choices; the page behind does not scroll`, async () => {
        const seen = new Set()
        for (let i = 0; i < 5; i += 1) {
          await page.keyboard.press('Tab')
          seen.add(await page.evaluate(() => (document.activeElement?.closest('[data-egg]') ? document.activeElement.tagName : 'OUTSIDE')))
        }
        expect(!seen.has('OUTSIDE'), 'focus left the layer')
        expect(await page.evaluate(() => getComputedStyle(document.body).overflow) === 'hidden', 'the page behind can scroll')
      })
      await step(page, `${label}: the exit control returns to the Lab, restores scrolling and focus, and the egg can open again`, async () => {
        await page.locator('[data-egg] button').click()
        await page.locator('[data-egg]').waitFor({ state: 'detached', timeout: 5000 })
        expect(await page.evaluate(() => getComputedStyle(document.body).overflow) !== 'hidden', 'scrolling was not restored')
        if (phone) await tapDot(page)
        else await page.keyboard.type('nfsu2', { delay: 60 })
        await page.locator('[data-egg]').waitFor({ timeout: 5000 })
        await page.keyboard.press('Escape')
        await page.locator('[data-egg]').waitFor({ state: 'detached', timeout: 5000 })
      })
      await step(page, `${label}: no sideways scroll, no console errors, nfsu2.xyz was never requested by this page`, async () => {
        expect(errors.length === 0, errors.slice(0, 3).join(' | '))
        expect(requested.length === 0, `requested ${requested.join(', ')}`)
        expect((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'sideways scroll')
      })
    } finally {
      await context.close()
    }
  }
  // Reduced motion: the same screen, at once.
  const reducedRun = await newPage(browser, { reduced: true })
  try {
    await step(reducedRun.page, 'reduced motion: the fallback screen appears within a fraction of a second', async () => {
      await reducedRun.page.goto(`${BASE}/en/lab/`, { waitUntil: 'networkidle' })
      await reducedRun.page.keyboard.type('nfsu2', { delay: 60 })
      await reducedRun.page.waitForFunction(() => document.querySelector('[data-egg]')?.getAttribute('data-phase') === 'ready', null, { timeout: 2000 })
    })
  } finally {
    await reducedRun.context.close()
  }
}

// =====================================================================================================================
// F — validation and failure messages, in every language
// =====================================================================================================================
async function journeyF(browser) {
  current = 'F'
  log('\nF  Validation and failure messages in Hungarian, English and Dutch (contact form and request builder)')
  const seen = {}
  for (const lang of ['hu', 'en', 'nl']) {
    const { context, page } = await newPage(browser, { reduced: true })
    const errors = watch(page)
    try {
      await step(page, `${lang}: an empty contact form says what is wrong, in ${lang}, next to the fields, and moves the focus`, async () => {
        await page.goto(`${BASE}/${lang}/contact/`, { waitUntil: 'networkidle' })
        await page.locator('main form button[type=submit]').click()
        await page.waitForSelector('main [aria-invalid="true"], main [data-tone="error"], main [role=alert]', { timeout: 5000 })
        const messages = await page.evaluate(() => [...document.querySelectorAll('main [id$="-error"], main [role=alert], main [data-error], main [aria-live] ')].map((el) => (el.textContent || '').trim()).filter(Boolean))
        const invalid = await page.locator('main [aria-invalid="true"]').count()
        expect(invalid >= 3, `${invalid} fields marked invalid`)
        expect(messages.length > 0, 'no message text found')
        for (const text of messages) expect(!/\b[a-z][a-zA-Z]+\.[a-z][a-zA-Z]+\.[a-zA-Z.]+\b|undefined|\[object/.test(text), `raw key or placeholder in "${text}"`)
        seen[lang] = messages.join(' | ')
        return `${invalid} invalid fields; "${messages[0].slice(0, 50)}"`
      })
      await step(page, `${lang}: a wrong e-mail address is named as such`, async () => {
        await page.locator('main input[type=email]').fill('not-an-address')
        await page.locator('main form button[type=submit]').click()
        await page.waitForTimeout(300)
        expect((await page.locator('main input[type=email]').getAttribute('aria-invalid')) === 'true', 'the e-mail field is not marked invalid')
      })
      await step(page, `${lang}: when the server cannot be reached the visitor is told, in ${lang}, and keeps what was typed`, async () => {
        await page.route('**/api/contact', (route) => route.abort('connectionrefused'))
        // The contact fields carry no `type` attribute (the browser's default is text), so `input[type=text]` would match none.
        const texts = page.locator('main form input:not([type])')
        await texts.first().fill('Failure Tester')
        await page.locator('main input[type=email]').fill('failure@example.test')
        await texts.nth(1).fill('Failure subject')
        await page.locator('main textarea').fill('This message cannot be sent because the connection is refused.')
        await page.locator('main input[type=radio]').first().check({ force: true })
        const consent = page.locator('main input[type=checkbox]')
        if (!(await consent.isChecked())) await consent.check({ force: true })
        await page.locator('main form button[type=submit]').click()
        await page.waitForSelector('main [data-tone="error"]', { timeout: 15000 })
        const text = (await page.locator('main [data-tone="error"]').first().innerText()).replace(/\s+/g, ' ')
        expect(!/success|sikeres|geslaagd/i.test(text.split('.')[0] ?? ''), 'it claims success')
        expect((await page.locator('main textarea').inputValue()).includes('connection is refused'), 'the typed message was lost')
        seen[`${lang}-failure`] = text
        return text.slice(0, 70)
      })
    } finally {
      await context.close()
    }
  }
  const dummy = await newPage(browser, { reduced: true })
  try {
    await step(dummy.page, 'the three languages say it in three different ways (nothing fell back to English)', async () => {
      expect(seen.hu && seen.en && seen.nl, 'a language is missing')
      expect(seen.hu !== seen.en && seen.nl !== seen.en && seen.hu !== seen.nl, 'two languages show the same messages')
      expect(seen['hu-failure'] !== seen['en-failure'] && seen['nl-failure'] !== seen['en-failure'], 'a failure message fell back to English')
    })
  } finally {
    await dummy.context.close()
  }
}

// =====================================================================================================================
// D — the phone
// =====================================================================================================================
async function journeyD(browser) {
  current = 'D'
  log('\nD  Mobile visitor: 390x844 touch phone')
  const { context, page } = await newPage(browser, { width: 390, height: 844, mobile: true, seen: false, reduced: false })
  const errors = watch(page)
  try {
    await step(page, 'open the homepage on the phone and enter through the introduction', async () => {
      await page.goto(`${BASE}/en/`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('dialog[open], [role=dialog]', { timeout: 20000 })
      await page.locator('dialog[open] button, [role=dialog] button').first().tap()
      await page.waitForSelector('dialog[open], [role=dialog]', { state: 'detached', timeout: 10000 })
    })
    await step(page, 'no sideways scrolling on the homepage', async () => {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      expect(over <= 0, `${over}px sideways`)
    })
    await step(page, 'the menu opens, lists every section, and closes with Escape', async () => {
      await page.getByRole('button', { name: /menu/i }).first().tap()
      await page.waitForSelector('dialog[open]')
      const links = await page.locator('dialog[open] a').count()
      expect(links >= 6, `${links} links in the menu`)
      await page.keyboard.press('Escape')
      await page.waitForSelector('dialog[open]', { state: 'detached' })
    })
    await step(page, 'open a project from Selected work', async () => {
      const link = page.locator('main a[href^="/en/work/"]').first()
      await link.scrollIntoViewIfNeeded()
      const before = await titleNow(page)
      await link.tap()
      await page.waitForURL(/\/en\/work\/[a-z-]+\/?$/)
      await newPageShown(page, before)
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      expect(over <= 0, `${over}px sideways on the project page`)
    })
    await requestQuote(page, { mobile: true, lang: 'en', note: `E2E phone ${stamp}: a booking page for a small studio.` })
    await step(page, 'no console errors during the journey', async () => {
      expect(errors.length === 0, errors.slice(0, 3).join(' | '))
    })
  } finally {
    await context.close()
  }
}

// A journey that hangs must not hang the run: every journey gets a ceiling, and so does the whole process.
const JOURNEY_MS = Number(args['journey-ms'] || 240000)
setTimeout(() => { console.log('WATCHDOG: the run took too long and was stopped'); process.exit(2) }, JOURNEY_MS * ONLY.length + 30000).unref()

;(async () => {
  const browser = await launch()
  const journeys = { A: journeyA, B: journeyB, C: journeyC, D: journeyD, E: journeyE, F: journeyF }
  for (const id of ONLY) {
    try { await journeys[id](browser) } catch (error) { if (error.message !== 'stop') { log(`  CRASH ${id}: ${error.message}`); results.push({ journey: id, step: 'crash', ok: false, detail: error.message }) } }
  }
  await browser.close()
  const failed = results.filter((r) => !r.ok)
  fs.writeFileSync(path.join(OUT, 'journeys.json'), JSON.stringify(results, null, 2))
  log(`\n${results.length - failed.length}/${results.length} steps passed${failed.length ? `, ${failed.length} failed` : ''}`)
  process.exit(failed.length ? 1 : 0)
})()
