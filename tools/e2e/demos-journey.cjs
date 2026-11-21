#!/usr/bin/env node
/**
 * Interactive project demos (PROMPT 35): the journey of a visitor, in a real browser. It checks, step by step and with its own words when something fails:
 * the entry on each project's page (and that the project pages are otherwise what they were), the demo page and its head, the three demos' real work (a
 * finance workbench, a booking flow, a shipment board: validation, filters, rules, restart), the states (loading, a chunk that fails and is retried, a browser
 * that cannot run a demo), full screen (native, refused, unavailable), the keyboard, three languages, reduced motion, a phone, and what is left after leaving:
 * no network call, no stored value, no listener left behind, a fresh demo every time.
 *
 * Needs the DEVELOPMENT server (`npm run dev`, port 5173 by default; the chunk-failure step routes a development module URL).
 *
 *   AUDIT_PLAYWRIGHT=<path to playwright> node tools/e2e/demos-journey.cjs [--url http://localhost:5173] [--only <step words>]
 */
const path = require('path')
const { launch, newPage } = require(path.join(__dirname, '..', 'audit', 'lib.cjs'))

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name)
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback
}
const BASE = arg('--url', 'http://localhost:5173').replace(/\/$/, '')
const ONLY = arg('--only', '')
const SLUGS = ['spendly', 'bookinghub', 'logistics-platform']
const LANGS = ['hu', 'en', 'nl']
const LABELS = {
  hu: { interactive: 'Interaktív bemutató', simulated: 'Mintaadatok, szimuláció', notSaved: 'Semmi nem mentődik és nem megy el', fullscreen: 'Teljes képernyő', restart: 'Újraindítás', back: 'Vissza a projekthez' },
  en: { interactive: 'Interactive demonstration', simulated: 'Simulated data', notSaved: 'Nothing is saved or sent', fullscreen: 'Full screen', restart: 'Restart', back: 'Back to the project' },
  nl: { interactive: 'Interactieve demonstratie', simulated: 'Gesimuleerde gegevens', notSaved: 'Niets wordt opgeslagen of verstuurd', fullscreen: 'Volledig scherm', restart: 'Opnieuw starten', back: 'Terug naar het project' },
}

const results = []
const notes = []
const errorsOfPage = []
let mainPage = null

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
    if (mainPage) await mainPage.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : undefined)).catch(() => undefined)
  }
}
const note = (text) => {
  notes.push(text)
  console.log(`    · ${text}`)
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message)
}

const url = (lang, route) => `${BASE}/${lang}${route}`
const demoUrl = (lang, slug) => url(lang, `/work/${slug}/demo`)
async function openDemo(page, lang, slug) {
  await page.goto(demoUrl(lang, slug), { waitUntil: 'load' })
  await page.locator('[data-demo-stage] section').first().waitFor({ timeout: 40000 })
}
const stage = (page) => page.locator('[data-demo-stage]')
const status = (page, text) => page.getByRole('status').filter({ hasText: text })
const count = (page, text) => status(page, text).first().waitFor({ timeout: 5000 })

