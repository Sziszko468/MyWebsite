// The whole life of a quotation (PROMPT 21), in a real Chrome against the BUILT website served by the real backend (one process, one origin, a
// throw-away database, the `file` e-mail provider whose messages are read back). Nothing is mocked, nothing leaves the machine, and no real
// e-mail address is used (the addresses end in .test).
//
//   A  a customer asks for a package quote in the shop                 B  a customer sends a FULL EXPERIENCE request
//   C  the administrator reviews both, filters by language              D  the administrator writes the quotation (in Hungarian), previews it, sends it
//   E  the customer opens the secure link                              F  the customer asks for a change and gets a receipt
//   G  the administrator sees the question and sends a new version     H  the old link is dead; the customer accepts the final version
//   I  both sides are told once, in the right language                 J  the administrator sees the final status, the history and the e-mails
//   K  the administrator ends a customer's links                       L  a contact message becomes a quote request, once
//   M  the administration's new screens on a phone and a tablet
//
//   AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/quote-lifecycle-journey.cjs --base=http://127.0.0.1:8830 --mail=<mail folder> \
//        --email=admin@example.test --password=... [--customer-width=390] [--owner-language=hu] [--only=ABCDEFGHIJKLM] [--out=<dir>]
//
// Needs a FRESH server (every run creates requests and a quotation) built with VITE_API_URL=/ (see README.md in this folder).
const fs = require('fs')
const path = require('path')
const { launch, newPage } = require('../audit/lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8830').replace(/\/$/, '')
const MAIL = arg('mail', '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const OUT = arg('out', '')
const CW = Number(arg('customer-width', '390'))
const CH = Number(arg('customer-height', CW >= 768 ? '1000' : '844'))
const OWNER_LANGUAGE = arg('owner-language', 'hu')
const ONLY = arg('only', 'ABCDEFGHIJKLM')
const wants = (letter) => ONLY.includes(letter)
if (OUT) fs.mkdirSync(OUT, { recursive: true })

let passed = 0
let failed = 0
let current = null
const track = (page) => {
  current = page
  return page
}
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
    }
  }
}
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}
const shot = async (page, name) => {
  if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => undefined)
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const NO_SCROLL = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
const futureDay = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
const plain = (text) => text.replace(/[  ]/g, ' ')
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
  return { file, to: words(header('To')), subject: words(header('Subject')), replyTo: words(header('Reply-To')), text: parts['text/plain'] ?? '', html: parts['text/html'] ?? '' }
}
const mails = () =>
  fs
    .readdirSync(MAIL)
    .filter((name) => name.endsWith('.eml'))
    .sort()
    .map((name) => decodeMessage(path.join(MAIL, name)))
async function waitForMail(predicate, what, timeoutMs = 20000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    const hit = mails().find(predicate)
    if (hit) return hit
    await sleep(400)
  }
  throw new Error(`no e-mail arrived: ${what}`)
}
const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const linkOf = (text, page) => new RegExp(`${escapeRe(BASE)}/(?:hu|en|nl)/${page}/([A-Za-z0-9_-]{43})`).exec(text)?.[0] ?? ''
const next = (page) => page.locator('form button[type=submit]').click()

/** Words inside buttons and button-like links that the browser had to break in the middle (a narrow phone, a long Hungarian word in capitals): none is acceptable. */
const brokenWords = (page) =>
  page.evaluate(() => {
    const broken = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement
      if (!el || !el.closest('button, [role=button], a[class*="button" i]')) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue
      for (const match of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange()
        range.setStart(node, match.index)
        range.setEnd(node, match.index + match[0].length)
        if (range.getClientRects().length > 1) broken.push(match[0])
      }
    }
    return broken
  })

const ANNA = 'anna.visser@example.test'
const BRANDT = 'brandt.gym@example.test'
const KOVACS = 'kovacs.hu@example.test'
const KATA = 'kata.kerdes@example.test'
const TITLE = 'Egy weboldal a pékségnek'

async function signIn(browser, { width = 1440, height = 900, mobile = false } = {}) {
  const { context, page } = await newPage(browser, { width, height, mobile, locale: 'en-GB', scheme: 'light' })
  await page.goto(`${BASE}/admin/quotes`, { waitUntil: 'networkidle' })
  await page.getByLabel('E-mail address').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('heading', { name: 'Quote requests' }).waitFor({ timeout: 15000 })
  return { context, page }
}

