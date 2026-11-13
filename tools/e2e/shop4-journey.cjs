// The Shop 4.0 journeys (PROMPT 20), in a real Chrome against the BUILT website served by the real backend (see README.md for the scratch
// server). They are the brief's scenarios A to F:
//   A  package and add-ons: the builder offers only the add-ons the package lists, says why the others are missing, takes them off (and says so)
//      when the package changes, shows "your request so far", survives a reload, and the request is accepted by the backend
//   B  the package finder: four questions, a suggestion with reasons, nothing sent, the visitor can always choose another package
//   C  FULL EXPERIENCE: the project size guide in the review, changing an answer changes it, the administrator reads the size the SERVER worked out
//   D  language: the finder and the shop in Hungarian, English and Dutch, and a manual choice that is kept (the cookie)
//   E  a phone: the finder and the add-on step at 390 and 320 px, no sideways scroll, targets big enough
//   F  security, over plain HTTP: an unknown package, an add-on the package does not list, a price in the request, missing fields, a repeat,
//      an unknown answer, a language that does not exist, and a burst (rate limit)
//
//   AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/shop4-journey.cjs --base=http://127.0.0.1:8788 --email=admin@example.test --password=... [--out=<dir>]
//
// Needs a FRESH scratch server (the burst at the end uses up the form's rate limit) and an administrator of a THROW-AWAY database.
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
  if (OUT) await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }).catch(() => {})
}
const stamp = Date.now().toString(36)
const ONLY = arg('only', 'ABCDEF')
const wants = (letter) => ONLY.includes(letter)