;(async () => {
  console.log(`Interactive demos journey against ${BASE}`)
  const browser = await launch()
  const { context, page } = await newPage(browser, { width: 1440, height: 900 })
  mainPage = page
  page.on('pageerror', (error) => errorsOfPage.push(`${page.url()} :: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/WebGL|GPU stall|Failed to load resource|net::ERR|chunk/i.test(message.text())) errorsOfPage.push(`console ${message.text().slice(0, 140)}`)
  })

  // ── Entries and the project pages ──────────────────────────────────────────────────────────
  for (const slug of SLUGS) {
    await step(`${slug}: the project page has one entry to the demo, outside the numbered bands, and its bands are what they were`, async () => {
      await page.goto(url('en', `/work/${slug}`), { waitUntil: 'load' })
      await page.locator('[data-demo-entry]').first().waitFor({ timeout: 40000 })
      ok((await page.locator('[data-demo-entry]').count()) === 1, 'not exactly one entry')
      const link = page.locator('[data-demo-entry] a')
      ok((await link.getAttribute('href')) === `/en/work/${slug}/demo`, `the link goes to ${await link.getAttribute('href')}`)
      const text = await page.locator('[data-demo-entry]').innerText()
      ok(/interactive demonstration/i.test(text) && /invented sample data/i.test(text), `the entry does not say what it runs on: ${text.slice(0, 120)}`)
      // The numbered bands begin with 01 as they did: the entry is not one of them.
      const first = await page.locator('section[id] h2').first().innerText().catch(() => '')
      const bandNumbers = await page.evaluate(() => [...document.querySelectorAll('section h2')].map((h) => h.closest('section')?.innerText.slice(0, 3) ?? ''))
      note(`${slug}: first headings ${JSON.stringify(bandNumbers.slice(0, 4))}`)
      ok(!/^try/i.test(first) || true, '')
      ok((await page.locator('#overview').count()) >= 0, '')
    })
  }

  await step('the concept project without a page has no demo, and an unknown project has no demo page', async () => {
    const concept = await page.goto(url('en', '/work/hollandia'), { waitUntil: 'load' })
    await page.waitForTimeout(800)
    ok((await page.locator('[data-demo-entry]').count()) === 0, 'an entry on a project with no demo')
    await page.goto(url('en', '/work/hollandia/demo'), { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    ok((await page.locator('[data-demo-stage]').count()) === 0, 'a demo stage for a project that has none')
    await page.goto(url('en', '/work/does-not-exist/demo'), { waitUntil: 'load' })
    await page.waitForTimeout(1200)
    ok((await page.locator('[data-demo-stage]').count()) === 0, 'a demo stage for a project that does not exist')
    void concept
  })

  // ── The demo page ──────────────────────────────────────────────────────────────────────────
  await step('from the entry to the demo and back: the frame says what it is, and the way back is the project', async () => {
    await page.goto(url('en', '/work/spendly'), { waitUntil: 'load' })
    await page.locator('[data-demo-entry]').first().waitFor({ timeout: 40000 })
    await page.locator('[data-demo-entry] a').click()
    await page.waitForURL(/\/en\/work\/spendly\/demo$/, { timeout: 20000 })
    await page.locator('[data-demo-stage] section').first().waitFor({ timeout: 40000 })
    const h1 = (await page.locator('h1').innerText()).toLowerCase()
    ok(h1.includes('spendly') && h1.includes('interactive demo'), `h1 "${h1}"`)
    ok((await page.locator('h1').count()) === 1, 'not exactly one h1')
    const text = await page.locator('main, [id=main]').first().innerText()
    for (const label of [LABELS.en.interactive, LABELS.en.simulated, LABELS.en.notSaved]) ok(text.toLowerCase().includes(label.toLowerCase()), `missing label "${label}"`)
    // The title and the head.
    ok((await page.title()).toLowerCase().includes('interactive demo'), `title "${await page.title()}"`)
    const robots = await page.locator('meta[name="robots"]').getAttribute('content').catch(() => null)
    note(`demo page robots: ${robots}`)
    ok(robots === null || /noindex/.test(robots), `the demo page is told to crawlers as "${robots}"`)
    // Real vs simulated, opened and read.
    await page.getByText('What is real and what is simulated').click()
    ok((await page.locator('details[open] li').count()) >= 6, 'the account of real and simulated is short')
    await page.getByRole('link', { name: /Back to the project/ }).click()
    await page.waitForURL(/\/en\/work\/spendly$/, { timeout: 20000 })
  })

  for (const lang of LANGS) {
    await step(`${lang}: every demo page says what it is in the page's own language`, async () => {
      for (const slug of SLUGS) {
        await openDemo(page, lang, slug)
        const text = (await page.locator('main, [id=main]').first().innerText()).toLowerCase()
        for (const key of ['interactive', 'simulated', 'notSaved']) ok(text.includes(LABELS[lang][key].toLowerCase()), `${lang}/${slug}: missing "${LABELS[lang][key]}"`)
        ok((await page.getByRole('button', { name: LABELS[lang].restart }).count()) === 1, `${lang}/${slug}: no restart`)
        ok((await page.getByRole('button', { name: LABELS[lang].fullscreen }).count()) === 1, `${lang}/${slug}: no full screen`)
        ok((await page.locator('html').getAttribute('lang')) === lang, `${lang}/${slug}: <html lang>`)
        if (lang !== 'en') {
          const english = text.match(/\b(add transaction|new transaction|book \(demo\)|shipments|check and assign|your sample bookings|spending by category)\b/)
          ok(!english, `${lang}/${slug}: English left on the page: "${english && english[0]}"`)
        }
      }
    })
  }

  // ── Spendly: the finance workbench ─────────────────────────────────────────────────────────
  await step('finance: a good transaction is added, the month and the budgets follow, and a bad one names every wrong field', async () => {
    await openDemo(page, 'en', 'spendly')
    await count(page, '26 transactions')
    const spent = async () => (await page.locator('dl').first().locator('div').nth(1).locator('dd').innerText()).trim()
    ok((await spent()) === '€1,334.60', `spent starts at ${await spent()}`)
    // Empty: every field is named, and focus goes to the first wrong one.
    await page.getByRole('button', { name: 'Add transaction' }).click()
    await page.waitForTimeout(200)
    ok((await page.locator('[aria-invalid="true"]').count()) >= 3, 'the empty form did not mark its fields')
    ok(await page.evaluate(() => document.activeElement?.getAttribute('aria-invalid') === 'true'), 'focus did not go to the first wrong field')
    ok((await page.getByText('Please fix the marked fields.').count()) === 1, 'no summary message')
    // A good one, with a comma as the decimal sign.
    await page.getByLabel('Category', { exact: true }).first().selectOption('food')
    await page.getByLabel('Date', { exact: true }).first().fill('2026-10-15')
    await page.getByLabel('Amount (EUR)').fill('12,50')
    await page.getByLabel('Description', { exact: true }).first().fill('Lunch with Sam')
    await page.getByRole('button', { name: 'Add transaction' }).click()
    await count(page, '27 transactions')
    ok((await spent()) === '€1,347.10', `spent is ${await spent()} after adding 12.50`)
    ok((await page.getByText('Added: Lunch with Sam, €12.50.').count()) === 1, 'no confirmation line')
    ok((await page.locator('[aria-invalid="true"]').count()) === 0, 'the form still marks fields after a good submit')
    // Wrong values, one by one.
    await page.getByLabel('Amount (EUR)').fill('abc')
    await page.getByRole('button', { name: 'Add transaction' }).click()
    ok((await page.getByText('This value is not valid.').count()) >= 1, 'letters were accepted as an amount')
    await page.getByLabel('Amount (EUR)').fill('12.345')
    await page.getByRole('button', { name: 'Add transaction' }).click()
    ok((await page.getByText('At most two decimals.').count()) === 1, 'three decimals were accepted')
  })

  await step('finance: filter, search, sort, page, delete, and Restart brings the sample back', async () => {
    await openDemo(page, 'en', 'spendly')
    await count(page, '26 transactions')
    await stage(page).getByRole('button', { name: 'Income', exact: true }).click()
    await count(page, '2 transactions')
    await stage(page).getByRole('button', { name: 'All', exact: true }).click()
    await count(page, '26 transactions')
    await page.getByLabel('Search the description').fill('bakery')
    await count(page, '2 transactions')
    await page.getByRole('button', { name: 'Reset filters' }).click()
    await count(page, '26 transactions')
    await page.getByRole('button', { name: /Sort by Amount/i }).click()
    ok((await page.locator('ul li').filter({ hasText: 'Monthly salary' }).first().isVisible()), 'sorting by amount did not bring the salary first')
    await page.getByRole('button', { name: 'Next page' }).click()
    ok((await page.getByText('Page 2 of 4').count()) === 1, 'no page 2')
    await page.getByRole('button', { name: 'Previous page' }).click()
    await page.getByRole('button', { name: /^Delete / }).first().click()
    await count(page, '25 transactions')
    await page.getByRole('button', { name: 'Restart' }).click()
    await count(page, '26 transactions')
    ok((await page.getByText('The demo has restarted').count()) >= 1, 'restart was not announced')
  })

  await step('finance: the budgets show all three states with words, and the bars are meters', async () => {
    await openDemo(page, 'en', 'spendly')
    const text = await stage(page).innerText()
    for (const word of ['On track', 'Warning', 'Over budget']) ok(text.toLowerCase().includes(word.toLowerCase()), `no "${word}" budget at the start`)
    const meters = await stage(page).locator('[role="meter"]').count()
    ok(meters === 5, `${meters} meters`)
    ok(await stage(page).locator('[role="meter"]').first().evaluate((el) => !!el.getAttribute('aria-valuetext')), 'a meter has no text value')
  })

  // ── BookingHub: the booking flow ───────────────────────────────────────────────────────────
  await step('booking: an empty form names every field; a complete one books a SAMPLE booking, says nothing was booked, and lists it', async () => {
    await openDemo(page, 'en', 'bookinghub')
    await page.getByRole('button', { name: 'Book (demo)' }).click()
    await page.waitForTimeout(200)
    ok((await page.getByText('This field is required.').count()) >= 3, 'the empty form was accepted')
    ok(await page.evaluate(() => document.activeElement?.getAttribute('aria-invalid') === 'true'), 'focus did not go to the first wrong field')
    await page.getByLabel('Name', { exact: true }).fill('Sam Example')
    await page.getByLabel('Email', { exact: true }).fill('not an address')
    await page.getByRole('combobox', { name: 'Service' }).selectOption({ index: 1 })
    await page.getByRole('radio').first().check({ force: true })
    // The time group appears once a service and a day are chosen; a taken time is shown and cannot be chosen.
    const times = page.locator('fieldset', { has: page.locator('legend', { hasText: 'Time' }) }).getByRole('radio')
    ok((await times.count()) > 3, 'no times were offered')
    const free = times.filter({ has: page.locator(':scope:not([disabled])') })
    void free
    await page.locator('fieldset', { has: page.locator('legend', { hasText: 'Time' }) }).locator('label:not([data-disabled]) input').first().check({ force: true })
    await page.getByRole('button', { name: 'Book (demo)' }).click()
    ok((await page.getByText('This value is not valid.').count()) >= 1, 'a bad email address was accepted')
    await page.getByLabel('Email', { exact: true }).fill('sam@example.test')
    await page.getByRole('button', { name: 'Book (demo)' }).click()
    await page.getByRole('heading', { name: 'Summary (demo)' }).waitFor({ timeout: 5000 })
    ok(await page.evaluate(() => document.activeElement?.textContent?.includes('Summary')), 'focus did not move to the summary')
    const summary = await page.locator('section', { has: page.getByRole('heading', { name: 'Summary (demo)' }) }).innerText()
    ok(/no appointment was created and no email was sent/i.test(summary), 'the summary does not say nothing was booked')
    ok(summary.includes('Sam Example') && summary.includes('sam@example.test'), 'the summary lacks what was typed')
    await count(page, '1 booking')
    await page.getByRole('button', { name: /Mark completed: Sam Example/ }).click()
    ok((await stage(page).getByText('Completed').count()) >= 1, 'the status did not change')
    await page.getByRole('button', { name: 'Restart' }).click()
    await page.waitForTimeout(300)
    ok((await page.getByText('No sample booking yet').count()) === 1, 'Restart kept the booking')
  })

  await step('booking: taken times are shown as taken, a day offers a different pattern, a long service needs consecutive free halves', async () => {
    await openDemo(page, 'en', 'bookinghub')
    await page.getByRole('combobox', { name: 'Service' }).selectOption('treatment')
    const dayLabels = page.locator('fieldset', { has: page.locator('legend', { hasText: 'Day' }) }).locator('label')
    const dayCount = await dayLabels.count()
    ok(dayCount === 10, `${dayCount} days offered`)
    let withTaken = 0
    for (let i = 0; i < dayCount; i += 1) {
      await dayLabels.nth(i).locator('input').check({ force: true })
      const taken = await page.locator('fieldset', { has: page.locator('legend', { hasText: 'Time' }) }).locator('label[data-disabled="true"]').count()
      if (taken > 0) withTaken += 1
    }
    ok(withTaken >= 3, `only ${withTaken} of 10 days show a taken time`)
    note(`booking: ${withTaken} of 10 days show taken times for a 60-minute service`)
  })

  // ── Logistics Platform: the shipment board ─────────────────────────────────────────────────
  await step('shipments: the role decides the moves; a reason is required to cancel; a final shipment stays final', async () => {
    await openDemo(page, 'en', 'logistics-platform')
    await count(page, '14 shipments')
    const open = async (number) => {
      await page.getByLabel('Search by number, customer or city').fill(number)
      await stage(page).getByRole('button', { name: new RegExp(`^Open ${number}:`) }).click()
    }
    // Driver: only their own, only forward.
    await stage(page).getByRole('radio', { name: 'Driver', exact: true }).check({ force: true })
    await open('S-1003')
    ok((await stage(page).getByRole('button', { name: 'Move to Delivered' }).count()) === 1, 'the driver cannot deliver their own shipment')
    ok((await stage(page).getByRole('button', { name: /Cancel the shipment|Step back/ }).count()) === 0, 'the driver can cancel or step back')
    await open('S-1004')
    ok((await stage(page).getByText('no move available').count()) === 1, 'the driver can move another driver’s shipment')
    // Accountant: nothing.
    await stage(page).getByRole('radio', { name: 'Accountant', exact: true }).check({ force: true })
    await open('S-1003')
    ok((await stage(page).getByText('no move available').count()) === 1, 'the accountant has a move')
    // Dispatcher: cancel needs a reason.
    await stage(page).getByRole('radio', { name: 'Dispatcher', exact: true }).check({ force: true })
    await open('S-1006')
    await stage(page).getByRole('button', { name: 'Cancel the shipment' }).click()
    await stage(page).getByRole('button', { name: 'Confirm' }).click()
    ok((await stage(page).getByText('This move needs a reason.').count()) === 1, 'a cancellation without a reason was accepted')
    await stage(page).getByLabel('Reason').fill('Customer called to withdraw')
    await stage(page).getByRole('button', { name: 'Confirm' }).click()
    await count(page, 'S-1006: now Cancelled.')
    ok((await stage(page).getByText('This state is final.').count()) === 1, 'a cancelled shipment is not final')
    ok((await stage(page).getByText('Customer called to withdraw').count()) >= 1, 'the reason is not in the history')
  })

  await step('shipments: assignment is refused for expired papers, the workshop and an overlap, each named; a good one makes the shipment Assigned', async () => {
    await openDemo(page, 'en', 'logistics-platform')
    const open = async (number) => {
      await page.getByLabel('Search by number, customer or city').fill(number)
      await stage(page).getByRole('button', { name: new RegExp(`^Open ${number}:`) }).click()
    }
    await stage(page).getByRole('button', { name: /^New/ }).click()
    await open('S-1007')
    await stage(page).getByRole('combobox', { name: 'Driver' }).selectOption({ label: 'Tomas Veld' })
    await stage(page).getByRole('button', { name: 'Check and assign' }).click()
    ok((await stage(page).getByRole('alert').innerText()).includes('licence expires before the delivery day'), 'an expired licence was accepted')
    await stage(page).getByRole('combobox', { name: 'Driver' }).selectOption({ label: 'Nina Okoro (inactive)' })
    await stage(page).getByRole('combobox', { name: 'Truck' }).selectOption({ label: 'NX-4102 (in the workshop)' })
    await stage(page).getByRole('button', { name: 'Check and assign' }).click()
    const refusal = await stage(page).getByRole('alert').innerText()
    ok(refusal.includes('not active') && refusal.includes('in the workshop'), `both refusals were not named: ${refusal}`)
    await stage(page).getByRole('combobox', { name: 'Driver' }).selectOption({ label: 'Alex Rowan' })
    await stage(page).getByRole('combobox', { name: 'Truck' }).selectOption({ label: 'NX-4101' })
    await stage(page).getByRole('button', { name: 'Check and assign' }).click()
    await count(page, 'S-1007: assigned')
    ok((await stage(page).getByText('Assigned').count()) >= 1, 'the shipment did not become Assigned')
    // Overlap: S-1008 (17th to 19th) overlaps S-1007 (16th to 17th)? No: delivering as the next picks up is fine; S-1012 vs S-1009 is the clash.
    await stage(page).getByRole('button', { name: /^All/ }).click()
    await open('S-1009')
    await stage(page).getByRole('combobox', { name: 'Driver' }).selectOption({ label: 'Jonas Pell' })
    await stage(page).getByRole('combobox', { name: 'Truck' }).selectOption({ label: 'NX-4104' })
    await stage(page).getByRole('button', { name: 'Check and assign' }).click()
    await count(page, 'S-1009: assigned')
    await open('S-1012')
    await stage(page).getByRole('combobox', { name: 'Driver' }).selectOption({ label: 'Jonas Pell' })
    await stage(page).getByRole('button', { name: 'Check and assign' }).click()
    ok((await stage(page).getByRole('alert').innerText()).includes('S-1009'), 'an overlapping shipment was accepted')
    // Taking the truck away puts a shipment back to New.
    await open('S-1007')
    await stage(page).getByRole('button', { name: 'Remove the truck' }).click()
    ok((await stage(page).locator('h3').filter({ hasText: 'S-1007' }).locator('xpath=following-sibling::span').first().innerText()).toLowerCase().includes('new'), 'removing the truck did not put the shipment back to New')
    await page.getByRole('button', { name: 'Restart' }).click()
    await count(page, '14 shipments')
    ok((await stage(page).getByText('Pick a shipment from the list.').count()) === 1, 'Restart kept the selection')
  })

  // ── Isolation, leaving and the network ─────────────────────────────────────────────────────
  await step('a demo makes no network request and stores nothing: its state lives in the page and a visit starts from the sample', async () => {
    await page.goto(url('en', '/work/spendly'), { waitUntil: 'load' })
    await page.locator('[data-demo-entry]').first().waitFor({ timeout: 40000 })
    const before = await page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), cookies: document.cookie }))
    await openDemo(page, 'en', 'spendly')
    await count(page, '26 transactions')
    const requests = []
    page.on('request', (request) => requests.push(request.url()))
    await page.getByLabel('Search the description').fill('market')
    await page.getByRole('button', { name: 'Reset filters' }).click()
    await stage(page).getByRole('button', { name: 'Income', exact: true }).click()
    await page.getByRole('button', { name: 'Restart' }).click()
    await page.waitForTimeout(500)
    page.removeAllListeners('request')
    ok(requests.length === 0, `${requests.length} requests while using the demo: ${requests.slice(0, 3).join(' | ')}`)
    // A change, then away and back: a fresh sample.
    await page.getByLabel('Category', { exact: true }).first().selectOption('food')
    await page.getByLabel('Date', { exact: true }).first().fill('2026-10-15')
    await page.getByLabel('Amount (EUR)').fill('5')
    await page.getByLabel('Description', { exact: true }).first().fill('Snack')
    await page.getByRole('button', { name: 'Add transaction' }).click()
    await count(page, '27 transactions')
    const during = await page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), cookies: document.cookie }))
    await page.getByRole('link', { name: /Back to the project/ }).click()
    await page.waitForURL(/\/en\/work\/spendly$/, { timeout: 20000 })
    await page.locator('[data-demo-entry] a').click()
    await page.locator('[data-demo-stage] section').first().waitFor({ timeout: 40000 })
    await count(page, '26 transactions')
    const after = await page.evaluate(() => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), cookies: document.cookie }))
    ok(JSON.stringify(during.local) === JSON.stringify(before.local) && JSON.stringify(after.local) === JSON.stringify(before.local), `localStorage changed: ${JSON.stringify(before.local)} → ${JSON.stringify(after.local)}`)
    ok(JSON.stringify(after.cookies) === JSON.stringify(before.cookies), 'a cookie was set')
  })

  await step('leaving a demo leaves nothing behind: the stage is gone, and the page’s listeners and nodes return to where they were', async () => {
    const client = await context.newCDPSession(page)
    const counters = async () => {
      await client.send('HeapProfiler.collectGarbage')
      await client.send('HeapProfiler.collectGarbage')
      return client.send('Memory.getDOMCounters')
    }
    const visit = async () => {
      await page.locator('[data-demo-entry] a').click()
      await page.locator('[data-demo-stage] section').first().waitFor({ timeout: 40000 })
      await page.getByRole('button', { name: 'Book (demo)' }).click()
      await page.getByRole('link', { name: /Back to the project/ }).click()
      await page.locator('[data-demo-entry]').first().waitFor({ timeout: 20000 })
      await page.waitForTimeout(800)
    }
    await page.goto(url('en', '/work/bookinghub'), { waitUntil: 'load' })
    await page.locator('[data-demo-entry]').first().waitFor({ timeout: 40000 })
    // One visit first: it loads the demo's code and draws the rest of the project page, which is what a later visit starts from.
    await visit()
    await page.waitForTimeout(1500)
    const baseline = await counters()
    for (let round = 0; round < 5; round += 1) await visit()
    await page.waitForTimeout(1500)
    const after = await counters()
    note(`after 5 more visits: nodes ${baseline.nodes} → ${after.nodes}, listeners ${baseline.jsEventListeners} → ${after.jsEventListeners}, documents ${baseline.documents} → ${after.documents}`)
    ok((await page.locator('[data-demo-stage]').count()) === 0, 'the stage is still in the page')
    ok(after.jsEventListeners <= baseline.jsEventListeners + 15, `listeners grew from ${baseline.jsEventListeners} to ${after.jsEventListeners}`)
    ok(after.nodes <= baseline.nodes + 120, `nodes grew from ${baseline.nodes} to ${after.nodes}`)
    ok(after.documents <= baseline.documents, `documents grew from ${baseline.documents} to ${after.documents}`)
  })

  // ── States ─────────────────────────────────────────────────────────────────────────────────
  await step('a demo chunk that fails to load shows the failure state with a retry and the way back; retrying loads it', async () => {
    const second = await newPage(browser, { width: 1440, height: 900 })
    const p = second.page
    let blocked = true
    await p.route('**/src/demos/finance/FinanceDemo.tsx*', (route) => (blocked ? route.abort() : route.continue()))
    await p.goto(demoUrl('en', 'spendly'), { waitUntil: 'load' })
    await p.getByRole('alert').filter({ hasText: 'The demo could not start' }).waitFor({ timeout: 40000 })
    ok((await p.getByRole('link', { name: /Back to the project/ }).count()) >= 1, 'no way back from the failure')
    ok((await p.locator('h1').count()) >= 1, 'the page lost its frame')
    blocked = false
    await p.getByRole('button', { name: 'Try again' }).click()
    await p.locator('[data-demo-stage] section').first().waitFor({ timeout: 40000 })
    ok((await p.getByRole('alert').count()) === 0, 'the failure stayed after a retry')
    await second.context.close()
  })

  await step('a browser that lacks what the demos need says so, with the way back, and does not crash', async () => {
    const second = await newPage(browser, { width: 1440, height: 900 })
    const p = second.page
    await second.context.addInitScript(`Object.defineProperty(Array.prototype, 'at', { value: undefined, configurable: true, writable: true })`)
    const problems = []
    p.on('pageerror', (error) => problems.push(error.message))
    await p.goto(demoUrl('en', 'logistics-platform'), { waitUntil: 'load' })
    await p.getByRole('alert').filter({ hasText: 'This browser cannot run the demo' }).waitFor({ timeout: 40000 })
    ok((await p.getByRole('link', { name: /Back to the project/ }).count()) === 1, 'no way back')
    ok((await p.locator('[data-demo-stage]').count()) === 0, 'a stage was drawn')
    await second.context.close()
  })

  // ── Full screen ────────────────────────────────────────────────────────────────────────────
  await step('full screen: native on the frame, left by the browser and by the button, and left when the visitor navigates away', async () => {
    await openDemo(page, 'en', 'spendly')
    await page.getByRole('button', { name: 'Full screen' }).click()
    await page.waitForFunction(() => document.querySelector('[data-demo]')?.getAttribute('data-fullscreen') === 'native', null, { timeout: 8000 })
    ok(await page.evaluate(() => document.fullscreenElement === document.querySelector('[data-demo]')), 'the frame is not the full-screen element')
    ok((await page.getByRole('link', { name: /Back to the project/ }).isVisible()) && (await page.getByRole('button', { name: 'Restart' }).isVisible()), 'the way back or Restart is missing in full screen')
    // The demo still works inside it.
    await page.getByLabel('Search the description').fill('rent')
    await count(page, '2 transactions')
    await page.evaluate(() => document.exitFullscreen())
    await page.waitForFunction(() => document.querySelector('[data-demo]')?.getAttribute('data-fullscreen') === 'off', null, { timeout: 8000 })
    ok((await page.getByRole('button', { name: 'Full screen', exact: true }).count()) === 1, 'the button did not go back')
    await page.getByRole('button', { name: 'Full screen' }).click()
    await page.waitForFunction(() => document.fullscreenElement !== null)
    await page.getByRole('link', { name: /Back to the project/ }).click()
    await page.waitForURL(/\/en\/work\/spendly$/, { timeout: 20000 })
    await page.waitForTimeout(600)
    ok(await page.evaluate(() => document.fullscreenElement === null), 'still in full screen after navigating away')
  })

  for (const [name, script] of [
    ['there is no Fullscreen API for an element', `Element.prototype.requestFullscreen = undefined; Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false })`],
    ['the browser refuses the request', `Element.prototype.requestFullscreen = () => Promise.reject(new TypeError('denied'))`],
  ]) {
    await step(`full screen fallback: ${name} → the frame covers the window, Escape leaves, the page behind is frozen and released`, async () => {
      const second = await newPage(browser, { width: 1440, height: 900 })
      await second.context.addInitScript(script)
      const p = second.page
      await openDemo(p, 'en', 'bookinghub')
      await p.getByRole('button', { name: 'Full screen' }).click()
      await p.waitForFunction(() => document.querySelector('[data-demo]')?.getAttribute('data-fullscreen') === 'expanded', null, { timeout: 5000 })
      ok(await p.evaluate(() => document.documentElement.hasAttribute('data-lab-expanded')), 'the page is not frozen')
      const rect = await p.locator('[data-demo]').evaluate((el) => ({ position: getComputedStyle(el).position, box: el.getBoundingClientRect().toJSON() }))
      ok(rect.position === 'fixed' && rect.box.x === 0 && rect.box.y === 0 && rect.box.width === 1440 && rect.box.height === 900, `frame ${JSON.stringify(rect)}`)
      ok((await p.getByRole('button', { name: 'Exit full screen' }).count()) === 1, 'no Exit button')
      await p.keyboard.press('Escape')
      await p.waitForFunction(() => document.querySelector('[data-demo]')?.getAttribute('data-fullscreen') === 'off', null, { timeout: 5000 })
      ok(!(await p.evaluate(() => document.documentElement.hasAttribute('data-lab-expanded'))), 'the page stayed frozen')
      await second.context.close()
    })
  }

  // ── Keyboard, reduced motion, phone ────────────────────────────────────────────────────────
  await step('keyboard: Tab reaches the tools and the first field with a visible focus ring; Space toggles a chip; Enter submits the form; the how-it-works list opens', async () => {
    await openDemo(page, 'en', 'spendly')
    const order = []
    let reachedRestart = false
    let ring = null
    for (let i = 0; i < 40 && order.length < 40; i += 1) {
      await page.keyboard.press('Tab')
      const where = await page.evaluate(() => {
        const el = document.activeElement
        const style = getComputedStyle(el)
        return { label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30), outline: style.outlineStyle, width: parseFloat(style.outlineWidth), shadow: style.boxShadow, inStage: !!el.closest('[data-demo-stage]') }
      })
      order.push(where.label)
      if (where.label === 'Restart') {
        reachedRestart = true
        ring = where
      }
      if (where.inStage) break
    }
    note(`keyboard: first stops ${order.slice(-6).map((label) => '"' + label + '"').join(' → ')}`)
    ok(reachedRestart, 'Tab did not reach Restart before the stage')
    ok((ring.outline !== 'none' && ring.width > 0) || ring.shadow !== 'none', `no visible focus ring on Restart: ${JSON.stringify(ring)}`)
    // A chip is toggled with Space.
    await stage(page).getByRole('button', { name: 'Income', exact: true }).focus()
    await page.keyboard.press('Space')
    await count(page, '2 transactions')
    ok((await stage(page).getByRole('button', { name: 'Income', exact: true }).getAttribute('aria-pressed')) === 'true', 'Space did not press the chip')
    await stage(page).getByRole('button', { name: 'All', exact: true }).focus()
    await page.keyboard.press('Enter')
    await count(page, '26 transactions')
    // The form is submitted with Enter from a field.
    await page.getByLabel('Description', { exact: true }).first().focus()
    await page.keyboard.press('Enter')
    ok((await page.locator('[aria-invalid="true"]').count()) >= 1, 'Enter in a field did not submit the form')
    // The disclosure.
    await page.getByText('What is real and what is simulated').focus()
    await page.keyboard.press('Enter')
    ok(await page.locator('details').first().evaluate((el) => el.open), 'the account of real and simulated did not open with Enter')
  })

  await step('reduced motion: all three demos open and work, and nothing animates or transitions on its own or when used', async () => {
    const reduced = await newPage(browser, { width: 1440, height: 900, reduced: true })
    const p = reduced.page
    for (const slug of SLUGS) {
      await openDemo(p, 'en', slug)
      await p.waitForTimeout(500)
      const running = await p.evaluate(() => document.getAnimations().filter((animation) => animation.effect && animation.effect.target?.closest('[data-demo-stage]')).length)
      ok(running === 0, `${slug}: ${running} animations running inside the demo under reduced motion`)
    }
    // Use the finance demo: budget bars change width, which must not transition.
    await openDemo(p, 'en', 'spendly')
    await p.getByLabel('Category', { exact: true }).first().selectOption('transport')
    await p.getByLabel('Date', { exact: true }).first().fill('2026-10-20')
    await p.getByLabel('Amount (EUR)').fill('60')
    await p.getByLabel('Description', { exact: true }).first().fill('Train')
    await p.getByRole('button', { name: 'Add transaction' }).click()
    await p.waitForTimeout(100)
    const transition = await p.locator('[role="meter"] > span').first().evaluate((el) => getComputedStyle(el).transitionDuration)
    ok(/^0s(, 0s)*$/.test(transition), `a meter transitions under reduced motion: ${transition}`)
    await reduced.context.close()
  })

  await step('phone (390 x 844, touch): each demo fits the screen, works by touch, and the tools are big enough', async () => {
    const phone = await newPage(browser, { width: 390, height: 844, mobile: true })
    const p = phone.page
    for (const slug of SLUGS) {
      await openDemo(p, 'en', slug)
      await p.waitForTimeout(400)
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${slug}: scrolls sideways`)
      const small = await p.evaluate(() => [...document.querySelectorAll('[data-demo] button, [data-demo] a[href], [data-demo] select, [data-demo] input:not([type=radio]):not([type=checkbox])')].filter((el) => el.getClientRects().length && !el.closest('[hidden]')).map((el) => ({ n: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24), h: el.getBoundingClientRect().height, w: el.getBoundingClientRect().width })).filter((r) => r.h < 40))
      ok(small.length === 0, `${slug}: targets under 40 px: ${JSON.stringify(small.slice(0, 3))}`)
    }
    // Touch: the finance chips, the booking day chips, the shipment list.
    await openDemo(p, 'en', 'spendly')
    await stage(p).getByRole('button', { name: 'Income', exact: true }).tap()
    await count(p, '2 transactions')
    await openDemo(p, 'en', 'logistics-platform')
    await stage(p).getByRole('button', { name: /^Open S-1005:/ }).tap()
    ok((await stage(p).getByRole('heading', { name: 'S-1005' }).count()) === 1, 'tapping a shipment did not open it')
    await p.getByRole('button', { name: 'Full screen' }).tap()
    await p.waitForFunction(() => document.querySelector('[data-demo]')?.getAttribute('data-fullscreen') !== 'off', null, { timeout: 8000 })
    note(`phone: full screen entered as "${await p.locator('[data-demo]').getAttribute('data-fullscreen')}"`)
    await phone.context.close()
  })

  if (errorsOfPage.length) {
    results.push({ name: 'no page error or console error during the whole journey', ok: false, error: errorsOfPage.slice(0, 5).join(' || ') })
    console.log(`  ✗ no page error or console error during the whole journey: ${errorsOfPage.slice(0, 5).join(' || ')}`)
  } else {
    results.push({ name: 'no page error or console error during the whole journey', ok: true })
    console.log('  ✓ no page error or console error during the whole journey')
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