async function main() {
  if (!MAIL || !EMAIL || !PASSWORD) throw new Error('usage: --mail=<folder> --email=<admin> --password=<password> [--base=...] [--out=<dir>]')
  console.log(`customer ${CW}x${CH}, owner language ${OWNER_LANGUAGE}, parts ${ONLY}`)
  const browser = await launch()
  const mobile = CW < 768
  const state = { refA: '', statusA: '', refB: '', statusB: '', quoteLink: '', newLink: '', requestUrl: '', requestBUrl: '' }

  // ---- A. a package quote request, in the shop ----------------------------------------------------------------------------------
  if (wants('A')) {
    console.log('A  a customer asks for a package quote')
    const { context, page } = await newPage(browser, { width: CW, height: CH, mobile, locale: 'en-GB', scheme: 'light' })
    track(page)
    const errors = []
    page.on('console', (message) => message.type() === 'error' && !/Failed to load resource/.test(message.text()) && errors.push(message.text()))
    page.on('pageerror', (error) => errors.push(String(error)))
    await step('the request builder takes a service, a package, the project and the contact details', async () => {
      await page.goto(`${BASE}/en/services/configure`, { waitUntil: 'networkidle' })
      await page.getByRole('checkbox', { name: /New website/ }).check()
      await page.getByRole('button', { name: 'Next' }).click()
      await page.getByRole('radio', { name: /Launch/ }).check()
      await page.getByRole('button', { name: 'Next' }).click()
      await page.getByRole('button', { name: 'Next' }).click() // no extras
      await page.getByLabel('What is the project, briefly?').fill('A small website for a bakery in Utrecht, with opening hours and a contact form.')
      await page.getByLabel('Budget').fill('around three thousand euro')
      await page.getByRole('button', { name: 'Next' }).click()
      await page.getByRole('button', { name: 'Next' }).click() // review
      await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Anna Visser')
      await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(ANNA)
      await page.getByRole('textbox', { name: 'Company or organisation' }).fill('Visser Bakery')
      const marketing = page.getByRole('checkbox', { name: /hear from you about other news/ })
      expect(!(await marketing.isChecked()), 'the marketing choice starts unticked')
      await page.getByRole('checkbox', { name: /I understand that the details I give/ }).check()
      expect(await NO_SCROLL(page), `no sideways scroll at ${CW} px`)
      await shot(page, `A1-builder-${CW}`)
    })
    await step('it is sent; the screen shows the reference, a private status link and what was sent; nothing overflows', async () => {
      await page.getByRole('button', { name: 'Send quote request' }).click()
      await page.locator('[data-testid="reference"]').waitFor({ timeout: 15000 })
      state.refA = (await page.locator('[data-testid="reference"]').innerText()).trim()
      expect(/^CC-\d{4}-\d{6}$/.test(state.refA), `a reference like CC-2026-000001, got "${state.refA}"`)
      const text = await page.locator('body').innerText()
      for (const part of ['Reference number', 'confirmation email', 'A small website for a bakery', 'No payment is asked for']) expect(text.includes(part), `the receipt shows "${part}"`)
      expect(await NO_SCROLL(page), 'no sideways scroll on the receipt')
      await shot(page, `A2-receipt-${CW}`)
    })
    await step('the customer gets a confirmation in English with the status link and no promise of a time; the owner is told', async () => {
      const confirmation = await waitForMail((m) => m.to.includes(ANNA) && m.subject.includes(state.refA), 'the confirmation')
      expect(confirmation.subject === `We will review your enquiry soon — ${state.refA}`, `subject: ${confirmation.subject}`)
      state.statusA = linkOf(confirmation.text, 'request')
      expect(state.statusA, 'the status link is in the confirmation')
      expect(!/within \d|guarantee/i.test(confirmation.text), 'no promise of an answer time')
      const owner = await waitForMail((m) => m.to.includes('owner@example.test') && m.subject.includes(state.refA), 'the owner notification')
      expect(owner.text.includes(`${BASE}/admin/quotes/`), 'the owner has the link to the request')
    })
    await step('the status page opens from the link and shows only what was shared', async () => {
      await page.goto(state.statusA, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'The status of your request' }).waitFor({ timeout: 8000 })
      const text = await page.locator('body').innerText()
      expect(text.includes(state.refA), 'the reference')
      expect(!/owner@example|admin@|Internal/i.test(text), 'nothing internal')
      expect(await NO_SCROLL(page), 'no sideways scroll on the status page')
    })
    await step('no console error on the customer side', async () => {
      expect(errors.length === 0, errors.join(' | ').slice(0, 300))
    })
    await context.close()
  }

  // ---- B. a FULL EXPERIENCE request ----------------------------------------------------------------------------------------------
  if (wants('B')) {
    console.log('B  a customer sends a FULL EXPERIENCE request')
    const { context, page } = await newPage(browser, { width: CW, height: CH, mobile, locale: 'en-GB', scheme: 'light' })
    track(page)
    await step('the configurator is answered and the review shows the project size as a planning guide', async () => {
      await page.goto(`${BASE}/en/services/full-experience/start`, { waitUntil: 'load' })
      await page.waitForSelector('form h2')
      await page.getByRole('radio', { name: /Web application/ }).check({ force: true })
      await next(page)
      await page.getByRole('radio', { name: /Just an idea/ }).check({ force: true })
      await next(page)
      for (const part of [/Rules and processes behind the scenes/, /Saving and managing information/, /Sign-in for your users/]) await page.getByRole('checkbox', { name: part }).check({ force: true })
      await next(page)
      await page.getByRole('radio', { name: 'Medium' }).check({ force: true })
      await next(page)
      await page.getByRole('radio', { name: /Not sure yet/ }).check({ force: true })
      await next(page)
      await next(page) // timeline skipped
      await page.getByLabel('Project description').fill(`${stamp}: a booking platform for a network of small gyms, built from scratch.`)
      await next(page)
      await page.waitForFunction(() => /How can we reach you/.test(document.querySelector('form h2')?.textContent ?? ''))
      const text = await page.locator('main').innerText()
      expect(/How big the project looks/i.test(text) && /Advanced/i.test(text), 'the size guide is missing')
      expect(await NO_SCROLL(page), `no sideways scroll at ${CW} px`)
    })
    await step('it is sent; the backend accepts it and the customer is told it was received', async () => {
      await page.getByLabel('Your name', { exact: true }).fill('Brandt Gym')
      await page.getByLabel('Your email address', { exact: true }).fill(BRANDT)
      await page.getByRole('checkbox', { name: /I understand that my details are used/ }).check({ force: true })
      const response = page.waitForResponse((r) => r.url().endsWith('/api/quote-requests') && r.request().method() === 'POST')
      await page.locator('form button[type=submit]').click()
      const reply = await response
      expect(reply.status() === 201, `the backend answered ${reply.status()}`)
      state.refB = (await reply.json()).data.reference
      await page.waitForSelector('text=We have your request')
      const confirmation = await waitForMail((m) => m.to.includes(BRANDT) && m.subject.includes(state.refB), 'the confirmation')
      state.statusB = linkOf(confirmation.text, 'request')
      expect(state.statusB, 'a status link')
    })
    await context.close()
  }

  // ---- C. the administrator reviews, and filters by language ----------------------------------------------------------------------
  let admin = null
  if (wants('C') || wants('D') || wants('G') || wants('J') || wants('K') || wants('L')) {
    const session = await signIn(browser)
    admin = session
  }
  const a = admin ? track(admin.page) : null
  if (wants('C')) {
    console.log('C  the administrator reviews the requests')
    await step('a Hungarian request is made through the public API (the form in another language), so the list has two languages', async () => {
      const response = await a.request.post(`${BASE}/api/quote-requests`, {
        data: { form: 'quote', version: 2, language: 'hu', items: [{ need: 'website', plan: 'launch', extras: [] }], description: 'Egy kis weboldal egy pékségnek, nyitvatartással és kapcsolati űrlappal.', objective: 'present', reference: null, timing: 'months', requirements: null, name: 'Kovács Anna', email: KOVACS, phone: null, consent: true },
      })
      expect(response.status() === 201, `the API answered ${response.status()}`)
    })
    await step('the list shows every request, and the language filter narrows it to one language and back', async () => {
      await a.goto(`${BASE}/admin/quotes`, { waitUntil: 'networkidle' })
      await a.getByText('Quotations sent', { exact: true }).first().waitFor({ timeout: 8000 })
      let text = await a.locator('main').innerText()
      expect(text.includes(state.refA) || text.includes('Anna Visser'), 'the English request is listed')
      expect(text.includes('Kovács Anna') && text.includes('Brandt Gym'), 'all three are listed')
      await a.getByLabel('Language', { exact: true }).first().selectOption('hu')
      await a.waitForURL(/language=hu/, { timeout: 8000 })
      await a.getByText('Kovács Anna').first().waitFor({ timeout: 8000 })
      await a.waitForFunction(() => !document.querySelector('main')?.innerText.includes('Anna Visser'), null, { timeout: 8000 }).catch(() => undefined) // the list reloads beside the filter
      text = await a.locator('main').innerText()
      expect(!text.includes('Anna Visser') && !text.includes('Brandt Gym'), 'the English requests are filtered out')
      await a.getByLabel('Language', { exact: true }).first().selectOption('en')
      await a.waitForURL(/language=en/, { timeout: 8000 })
      await a.getByText('Brandt Gym').first().waitFor({ timeout: 8000 })
      await a.waitForFunction(() => !document.querySelector('main')?.innerText.includes('Kovács Anna'), null, { timeout: 8000 }).catch(() => undefined)
      text = await a.locator('main').innerText()
      expect(text.includes('Anna Visser') && !text.includes('Kovács Anna'), 'only the English requests remain')
      await shot(a, 'C1-filter-en')
      await a.getByLabel('Language', { exact: true }).first().selectOption('')
    })
    await step('the package request opens with everything the quotation needs, and its priority is changed and recorded', async () => {
      await a.goto(`${BASE}/admin/quotes`, { waitUntil: 'networkidle' })
      await a.getByRole('link', { name: /Anna Visser/ }).first().click()
      await a.getByRole('heading', { name: 'Anna Visser' }).waitFor({ timeout: 8000 })
      state.requestUrl = a.url()
      const text = await a.locator('main').innerText()
      for (const part of ['Package-based quote request', 'Shop', 'Visser Bakery', 'around three thousand euro', 'Quotations', 'E-mails about this request', 'History', 'Request created']) expect(text.includes(part), `the detail shows "${part}"`)
      await a.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('high')
      await a.getByText('Priority saved.').first().waitFor({ timeout: 8000 })
    })
  }

  // ---- D. the quotation: written in Hungarian, previewed, sent -------------------------------------------------------------------
  if (wants('D')) {
    console.log('D  the administrator writes the quotation')
    await step('a quotation is started; its language is set to Hungarian; the draft is saved', async () => {
      if (!state.requestUrl) {
        await a.goto(`${BASE}/admin/quotes`, { waitUntil: 'networkidle' })
        await a.getByRole('link', { name: /Anna Visser/ }).first().click()
        await a.getByRole('heading', { name: 'Anna Visser' }).waitFor({ timeout: 8000 })
        state.requestUrl = a.url()
      }
      await a.getByRole('link', { name: 'Create a quotation' }).first().click()
      await a.getByRole('button', { name: 'Create a quotation' }).click()
      await a.getByRole('heading', { name: /Quotation · Version 1/ }).waitFor({ timeout: 10000 })
      await a.getByLabel('Language of the quotation and its e-mails').selectOption('hu')
      await a.getByLabel('Project title').fill(TITLE)
      await a.getByLabel('Valid until').fill(futureDay(45))
      await a.getByLabel('Scope of work').fill('Öt oldal, egy kapcsolati űrlap és az élesítés.')
      await a.getByLabel('Terms and conditions').fill('Ennek az ajánlatnak a feltételei.')
      await a.getByLabel('Currency').selectOption('EUR')
      await a.getByRole('button', { name: 'Add a line' }).click()
      await a.getByLabel('Description').nth(0).fill('Tervezés')
      await a.getByLabel(/Unit price/).nth(0).fill('1500.50')
      await a.getByRole('button', { name: 'Add a line' }).click()
      await a.getByLabel('Description').nth(1).fill('Építés')
      await a.getByLabel('Qty').nth(1).fill('2')
      await a.getByLabel(/Unit price/).nth(1).fill('800')
      await a.getByLabel('Tax treatment').selectOption('excluded')
      await a.getByRole('button', { name: 'Save the draft' }).click()
      await a.getByText('The draft was saved.').first().waitFor({ timeout: 8000 })
      const text = plain(await a.locator('main').innerText())
      expect(/3100,50/.test(text), 'the total is 3100,50 (1500.50 + 2 × 800), written the Hungarian way')
      expect(!/VAT \(/.test(text), 'no VAT figure without a confirmed rate')
    })
    await step('the preview shows the saved quotation as the customer will read it, says what language it is in, and warns about unsaved changes', async () => {
      const preview = a.getByRole('region').filter({ hasText: 'Preview' }).first()
      const articleText = plain(await a.locator('article[lang="hu"]').innerText())
      for (const part of [TITLE, 'Öt oldal, egy kapcsolati űrlap és az élesítés.', 'Tervezés', 'Építés', '3100,50']) expect(articleText.includes(part), `the preview shows "${part}"`)
      expect(/Valid until \d{4}-\d{2}-\d{2}/.test(articleText), 'the last day is in the preview')
      expect((await a.locator('main').innerText()).includes('in Hungarian'), 'the help names the language of the quotation')
      void preview
      expect(!(await a.getByText(/changes that are not saved/).count()), 'no warning while everything is saved')
      await a.getByLabel('Project title').fill(`${TITLE} (v1)`)
      await a.getByText(/changes that are not saved/).first().waitFor({ timeout: 4000 })
      expect((await a.locator('article[lang="hu"]').innerText()).includes(TITLE) && !(await a.locator('article[lang="hu"]').innerText()).includes('(v1)'), 'the preview still shows the saved version')
      await a.getByLabel('Project title').fill(TITLE)
      await a.getByRole('button', { name: 'Save the draft' }).click()
      await a.getByText('The draft was saved.').first().waitFor({ timeout: 8000 })
      await shot(a, 'D1-editor-preview')
    })
    await step('it is sent after a confirmation; the e-mail is in Hungarian with a Hungarian link', async () => {
      await a.getByRole('button', { name: 'Send to the customer' }).click()
      await a.getByRole('dialog').getByRole('button', { name: 'Send to the customer' }).click()
      await a.getByText('Sent').first().waitFor({ timeout: 10000 })
      const mail = await waitForMail((m) => m.to.includes(ANNA) && /^Ajánlatod:/.test(m.subject), 'the quotation e-mail in Hungarian')
      state.quoteLink = linkOf(mail.text, 'quote')
      expect(state.quoteLink.includes('/hu/quote/'), `the link goes to the Hungarian page: ${state.quoteLink.slice(0, 60)}`)
      expect(plain(mail.text).includes('3100,50') && mail.text.includes(TITLE), 'the price and the title are in it')
      expect(!/<img|src=/i.test(mail.html), 'no external image')
    })
  }

  // ---- E, F, H. the customer ------------------------------------------------------------------------------------------------------
  let customer = null
  if (wants('E') || wants('F') || wants('H')) {
    customer = await newPage(browser, { width: CW, height: CH, mobile, locale: 'hu-HU', scheme: 'light' })
  }
  if (wants('E')) {
    console.log('E  the customer opens the secure link')
    const page = track(customer.page)
    await step('the secure link shows the whole offer in Hungarian, and opening it accepted nothing', async () => {
      await page.goto(state.quoteLink, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: TITLE }).waitFor({ timeout: 10000 })
      const text = plain(await page.locator('body').innerText())
      for (const part of ['Tervezés', 'Építés', '3100,50', 'Ennek az ajánlatnak a feltételei.']) expect(text.includes(part), `the offer shows "${part}"`)
      expect(await page.getByRole('button', { name: 'Elfogadom az ajánlatot' }).isVisible(), 'the accept button is on the page')
      expect(await NO_SCROLL(page), `no sideways scroll at ${CW} px`)
      const broken = await brokenWords(page)
      expect(broken.length === 0, `a word is broken in the middle on a button at ${CW} px: ${broken.join(', ')}`)
      await shot(page, `E1-customer-offer-${CW}`)
    })
  }

  // ---- F. the customer asks for a change ------------------------------------------------------------------------------------------
  if (wants('F')) {
    console.log('F  the customer asks for a change')
    const page = track(customer.page)
    await step('a message is required, then sent; the page says it arrived and the offer is unchanged', async () => {
      await page.getByRole('button', { name: 'Kérdésem vagy módosítási kérésem van' }).click()
      expect((await brokenWords(page)).length === 0, 'a word is broken in the middle on the change-request panel')
      await page.getByRole('button', { name: 'Üzenet küldése' }).click()
      await page.getByText('Írj néhány szót').first().waitFor({ timeout: 5000 })
      await page.getByLabel('Az üzeneted').fill('Lehetne rövidebb a határidő, és három részletben fizethetnénk? <b>Köszönöm</b>')
      await page.getByRole('button', { name: 'Üzenet küldése' }).click()
      await page.getByText('Az üzeneted megérkezett').first().waitFor({ timeout: 10000 })
      await shot(page, `F1-customer-asked-${CW}`)
    })
    await step('the customer gets a receipt in Hungarian, with what they wrote escaped, nothing promised, and a link to the same offer', async () => {
      const receipt = await waitForMail((m) => m.to.includes(ANNA) && /^Megkaptuk a módosítási kérésedet/.test(m.subject), 'the receipt')
      expect(receipt.subject.includes(state.refA), 'the reference is in the subject')
      expect(receipt.text.includes('nem jelent sem elfogadást, sem elutasítást'), 'it says nothing was accepted or declined')
      expect(receipt.text.includes('Lehetne rövidebb a határidő'), 'what they wrote is in it')
      expect(receipt.html.includes('&lt;b&gt;') && !receipt.html.includes('<b>Köszönöm'), 'what they typed is text, not markup')
      expect(!/\d+ órán belül|garant|fizetve|paid/i.test(receipt.text), 'no deadline, no guarantee, no claim of payment')
      expect(receipt.replyTo.includes('hello@example.test') && !receipt.replyTo.includes('owner@'), 'replies go to the public address')
      expect(linkOf(receipt.text, 'quote').includes('/hu/quote/'), 'a link back to the offer')
      await sleep(1200)
      expect(mails().filter((m) => m.to.includes(ANNA) && /^Megkaptuk a módosítási kérésedet/.test(m.subject)).length === 1, 'exactly one receipt')
    })
    await step('the owner is told about the change request, in the owner\'s language', async () => {
      const owner = await waitForMail((m) => m.to.includes('owner@example.test') && m.subject.includes(state.refA) && /módosítást kért|asked for clarification|om toelichting/i.test(m.subject), 'the owner notice')
      expect(owner.text.includes('Lehetne rövidebb a határidő'), 'the message is in it')
    })
  }

  // ---- G. the administrator sees it and sends a new version -----------------------------------------------------------------------
  if (wants('G')) {
    console.log('G  the administrator sends a new version')
    track(a)
    await step('the request shows the question, the history says the customer asked, and the request is back under review', async () => {
      await a.goto(state.requestUrl, { waitUntil: 'networkidle' })
      await a.getByRole('heading', { name: 'Anna Visser' }).waitFor({ timeout: 8000 })
      const text = await a.locator('main').innerText()
      expect(text.includes('Lehetne rövidebb a határidő'), 'the question is shown')
      expect(text.includes('Customer asked for a change'), 'the history has it')
      expect(text.includes('Receipt for a change request (to the customer)'), 'the receipt is among the e-mails')
    })
    await step('a new version is made with a reason, its price is changed, and it is sent', async () => {
      await a.getByRole('button', { name: 'New version' }).first().click()
      await a.getByLabel('Why is it being revised?').fill('Három részletben fizethető, rövidebb határidő.')
      await a.getByRole('button', { name: 'Make a new version' }).click()
      await a.getByRole('heading', { name: /Quotation · Version 2/ }).waitFor({ timeout: 10000 })
      // A new version starts with no last day: the administrator chooses one for the new offer.
      expect(await a.getByText('Set a valid-until date in the future.').count() === 1, 'a new version asks for its own last day')
      await a.getByLabel('Valid until').fill(futureDay(30))
      await a.getByLabel(/Unit price/).nth(1).fill('700')
      await a.getByLabel('Payment terms').fill('Három részletben: 30 %, 40 %, 30 %.')
      await a.getByRole('button', { name: 'Save the draft' }).click()
      await a.getByText('The draft was saved.').first().waitFor({ timeout: 8000 })
      expect(plain(await a.locator('main').innerText()).includes('2900,50'), 'the new total is 2900,50 (1500.50 + 2 × 700)')
      await a.getByRole('button', { name: 'Send to the customer' }).click()
      await a.getByRole('dialog').getByRole('button', { name: 'Send to the customer' }).click()
      const mail = await waitForMail((m) => m.to.includes(ANNA) && /^Módosított ajánlat:/.test(m.subject), 'the revised quotation e-mail in Hungarian')
      state.newLink = linkOf(mail.text, 'quote')
      expect(state.newLink && state.newLink !== state.quoteLink, 'a new link')
      expect(plain(mail.text).includes('2900,50'), 'the new price is in it')
    })
  }

  // ---- H. the old link is dead; the customer accepts the final version ----------------------------------------------------------------
  if (wants('H')) {
    console.log('H  the customer accepts the final version')
    const page = track(customer.page)
    await step('the link of the first version says it no longer works and offers no button', async () => {
      await page.goto(state.quoteLink, { waitUntil: 'networkidle' })
      await page.getByText('Ez a link már nem használható').first().waitFor({ timeout: 10000 })
      expect((await page.getByRole('button', { name: 'Elfogadom az ajánlatot' }).count()) === 0, 'no accept button on a replaced version')
    })
    await step('the new version is read, and accepting needs an explicit confirmation before it is recorded', async () => {
      await page.goto(state.newLink, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: TITLE }).waitFor({ timeout: 10000 })
      const text = plain(await page.locator('body').innerText())
      expect(text.includes('2900,50') && text.includes('Három részletben: 30 %, 40 %, 30 %.'), 'the second version is shown')
      expect(await NO_SCROLL(page), 'no sideways scroll on the second version')
      await page.getByRole('button', { name: 'Elfogadom az ajánlatot' }).click()
      expect((await brokenWords(page)).length === 0, 'a word is broken in the middle on the acceptance panel')
      await page.getByRole('button', { name: 'Elfogadás megerősítése' }).click()
      await page.getByText('A folytatáshoz jelöld be a négyzetet.').first().waitFor({ timeout: 5000 })
      await page.getByRole('checkbox', { name: /Elolvastam az ajánlatot és a feltételeket/ }).check()
      await page.getByRole('button', { name: 'Elfogadás megerősítése' }).click()
      await page.getByText('Rögzítettük az elfogadást').first().waitFor({ timeout: 10000 })
      await shot(page, `H1-customer-accepted-${CW}`)
    })
    await step('the link now shows a record of the acceptance with no way to act, and a reload changes nothing', async () => {
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByText(/Ezt az ajánlatot elfogadtad ekkor/).first().waitFor({ timeout: 8000 })
      expect((await page.getByRole('button', { name: 'Elfogadom az ajánlatot' }).count()) === 0, 'no accept button any more')
    })
  }

  // ---- I. both sides told, once, in the right language -------------------------------------------------------------------------------
  if (wants('I')) {
    console.log('I  both sides are told once, in the right language')
    await step('the customer has the confirmation in Hungarian (no payment claimed) and the owner has theirs in the owner\'s language, once each', async () => {
      const customerMail = await waitForMail((m) => m.to.includes(ANNA) && /^Elfogadtad az ajánlatot/.test(m.subject), 'the acceptance confirmation')
      expect(customerMail.text.includes('nem kértünk, és nem is kaptunk fizetést'), 'it says no payment was requested or received')
      expect(!/fizetés (megérkezett|visszaigazolva)|paid/i.test(customerMail.text), 'no claim of payment')
      const ownerSubject = { hu: /^Ajánlat elfogadva:/, en: /^Quote accepted:/, nl: /^Offerte geaccepteerd:/ }[OWNER_LANGUAGE]
      const owner = await waitForMail((m) => m.to.includes('owner@example.test') && ownerSubject.test(m.subject) && m.subject.includes(state.refA), `the owner's acceptance notice in ${OWNER_LANGUAGE}`)
      expect(owner.text.includes(`${BASE}/admin/quotes/`), 'the owner has the link to the request')
      await sleep(1500)
      expect(mails().filter((m) => m.to.includes(ANNA) && /^Elfogadtad az ajánlatot/.test(m.subject)).length === 1, 'exactly one confirmation to the customer')
      expect(mails().filter((m) => m.to.includes('owner@example.test') && ownerSubject.test(m.subject) && m.subject.includes(state.refA)).length === 1, 'exactly one notice to the owner')
    })
  }

  // ---- J. the administrator sees the final state ----------------------------------------------------------------------------------------
  if (wants('J')) {
    console.log('J  the administrator sees the final status')
    track(a)
    await step('the request is Accepted (not started); the history shows both versions, the question and the acceptance with their actors; nothing is "delivered" without a provider', async () => {
      await a.goto(state.requestUrl, { waitUntil: 'networkidle' })
      await a.getByRole('heading', { name: 'Anna Visser' }).waitFor({ timeout: 8000 })
      const text = await a.locator('main').innerText()
      expect(/Accepted/.test(text) && !/In progress/.test((text.split('History')[0] || '').split('Status')[0] || ''), 'the request is Accepted')
      for (const part of ['Quotation accepted', 'Quotation sent', 'Customer asked for a change', 'Version replaced', 'Customer', EMAIL, 'Acceptance (to you)', 'Acceptance (to the customer)', 'Receipt for a change request (to the customer)']) expect(text.includes(part), `the page shows "${part}"`)
      expect(!/Delivered/.test(text.replace(/"Delivered" appears only when the provider confirmed it\./, '')), 'nothing is called delivered without a provider confirmation')
      await shot(a, 'J1-admin-accepted')
    })
    await step('the next status the administrator may choose is "In progress"; the sent versions are read only', async () => {
      const options = await a.getByLabel('Change the status').locator('option').allInnerTexts()
      expect(options.includes('In progress') && !options.includes('Quotation sent'), `status choices: ${options.join(', ')}`)
      await a.getByRole('link', { name: 'View', exact: true }).first().click()
      await a.getByRole('heading', { name: /Quotation · Version/ }).waitFor({ timeout: 8000 })
      expect((await a.getByRole('button', { name: 'Save the draft' }).count()) === 0, 'no save button on a sent version')
      expect(await a.locator('article[lang="hu"]').count() === 1, 'a sent version has its preview too')
    })
  }

  // ---- K. the administrator ends a customer's links -------------------------------------------------------------------------------------
  if (wants('K')) {
    console.log('K  the administrator ends a customer\'s links')
    track(a)
    await step('the FULL EXPERIENCE customer\'s status link works, then stops working when the administrator ends the links', async () => {
      const probe = await browser.newContext()
      const check = async () => (await probe.request.get(state.statusB.replace('/en/request/', '/api/customer/requests/'))).status()
      expect((await check()) === 200, 'the status link works first')
      await a.goto(`${BASE}/admin/quotes`, { waitUntil: 'networkidle' })
      await a.getByRole('link', { name: /Brandt Gym/ }).first().click()
      await a.getByRole('heading', { name: 'Brandt Gym' }).waitFor({ timeout: 8000 })
      state.requestBUrl = a.url()
      await a.getByRole('button', { name: 'End the customer’s links' }).click()
      await a.getByRole('dialog').getByRole('button', { name: /End the customer’s links|Confirm|OK/ }).first().click()
      await a.getByText(/link\(s\) ended\./).first().waitFor({ timeout: 8000 })
      expect((await check()) === 410, 'the status link is gone (410)')
      await a.getByText('Link ended').first().waitFor({ timeout: 8000 })
      const line = await a.locator('li', { hasText: 'Link ended' }).first().innerText()
      expect(line.includes(EMAIL), `the history line names the administrator who ended the links: ${line.replace(/\s+/g, ' ')}`)
      await probe.close()
    })
    await step('the customer\'s page says the link no longer works, without telling anything else', async () => {
      const { context, page } = await newPage(browser, { width: CW, height: CH, mobile, locale: 'en-GB', scheme: 'light' })
      await page.goto(state.statusB, { waitUntil: 'networkidle' })
      await page.getByText('This link no longer works').first().waitFor({ timeout: 10000 })
      expect(!/Brandt|owner@|admin@/.test(await page.locator('body').innerText()), 'nothing about the request leaks')
      expect(await NO_SCROLL(page), 'no sideways scroll')
      await context.close()
    })
    await step('doing it again ends nothing and says so', async () => {
      await a.getByRole('button', { name: 'End the customer’s links' }).click()
      await a.getByRole('dialog').getByRole('button', { name: /End the customer’s links|Confirm|OK/ }).first().click()
      await a.getByText('There was no link left to end.').first().waitFor({ timeout: 8000 })
    })
  }

  // ---- L. a contact message becomes a quote request, once -----------------------------------------------------------------------------------
  if (wants('L')) {
    console.log('L  a contact message becomes a quote request')
    const visitor = await newPage(browser, { width: CW, height: CH, mobile, locale: 'en-GB', scheme: 'light' })
    await step('a visitor sends a message about a project through the contact form', async () => {
      await visitor.page.goto(`${BASE}/en/contact/`, { waitUntil: 'networkidle' })
      await visitor.page.getByLabel('Your name', { exact: true }).fill('Kata Kérdés')
      await visitor.page.getByLabel('Email address').fill(KATA)
      await visitor.page.getByLabel('Subject').fill(`A project ${stamp}`)
      await visitor.page.locator('main textarea').fill('Hello, I would like to ask for a quote for a webshop for my pottery studio. Can we talk about it?')
      await visitor.page.getByRole('radio', { name: /project/i }).first().check({ force: true })
      await visitor.page.locator('main input[type=checkbox]').check({ force: true })
      const response = visitor.page.waitForResponse((r) => r.url().includes('/api/contact') && r.request().method() === 'POST')
      await visitor.page.getByRole('button', { name: /Send message/ }).click()
      const reply = await response
      expect(reply.status() === 200 || reply.status() === 201, `API answered ${reply.status()}`)
    })
    await visitor.context.close()
    track(a)
    await step('the administrator makes a quote request from the message: it is prefilled, linked, and nobody is e-mailed', async () => {
      await a.goto(`${BASE}/admin/inquiries`, { waitUntil: 'networkidle' })
      await a.getByRole('link', { name: new RegExp(`A project ${stamp}`) }).first().click()
      await a.getByRole('heading', { name: new RegExp(`A project ${stamp}`) }).waitFor({ timeout: 8000 })
      const inquiryUrl = a.url()
      await a.getByRole('button', { name: 'Create a quote request from this message' }).click()
      await a.getByRole('dialog').getByRole('button', { name: 'Make the request' }).click()
      await a.getByRole('heading', { name: 'Kata Kérdés' }).waitFor({ timeout: 10000 })
      const text = await a.locator('main').innerText()
      expect(text.includes('Contact form') && text.includes('webshop for my pottery studio'), 'the request has the message and its source')
      expect(!mails().some((m) => m.to.includes(KATA)), 'the customer was not e-mailed about a request they did not send')
      await shot(a, 'L1-request-from-message')
      await a.goto(inquiryUrl, { waitUntil: 'networkidle' })
      await a.getByRole('heading', { name: new RegExp(`A project ${stamp}`) }).waitFor({ timeout: 8000 })
      expect((await a.getByRole('button', { name: 'Create a quote request from this message' }).count()) === 0, 'the button is gone once the message has a request')
      expect((await a.locator('main').innerText()).includes('CC-'), 'the request is listed with the message')
    })
  }

  if (admin) await admin.context.close()
  if (customer) await customer.context.close()

  // ---- M. the new screens on a phone and a tablet ------------------------------------------------------------------------------------------
  if (wants('M')) {
    console.log('M  the administration on a phone and a tablet')
    for (const [width, height, isMobile] of [[390, 844, true], [768, 1024, false]]) {
      const session = await signIn(browser, { width, height, mobile: isMobile })
      track(session.page)
      await step(`${width} px: the list with its language filter, the request, the editor with its preview and the message page do not scroll sideways`, async () => {
        const p = session.page
        await p.goto(`${BASE}/admin/quotes?language=en`, { waitUntil: 'networkidle' })
        await p.getByLabel('Language', { exact: true }).first().waitFor({ timeout: 8000 })
        expect(await NO_SCROLL(p), 'the list')
        await p.getByRole('link', { name: /Anna Visser/ }).first().click()
        await p.getByRole('heading', { name: 'Anna Visser' }).waitFor({ timeout: 8000 })
        expect(await NO_SCROLL(p), 'the request')
        await shot(p, `M1-request-${width}`)
        await p.getByRole('link', { name: 'View', exact: true }).first().click()
        await p.getByRole('heading', { name: /Quotation · Version/ }).waitFor({ timeout: 8000 })
        expect(await NO_SCROLL(p), 'the editor with its preview')
        await shot(p, `M2-editor-${width}`)
        await p.goto(`${BASE}/admin/inquiries`, { waitUntil: 'networkidle' })
        await p.getByRole('link', { name: new RegExp(`A project ${stamp}`) }).first().click()
        await p.getByRole('heading', { name: new RegExp(`A project ${stamp}`) }).waitFor({ timeout: 8000 })
        expect(await NO_SCROLL(p), 'the message page')
      })
      await session.context.close()
    }
  }

  await browser.close()
  console.log(`\n${passed} step(s) passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(2)
})
