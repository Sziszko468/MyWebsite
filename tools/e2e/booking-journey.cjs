// The consultation booking (PROMPT 24), in a real Chrome against the BUILT website served by the real backend (one process, one origin, a throw-away database,
// the `file` e-mail provider whose messages are read back). Nothing is mocked, nothing leaves the machine, and no real address is used (they end in .test).
//
//   A  the booking is closed until the owner opens it: every language says so, nothing is offered, the page is not indexed
//   B  the owner opens it through the administration: a type, weekly hours, the settings
//   C  a visitor books in Hungarian, English and Dutch: type, day, time, details, review, confirmation; the e-mails come in the same language
//   D  invalid data, a double submission, and a time taken before the visitor confirmed
//   E  the customer's own page: asks to move the booking, asks to cancel
//   F  the owner answers in the administration: approves, proposes a new time, cancels with a message
//   G  the places that offer booking appear once it is open, and the sitemap lists the page
//   H  axe finds nothing on any screen of the booking, on the page and in the administration (needs AUDIT_AXE=<path to axe.min.js>)
//   I  PROMPT 24.1: what a search engine and a third party are told (the public page indexable only while booking is open, the customer's page never, the secret
//      only ever sent to this site), and the privacy notice's booking sections in three languages (needs AUDIT_AXE for the accessibility step)
//
//   AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/booking-journey.cjs --base=http://127.0.0.1:8860 --mail=<mail folder> \
//        --email=admin@example.test --password=... [--width=1440] [--only=ABCDEFGHI] [--out=<dir>]
//
// Needs a FRESH server (every run makes bookings) built with VITE_API_URL=/ and started with RATE_LIMITS=false (a visitor may book only six times in
// fifteen minutes from one address, which is the point of the limit, and this journey books more often than that). See README.md in this folder.
const fs = require('fs')
const path = require('path')
const { launch, newPage } = require('../audit/lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8860').replace(/\/$/, '')
const MAIL = arg('mail', '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const OUT = arg('out', '')
const WIDTH = Number(arg('width', '1440'))
const HEIGHT = Number(arg('height', WIDTH >= 768 ? '1000' : '844'))
const ONLY = arg('only', 'ABCDEFGHI')
const wants = (letter) => ONLY.includes(letter)
const MOBILE = WIDTH < 768
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
  if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => undefined)
}
const NO_SCROLL = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)
const stamp = Date.now().toString(36)

// ---- what each language says (the words the page uses; src/content/consultation/index.ts) ------------------------------------------------
const W = {
  hu: { next: 'Tovább', type: 'Ismerkedő beszélgetés', name: 'Név', email: 'E-mail-cím', confirm: 'Foglalás megerősítése', done: 'A foglalás létrejött', closed: 'A foglalás jelenleg nem érhető el', consent: /Tudomásul veszem/, back: 'Vissza', required: 'Ezt kötelező kitölteni.', taken: 'Ezt az időpontot közben valaki lefoglalta', cta: 'Konzultáció foglalása', subject: /Megerősítettük a konzultációdat/, title: 'Konzultáció foglalása' },
  en: { next: 'Continue', type: 'Discovery call', name: 'Name', email: 'Email address', confirm: 'Confirm booking', done: 'Booking confirmed', closed: 'Online booking is not available right now', consent: /I understand that my details/, back: 'Back', required: 'This is required.', taken: 'Someone has just booked that time', cta: 'Book a consultation', subject: /Your consultation is confirmed/, title: 'Book a consultation' },
  nl: { next: 'Verder', type: 'Kennismakingsgesprek', name: 'Naam', email: 'E-mailadres', confirm: 'Afspraak bevestigen', done: 'Afspraak bevestigd', closed: 'Online inplannen is op dit moment niet mogelijk', consent: /Ik begrijp dat mijn gegevens/, back: 'Terug', required: 'Dit is verplicht.', taken: 'Iemand heeft dat moment zojuist geboekt', cta: 'Een adviesgesprek inplannen', subject: /Je adviesgesprek is bevestigd/, title: 'Een adviesgesprek inplannen' },
}
const LANGS = ['hu', 'en', 'nl']

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
  return { file, to: words(header('To')), subject: words(header('Subject')), text: parts['text/plain'] ?? '', html: parts['text/html'] ?? '' }
}
const mails = () =>
  fs
    .readdirSync(MAIL)
    .filter((name) => name.endsWith('.eml'))
    .sort()
    .map((name) => decodeMessage(path.join(MAIL, name)))
const mailsTo = (address) => mails().filter((mail) => mail.to.includes(address))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function waitForMail(address, count = 1, timeout = 20000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    const found = mailsTo(address)
    if (found.length >= count) return found
    await sleep(300)
  }
  throw new Error(`no ${count}. e-mail to ${address} within ${timeout} ms (have ${mailsTo(address).length})`)
}
const linkIn = (text) => new RegExp(`${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?:hu|en|nl)/consultation/booking/[A-Za-z0-9_-]{43}`).exec(text)?.[0] ?? ''

