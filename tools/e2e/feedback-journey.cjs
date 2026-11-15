// The feedback, approval and preview system (PROMPT 27), in a real Chrome against the BUILT website served by the real backend (one process, one origin, a throw-away database,
// the `file` e-mail provider whose messages are read back). Nothing leaves the machine and no real address is used (they end in .test). The "preview website" and its picture
// live at https://previews.example.test, which does not exist: the browser asks for them and THIS script answers (page.route), so the page's own Content-Security-Policy is what
// decides whether a frame or a picture may be shown, exactly as in production.
//
//   A  the owner's setup through the API: two customers, a project each, a website preview and a picture, both published
//   B  the administration: the list, a new deliverable made in the form, its draft previewed and published (with the question first)
//   C  the customer: the list, the private preview in a sandboxed frame, general feedback (draft, then sent), a marker placed with the mouse and with the keyboard
//   D  the owner replies and resolves; a new version; the customer sees the old one read-only; approval asked, a tick is required, one exact version is approved
//   E  asking for changes instead; the owner's history shows who confirmed which fingerprint; the e-mails (once each, in the customer's language, nothing private)
//   F  what the customer must never see: another customer's deliverable, the internal description, a private note
//   G  the three languages on the customer's pages
//   H  axe and the layout checks on every screen above (needs AUDIT_AXE=<path to axe.min.js>)
//
//   AUDIT_PLAYWRIGHT=/path/to/playwright AUDIT_AXE=/path/to/axe.min.js node tools/e2e/feedback-journey.cjs --base=http://127.0.0.1:8841 --mail=<mail folder> \
//        --email=admin@example.test --password=... [--width=1440] [--only=ABCDEFGH] [--scheme=dark] [--reduced=1] [--out=<dir>]
//
// Needs a FRESH server built with VITE_API_URL=/ and VITE_PREVIEW_ORIGINS=https://previews.example.test, started with PREVIEW_ORIGINS=https://previews.example.test
// (every run makes customers). See README.md in this folder and docs/client-feedback/TEST_RESULTS.md.
const fs = require('fs')
const path = require('path')
const { launch, newPage, axeRun } = require('../audit/lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8841').replace(/\/$/, '')
const MAIL = arg('mail', '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const OUT = arg('out', '')
const WIDTH = Number(arg('width', '1440'))
const HEIGHT = Number(arg('height', WIDTH >= 768 ? '1000' : '844'))
const ONLY = arg('only', 'ABCDEFGH')
const SCHEME = arg('scheme', 'light')
const REDUCED = arg('reduced', '') === '1'
const wants = (letter) => ONLY.includes(letter)
const MOBILE = WIDTH < 768
const AXE = Boolean(process.env.AUDIT_AXE)
const PREVIEW = 'https://previews.example.test'
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

// What the pretend preview host answers: a small page for the frame and a picture (an SVG with a recognisable layout) for the markers.
const PICTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500"><rect width="800" height="500" fill="#f4efe6"/><rect x="40" y="40" width="720" height="80" fill="#c8102e"/><rect x="40" y="160" width="340" height="300" fill="#222"/><rect x="420" y="160" width="340" height="300" fill="#888"/></svg>`
const answerPreviews = async (page) => {
  await page.route(`${PREVIEW}/**`, (route) => {
    const url = route.request().url()
    if (/\.svg|\.png/.test(url)) return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: PICTURE, headers: { 'Access-Control-Allow-Origin': '*' } })
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>Previewed site</title><h1>The previewed website</h1><p>A page that is not ours.</p>' })
  })
}