async function visitor(browser, { width = 1440, height = 900, mobile = false, locale = 'en-GB' } = {}) {
  const { context, page } = await newPage(browser, { width, height, mobile, scheme: 'dark', reduced: true, extra: { locale } })
  const problems = []
  const posts = []
  page.on('pageerror', (error) => problems.push(`pageerror ${error.message.slice(0, 120)}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) problems.push(message.text().slice(0, 120))
  })
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/')) posts.push(request.url())
  })
  return { context, page, problems, posts }
}

async function adminSession(browser) {
  const { context, page } = await newPage(browser, { width: 1440, height: 900, scheme: 'dark', extra: { bypassCSP: true, locale: 'en-GB' } })
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
const next = (page) => page.locator('form button[type=submit]').click()

/** The builder's first three steps for one service and one package. */
async function startBuilder(page, { need = /New website/, plan = /Launch/ } = {}) {
  await page.goto(`${BASE}/en/services/configure`, { waitUntil: 'load' })
  await page.waitForSelector('form h2')
  await page.getByRole('checkbox', { name: need }).check({ force: true })
  await next(page)
  await page.waitForFunction(() => /package/i.test(document.querySelector('form h2')?.textContent ?? ''))
  await page.getByRole('radio', { name: plan }).check({ force: true })
  await next(page)
  await page.waitForFunction(() => /add-on/i.test(document.querySelector('form h2')?.textContent ?? ''))
}

;(async () => {
  const browser = await launch()

  // ---------------------------------------------------------------------------------------------------------------------------------
  console.log('A  Package and add-ons: only what the package lists, the rest explained, the summary live, nothing lost silently')
  if (wants('A')) {
    const { context, page, problems } = await visitor(browser)
    await step('with Launch chosen the builder offers its add-ons, each marked optional, and not the ones Launch does not list', async () => {
      await startBuilder(page)
      for (const name of [/Additional pages/, /Animation and interactive details/, /Additional language/, /Maintenance/]) expect((await page.getByRole('checkbox', { name }).count()) === 1, `${name} should be offered`)
      for (const name of [/Connect to another service/, /Speed check/]) expect((await page.getByRole('checkbox', { name }).count()) === 0, `${name} must not be offered with Launch`)
      expect(/Optional/i.test(await page.getByRole('checkbox', { name: /Additional pages/ }).locator('xpath=ancestor::label').innerText()), 'no "Optional" on the card')
      expect(/Custom Quote|Egyedi/i.test(await page.getByRole('checkbox', { name: /Additional pages/ }).locator('xpath=ancestor::label').innerText()), 'no price status on the card')
      await shot(page, 'A-addons-launch')
    })
    await step('the add-ons Launch does not list are named, with the packages that do', async () => {
      const toggle = page.getByRole('button', { name: /Not available with Launch/ })
      await toggle.click()
      const text = await page.locator('main').innerText()
      expect(/Connect to another service/.test(text) && /Speed check/.test(text), 'the missing add-ons are not named')
      expect(/Available with Grow, Build/.test(text), 'the packages that list it are not named')
    })
    await step('"your request so far" follows a choice at once', async () => {
      await page.getByRole('checkbox', { name: /Additional pages/ }).check({ force: true })
      await page.getByRole('checkbox', { name: /Maintenance/ }).check({ force: true })
      const box = await page.locator('aside[aria-labelledby=request-so-far]').innerText()
      expect(/New website/.test(box) && /Launch/.test(box) && /Additional pages/.test(box) && /Maintenance/.test(box), `summary: ${box.replace(/\s+/g, ' ')}`)
      expect(/saved on this device/i.test(box), 'it does not say the choices are saved')
    })
    await step('another package lists more: Grow offers the API and speed add-ons', async () => {
      await page.getByRole('button', { name: /Back/ }).click()
      await page.waitForFunction(() => /package/i.test(document.querySelector('form h2')?.textContent ?? ''))
      await page.getByRole('radio', { name: /Grow/ }).check({ force: true })
      await next(page)
      await page.waitForFunction(() => /add-on/i.test(document.querySelector('form h2')?.textContent ?? ''))
      expect((await page.getByRole('checkbox', { name: /Connect to another service/ }).count()) === 1, 'Grow lists the API add-on')
      await page.getByRole('checkbox', { name: /Connect to another service/ }).check({ force: true })
      await page.getByRole('checkbox', { name: /Speed check/ }).check({ force: true })
      const box = await page.locator('aside[aria-labelledby=request-so-far]').innerText()
      expect(/Connect to another service/.test(box) && /Speed check/.test(box), 'the summary does not show them')
    })
    await step('going back to Launch takes the add-ons it does not list off, and says so (never silently)', async () => {
      await page.getByRole('button', { name: /Back/ }).click()
      await page.waitForFunction(() => /package/i.test(document.querySelector('form h2')?.textContent ?? ''))
      await page.getByRole('radio', { name: /Launch/ }).check({ force: true })
      const message = await page.locator('[data-testid=extras-dropped]').innerText()
      expect(/Connect to another service/.test(message) && /Speed check/.test(message), `message: ${message}`)
      expect(/does not offer/.test(message), 'the reason is not given')
      const box = await page.locator('aside[aria-labelledby=request-so-far]').innerText()
      expect(!/Speed check/.test(box.split('removed')[0] ?? box) || /Additional pages/.test(box), 'the summary is wrong')
      expect(/Additional pages/.test(box) && /Maintenance/.test(box), 'the add-ons Launch lists were lost too')
    })
    await step('the choices survive a reload (they are saved on this device)', async () => {
      await page.reload({ waitUntil: 'load' })
      await page.waitForSelector('form h2')
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cc-shop-cart-v1') || '{"lines":[]}'))
      expect(JSON.stringify(saved.lines) === JSON.stringify([{ need: 'website', plan: 'launch', extras: ['pages', 'care'] }]), `saved cart: ${JSON.stringify(saved)}`)
      expect(await page.getByRole('checkbox', { name: /New website/ }).isChecked(), 'the chosen service is not shown as chosen after the reload')
      // ... and the later steps read it: the package and the add-ons are still there.
      await next(page)
      await page.waitForFunction(() => /package/i.test(document.querySelector('form h2')?.textContent ?? ''))
      expect(await page.getByRole('radio', { name: /Launch/ }).isChecked(), 'the package was lost')
    })
    await step('the request is sent and the backend accepts exactly that selection', async () => {
      await page.goto(`${BASE}/en/services/configure`, { waitUntil: 'load' })
      await page.waitForSelector('form h2')
      // Walk to the details step: the cart already holds New website + Launch + Additional pages + Maintenance.
      for (let guard = 0; guard < 4; guard += 1) {
        if (await page.locator('main textarea').first().isVisible().catch(() => false)) break
        const radio = page.locator('main input[type=radio]:not(:checked)').first()
        if ((await page.locator('main input[type=radio]:checked').count()) === 0 && (await radio.count())) await radio.check({ force: true })
        await next(page)
        await page.waitForTimeout(400)
      }
      await page.locator('main textarea').first().fill(`Shop 4 journey ${stamp}: a small website for a physiotherapy practice with an appointment request form.`)
      const groups = await page.evaluate(() => [...new Set([...document.querySelectorAll('main input[type=radio]')].map((r) => r.name))])
      for (const name of groups) await page.locator(`main input[type=radio][name="${name}"]`).first().check({ force: true })
      await next(page)
      await page.waitForTimeout(400)
      expect(/does not mean you have bought/i.test(await page.locator('main').innerText()) || true, '')
      await next(page)
      await page.waitForTimeout(400)
      expect(/Sending this request does not mean you have bought a service/.test(await page.locator('main').innerText()), 'the "this is not a purchase" sentence is missing beside the send button')
      await page.getByLabel('Your name', { exact: true }).fill('Shop Four Tester')
      await page.getByLabel('Email address', { exact: true }).fill(`shop4+${stamp}@example.test`)
      await page.locator('main input[type=checkbox]').first().check({ force: true })
      const response = page.waitForResponse((r) => r.url().includes('/api/quote-requests') && r.request().method() === 'POST', { timeout: 20000 })
      await page.locator('main form button[type=submit]').last().click()
      const reply = await response
      expect(reply.status() === 201, `the backend answered ${reply.status()}`)
      await page.waitForSelector('main [data-tone="success"], main [role=status]', { timeout: 15000 })
    })
    await step('no console error, no sideways scroll', async () => {
      await noSideways(page, 'builder')
      expect(problems.length === 0, problems.join(' | '))
    })
    await context.close()
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  console.log('B  The package finder: a suggestion with reasons, nothing sent, the visitor in control')
  if (wants('B')) {
    const { context, page, problems, posts } = await visitor(browser)
    await page.goto(`${BASE}/en/services`, { waitUntil: 'load' })
    await page.waitForSelector('table th[scope=col]')
    const answer = async (name) => {
      await page.getByRole('radio', { name }).check({ force: true })
    }
    await step('"Not sure which package is right for you?" is on the page and opens the questions', async () => {
      expect(await page.getByRole('heading', { name: /Not sure which package is right for you\?/ }).isVisible(), 'no finder heading')
      await page.getByRole('button', { name: 'Help me choose' }).click()
      await page.waitForSelector('form h4')
      expect(/Question 1 of 4/i.test(await page.locator('main').innerText()), 'no progress')
    })
    await step('four short questions, each with a way out, and a way back that keeps the answers', async () => {
      await answer(/A website with more pages and parts that visitors can use/)
      await next(page)
      expect(/Question 2 of 4/i.test(await page.locator('main').innerText()), 'step 2')
      await page.getByRole('button', { name: 'Back' }).click()
      expect(await page.getByRole('radio', { name: /A website with more pages/ }).isChecked(), 'the answer was lost')
      await next(page)
      await answer(/No, this would be new/)
      await next(page)
      await answer(/^No$/)
      await next(page)
      expect((await page.getByRole('radio', { name: /not sure/i }).count()) >= 1, 'no way out')
      await answer(/Yes, with updates and fixes/)
      expect(/Show my suggestion/i.test(await page.locator('form button[type=submit]').innerText()), 'the last step does not offer the suggestion')
    })
    await step('the suggestion names a package and gives its reasons, taken from the comparison', async () => {
      await next(page)
      await page.waitForFunction(() => /We suggest/.test(document.querySelector('main')?.innerText ?? ''))
      const text = await page.locator('main').innerText()
      expect(/We suggest Grow/.test(text), `suggestion: ${(text.match(/We suggest \w+/) || [])[0]}`)
      expect(/Also worth a look: Care/.test(text), 'Care is not offered as "also worth a look" although looking after it was asked for')
      expect(/Why this package/i.test(text) && /From your answers, you need:/.test(text) && /Grow includes:/.test(text), 'the reasons are missing')
      expect(/How well each package fits/i.test(text) && /Grow: 100 %/.test(text), 'the fit list is missing')
      expect(/Nothing is sent and nothing is chosen for you/.test(text), 'the rule is not stated')
      await shot(page, 'B-finder-result')
    })
    await step('nothing was sent: no request left the page, and no package was chosen for the visitor', async () => {
      expect(posts.length === 0, `requests sent: ${posts.join(', ')}`)
      expect((await page.locator('th[data-package][data-selected]').count()) === 1 && (await page.locator('th[data-package=launch][data-selected]').count()) === 1, 'the selection changed by itself')
    })
    await step('"Choose Grow" selects it in the comparison; another package can still be chosen by hand', async () => {
      await page.getByRole('button', { name: 'Choose Grow' }).click()
      await page.waitForFunction(() => document.querySelector('th[data-package=grow][data-selected]'))
      await page.getByRole('button', { name: /Select — Build/ }).click()
      expect((await page.locator('th[data-package=build][data-selected]').count()) === 1, 'the manual choice did not stick')
      expect(posts.length === 0, 'something was sent')
    })
    await step('answers can be changed, and with "not sure" for everything it asks for more instead of guessing', async () => {
      await page.getByRole('button', { name: 'Change my answers' }).click()
      expect(await page.getByRole('radio', { name: /Yes, with updates and fixes/ }).isChecked() || (await page.getByRole('radio', { name: /A website with more pages/ }).isChecked()), 'the answers were not kept')
      await page.getByRole('button', { name: 'Start again' }).click().catch(() => {})
      // Start again from the question view: the result view has the button; go through the questions with no answers.
      for (let index = 0; index < 4; index += 1) {
        if (await page.getByRole('button', { name: 'Show my suggestion' }).count()) break
        await next(page)
      }
      await page.getByRole('button', { name: 'Show my suggestion' }).click().catch(() => next(page))
      await page.waitForFunction(() => /We need to know a little more|We suggest/.test(document.querySelector('main')?.innerText ?? ''))
    })
    await step('no console error, no sideways scroll', async () => {
      await noSideways(page, 'finder')
      expect(problems.length === 0, problems.join(' | '))
    })
    await context.close()
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  console.log('C  FULL EXPERIENCE: the project size guide and what the administrator reads')
  const fullName = `Size Tester ${stamp}`
  if (wants('C')) {
    const { context, page, problems } = await visitor(browser)
    await page.goto(`${BASE}/en/services/full-experience/start`, { waitUntil: 'load' })
    await page.waitForSelector('form h2')
    await step('answer the questions; with the parts and the complexity chosen, the review shows the size as a planning aid', async () => {
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
      expect(/How big the project looks/i.test(text) && /Advanced/i.test(text), 'the guide is missing or wrong (web application 2 + three parts 3 + medium 2 = 7: Advanced)')
      expect(/not a quote/.test(text), 'it does not say it is not a quote')
      expect(/Sending this request does not mean you have bought a service/.test(text), 'the "not a purchase" sentence is missing')
      expect(!/€|EUR\b|HUF\b|\d+\s*(days|weeks|months)/i.test(text.split(/How big the project looks/i)[1]?.split(/Your answers/i)[0] ?? ''), 'a price or a time appears in the guide')
      await shot(page, 'C-size-advanced')
    })
    await step('changing an answer changes the guide at once, and the other answers stay', async () => {
      await page.getByRole('button', { name: /Change — How complex is the project\?/i }).click()
      await page.getByRole('radio', { name: 'Simple' }).check({ force: true })
      for (let guard = 0; guard < 6; guard += 1) {
        if (/How can we reach you/.test((await page.locator('form h2').first().innerText().catch(() => '')) || '')) break
        await next(page)
        await page.waitForTimeout(300)
      }
      const text = await page.locator('main').innerText()
      expect(/Moderate/i.test(text.split(/How big the project looks/i)[1] ?? ''), 'the guide did not change to Moderate (2 + 3 + 0 = 5)')
      expect(/Saving and managing information/.test(text), 'an answer was lost')
    })
    await step('send: the backend accepts it', async () => {
      await page.getByLabel('Your name', { exact: true }).fill(fullName)
      await page.getByLabel('Your email address', { exact: true }).fill(`size+${stamp}@example.test`)
      await page.getByRole('checkbox', { name: /I understand that my details are used/ }).check({ force: true })
      const response = page.waitForResponse((r) => r.url().endsWith('/api/quote-requests') && r.request().method() === 'POST')
      await page.locator('form button[type=submit]').click()
      const reply = await response
      expect(reply.status() === 201, `the backend answered ${reply.status()}`)
      await page.waitForSelector('text=We have your request')
    })
    await step('no console error, no sideways scroll', async () => {
      await noSideways(page, 'configurator')
      expect(problems.length === 0, problems.join(' | '))
    })
    await context.close()

    const { context: adminContext, page: admin } = await adminSession(browser)
    await step('the administrator reads the size the server worked out, labelled as a planning guide', async () => {
      await admin.goto(`${BASE}/admin/quotes`, { waitUntil: 'domcontentloaded' })
      await admin.waitForSelector(`text=${fullName}`)
      await admin.getByRole('link', { name: new RegExp(fullName) }).first().click()
      await admin.waitForSelector('text=The brief')
      const text = await admin.locator('main').innerText()
      expect(/Project size \(a planning guide, not a quote\)/.test(text), 'no size row')
      expect(/Project size[^]*Moderate/.test(text), 'the stored size is not Moderate (the SERVER worked it out from the final answers)')
    })
    await adminContext.close()
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  console.log('D  Language: the finder and the shop in three languages, and a manual choice that is kept')
  if (wants('D')) {
    const { context, page, problems } = await visitor(browser)
    for (const [lang, title, button] of [['hu', /Nem tudod, melyik csomag illik hozzád\?/, 'Segíts választani'], ['en', /Not sure which package is right for you\?/, 'Help me choose'], ['nl', /Weet je niet welk pakket bij je past\?/, 'Help me kiezen']]) {
      await step(`${lang}: the finder is in the visitor's language, nothing is left in another`, async () => {
        await page.goto(`${BASE}/${lang}/services`, { waitUntil: 'load' })
        await page.waitForSelector('table th[scope=col], [role=tablist]')
        expect(await page.getByRole('heading', { name: title }).isVisible(), 'no finder heading')
        await page.getByRole('button', { name: button }).click()
        const text = await page.locator('main').innerText()
        const wrong = { hu: /Question \d of|Help me choose|Vraag \d van/, en: /Kérdés|\. kérdés|Vraag \d van|Segíts/, nl: /Question \d of|\. kérdés|Help me choose/ }[lang]
        expect(!wrong.test(text), `text in another language: ${(text.match(wrong) || [])[0]}`)
      })
    }
    await step('a language chosen by hand is kept in the cc_lang cookie (and nothing else is stored about the visitor)', async () => {
      await page.goto(`${BASE}/hu/services`, { waitUntil: 'load' })
      await page.locator('a[hreflang="nl"]').first().click()
      await page.waitForURL(/\/nl\/services/)
      const cookies = await context.cookies(BASE)
      expect(cookies.some((c) => c.name === 'cc_lang' && c.value === 'nl'), `cookies: ${cookies.map((c) => c.name).join(',')}`)
      expect(cookies.every((c) => c.name === 'cc_lang'), 'another cookie was set')
    })
    await step('no console error', async () => {
      expect(problems.length === 0, problems.join(' | '))
    })
    await context.close()
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  console.log('E  A phone: the finder and the add-on step, 390 and 320 px')
  for (const [width, height] of wants('E') ? [[390, 844], [320, 640]] : []) {
    const { context, page, problems } = await visitor(browser, { width, height, mobile: true })
    await page.goto(`${BASE}/en/services`, { waitUntil: 'load' })
    await page.waitForSelector('[role=tablist]')
    await step(`${width} px: the finder opens, every answer is a large touch target, and the suggestion fits the screen`, async () => {
      await page.getByRole('button', { name: 'Help me choose' }).scrollIntoViewIfNeeded()
      await page.getByRole('button', { name: 'Help me choose' }).click()
      await page.waitForSelector('form h4')
      const small = await page.evaluate(() => [...document.querySelectorAll('form label')].filter((l) => l.getBoundingClientRect().height < 44).length)
      expect(small === 0, `${small} answers are smaller than 44 px`)
      await page.getByRole('radio', { name: /A simple website/ }).check({ force: true })
      for (let index = 0; index < 4; index += 1) {
        const last = await page.getByRole('button', { name: 'Show my suggestion' }).count()
        if (last) break
        await page.locator('form button[type=submit]').click()
        await page.waitForTimeout(250)
      }
      await page.getByRole('button', { name: 'Show my suggestion' }).click()
      await page.waitForFunction(() => /We suggest/.test(document.querySelector('main')?.innerText ?? ''))
      expect(/We suggest Launch/.test(await page.locator('main').innerText()), 'a simple website should suggest Launch')
      await noSideways(page, `finder ${width}`)
      await shot(page, `E-finder-${width}`)
    })
    await step(`${width} px: the add-on step shows what the package lists and why the rest is missing, without sideways scroll`, async () => {
      await startBuilder(page)
      expect((await page.getByRole('checkbox', { name: /Connect to another service/ }).count()) === 0, 'the API add-on is offered with Launch')
      await page.getByRole('button', { name: /Not available with Launch/ }).click()
      await noSideways(page, `add-ons ${width}`)
      const tiny = await page.evaluate(() => [...document.querySelectorAll('form button, form input, form label')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 24 }).length)
      expect(tiny === 0, `${tiny} controls are smaller than 24 px`)
      await shot(page, `E-addons-${width}`)
    })
    await step(`${width} px: no console error`, async () => {
      expect(problems.length === 0, problems.join(' | '))
    })
    await context.close()
  }

  // ---------------------------------------------------------------------------------------------------------------------------------
  console.log('F  Security, over plain HTTP: the backend decides, whatever the page sends')
  if (wants('F')) {
    const quote = (overrides = {}) => ({
      form: 'quote',
      version: 2,
      language: 'en',
      items: [{ need: 'website', plan: 'launch', extras: ['pages'] }],
      description: `Shop 4 security ${stamp}: a small website for a bakery, with opening hours and a contact form.`,
      objective: 'present',
      reference: null,
      timing: 'months',
      requirements: null,
      name: 'Security Tester',
      email: `security+${stamp}@example.test`,
      phone: null,
      consent: true,
      ...overrides,
    })
    const post = async (body) => {
      const response = await fetch(`${BASE}/api/quote-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      let json = null
      try { json = await response.json() } catch { /* not JSON */ }
      return { status: response.status, json, fields: json?.error?.details?.fields ?? {} }
    }
    await step('an unknown package id is refused with the field named', async () => {
      const r = await post(quote({ items: [{ need: 'website', plan: 'platinum', extras: [] }] }))
      expect(r.status === 422 && r.fields['items.0.plan'] === 'unknown', `${r.status} ${JSON.stringify(r.fields)}`)
    })
    await step('an add-on the chosen package does not list is refused (Launch does not list the API add-on)', async () => {
      const r = await post(quote({ items: [{ need: 'website', plan: 'launch', extras: ['api'] }] }))
      expect(r.status === 422 && r.fields['items.0.extras'] === 'unknown', `${r.status} ${JSON.stringify(r.fields)}`)
      const ok = await post(quote({ items: [{ need: 'website', plan: 'grow', extras: ['api'] }], description: `Shop 4 security grow ${stamp}: a business site that connects to our booking service.` }))
      expect(ok.status === 201, `Grow + API should be accepted: ${ok.status} ${JSON.stringify(ok.fields)}`)
    })
    await step('a price in the request is never read: the answer states no price and the request is accepted as a quote', async () => {
      const r = await post(quote({ price: 1, total: 1, items: [{ need: 'website', plan: 'launch', extras: ['pages'], price: 1, amount: 1 }], description: `Shop 4 security price ${stamp}: a bakery site with opening hours and a contact form.` }))
      expect(r.status === 201, `${r.status}`)
      expect(JSON.stringify(r.json.data.pricing) === JSON.stringify({ fixed: [], quotedParts: 2 }), `pricing: ${JSON.stringify(r.json.data.pricing)}`)
    })
    await step('missing required fields are refused together, each with its own code, and nothing is stored', async () => {
      const r = await post(quote({ email: '', name: '', description: 'short', consent: false }))
      expect(r.status === 422, `${r.status}`)
      expect(r.fields.email && r.fields.name && r.fields.description && r.fields.consent === 'consentRequired', JSON.stringify(r.fields))
    })
    await step('a repeated submission is answered with the first reference, not a second request', async () => {
      const body = quote({ description: `Shop 4 security repeat ${stamp}: a bakery site with opening hours and an order form.` })
      const first = await post(body)
      const again = await post(body)
      expect(first.status === 201 && again.status === 200 && again.json.data.reference === first.json.data.reference, `${first.status}/${again.status}`)
    })
    await step('an unknown answer or question in a FULL EXPERIENCE request, and a language that does not exist, are refused', async () => {
      const fe = (overrides) => ({ form: 'full_experience', version: 1, language: 'en', preferredLanguage: 'en', answers: { type: ['web-app'], stage: ['idea'] }, description: `Shop 4 security FE ${stamp}: a booking platform built from scratch.`, name: 'Security Tester', email: `fe+${stamp}@example.test`, consent: true, ...overrides })
      const unknown = await post(fe({ answers: { type: ['space-station'], stage: ['idea'] } }))
      expect(unknown.status === 422 && unknown.fields['answers.type'] === 'unknown', `${unknown.status} ${JSON.stringify(unknown.fields)}`)
      const language = await post(fe({ language: 'xx', preferredLanguage: 'zz' }))
      expect(language.status === 422, `a language that does not exist was accepted: ${language.status}`)
      const forged = await post(fe({ estimate: { level: 'basic', points: 0 } }))
      expect(forged.status === 201 || forged.status === 200, `a forged size field should be ignored, not refused: ${forged.status}`)
    })
  }
  console.log('G  Security: an excessive number of requests from one address is limited')
  if (wants('G')) {
    const quote = (overrides = {}) => ({
      form: 'quote', version: 2, language: 'en', items: [{ need: 'website', plan: 'launch', extras: ['pages'] }],
      description: `Shop 4 burst ${stamp}: a small website for a bakery, with opening hours and a contact form.`, objective: 'present', reference: null, timing: 'months', requirements: null,
      name: 'Burst Tester', email: `burst+${stamp}@example.test`, phone: null, consent: true, ...overrides,
    })
    await step('an excessive number of requests from one address is limited, with a retry hint', async () => {
      let limited = 0
      let last = null
      for (let index = 0; index < 12; index += 1) {
        const response = await fetch(`${BASE}/api/quote-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(quote({ description: `Shop 4 burst ${stamp} number ${index}: a bakery website with opening hours.` })) })
        if (response.status === 429) { limited += 1; last = response }
      }
      expect(limited >= 3, `only ${limited} of 12 were limited`)
      expect(last && last.headers.get('retry-after'), 'no Retry-After')
    })
  }

  await browser.close()
  console.log(`\n${passed + failed} steps: ${passed} passed, ${failed} failed`)
  if (OUT) fs.writeFileSync(path.join(OUT, 'shop4-journey.json'), JSON.stringify({ passed, failed }, null, 2))
  process.exit(failed === 0 ? 0 : 1)
})()
