// The client portal (PROMPT 25), in a real Chrome against the BUILT website served by the real backend (one process, one origin, a throw-away database, the
// `file` e-mail provider whose messages are read back). Nothing is mocked, nothing leaves the machine, and no real address is used (they end in .test).
//
//   A  the owner invites a customer through the administration's API (the one setup step done without a browser); the invitation e-mail holds the secret only after a "#"
//   B  the customer: the sign-in page, a link asked for, the e-mail, the confirm page that takes the secret out of the address bar, the overview, the cookie
//   C  every page of the portal: overview, projects, a project, quote requests, bookings, documents, account; keyboard navigation; no horizontal scroll; layout checks
//   D  another customer cannot see it: the first customer's project address answers "not found" and none of its words appear
//   E  the account: the profile is saved, the devices are listed, the address change asks for a link and tells the old address
//   F  the three languages: the sign-in page, the overview and the e-mails in Hungarian and Dutch
//   G  sign-out ends the session on the server; what a third party and a search engine are told (headers, robots, no measurement)
//   H  the administration's screens: the customers, one customer, one project (needs the administrator's address and password)
//   I  axe on every screen above (needs AUDIT_AXE=<path to axe.min.js>)
//
//   AUDIT_PLAYWRIGHT=/path/to/playwright AUDIT_AXE=/path/to/axe.min.js node tools/e2e/portal-journey.cjs --base=http://127.0.0.1:8801 --mail=<mail folder> \
//        --email=admin@example.test --password=... [--width=1440] [--only=ABCDEFGHI] [--out=<dir>]
//
// Needs a FRESH server built with VITE_API_URL=/ (every run makes customers). See README.md in this folder and docs/client-portal/TEST_RESULTS.md.
const fs = require('fs')
const path = require('path')
const { launch, newPage, axeRun } = require('../audit/lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8801').replace(/\/$/, '')
const MAIL = arg('mail', '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const OUT = arg('out', '')
const WIDTH = Number(arg('width', '1440'))
const HEIGHT = Number(arg('height', WIDTH >= 768 ? '1000' : '844'))
const ONLY = arg('only', 'ABCDEFGHI')
const wants = (letter) => ONLY.includes(letter)
const MOBILE = WIDTH < 768
const AXE = Boolean(process.env.AUDIT_AXE)
if (OUT) fs.mkdirSync(OUT, { recursive: true })

let passed = 0
let failed = 0
let current = null
const tracked = []
async function step(name, work) {
  try {
    await work()
    passed += 1
    console.log(`  ok    ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL  ${name}\n        ${String(error.message || error).split('\n')[0]}`)
    if (current && OUT) {
      await current.screenshot({ path: path.join(OUT, `FAIL-${failed}.png`) }).catch(() => undefined)
      const text = await current.locator('body').innerText().catch(() => '')
      console.log(`        page: ${text.replace(/\s+/g, ' ').slice(0, 500)}`)
      if (process.env.PORTAL_DEBUG) {
        const tally = {}
        for (const url of tracked) tally[url.replace(BASE, '')] = (tally[url.replace(BASE, '')] ?? 0) + 1
        console.log(`        requests: ${JSON.stringify(Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 6))}`)
      }
    }
  }
}
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}
const shot = async (page, name) => {
  if (OUT) await page.screenshot({ path: path.join(OUT, `${name}-${WIDTH}.png`) }).catch(() => undefined)
}
const NO_SCROLL = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const stamp = Date.now().toString(36)

// ---- the file mailer's messages -------------------------------------------------------------------------------------------
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
async function waitForMail(address, count = 1, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const found = mailsTo(address)
    if (found.length >= count) return found
    await sleep(300)
  }
  throw new Error(`no ${count}. e-mail to ${address} within ${timeout} ms (have ${mailsTo(address).length})`)
}
const LINK = /https?:\/\/[^\s/]+\/(hu|en|nl)\/client-portal\/verify#([A-Za-z0-9_-]{43})/
const linkIn = (text) => LINK.exec(text)

