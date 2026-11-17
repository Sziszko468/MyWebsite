// The client communication system (PROMPT 28), in a real Chrome against the BUILT website served by the real backend (one process, one origin, a throw-away database, the `file`
// e-mail provider whose messages are read back). Nothing is mocked, nothing leaves the machine, and no real address is used (they end in .test).
//
//   A  the owner's setup through the API: three customers (English, Hungarian, Dutch), a project each, a published deliverable for the first, the owner opens "customers may start"
//   B  the administration: the center (real counts), a conversation started in the form, a reply, a private note (a different look), an announcement (asks first), a status change,
//      the search (private notes included) and the filters
//   C  the customer: the badge in the navigation, the inbox, a conversation (read only after it has been shown), writing (a double click is one message), earlier messages,
//      asking for a resolution, the project's activity feed and its events inline, starting a conversation from a project, the e-mail choices, the search and the filters
//   D  what the customer must never see: the owner's private notes (anywhere), another customer's conversations
//   E  the e-mails: once per wait, in the customer's language, with no word of what was written
//   F  the three languages on the customer's pages
//   G  axe and the layout checks on every screen above (needs AUDIT_AXE=<path to axe.min.js>) and the browser's console
//
//   AUDIT_PLAYWRIGHT=/path/to/playwright AUDIT_AXE=/path/to/axe.min.js node tools/e2e/communication-journey.cjs --base=http://127.0.0.1:8851 --mail=<mail folder> \
//        --email=admin@example.test --password=... [--width=1440] [--only=ABCDEFG] [--scheme=dark] [--reduced=1] [--out=<dir>]
//
// Needs a FRESH server built with VITE_API_URL=/ (every run makes customers and the e-mail counts are exact). See README.md in this folder and docs/client-communication/TEST_RESULTS.md.
const fs = require('fs')
const path = require('path')
const { launch, newPage, axeRun } = require('../audit/lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8851').replace(/\/$/, '')
const MAIL = arg('mail', '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const OUT = arg('out', '')
const WIDTH = Number(arg('width', '1440'))
const HEIGHT = Number(arg('height', WIDTH >= 768 ? '1000' : '844'))
const ONLY = arg('only', 'ABCDEFG')
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
const token = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`

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
  return { to: words(header('To')), replyTo: words(header('Reply-To')), subject: words(header('Subject')), text: parts['text/plain'] ?? '', html: parts['text/html'] ?? '' }
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

// ---- the owner's API -----------------------------------------------------------------------------------------------------------
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
  const anna = { email: `anna.${stamp}@comm.test`, name: 'Anna Example', company: 'Example Bakery', project: 'Bakery website', language: 'en' }
  const bela = { email: `bela.${stamp}@comm.test`, name: 'Béla Minta', company: 'Minta Garage', project: 'Garázs weboldal', language: 'hu' }
  const cili = { email: `cili.${stamp}@comm.test`, name: 'Cili Voorbeeld', company: 'Voorbeeld BV', project: 'Boekingssite', language: 'nl' }
  const violations = []
  const complaints = []
  const watch = (page, label) => {
    page.on('console', (message) => {
      if (message.type() === 'error') complaints.push(`${label}: ${message.text().slice(0, 220)}`)
    })
    page.on('pageerror', (error) => complaints.push(`${label}: ${String(error.message).slice(0, 220)}`))
  }
  const scan = async (page, label) => {
    await page.waitForLoadState('networkidle').catch(() => undefined)
    await sleep(250)
    const sideways = await page.evaluate(() => {
      const root = document.documentElement
      if (root.scrollWidth <= root.clientWidth + 1) return null
      const clipped = (element) => {
        for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(parent).overflowX) && parent.getBoundingClientRect().right <= root.clientWidth + 1) return true
        }
        return false
      }
      const wide = [...document.body.querySelectorAll('*')].filter((element) => element.getBoundingClientRect().right > root.clientWidth + 1 && !element.closest('[aria-hidden=true], dialog:not([open])') && !clipped(element))
      return `scrollWidth ${root.scrollWidth} > ${root.clientWidth}: ` + (wide.slice(0, 4).map((element) => `${element.tagName.toLowerCase()}.${String(element.className).slice(0, 30)} right=${Math.round(element.getBoundingClientRect().right)}`).join(' | ') || 'unknown')
    })
    expect(sideways === null, `${label}: the page scrolls sideways: ${sideways}`)
    if (AXE) {
      await sleep(500)
      const found = await axeRun(page)
      if (found.length) violations.push(`${label}: ${found.map((v) => `${v.id}(${v.impact}) ${v.nodes[0]?.target}${v.nodes[0]?.summary ? ` [${String(v.nodes[0].summary).replace(/\s+/g, ' ').slice(0, 260)}] ${String(v.nodes[0].html || '').slice(0, 140)}` : ''}`).join('; ')}`)
    }
  }

  // ---- A. setup ------------------------------------------------------------------------------------------------------------------
  const seed = async (who) => {
    const made = await api.data('POST', '/api/admin/clients', { email: who.email, name: who.name, company: who.company, language: who.language })
    const project = await api.data('POST', `/api/admin/clients/${made.id}/projects`, { name: who.project, category: 'website', notify: false })
    who.id = made.id
    who.projectId = project.id
    who.reference = project.reference
  }
  const state = {}
  const start = async (who, body) => (await api.data('POST', '/api/admin/communications', { customerId: who.id, clientToken: token(), ...body })).reference
  if (wants('A')) {
    console.log('A  the owner sets it up')
    await step('three customers with a project each; customers may start conversations; the owner starts one with each, the first about the project', async () => {
      for (const who of [anna, bela, cili]) await seed(who)
      await api.data('PUT', '/api/admin/communication-settings', { customerCanStart: true })
      state.annaThread = await start(anna, { subject: 'Your logo', body: `Could you send us the logo? ${SECRET}-BODY`, context: { type: 'project', reference: anna.reference } })
      state.belaThread = await start(bela, { subject: 'A logó', body: 'Elküldenéd nekünk a logót?' })
      state.ciliThread = await start(cili, { subject: 'Het logo', body: 'Kun je ons het logo sturen?' })
      await api.data('POST', `/api/admin/communications/${state.annaThread}/messages`, { kind: 'note', body: `PRIVATE-NOTE-${SECRET}: they will haggle about the price.` })
    })
    await step('the customers are e-mailed once each, in their own language, with a way in and no word of what was written', async () => {
      const [a] = await waitForMail(anna.email, (mail) => /We have a message for you/.test(mail.subject))
      const [b] = await waitForMail(bela.email, (mail) => /Üzenetünk van számodra/.test(mail.subject))
      const [c] = await waitForMail(cili.email, (mail) => /We hebben een bericht voor je/.test(mail.subject))
      expect(a.text.includes(`/en/client-portal/messages/${state.annaThread}`), 'no link into the conversation')
      expect(b.text.includes(`/hu/client-portal/messages/${state.belaThread}`) && c.text.includes(`/nl/client-portal/messages/${state.ciliThread}`), 'a link is wrong')
      for (const mail of [a, b, c]) expect(!/logo|logót|SECRET|Your logo/i.test(mail.text + mail.html), `the text of a message is in "${mail.subject}"`)
    })
  }

  // ---- B. the administration -----------------------------------------------------------------------------------------------------
  const admin = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB', scheme: SCHEME, reduced: REDUCED })
  const ap = admin.page
  watch(ap, 'admin')
  if (wants('B') || wants('G')) {
    console.log('B  the administration')
    await step('the center says where things stand, with real counts, and lists the conversations', async () => {
      current = ap
      await ap.goto(`${BASE}/admin/communications`, { waitUntil: 'networkidle' })
      await ap.getByLabel('E-mail address').fill(EMAIL)
      await ap.getByLabel('Password').fill(PASSWORD)
      await ap.getByRole('button', { name: 'Sign in' }).click()
      await ap.getByRole('heading', { name: 'Communication center', level: 1 }).waitFor({ timeout: 15000 })
      const text = await ap.locator('main').innerText()
      for (const needle of ['Open conversations', 'Waiting for the customer', 'Your logo', 'A logó', 'Het logo', 'Anna Example']) expect(text.toLowerCase().includes(needle.toLowerCase()), `missing "${needle}"`)
      // Three conversations the owner started, none answered: three wait for the customers, nothing for the owner.
      const stats = (await ap.locator('main ul').first().innerText()).replace(/\n+/g, ' ').toLowerCase()
      expect(/open conversations\s*3/.test(stats) && /waiting for the customer\s*3/.test(stats) && /waiting for you\s*0/.test(stats), `the counts: ${stats}`)
      await shot(ap, 'b-center')
      await scan(ap, 'admin center')
    })
    await step('a conversation is started in the form (the customer is chosen, what it is about is the customer’s own records), and shows in the list', async () => {
      await ap.getByRole('button', { name: 'New conversation' }).click()
      const form = ap.getByRole('form', { name: 'Start a conversation' })
      await form.getByLabel(/^Customer/).selectOption({ label: 'Anna Example · Example Bakery' })
      await form.getByLabel(/^Subject/).fill('The opening hours')
      await form.getByLabel('What is it about?').selectOption({ label: 'Project: Bakery website' })
      await form.getByLabel(/^The first message/).fill('Which opening hours should the new site show?')
      await form.getByRole('button', { name: 'Start the conversation' }).click()
      await ap.getByRole('heading', { name: 'The opening hours', level: 1 }).waitFor({ timeout: 15000 })
      state.hours = (await ap.locator('main').innerText()).match(/MSG-[A-Z0-9]{8}/)[0]
      const text = await ap.locator('main').innerText()
      expect(text.includes('Waiting for the customer') && text.includes('Bakery website'), 'the workspace does not say the status or the project')
      await shot(ap, 'b-workspace')
      await scan(ap, 'admin workspace')
    })
    await step('a private note looks different from a message and says the customer never sees it; a reply is a message; both are added', async () => {
      await ap.goto(`${BASE}/admin/communications/${state.annaThread}`, { waitUntil: 'networkidle' })
      await ap.getByRole('button', { name: 'A private note' }).click()
      await ap.getByLabel('Private note', { exact: true }).last().fill(`Another private thought ${SECRET}.`)
      await ap.getByRole('button', { name: 'Add the private note' }).click()
      await ap.getByText('The note was added.').first().waitFor({ timeout: 10000 })
      const note = ap.locator('li[data-visibility="internal"]').last()
      expect((await note.innerText()).includes('Only you and your team see this'), 'the note does not say it is private')
      expect((await note.evaluate((element) => getComputedStyle(element).borderTopStyle)) === 'dashed', 'a note is not drawn with a dashed border')
      const message = ap.locator('li[data-from="owner"][data-visibility="customer"]').first()
      expect((await message.evaluate((element) => getComputedStyle(element).borderTopStyle)) !== 'dashed', 'a message is drawn like a note')
      await ap.getByRole('button', { name: 'A reply to the customer' }).click()
      await ap.getByLabel('Your text').fill('We also need a photo of the shop.')
      await ap.getByRole('button', { name: 'Send the reply' }).click()
      await ap.getByText('Sent.').first().waitFor({ timeout: 10000 })
      await shot(ap, 'b-note')
      await scan(ap, 'admin workspace with a note')
    })
    await step('an announcement asks first and says what happens; only after the confirmation does it go', async () => {
      await ap.getByRole('button', { name: 'An announcement' }).click()
      await ap.getByLabel('Your text').fill('We are closed on Friday.')
      await ap.getByRole('button', { name: 'Send the announcement…' }).click()
      const dialog = ap.locator('dialog[open]')
      await dialog.waitFor({ timeout: 5000 })
      expect((await dialog.innerText()).includes('e-mailed') && (await dialog.innerText()).includes('cannot be edited'), 'the question does not say what happens')
      await scan(ap, 'admin announcement question')
      const before = (await api.data('GET', `/api/admin/communications/${state.annaThread}`)).messages.filter((entry) => entry.type === 'announcement').length
      expect(before === 0, 'it went before the confirmation')
      await dialog.getByRole('button', { name: 'Send the announcement' }).click()
      await ap.getByText('Sent.').first().waitFor({ timeout: 10000 })
      const after = (await api.data('GET', `/api/admin/communications/${state.annaThread}`)).messages.filter((entry) => entry.type === 'announcement')
      expect(after.length === 1, 'the announcement was not sent')
    })
    await step('the status is changed by hand (stale screens are told), and the search reads the private notes too', async () => {
      await ap.getByLabel('Set the status').selectOption({ label: 'Waiting for you' })
      await ap.getByRole('button', { name: 'Change the status' }).click()
      await ap.getByText('The status was changed.').first().waitFor({ timeout: 10000 })
      expect((await ap.locator('main').innerText()).includes('Waiting for you'), 'the new status is not shown')
      await ap.getByRole('search', { name: 'Search in this conversation' }).getByRole('searchbox').fill('haggle')
      await ap.getByRole('search', { name: 'Search in this conversation' }).getByRole('button', { name: 'Search' }).click()
      await ap.getByText('Results: 1').waitFor({ timeout: 10000 })
      expect((await ap.locator('aside [role=status]').innerText()).includes('Private:'), 'the match is not marked as a private note')
      await ap.goto(`${BASE}/admin/communications`, { waitUntil: 'networkidle' })
      await ap.getByRole('search', { name: 'Search', exact: true }).getByRole('searchbox').fill('haggle')
      await ap.getByRole('search', { name: 'Search', exact: true }).getByRole('button', { name: 'Search' }).click()
      await ap.getByText('Found in a private note').first().waitFor({ timeout: 10000 })
      await scan(ap, 'admin search')
    })
    await step('the filters narrow the list: by what waits for whom, by customer, and an empty result says so', async () => {
      await ap.goto(`${BASE}/admin/communications`, { waitUntil: 'networkidle' })
      await ap.getByLabel('Show', { exact: true }).selectOption({ label: 'Waiting for you' })
      await ap.getByRole('table').waitFor({ timeout: 10000 })
      const rows = await ap.locator('tbody tr').allInnerTexts()
      expect(rows.length === 1 && rows[0].includes('Your logo'), `waiting for you: ${rows.length} rows`)
      await ap.getByLabel('Customer', { exact: true }).first().selectOption({ label: 'Béla Minta' })
      await ap.getByText('No conversations match.').waitFor({ timeout: 10000 })
      await ap.getByRole('button', { name: 'Clear the filters' }).click()
      await ap.getByLabel('Show', { exact: true }).selectOption({ label: 'Waiting for the customer' })
      // The list is reloaded by the filter; until it has been, the rows of the previous list are still there, so wait for the count and then compare it.
      await ap.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3, null, { timeout: 10000 }).catch(() => undefined)
      const waitingRows = await ap.locator('tbody tr').count()
      expect(waitingRows === 3, `the three conversations that wait for the customers (found ${waitingRows})`)
      await shot(ap, 'b-filters')
    })
  }

  // ---- C. the customer -----------------------------------------------------------------------------------------------------------
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
  // The invitation e-mails hold the sign-in link: the first one is the activation.
  let cp
  let customer
  const portal = (suffix = '', language = 'en') => `${BASE}/${language}/client-portal/${suffix}`
  const fetchJson = (page, url, init) => page.evaluate(async ({ url, init }) => { const response = await fetch(url, { credentials: 'same-origin', ...init }); return { status: response.status, text: await response.text() } }, { url, init })
  if (wants('C') || wants('D') || wants('E') || wants('F') || wants('G')) {
    customer = await signIn(anna, 'en')
    cp = customer.page
  }

  if (wants('C')) {
    console.log('C  the customer')
    await step('the navigation says how many messages wait, in words as well; the inbox lists the conversation as unread', async () => {
      current = cp
      await cp.goto(portal(), { waitUntil: 'networkidle' })
      const link = cp.getByRole('link', { name: /^Messages/ })
      await link.waitFor({ timeout: 10000 })
      expect(/Unread: [1-9]/.test(await link.innerText()), `the badge: ${await link.innerText()}`)
      await link.click()
      await cp.getByRole('heading', { name: 'Messages', level: 1 }).waitFor({ timeout: 10000 })
      const card = cp.locator('li', { hasText: 'Your logo' }).first()
      await card.waitFor({ timeout: 10000 })
      expect(/waiting for (us|you)/i.test(await card.innerText()), 'the status is not in words')
      expect(/Unread: [1-9]/.test(await card.innerText()), 'the card does not say what is unread')
      await shot(cp, 'c-inbox')
      await scan(cp, 'portal inbox')
    })
    await step('opening it shows the owner’s words, and the conversation is read only after they have been shown: the badge goes, the server agrees', async () => {
      // What waits: the owner's three messages in this conversation (the first, a reply, an announcement) and the one in the opening-hours conversation.
      const before = JSON.parse((await fetchJson(cp, '/api/portal/messages/summary')).text).data.unread
      expect(before === 4, `${before} unread before opening, four were expected`)
      await cp.getByRole('link', { name: 'Your logo' }).click()
      await cp.getByRole('heading', { name: 'Your logo', level: 1 }).waitFor({ timeout: 10000 })
      const text = await cp.locator('main').innerText()
      expect(text.includes('Could you send us the logo?') && text.includes('Bakery website'), 'the words or the project are missing')
      // Read only after the messages were shown: this conversation's three are read, the other conversation's one is not, and the badge says so.
      await cp.waitForFunction(() => /Unread: 1(?!\d)/.test(document.querySelector('nav[aria-label="Portal menu"]')?.textContent ?? ''), null, { timeout: 10000 })
      const after = JSON.parse((await fetchJson(cp, '/api/portal/messages/summary')).text).data.unread
      expect(after === 1, `the server counts ${after}, one was expected`)
      expect(JSON.parse((await fetchJson(cp, `/api/portal/messages/${state.annaThread}`)).text).data.unread === 0, 'the conversation is not read')
      expect(!text.includes(SECRET + '-PRIVATE') && !text.includes('haggle'), 'a private note is on the page')
      await shot(cp, 'c-conversation')
      await scan(cp, 'portal conversation')
    })
    await step('an empty message is refused in words; a message is sent once even when the button is pressed twice; it shows and the status follows', async () => {
      await cp.getByRole('button', { name: 'Send the message' }).click()
      await cp.getByRole('alert').first().waitFor({ timeout: 5000 })
      expect((await cp.getByRole('alert').first().innerText()).includes('Write something in your message'), 'no word about an empty message')
      await cp.locator('#message-text').fill('Here is the logo: a red stripe. <b>Thanks!</b>')
      await cp.getByRole('button', { name: 'Send the message' }).dblclick()
      await cp.getByText('Your message was sent.').first().waitFor({ timeout: 10000 })
      const detail = JSON.parse((await fetchJson(cp, `/api/portal/messages/${state.annaThread}`)).text).data
      expect(detail.messages.filter((entry) => entry.body && entry.body.startsWith('Here is the logo')).length === 1, 'the message was stored more than once')
      expect(detail.status === 'waiting_owner', `status ${detail.status}`)
      expect((await cp.locator('main').innerText()).includes('Here is the logo: a red stripe. <b>Thanks!</b>'), 'the words were not shown as typed')
      expect(await cp.locator('main b').count() === 0, 'markup from the customer ran')
    })
    await step('the owner’s announcement is marked, and a removed message is a line that says so', async () => {
      const text = await cp.locator('main').innerText()
      await cp.goto(portal(`messages/${state.annaThread}`), { waitUntil: 'networkidle' })
      const view = await cp.locator('main').innerText()
      expect(/announcement/i.test(view) && view.includes('We are closed on Friday.'), 'the announcement is not marked')
      expect(text.length > 0, 'empty page')
      const mistaken = await api.data('POST', `/api/admin/communications/${state.annaThread}/messages`, { kind: 'reply', body: 'MISTAKE-WORD sent to the wrong customer.' })
      const id = mistaken.messages.find((entry) => entry.body === 'MISTAKE-WORD sent to the wrong customer.').id
      await api.call('DELETE', `/api/admin/communications/${state.annaThread}/messages/${id}`)
      await cp.reload({ waitUntil: 'networkidle' })
      const after = await cp.locator('main').innerText()
      expect(after.includes('This message was removed.') && !after.includes('MISTAKE-WORD'), 'a removed message shows its words or does not say it was removed')
    })
    await step('a long conversation shows the latest messages and loads the earlier ones on request', async () => {
      const long = await start(anna, { subject: 'A long conversation', body: 'The first of many.' })
      for (let index = 0; index < 34; index += 1) await api.data('POST', `/api/admin/communications/${long}/messages`, { kind: 'reply', body: `Message number ${index + 2}`, clientToken: token() })
      await cp.goto(portal(`messages/${long}`), { waitUntil: 'networkidle' })
      expect(!(await cp.locator('main').innerText()).includes('The first of many.'), 'the very first message is already shown')
      await cp.getByRole('button', { name: 'Earlier messages' }).click()
      await cp.getByText('The first of many.').waitFor({ timeout: 10000 })
      expect(await cp.getByRole('button', { name: 'Earlier messages' }).count() === 0, 'the button stays when nothing is earlier')
      await scan(cp, 'portal long conversation')
    })
    await step('the customer can ask for a resolution once; it is a request, and the owner is told once', async () => {
      await cp.goto(portal(`messages/${state.annaThread}`), { waitUntil: 'networkidle' })
      await cp.getByRole('button', { name: 'Ask to resolve' }).click()
      await cp.getByText('Your request was sent.').first().waitFor({ timeout: 10000 })
      expect(await cp.getByRole('button', { name: 'Ask to resolve' }).count() === 0, 'it can be asked twice')
      expect((await cp.locator('main').innerText()).includes('You asked for this conversation to be resolved'), 'the event is not in the conversation')
      const detail = await api.data('GET', `/api/admin/communications/${state.annaThread}`)
      expect(detail.resolutionRequested === true, `admin sees resolutionRequested ${detail.resolutionRequested}`)
    })
    await step('the project’s activity feed lists what happened in it, read only; a conversation about the project shows those events inline', async () => {
      await api.data('POST', `/api/admin/client-projects/${anna.projectId}/status`, { status: 'design' })
      const milestone = await api.data('POST', `/api/admin/client-projects/${anna.projectId}/milestones`, { title: 'Design approved' })
      await api.data('PATCH', `/api/admin/client-projects/${anna.projectId}/milestones/${milestone.id}`, { done: true })
      await cp.goto(portal('messages'), { waitUntil: 'networkidle' })
      const feed = cp.getByRole('link', { name: 'Project activity: Bakery website' })
      await feed.waitFor({ timeout: 10000 })
      await feed.click()
      await cp.getByRole('heading', { name: 'Project activity: Bakery website', level: 1 }).waitFor({ timeout: 10000 })
      const text = await cp.locator('main').innerText()
      expect(text.includes('The project status changed: Design.') && text.includes('A milestone was completed: Design approved.'), 'the events are not in the feed')
      expect(text.includes('read-only list') && (await cp.locator('#message-text').count()) === 0, 'the feed can be written in')
      await cp.goto(portal(`messages/${state.annaThread}`), { waitUntil: 'networkidle' })
      expect((await cp.locator('main').innerText()).includes('The project status changed: Design.'), 'the project’s event is not inline in the conversation about the project')
      await shot(cp, 'c-feed')
      await scan(cp, 'portal activity')
    })
    await step('a conversation is started from the project page; what it is about is chosen from the customer’s own records and shown as a link', async () => {
      await cp.goto(portal(`projects/${anna.reference}`), { waitUntil: 'networkidle' })
      await cp.getByRole('link', { name: 'I have a question about this project' }).click()
      await cp.getByLabel('Subject').fill('Photos for the home page')
      expect((await cp.getByLabel('What is it about?').inputValue()) === `project:${anna.reference}`, 'the project is not preselected')
      await cp.locator('#new-body').fill('Which size should the photos be?')
      await scan(cp, 'portal new conversation')
      await cp.getByRole('button', { name: 'Start the conversation' }).click()
      await cp.getByRole('heading', { name: 'Photos for the home page', level: 1 }).waitFor({ timeout: 10000 })
      const text = await cp.locator('main').innerText()
      expect(text.includes('Waiting for us') && text.includes('Bakery website'), 'the status or the project is missing')
      await waitForMail('owner@example.test', (mail) => /A customer wrote/.test(mail.subject))
    })
    await step('the filters, the search and the e-mail choices work by keyboard and say what they did', async () => {
      await cp.goto(portal('messages'), { waitUntil: 'networkidle' })
      const resolved = cp.getByRole('button', { name: 'Resolved', exact: true })
      await resolved.focus()
      await cp.keyboard.press('Enter')
      expect((await resolved.getAttribute('aria-pressed')) === 'true', 'the filter is not pressed')
      await cp.getByText('There is no conversation in this filter.').waitFor({ timeout: 10000 })
      await cp.getByRole('button', { name: 'All', exact: true }).click()
      await cp.getByRole('searchbox', { name: 'Search the conversations' }).fill('photos')
      await cp.locator('main').getByRole('button', { name: 'Search', exact: true }).click()
      await cp.getByText('Results: 1').waitFor({ timeout: 10000 })
      expect(!(await cp.locator('main').innerText()).includes('haggle'), 'a private note is found')
      await cp.getByRole('searchbox', { name: 'Search the conversations' }).fill('haggle')
      await cp.locator('main').getByRole('button', { name: 'Search', exact: true }).click()
      await cp.getByText('Nothing was found for this.').waitFor({ timeout: 10000 })
      await cp.getByRole('button', { name: 'Clear the search' }).click()
      const box = cp.getByRole('checkbox', { name: 'Email me about announcements' })
      await box.uncheck()
      await cp.getByText('Your choice was saved.').first().waitFor({ timeout: 10000 })
      expect(JSON.parse((await fetchJson(cp, '/api/portal/message-preferences')).text).data.announcements === false, 'the choice was not saved')
      await shot(cp, 'c-preferences')
      await scan(cp, 'portal inbox with choices')
    })
  }

  // ---- D. what must never be seen --------------------------------------------------------------------------------------------------
  if (wants('D')) {
    console.log('D  what the customer must never see')
    await step('no answer or page of the customer carries a private note, and another customer cannot reach a conversation that is not theirs', async () => {
      current = cp
      const answers = await cp.evaluate(async (urls) => Promise.all(urls.map(async (url) => (await fetch(url, { credentials: 'same-origin' })).text())), [
        '/api/portal/messages',
        `/api/portal/messages/${state.annaThread}`,
        `/api/portal/messages/${state.annaThread}?limit=50`,
        '/api/portal/messages/search?q=haggle',
        '/api/portal/messages/search?q=PRIVATE',
        '/api/portal/messages/summary',
        '/api/portal/overview',
      ])
      for (const body of answers) expect(!/PRIVATE-NOTE|haggle|Another private thought|"internal"/.test(body), 'a private note is in an answer')
      const second = await signIn(bela, 'hu')
      const bp = second.page
      current = bp
      const own = await fetchJson(bp, `/api/portal/messages/${state.belaThread}`)
      const foreign = await fetchJson(bp, `/api/portal/messages/${state.annaThread}`)
      const unknown = await fetchJson(bp, '/api/portal/messages/MSG-NOPE0000')
      expect(own.status === 200 && foreign.status === 404 && unknown.status === 404, `statuses ${own.status}/${foreign.status}/${unknown.status}`)
      expect(JSON.parse(foreign.text).error.message === JSON.parse(unknown.text).error.message, 'a foreign conversation is told apart from one that is not there')
      await bp.goto(portal(`messages/${state.annaThread}`, 'hu'), { waitUntil: 'networkidle' })
      await bp.getByText(/nem találjuk/).first().waitFor({ timeout: 10000 })
      expect(!(await bp.locator('body').innerText()).includes('Your logo'), 'the subject leaked')
      await scan(bp, 'portal not found')
      await second.context.close()
    })
  }

  // ---- E. the e-mails --------------------------------------------------------------------------------------------------------------
  if (wants('E')) {
    console.log('E  the e-mails')
    await step('each wait is one e-mail, to the right person, in their language; the owner’s say who to reply to; none holds a word that was written', async () => {
      await sleep(1500)
      const toAnna = mailsTo(anna.email).filter((mail) => /message for you|announcement|resolved/i.test(mail.subject))
      // The logo (1), the opening hours (1), the logo again once the customer had answered and the owner wrote (1), the long conversation (1): a wait begins four times.
      const waits = toAnna.filter((mail) => /We have a message for you/.test(mail.subject)).length
      expect(waits === 4, `${waits} "message for you" mails, four waits began`)
      expect(toAnna.filter((mail) => /announcement/i.test(mail.subject)).length === 1, 'the announcement was not e-mailed exactly once')
      const toOwner = mailsTo('owner@example.test').filter((mail) => /customer/i.test(mail.subject))
      // The customer's first message in the logo thread came while the owner was already expected to answer (no mail); the conversation she started is one.
      expect(toOwner.filter((mail) => /A customer wrote/.test(mail.subject)).length === 1, `${toOwner.filter((mail) => /A customer wrote/.test(mail.subject)).length} "A customer wrote" mails, one wait began`)
      expect(toOwner.filter((mail) => /asked to resolve/.test(mail.subject)).length === 1, 'the request for resolution was not e-mailed exactly once')
      for (const mail of toOwner) expect(mail.replyTo.includes('@comm.test'), `no reply-to on "${mail.subject}"`)
      for (const mail of [...mails()]) {
        const everything = mail.text + mail.html
        for (const word of ['Here is the logo', 'We are closed on Friday', 'MISTAKE-WORD', 'PRIVATE-NOTE', 'haggle', 'Photos for the home page', 'Which size should the photos', 'The opening hours', 'Which opening hours']) expect(!everything.includes(word), `"${word}" is in "${mail.subject}"`)
      }
      expect(mailsTo(anna.email).filter((mail) => /Email me|preferences/i.test(mail.subject)).length === 0, 'unexpected mail')
    })
    await step('a choice the customer switched off is respected: a second announcement is not e-mailed to her, and still shown', async () => {
      const before = mailsTo(anna.email).filter((mail) => /announcement/i.test(mail.subject)).length
      await api.data('POST', `/api/admin/communications/${state.annaThread}/messages`, { kind: 'announcement', body: 'A second announcement.', confirm: true })
      await sleep(2500)
      expect(mailsTo(anna.email).filter((mail) => /announcement/i.test(mail.subject)).length === before, 'it was e-mailed against her choice')
      await cp.goto(portal(`messages/${state.annaThread}`), { waitUntil: 'networkidle' })
      expect((await cp.locator('main').innerText()).includes('A second announcement.'), 'it is not shown')
    })
  }

  // ---- F. the three languages ----------------------------------------------------------------------------------------------------------
  if (wants('F')) {
    console.log('F  the three languages')
    await step('Hungarian: the inbox, the conversation and the composer are in Hungarian, with no placeholder or key showing', async () => {
      const hu = await signIn(bela, 'hu')
      current = hu.page
      await hu.page.goto(portal('messages', 'hu'), { waitUntil: 'networkidle' })
      await hu.page.getByRole('heading', { name: 'Üzenetek', level: 1 }).waitFor({ timeout: 10000 })
      await hu.page.getByRole('link', { name: 'A logó' }).click()
      await hu.page.getByRole('heading', { name: 'A logó', level: 1 }).waitFor({ timeout: 10000 })
      const text = await hu.page.locator('main').innerText()
      for (const needle of ['Elküldenéd nekünk a logót?', 'Üzenet küldése', 'Rád vár']) expect(text.toLowerCase().includes(needle.toLowerCase()), `missing "${needle}"`)
      expect(!/\{[a-z]+\}/i.test(text) && !/Send the message|Waiting for you/.test(text), 'English or a placeholder is showing')
      await shot(hu.page, 'f-hu')
      await scan(hu.page, 'portal hu')
      await hu.context.close()
    })
    await step('Dutch: the same, in Dutch', async () => {
      const nl = await signIn(cili, 'nl')
      current = nl.page
      await nl.page.goto(portal('messages', 'nl'), { waitUntil: 'networkidle' })
      await nl.page.getByRole('heading', { name: 'Berichten', level: 1 }).waitFor({ timeout: 10000 })
      await nl.page.getByRole('link', { name: 'Het logo' }).click()
      await nl.page.getByRole('heading', { name: 'Het logo', level: 1 }).waitFor({ timeout: 10000 })
      const text = await nl.page.locator('main').innerText()
      for (const needle of ['Kun je ons het logo sturen?', 'Bericht versturen', 'Wacht op jou']) expect(text.toLowerCase().includes(needle.toLowerCase()), `missing "${needle}"`)
      expect(!/\{[a-z]+\}/i.test(text) && !/Send the message|Waiting for you/.test(text), 'English or a placeholder is showing')
      await shot(nl.page, 'f-nl')
      await scan(nl.page, 'portal nl')
      await nl.context.close()
    })
    await step('the administration speaks Hungarian when asked: the center and a workspace', async () => {
      const hu = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'hu-HU', scheme: SCHEME, reduced: REDUCED })
      watch(hu.page, 'admin hu')
      current = hu.page
      await hu.page.goto(`${BASE}/admin/communications`, { waitUntil: 'networkidle' })
      await hu.page.getByLabel('E-mail-cím').fill(EMAIL)
      await hu.page.getByLabel('Jelszó').fill(PASSWORD)
      await hu.page.getByRole('button', { name: 'Bejelentkezés' }).click()
      await hu.page.getByRole('heading', { name: 'Kommunikációs központ', level: 1 }).waitFor({ timeout: 15000 })
      expect((await hu.page.locator('main').innerText()).toLowerCase().includes('nyitott beszélgetések'), 'the counts are not in Hungarian')
      await hu.page.goto(`${BASE}/admin/communications/${state.belaThread}`, { waitUntil: 'networkidle' })
      const text = await hu.page.locator('main').innerText()
      expect(text.toLowerCase().includes('az ügyfélre vár') && text.toLowerCase().includes('írás'), 'the workspace is not in Hungarian')
      await scan(hu.page, 'admin hu')
      await hu.context.close()
    })
  }

  // ---- G. the checks collected --------------------------------------------------------------------------------------------------------
  console.log('G  the checks collected over every screen above')
  await step('axe found nothing on any screen (wcag 2.2 AA and best practice)', async () => {
    if (!AXE) return
    expect(violations.length === 0, violations.join(' || '))
  })
  await step('the browser had no complaint: no script error, no refused frame, picture or style', async () => {
    const real = complaints.filter((line) => !/Failed to load resource: the server responded with a status of 4(?:0[1349]|22)/.test(line))
    expect(real.length === 0, real.slice(0, 5).join(' | '))
  })

  await browser.close()
  console.log(`\n${failed === 0 ? 'ALL OK' : 'FAILED'}: ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
