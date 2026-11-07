// The Shop 3.0 journeys (PROMPT 09.1), in a real Chrome against the built website served by the real backend (see README.md for the
// scratch server). A visitor compares the four packages on a desktop and on a phone, opens a package's page and comes back to the
// comparison with it still selected; asks for a FULL EXPERIENCE proposal through the configurator; the administrator finds that
// request with every answer, edits the tier comparison and the offer, publishes, and a NEW visitor sees the change; unpublishes, and
// the website's own text returns.
//
//   AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/shop-journey.cjs --base=http://127.0.0.1:8788 \
//        --email=admin@example.test --password=... [--out=<dir>]
//
// Needs a fresh scratch server (the sign-in is limited to 10 per 15 minutes; this signs in several times) and an administrator of a
// THROW-AWAY database: it saves and publishes edits to the comparison and the offer, and puts them back at the end.
const fs = require('fs')
const path = require('path')
const { launch, newPage } = require('../audit/lib.cjs')

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const BASE = arg('base', 'http://127.0.0.1:8788').replace(/\/$/, '')
const EMAIL = arg('email', '')
const PASSWORD = arg('password', '')
const OUT = arg('out', '')
if (OUT) fs.mkdirSync(OUT, { recursive: true })

let passed = 0
let failed = 0
async function step(name, work) {
  try {
    await work()
    passed += 1
    console.log(`  ok    ${name}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL  ${name}\n        ${String(error.message || error).split('\n')[0]}`)
  }
}
const expect = (condition, message) => {
  if (!condition) throw new Error(message)
}
const shot = async (page, name) => {
  if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
}

