// The customer's side of the quotation workflow (PROMPT 17) at the viewports the brief names, in the states a customer really meets:
// the receipt after sending a request, the status page, the quotation (open, accepted), and the pages for a link that is not valid.
// In every state: the layout checks of audit-matrix.cjs (sideways scrolling, elements outside the screen, text and targets too small,
// the header, the footer) and axe (WCAG 2.2 AA + best practice).
//
// It prepares its own data over HTTP: an administrator signs in, three requests are made through the public form (one per language), a quotation
// with every kind of line (an item, an optional extra, a discount with its reason, tax from a confirmed rate) is written and sent, and the secure links
// are read from the e-mails the `file` provider wrote. Needs the BUILT site served by a scratch backend with PUBLIC_URL set and a fresh database
// (see tools/e2e/quote-journey.cjs for the set-up).
//
// usage: AUDIT_PLAYWRIGHT=... node tools/audit/audit-quotes.cjs --base=http://127.0.0.1:8822 --mail=<mail folder> --email=... --password=... \
//          --sizes=320x640,360x740,390x844,430x932,768x1024,1024x768,1366x768,1440x900,1920x1080 [--langs=en,hu,nl] [--themes=dark,light] [--no-axe] [--shots --out=dir]
const { launch, newPage, axeRun, layoutCheck, fs, path } = require('./lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8822').replace(/\/$/, '')
const MAIL = arg('mail', '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const sizes = arg('sizes', '390x844,1440x900').split(',').map((s) => s.split('x').map(Number))
const langs = arg('langs', 'en').split(',')
const themes = arg('themes', 'light').split(',')
const OUT = arg('out', '')
const WITH_AXE = !process.argv.includes('--no-axe')
if (OUT) fs.mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const findings = []
let states = 0
async function inspect(page, label) {
  states += 1
  await page.waitForTimeout(350)
  const issues = await page.evaluate(layoutCheck)
  if (WITH_AXE) {
    for (const v of await axeRun(page)) issues.push(`axe ${v.id} (${v.impact}): ${v.nodes.map((n) => `${n.target} ${n.summary ?? ''}`).slice(0, 2).join(' | ')}`)
  }
  if (issues.length) findings.push({ label, issues })
  if (OUT && process.argv.includes('--shots')) await page.screenshot({ path: path.join(OUT, `${label.replace(/[^a-z0-9]+/gi, '-')}.png`) })
}

// ---- the prepared data ---------------------------------------------------------------------------------------------------
function readMails() {
  return fs
    .readdirSync(MAIL)
    .filter((name) => name.endsWith('.eml'))
    .sort()
    .map((name) => {
      const raw = fs.readFileSync(path.join(MAIL, name), 'utf8').replace(/\r\n/g, '\n')
      // A subject with an accent, or a long one, is written as RFC 2047 encoded words.
      const subject = (/^Subject:\s*((?:.*)(?:\n[ \t].*)*)/im.exec(raw)?.[1]?.replace(/\n[ \t]+/g, ' ') ?? '').replace(/=\?UTF-8\?B\?([^?]+)\?=\s*/gi, (_all, b64) => Buffer.from(b64, 'base64').toString('utf8'))
      const text = /Content-Type: text\/plain[^\n]*\n(?:Content-Transfer-Encoding: base64\n)?\n([\s\S]*?)(?=\n--|$)/.exec(raw)?.[1]
      return { subject, to: /^To:\s*(.*)$/im.exec(raw)?.[1] ?? '', text: text ? Buffer.from(text.replace(/\s+/g, ''), 'base64').toString('utf8') : '' }
    })
}
const link = (text, page) => new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?:hu|en|nl)/${page}/([A-Za-z0-9_-]{43})`).exec(text)?.[0] ?? ''
async function until(predicate, what) {
  for (let i = 0; i < 60; i += 1) {
    const hit = readMails().find(predicate)
    if (hit) return hit
    await sleep(400)
  }
  throw new Error(`no e-mail: ${what}`)
}

async function prepare() {
  const login = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  if (!login.ok) throw new Error(`administrator sign-in failed: ${login.status}`)
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
  const csrf = (await login.json()).data.csrfToken
  const admin = async (method, url, body) => {
    const response = await fetch(`${BASE}${url}`, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrf, Origin: BASE }, body: body === undefined ? undefined : JSON.stringify(body) })
    const json = await response.json().catch(() => null)
    if (!response.ok) throw new Error(`${method} ${url}: ${response.status} ${JSON.stringify(json).slice(0, 200)}`)
    return json?.data
  }
  const day = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10)
  const prepared = {}
  for (const language of ['en', 'hu', 'nl']) {
    const email = `audit-${language}@example.test`
    const response = await fetch(`${BASE}/api/quote-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE },
      body: JSON.stringify({ form: 'quote', version: 2, language, items: [{ need: 'website', plan: 'launch', extras: ['pages'] }], description: `An audit request in ${language} with a LongUnbrokenWordLongUnbrokenWordLongUnbrokenWordLongUnbrokenWordLongUnbrokenWord to hold the layout.`, objective: 'present', reference: null, timing: 'months', requirements: null, name: 'Audit Customer', email, phone: null, company: 'A Very Long Company Name That Keeps Going Limited', companyWebsite: null, budgetRange: null, marketing: false, consent: true }),
    })
    const created = (await response.json()).data
    const list = await admin('GET', `/api/admin/quote-requests?q=${encodeURIComponent(created.reference)}`)
    const id = list[0].id
    const started = await admin('POST', `/api/admin/quote-requests/${id}/quotes`, {})
    const quoteId = started.quotation.id
    await admin('PUT', `/api/admin/quotes/${quoteId}`, {
      language, title: 'A website for a business with a rather long project title that has to wrap on a small screen', introduction: 'Thank you for asking. This is the introduction.', understanding: 'A small site with opening hours and a form.',
      scope: 'Five pages, a contact form, deployment and a handover session.\nA second paragraph with a long address https://example.com/a/very/long/address/that/has/no/break/points/at/all/and/keeps/going', deliverables: 'The finished website.',
      exclusions: 'Copywriting and photography.', paymentTerms: 'To be agreed in the contract.', terms: 'These are the terms of this offer.', notes: 'A note.', estimatedTimeline: 'About six weeks.', validUntil: day,
      pricingMode: 'itemized', currency: 'EUR', taxMode: 'excluded', taxRatePercent: '21', taxVerified: true, taxNote: 'VAT is shown as a separate line.',
      lines: [
        { kind: 'item', description: 'Design of the pages, in several rounds with the customer', quantity: 1, unitPrice: '1500.50', detail: 'Three rounds of feedback are included.' },
        { kind: 'item', description: 'Build', quantity: 2, unitPrice: '800' },
        { kind: 'optional', description: 'Hosting set-up', quantity: 1, unitPrice: '200' },
        { kind: 'discount', description: 'Early booking', quantity: 1, unitPrice: '100', justification: 'Agreed on the phone.' },
      ],
    })
    await admin('POST', `/api/admin/quotes/${quoteId}/send`, { note: 'See you soon.' })
    const mail = await until((m) => m.to.includes(email) && /quotation|offerte|árajánlat/i.test(m.subject) && link(m.text, 'quote'), `the quotation to ${email}`)
    const confirmation = await until((m) => m.to.includes(email) && link(m.text, 'request'), `the confirmation to ${email}`)
    prepared[language] = { reference: created.reference, quote: link(mail.text, 'quote'), request: link(confirmation.text, 'request') }
  }
  return prepared
}

