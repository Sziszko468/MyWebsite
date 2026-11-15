// The project work (PROMPT 26), in a real Chrome against the BUILT website served by the real backend (one process, one origin, a throw-away database, the `file`
// e-mail provider whose messages are read back). Nothing is mocked, nothing leaves the machine, and no real address is used (they end in .test).
//
//   A  the owner's setup through the API: a customer, a project, milestones, tasks (some shared, some private), a dependency, a request for the customer
//   B  the administration: the workspace (summary, board with the keyboard, list and bulk move, filters, schedule, milestones, e-mails), one task (blocked, loop, request)
//   C  the customer: overview ("needs you"), the project (progress, tasks, schedule), one task, the answer form, the review, answering again, acceptance
//   D  what the customer must never see: private tasks, the owner's notes, other customers' work
//   E  the three languages on the customer's pages
//   F  axe and the layout checks on every screen above (needs AUDIT_AXE=<path to axe.min.js>)
//
//   AUDIT_PLAYWRIGHT=/path/to/playwright AUDIT_AXE=/path/to/axe.min.js node tools/e2e/work-journey.cjs --base=http://127.0.0.1:8821 --mail=<mail folder> \
//        --email=admin@example.test --password=... [--width=1440] [--only=ABCDEF] [--out=<dir>]
//
// Needs a FRESH server built with VITE_API_URL=/ (every run makes customers). See README.md in this folder and docs/project-management/TEST_RESULTS.md.
const fs = require('fs')
const path = require('path')
const { launch, newPage, axeRun } = require('../audit/lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8821').replace(/\/$/, '')
const MAIL = arg('mail', '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const OUT = arg('out', '')
const WIDTH = Number(arg('width', '1440'))
const HEIGHT = Number(arg('height', WIDTH >= 768 ? '1000' : '844'))
const ONLY = arg('only', 'ABCDEF')
// The same journey in the dark theme (`--scheme=dark`) and with reduced motion asked for (`--reduced=1`).
const SCHEME = arg('scheme', 'light')
const REDUCED = arg('reduced', '') === '1'
const wants = (letter) => ONLY.includes(letter)
const MOBILE = WIDTH < 768
const AXE = Boolean(process.env.AUDIT_AXE)
if (OUT) fs.mkdirSync(OUT, { recursive: true })

let passed = 0
let failed = 0
let current = null
async function step(name, work) {
  try {
    await work()
    passed += 1
    console.log(`  ok    ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL  ${name}\n        ${String(error.message || error).split('\n')[0]}`)
    if (current && OUT) {
      await current.screenshot({ path: path.join(OUT, `FAIL-${failed}-${WIDTH}.png`) }).catch(() => undefined)
      const text = await current.locator('body').innerText().catch(() => '')
      console.log(`        page: ${text.replace(/\s+/g, ' ').slice(0, 500)}`)
    }
  }
}
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}
const shot = async (page, name) => {
  if (OUT) await page.screenshot({ path: path.join(OUT, `${name}-${WIDTH}.png`), fullPage: true }).catch(() => undefined)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const stamp = Date.now().toString(36)

// ---- the file mailer's messages ------------------------------------------------------------------------------------------------
function decodeMessage(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const [head, ...rest] = raw.split('\n\n')
  const header = (name) => {
    const match = new RegExp(`^${name}:\\s*((?:.*)(?:\\n[ \\t].*)*)`, 'im').exec(head)
    return match ? match[1].replace(/\n[ \t]+/g, ' ').trim() : ''
  }
  const words = (value) => value.replace(/=\?UTF-8\?B\?([^?]+)\?=\s*/gi, (_all, b64) => Buffer.from(b64, 'base64').toString('utf8'))
  const parts = {}
  for (const match of rest.join('\n\n').matchAll(/Content-Type: (text\/(?:plain|html))[^\n]*\n(?:Content-Transfer-Encoding: base64\n)?\n([\s\S]*?)(?=\n--|$)/g)) {
    parts[match[1]] = Buffer.from(match[2].replace(/\s+/g, ''), 'base64').toString('utf8')
  }
  return { to: words(header('To')), subject: words(header('Subject')), text: parts['text/plain'] ?? '', html: parts['text/html'] ?? '' }
}
const mails = () => fs.readdirSync(MAIL).filter((name) => name.endsWith('.eml')).sort().map((name) => decodeMessage(path.join(MAIL, name)))
const mailsTo = (address) => mails().filter((mail) => mail.to.includes(address))
async function waitForMail(address, test = () => true, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const found = mailsTo(address).filter(test)
    if (found.length > 0) return found
    await sleep(300)
  }
  throw new Error(`no matching e-mail to ${address} within ${timeout} ms (have ${mailsTo(address).map((mail) => mail.subject).join(' | ')})`)
}
const LINK = /https?:\/\/[^\s/]+\/(hu|en|nl)\/client-portal\/verify#([A-Za-z0-9_-]{43})/

