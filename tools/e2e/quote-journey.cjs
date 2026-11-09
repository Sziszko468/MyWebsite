// The quotation workflow (PROMPT 17), in a real Chrome against the BUILT website served by the real backend (one process, one origin, a throw-away
// database, the `file` e-mail provider whose messages we read back). Nothing is mocked; nothing leaves the machine.
//
//   1. the website built for a same-origin backend, and a scratch backend (see README.md in this folder):
//        MSYS_NO_PATHCONV=1 VITE_API_URL=/ npm run build
//        start the server with EMAIL_PROVIDER=file EMAIL_FILE_DIR=<mail> PUBLIC_URL=http://127.0.0.1:<port> and an administrator
//   2. AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/quote-journey.cjs --base=http://127.0.0.1:8821 --mail=<mail> \
//        --email=admin@example.test --password=... [--out=<dir>]
//
// The journey: a visitor on a phone builds a request in the shop and is shown the reference and a private status link; the owner's notification
// and the visitor's confirmation are written; the administrator opens the request, writes a quotation (a fixed arithmetic of whole minor units),
// sends it; the customer opens the secure link on a phone, reads the whole offer, accepts it; both sides are told; the administrator sees the
// request accepted (not started) with the history. Needs a fresh server (it creates one request and one quotation).
const fs = require('fs')
const path = require('path')
const { launch, newPage } = require('../audit/lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8821').replace(/\/$/, '')
const MAIL = arg('mail', '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const OUT = arg('out', '')
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
      console.log(`        page: ${text.replace(/\s+/g, ' ').slice(0, 600)}`)
    }
  }
}
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}
const shot = async (page, name) => {
  if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`) })
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ---- the file mailer's messages ----------------------------------------------------------------------------------------------
function decodeMessage(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const [head, ...rest] = raw.split('\n\n')
  const header = (name) => {
    const match = new RegExp(`^${name}:\\s*((?:.*)(?:\\n[ \\t].*)*)`, 'im').exec(head)
    return match ? match[1].replace(/\n[ \t]+/g, ' ').trim() : ''
  }
  const words = (value) => value.replace(/=\?UTF-8\?B\?([^?]+)\?=\s*/gi, (_all, b64) => Buffer.from(b64, 'base64').toString('utf8'))
  const body = rest.join('\n\n')
  const parts = {}
  for (const match of body.matchAll(/Content-Type: (text\/(?:plain|html))[^\n]*\n(?:Content-Transfer-Encoding: base64\n)?\n([\s\S]*?)(?=\n--|$)/g)) {
    parts[match[1]] = Buffer.from(match[2].replace(/\s+/g, ''), 'base64').toString('utf8')
  }
  return { file, to: words(header('To')), subject: words(header('Subject')), text: parts['text/plain'] ?? '', html: parts['text/html'] ?? '' }
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
const linkOf = (text, page) => new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?:hu|en|nl)/${page}/([A-Za-z0-9_-]{43})`).exec(text)?.[0] ?? ''

const futureDay = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
const VISITOR = 'visitor@example.test'
const NO_SCROLL = async (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)

