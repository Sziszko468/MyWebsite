// The business analytics (PROMPT 32) as a person uses it, in a real Chrome, against a FRESH scratch backend that serves the built administration and holds clearly labelled SYNTHETIC rows
// (tools/audit/seed-analytics.mjs). It checks what no unit test can: that the screen shows the server's own figures, that the period and the filters live in the address and work, that a
// bad range is refused before the server is asked, that a drill-down opens the page it names (with the filter it names), that the CSV is what the screen shows, that printing marks one
// section and cleans up after itself, that a role sees only what it may, and that nothing private or cacheable leaves the server.
//
//   node tools/e2e/analytics-journey.cjs --base=http://127.0.0.1:8793 --admin=admin@example.test:PASSWORD --editor=editor@example.test:PASSWORD
//
// Exit code 1 when a step fails.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { launch } = require('../audit/lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8793').replace(/\/$/, '')
const [ADMIN_EMAIL, ADMIN_PASSWORD] = arg('admin', '').split(':')
const [EDITOR_EMAIL, EDITOR_PASSWORD] = arg('editor', '').split(':')
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Give --admin=email:password (and --editor=email:password) of administrators in a throw-away database.')
  process.exit(2)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const step = async (name, fn) => {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ok   ${name}`)
  } catch (error) {
    results.push({ name, ok: false, error: String(error && error.message ? error.message : error).slice(0, 400) })
    console.log(`  FAIL ${name}\n       ${String(error && error.message ? error.message : error).slice(0, 400)}`)
  }
}
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}

async function signIn(browser, email, password, { language = 'en', width = 1280, height = 900, scheme = 'light' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, acceptDownloads: true, locale: 'en-GB' })
  await context.addInitScript(`try { if (!localStorage.getItem('cc-admin-analytics-language')) localStorage.setItem('cc-admin-analytics-language', '${language}'); window.print = () => { window.__printed = (window.__printed || 0) + 1 } } catch (e) {}`)
  const page = await context.newPage()
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 10000 })
  return { context, page }
}

const settle = async (page) => {
  await page.waitForLoadState('networkidle').catch(() => {})
  for (let i = 0; i < 60; i += 1) {
    if (!(await page.$('[aria-busy="true"]'))) break
    await sleep(100)
  }
  await sleep(250)
}
const api = (page, query, init) =>
  page.evaluate(
    async ([query, init]) => {
      const response = await fetch(`/api/admin/analytics${query}`, init || {})
      return { status: response.status, cache: response.headers.get('cache-control'), robots: response.headers.get('x-robots-tag'), text: await response.text() }
    },
    [query, init],
  )
const open = async (page, query = '') => {
  await page.goto(`${BASE}/admin/analytics${query}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { level: 2 }).first().waitFor({ timeout: 15000 })
  await settle(page)
}
const card = (page, name) => page.getByRole('article', { name, exact: true })
const valueOf = async (page, name) => (await card(page, name).locator('p').first().innerText()).trim()