// ---- the owner's API ----------------------------------------------------------------------------------------------------------
async function owner() {
  const login = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  if (login.status !== 200) throw new Error(`administrator sign-in failed: ${login.status}`)
  const csrf = (await login.json()).data.csrfToken
  const headers = { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }
  const call = async (method, p, body, allow = false) => {
    const response = await fetch(`${BASE}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await response.text()
    if (response.status >= 300 && !allow) throw new Error(`${method} ${p}: ${response.status} ${text.slice(0, 200)}`)
    return { status: response.status, data: text ? (JSON.parse(text).data ?? JSON.parse(text)) : null }
  }
  return { call, data: async (method, p, body) => (await call(method, p, body)).data }
}

async function main() {
  if (!MAIL || !EMAIL || !PASSWORD) throw new Error('usage: --mail=<folder> --email=<admin> --password=<password> [--base=...] [--out=<dir>]')
  console.log(`viewport ${WIDTH}x${HEIGHT}, ${SCHEME}${REDUCED ? ', reduced motion' : ''}, parts ${ONLY}${AXE ? ', axe on' : ', axe OFF (AUDIT_AXE not set)'}`)
  const browser = await launch()
  const api = await owner()
  const SECRET = `SECRET-${stamp}`
  const anna = { email: `anna.${stamp}@work.test`, name: 'Anna Example', company: 'Example Bakery', project: 'Bakery website', language: 'en' }
  const bela = { email: `bela.${stamp}@work.test`, name: 'Béla Minta', company: 'Minta Garage', project: 'Garázs weboldal', language: 'hu' }
  const cili = { email: `cili.${stamp}@work.test`, name: 'Cili Voorbeeld', company: 'Voorbeeld BV', project: 'Boekingssite', language: 'nl' }
  const state = { tasks: {} }
  const violations = []
  const scan = async (page, label) => {
    await page.waitForLoadState('networkidle').catch(() => undefined)
    await sleep(250)
    const sideways = await page.evaluate(() => {
      const root = document.documentElement
      if (root.scrollWidth <= root.clientWidth + 1) return null
      // What pokes out of the page and is not inside a box that scrolls or clips it by itself.
      const clipped = (element) => {
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(parent).overflowX) && parent.getBoundingClientRect().right <= root.clientWidth + 1) return true
        }
        return false
      }
      const wide = [...document.body.querySelectorAll('*')].filter((element) => element.getBoundingClientRect().right > root.clientWidth + 1 && !element.closest('[aria-hidden=true]') && !clipped(element))
      return `scrollWidth ${root.scrollWidth} > ${root.clientWidth}: ` + (wide.slice(0, 4).map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 30)} right=${Math.round(element.getBoundingClientRect().right)}`).join(' | ') || 'unknown')
    })
    expect(sideways === null, `${label}: the page scrolls sideways: ${sideways}`)
    if (AXE) {
      await sleep(600)
      const found = await axeRun(page)
      if (found.length) violations.push(`${label}: ${found.map((v) => `${v.id}(${v.impact}) ${v.nodes[0]?.target}`).join('; ')}`)
    }
  }
  // What the browser complained about (a blocked script or style from the page's own policy is a console error): collected from every page and checked at the end. The answers the journey provokes on purpose (a refused move is a 409) are not complaints.
  const complaints = []
  const watch = (page, label) => {
    page.on('console', (message) => {
      if (message.type() === 'error') complaints.push(`${label}: ${message.text().slice(0, 200)}`)
    })
    page.on('pageerror', (error) => complaints.push(`${label}: ${String(error.message).slice(0, 200)}`))
  }
  const dayOffset = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

  // ---- A. setup ------------------------------------------------------------------------------------------------------------------
  const seed = async (who, seedTasks) => {
    const made = await api.data('POST', '/api/admin/clients', { email: who.email, name: who.name, company: who.company, language: who.language })
    const project = await api.data('POST', `/api/admin/clients/${made.id}/projects`, { name: who.project, category: 'website', expectedOn: dayOffset(60), notify: false })
    who.id = made.id
    who.projectId = project.id
    who.reference = project.reference
    if (!seedTasks) return
    const at = (suffix) => `/api/admin/client-projects/${project.id}/${suffix}`
    await api.data('POST', '/api/admin/task-categories/suggested')
    const categories = await api.data('GET', '/api/admin/task-categories')
    const design = categories.find((entry) => entry.code === 'design')
    const m1 = await api.data('POST', at('milestones'), { title: 'Design approved', description: 'The look is agreed.', dueOn: dayOffset(14) })
    await api.data('POST', at('milestones'), { title: 'First version online', dueOn: dayOffset(45) })
    await api.data('POST', at('milestones'), { title: 'Internal checkpoint', customerVisible: false, dueOn: dayOffset(10) })
    const task = async (key, body) => {
      const made = await api.data('POST', at('tasks'), body)
      state.tasks[key] = made
      return made
    }
    await task('assets', { title: 'Send us your logo and photos', customerDescription: 'We need them to start the design.', description: `Internal: ask for SVG. ${SECRET}`, customerVisible: true, status: 'waiting_customer', priority: 'high', dueOn: dayOffset(2), startOn: dayOffset(-1), categoryId: design.id, milestoneId: m1.id })
    await task('design', { title: 'Design the home page', customerDescription: 'The first layout of the home page.', description: 'Use the grid.', customerVisible: true, status: 'planned', startOn: dayOffset(3), dueOn: dayOffset(12), categoryId: design.id, milestoneId: m1.id })
    await task('build', { title: 'Build the home page', customerDescription: 'We turn the design into a working page.', customerVisible: true, status: 'backlog', startOn: dayOffset(13), dueOn: dayOffset(40) })
    await task('hosting', { title: `Internal hosting checks ${SECRET}`, description: `Private: ${SECRET}`, status: 'backlog', priority: 'urgent', dueOn: dayOffset(5) })
    await task('later', { title: 'Plan the launch day', customerDescription: 'Nothing is dated yet.', customerVisible: true })
    await api.data('POST', at(`tasks/${state.tasks.build.id}/dependencies`), { dependsOnId: state.tasks.design.id })
    await api.data('POST', at(`tasks/${state.tasks.assets.id}/action`), { actionType: 'provide_content', instruction: 'Please send the logo as a link, and write the name of the typeface you like.' })
    await api.data('POST', at(`tasks/${state.tasks.hosting.id}/notes`), { body: `PRIVATE-NOTE-${SECRET}` })
  }

  if (wants('A')) {
    console.log('A  the owner sets the work up')
    await step('a customer, a project, three milestones (one hidden), five tasks (one private), a dependency, a request and a private note', async () => {
      await seed(anna, true)
      await seed(bela, false)
      await seed(cili, false)
      const space = await api.data('GET', `/api/admin/client-projects/${anna.projectId}/work`)
      expect(space.tasks.length === 5, `${space.tasks.length} tasks`)
      expect(space.counts.needsCustomer === 1, 'the request is not counted')
      expect(space.progress.percent === 0 && space.customerProgress.tasks.total === 4, `progress ${JSON.stringify(space.customerProgress)}`)
    })
    await step('the customer is e-mailed once about the request, in English, with no private word', async () => {
      const [mail] = await waitForMail(anna.email, (message) => /action is waiting for you/.test(message.subject))
      expect(mail.text.includes('Send us your logo and photos') && mail.text.includes('Please send the logo as a link'), 'the e-mail does not say what is asked')
      expect(!(mail.text + mail.html).includes(SECRET), 'a private word is in the e-mail')
      expect(mailsTo(anna.email).filter((message) => /action is waiting for you/.test(message.subject)).length === 1, 'more than one')
    })
  }

  // ---- B. the administration -------------------------------------------------------------------------------------------------
  const admin = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB', scheme: SCHEME, reduced: REDUCED })
  const ap = admin.page
  watch(ap, 'admin')
  const workUrl = () => `${BASE}/admin/client-projects/${anna.projectId}/work`
  if (wants('B') || wants('F')) {
    console.log('B  the administration')
    await step('the workspace: where the project stands, and a board with one column per status', async () => {
      current = ap
      await ap.goto(workUrl(), { waitUntil: 'networkidle' })
      await ap.getByLabel('E-mail address').fill(EMAIL)
      await ap.getByLabel('Password').fill(PASSWORD)
      await ap.getByRole('button', { name: 'Sign in' }).click()
      await ap.getByRole('heading', { name: /^Work: Bakery website/, level: 1 }).waitFor({ timeout: 15000 })
      const text = await ap.locator('main').innerText()
      for (const needle of ['Progress (everything recorded)', 'What the customer sees', 'Backlog', 'Planned', 'Waiting for the customer', 'Send us your logo and photos', 'Design the home page']) expect(text.includes(needle), `missing "${needle}"`)
      expect(text.includes(SECRET) === true, 'the owner should see the private task')
      await shot(ap, 'b-board')
      await scan(ap, 'admin board')
    })
    await step('a card moves with the keyboard: the select on the card, named after the task, and the server answers', async () => {
      const select = ap.getByRole('combobox', { name: /Move “Design the home page” to/ })
      await select.focus()
      await select.selectOption({ label: 'In progress' })
      await ap.getByText('Moved.').first().waitFor({ timeout: 10000 })
      // The toast comes with the answer; the board shows the move once it has reloaded.
      await ap.waitForFunction(() => (document.querySelector('#column-in_progress')?.closest('li')?.textContent ?? '').includes('Design the home page'), null, { timeout: 8000 }).catch(() => undefined)
      const where = await ap.evaluate(() => document.querySelector('#column-in_progress')?.closest('li')?.textContent ?? '')
      expect(where.includes('Design the home page'), 'the card is not in the In progress column')
    })
    await step('a card that waits for another cannot be started: the answer names what it waits for and nothing moves', async () => {
      const select = ap.getByRole('combobox', { name: /Move “Build the home page” to/ })
      await select.selectOption({ label: 'In progress' })
      await ap.getByText(/waits for other tasks that are not finished/).first().waitFor({ timeout: 10000 })
      expect((await ap.evaluate(() => document.querySelector('#column-backlog')?.closest('li')?.textContent ?? '')).includes('Build the home page'), 'the card moved')
    })
    await step('the up and down buttons reorder a column, with names that say which task', async () => {
      const down = ap.getByRole('button', { name: /Move “Plan the launch day” up/ })
      await down.waitFor({ timeout: 5000 })
      await down.click()
      await ap.getByText('Order saved.').first().waitFor({ timeout: 10000 })
    })
    await step('the list: a selection, one status for it, and an answer that says which task could not move and why', async () => {
      await ap.getByRole('tab', { name: 'List' }).click()
      await ap.getByRole('table').waitFor({ timeout: 10000 })
      await ap.getByRole('checkbox', { name: /Select “Build the home page”/ }).check()
      await ap.getByRole('checkbox', { name: /Select “Plan the launch day”/ }).check()
      await ap.getByLabel('Move the selected tasks to').selectOption({ label: 'In progress' })
      await ap.getByRole('button', { name: 'Move them' }).click()
      await ap.getByText(/1 moved, 1 could not move/).waitFor({ timeout: 10000 })
      expect((await ap.getByRole('status').filter({ hasText: 'Build the home page' }).count()) > 0, 'the report does not name the task')
      await shot(ap, 'b-list')
      await scan(ap, 'admin list')
    })
    await step('filters and search: by status, by text; the count says what is shown; clearing brings everything back', async () => {
      await ap.getByLabel('Status', { exact: true }).selectOption({ label: 'In progress' })
      await ap.getByText(/\d+ tasks shown/).first().waitFor()
      await ap.waitForFunction(() => /2 tasks shown/.test(document.body.innerText), null, { timeout: 8000 })
      await ap.getByRole('button', { name: 'Clear the filters' }).click()
      await ap.waitForFunction(() => /5 tasks shown/.test(document.body.innerText), null, { timeout: 8000 })
      await ap.getByRole('searchbox').fill('hosting')
      await ap.waitForFunction(() => /1 tasks shown/.test(document.body.innerText), null, { timeout: 8000 })
      await ap.getByRole('button', { name: 'Clear the filters' }).click()
      await ap.waitForFunction(() => /5 tasks shown/.test(document.body.innerText), null, { timeout: 8000 })
    })
    await step('the schedule: rows with the dates written out, bars beside them, today marked, and what has no date listed apart', async () => {
      await ap.getByRole('tab', { name: 'Schedule' }).click()
      await ap.getByRole('heading', { name: 'Without a date' }).waitFor({ timeout: 10000 })
      const text = await ap.getByRole('tabpanel').innerText()
      for (const needle of ['Design the home page', 'First version online', 'Without a date', 'Plan the launch day']) expect(text.includes(needle), `missing "${needle}" in: ${text.replace(/\s+/g, ' ').slice(0, 600)}`)
      await shot(ap, 'b-schedule')
      await scan(ap, 'admin schedule')
    })
    await step('the milestones: a description, a status, whether the customer sees it; a milestone is added', async () => {
      await ap.getByRole('tab', { name: 'Milestones' }).click()
      await ap.getByRole('heading', { name: 'Add a milestone' }).waitFor({ timeout: 10000 })
      const text = await ap.getByRole('tabpanel').innerText()
      expect(text.includes('Hidden from the customer'), 'the hidden milestone is not marked')
      expect((await ap.getByLabel('Title').evaluateAll((fields) => fields.map((field) => field.value))).includes('Internal checkpoint'), 'the hidden milestone is not listed')
      await ap.getByLabel('Title').last().fill('Launch')
      await ap.getByRole('button', { name: 'Add a milestone' }).click()
      await ap.getByText('Saved.').first().waitFor({ timeout: 10000 })
      await shot(ap, 'b-milestones')
      await scan(ap, 'admin milestones')
    })
    await step('the e-mails tab says what is queued and what was handed to the provider, never "delivered" by itself', async () => {
      await ap.getByRole('tab', { name: 'E-mails' }).click()
      await ap.getByText('A request for the customer').first().waitFor({ timeout: 10000 })
      const text = await ap.getByRole('tabpanel').innerText()
      expect(!/\bDelivered\b/.test(text.replace('Delivery confirmed by the provider', '')), 'says delivered without the provider')
      await scan(ap, 'admin e-mails')
    })
    await step('one task: it waits for another (named), a loop is refused in words, a customer request is shown with its history', async () => {
      await ap.goto(`${BASE}/admin/client-projects/${anna.projectId}/tasks/${state.tasks.build.id}`, { waitUntil: 'networkidle' })
      await ap.getByRole('heading', { name: 'Build the home page', level: 1 }).waitFor({ timeout: 10000 })
      let text = await ap.locator('main').innerText()
      expect(text.includes('This task waits for these tasks') && text.includes('Design the home page'), 'the dependency is not shown')
      // A loop: the design task depending on the build task.
      await ap.goto(`${BASE}/admin/client-projects/${anna.projectId}/tasks/${state.tasks.design.id}`, { waitUntil: 'networkidle' })
      await ap.getByRole('heading', { name: 'Design the home page', level: 1 }).waitFor({ timeout: 10000 })
      await ap.getByLabel('Add a dependency').selectOption({ label: `Build the home page (${state.tasks.build.reference})` })
      await ap.getByRole('button', { name: 'Add', exact: true }).click()
      await ap.getByText(/That would make a loop/).first().waitFor({ timeout: 10000 })
      await shot(ap, 'b-task')
      await scan(ap, 'admin task')
      await ap.goto(`${BASE}/admin/client-projects/${anna.projectId}/tasks/${state.tasks.assets.id}`, { waitUntil: 'networkidle' })
      await ap.getByRole('heading', { name: 'Send us your logo and photos', level: 1 }).waitFor({ timeout: 10000 })
      text = await ap.locator('main').innerText()
      expect(text.includes('Please send the logo as a link') && text.includes('Waiting for the customer'), 'the request is not shown')
      await shot(ap, 'b-task-action')
      await scan(ap, 'admin task with a request')
    })
  }

  // ---- C. the customer ---------------------------------------------------------------------------------------------------------
  let cp
  let customer
  const signIn = async (who, language) => {
    const context = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: language === 'hu' ? 'hu-HU' : language === 'nl' ? 'nl-NL' : 'en-GB', scheme: SCHEME, reduced: REDUCED })
    watch(context.page, `customer ${language}`)
    // A link works once: a customer who signed in before asks for a new one, and the newest message is the one to open.
    const have = mailsTo(who.email).filter((message) => LINK.test(message.text)).length
    if (who.signedIn) {
      const asked = await fetch(`${BASE}/api/portal/auth/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: who.email, language }) })
      expect(asked.status === 202, `a new link: ${asked.status}`)
    }
    const fresh = await waitForMail(who.email, (message) => LINK.test(message.text))
    const end = Date.now() + 20000
    while (who.signedIn && mailsTo(who.email).filter((message) => LINK.test(message.text)).length <= have && Date.now() < end) await sleep(300)
    const mail = mailsTo(who.email).filter((message) => LINK.test(message.text)).at(-1) ?? fresh.at(-1)
    who.signedIn = true
    await context.page.goto(LINK.exec(mail.text)[0], { waitUntil: 'networkidle' })
    await context.page.getByRole('button', { name: /^(Sign in|Belépés|Inloggen)$/ }).click()
    await context.page.waitForURL((url) => !/verify/.test(url.pathname), { timeout: 15000 }).catch(() => undefined)
    await context.page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 15000 })
    return context
  }
  if (wants('C') || wants('D') || wants('E') || wants('F')) {
    customer = await signIn(anna, 'en')
    cp = customer.page
  }
  const portal = (suffix = '', language = 'en') => `${BASE}/${language}/client-portal/${suffix}`
  if (wants('C')) {
    console.log('C  the customer')
    await step('the overview says what needs the customer, most urgent first, and the dates that are coming', async () => {
      current = cp
      await cp.goto(portal(), { waitUntil: 'networkidle' })
      await cp.getByRole('heading', { name: 'We are waiting for your answer on', level: 2 }).waitFor({ timeout: 10000 })
      const text = await cp.locator('main').innerText()
      expect(text.includes('Send us your logo and photos'), 'the request is not listed')
      expect(!text.includes(SECRET) && !text.includes('hosting checks'), 'a private task is shown')
      await shot(cp, 'c-overview')
      await scan(cp, 'portal overview')
    })
    await step('the project: a real percentage and its count, the tasks in groups, the schedule — and nothing private', async () => {
      await cp.goto(portal(`projects/${anna.reference}`), { waitUntil: 'networkidle' })
      await cp.getByRole('heading', { name: 'Bakery website', level: 1 }).waitFor({ timeout: 10000 })
      await cp.getByRole('heading', { name: 'Project progress', level: 3 }).waitFor({ timeout: 10000 })
      const text = await cp.locator('main').innerText()
      for (const needle of ['0% done', '0 of 4 tasks done', 'Needs you', 'In progress', 'Planned', 'Schedule', 'Without a date', 'Plan the launch day', 'Design approved', 'The look is agreed.']) expect(text.includes(needle), `missing "${needle}"`)
      for (const secret of [SECRET, 'Internal checkpoint', 'Internal hosting', 'Use the grid']) expect(!text.includes(secret), `private words on the page: ${secret}`)
      await shot(cp, 'c-project')
      await scan(cp, 'portal project')
    })
    await step('the task: what we ask, the form, and a form that says what is wrong (empty, too short) without sending anything', async () => {
      await cp.getByRole('link', { name: 'Send us your logo and photos' }).first().click()
      await cp.getByRole('heading', { name: 'Send us your logo and photos', level: 1 }).waitFor({ timeout: 10000 })
      const text = await cp.locator('main').innerText()
      expect(text.includes('Please send the logo as a link') && text.includes('Waiting for your answer'), 'the request is not shown')
      expect(/cannot attach a file/i.test(text), 'does not say that files cannot be attached')
      await cp.getByRole('button', { name: 'Send the answer' }).click()
      await cp.getByRole('alert').filter({ hasText: 'Write something in your answer.' }).waitFor({ timeout: 5000 })
      await cp.getByLabel('Write your answer').fill('x')
      await cp.getByRole('button', { name: 'Send the answer' }).click()
      await cp.getByText('That is too short. Write a little more.').waitFor({ timeout: 5000 })
      await shot(cp, 'c-task')
      await scan(cp, 'portal task')
    })
    await step('sending the answer: it is received once, the page says so, focus moves to it, and the form is gone', async () => {
      await cp.getByLabel('Write your answer').fill('The logo is at https://example.test/logo.svg and we like a rounded typeface.')
      await cp.getByRole('button', { name: 'Send the answer' }).click()
      const sent = cp.getByRole('status').filter({ hasText: 'We have received your answer' })
      await sent.waitFor({ timeout: 10000 })
      expect(await sent.evaluate((element) => element === document.activeElement), 'focus did not move to the confirmation')
      await cp.getByRole('heading', { name: 'Your answers so far', level: 2 }).waitFor({ timeout: 10000 })
      expect((await cp.getByRole('button', { name: 'Send the answer' }).count()) === 0, 'the form is still there')
      const [mail] = await waitForMail('owner@example.test', (message) => /A customer responded: Bakery website/.test(message.subject))
      expect(mail.text.includes('Send us your logo and photos') && !mail.text.includes('rounded typeface'), 'the owner’s e-mail is wrong')
      await shot(cp, 'c-answered')
      await scan(cp, 'portal answered')
    })
    await step('the owner asks for changes with words for the customer; the customer sees them (not the private note) and answers again', async () => {
      const space = await api.data('GET', `/api/admin/client-projects/${anna.projectId}/tasks/${state.tasks.assets.id}`)
      await api.data('POST', `/api/admin/client-projects/${anna.projectId}/actions/${space.action.id}/changes`, { customerNote: 'Please also send the colours as hex codes.', internalNote: `PRIVATE-REVIEW-${SECRET}` })
      await cp.reload({ waitUntil: 'networkidle' })
      await cp.getByRole('heading', { name: 'What we ask you to change', level: 3 }).waitFor({ timeout: 10000 })
      const text = await cp.locator('main').innerText()
      expect(text.includes('Please also send the colours as hex codes.') && !text.includes('PRIVATE-REVIEW'), 'the request for changes is wrong')
      await cp.getByLabel('Write your answer').fill('Brand colours: #ff1c24 and #0a0a0b.')
      await cp.getByRole('button', { name: 'Send a new answer' }).click()
      await cp.getByText('Answer 2').waitFor({ timeout: 10000 })
      await waitForMail(anna.email, (message) => /We ask for changes to your response/.test(message.subject))
    })
    await step('the owner accepts in the administration (and completes the task); the customer sees it done and the progress counts it', async () => {
      await ap.goto(`${BASE}/admin/client-projects/${anna.projectId}/tasks/${state.tasks.assets.id}`, { waitUntil: 'networkidle' })
      await ap.getByRole('heading', { name: 'Send us your logo and photos', level: 1 }).waitFor({ timeout: 10000 })
      await ap.getByText('Brand colours: #ff1c24 and #0a0a0b.').waitFor({ timeout: 10000 })
      await ap.getByLabel('Also complete the task').check()
      await ap.getByRole('button', { name: 'Accept the answer', exact: true }).click()
      await ap.getByText('Done.').first().waitFor({ timeout: 10000 })
      await cp.goto(portal(`projects/${anna.reference}`), { waitUntil: 'networkidle' })
      await cp.getByRole('heading', { name: 'Project progress', level: 3 }).waitFor({ timeout: 10000 })
      const text = await cp.locator('main').innerText()
      expect(/25% done/.test(text) && text.includes('1 of 4 tasks done'), `progress after acceptance: ${text.slice(0, 300)}`)
      await waitForMail(anna.email, (message) => /Your response was accepted/.test(message.subject))
      await shot(cp, 'c-accepted')
    })
  }

  // ---- D. what the customer must never see ---------------------------------------------------------------------------------------
  if (wants('D')) {
    console.log('D  what a customer must never see')
    await step('no page or request of the customer carries a private task, note or review note', async () => {
      current = cp
      const bodies = []
      cp.on('response', async (response) => {
        if (response.url().includes('/api/portal/')) bodies.push(await response.text().catch(() => ''))
      })
      for (const suffix of ['', 'projects', `projects/${anna.reference}`, `projects/${anna.reference}/tasks/${state.tasks.assets.reference}`]) {
        await cp.goto(portal(suffix), { waitUntil: 'networkidle' })
        const text = await cp.locator('body').innerText()
        for (const secret of [SECRET, 'PRIVATE-REVIEW', 'PRIVATE-NOTE', 'Internal checkpoint', 'Internal hosting']) expect(!text.includes(secret), `"${secret}" on /${suffix}`)
      }
      expect(bodies.length > 0 && bodies.every((body) => !body.includes(SECRET) && !body.includes('PRIVATE-')), 'a private word is in an API answer')
    })
    await step('another customer opening the first customer’s task gets "not found", with none of its words', async () => {
      const other = await signIn(bela, 'hu')
      current = other.page
      await other.page.goto(portal(`projects/${anna.reference}/tasks/${state.tasks.assets.reference}`, 'hu'), { waitUntil: 'networkidle' })
      await other.page.getByRole('heading', { level: 1 }).first().waitFor({ timeout: 10000 })
      const text = await other.page.locator('body').innerText()
      expect(/Ezt nem találjuk nálad/.test(text), `the answer is not "not found": ${text.slice(0, 200)}`)
      expect(!text.includes('Send us your logo') && !text.includes('logo'), 'words of the other customer’s task are shown')
      await other.context.close()
    })
  }

  // ---- E. languages -----------------------------------------------------------------------------------------------------------------
  if (wants('E')) {
    console.log('E  the three languages')
    for (const [who, language, needles] of [
      [bela, 'hu', ['A projekt haladása', 'Még nincs mit mérni', 'Feladatok', 'Ütemezés', 'Logó elküldése', '0% kész']],
      [cili, 'nl', ['Voortgang van het project', 'Er valt nog niets te meten', 'Taken', 'Planning', 'Logo sturen', '0% klaar']],
    ]) {
      await step(`the customer’s project page in ${language}: an honest empty progress, then tasks, schedule and the request; the e-mail is in ${language}`, async () => {
        const context = await signIn(who, language)
        current = context.page
        await context.page.goto(portal(`projects/${who.reference}`, language), { waitUntil: 'networkidle' })
        await context.page.getByRole('heading', { name: who.project, level: 1 }).waitFor({ timeout: 10000 })
        await context.page.getByText(needles[1]).first().waitFor({ timeout: 10000 })
        expect(!/\d+\s?%/.test(await context.page.locator('main').innerText()), 'a percentage is shown for a project with nothing recorded')
        const task = await api.data('POST', `/api/admin/client-projects/${who.projectId}/tasks`, { title: who.language === 'hu' ? 'Logó elküldése' : 'Logo sturen', customerVisible: true, customerDescription: 'Elég rövid.', dueOn: dayOffset(3) })
        const given = await api.call('POST', `/api/admin/client-projects/${who.projectId}/tasks/${task.id}/action`, { actionType: 'other', instruction: who.language === 'hu' ? 'Kérjük, küldd el a logót.' : 'Stuur ons het logo.' })
        expect(given.status === 201, `action ${given.status}`)
        await context.page.reload({ waitUntil: 'networkidle' })
        await context.page.getByRole('heading', { name: needles[0], level: 3 }).waitFor({ timeout: 10000 })
        const text = await context.page.locator('main').innerText()
        for (const needle of needles.slice(2)) expect(text.includes(needle), `missing "${needle}" in ${language}: ${text.replace(/\s+/g, ' ').slice(0, 400)}`)
        await context.page.goto(portal('', language), { waitUntil: 'networkidle' })
        await context.page.getByRole('heading', { level: 2 }).first().waitFor({ timeout: 10000 })
        await shot(context.page, `e-${language}`)
        await scan(context.page, `portal ${language}`)
        const subject = language === 'hu' ? /Teendőd van a projektedben/ : /Er wacht een actie op je/
        await waitForMail(who.email, (message) => subject.test(message.subject))
        await context.context.close()
      })
    }
  }

  if (wants('F')) {
    await step('no page complained: no console error, no blocked script or style, no failed script of the page', async () => {
      const real = complaints.filter((line) => !/Failed to load resource: the server responded with a status of 40[1349]/.test(line))
      expect(real.length === 0, `${real.length} complaint(s): ${[...new Set(real)].slice(0, 5).join(' | ')}`)
    })
  }

  // ---- F. axe --------------------------------------------------------------------------------------------------------------------------
  if (wants('F')) {
    console.log('F  accessibility (axe) on every screen scanned above')
    await step(AXE ? 'axe finds nothing on any screen' : 'axe was not run (AUDIT_AXE is not set)', async () => {
      expect(AXE, 'set AUDIT_AXE to the path of axe.min.js')
      for (const line of violations) console.log(`        axe: ${line}`)
      expect(violations.length === 0, `${violations.length} screen(s) with findings:\n          ${violations.join('\n          ')}`)
    })
  }

  await browser.close()
  console.log(`\n${passed} passed, ${failed} failed (${WIDTH}x${HEIGHT})`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