;(async () => {
  if (!MAIL || !EMAIL || !PASSWORD) throw new Error('usage: --mail=<folder> --email=<admin> --password=<password> [--base=...]')
  const data = await prepare()
  const browser = await launch()
  for (const [w, h] of sizes) {
    for (const theme of themes) {
      for (const lang of langs) {
        const tag = `${w}x${h} ${theme} ${lang}`
        const mine = data[lang] ?? data.en
        const { context, page } = await newPage(browser, { width: w, height: h, mobile: w <= 820 || h <= 500, reduced: true, scheme: theme })
        await context.addInitScript(`try { localStorage.setItem('theme', '${theme}') } catch (e) {}`)
        const errors = []
        page.on('pageerror', (e) => errors.push(`pageerror ${e.message.slice(0, 120)}`))
        page.on('console', (m) => {
          if (m.type() === 'error' && !/Failed to load resource|status of [45]\d\d|KHR_parallel|WebGL|GPU stall/i.test(m.text())) errors.push(m.text().slice(0, 120))
        })
        const open = async (url, ready) => {
          await page.goto(url.replace(/\/(?:hu|en|nl)\//, `/${lang}/`), { waitUntil: 'load' })
          await page.locator(ready).first().waitFor({ timeout: 15000 })
        }
        try {
          // The builder's last step (with the summary of everything about to be sent) and the receipt after sending, by structure, so any language works.
          await page.goto(`${BASE}/${lang}/services/configure`, { waitUntil: 'load' })
          const next = page.locator('form button[type=submit]')
          await page.locator('form input[type=checkbox]').first().waitFor({ timeout: 15000 })
          await page.locator('form input[type=checkbox]').first().check()
          await next.click()
          await page.locator('form input[type=radio]').first().check()
          await next.click()
          await next.click()
          await page.locator('form textarea').first().fill(`An audit request written at ${tag} for a small website with a contact form and opening hours.`)
          await next.click()
          await next.click()
          await page.locator('form input[autocomplete=name]').fill('Receipt Customer')
          await page.locator('form input[type=email]').fill(`receipt-${lang}@example.test`)
          await page.locator('form input[type=checkbox]').first().check()
          await inspect(page, `${tag} builder: the last step with its summary`)
          await next.click()
          await page.locator('[data-testid="reference"]').waitFor({ timeout: 15000 })
          await inspect(page, `${tag} builder: the receipt`)
          await open(mine.request, 'h1')
          await inspect(page, `${tag} status page`)
          await open(mine.quote, 'h1')
          await inspect(page, `${tag} quotation: open`)
          // The confirmation panels (accept and decline share the form; the revision one has a text area).
          const accept = page.locator('article > div > button').first()
          if (await accept.count()) {
            await accept.click()
            await page.locator('form button[type=submit]').first().waitFor({ timeout: 8000 })
            await page.locator('form button[type=submit]').first().click()
            await inspect(page, `${tag} quotation: acceptance form with its problem shown`)
          } else findings.push({ label: `${tag} quotation`, issues: ['the accept button is missing from an open offer'] })
          await open(`${BASE}/${lang}/quote/${'x'.repeat(43)}`, 'h1')
          await inspect(page, `${tag} link that is not valid`)
          await open(`${BASE}/${lang}/quote/`, 'h1')
          await inspect(page, `${tag} incomplete link`)
        } catch (error) {
          findings.push({ label: tag, issues: [`the audit could not continue: ${String(error.message || error).split('\n')[0]}`] })
          if (OUT) await page.screenshot({ path: path.join(OUT, `ERROR-${tag.replace(/\W+/g, '-')}.png`) }).catch(() => undefined)
        }
        if (errors.length) findings.push({ label: tag, issues: [`console: ${[...new Set(errors)].slice(0, 3).join(' | ')}`] })
        await context.close()
      }
    }
  }
  // One quotation is accepted at the end (once), to look at the record it leaves behind at every size.
  {
    const mine = data.en
    const { context, page } = await newPage(browser, { width: 390, height: 844, mobile: true, reduced: true, scheme: 'light' })
    await page.goto(mine.quote, { waitUntil: 'load' })
    await page.locator('h1').first().waitFor({ timeout: 15000 })
    await page.locator('article > div > button').first().click()
    await page.getByRole('checkbox').first().check()
    await page.locator('form button[type=submit]').first().click()
    await page.getByRole('status').first().waitFor({ timeout: 15000 })
    await context.close()
    for (const [w, h] of sizes) {
      const { context: c2, page: p2 } = await newPage(browser, { width: w, height: h, mobile: w <= 820 || h <= 500, reduced: true, scheme: 'light' })
      await p2.goto(mine.quote, { waitUntil: 'load' })
      await p2.locator('h1').first().waitFor({ timeout: 15000 })
      page.setDefaultTimeout(15000)
      states += 1
      const issues = await p2.evaluate(layoutCheck)
      if (WITH_AXE) for (const v of await axeRun(p2)) issues.push(`axe ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target).slice(0, 2).join(' | ')}`)
      if (issues.length) findings.push({ label: `${w}x${h} quotation: accepted`, issues })
      await c2.close()
    }
  }
  console.log(`quote audit: ${states} states at ${sizes.map((s) => s.join('x')).join(', ')} (${themes.join('+')}, ${langs.join('+')}${WITH_AXE ? ', axe' : ''})`)
  if (!findings.length) console.log('quote audit: no findings')
  for (const f of findings) console.log(`- ${f.label}: ${f.issues.join('  ||  ')}`)
  await browser.close()
  process.exit(findings.length ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})