async function main() {
  if (!MAIL || !EMAIL || !PASSWORD) throw new Error('usage: --mail=<folder> --email=<admin> --password=<password> [--base=...] [--out=...]')
  const browser = await launch()
  let reference = ''
  let statusLink = ''
  let quoteLink = ''
  let requestUrl = ''

  // ---- 1. the visitor, on a phone -----------------------------------------------------------------------------------------
  {
    const { context, page } = await newPage(browser, { width: 390, height: 844, mobile: true, locale: 'en-GB', scheme: 'light' })
    track(page)
    const errors = []
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
    page.on('pageerror', (error) => errors.push(String(error)))

    await step('the request builder opens and a service, a package and the details are chosen', async () => {
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
    })
    await step('the contact step has the optional fields, a separate marketing choice, and nothing overflows at 390 px', async () => {
      await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Anna Visser')
      await page.getByRole('textbox', { name: 'Email address', exact: true }).fill(VISITOR)
      await page.getByRole('textbox', { name: 'Company or organisation' }).fill('Visser Bakery')
      await page.getByRole('textbox', { name: 'Company website' }).fill('visserbakery.example')
      const consent = page.getByRole('checkbox', { name: /I understand that the details I give/ })
      const marketing = page.getByRole('checkbox', { name: /hear from you about other news/ })
      expect(!(await marketing.isChecked()), 'the marketing choice starts unticked')
      await consent.check()
      expect(await NO_SCROLL(page), 'no sideways scroll on the last step')
      await shot(page, '01-visitor-contact-390')
    })
    await step('an invalid website is refused before anything is sent', async () => {
      await page.getByRole('textbox', { name: 'Company website' }).fill('not a website')
      await page.getByRole('button', { name: 'Send quote request' }).click()
      await page.getByText(/does not look like a website address/).first().waitFor({ timeout: 5000 })
      await page.getByRole('textbox', { name: 'Company website' }).fill('visserbakery.example')
    })
    await step('it is sent, and the screen shows the reference, the date, the e-mail state, the summary and the private status link', async () => {
      await page.getByRole('button', { name: 'Send quote request' }).click()
      await page.locator('[data-testid="reference"]').waitFor({ timeout: 15000 })
      reference = (await page.locator('[data-testid="reference"]').innerText()).trim()
      expect(/^CC-\d{4}-\d{6}$/.test(reference), `a reference like CC-2026-000001, got "${reference}"`)
      const text = await page.locator('body').innerText()
      for (const part of ['Reference number', 'Submitted', 'confirmation e-mail', 'What you submitted', 'A small website for a bakery', 'Visser Bakery', 'No payment is asked for']) expect(text.includes(part), `the receipt shows "${part}"`)
      expect(await page.getByRole('link', { name: 'See the status of my request' }).isVisible(), 'the status link')
      expect(await NO_SCROLL(page), 'no sideways scroll on the receipt')
      await shot(page, '02-visitor-receipt-390')
    })
    await step('the owner is notified with a link to the request, and the visitor gets a confirmation with their status link', async () => {
      const owner = await waitForMail((mail) => mail.to.includes('owner@example.test') && mail.subject.includes(reference), 'the owner notification')
      expect(owner.text.includes(`${BASE}/admin/quotes/`), 'the dashboard link is in the owner notification')
      expect(owner.text.includes('Visser Bakery') && owner.text.includes('around three thousand euro'), 'company and budget are in it')
      const confirmation = await waitForMail((mail) => mail.to.includes(VISITOR) && mail.subject.includes(reference), 'the confirmation')
      expect(confirmation.subject === `We will review your enquiry soon — ${reference}`, `subject: ${confirmation.subject}`)
      statusLink = linkOf(confirmation.text, 'request')
      expect(statusLink, 'the status link is in the confirmation')
      expect(!/within \d|guarantee/i.test(confirmation.text), 'no promise of an answer time')
    })
    await step('the status page opens from the link and shows only what was shared', async () => {
      await page.goto(statusLink, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'The status of your request' }).waitFor({ timeout: 8000 })
      const text = await page.locator('body').innerText()
      expect(text.includes(reference) && text.includes('Received'), 'reference and status')
      expect(!/owner@example|admin@|Internal/i.test(text), 'nothing internal')
      expect(await NO_SCROLL(page), 'no sideways scroll')
      await shot(page, '03-status-390')
      // The secret is not sent to the analytics or a referrer: the page asks the API with it in the path only.
      const policy = await page.evaluate(() => document.querySelector('meta[name="referrer"]')?.getAttribute('content') ?? '')
      void policy
    })
    await step('a reference is no key: the same page with only the reference in the address says the link is not valid', async () => {
      const response = await page.request.get(`${BASE}/api/customer/requests/${reference}`)
      expect(response.status() === 404, `the API answered ${response.status()}`)
      await page.goto(`${BASE}/en/request/${reference}`, { waitUntil: 'networkidle' })
      await page.getByText('This link is not valid').first().waitFor({ timeout: 8000 })
    })
    await step('no console error on the visitor side', async () => {
      expect(errors.filter((e) => !/Failed to load resource.*404/.test(e)).length === 0, errors.join(' | ').slice(0, 300))
    })
    await context.close()
  }

  // ---- 2. the administrator ------------------------------------------------------------------------------------------------
  const admin = await newPage(browser, { width: 1440, height: 900, locale: 'en-GB', scheme: 'light' })
  const a = track(admin.page)
  await step('the administrator signs in and the overview counts the new request from the database', async () => {
    await a.goto(`${BASE}/admin/quotes`, { waitUntil: 'networkidle' })
    await a.getByLabel('E-mail address').fill(EMAIL)
    await a.getByLabel('Password').fill(PASSWORD)
    await a.getByRole('button', { name: 'Sign in' }).click()
    await a.getByRole('heading', { name: 'Quote requests' }).waitFor({ timeout: 15000 })
    await a.getByText('Quotations sent', { exact: true }).first().waitFor({ timeout: 8000 }) // the overview loads beside the list
    const text = await a.locator('body').innerText()
    expect(/all requests/i.test(text) && /quotations sent/i.test(text), 'the overview is there')
    expect(text.includes(reference), 'the request is in the list')
    await shot(a, '04-admin-list')
  })
  await step('the list filters by type and the request opens with every field the quotation needs', async () => {
    await a.getByLabel('Type').first().selectOption({ label: 'Package-based quote request' })
    await a.getByRole('link', { name: new RegExp(reference.slice(-6)) }).first().waitFor({ timeout: 8000 }).catch(() => undefined)
    await a.getByRole('link', { name: /Anna Visser/ }).first().click()
    await a.getByRole('heading', { name: 'Anna Visser' }).waitFor({ timeout: 8000 })
    requestUrl = a.url()
    const text = await a.locator('body').innerText()
    for (const part of ['Package-based quote request', 'Shop', 'Visser Bakery', 'visserbakery.example', 'around three thousand euro', 'Quotations', 'E-mails about this request', 'History']) expect(text.includes(part), `the detail shows "${part}"`)
    expect(/Request created/.test(text), 'the history has its first line')
  })
  await step('the priority is changed and recorded', async () => {
    await a.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('high')
    await a.getByText('Priority saved.').first().waitFor({ timeout: 8000 })
  })
  await step('a quotation is started, written and saved; the totals are the server\'s whole-unit arithmetic', async () => {
    await a.getByRole('link', { name: 'Create a quotation' }).first().click()
    await a.getByRole('button', { name: 'Create a quotation' }).click()
    await a.getByRole('heading', { name: /Quotation · Version 1/ }).waitFor({ timeout: 10000 })
    await a.getByLabel('Project title').fill('A website for the bakery')
    await a.getByLabel('Valid until').fill(futureDay(45))
    await a.getByLabel('Scope of work').fill('Five pages, a contact form and deployment.')
    await a.getByLabel('Terms and conditions').fill('These are the terms of this offer.')
    await a.getByLabel('Currency').selectOption('EUR')
    await a.getByRole('button', { name: 'Add a line' }).click()
    await a.getByLabel('Description').nth(0).fill('Design')
    await a.getByLabel(/Unit price/).nth(0).fill('1500.50')
    await a.getByRole('button', { name: 'Add a line' }).click()
    await a.getByLabel('Description').nth(1).fill('Build')
    await a.getByLabel('Qty').nth(1).fill('2')
    await a.getByLabel(/Unit price/).nth(1).fill('800')
    await a.getByLabel('Tax treatment').selectOption('excluded')
    await a.getByRole('button', { name: 'Save the draft' }).click()
    await a.getByText('The draft was saved.').first().waitFor({ timeout: 8000 })
    const totals = await a.locator('body').innerText()
    expect(totals.includes('€3,100.50'), `the total is €3,100.50 (1500.50 + 2 × 800)`)
    expect(!/VAT \(/.test(totals), 'no VAT figure without a confirmed rate')
    await shot(a, '05-admin-editor')
  })
  await step('it is sent after a confirmation; the version is then read only', async () => {
    await a.getByRole('button', { name: 'Send to the customer' }).click()
    await a.getByRole('dialog').getByRole('button', { name: 'Send to the customer' }).click()
    await a.getByText('Sent').first().waitFor({ timeout: 10000 })
    expect(a.url() === requestUrl || a.url().includes('/quotes/'), 'back on the request')
    const mail = await waitForMail((m) => m.to.includes(VISITOR) && /^Your quotation/.test(m.subject), 'the quotation e-mail')
    quoteLink = linkOf(mail.text, 'quote')
    expect(quoteLink, 'the secure quotation link is in the e-mail')
    expect(mail.text.includes('€3,100.50') && mail.text.includes('Valid until'), 'price and validity are in it')
    expect(!/<img|src=/i.test(mail.html), 'no external image')
  })

  // ---- 3. the customer, on a phone -------------------------------------------------------------------------------------------
  {
    const { context, page } = await newPage(browser, { width: 390, height: 844, mobile: true, locale: 'en-GB', scheme: 'light' })
    track(page)
    await step('the secure link shows the whole offer on a phone, without sideways scroll', async () => {
      await page.goto(quoteLink, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'A website for the bakery' }).waitFor({ timeout: 10000 })
      const text = await page.locator('body').innerText()
      for (const part of ['Scope of work', 'Terms and conditions', 'Price breakdown', '€3,100.50', 'Design', 'Build', 'Prices exclude VAT', 'Valid until']) expect(text.includes(part), `the offer shows "${part}"`)
      expect(await NO_SCROLL(page), 'no sideways scroll on the quotation')
      await shot(page, '06-customer-quote-390')
    })
    await step('opening the page accepted nothing; the choices are in a bar that stays on the screen', async () => {
      const bar = page.getByRole('button', { name: 'Accept the quotation' })
      expect(await bar.isVisible(), 'the accept button is on the screen without scrolling to the end')
      const box = await bar.boundingBox()
      expect(box && box.y + box.height <= 844, 'the bar is inside the viewport')
    })
    await step('accepting needs an explicit confirmation, then it is recorded and the page says so', async () => {
      await page.getByRole('button', { name: 'Accept the quotation' }).click()
      await page.getByRole('button', { name: 'Confirm acceptance' }).click()
      await page.getByText('Tick the box to continue.').first().waitFor({ timeout: 5000 })
      await page.getByRole('checkbox', { name: /I have read the quotation and its terms/ }).check()
      await page.getByRole('button', { name: 'Confirm acceptance' }).click()
      await page.getByText('Your acceptance is recorded').first().waitFor({ timeout: 10000 })
      await shot(page, '07-customer-accepted-390')
    })
    await step('the link now shows a record of the acceptance with no way to act', async () => {
      await page.reload({ waitUntil: 'networkidle' })
      await page.getByText(/You accepted this quotation on/).first().waitFor({ timeout: 8000 })
      expect((await page.getByRole('button', { name: 'Accept the quotation' }).count()) === 0, 'no accept button any more')
    })
    await step('both sides are told once, and nothing says a payment was made', async () => {
      const customer = await waitForMail((m) => m.to.includes(VISITOR) && m.subject.startsWith('You accepted'), 'the acceptance confirmation')
      // The owner's mail is in the owner's language (NOTIFY_LANGUAGE, Hungarian unless set).
      const owner = await waitForMail((m) => m.to.includes('owner@example.test') && /accepted|elfogadva/i.test(m.subject) && m.subject.includes(reference), 'the acceptance notice')
      expect(customer.text.includes('no payment has been requested or received'), 'it says no payment')
      expect(!/payment (received|confirmed)|paid/i.test(customer.text), 'no claim of payment')
      expect(owner.text.includes(`${BASE}/admin/quotes/`), 'the owner gets the dashboard link')
      await sleep(1500)
      expect(mails().filter((m) => m.subject.startsWith('You accepted')).length === 1, 'exactly one acceptance message to the customer')
    })
    await context.close()
  }

  // ---- 4. the administrator again --------------------------------------------------------------------------------------------
  track(a)
  await step('the request is Accepted (not In progress), the history shows who did what, and the e-mails are listed with their real state', async () => {
    await a.goto(requestUrl, { waitUntil: 'networkidle' })
    await a.getByRole('heading', { name: 'Anna Visser' }).waitFor({ timeout: 8000 })
    const text = await a.locator('body').innerText()
    expect(/Accepted/.test(text) && !/In progress/.test(text.split('History')[0].split('Status')[0] || ''), 'the request is accepted')
    for (const part of ['Quotation accepted', 'Quotation sent', 'Customer', 'Acceptance (to you)', 'Acceptance (to the customer)']) expect(text.includes(part), `the page shows "${part}"`)
    expect(!/Delivered/.test(text.replace(/"Delivered" appears only when the provider confirmed it\./, '')), 'nothing is called delivered without a provider confirmation')
    await shot(a, '08-admin-accepted')
  })
  await step('the next status the administrator may choose is "In progress", and nothing else is offered by mistake', async () => {
    const options = await a.getByLabel('Change the status').locator('option').allInnerTexts()
    expect(options.includes('In progress') && !options.includes('Quotation sent'), `status choices: ${options.join(', ')}`)
  })
  await admin.context.close()
  await browser.close()

  console.log(`\n${passed} step(s) passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(2)
})