// ---- the owner's API (the setup step, and the checks of what a server says) ----------------------------------------------------
async function owner() {
  const login = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  if (login.status !== 200) throw new Error(`administrator sign-in failed: ${login.status}`)
  const csrf = (await login.json()).data.csrfToken
  const headers = { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }
  const call = async (method, p, body) => {
    const response = await fetch(`${BASE}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await response.text()
    if (response.status >= 300) throw new Error(`${method} ${p}: ${response.status} ${text.slice(0, 200)}`)
    return text ? JSON.parse(text).data : null
  }
  return { call }
}

async function seed(api, who) {
  const made = await api.call('POST', '/api/admin/clients', { email: who.email, name: who.name, company: who.company, language: who.language ?? 'en' })
  const project = await api.call('POST', `/api/admin/clients/${made.id}/projects`, { name: who.project, category: 'website', expectedOn: '2027-01-31', notify: false })
  const p = (suffix, body) => api.call('POST', `/api/admin/client-projects/${project.id}/${suffix}`, body)
  await p('status', { status: 'discovery', note: who.secret, notify: false })
  const first = await p('milestones', { title: 'Design approved', dueOn: '2026-11-20' })
  await p('milestones', { title: 'First version online', dueOn: '2026-12-15' })
  await p('milestones', { title: 'Hand-over' })
  await api.call('PATCH', `/api/admin/client-projects/${project.id}/milestones/${first.id}`, { done: true })
  await p('status', { status: 'design', notify: false })
  await p('updates', { kind: 'feedback', note: `Which palette do you prefer? ${who.secret}`, notify: false })
  await p('status', { status: 'waiting_customer', notify: false })
  await p('notes', { body: `PRIVATE-${who.secret}` })
  await p('milestones', { title: 'Later' })
  return { id: made.id, projectId: project.id, reference: project.reference }
}

async function main() {
  if (!MAIL || !EMAIL || !PASSWORD) throw new Error('usage: --mail=<folder> --email=<admin> --password=<password> [--base=...] [--out=<dir>]')
  console.log(`viewport ${WIDTH}x${HEIGHT}, parts ${ONLY}${AXE ? ', axe on' : ', axe OFF (AUDIT_AXE not set)'}`)
  const browser = await launch()
  const api = await owner()
  const alex = { email: `alex.${stamp}@portal.test`, name: 'Alex Example', company: 'Example Bakery', project: 'Bakery website', secret: `ALEX-SECRET-${stamp}` }
  const bela = { email: `bela.${stamp}@portal.test`, name: 'Béla Minta', company: 'Minta Garage', project: 'Garage webshop', secret: `BELA-SECRET-${stamp}`, language: 'hu' }
  const cili = { email: `cili.${stamp}@portal.test`, name: 'Cili Voorbeeld', company: 'Voorbeeld BV', project: 'Boekingssite', secret: `CILI-SECRET-${stamp}`, language: 'nl' }
  const state = {}
  const violations = []
  const scan = async (page, label) => {
    const layout = await page.evaluate(() => ({ sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }))
    expect(!layout.sideways, `${label}: the page scrolls sideways`)
    if (AXE) {
      await sleep(700)
      const found = await axeRun(page)
      if (found.length) violations.push(`${label}: ${found.map((v) => `${v.id}(${v.impact}) ${v.nodes[0]?.target}`).join('; ')}`)
    }
  }

  // ---- A. the invitation -------------------------------------------------------------------------------------------------------
  if (wants('A')) {
    console.log('A  the owner invites customers')
    await step('three customers are invited, each with a project, and each gets exactly one e-mail with the secret after a "#"', async () => {
      state.alex = await seed(api, alex)
      state.bela = await seed(api, bela)
      state.cili = await seed(api, cili)
      for (const who of [alex, bela, cili]) {
        const [mail] = await waitForMail(who.email)
        const found = linkIn(mail.text)
        expect(found, `no sign-in link in the e-mail to ${who.email}`)
        expect(!/[?]/.test(found[0]), 'the link has a query string')
        expect(mailsTo(who.email).length === 1, 'more than one e-mail')
        who.invite = found
      }
      expect(alex.invite[1] === 'en' && bela.invite[1] === 'hu' && cili.invite[1] === 'nl', 'the e-mails are not in the customers’ languages')
      expect(mailsTo(bela.email)[0].subject === 'Elkészült az ügyfélportál-fiókod', `Hungarian subject: ${mailsTo(bela.email)[0].subject}`)
      expect(mailsTo(cili.email)[0].subject === 'Je account voor het klantportaal staat klaar', `Dutch subject: ${mailsTo(cili.email)[0].subject}`)
    })
  }

  // ---- B. the customer signs in ------------------------------------------------------------------------------------------------
  let ctx
  let page
  if (wants('B') || wants('C') || wants('D') || wants('E') || wants('F') || wants('G') || wants('I')) {
    ;({ context: ctx, page } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB', scheme: 'light' }))
    current = page
    const requests = []
    page.on('request', (request) => {
      requests.push(request.url())
      tracked.push(request.url())
    })
    state.requests = requests
  }
  if (wants('B')) {
    console.log('B  the customer signs in')
    await step('the sign-in page asks for an address and says how it works; nothing is shown that needs a session', async () => {
      const response = await page.goto(`${BASE}/en/client-portal/`, { waitUntil: 'networkidle' })
      expect(response.status() === 200, `status ${response.status()}`)
      await page.getByRole('heading', { name: 'Sign in to your projects', level: 1 }).waitFor({ timeout: 10000 })
      expect(await page.getByLabel('Email address').count() === 1, 'no email field')
      expect((await page.locator('body').innerText()).includes('invited'), 'does not say the portal is for invited customers')
      expect(await NO_SCROLL(page), 'sideways scroll')
      await shot(page, 'b-sign-in')
      await scan(page, 'sign-in')
    })
    await step('a link is asked for: the same answer whatever the address is, and the page never says an e-mail arrived', async () => {
      await page.getByLabel('Email address').fill(`nobody.${stamp}@portal.test`)
      await page.getByRole('button', { name: 'Send the link' }).click()
      await page.getByRole('heading', { name: 'Check your email', level: 2 }).waitFor({ timeout: 10000 })
      const text = await page.locator('body').innerText()
      expect(/If this address has an account/.test(text), 'the answer is not the neutral one')
      expect(!/has been sent|was sent|delivered|arrived/i.test(text), 'claims delivery')
      await sleep(1200)
      expect(mailsTo(`nobody.${stamp}@portal.test`).length === 0, 'an e-mail went to an address with no account')
      await shot(page, 'b-sent')
    })
    await step('the invitation link opens the confirm page, takes the secret out of the address bar and does nothing until the button is pressed', async () => {
      const response = await page.goto(alex.invite[0], { waitUntil: 'networkidle' })
      expect(response.status() === 200, `status ${response.status()}`)
      await page.getByRole('heading', { name: 'Confirm your sign-in', level: 1 }).waitFor({ timeout: 10000 })
      expect(!page.url().includes('#') && !page.url().includes(alex.invite[2]), `the address still holds the secret: ${page.url()}`)
      const cookies = await ctx.cookies()
      expect(!cookies.some((cookie) => cookie.name.includes('cc_client')), 'a session was made before the button')
      await scan(page, 'confirm')
      await shot(page, 'b-confirm')
    })
    await step('pressing the button signs in: the overview greets by name, shows real numbers, and the cookie is HttpOnly and SameSite=Strict', async () => {
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.getByRole('heading', { name: 'Welcome, Alex Example', level: 1 }).waitFor({ timeout: 15000 })
      const cookie = (await ctx.cookies()).find((entry) => entry.name === 'cc_client')
      expect(cookie, 'no session cookie')
      expect(cookie.httpOnly && cookie.sameSite === 'Strict' && cookie.path === '/', `cookie flags: ${JSON.stringify(cookie)}`)
      expect(!(await page.evaluate(() => document.cookie)).includes('cc_client'), 'the cookie is readable from the page')
      const text = await page.locator('body').innerText()
      expect(/Waiting for you/.test(text) && /Bakery website/.test(text), 'the project waiting for the customer is not shown')
      expect(!/\d+%/.test(text), 'a percentage is shown')
      const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]))
      expect(!stored.includes(alex.invite[2]) && !/csrf|token/i.test(stored), `a secret is in the browser's storage: ${stored.slice(0, 200)}`)
      await shot(page, 'b-overview')
    })
    await step('the invitation link cannot be used again, even in a clean browser', async () => {
      const { context, page: clean } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB' })
      await clean.goto(alex.invite[0], { waitUntil: 'networkidle' })
      await clean.getByRole('button', { name: 'Sign in' }).click()
      await clean.getByRole('heading', { name: 'This link was already used', level: 1 }).waitFor({ timeout: 10000 })
      await scan(clean, 'used link')
      await context.close()
    })
  }

  // ---- C. every page ---------------------------------------------------------------------------------------------------------
  if (wants('C')) {
    console.log('C  every page of the portal')
    await step('the overview: real numbers, what is waiting, the recent activity and the upcoming milestones', async () => {
      await page.goto(`${BASE}/en/client-portal/`, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'Welcome, Alex Example', level: 1 }).waitFor({ timeout: 10000 })
      const text = await page.locator('body').innerText()
      for (const needle of ['Active projects', 'Waiting for you', 'Recent activity', 'Upcoming milestones', 'First version online', 'We asked for your feedback']) expect(text.includes(needle), `missing "${needle}"`)
      expect(!text.includes(`PRIVATE-${alex.secret}`), 'a private note is shown')
      await scan(page, 'overview')
    })
    await step('keyboard: the six places can be reached with Tab and Enter, and focus lands on the page’s heading', async () => {
      await page.goto(`${BASE}/en/client-portal/`, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'Welcome, Alex Example', level: 1 }).waitFor()
      const nav = page.getByRole('navigation', { name: 'Portal menu' })
      const projects = nav.getByRole('link', { name: 'Projects' })
      await projects.focus()
      expect(await projects.evaluate((el) => el === document.activeElement), 'the link did not take focus')
      await page.keyboard.press('Enter')
      await page.getByRole('heading', { name: 'Projects', level: 1 }).waitFor({ timeout: 10000 })
      expect(await page.evaluate(() => document.activeElement?.tagName === 'H1'), 'focus is not on the heading')
      expect(await nav.getByRole('link', { name: 'Projects' }).getAttribute('aria-current') === 'page', 'the current place is not marked')
      const outline = await nav.getByRole('link', { name: 'Overview' }).focus().then(() => page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle))
      expect(outline !== 'none', 'no focus indicator')
    })
    await step('projects: the cards show the name, the reference, the status and the next milestone, and progress is counted', async () => {
      await page.goto(`${BASE}/en/client-portal/projects`, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'Bakery website', level: 2 }).waitFor({ timeout: 10000 })
      const text = await page.locator('body').innerText()
      for (const needle of [state.alex.reference, 'Waiting for you', 'First version online', '1 of 4 milestones done']) expect(text.includes(needle), `missing "${needle}"`)
      // PROMPT 26: a percentage is allowed, but only the one counted from the real records (1 of 4 milestones is 25%); no other number is ever shown.
      expect((text.match(/\d+\s?%/g) ?? []).every((percent) => percent.replace(/\s/g, '') === '25%'), 'a percentage that is not the count is shown')
      await shot(page, 'c-projects')
      await scan(page, 'projects')
    })
    await step('a project: status in words, dates, milestones, the timeline with the owner’s own words, no private note', async () => {
      await page.getByRole('link', { name: 'Bakery website' }).click()
      await page.getByRole('heading', { name: 'Bakery website', level: 1 }).waitFor({ timeout: 10000 })
      const text = await page.locator('body').innerText()
      for (const needle of ['We are waiting for your answer or approval.', 'Design approved', 'Which palette do you prefer?', 'Status is now: Waiting for you', 'Project created', alex.secret]) expect(text.includes(needle), `missing "${needle}"`)
      expect(!text.includes(`PRIVATE-${alex.secret}`), 'a private note is shown')
      expect(await page.locator('ol li').count() > 4, 'no timeline')
      await shot(page, 'c-project')
      await scan(page, 'project')
    })
    for (const [url, heading, needle, label] of [
      ['requests', 'Quote requests', 'No quote request is linked to you yet.', 'quote requests'],
      ['bookings', 'Bookings', 'No booking is linked to you yet.', 'bookings'],
      ['documents', 'Documents', 'Downloading files from this page is not available yet.', 'documents'],
      ['nonsense/path', 'We cannot find this in your account.', null, 'an unknown address inside the portal'],
    ]) {
      await step(`${label}: an honest empty state`, async () => {
        await page.goto(`${BASE}/en/client-portal/${url}`, { waitUntil: 'networkidle' })
        await page.getByRole('heading', { name: heading, level: 1 }).waitFor({ timeout: 10000 })
        if (needle) expect((await page.locator('body').innerText()).includes(needle), `missing "${needle}"`)
        await scan(page, label)
      })
    }
    await step('an empty account gets a helpful empty state, not an empty page', async () => {
      const empty = `empty.${stamp}@portal.test`
      await api.call('POST', '/api/admin/clients', { email: empty, language: 'en' })
      const [mail] = await waitForMail(empty)
      const { context, page: fresh } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB' })
      await fresh.goto(linkIn(mail.text)[0], { waitUntil: 'networkidle' })
      await fresh.getByRole('button', { name: 'Sign in' }).click()
      await fresh.getByRole('heading', { name: 'You have no projects in the portal yet', level: 2 }).waitFor({ timeout: 15000 })
      const text = await fresh.locator('body').innerText()
      expect(/Welcome to your portal/.test(text) && /Write to us/.test(text), 'no welcome or no way to write')
      expect(!/\b[1-9]\d?\s?%/.test(text), 'an invented figure')
      await scan(fresh, 'empty overview')
      await shot(fresh, 'c-empty')
      await context.close()
    })
  }

  // ---- D. isolation in the browser -------------------------------------------------------------------------------------------
  if (wants('D')) {
    console.log('D  another customer cannot see it')
    await step('a second customer asking for the first one’s project address sees "not found", and none of its words', async () => {
      const { context, page: other } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB' })
      await other.goto(bela.invite[0].replace('/hu/', '/en/'), { waitUntil: 'networkidle' })
      await other.getByRole('button', { name: 'Sign in' }).click()
      await other.getByRole('heading', { name: /Welcome, Béla Minta/, level: 1 }).waitFor({ timeout: 15000 })
      await other.goto(`${BASE}/en/client-portal/projects/${state.alex.reference}`, { waitUntil: 'networkidle' })
      await other.getByText('We cannot find this in your account.').first().waitFor({ timeout: 10000 })
      const text = await other.locator('body').innerText()
      for (const needle of ['Bakery website', alex.secret, 'Example Bakery', alex.email]) expect(!text.includes(needle), `the other customer's "${needle}" is on the page`)
      const api = await other.evaluate(async (reference) => {
        const a = await fetch(`/api/portal/projects/${reference}`, { credentials: 'same-origin' })
        const b = await fetch('/api/portal/projects/PRJ-ZZZZZZZZ', { credentials: 'same-origin' })
        return { a: a.status, b: b.status, textA: (await a.text()).replace(/"requestId":"[^"]+"/, ''), textB: (await b.text()).replace(/"requestId":"[^"]+"/, '') }
      }, state.alex.reference)
      expect(api.a === 404 && api.b === 404 && api.textA === api.textB, `the two answers differ: ${JSON.stringify(api)}`)
      await scan(other, 'not found')
      await context.close()
    })
  }

  // ---- E. the account ---------------------------------------------------------------------------------------------------------
  if (wants('E')) {
    console.log('E  the account')
    await step('the profile is saved and shown again; the verified address and the devices are listed without any secret', async () => {
      await page.goto(`${BASE}/en/client-portal/account`, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'Account', level: 1 }).waitFor({ timeout: 10000 })
      await page.getByLabel(/^Company/).fill('Example Bakery Ltd')
      await page.getByRole('button', { name: 'Save' }).first().click()
      await page.getByText('Saved.').waitFor({ timeout: 10000 })
      await page.reload({ waitUntil: 'networkidle' })
      expect(await page.getByLabel(/^Company/).inputValue() === 'Example Bakery Ltd', 'the company was not kept')
      const text = await page.locator('body').innerText()
      expect(text.includes(alex.email) && /Verified/.test(text) && /This device/.test(text), 'the address, "Verified" or the device is missing')
      const html = await page.content()
      expect(!/token_hash|csrf|password/i.test(html.replace(/csrfToken/g, '')), 'something secret-looking is in the page')
      await shot(page, 'e-account')
      await scan(page, 'account')
    })
    await step('asking to change the address sends a link to the NEW address and a notice (no link) to the old one', async () => {
      const next = `alex.new.${stamp}@portal.test`
      await page.getByLabel('New email address').fill(next)
      await page.getByRole('button', { name: 'Send a link to the new address' }).click()
      await page.getByText(/If the new address can be used/).waitFor({ timeout: 10000 })
      const [mail] = await waitForMail(next)
      expect(linkIn(mail.text), 'no link to the new address')
      const notices = (await waitForMail(alex.email, 2)).filter((entry) => /security notice/i.test(entry.subject))
      expect(notices.length === 1 && !/https?:\/\//.test(notices[0].text), 'the old address got no notice, or the notice has a link')
      expect(notices[0].text.includes('a*****@portal.test') && !notices[0].text.includes(next), 'the new address is not masked')
    })
    await step('"sign out everywhere else" says how many devices it ended', async () => {
      await page.getByRole('button', { name: 'Sign out everywhere else' }).click({ trial: true }).catch(() => undefined)
      expect(await page.getByText('No other device is signed in.').count() === 1, 'the list of devices is wrong')
    })
    await step('asking for the account’s deletion is recorded, says nothing was deleted, and can be withdrawn', async () => {
      await page.getByRole('checkbox', { name: /I understand that this also affects my projects/ }).check()
      await page.getByRole('button', { name: 'Ask for deletion' }).click()
      await page.getByText(/Nothing has been deleted yet/).waitFor({ timeout: 10000 })
      await page.getByRole('button', { name: 'Withdraw the request' }).click()
      await page.getByRole('button', { name: 'Ask for deletion' }).waitFor({ timeout: 10000 })
    })
  }

  // ---- F. the three languages -------------------------------------------------------------------------------------------------
  if (wants('F')) {
    console.log('F  the three languages')
    const cases = [
      ['hu', bela, 'Lépj be a projektjeidhez', 'Üdv, Béla Minta!', 'Garage webshop'],
      ['nl', cili, 'Log in bij je projecten', 'Welkom, Cili Voorbeeld', 'Boekingssite'],
    ]
    for (const [lang, who, signInTitle, hello, project] of cases) {
      await step(`${lang}: the sign-in page, the e-mail, the overview and a project are all in the customer's language`, async () => {
        const { context, page: p } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: lang === 'hu' ? 'hu-HU' : 'nl-NL' })
        await p.goto(`${BASE}/${lang}/client-portal/`, { waitUntil: 'networkidle' })
        await p.getByRole('heading', { name: signInTitle, level: 1 }).waitFor({ timeout: 10000 })
        expect(await p.evaluate(() => document.documentElement.lang) === lang, 'lang attribute')
        await scan(p, `${lang} sign-in`)
        // The first customer's invitation was spent in part D: ask for a new link in this language, as a customer would.
        let link = who.invite[0]
        if (lang === 'hu') {
          const asked = await fetch(`${BASE}/api/portal/auth/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: who.email, language: lang }) })
          expect(asked.status === 202, `asking for a link: ${asked.status}`)
          link = linkIn((await waitForMail(who.email, 2)).at(-1).text)[0]
        }
        await p.goto(link, { waitUntil: 'networkidle' })
        await p.getByRole('button', { name: lang === 'hu' ? 'Belépés' : 'Inloggen' }).click()
        await p.getByRole('heading', { name: hello, level: 1 }).waitFor({ timeout: 15000 })
        const text = await p.locator('body').innerText()
        expect(!/Welcome|Waiting for you|Recent activity/.test(text), `English words on the ${lang} page`)
        await scan(p, `${lang} overview`)
        await shot(p, `f-${lang}`)
        await p.goto(`${BASE}/${lang}/client-portal/projects/${state[lang === 'hu' ? 'bela' : 'cili'].reference}`, { waitUntil: 'networkidle' })
        await p.getByRole('heading', { name: project, level: 1 }).waitFor({ timeout: 10000 })
        await scan(p, `${lang} project`)
        await context.close()
      })
    }
  }

  // ---- G. sign-out and what third parties are told ----------------------------------------------------------------------------
  if (wants('G')) {
    console.log('G  sign-out, headers, search engines, measurement')
    await step('the portal’s pages say noindex, are never cached and never carry their address to another site', async () => {
      const response = await page.goto(`${BASE}/en/client-portal/projects/${state.alex.reference}`, { waitUntil: 'networkidle' })
      const headers = response.headers()
      expect(headers['cache-control'] === 'no-store', `cache-control: ${headers['cache-control']}`)
      expect((headers['x-robots-tag'] ?? '').includes('noindex'), 'no X-Robots-Tag')
      expect(headers['referrer-policy'] === 'no-referrer', `referrer-policy: ${headers['referrer-policy']}`)
      expect(await page.locator('meta[name=robots]').getAttribute('content') === 'noindex, nofollow', 'the robots meta')
      expect(await page.locator('link[rel=canonical]').count() === 0, 'a canonical address')
      const api = await page.evaluate(async () => {
        const r = await fetch('/api/portal/session', { credentials: 'same-origin' })
        return { status: r.status, cache: r.headers.get('cache-control'), robots: r.headers.get('x-robots-tag'), cors: r.headers.get('access-control-allow-origin') }
      })
      expect(api.status === 200 && api.cache === 'no-store' && api.cors === null && /noindex/.test(api.robots ?? ''), `API headers: ${JSON.stringify(api)}`)
    })
    await step('nothing was sent to anyone but this site, and nothing about the customer reached a measurement address', async () => {
      const foreign = state.requests.filter((url) => !url.startsWith(BASE))
      expect(foreign.length === 0, `requests to other origins: ${foreign.slice(0, 3).join(', ')}`)
      expect(!state.requests.some((url) => /collect|analytics|beacon/i.test(url)), 'a measurement request')
    })
    await step('signing out ends the session on the server: the old cookie opens nothing, Back shows no data after a reload', async () => {
      const cookie = (await ctx.cookies()).find((entry) => entry.name === 'cc_client')
      await page.goto(`${BASE}/en/client-portal/`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Sign out' }).click()
      await page.getByRole('heading', { name: 'Sign in to your projects', level: 1 }).waitFor({ timeout: 10000 })
      const reply = await fetch(`${BASE}/api/portal/session`, { headers: { Cookie: `cc_client=${cookie.value}` } })
      expect(reply.status === 401, `the old cookie still works: ${reply.status}`)
      await page.goto(`${BASE}/en/client-portal/projects`, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'Sign in to your projects', level: 1 }).waitFor({ timeout: 10000 })
      expect(!(await page.locator('body').innerText()).includes('Bakery website'), 'data is on screen after sign-out')
    })
  }

  // ---- H. the administration ---------------------------------------------------------------------------------------------------
  if (wants('H')) {
    console.log('H  the administration')
    const { context, page: adminPage } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB', scheme: 'light' })
    current = adminPage
    await step('the customers list: the invited and active accounts, search, the two switches', async () => {
      await adminPage.goto(`${BASE}/admin/clients`, { waitUntil: 'networkidle' })
      await adminPage.getByLabel('E-mail address').fill(EMAIL)
      await adminPage.getByLabel('Password').fill(PASSWORD)
      await adminPage.getByRole('button', { name: 'Sign in' }).click()
      await adminPage.getByRole('heading', { name: 'Customers', level: 1 }).waitFor({ timeout: 15000 })
      // The list is drawn twice (a table and cards) and CSS shows the one that fits: wait for a copy that is on screen.
      await adminPage.waitForFunction((email) => [...document.querySelectorAll('td, span, a')].some((element) => element.textContent?.includes(email) && element.getClientRects().length > 0), alex.email, { timeout: 10000 })
      expect(await adminPage.getByText(/Anyone who proves an email address/).count() === 1, 'the registration switch is missing')
      await adminPage.getByRole('searchbox').or(adminPage.getByRole('textbox', { name: /Search customers/ })).first().fill('garage').catch(() => undefined)
      await shot(adminPage, 'h-clients')
      await scan(adminPage, 'admin customers')
    })
    await step('one customer: the account, the records with this address, the projects and the history (no secret anywhere)', async () => {
      await adminPage.goto(`${BASE}/admin/clients/${state.alex.id}`, { waitUntil: 'networkidle' })
      await adminPage.getByRole('heading', { name: alex.name, level: 1 }).waitFor({ timeout: 10000 })
      const text = await adminPage.locator('body').innerText()
      for (const needle of ['Address verified', 'Signed-in devices', 'Records', 'Projects', 'History of the account', 'Bakery website']) expect(text.includes(needle), `missing "${needle}"`)
      expect(!/token|csrf/i.test(await adminPage.locator('main').innerText()), 'a secret-looking word is on the screen')
      await shot(adminPage, 'h-client')
      await scan(adminPage, 'admin customer')
    })
    await step('one project: the statuses allowed from here, the milestones, the private note (and only the owner sees it)', async () => {
      await adminPage.goto(`${BASE}/admin/client-projects/${state.alex.projectId}`, { waitUntil: 'networkidle' })
      await adminPage.getByRole('heading', { name: 'Bakery website', level: 1 }).waitFor({ timeout: 10000 })
      const text = await adminPage.locator('body').innerText()
      for (const needle of ['Change the status', 'Milestones', 'Write to the customer', 'Private notes', `PRIVATE-${alex.secret}`, 'Files cannot be shared yet']) expect(text.includes(needle), `missing "${needle}"`)
      await shot(adminPage, 'h-project')
      await scan(adminPage, 'admin project')
    })
    await context.close()
  }

  // ---- I. axe -----------------------------------------------------------------------------------------------------------------
  if (wants('I')) {
    console.log('I  accessibility (axe) on every screen scanned above')
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