async function visitor(browser, { width = 1440, height = 900, mobile = false } = {}) {
  const { context, page } = await newPage(browser, { width, height, mobile, scheme: 'dark', reduced: true })
  const problems = []
  page.on('pageerror', (error) => problems.push(`pageerror ${error.message.slice(0, 120)}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) problems.push(message.text().slice(0, 120))
  })
  return { context, page, problems }
}

async function adminSession(browser, size = { width: 1440, height: 900 }, mobile = false) {
  const { context, page } = await newPage(browser, { ...size, mobile, scheme: 'dark', extra: { bypassCSP: true, locale: 'en-GB' } })
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]')
  await page.waitForTimeout(1500)
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await page.click('button[type=submit]')
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15000 })
  return { context, page }
}

const noSideways = async (page, label) => {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
  expect(scrollWidth <= innerWidth + 1, `${label}: the page scrolls sideways (${scrollWidth} > ${innerWidth})`)
}

;(async () => {
  const browser = await launch()
  const unique = `Shop journey ${Date.now() % 100000}`

  console.log('A  Visitor on a desktop: the four-column comparison, a package page, back to the comparison')
  {
    const { context, page, problems } = await visitor(browser)
    await page.goto(`${BASE}/en/services`, { waitUntil: 'load' })
    await page.waitForSelector('table th[scope=col]')
    await step('all four packages are columns of one table, with their tier labels', async () => {
      const heads = await page.locator('table th[scope=col][data-package]').allInnerTexts()
      expect(heads.length === 4, `${heads.length} package columns`)
      for (const [name, label] of [['Launch', 'Essential foundation'], ['Grow', 'Expanded capabilities'], ['Build', 'Advanced solution'], ['Care', 'Continuous support']]) {
        expect(heads.some((text) => text.includes(name) && text.toLowerCase().includes(label.toLowerCase())), `${name} / ${label}`)
      }
    })
    await step('the features are grouped by where they appear: every package, then each tier', async () => {
      const groups = (await page.locator('table th[scope=rowgroup]').allInnerTexts()).map((text) => text.trim().toLowerCase())
      expect(groups[0] === 'in every package', `first group: ${groups[0]}`)
      for (const wanted of ['introduced with launch', 'introduced with grow', 'introduced with build', 'introduced with care']) expect(groups.includes(wanted), `no group "${wanted}"`)
    })
    await step('each higher tier says what it adds to the one below', async () => {
      const text = await page.locator('table').first().innerText()
      expect(/WHAT GROW ADDS TO LAUNCH/i.test(text) && /WHAT BUILD ADDS TO GROW/i.test(text), 'the "adds" row is missing')
    })
    await step('a cell is read as a sentence (included, add-on, custom, not included), never only a mark', async () => {
      const row = page.locator('tr', { has: page.locator('th[scope=row]', { hasText: 'Database integration' }) })
      const cells = await row.locator('td').allInnerTexts()
      expect(cells.length === 4, `${cells.length} cells`)
      expect(/Included in the package/.test(await row.locator('td').nth(2).innerText()), 'Build should include database integration')
      expect(/Available as a custom service/.test(await row.locator('td').nth(0).innerText()), 'Launch: custom service')
      const legend = await page.locator('dl').filter({ hasText: 'optional add-on' }).first().innerText()
      expect(/Included/.test(legend) && /custom service/.test(legend) && /Not part/.test(legend), 'the key is incomplete')
    })
    await step('a feature\'s explanation opens in place and the button says so', async () => {
      const button = page.getByRole('button', { name: /What does A contact section mean\?/ }).first()
      expect((await button.getAttribute('aria-expanded')) === 'false', 'starts closed')
      await button.click()
      expect((await button.getAttribute('aria-expanded')) === 'true', 'did not open')
      expect(await page.getByText('How messages are handled is agreed per project.').first().isVisible(), 'explanation not shown')
    })
    await step('choosing Grow marks its column and says so for a screen reader', async () => {
      await page.getByRole('button', { name: /Select — Grow/ }).click()
      expect((await page.locator('th[data-package=grow]').getAttribute('data-selected')) !== null, 'Grow is not marked')
      expect(/Selected package: Grow/.test(await page.locator('[role=status]', { hasText: 'Selected package' }).first().innerText()), 'not announced')
    })
    await shot(page, 'A-desktop-comparison')
    await step('"View details" opens the package page with all its sections', async () => {
      await page.getByRole('link', { name: /View details — Grow/ }).click()
      await page.waitForFunction(() => /packages\/grow/.test(location.pathname) && document.querySelector('h1')?.textContent?.trim() === 'Grow', null, { timeout: 15000 })
      const h2 = await page.locator('main h2').allInnerTexts()
      for (const wanted of ['Who this package is for', 'Included services', 'What makes this tier different', 'Detailed features', 'Optional add-ons', 'Related services', 'Pricing', 'Questions']) {
        expect(h2.some((text) => text.includes(wanted)), `no section "${wanted}"`)
      }
      expect(!/€|EUR|HUF|Ft\b/.test(await page.locator('main').innerText()), 'a price appears on the page')
    })
    await step('"Compare all packages" returns to the comparison with Grow still selected', async () => {
      await page.getByRole('link', { name: 'Compare all packages' }).first().click()
      await page.waitForFunction(() => /\/services\/?$/.test(location.pathname) && document.querySelector('table th[data-package=grow][data-selected]'), null, { timeout: 15000 })
      expect(/package=grow/.test(page.url()) && /#compare/.test(page.url()), `address: ${page.url()}`)
    })
    await step('no console errors, no sideways scroll', async () => {
      await noSideways(page, 'desktop')
      expect(problems.length === 0, problems.join(' | '))
    })
    await context.close()
  }

  console.log('B  Visitor on a phone: switcher, swipe, groups, two packages side by side')
  {
    const { context, page, problems } = await visitor(browser, { width: 390, height: 844, mobile: true })
    await page.goto(`${BASE}/en/services`, { waitUntil: 'load' })
    await page.waitForSelector('[role=tablist]')
    await step('the table is not drawn: a package switcher is', async () => {
      expect((await page.locator('table th[scope=col][data-package]').count()) === 0, 'the desktop table is on a phone')
      expect((await page.getByRole('tab').count()) === 4, 'four tabs')
    })
    await step('a tab shows its package, with what it adds to the one below and a way to start', async () => {
      await page.getByRole('tab', { name: 'Build' }).click()
      const panel = page.getByRole('tabpanel')
      expect(/What Build adds to Grow/i.test(await panel.innerText()), 'progression missing')
      expect((await panel.getByRole('link', { name: /Start with Build/ }).count()) === 1, 'start link')
      expect((await panel.getByRole('link', { name: /View details/ }).count()) === 1, 'details link')
    })
    await step('the arrow keys move between the tabs', async () => {
      await page.getByRole('tab', { name: 'Build' }).focus()
      await page.keyboard.press('ArrowRight')
      expect((await page.getByRole('tab', { name: 'Care' }).getAttribute('aria-selected')) === 'true', 'ArrowRight did not select Care')
      await page.keyboard.press('Home')
      expect((await page.getByRole('tab', { name: 'Launch' }).getAttribute('aria-selected')) === 'true', 'Home did not select Launch')
    })
    await step('a swipe over the panel changes the package', async () => {
      const box = await page.getByRole('tabpanel').boundingBox()
      const y = Math.round(box.y + 140)
      const cdp = await context.newCDPSession(page)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 330, y }] })
      for (let x = 330; x >= 190; x -= 20) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(300)
      expect((await page.getByRole('tab', { name: 'Grow' }).getAttribute('aria-selected')) === 'true', 'the swipe did not move to Grow')
    })
    await step('the feature groups open and close, and the group of the chosen tier starts open', async () => {
      await page.getByRole('tab', { name: 'Build' }).click()
      const open = page.getByRole('button', { name: /Introduced with Build/ })
      expect((await open.getAttribute('aria-expanded')) === 'true', 'the tier\'s own group should start open')
      const closed = page.getByRole('button', { name: /Introduced with Care/ })
      expect((await closed.getAttribute('aria-expanded')) === 'false', 'another group should start closed')
      await closed.click()
      expect(await page.getByText('Agreed maintenance tasks').first().isVisible(), 'the opened group is empty')
    })
    await step('two packages can be compared side by side on a large phone, differences marked and filterable', async () => {
      await page.getByRole('button', { name: 'Compare two packages' }).click()
      await page.waitForSelector('table')
      const all = await page.locator('table tbody tr').count()
      await page.getByLabel('Show only the differences').check()
      const differing = await page.locator('table tbody tr').count()
      expect(differing > 0 && differing < all, `${differing} of ${all} rows differ`)
      await page.getByRole('button', { name: 'Back to one package' }).click()
      await page.waitForSelector('[role=tabpanel]')
    })
    await shot(page, 'B-phone-comparison')
    await step('no sideways scroll, no console errors', async () => {
      await noSideways(page, '390 px')
      expect(problems.length === 0, problems.join(' | '))
    })
    await context.close()
    const narrow = await visitor(browser, { width: 320, height: 640, mobile: true })
    await narrow.page.goto(`${BASE}/en/services`, { waitUntil: 'load' })
    await narrow.page.waitForSelector('[role=tablist]')
    await step('at 320 px the switcher still fits and there is no side-by-side mode (it needs room)', async () => {
      await noSideways(narrow.page, '320 px')
      expect((await narrow.page.getByRole('button', { name: 'Compare two packages' }).count()) === 0, 'the pair mode is offered at 320 px')
      for (const name of ['Launch', 'Grow', 'Build', 'Care']) expect(await narrow.page.getByRole('tab', { name }).isVisible(), `${name} tab`)
    })
    await narrow.context.close()
  }

  console.log('C  A FULL EXPERIENCE proposal: the page, the configurator, the request')
  {
    const { context, page, problems } = await visitor(browser, { width: 390, height: 844, mobile: true })
    await page.goto(`${BASE}/en/services/full-experience`, { waitUntil: 'load' })
    await page.waitForSelector('h1')
    await step('the flagship page says what it is, with the stages, no price and no package wording', async () => {
      expect(/YOUR IDEA\. BUILT FROM ZERO\./i.test(await page.locator('h1').innerText()), 'headline')
      expect((await page.locator('ol li h3').count()) >= 18, 'fewer than 18 stages')
      const text = await page.locator('main').innerText()
      expect(!/€|EUR\b|HUF\b|\bFt\b/.test(text), 'a price appears')
      expect(/custom quote/i.test(text), 'no "custom quote"')
    })
    await shot(page, 'C-full-experience-phone')
    await step('the services page carries the flagship band and the menu lists it', async () => {
      await page.goto(`${BASE}/en/services`, { waitUntil: 'load' })
      await page.waitForSelector('#full-experience')
      expect(/YOUR IDEA\. BUILT FROM ZERO\./i.test(await page.locator('#full-experience').innerText()), 'band headline')
    })
    await page.goto(`${BASE}/en/services/full-experience/start`, { waitUntil: 'load' })
    await page.waitForSelector('form')
    const heading = () => page.locator('form h2').first().innerText()
    const next = () => page.locator('form button[type=submit]').click()
    await step('the first step asks the project type and will not go on without an answer', async () => {
      expect(/Step 1 of 8/.test(await page.locator('main').innerText()), 'progress')
      expect(/What kind of project is it\?/.test(await heading()), 'first question')
      await next()
      expect(/Choose an option to continue/.test(await page.locator('form').innerText()), 'no required message')
    })
    await step('choosing, then Next, moves on; Back keeps the answer', async () => {
      await page.getByRole('radio', { name: /Web application/ }).check({ force: true })
      await next()
      await page.waitForFunction(() => /Where is the project now/.test(document.querySelector('form h2')?.textContent ?? ''))
      await page.getByRole('button', { name: /Back/ }).click()
      await page.waitForFunction(() => /What kind of project/.test(document.querySelector('form h2')?.textContent ?? ''))
      expect(await page.getByRole('radio', { name: /Web application/ }).isChecked(), 'the answer was lost')
      await next()
      await page.waitForFunction(() => /Where is the project now/.test(document.querySelector('form h2')?.textContent ?? ''))
    })
    await step('a required question again, then the optional ones can be skipped', async () => {
      await next()
      expect(/Choose an option to continue/.test(await page.locator('form').innerText()), 'stage is required')
      await page.getByRole('radio', { name: /Just an idea/ }).check({ force: true })
      await next()
      await page.waitForFunction(() => /Which components/.test(document.querySelector('form h2')?.textContent ?? ''))
      expect((await page.locator('form button[type=submit]').innerText()).trim().toLowerCase() === 'skip', 'an unanswered optional question offers Skip')
      await page.getByRole('checkbox', { name: 'Frontend' }).check({ force: true })
      await page.getByRole('checkbox', { name: 'Database' }).check({ force: true })
      expect((await page.locator('form button[type=submit]').innerText()).trim().toLowerCase() === 'next', 'an answered one says Next')
      await next()
      await page.waitForFunction(() => /How complex/.test(document.querySelector('form h2')?.textContent ?? ''))
      await next() // skipped
      await page.waitForFunction(() => /budget in mind/.test(document.querySelector('form h2')?.textContent ?? ''))
    })
    await step('the budget always has a "not sure yet" way out, and no figure is shown', async () => {
      const text = await page.locator('form').innerText()
      expect(/Not sure yet — let’s discuss it/.test(text), 'no way out')
      expect(!/€|EUR\b|HUF\b/.test(text), 'a figure')
      await page.getByRole('radio', { name: /Not sure yet — let’s discuss it/ }).check({ force: true })
      await next()
      await page.waitForFunction(() => /When would you like it/.test(document.querySelector('form h2')?.textContent ?? ''))
      await next() // timeline skipped
      await page.waitForFunction(() => /Tell us about the idea/.test(document.querySelector('form h2')?.textContent ?? ''))
    })
    await step('the description needs a real sentence', async () => {
      await page.getByLabel('Project description').fill('too short')
      await next()
      expect(/too short/i.test(await page.locator('form').innerText()), 'no length message')
      await page.getByLabel('Project description').fill(`${unique}: a booking platform for a network of small gyms, built from scratch.`)
      await next()
      await page.waitForFunction(() => /How can we reach you/.test(document.querySelector('form h2')?.textContent ?? ''))
    })
    await step('the contact details are validated, the answers are listed with a way to change each', async () => {
      await page.locator('form button[type=submit]').click()
      const text = await page.locator('form').innerText()
      expect(/This field is required/.test(text) && /valid e-mail|required/.test(text) && /tick this/i.test(text), 'missing messages')
      expect(/Web application/.test(text) && /Just an idea/.test(text) && /Frontend, Database/.test(text), 'the review misses an answer')
      expect(/When would you like it\?[\s\S]*skipped/.test(text), 'skipped is not shown as skipped')
      await page.getByLabel('Your name', { exact: true }).fill('Eszter Varga')
      await page.getByLabel('Your e-mail address', { exact: true }).fill('eszter@example.com')
      await page.getByLabel(/Company name/).fill('Gym Network Ltd')
      await page.getByRole('radio', { name: 'Dutch' }).check({ force: true })
      await page.getByRole('checkbox', { name: /I understand that my details are used/ }).check({ force: true })
    })
    await step('sending shows the confirmation only after the server accepted it', async () => {
      const response = page.waitForResponse((r) => r.url().endsWith('/api/quote-requests') && r.request().method() === 'POST')
      await page.locator('form button[type=submit]').click()
      const answer = await response
      expect(answer.status() === 201, `the server answered ${answer.status()}`)
      await page.waitForSelector('text=We have your request')
    })
    await shot(page, 'C-configurator-sent')
    await step('no sideways scroll, no console errors', async () => {
      await noSideways(page, 'configurator')
      expect(problems.length === 0, problems.join(' | '))
    })
    await context.close()
  }

  console.log('D  The administrator finds the request, with every answer')
  let requestId = null
  {
    const { context, page } = await adminSession(browser)
    await step('the request is in the quote list marked FULL EXPERIENCE', async () => {
      await page.goto(`${BASE}/admin/quotes`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('text=Eszter Varga')
      const row = page.locator('tr, li', { hasText: 'Eszter Varga' }).first()
      expect(/FULL EXPERIENCE/.test(await row.innerText()), 'not marked')
      await page.getByRole('link', { name: /Eszter Varga/ }).first().click()
      await page.waitForFunction(() => /\/quotes\/[0-9a-f-]+/.test(location.pathname))
      requestId = page.url().split('/').pop()
    })
    await step('the detail shows the company, the language asked for, every question with its answer, skipped ones marked, and the description', async () => {
      await page.waitForSelector('text=The brief')
      const text = await page.locator('main').innerText()
      for (const wanted of ['Gym Network Ltd', 'Dutch', 'Web application', 'Just an idea', 'Frontend, Database', 'Not sure yet — let’s discuss it', unique]) expect(text.includes(wanted), `the detail lacks "${wanted}"`)
      expect(/When would you like it\?[\s\S]*skipped/.test(text), 'a skipped question is not shown as skipped')
      expect(/no cart lines/i.test(text), 'the note about cart lines')
    })
    await context.close()
  }

  console.log('E  The administrator edits the tier comparison; a new visitor sees it only once it is published')
  {
    const { context, page } = await adminSession(browser)
    await page.goto(`${BASE}/admin/comparison`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('details')
    const first = page.locator('details').first()
    await step('the comparison editor lists the tiers and the features with their levels', async () => {
      expect((await page.locator('details').count()) >= 18, 'fewer than 18 features')
      expect(/launch ✓/i.test(await first.locator('summary').innerText()), 'the summary does not show the levels')
    })
    await step('a change is a draft until it is published', async () => {
      await first.locator('summary').click()
      await first.getByLabel(/^English/).first().fill('A quote written for you, with the scope on paper')
      await first.getByLabel(/^Build/).selectOption('addon')
      await page.getByRole('button', { name: 'Publish' }).click()
      await page.waitForSelector('text=/Save the draft first/')
      await page.getByRole('button', { name: 'Save draft' }).click()
      await page.waitForSelector('text=/Draft saved/')
      const fresh = await visitor(browser)
      await fresh.page.goto(`${BASE}/en/services`, { waitUntil: 'load' })
      await fresh.page.waitForSelector('table')
      expect(!(await fresh.page.locator('table').innerText()).includes('A quote written for you'), 'a draft reached the public page')
      await fresh.context.close()
    })
    await step('publishing makes it public at once for a new visitor, in every language it was written in', async () => {
      await page.getByRole('button', { name: 'Publish' }).click()
      await page.waitForSelector('text=/Published\\. Visitors see it/')
      const fresh = await visitor(browser)
      await fresh.page.goto(`${BASE}/en/services`, { waitUntil: 'load' })
      await fresh.page.waitForSelector('table')
      const row = fresh.page.locator('tr', { has: fresh.page.locator('th[scope=row]', { hasText: 'A quote written for you' }) })
      expect((await row.count()) === 1, 'the edited row is missing')
      expect(/Available as an optional add-on/.test(await row.locator('td').nth(2).innerText()), 'the Build cell did not change')
      await fresh.context.close()
    })
    await step('a rule the server enforces is shown on the field: a feature with a missing translation is not saved', async () => {
      await first.getByLabel(/^Dutch/).first().fill('')
      await page.getByRole('button', { name: 'Save draft' }).click()
      await page.waitForSelector('text=/not acceptable/i')
      expect(await first.getByText('Required.').first().isVisible(), 'no message on the field')
      await first.getByLabel(/^Dutch/).first().fill('Een offerte op maat')
    })
    await step('it is put back as it was (the website\'s own text) so the next run starts from the same place', async () => {
      await first.getByLabel(/^English/).first().fill('A custom quote with the scope written down')
      await first.getByLabel(/^Build/).selectOption('included')
      await page.getByRole('button', { name: 'Save draft' }).click()
      await page.waitForSelector('text=/Draft saved/')
      await page.getByRole('button', { name: 'Publish' }).click()
      await page.waitForSelector('text=/Published\\. Visitors see it/')
    })
    await context.close()
  }

  console.log('F  The administrator edits FULL EXPERIENCE: the copy, the budget ranges; withdrawing it brings the website\'s own text back')
  {
    const { context, page } = await adminSession(browser)
    await page.goto(`${BASE}/admin/full-experience`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[role=tab]')
    await step('the copy tab edits the headline in three languages and the questions tab holds the budget ranges', async () => {
      const headline = page.getByRole('group', { name: 'Headline', exact: true })
      await headline.getByLabel(/^English/).fill('A DIFFERENT HEADLINE. FROM THE ADMIN.')
      await page.getByRole('tab', { name: 'Questions' }).click()
      const budget = page.getByRole('region', { name: /Do you have a budget in mind/ })
      expect((await budget.count()) === 1, 'the budget panel')
      expect(/budget ranges/i.test(await budget.innerText()), 'the budget hint')
    })
    await step('a budget range can be added in all three languages', async () => {
      const panel = page.getByRole('region', { name: /Do you have a budget in mind/ })
      await panel.getByRole('button', { name: 'Add an option' }).click()
      const added = panel.getByRole('group', { name: 'Option', exact: true }).last()
      await added.getByLabel(/^English/).fill('A defined budget range')
      await added.getByLabel(/^Hungarian/).fill('Meghatározott költségvetési sáv')
      await added.getByLabel(/^Dutch/).fill('Een vast budgetbereik')
    })
    await step('saving and publishing puts the copy on the flagship page and the new option in the configurator, for a new visitor', async () => {
      await page.getByRole('button', { name: 'Save draft' }).click()
      await page.waitForSelector('text=/Draft saved/')
      await page.getByRole('button', { name: 'Publish' }).click()
      await page.waitForSelector('text=/Published\\. Visitors see it/')
      const fresh = await visitor(browser)
      await fresh.page.goto(`${BASE}/en/services/full-experience`, { waitUntil: 'load' })
      await fresh.page.waitForSelector('h1')
      expect(/A DIFFERENT HEADLINE\. FROM THE ADMIN\./i.test(await fresh.page.locator('h1').innerText()), 'headline not changed')
      await fresh.page.goto(`${BASE}/en/services/full-experience/start`, { waitUntil: 'load' })
      await fresh.page.waitForSelector('form')
      await fresh.page.getByRole('radio', { name: /Web application/ }).check({ force: true })
      await fresh.page.locator('form button[type=submit]').click()
      await fresh.page.getByRole('radio', { name: /Just an idea/ }).check({ force: true })
      await fresh.page.locator('form button[type=submit]').click()
      for (let i = 0; i < 2; i += 1) await fresh.page.locator('form button[type=submit]').click() // components, complexity: skipped
      await fresh.page.waitForFunction(() => /budget in mind/.test(document.querySelector('form h2')?.textContent ?? ''))
      expect(/A defined budget range/.test(await fresh.page.locator('form').innerText()), 'the new budget option is not offered')
      await fresh.context.close()
    })
    await step('taking it off the site brings the website\'s own text back, and requests are not accepted meanwhile', async () => {
      await page.getByRole('button', { name: 'Take off the site' }).click()
      await page.waitForSelector('text=/Taken off the site/')
      const fresh = await visitor(browser)
      await fresh.page.goto(`${BASE}/en/services/full-experience`, { waitUntil: 'load' })
      await fresh.page.waitForSelector('h1')
      expect(/YOUR IDEA\. BUILT FROM ZERO\./i.test(await fresh.page.locator('h1').innerText()), 'the website\'s own headline did not return')
      await fresh.context.close()
    })
    await step('it is put back as it was', async () => {
      const headline = page.getByRole('tab', { name: 'Copy' })
      await headline.click()
      await page.getByRole('group', { name: 'Headline', exact: true }).getByLabel(/^English/).fill('YOUR IDEA. BUILT FROM ZERO.')
      await page.getByRole('tab', { name: 'Questions' }).click()
      const panel = page.getByRole('region', { name: /Do you have a budget in mind/ })
      await panel.getByRole('button', { name: /Remove “A defined budget range”/ }).click()
      await page.getByRole('button', { name: 'Save draft' }).click()
      await page.waitForSelector('text=/Draft saved/')
      await page.getByRole('button', { name: 'Publish' }).click()
      await page.waitForSelector('text=/Published\\. Visitors see it/')
    })
    await context.close()
  }

  console.log('G  The administration\'s two shop screens on a phone')
  {
    const { context, page } = await adminSession(browser, { width: 390, height: 844 }, true)
    for (const [route, ready] of [['/admin/comparison', 'details'], ['/admin/full-experience', '[role=tab]']]) {
      await step(`${route}: loads, no sideways scroll, the actions are reachable`, async () => {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector(ready)
        await noSideways(page, route)
        expect(await page.getByRole('button', { name: 'Publish' }).isVisible(), 'Publish is not visible')
        const box = await page.getByRole('button', { name: 'Save draft' }).boundingBox()
        expect(box && box.height >= 36, 'the Save button is too small to tap')
      })
    }
    await shot(page, 'G-admin-phone')
    await context.close()
  }

  await browser.close()
  console.log(`\n${passed}/${passed + failed} steps passed`)
  process.exit(failed ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