async function main() {
  if (!MAIL || !EMAIL || !PASSWORD) throw new Error('usage: --mail=<folder> --email=<admin> --password=<password> [--base=...] [--out=<dir>]')
  console.log(`viewport ${WIDTH}x${HEIGHT}, ${SCHEME}${REDUCED ? ', reduced motion' : ''}, parts ${ONLY}${AXE ? ', axe on' : ', axe OFF (AUDIT_AXE not set)'}`)
  const browser = await launch()
  const api = await owner()
  const SECRET = `SECRET-${stamp}`
  const anna = { email: `anna.${stamp}@feedback.test`, name: 'Anna Example', company: 'Example Bakery', project: 'Bakery website', language: 'en' }
  const bela = { email: `bela.${stamp}@feedback.test`, name: 'Béla Minta', company: 'Minta Garage', project: 'Garázs weboldal', language: 'hu' }
  const cili = { email: `cili.${stamp}@feedback.test`, name: 'Cili Voorbeeld', company: 'Voorbeeld BV', project: 'Boekingssite', language: 'nl' }
  const state = {}
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
      if (found.length) violations.push(`${label}: ${found.map((v) => `${v.id}(${v.impact}) ${v.nodes[0]?.target}`).join('; ')}`)
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
  const at = (who, suffix = '') => `/api/admin/client-projects/${who.projectId}/deliverables${suffix}`
  const make = async (who, body) => {
    const created = await api.data('POST', at(who), body)
    const detail = await api.data('GET', at(who, `/${created.id}`))
    return { ...created, versionId: detail.versions[0].id }
  }
  const publish = (who, d, versionId = d.versionId) => api.data('POST', at(who, `/${d.id}/versions/${versionId}/publish`), {})

  if (wants('A')) {
    console.log('A  the owner sets it up')
    await step('three customers, a project each; a website preview and a picture shared with the first, one with the second; each published', async () => {
      for (const who of [anna, bela, cili]) await seed(who)
      state.site = await make(anna, { title: 'Home page preview', type: 'website_preview', customerDescription: 'The first look of the home page.', internalDescription: `Internal: client is picky. ${SECRET}`, versionTitle: 'First layout', versionDescription: 'A first layout with the new colours.', previewUrl: `${PREVIEW}/site/v1` })
      state.picture = await make(anna, { title: 'Logo proposal', type: 'image', versionTitle: 'Logo, first try', versionDescription: 'Three variants on one sheet.', imageUrl: `${PREVIEW}/logo-v1.svg` })
      state.others = await make(bela, { title: 'Garázs főoldal', type: 'website_preview', versionTitle: 'Első változat', versionDescription: 'Az első terv.', previewUrl: `${PREVIEW}/garage/v1` })
      state.dutch = await make(cili, { title: 'Boekingspagina', type: 'website_preview', versionTitle: 'Eerste versie', versionDescription: 'Een eerste ontwerp.', previewUrl: `${PREVIEW}/booking/v1` })
      await api.data('POST', at(anna, `/${state.site.id}/notes`), { body: `PRIVATE-NOTE-${SECRET}` })
      await publish(anna, state.site)
      await publish(anna, state.picture)
      await publish(bela, state.others)
      await publish(cili, state.dutch)
    })
    await step('a draft is private: the customer’s list is empty until something is published, and an address that is not https is refused', async () => {
      const draft = await make(anna, { title: 'Not yet', type: 'other', versionTitle: 'Draft only' })
      const refused = await api.call('POST', at(anna), { title: 'Bad', type: 'website_preview', versionTitle: 'x', previewUrl: 'http://previews.example.test/x' }, true)
      expect(refused.status === 422, `an http address was answered ${refused.status}`)
      const loopback = await api.call('POST', at(anna), { title: 'Bad', type: 'website_preview', versionTitle: 'x', previewUrl: 'https://localhost/x' }, true)
      expect(loopback.status === 422, `localhost was answered ${loopback.status}`)
      state.draft = draft
    })
    await step('the customer is e-mailed once for each published deliverable, in English, with a link into the portal and no private word', async () => {
      const found = await waitForMail(anna.email, (mail) => /ready for your review/.test(mail.subject))
      await sleep(1500)
      const all = mailsTo(anna.email).filter((mail) => /ready for your review/.test(mail.subject))
      expect(all.length === 2, `${all.length} messages for two deliverables`)
      for (const mail of all) {
        expect(/client-portal/.test(mail.text), 'no link into the portal')
        expect(!(mail.text + mail.html).includes(SECRET), 'a private word is in the e-mail')
      }
      expect(found.length >= 1, 'no mail')
    })
  }

  // ---- B. the administration ---------------------------------------------------------------------------------------------------
  const admin = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB', scheme: SCHEME, reduced: REDUCED })
  const ap = admin.page
  watch(ap, 'admin')
  const listUrl = () => `${BASE}/admin/client-projects/${anna.projectId}/deliverables`
  if (wants('B') || wants('E') || wants('H')) {
    console.log('B  the administration')
    await step('the list shows both deliverables with their state, the origins that may be shown inside the portal, and the draft', async () => {
      current = ap
      await ap.goto(listUrl(), { waitUntil: 'networkidle' })
      await ap.getByLabel('E-mail address').fill(EMAIL)
      await ap.getByLabel('Password').fill(PASSWORD)
      await ap.getByRole('button', { name: 'Sign in' }).click()
      await ap.getByRole('heading', { name: /^Deliverables for review: Bakery website/, level: 1 }).waitFor({ timeout: 15000 })
      const text = await ap.locator('main').innerText()
      for (const needle of ['Home page preview', 'Logo proposal', 'Not yet', 'Published', 'Draft', PREVIEW]) expect(text.includes(needle), `missing "${needle}"`)
      await shot(ap, 'b-list')
      await scan(ap, 'admin list')
    })
    await step('a new deliverable is made in the form; its first version is a draft that only the owner sees, with a preview of what the customer will get', async () => {
      await ap.getByRole('button', { name: 'New deliverable' }).click()
      await ap.locator('form input[maxlength="160"]').first().fill('Menu page preview')
      await ap.getByLabel('First version: title').fill('Menu, first layout')
      await ap.getByLabel('First version: description for the customer').fill('How the menu page looks.')
      await ap.getByLabel(/^Preview address/).fill(`${PREVIEW}/menu/v1`)
      await ap.getByRole('button', { name: 'Create the deliverable' }).click()
      await ap.getByRole('heading', { name: 'Menu page preview', level: 1 }).waitFor({ timeout: 15000 })
      const text = await ap.locator('main').innerText()
      expect(text.includes('The customer cannot see this deliverable yet'), 'does not say it is invisible')
      expect(text.includes('Preview before you publish') && text.includes('It will be shown inside the portal'), 'no preview of the draft')
      state.menuUrl = ap.url()
      await shot(ap, 'b-draft')
      await scan(ap, 'admin draft')
    })
    await step('the draft is edited in the form: an http address is refused next to its field and the form stays open; a good one is saved', async () => {
      await ap.getByRole('button', { name: 'Edit the draft' }).click()
      await ap.getByLabel('Title of this version').fill('Menu, second thoughts')
      await ap.getByLabel(/^Preview address/).fill('http://previews.example.test/menu/v1')
      await ap.getByRole('button', { name: 'Save the draft' }).click()
      await ap.getByText(/This is not an acceptable address/).first().waitFor({ timeout: 10000 })
      expect((await ap.getByLabel('Title of this version').count()) === 1, 'the form closed on a refusal')
      await ap.getByLabel(/^Preview address/).fill(`${PREVIEW}/menu/v2`)
      await ap.getByRole('button', { name: 'Save the draft' }).click()
      await ap.getByText('Saved.').first().waitFor({ timeout: 10000 })
      await ap.waitForFunction(() => document.body.innerText.includes('Menu, second thoughts') && !document.body.innerText.includes('Title of this version'), null, { timeout: 8000 })
      await scan(ap, 'admin draft edited')
    })
    await step('publishing asks first, says what happens, and then a published version has no form and no publish button', async () => {
      await ap.getByRole('button', { name: 'Publish this version' }).click()
      const dialog = ap.locator('dialog[open]')
      await dialog.waitFor({ timeout: 5000 })
      expect((await dialog.innerText()).includes('never changed'), 'the question does not say a published version is never changed')
      await scan(ap, 'admin publish question')
      await dialog.getByRole('button', { name: 'Publish this version' }).click()
      await ap.getByText('Published.').first().waitFor({ timeout: 10000 })
      await ap.waitForFunction(() => !document.body.innerText.includes('Edit the draft'), null, { timeout: 8000 })
      const text = await ap.locator('main').innerText()
      expect(text.includes('The customer sees version 1 as the current one'), 'does not say what the customer sees now')
      expect(!text.includes('Publish this version') && !text.includes('Edit the draft'), 'a published version still offers editing or publishing')
      await shot(ap, 'b-published')
      await scan(ap, 'admin published')
    })
  }

  // ---- C. the customer -----------------------------------------------------------------------------------------------------------
  const signIn = async (who, language) => {
    const context = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: language === 'hu' ? 'hu-HU' : language === 'nl' ? 'nl-NL' : 'en-GB', scheme: SCHEME, reduced: REDUCED })
    watch(context.page, `customer ${language}`)
    await answerPreviews(context.page)
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
  let customer
  let cp
  const portal = (suffix = '', language = 'en') => `${BASE}/${language}/client-portal/${suffix}`
  const deliverableUrl = (who, d, language = 'en') => portal(`projects/${who.reference}/deliverables/${d.reference}`, language)
  if (wants('C') || wants('D') || wants('E') || wants('F') || wants('G') || wants('H')) {
    customer = await signIn(anna, 'en')
    cp = customer.page
  }

  if (wants('C')) {
    console.log('C  the customer looks and gives feedback')
    await step('the project page lists what was shared (not the draft), grouped by what needs the customer', async () => {
      current = cp
      await cp.goto(portal(`projects/${anna.reference}`), { waitUntil: 'networkidle' })
      await cp.getByRole('heading', { name: 'Deliverables for review', level: 2 }).waitFor({ timeout: 10000 })
      const text = await cp.locator('main').innerText()
      for (const needle of ['Home page preview', 'Logo proposal', 'Menu page preview']) expect(text.includes(needle), `missing "${needle}"`)
      expect(!text.includes('Not yet') && !text.includes('Draft only'), 'the draft is visible to the customer')
      expect(!text.includes(SECRET), 'a private word is on the page')
      await shot(cp, 'c-list')
      await scan(cp, 'portal list')
    })
    await step('the preview is a sandboxed frame without permissions or referrer, from an origin on the owner’s list, with the link out as well', async () => {
      await cp.getByRole('link', { name: /Home page preview/ }).first().click()
      await cp.getByRole('heading', { name: 'Home page preview', level: 1 }).waitFor({ timeout: 10000 })
      const frame = cp.locator('iframe')
      await frame.waitFor({ timeout: 10000 })
      expect((await frame.getAttribute('src')) === `${PREVIEW}/site/v1`, 'the frame shows another address')
      const sandbox = (await frame.getAttribute('sandbox')) ?? ''
      expect(sandbox && !/allow-(top-navigation|popups|modals|downloads|pointer-lock)/.test(sandbox), `the sandbox is "${sandbox}"`)
      expect((await frame.getAttribute('referrerpolicy')) === 'no-referrer', 'the frame sends a referrer')
      const inside = cp.frameLocator('iframe')
      await inside.getByRole('heading', { name: 'The previewed website' }).waitFor({ timeout: 10000 })
      const link = cp.getByRole('link', { name: 'Open in a new tab' })
      expect(((await link.getAttribute('rel')) ?? '').includes('noopener') && (await link.getAttribute('target')) === '_blank', 'the link does not open safely')
      expect(!complaints.some((line) => /Content Security Policy|Refused to/i.test(line)), `the policy refused something: ${complaints.join(' | ')}`)
      await shot(cp, 'c-preview')
      await scan(cp, 'portal preview')
    })
    await step('nothing is approved by opening it: the page shows no approval panel and the owner’s record still says "not submitted"', async () => {
      expect(!(await cp.locator('main').innerText()).includes('Approve this version'), 'an approval is offered')
      const detail = await api.data('GET', at(anna, `/${state.site.id}`))
      expect(detail.deliverable.review_state === 'not_submitted' && detail.approvals.length === 0, `state ${detail.deliverable.review_state}`)
    })
    await step('general feedback: empty is refused in words, a draft is saved, and it is sent together; what was sent has no edit or delete', async () => {
      await cp.getByRole('button', { name: 'Save the comment as a draft' }).click()
      await cp.getByRole('alert').first().waitFor({ timeout: 5000 })
      expect((await cp.getByRole('alert').first().innerText()).includes('Write something in your comment'), 'no word about an empty comment')
      await cp.locator('#comment-text').fill('The header feels too tall on a phone. <b>Please</b> check.')
      await cp.getByRole('button', { name: 'Save the comment as a draft' }).click()
      await cp.getByText('Unsent drafts: 1').waitFor({ timeout: 10000 })
      expect((await cp.locator('main').innerText()).includes('Draft, not sent yet'), 'the draft is not marked as one')
      await cp.getByRole('button', { name: 'Send the feedback' }).click()
      await cp.getByText(/We have received your feedback/).first().waitFor({ timeout: 10000 })
      const text = await cp.locator('main').innerText()
      expect(text.includes('The header feels too tall on a phone. <b>Please</b> check.'), 'the words were not kept as written (as text)')
      expect(await cp.getByRole('button', { name: 'Edit' }).count() === 0 && await cp.getByRole('button', { name: 'Delete' }).count() === 0, 'what was sent can be edited or deleted')
      await shot(cp, 'c-feedback')
    })
    await step('the owner is told once (feedback), with the customer to reply to and no markup run', async () => {
      const [mail] = await waitForMail('owner@example.test', (message) => /A customer sent feedback/.test(message.subject))
      expect(mail.replyTo.includes(anna.email), `reply-to ${mail.replyTo}`)
      expect(!mail.html.includes('<b>Please</b>'), 'markup from the customer is live in the e-mail')
      await sleep(1000)
      expect(mailsTo('owner@example.test').filter((message) => /A customer sent feedback/.test(message.subject)).length === 1, 'more than one')
    })
    await step('a picture: a marker is placed with a tap (a click) where the customer pointed, and said in words and in percent', async () => {
      await cp.goto(deliverableUrl(anna, state.picture), { waitUntil: 'networkidle' })
      await cp.getByRole('heading', { name: 'Logo proposal', level: 1 }).waitFor({ timeout: 10000 })
      const image = cp.locator('img[src$="logo-v1.svg"]')
      await image.waitFor({ timeout: 10000 })
      expect((await image.getAttribute('referrerpolicy')) === 'no-referrer', 'the picture sends a referrer')
      await cp.getByRole('button', { name: 'Place a marker' }).click()
      await image.scrollIntoViewIfNeeded()
      const box = await image.boundingBox()
      await cp.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.2)
      const chosen = await cp.getByText(/The chosen spot: /).first().innerText()
      const [left, top] = [...chosen.matchAll(/([\d.]+)%/g)].map((match) => Number(match[1]))
      expect(Math.abs(left - 25) < 1 && Math.abs(top - 20) < 1, `chosen ${left}% / ${top}% for a click at 25% / 20%`)
      await cp.locator('#comment-text').fill('The red bar is too heavy.')
      await cp.getByRole('button', { name: 'Save the comment as a draft' }).click()
      await cp.getByText('Unsent drafts: 1').waitFor({ timeout: 10000 })
      const marker = cp.getByRole('button', { name: /^Marker 1: / })
      await marker.waitFor({ timeout: 5000 })
      const style = (await marker.getAttribute('style')) ?? ''
      const spot = { left: Number(/left:\s*([\d.]+)%/.exec(style)?.[1]), top: Number(/top:\s*([\d.]+)%/.exec(style)?.[1]) }
      expect(Math.abs(spot.left - 25) < 1 && Math.abs(spot.top - 20) < 1, `the marker sits at "${style}"`)
      await shot(cp, 'c-picture')
      await scan(cp, 'portal picture')
    })
    await step('a second marker is placed with the keyboard alone: the crosshair takes focus, the arrows move it, Enter places it, Escape cancels', async () => {
      await cp.getByRole('button', { name: 'Place a marker' }).click()
      const crosshair = cp.getByRole('button', { name: /^Crosshair: / })
      await crosshair.waitFor({ timeout: 5000 })
      expect(await crosshair.evaluate((element) => element === document.activeElement), 'the crosshair did not take focus')
      const before = await crosshair.getAttribute('aria-label')
      for (let index = 0; index < 4; index += 1) await cp.keyboard.press('ArrowRight')
      await cp.keyboard.press('Shift+ArrowDown')
      expect((await crosshair.getAttribute('aria-label')) !== before, 'the arrows did not move it')
      await cp.keyboard.press('Escape')
      await cp.getByRole('button', { name: 'Place a marker' }).waitFor({ timeout: 5000 })
      await cp.getByRole('button', { name: 'Place a marker' }).click()
      await cp.getByRole('button', { name: /^Crosshair: / }).waitFor({ timeout: 5000 })
      for (let index = 0; index < 5; index += 1) await cp.keyboard.press('ArrowLeft')
      await cp.keyboard.press('Enter')
      await cp.getByText(/The chosen spot: /).first().waitFor({ timeout: 5000 })
      await cp.locator('#comment-text').fill('This area could hold a photo.')
      await cp.getByRole('button', { name: 'Save the comment as a draft' }).click()
      await cp.getByText('Unsent drafts: 2').waitFor({ timeout: 10000 })
      expect(await cp.getByRole('button', { name: /^Marker \d: / }).count() === 2, 'two markers were expected')
    })
    await step('both markers are sent together; the list says where each one is in words, and a draft can still be changed before it is sent but not after', async () => {
      await cp.getByRole('button', { name: 'Send the feedback' }).click()
      await cp.getByText(/We have received your feedback/).first().waitFor({ timeout: 10000 })
      const text = await cp.locator('main').innerText()
      expect((text.match(/Place on the picture: [\d.]+% from the left, [\d.]+% from the top/g) ?? []).length === 2, 'the two places are not said in words')
      expect(text.includes('The red bar is too heavy.') && text.includes('This area could hold a photo.'), 'a comment is missing')
      const detail = await api.data('GET', at(anna, `/${state.picture.id}`))
      const placed = detail.comments.filter((comment) => comment.x !== null)
      expect(placed.length === 2 && placed.every((comment) => comment.x >= 0 && comment.x <= 1 && comment.y >= 0 && comment.y <= 1), 'the stored positions are not normalised')
    })
  }

  // ---- D. the owner replies, a new version, approval -------------------------------------------------------------------------------
  if (wants('D')) {
    console.log('D  reply, a new version, and approval of one exact version')
    await step('the owner replies in the administration and resolves a thread; the customer sees "Us" and the resolution, and is e-mailed once', async () => {
      current = ap
      await ap.goto(`${BASE}/admin/client-projects/${anna.projectId}/deliverables/${state.site.id}`, { waitUntil: 'networkidle' })
      await ap.getByRole('button', { name: 'Reply', exact: true }).first().click()
      await ap.getByLabel('Your reply (the customer reads it)').fill('Thank you: we shortened the header in version 2.')
      await ap.getByRole('button', { name: 'Send the reply' }).click()
      await ap.getByText('Reply sent.').first().waitFor({ timeout: 10000 })
      await ap.getByRole('button', { name: 'Resolve', exact: true }).first().click()
      await ap.getByText('Resolved.').first().waitFor({ timeout: 10000 })
      await shot(ap, 'd-reply')
      await scan(ap, 'admin feedback')
      const [mail] = await waitForMail(anna.email, (message) => /We replied to your feedback/.test(message.subject))
      expect(mail.text.includes('we shortened the header') && !(mail.text + mail.html).includes(SECRET), 'the reply e-mail is wrong')
      current = cp
      await cp.goto(deliverableUrl(anna, state.site), { waitUntil: 'networkidle' })
      const text = await cp.locator('main').innerText()
      expect(text.includes('we shortened the header in version 2') && text.includes('Resolved'), 'the reply or the resolution is not visible')
    })
    await step('a new version is made and published: the customer reads it as current, the old one is read-only with its own feedback kept', async () => {
      const detail = await api.data('GET', at(anna, `/${state.site.id}`))
      const next = await api.data('POST', at(anna, `/${state.site.id}/versions`), {})
      const draft = next.versions.find((version) => version.status === 'draft')
      await api.data('PATCH', at(anna, `/${state.site.id}/versions/${draft.id}`), { title: 'Second layout', customerDescription: 'The header is shorter.', previewUrl: `${PREVIEW}/site/v2` })
      await publish(anna, state.site, draft.id)
      state.secondVersion = draft
      expect(detail.versions.length === 1, 'the first version was expected to be alone')
      await cp.goto(deliverableUrl(anna, state.site), { waitUntil: 'networkidle' })
      await cp.getByText('You are looking at version 2').first().waitFor({ timeout: 10000 })
      expect((await cp.locator('iframe').getAttribute('src')) === `${PREVIEW}/site/v2`, 'the frame shows the old address')
      await cp.getByRole('button', { name: /^Look at it: Version 1/ }).click()
      await cp.getByText('This is an earlier version: read only.').first().waitFor({ timeout: 10000 })
      expect(await cp.locator('#comment-text').count() === 0, 'an earlier version can be commented on')
      expect((await cp.locator('main').innerText()).includes('The header feels too tall on a phone'), 'the feedback on version 1 is gone')
      await shot(cp, 'd-older')
      await scan(cp, 'portal older version')
    })
    await step('approval is asked for the current version; a tick is required; what is approved is exactly the version shown', async () => {
      await api.data('POST', at(anna, `/${state.site.id}/approvals`), { note: 'Please decide by Friday.' })
      await cp.goto(deliverableUrl(anna, state.site), { waitUntil: 'networkidle' })
      await cp.getByRole('heading', { name: 'Approval', level: 2 }).waitFor({ timeout: 10000 })
      expect((await cp.locator('main').innerText()).includes('Please decide by Friday.'), 'the owner’s word is missing')
      await cp.getByRole('button', { name: 'Approve this version…' }).click()
      const dialog = cp.locator('dialog[open]')
      await dialog.waitFor({ timeout: 5000 })
      expect((await dialog.innerText()).includes('version 2'), 'the question does not name the version')
      await scan(cp, 'portal approval dialog')
      await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
      await dialog.getByText('Tick the confirmation to approve.').waitFor({ timeout: 5000 })
      expect((await api.data('GET', at(anna, `/${state.site.id}`))).approvals.every((entry) => entry.state === 'requested'), 'approved without the tick')
      await dialog.getByRole('checkbox').check()
      await dialog.getByRole('button', { name: 'Approve', exact: true }).click()
      await cp.getByText(/You approved version 2/).first().waitFor({ timeout: 10000 })
      await shot(cp, 'd-approved')
      await scan(cp, 'portal approved')
      const detail = await api.data('GET', at(anna, `/${state.site.id}`))
      const approved = detail.approvals.find((entry) => entry.state === 'approved')
      const second = detail.versions.find((version) => version.number === 2)
      expect(approved && approved.confirmed_version === 2 && approved.confirmed_checksum === second.checksum, 'the approval is not bound to version 2 and its fingerprint')
      expect(detail.deliverable.review_state === 'approved', `state ${detail.deliverable.review_state}`)
    })
    await step('the owner is told once, and the history shows who confirmed which fingerprint', async () => {
      await waitForMail('owner@example.test', (message) => /A customer approved a version/.test(message.subject))
      current = ap
      await ap.goto(`${BASE}/admin/client-projects/${anna.projectId}/deliverables/${state.site.id}`, { waitUntil: 'networkidle' })
      const text = await ap.locator('main').innerText()
      expect(/The customer confirmed version 2, fingerprint [0-9a-f]{12}/.test(text), 'the confirmation is not in the history')
      expect(text.includes('Approval history') && text.includes('Approved'), 'no approval history')
      await shot(ap, 'd-history')
      await scan(ap, 'admin approval history')
    })
    await step('a new version after an approval does not inherit it: the next version waits for its own decision', async () => {
      const next = await api.data('POST', at(anna, `/${state.site.id}/versions`), {})
      const draft = next.versions.find((version) => version.status === 'draft')
      await api.data('PATCH', at(anna, `/${state.site.id}/versions/${draft.id}`), { title: 'Third layout', customerDescription: 'Footer added.' })
      await publish(anna, state.site, draft.id)
      const detail = await api.data('GET', at(anna, `/${state.site.id}`))
      expect(detail.deliverable.review_state === 'superseded', `state ${detail.deliverable.review_state}`)
      expect(detail.approvals.filter((entry) => entry.state === 'approved').length === 1, 'the approval was copied')
      await cp.goto(deliverableUrl(anna, state.site), { waitUntil: 'networkidle' })
      expect(!(await cp.locator('main').innerText()).includes('Approve this version'), 'an approval is offered without a request')
    })
  }

  // ---- E. changes instead ----------------------------------------------------------------------------------------------------------
  if (wants('E')) {
    console.log('E  asking for changes, and the e-mails')
    await step('the customer asks for changes: an explanation is required, it is kept as written, and the owner is told once', async () => {
      current = cp
      await api.data('POST', at(anna, `/${state.picture.id}/approvals`), {})
      await cp.goto(deliverableUrl(anna, state.picture), { waitUntil: 'networkidle' })
      await cp.getByRole('button', { name: 'Ask for changes…' }).click()
      await cp.getByRole('button', { name: 'Ask for changes', exact: true }).click()
      await cp.getByText('Write at least a few words.').first().waitFor({ timeout: 5000 })
      await cp.getByLabel('Your explanation (required)').fill('Please try a darker red <i>and</i> a bigger mark.')
      await cp.getByRole('button', { name: 'Ask for changes', exact: true }).click()
      await cp.getByText('Your request for changes was sent.').first().waitFor({ timeout: 10000 })
      const detail = await api.data('GET', at(anna, `/${state.picture.id}`))
      expect(detail.deliverable.review_state === 'changes_requested', `state ${detail.deliverable.review_state}`)
      const [mail] = await waitForMail('owner@example.test', (message) => /A customer asked for changes/.test(message.subject))
      expect(mail.text.includes('darker red') || mail.html.includes('darker red'), 'the explanation is not in the owner’s e-mail')
      expect(!mail.html.includes('<i>and</i>'), 'markup from the customer is live in the e-mail')
      await sleep(800)
      expect(mailsTo('owner@example.test').filter((message) => /A customer asked for changes/.test(message.subject)).length === 1, 'more than one')
    })
    await step('every message the customer got was in English, said once, and held nothing private; the owner’s said who to reply to', async () => {
      // One message per step, exactly: three published (the Home page, the Logo, the Menu), two new versions (2 and 3 of the Home page), two requests for approval (Home page v2, Logo v1), one reply.
      const expected = [[/ready for your review/, 3], [/We replied to your feedback/, 1], [/A new version is available/, 2], [/Your approval is requested/, 2]]
      for (const [kind, count] of expected) {
        const found = mailsTo(anna.email).filter((mail) => kind.test(mail.subject)).length
        expect(found === count, `${kind}: ${found} messages, expected ${count}`)
      }
      for (const mail of mailsTo(anna.email)) expect(!(mail.text + mail.html).includes(SECRET), `a private word in "${mail.subject}"`)
      for (const mail of mailsTo('owner@example.test').filter((message) => /customer/.test(message.subject))) expect(mail.replyTo.includes('@feedback.test'), `no reply-to on "${mail.subject}"`)
    })
  }

  // ---- F. what must never be seen ----------------------------------------------------------------------------------------------------
  if (wants('F')) {
    console.log('F  what the customer must never see')
    await step('another customer gets the same answer for Anna’s deliverable as for one that does not exist, on the page and in the API', async () => {
      const second = await signIn(bela, 'hu')
      const bp = second.page
      current = bp
      const own = await bp.evaluate(async (url) => (await fetch(url, { credentials: 'same-origin' })).status, `${BASE}/api/portal/projects/${bela.reference}/deliverables/${state.others.reference}`)
      expect(own === 200, `their own deliverable: ${own}`)
      const statuses = await bp.evaluate(async (urls) => Promise.all(urls.map(async (url) => (await fetch(url, { credentials: 'same-origin' })).status)), [
        `${BASE}/api/portal/projects/${anna.reference}/deliverables/${state.site.reference}`,
        `${BASE}/api/portal/projects/${bela.reference}/deliverables/${state.site.reference}`,
        `${BASE}/api/portal/projects/${anna.reference}/deliverables/DLV-NOPE0000`,
      ])
      expect(statuses.every((status) => status === 404), `answers ${statuses.join(', ')}`)
      // With the session's own CSRF token, so the answer is about OWNERSHIP and not about a missing token.
      const probe = await bp.evaluate(async ({ base, mine, project, deliverable }) => {
        const token = (await (await fetch(`${base}/api/portal/session`, { credentials: 'same-origin' })).json()).data.csrfToken
        const send = async (url, body) => (await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token }, body: JSON.stringify(body) })).status
        return {
          foreign: await send(`${base}/api/portal/projects/${project}/deliverables/${deliverable}/comments`, { body: 'hello' }),
          crossed: await send(`${base}/api/portal/projects/${mine}/deliverables/${deliverable}/comments`, { body: 'hello' }),
          unknown: await send(`${base}/api/portal/projects/${project}/deliverables/DLV-NOPE0000/comments`, { body: 'hello' }),
        }
      }, { base: BASE, mine: bela.reference, project: anna.reference, deliverable: state.site.reference })
      expect(probe.foreign === 404 && probe.crossed === 404 && probe.unknown === 404, `a comment on Anna's deliverable was answered ${JSON.stringify(probe)}`)
      await bp.goto(deliverableUrl(anna, state.site, 'hu'), { waitUntil: 'networkidle' })
      await bp.getByText(/nem találjuk/).first().waitFor({ timeout: 10000 })
      expect(!(await bp.locator('body').innerText()).includes('Home page preview'), 'the title leaked')
      await scan(bp, 'portal not found')
      await second.context.close()
    })
    await step('no answer or page of the customer carries the internal description, a private note, an administrator’s address or a stored secret', async () => {
      const bodies = await cp.evaluate(async (urls) => Promise.all(urls.map(async (url) => (await (await fetch(url, { credentials: 'same-origin' })).text()))), [
        `${BASE}/api/portal/projects/${anna.reference}/deliverables`,
        `${BASE}/api/portal/projects/${anna.reference}/deliverables/${state.site.reference}`,
        `${BASE}/api/portal/projects/${anna.reference}/deliverables/${state.site.reference}?version=1`,
        `${BASE}/api/portal/overview`,
      ])
      for (const body of bodies) {
        expect(!body.includes(SECRET) && !/internal_description|internalDescription|PRIVATE-NOTE/.test(body), 'a private field is in an answer')
        expect(!body.includes(EMAIL), 'the administrator’s address is in an answer')
      }
      const headers = await cp.evaluate(async (url) => Object.fromEntries((await fetch(url, { credentials: 'same-origin' })).headers.entries()), `${BASE}/api/portal/projects/${anna.reference}/deliverables`)
      expect(/no-store/.test(headers['cache-control'] ?? ''), 'the answer can be cached')
      expect(!('access-control-allow-origin' in headers), 'the answer allows other origins')
    })
    await step('the portal’s page is served never cached, never indexed, with no referrer, and a frame only for the owner’s origin', async () => {
      const response = await fetch(deliverableUrl(anna, state.site), { redirect: 'manual' })
      expect(response.status === 200, `status ${response.status}`)
      expect(/no-store/.test(response.headers.get('cache-control') ?? ''), 'cacheable')
      expect(/noindex/.test(response.headers.get('x-robots-tag') ?? ''), 'indexable')
      expect(response.headers.get('referrer-policy') === 'no-referrer', `referrer ${response.headers.get('referrer-policy')}`)
      const policy = response.headers.get('content-security-policy') ?? ''
      expect(new RegExp(`frame-src ${PREVIEW.replace(/\./g, '\\.')}(;|$)`).test(policy), `frame-src is not exactly the owner's origin: ${policy}`)
      expect(/img-src [^;]*previews\.example\.test/.test(policy) && !/script-src [^;]*previews/.test(policy), 'the policy lets scripts in from the preview host or no picture')
      const other = await fetch(`${BASE}/en/services/`)
      expect(/frame-src 'none'/.test(other.headers.get('content-security-policy') ?? ''), 'a public page lets frames in')
    })
  }

  // ---- G. the three languages -------------------------------------------------------------------------------------------------------
  if (wants('G')) {
    console.log('G  the three languages')
    await step('Hungarian: the page, its buttons and its statuses are in Hungarian, with no placeholder or key showing', async () => {
      const hu = await signIn(bela, 'hu')
      current = hu.page
      await hu.page.goto(deliverableUrl(bela, state.others, 'hu'), { waitUntil: 'networkidle' })
      await hu.page.getByRole('heading', { name: 'Garázs főoldal', level: 1 }).waitFor({ timeout: 10000 })
      const text = await hu.page.locator('main').innerText()
      for (const needle of ['Előnézet', 'Visszajelzés', 'Verziók', 'Megnyitás új lapon']) expect(text.includes(needle), `missing "${needle}"`)
      expect(!/\{[a-z]+\}/i.test(text) && !/Preview|Feedback|Versions/.test(text), 'English or a placeholder is showing')
      await shot(hu.page, 'g-hu')
      await scan(hu.page, 'portal hu')
      await hu.context.close()
    })
    await step('Dutch: the same, in Dutch', async () => {
      const nl = await signIn(cili, 'nl')
      current = nl.page
      await nl.page.goto(deliverableUrl(cili, state.dutch, 'nl'), { waitUntil: 'networkidle' })
      await nl.page.getByRole('heading', { name: 'Boekingspagina', level: 1 }).waitFor({ timeout: 10000 })
      const text = await nl.page.locator('main').innerText()
      for (const needle of ['Voorbeeld', 'Feedback', 'Versies', 'Openen in een nieuw tabblad']) expect(text.includes(needle), `missing "${needle}"`)
      expect(!/\{[a-z]+\}/i.test(text) && !/Preview|Versions|Open in a new tab/.test(text), 'English or a placeholder is showing')
      await shot(nl.page, 'g-nl')
      await scan(nl.page, 'portal nl')
      await nl.context.close()
    })
    await step('the e-mails to the Hungarian and Dutch customers are in their language', async () => {
      const hu = await waitForMail(bela.email, (mail) => /Átnézésre vár egy anyag/.test(mail.subject))
      const nl = await waitForMail(cili.email, (mail) => /oplevering klaar ter beoordeling/.test(mail.subject))
      expect(hu.length === 1 && nl.length === 1, 'not once each')
      expect(/Szia /.test(hu[0].text) && /Hallo /.test(nl[0].text), 'the greeting is in another language')
    })
  }

  // ---- H. the checks collected --------------------------------------------------------------------------------------------------------
  console.log('H  the checks collected over every screen above')
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