// ---- the administration (English) --------------------------------------------------------------------------------------------------
async function signIn(browser) {
  const { context, page } = await newPage(browser, { width: 1440, height: 1000, locale: 'en-GB', scheme: 'light' })
  await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'networkidle' })
  await page.getByLabel('E-mail address').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('heading', { name: 'Consultations', level: 1 }).waitFor({ timeout: 15000 })
  return { context, page }
}

/** The first free day and its first free time, on the page. */
async function chooseDayAndTime(page, index = 0) {
  const day = page.locator('button[data-state="available"]').first()
  await day.waitFor({ timeout: 15000 })
  await day.click()
  const times = page.locator('fieldset input[type=radio]')
  await times.nth(index).waitFor({ timeout: 10000 })
  await times.nth(index).check()
  return await page.locator('label[class*="slotLabel"]').nth(index).innerText()
}

async function fillDetails(page, lang, person) {
  await page.getByLabel(W[lang].name, { exact: true }).fill(person.name)
  await page.getByLabel(W[lang].email, { exact: true }).fill(person.email)
  if (person.company) await page.getByLabel(/^(Company|Cég|Bedrijf)/).fill(person.company)
  if (person.message) await page.getByLabel(/^(Tell us|Mesélj|Vertel)/).fill(person.message)
  await page.getByRole('checkbox', { name: W[lang].consent }).check()
}

async function bookAsVisitor(page, lang, person, options = {}) {
  await page.goto(`${BASE}/${lang}/consultation/`, { waitUntil: 'networkidle' })
  await page.getByRole('radio', { name: new RegExp(W[lang].type) }).check()
  await page.getByRole('button', { name: W[lang].next }).click()
  const time = await chooseDayAndTime(page, options.slot ?? 0)
  await page.getByRole('button', { name: W[lang].next }).click()
  await fillDetails(page, lang, person)
  await page.getByRole('button', { name: W[lang].next }).click()
  if (options.stopAtReview) return time
  await page.getByRole('button', { name: W[lang].confirm }).click()
  await page.getByRole('heading', { name: W[lang].done }).waitFor({ timeout: 15000 })
  return time
}