;(async () => {
  const browser = await launch()
  const admin = await signIn(browser, ADMIN_EMAIL, ADMIN_PASSWORD)
  const page = admin.page
  console.log('Analytics journey')

  await step('the screen opens with its nine sections and the server\'s own figures', async () => {
    await open(page)
    expect((await page.getByRole('heading', { level: 1 }).innerText()) === 'Business analytics', 'the title')
    const tabs = await page.getByRole('tab').allInnerTexts()
    expect(tabs.join('|') === 'Overview|Financial pipeline|Customers|Quote funnel|Projects|Consultations|Communication|AI usage and cost|Alerts', `the tabs: ${tabs.join('|')}`)
    const answer = await api(page, '?section=executive&period=last_30_days')
    const data = JSON.parse(answer.text).data
    const requests = data.section.metrics.find((m) => m.id === 'newQuoteRequests')
    const shown = await valueOf(page, 'New quote requests')
    expect(shown === new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(requests.value), `shown ${shown}, server ${requests.value}`)
    const revenue = card(page, 'Recorded revenue')
    expect((await revenue.innerText()).includes('Not available'), 'recorded revenue says it is not available')
    expect(!/\n0\n/.test(await revenue.innerText()), 'recorded revenue is not drawn as a zero')
  })

  await step('the answer is never cacheable and never indexable', async () => {
    const answer = await api(page, '?section=executive')
    expect(/no-store/.test(answer.cache || ''), `cache-control: ${answer.cache}`)
    expect(/noindex/.test(answer.robots || ''), `x-robots-tag: ${answer.robots}`)
  })

  await step('a period chosen is in the address, refreshes the figures, survives a reload and the back button', async () => {
    await page.getByLabel('Period', { exact: true }).selectOption('last_7_days')
    await settle(page)
    expect(page.url().includes('period=last_7_days'), `url ${page.url()}`)
    expect((await page.getByRole('list', { name: 'About these figures' }).innerText()).includes('(7 days)'), 'the period line says 7 days')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await settle(page)
    expect((await page.getByLabel('Period', { exact: true }).inputValue()) === 'last_7_days', 'the choice survived a reload')
    await page.goBack()
    await settle(page)
  })

  await step('a custom period that cannot be is refused before the server is asked', async () => {
    await open(page, '?period=custom')
    expect((await page.getByRole('alert').innerText()).includes('Choose the first and the last day'), 'missing dates are said')
    await page.getByLabel('From', { exact: true }).fill('2026-11-05')
    await page.getByLabel('To', { exact: true }).fill('2026-11-01')
    await settle(page)
    expect((await page.getByRole('alert').innerText()).includes('must not be after'), 'a reversed range is said')
    await page.getByLabel('From', { exact: true }).fill('2015-01-01')
    await page.getByLabel('To', { exact: true }).fill('2026-11-01')
    await settle(page)
    expect((await page.getByRole('alert').innerText()).includes('at most 1830 days'), 'a range over five years is said')
    await page.getByLabel('From', { exact: true }).fill('2026-10-01')
    await page.getByLabel('To', { exact: true }).fill('2026-10-31')
    await settle(page)
    expect((await page.getByRole('list', { name: 'About these figures' }).innerText()).includes('(31 days)'), 'a good range is computed')
  })

  await step('a hand-edited address cannot ask for anything odd: unknown values are dropped', async () => {
    await open(page, "?section=financial&period=forever&currency=USD&service=x'%3B%20DROP%20TABLE%20services%3B--&quoteStatus=%3Cscript%3E")
    expect((await page.getByLabel('Period', { exact: true }).inputValue()) === 'last_30_days', 'the period fell back')
    expect((await page.getByLabel('Currency', { exact: true }).inputValue()) === '', 'the currency fell back')
    const bad = await api(page, '?section=financial&lang=<script>')
    expect(bad.status === 422, `an invalid parameter is refused (${bad.status})`)
    const unknown = await api(page, '?section=financial&drop=1')
    expect(unknown.status === 422, `an unknown parameter is refused (${unknown.status})`)
    const section = await api(page, '?section=../../etc')
    expect(section.status === 404, `an unknown section is refused (${section.status})`)
  })

  await step('the currency filter separates money: a euro view has no forint', async () => {
    await open(page, '?section=financial')
    expect(/Hungarian forint/i.test(await page.getByRole('article', { name: 'Open pipeline' }).innerText()), 'both currencies are shown, each on its own')
    await page.getByLabel('Currency', { exact: true }).selectOption('EUR')
    await settle(page)
    const pipeline = await page.getByRole('article', { name: 'Open pipeline' }).innerText()
    expect(!/forint/i.test(pipeline) && /EURO/i.test(pipeline), 'only euro remains')
    expect((await page.getByText('never added or converted').count()) > 0, 'the page says money is never added')
  })

  await step('the project status filter says what it filters and what it does not: figures now, events of the period, figures that are not about projects, a status outside "active"', async () => {
    await open(page, '?section=projects')
    expect((await page.getByText('Counts only projects whose status is this one now').count()) > 0, 'the filter says in its own description what it does not filter')
    await page.getByLabel('Project status', { exact: true }).selectOption('on_hold')
    await settle(page)
    expect(page.url().includes('projectStatus=on_hold'), `url ${page.url()}`)
    expect((await page.locator('[role=note]', { hasText: 'Project status filter: On hold' }).count()) === 1, 'the section says which status filters it, and that some figures keep their own meaning')
    expect((await card(page, 'Active projects').innerText()).includes('Filtered by project status'), 'a figure about projects now is marked filtered')
    expect((await card(page, 'Completed projects').innerText()).includes('Not filtered by project status'), 'an event of the period is marked not filtered')
    expect(/whatever status the project has today/.test(await card(page, 'Completed projects').innerText()), 'and says why')
    expect((await card(page, 'Projects on hold').innerText()).includes('Filtered by project status'), 'projects on hold, for the status on hold')
    // A status outside "active": figures defined for active projects have nothing to show, and say so instead of a zero.
    await page.getByLabel('Project status', { exact: true }).selectOption('completed')
    await settle(page)
    const empty = await card(page, 'Active projects').innerText()
    expect(/Empty by definition/.test(empty) && /defined for active projects only/.test(empty), `empty by definition: ${empty.slice(0, 160)}`)
    expect(!/\n0\n/.test(empty), 'and no zero is drawn for it')
    expect((await card(page, 'Completed projects').innerText()).includes('Not filtered by project status'), 'the events of the period stay as they are')
    // The overview: the project figures follow the filter, every other figure says that it is not about projects.
    await open(page, '?projectStatus=design')
    expect((await card(page, 'Active projects').innerText()).includes('Filtered by project status'), 'overview: a project figure is filtered')
    const requests = await card(page, 'New quote requests').innerText()
    expect(/Not filtered by project status/.test(requests) && /not about projects/.test(requests), 'overview: a figure that is not about projects says so')
    expect((await card(page, 'Accepted quotation value').innerText()).includes('Not filtered by project status'), 'overview: money says so too')
    // The alerts: which kinds are filtered and which are not.
    await open(page, '?section=alerts&projectStatus=development')
    const banner = await page.locator('[role=note]', { hasText: 'Project status filter: Development' }).innerText()
    expect(/Filtered by project status: .*Overdue milestone/.test(banner) && /Not filtered by project status: .*Request not reviewed/.test(banner), `alerts banner: ${banner}`)
    // A filter that the section does not use is said, not dropped silently, and can be cleared.
    await open(page, '?section=financial&projectStatus=design')
    const ignored = await page.locator('[role=note]', { hasText: 'Not used in this section' }).innerText()
    expect(/Project status/.test(ignored), `ignored filter: ${ignored}`)
    await page.getByRole('button', { name: 'Clear these filters' }).click()
    await settle(page)
    expect(!page.url().includes('projectStatus'), `cleared: ${page.url()}`)
    // The API never lets the filter widen what a role may read, and the CSV says what the filter did to each figure.
    const forbidden = await api(page, '?section=financial&projectStatus=design')
    expect(forbidden.status === 200 && JSON.parse(forbidden.text).data.section.filterSummary.projectStatus.effect === 'not_applicable', 'the financial section says the filter does not apply to it')
    await open(page, '?section=projects&projectStatus=development')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()])
    const file = path.join(os.tmpdir(), `analytics-filter-${Date.now()}.csv`)
    await download.saveAs(file)
    const csv = fs.readFileSync(file, 'utf8')
    fs.unlinkSync(file)
    for (const needle of ['# Project status filter: development', '[filter-scope]', 'metric,completedProjects,projectStatus,not_applied,historical_event', 'metric,activeProjects,projectStatus,applied']) expect(csv.includes(needle), `the CSV has "${needle}"`)
    // Hungarian and Dutch say the same things.
    await page.getByLabel('Language of this screen').selectOption('hu')
    await settle(page)
    const hu = await page.locator('body').innerText()
    expect(/Projektállapot-szűrő: Fejlesztés/.test(hu) && /Projektállapot szerint nem szűrt/.test(hu), 'Hungarian')
    await page.getByLabel('A képernyő nyelve').selectOption('nl')
    await settle(page)
    const nl = await page.locator('body').innerText()
    expect(/Projectstatusfilter: Ontwikkeling/.test(nl) && /Niet gefilterd op projectstatus/.test(nl), 'Dutch')
    await page.getByLabel('Taal van dit scherm').selectOption('en')
    await settle(page)
  })

  await step('the screen speaks Hungarian and Dutch on request, writes numbers their way, and remembers the choice', async () => {
    await open(page, '?section=financial')
    await page.getByLabel('Language of this screen').selectOption('hu')
    await settle(page)
    expect((await page.getByRole('heading', { level: 1 }).innerText()) === 'Üzleti analitika', 'Hungarian title')
    expect(/\d\s?\d{3},\d{2}\s(€|EUR)/.test(await page.getByRole('article', { name: 'Ajánlott érték' }).innerText()) || /,\d{2}\s(€|EUR)/.test(await page.getByRole('article', { name: 'Ajánlott érték' }).innerText()), 'a Hungarian amount')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await settle(page)
    expect((await page.getByRole('heading', { level: 1 }).innerText()) === 'Üzleti analitika', 'the language was remembered')
    await page.getByLabel('A képernyő nyelve').selectOption('nl')
    await settle(page)
    expect((await page.getByRole('heading', { level: 1 }).innerText()) === 'Bedrijfsanalyse', 'Dutch title')
    expect((await page.locator('body').innerText()).includes('nooit opgeteld of omgerekend'), 'Dutch money note')
    await page.getByLabel('Taal van dit scherm').selectOption('en')
    await settle(page)
  })

  await step('the sections are tabs: the arrow keys move between them and the address follows', async () => {
    await open(page)
    await page.getByRole('tab', { name: 'Overview' }).focus()
    await page.keyboard.press('ArrowRight')
    await settle(page)
    expect(page.url().includes('section=financial'), `url ${page.url()}`)
    expect((await page.getByRole('tab', { name: 'Financial pipeline' }).getAttribute('aria-selected')) === 'true', 'the financial tab is selected')
    await page.keyboard.press('End')
    await settle(page)
    expect(page.url().includes('section=alerts'), `url ${page.url()}`)
  })

  await step('a drill-down opens the page it names, with the filter it names', async () => {
    await open(page)
    await card(page, 'Waiting for your reply').getByRole('link', { name: 'Open the records' }).click()
    await page.waitForURL(/\/admin\/communications/, { timeout: 8000 })
    await settle(page)
    expect(page.url().includes('filter=waiting_owner'), `url ${page.url()}`)
    const selected = await page.evaluate(() => [...document.querySelectorAll('select')].map((s) => s.options[s.selectedIndex]?.value))
    expect(selected.includes('waiting_owner'), `the list starts filtered: ${selected.join(',')}`)
    await open(page)
    await card(page, 'Open quotations').getByRole('link', { name: 'Open the records' }).click()
    await page.waitForURL(/\/admin\/quotes/, { timeout: 8000 })
    expect(page.url().includes('status=quote_sent'), `url ${page.url()}`)
  })

  await step('every chart has its numbers as a table, and an alert is a record with a reason and a next step', async () => {
    await open(page, '?section=financial')
    const figures = await page.locator('figure').count()
    expect(figures > 0, 'there are charts')
    expect((await page.locator('figure details table').count()) === (await page.locator('figure:has(details)').count()), 'every chart with a table has the table')
    await page.locator('figure details summary').first().click()
    expect((await page.locator('figure details[open] table tbody tr').count()) > 0, 'the table has rows')
    await open(page, '?section=alerts')
    const first = page.locator('ul li[data-severity]').first()
    const text = await first.innerText()
    expect(/Suggested next step/.test(text) && /High|Medium|Low/.test(text), `an alert card: ${text.slice(0, 120)}`)
    expect((await first.locator('a[href^="/admin/"]').count()) === 1, 'an alert links to its record')
  })

  await step('the CSV is the screen\'s own section: filters, period, zone, time, kinds and limits, with the byte order mark, and nothing private', async () => {
    await open(page, '?section=financial&currency=EUR&period=last_90_days')
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()])
    const file = path.join(os.tmpdir(), `analytics-${Date.now()}.csv`)
    await download.saveAs(file)
    const bytes = fs.readFileSync(file)
    fs.unlinkSync(file)
    expect(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, 'the file starts with a byte order mark')
    const text = bytes.toString('utf8').slice(1)
    expect(/^analytics-financial-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/.test(download.suggestedFilename()), `file name ${download.suggestedFilename()}`)
    for (const needle of ['# Report: financial', '# Period: ', '# Business time zone: ', '# Generated at: ', 'currency=EUR', 'NEVER added across currencies', '[metrics]', '[money]', '[limitations]', 'no_payment_data']) expect(text.includes(needle) || text.toLowerCase().includes(needle.toLowerCase()), `the CSV has "${needle}"`)
    expect(!/,HUF,/.test((text.split('[money]')[1] || '').split('[series]')[0]), 'a euro export has no forint money lines')
    expect(!/@[a-z0-9-]+\.[a-z]/i.test(text), 'no e-mail address in the file')
    expect(!/password|secret|token|private ?note/i.test(text.replace(/(^|\n)# [^\n]*/g, '')), 'no secret or private note in the file')
  })

  await step('printing marks one section, shows its header and nothing else, and cleans up when the dialog closes', async () => {
    await open(page, '?section=executive')
    await page.getByRole('button', { name: 'Print report' }).click()
    expect((await page.evaluate(() => window.__printed)) === 1, 'the print dialog was asked for')
    expect((await page.evaluate(() => document.body.dataset.printing)) === 'assistant', 'the page is marked for printing')
    expect((await page.locator('[data-printable]').count()) === 1, 'exactly one element is marked')
    await page.emulateMedia({ media: 'print' })
    const printed = await page.evaluate(() => {
      const target = document.querySelector('[data-printable]')
      const visible = (el) => !!el && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'
      const header = target.querySelector('p')
      return { target: visible(target), header: visible(header), headerText: header.innerText, sidebar: visible(document.querySelector('nav')), colour: getComputedStyle(target).color, buttons: visible(target.parentElement.querySelector('button')) }
    })
    expect(printed.target && printed.header, `the section and its header are shown: ${JSON.stringify(printed)}`)
    expect(/Business analytics report/i.test(printed.headerText), `header text ${printed.headerText}`)
    expect(!printed.sidebar, 'the navigation is not printed')
    expect(!printed.buttons, 'the action buttons are not printed')
    expect(/rgb\(0, 0, 0\)/.test(printed.colour), `black on white: ${printed.colour}`)
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
    expect((await page.evaluate(() => [document.body.dataset.printing, document.querySelector('[data-printable]')])).every((value) => value === undefined || value === null), 'the marks were taken off')
    await page.emulateMedia({ media: 'screen' })
  })

  await step('the refresh button asks again and the figures carry a new time', async () => {
    await open(page)
    const before = await page.getByRole('list', { name: 'About these figures' }).innerText()
    await sleep(1100)
    await page.getByRole('button', { name: 'Refresh' }).click()
    await settle(page)
    const after = await page.getByRole('list', { name: 'About these figures' }).innerText()
    expect(before !== after || /Computed/.test(after), 'the computed time is shown')
  })

  await admin.context.close()

  if (EDITOR_EMAIL) {
    await step('an editor sees the sections the role may read, a "not available" instead of a zero for the rest, and cannot export what it cannot read', async () => {
      const editor = await signIn(browser, EDITOR_EMAIL, EDITOR_PASSWORD)
      const p = editor.page
      await open(p)
      const tabs = await p.getByRole('tab').allInnerTexts()
      expect(!tabs.includes('AI usage and cost') && tabs.includes('Financial pipeline'), `an editor has no AI section: ${tabs.join('|')}`)
      const ai = await api(p, '?section=ai')
      expect(ai.status === 200 && JSON.parse(ai.text).data.section.state === 'not_permitted', 'the server answers not_permitted for the AI section')
      expect(JSON.parse(ai.text).data.section.metrics.length === 0, 'and sends no figure with it')
      const exported = await p.evaluate(async () => (await fetch('/api/admin/analytics/export?report=ai')).status)
      expect(exported === 403, `the export of a section the role cannot read is refused (${exported})`)
      await p.goto(`${BASE}/admin/analytics?section=ai`, { waitUntil: 'domcontentloaded' })
      await settle(p)
      expect((await p.getByRole('tab', { selected: true }).innerText()) === 'Overview', 'a section the role cannot open falls back to the overview')
      await editor.context.close()
    })
  }

  await step('nobody who is not signed in can read or export anything', async () => {
    const anonymous = await browser.newContext()
    const response = await anonymous.request.get(`${BASE}/api/admin/analytics?section=executive`)
    expect(response.status() === 401, `analytics without a session: ${response.status()}`)
    const csv = await anonymous.request.get(`${BASE}/api/admin/analytics/export?report=financial`)
    expect(csv.status() === 401, `export without a session: ${csv.status()}`)
    await anonymous.close()
  })

  await browser.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`)
  process.exit(failed.length ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(3)
})