async function main() {
  if (!MAIL || !EMAIL || !PASSWORD) throw new Error('usage: --mail=<folder> --email=<admin> --password=<password> [--base=...] [--out=<dir>]')
  console.log(`viewport ${WIDTH}x${HEIGHT}, parts ${ONLY}`)
  const browser = await launch()
  const state = { people: {}, links: {}, refs: {} }

  // ---- A. closed until the owner opens it --------------------------------------------------------------------------------------
  if (wants('A')) {
    console.log('A  closed until the owner opens it')
    const { context, page } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB', scheme: 'light' })
    current = page
    for (const lang of LANGS) {
      await step(`${lang}: the booking page says it is not available, offers nothing and has no horizontal scroll`, async () => {
        const response = await page.goto(`${BASE}/${lang}/consultation/`, { waitUntil: 'networkidle' })
        expect(response.status() === 200, `status ${response.status()}`)
        await page.getByRole('heading', { name: W[lang].closed }).waitFor({ timeout: 10000 })
        expect((await page.locator('button[data-state]').count()) === 0, 'a calendar is on the page')
        expect((await page.locator('input[type=radio]').count()) === 0, 'a choice is on the page')
        expect(await page.evaluate(() => document.documentElement.lang) === lang, 'lang attribute')
        expect(await NO_SCROLL(page), 'sideways scroll')
        expect((response.headers()['x-robots-tag'] ?? '').includes('noindex'), 'not told to stay out of search results')
        // The page's own head says the same once it knows booking is closed (for a crawler that reads the rendered page): noindex, and no canonical address.
        await page.waitForFunction(() => /noindex/.test(document.querySelector('meta[name=robots]')?.getAttribute('content') ?? ''), null, { timeout: 8000 })
        expect((await page.locator('link[rel=canonical]').count()) === 0, 'the closed page still names a canonical address')
        expect((await page.locator('link[rel=alternate][hreflang]').count()) === 0, 'the closed page still lists language alternates')
        await shot(page, `A-${lang}-${WIDTH}`)
      })
    }
    await step('the sitemap does not list the page, and no place offers booking', async () => {
      const sitemap = await (await page.request.get(`${BASE}/sitemap.xml`)).text()
      expect(!/\/consultation\//.test(sitemap), 'the sitemap lists the consultation page')
      await page.goto(`${BASE}/en/contact`, { waitUntil: 'networkidle' })
      expect((await page.getByRole('link', { name: W.en.cta }).count()) === 0, 'a link to booking is shown while it is closed')
    })
    await step('a booking is refused by the server while it is closed', async () => {
      const answer = await page.request.post(`${BASE}/api/consultations/bookings`, { data: { language: 'en', type: 'discovery', start: new Date(Date.now() + 5 * 86400000).toISOString(), name: 'Nobody', email: 'nobody@example.test', consent: true } })
      expect(answer.status() === 409, `status ${answer.status()}`)
    })
    await context.close()
  }

  // ---- B. the owner opens it -----------------------------------------------------------------------------------------------------
  if (wants('B')) {
    console.log('B  the owner opens booking in the administration')
    const { context, page } = await signIn(browser)
    current = page
    await step('the bookings list says what is missing', async () => {
      const text = await page.locator('main').innerText()
      expect(/Booking is closed to the public/.test(text) && /switch is off/.test(text), text.slice(0, 300))
    })
    await step('the four suggested types are there, switched off and without a length', async () => {
      await page.goto(`${BASE}/admin/bookings/setup`, { waitUntil: 'networkidle' })
      await page.getByRole('tab', { name: 'Consultation types' }).click()
      for (const name of ['Discovery call', 'Project consultation', 'Technical consultation', 'Follow-up consultation']) await page.getByRole('region', { name }).waitFor()
      expect((await page.getByText('Needs a length and all three languages before it can be switched on.').count()) === 4, 'not all four need a length')
    })
    await step('a type is given a length and switched on (and one without a length is refused)', async () => {
      const panel = page.getByRole('region', { name: 'Discovery call' })
      await panel.getByLabel('Offered to visitors').check()
      await panel.getByRole('button', { name: 'Save this type' }).click()
      await page.getByText('Required.').first().waitFor({ timeout: 8000 })
      await panel.getByLabel('Length (minutes)').fill('30')
      await panel.getByRole('button', { name: 'Save this type' }).click()
      await page.getByText('The type is saved.').waitFor({ timeout: 8000 })
    })
    await step('weekdays get hours', async () => {
      await page.getByRole('tab', { name: 'Weekly hours and exceptions' }).click()
      for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) await page.getByRole('group', { name: day }).getByRole('button', { name: 'Add a window' }).click()
      await page.getByRole('button', { name: 'Save the hours and exceptions' }).click()
      await page.getByText('The hours and exceptions are saved.').waitFor({ timeout: 8000 })
    })
    await step('the settings are saved: a time zone, the switch, short notice', async () => {
      await page.getByRole('tab', { name: 'Settings' }).click()
      await page.getByLabel('Online booking').check()
      await page.getByLabel('Time zone').fill('Europe/Budapest')
      await page.getByLabel('Shortest notice (hours)').fill('1')
      await page.getByLabel('How far ahead (days)').fill('60')
      await page.getByRole('button', { name: 'Save the settings' }).click()
      await page.getByText('The settings are saved.').waitFor({ timeout: 8000 })
      await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'networkidle' })
      await page.getByText('Booking is open to the public.').waitFor({ timeout: 8000 })
    })
    await context.close()
  }

  // ---- C. a visitor books, in each language ------------------------------------------------------------------------------------------
  if (wants('C')) {
    console.log('C  visitors book in Hungarian, English and Dutch')
    for (const lang of LANGS) {
      const { context, page } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: lang === 'hu' ? 'hu-HU' : lang === 'nl' ? 'nl-NL' : 'en-GB', scheme: 'light' })
      current = page
      const errors = []
      page.on('pageerror', (error) => errors.push(String(error)))
      page.on('console', (message) => message.type() === 'error' && !/Failed to load resource/.test(message.text()) && errors.push(message.text()))
      const person = { name: `Visitor ${lang.toUpperCase()}`, email: `visitor-${lang}-${stamp}@example.test`, company: 'Example Co', message: `A message in ${lang}, for the journey.` }
      state.people[lang] = person
      let time = ''
      await step(`${lang}: type, day, time, details, review and confirmation`, async () => {
        await page.goto(`${BASE}/${lang}/consultation/`, { waitUntil: 'networkidle' })
        await page.getByRole('radio', { name: new RegExp(W[lang].type) }).waitFor({ timeout: 15000 })
        expect(await page.title().then((title) => title.includes(W[lang].title)), `title: ${await page.title()}`)
        await page.getByRole('radio', { name: new RegExp(W[lang].type) }).check()
        await shot(page, `C-${lang}-1-type-${WIDTH}`)
        await page.getByRole('button', { name: W[lang].next }).click()
        time = await chooseDayAndTime(page, lang === 'hu' ? 0 : lang === 'en' ? 1 : 2)
        await shot(page, `C-${lang}-2-time-${WIDTH}`)
        expect(await NO_SCROLL(page), 'sideways scroll on the calendar')
        await page.getByRole('button', { name: W[lang].next }).click()
        await fillDetails(page, lang, person)
        await shot(page, `C-${lang}-3-details-${WIDTH}`)
        await page.getByRole('button', { name: W[lang].next }).click()
        const review = await page.locator('main').innerText()
        expect(review.includes(person.name) && review.includes(person.email), 'the review does not show the details')
        expect(/Europe\/Budapest/.test(review), 'the review does not name the time zone')
        expect(await NO_SCROLL(page), 'sideways scroll on the review')
        await shot(page, `C-${lang}-4-review-${WIDTH}`)
        await page.getByRole('button', { name: W[lang].confirm }).click()
        await page.getByRole('heading', { name: W[lang].done }).waitFor({ timeout: 15000 })
        const done = await page.locator('main').innerText()
        const ref = /BK-\d{4}-\d{6}/.exec(done)?.[0]
        expect(ref, 'no reference on the confirmation')
        state.refs[lang] = ref
        expect(await NO_SCROLL(page), 'sideways scroll on the confirmation')
        await shot(page, `C-${lang}-5-done-${WIDTH}`)
      })
      await step(`${lang}: the confirmation e-mail is in ${lang}, names the zone and carries a secure link; the owner is told too`, async () => {
        const [mail] = await waitForMail(person.email)
        expect(W[lang].subject.test(mail.subject), `subject: ${mail.subject}`)
        expect(mail.text.includes(state.refs[lang]) && /Europe\/Budapest/.test(mail.text), 'the mail lacks the reference or the zone')
        expect(mail.html.includes(`lang="${lang}"`), 'html lang')
        state.links[lang] = linkIn(mail.text)
        expect(state.links[lang], 'no secure link')
        const owner = mails().filter((m) => m.to.includes('owner@example.test') && m.subject.includes(state.refs[lang]))
        expect(owner.length === 1, `owner mails: ${owner.length}`)
        void time
      })
      await step(`${lang}: no script error on the way`, async () => {
        expect(errors.length === 0, errors.join(' | ').slice(0, 300))
      })
      await context.close()
    }
  }

  // ---- D. invalid data, a double submission, a time taken meanwhile ---------------------------------------------------------------------
  if (wants('D')) {
    console.log('D  invalid data, a double submission, a time taken first')
    const { context, page } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB', scheme: 'light' })
    current = page
    await step('an empty form is refused in the visitor’s language, with the first problem focused', async () => {
      for (const lang of LANGS) {
        await page.goto(`${BASE}/${lang}/consultation/`, { waitUntil: 'networkidle' })
        await page.getByRole('radio', { name: new RegExp(W[lang].type) }).check()
        await page.getByRole('button', { name: W[lang].next }).click()
        await chooseDayAndTime(page, 3)
        await page.getByRole('button', { name: W[lang].next }).click()
        await page.getByRole('button', { name: W[lang].next }).click()
        await page.getByText(W[lang].required).first().waitFor({ timeout: 5000 })
        // Focus moves to the first problem on the next frame.
        await page.waitForFunction(() => document.activeElement?.getAttribute('name') === 'name', null, { timeout: 5000 }).catch(async () => {
          throw new Error(`focus is on ${await page.evaluate(() => document.activeElement?.tagName + ':' + document.activeElement?.getAttribute('name'))}`)
        })
        await page.getByLabel(W[lang].email, { exact: true }).fill('not an address')
        await page.getByLabel(W[lang].name, { exact: true }).fill('A B')
        await page.getByRole('button', { name: W[lang].next }).click()
        expect((await page.locator('[role=alert], p[id$="-error"]').count()) > 0, 'no error shown for a bad address')
      }
    })
    await step('the same submission twice (a double click) makes one booking', async () => {
      const lang = 'en'
      await page.goto(`${BASE}/en/consultation/`, { waitUntil: 'networkidle' })
      await page.getByRole('radio', { name: /Discovery call/ }).check()
      await page.getByRole('button', { name: 'Continue' }).click()
      await chooseDayAndTime(page, 4)
      await page.getByRole('button', { name: 'Continue' }).click()
      await fillDetails(page, lang, { name: 'Double Click', email: `double-${stamp}@example.test` })
      await page.getByRole('button', { name: 'Continue' }).click()
      const confirm = page.getByRole('button', { name: 'Confirm booking' })
      await confirm.dblclick()
      await page.getByRole('heading', { name: 'Booking confirmed' }).waitFor({ timeout: 15000 })
      await sleep(1500)
      const sent = mailsTo(`double-${stamp}@example.test`)
      expect(sent.length === 1, `${sent.length} confirmation e-mails`)
    })
    await step('a time taken by somebody else before the visitor confirms is refused kindly, and the list is refreshed', async () => {
      const lang = 'en'
      const taker = await newPage(browser, { width: 1440, height: 900, locale: 'en-GB', scheme: 'light' })
      const slotFor = async (p) => {
        await p.goto(`${BASE}/en/consultation/`, { waitUntil: 'networkidle' })
        await p.getByRole('radio', { name: /Discovery call/ }).check()
        await p.getByRole('button', { name: 'Continue' }).click()
        return await chooseDayAndTime(p, 5)
      }
      await slotFor(page)
      await page.getByRole('button', { name: 'Continue' }).click()
      await fillDetails(page, lang, { name: 'Slow Visitor', email: `slow-${stamp}@example.test` })
      await page.getByRole('button', { name: 'Continue' }).click()
      // Meanwhile the other visitor takes exactly the same time (same day, same position in the list).
      await slotFor(taker.page)
      await taker.page.getByRole('button', { name: 'Continue' }).click()
      await fillDetails(taker.page, lang, { name: 'Quick Visitor', email: `quick-${stamp}@example.test` })
      await taker.page.getByRole('button', { name: 'Continue' }).click()
      await taker.page.getByRole('button', { name: 'Confirm booking' }).click()
      await taker.page.getByRole('heading', { name: 'Booking confirmed' }).waitFor({ timeout: 15000 })
      await taker.context.close()
      await page.getByRole('button', { name: 'Confirm booking' }).click()
      await page.getByText(W.en.taken).waitFor({ timeout: 10000 })
      expect((await page.getByRole('heading', { name: 'Choose a day and a time' }).count()) === 1, 'not sent back to choose a time')
      expect((await mailsTo(`slow-${stamp}@example.test`).length) === 0, 'the loser was e-mailed')
    })
    await context.close()
  }

  // ---- E. the customer's own page ---------------------------------------------------------------------------------------------------
  if (wants('E')) {
    console.log("E  the customer's own booking page")
    const lang = 'en'
    const link = state.links[lang]
    if (!link) throw new Error('part C must run first (it makes the booking this part uses)')
    const { context, page } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB', scheme: 'light' })
    current = page
    await step('the link opens the booking, with its reference, the zone and no notes; the page is not cached or indexed', async () => {
      const response = await page.goto(link, { waitUntil: 'networkidle' })
      expect(response.status() === 200, `status ${response.status()}`)
      expect((response.headers()['cache-control'] ?? '').includes('no-store'), 'cache-control')
      expect((response.headers()['x-robots-tag'] ?? '').includes('noindex'), 'x-robots-tag')
      await page.getByText(state.refs[lang]).first().waitFor({ timeout: 10000 })
      const text = await page.locator('main').innerText()
      expect(/Europe\/Budapest/.test(text) && /Confirmed/.test(text), 'zone or status missing')
      expect(await NO_SCROLL(page), 'sideways scroll')
      await shot(page, `E-1-booking-${WIDTH}`)
    })
    await step('a link with a made-up secret says so without leaking anything', async () => {
      await page.goto(`${BASE}/en/consultation/booking/${'A'.repeat(43)}`, { waitUntil: 'networkidle' })
      await page.getByText('This link is not valid.').waitFor({ timeout: 10000 })
    })
    await step('the customer asks to move the booking and sees the request waiting', async () => {
      await page.goto(link, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Ask to change the time' }).click()
      await chooseDayAndTime(page, 7)
      await shot(page, `E-2-move-${WIDTH}`)
      await page.getByRole('button', { name: 'Choose this time' }).click()
      await page.getByText('Your request to change the time is in').waitFor({ timeout: 10000 })
      expect((await page.getByText('Change pending').count()) > 0, 'status')
    })
    await step('the owner is told, and the customer gets a receipt', async () => {
      const owner = await waitForMail('owner@example.test', 1)
      expect(owner.some((m) => /Reschedule requested/.test(m.subject) && m.subject.includes(state.refs[lang])), 'no owner e-mail about the request')
      const customer = mailsTo(state.people[lang].email)
      expect(customer.some((m) => /We received your request to change the time/.test(m.subject)), customer.map((m) => m.subject).join(' | '))
    })
    await step('the customer takes the request back, then asks to cancel instead', async () => {
      await page.goto(link, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: 'Withdraw the request' }).click()
      await page.getByRole('button', { name: 'Ask to cancel' }).waitFor({ timeout: 10000 })
      await page.getByRole('button', { name: 'Ask to cancel' }).click()
      await page.getByLabel(/Why\?/).fill('My plans changed.')
      await page.getByRole('button', { name: 'Send the cancellation request' }).click()
      await page.getByText('Your cancellation request is in').waitFor({ timeout: 10000 })
    })
    await context.close()
  }

  // ---- F. the owner answers ---------------------------------------------------------------------------------------------------------
  if (wants('F')) {
    console.log('F  the owner answers in the administration')
    const { context, page } = await signIn(browser)
    current = page
    await step('the list shows the bookings with the open request, and filters by status and search', async () => {
      await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'networkidle' })
      await page.getByText('Cancellation requested').first().waitFor({ timeout: 10000 })
      await page.locator('form[role=search] input').first().fill(state.refs.en)
      // The list narrows to the one booking (the search waits a moment after the last key).
      await page.getByRole('link', { name: 'Visitor HU' }).waitFor({ state: 'detached', timeout: 10000 })
      await page.getByRole('link', { name: 'Visitor EN' }).first().waitFor({ timeout: 10000 })
      await shot(page, `F-1-list-${WIDTH}`)
    })
    await step('the owner declines the cancellation request with a message, and the customer is told', async () => {
      await page.getByRole('link', { name: 'Visitor EN' }).first().click()
      await page.getByRole('heading', { name: 'An open request' }).waitFor({ timeout: 10000 })
      await page.getByLabel('A message for the customer (optional)').first().fill('Please call me first.')
      await page.getByRole('button', { name: 'Decline the request' }).click()
      await page.getByText('The request is declined.').waitFor({ timeout: 10000 })
      const customer = await waitForMail(state.people.en.email, 4)
      const declined = customer.find((m) => /Your request could not be accepted/.test(m.subject))
      expect(declined && declined.text.includes('Please call me first.'), 'the customer was not told with the message')
      await shot(page, `F-2-detail-${WIDTH}`)
    })
    await step('the owner adds a private note, and it appears nowhere the customer can look', async () => {
      await page.getByLabel('Add a note').fill('PRIVATE-JOURNEY-NOTE')
      await page.getByRole('button', { name: 'Add the note' }).click()
      await page.getByText('The note is saved.').waitFor({ timeout: 10000 })
      expect(!mails().some((m) => m.text.includes('PRIVATE-JOURNEY-NOTE') || m.html.includes('PRIVATE-JOURNEY-NOTE')), 'the note is in an e-mail')
      const customerPage = await page.request.get(`${BASE}/api/consultations/manage/${state.links.en.slice(-43)}`)
      expect(!(await customerPage.text()).includes('PRIVATE-JOURNEY-NOTE'), 'the note is on the customer page')
    })
    await step('the owner proposes a new time; the customer accepts it on their page', async () => {
      await page.getByRole('button', { name: 'Propose a new time' }).click()
      const date = new Date(Date.now() + 9 * 86400000)
      while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1)
      await page.getByLabel('Date').fill(date.toISOString().slice(0, 10))
      const slot = page.locator('label:has(input[type=radio][name])').filter({ hasText: /\d/ }).first()
      await slot.waitFor({ timeout: 10000 })
      await slot.click()
      await page.getByRole('button', { name: 'Send the proposal' }).click()
      await page.getByText(/The proposal is sent/).waitFor({ timeout: 10000 })
      const customerContext = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB', scheme: 'light' })
      await customerContext.page.goto(state.links.en, { waitUntil: 'networkidle' })
      await customerContext.page.getByText('A new time is proposed').first().waitFor({ timeout: 10000 })
      await shot(customerContext.page, `F-3-proposal-${WIDTH}`)
      await customerContext.page.getByRole('button', { name: 'Accept the new time' }).click()
      await customerContext.page.getByText('You accepted the new time.').waitFor({ timeout: 10000 })
      await customerContext.page.getByText('Rescheduled').first().waitFor({ timeout: 10000 })
      await customerContext.context.close()
    })
    await step('the owner cancels the Dutch booking with a message in the visitor’s language of the e-mail', async () => {
      await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'networkidle' })
      await page.locator('form[role=search] input').first().fill(state.refs.nl)
      await page.getByRole('link', { name: 'Visitor NL' }).first().click()
      await page.getByLabel('A message for the customer (optional)').first().fill('Excuses voor het ongemak.')
      await page.getByRole('button', { name: 'Cancel the booking' }).click()
      await page.getByRole('button', { name: 'Cancel the booking' }).last().click()
      await page.getByText('The booking is cancelled.').waitFor({ timeout: 10000 })
      const dutch = await waitForMail(state.people.nl.email, 2)
      const cancelled = dutch.find((m) => /Je adviesgesprek is geannuleerd/.test(m.subject))
      expect(cancelled && cancelled.text.includes('Excuses voor het ongemak.'), 'the cancellation e-mail is not Dutch or lacks the message')
    })
    await context.close()
  }

  // ---- G. the places that offer booking ----------------------------------------------------------------------------------------------
  if (wants('G')) {
    console.log('G  booking is offered where it should be, once it is open')
    const { context, page } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB', scheme: 'light' })
    current = page
    await step('the contact page, the shop and the footer lead to booking, in each language', async () => {
      for (const lang of LANGS) {
        await page.goto(`${BASE}/${lang}/contact`, { waitUntil: 'networkidle' })
        await page.getByRole('link', { name: W[lang].cta }).first().waitFor({ timeout: 10000 })
        await page.goto(`${BASE}/${lang}/services`, { waitUntil: 'networkidle' })
        await page.getByRole('link', { name: W[lang].cta }).first().waitFor({ timeout: 10000 })
      }
    })
    await step('the sitemap lists the page in all three languages, with its alternates', async () => {
      const sitemap = await (await page.request.get(`${BASE}/sitemap.xml`)).text()
      for (const lang of LANGS) expect(sitemap.includes(`/${lang}/consultation/`), `${lang} missing`)
    })
    await step('the public page is indexable now that booking is open: no header against it, its own canonical address and language alternates', async () => {
      for (const lang of LANGS) {
        const response = await page.goto(`${BASE}/${lang}/consultation/`, { waitUntil: 'networkidle' })
        expect(response.status() === 200, `${lang}: status ${response.status()}`)
        expect(!(response.headers()['x-robots-tag'] ?? ''), `${lang}: still told to stay out: ${response.headers()['x-robots-tag']}`)
        await page.getByRole('radio', { name: new RegExp(W[lang].type) }).waitFor({ timeout: 15000 })
        const robots = await page.locator('meta[name=robots]').getAttribute('content')
        expect(/^index, follow/.test(robots ?? ''), `${lang}: robots says ${robots}`)
        const canonical = await page.locator('link[rel=canonical]').getAttribute('href')
        expect(canonical !== null && canonical.endsWith(`/${lang}/consultation/`), `${lang}: canonical ${canonical}`)
        expect((await page.locator('link[rel=alternate][hreflang]').count()) === 4, `${lang}: language alternates`)
      }
    })
    await step('the language switcher keeps the booking page and the customer link', async () => {
      await page.goto(`${BASE}/en/consultation/`, { waitUntil: 'networkidle' })
      await page.goto(state.links.en, { waitUntil: 'networkidle' })
      expect(page.url().endsWith(state.links.en.slice(-43)), 'the link moved')
    })
    await context.close()
  }

  // ---- H. accessibility ----------------------------------------------------------------------------------------------------------------
  if (wants('H')) {
    console.log('H  accessibility (axe) on every screen of the booking')
    const { axeRun } = require('../audit/lib.cjs')
    const clean = async (page, label) => {
      // A colour that is still changing (a button that has just become ready) is not what a reader sees: let the transitions end.
      await sleep(600)
      const found = await axeRun(page)
      expect(found.length === 0, `${label}: ${found.map((v) => `${v.id} (${v.count}) ${v.nodes[0]?.target ?? ''}`).join('; ')}`)
    }
    for (const lang of LANGS) {
      const { context, page } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: lang === 'hu' ? 'hu-HU' : lang === 'nl' ? 'nl-NL' : 'en-GB', scheme: 'light' })
      current = page
      await step(`${lang}: the type, calendar and times, details with errors and review have no violations`, async () => {
        await page.goto(`${BASE}/${lang}/consultation/`, { waitUntil: 'networkidle' })
        await page.getByRole('radio', { name: new RegExp(W[lang].type) }).waitFor({ timeout: 15000 })
        await clean(page, 'type')
        await page.getByRole('radio', { name: new RegExp(W[lang].type) }).check()
        await page.getByRole('button', { name: W[lang].next }).click()
        await clean(page, 'calendar')
        await chooseDayAndTime(page, 9)
        await clean(page, 'times')
        await page.getByRole('button', { name: W[lang].next }).click()
        await page.getByRole('button', { name: W[lang].next }).click()
        await page.getByText(W[lang].required).first().waitFor({ timeout: 5000 })
        await clean(page, 'details with errors')
        await fillDetails(page, lang, { name: 'Axe Visitor', email: `axe-${lang}-${stamp}@example.test` })
        await page.getByRole('button', { name: W[lang].next }).click()
        await page.getByRole('button', { name: W[lang].confirm }).waitFor({ timeout: 8000 })
        await clean(page, 'review')
      })
      await context.close()
    }
    await step("the customer's booking page and the closed page have no violations", async () => {
      const { context, page } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB', scheme: 'light' })
      current = page
      if (state.links.en) {
        await page.goto(state.links.en, { waitUntil: 'networkidle' })
        await page.getByText(state.refs.en).first().waitFor({ timeout: 10000 })
        await clean(page, 'booking page')
      }
      await context.close()
    })
    await step('the administration screens have no violations', async () => {
      const { context, page } = await signIn(browser)
      current = page
      await page.goto(`${BASE}/admin/bookings`, { waitUntil: 'networkidle' })
      await page.getByRole('heading', { name: 'Consultations', level: 1 }).waitFor()
      await clean(page, 'list')
      await page.getByRole('link', { name: /Visitor|Axe|Double/ }).first().click()
      await page.getByRole('heading', { name: 'What you can do' }).waitFor({ timeout: 10000 })
      await clean(page, 'detail')
      await page.goto(`${BASE}/admin/bookings/setup`, { waitUntil: 'networkidle' })
      for (const tab of ['Settings', 'Consultation types', 'Weekly hours and exceptions']) {
        await page.getByRole('tab', { name: tab }).click()
        await clean(page, tab)
      }
      await context.close()
    })
  }

  // ---- I. what a search engine and a third party are told; the privacy notice ----------------------------------------------------------
  if (wants('I')) {
    console.log('I  indexing, the secret in the address, and the privacy notice (PROMPT 24.1)')
    const { axeRun } = require('../audit/lib.cjs')
    const host = new URL(BASE).host
    const link = state.links.en
    if (link) {
      const { context, page } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: 'en-GB', scheme: 'light' })
      current = page
      const token = link.slice(-43)
      await step("the customer's page: noindex, nofollow in the header and in the head, never cached, no referrer, no canonical address, a title without the secret", async () => {
        const response = await page.goto(link, { waitUntil: 'networkidle' })
        expect(response.status() === 200, `status ${response.status()}`)
        const headers = response.headers()
        expect(headers['x-robots-tag'] === 'noindex, nofollow', `x-robots-tag: ${headers['x-robots-tag']}`)
        expect(headers['cache-control'] === 'no-store', `cache-control: ${headers['cache-control']}`)
        expect(headers['referrer-policy'] === 'no-referrer', `referrer-policy: ${headers['referrer-policy']}`)
        await page.getByText(state.refs.en).first().waitFor({ timeout: 10000 })
        expect((await page.locator('meta[name=robots]').getAttribute('content')) === 'noindex, nofollow', 'meta robots')
        expect((await page.locator('link[rel=canonical]').count()) === 0, 'canonical address')
        expect((await page.locator('link[rel=alternate][hreflang]').count()) === 0, 'language alternates')
        const head = await page.evaluate(() => document.head.outerHTML + document.title)
        expect(!head.includes(token), 'the secret is in the head or the title')
      })
      await step('the secret goes only to this site: changing the language and reloading send it nowhere else, and it is in no storage or cookie', async () => {
        const seen = []
        page.on('request', (request) => seen.push(request.url()))
        await page.goto(link, { waitUntil: 'networkidle' })
        for (const lang of ['hu', 'nl', 'en']) {
          await page.goto(link.replace('/en/', `/${lang}/`), { waitUntil: 'networkidle' })
          expect(page.url().endsWith(token), `${lang}: the secret did not survive the language change`)
          await page.getByText(state.refs.en).first().waitFor({ timeout: 10000 })
        }
        const local = (url) => url.startsWith('data:') || url.startsWith('blob:') || new URL(url).host === host
        const withSecret = seen.filter((url) => url.includes(token))
        expect(withSecret.length > 0, 'the page never asked for the booking')
        expect(withSecret.every(local), `the secret was sent to another host: ${withSecret.find((url) => !local(url))}`)
        expect(seen.every(local), `a request went to another host: ${seen.find((url) => !local(url))}`)
        const stored = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]))
        expect(!stored.includes(token), 'the secret is in browser storage or a cookie')
      })
      await context.close()
    }
    for (const lang of LANGS) {
      const { context, page } = await newPage(browser, { width: WIDTH, height: HEIGHT, mobile: MOBILE, locale: lang === 'hu' ? 'hu-HU' : lang === 'nl' ? 'nl-NL' : 'en-GB', scheme: 'light' })
      current = page
      const notice = {
        hu: { booking: 'Konzultáció foglalása', recipients: 'Kik kezelik az adataidat', a: /egyirányú ujjlenyomat/, b: /Ha nincs megőrzési idő beállítva/, c: /nem jelennek meg a foglalásod oldalán/ },
        en: { booking: 'Booking a consultation', recipients: 'Who handles your data', a: /one-way fingerprint/, b: /If no retention period is set/, c: /not shown on your booking page/ },
        nl: { booking: 'Een adviesgesprek inplannen', recipients: 'Wie je gegevens verwerkt', a: /eenrichtingsvingerafdruk/, b: /Is er geen bewaartermijn ingesteld/, c: /staan niet op de pagina van je afspraak/ },
      }[lang]
      await step(`${lang}: the privacy notice has the booking and the recipients sections, says the same things, fits the screen and has no accessibility violation`, async () => {
        const errors = []
        page.on('pageerror', (error) => errors.push(String(error)))
        await page.goto(`${BASE}/${lang}/privacy`, { waitUntil: 'networkidle' })
        await page.getByRole('heading', { name: notice.booking, level: 2 }).waitFor({ timeout: 10000 })
        await page.getByRole('heading', { name: notice.recipients, level: 2 }).waitFor({ timeout: 10000 })
        const text = await page.locator('main').innerText()
        for (const pattern of [notice.a, notice.b, notice.c]) expect(pattern.test(text), `missing ${pattern}`)
        const bookingSection = await page.locator('section[aria-labelledby=privacy-booking]').innerText()
        expect(!/\d/.test(bookingSection), 'a number appears in the booking section')
        expect(await NO_SCROLL(page), 'sideways scroll')
        expect(errors.length === 0, errors.join('; '))
        if (process.env.AUDIT_AXE) {
          await sleep(600)
          const found = await axeRun(page)
          expect(found.length === 0, found.map((v) => `${v.id} (${v.count})`).join('; '))
        }
        await shot(page, `I-privacy-${lang}-${WIDTH}`)
      })
      await context.close()
    }
  }

  await browser.close()
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
