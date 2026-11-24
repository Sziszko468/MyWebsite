#!/usr/bin/env node
/**
 * Design System Playground (PROMPT 36): the journey of a visitor, in a real browser. It checks, step by step and with its own words when something fails:
 * the page and its way in and out of the Lab, the five laboratories (colour with its validation, contrast and copy; typography; the real components; layout at three
 * widths; motion with replay and reduced motion), that nothing a visitor changes leaks into the site (its theme, its tokens, its storage, the network), reset, the keyboard,
 * three languages, reduced motion, a phone, and what is left after leaving.
 *
 * Needs the DEVELOPMENT server (`npm run dev`, port 5173 by default).
 *
 *   AUDIT_PLAYWRIGHT=<path to playwright> node tools/e2e/playground-journey.cjs [--url http://localhost:5173] [--only <step words>]
 */
const path = require('path')
const { launch, newPage } = require(path.join(__dirname, '..', 'audit', 'lib.cjs'))

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name)
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback
}
const BASE = arg('--url', 'http://localhost:5173').replace(/\/$/, '')
const ONLY = arg('--only', '')
const LANGS = ['hu', 'en', 'nl']
const SECTIONS = ['color', 'type', 'components', 'layout', 'motion']
const ROUTE = '/lab/design-system'

const results = []
const notes = []
const errorsOfPage = []
let mainPage = null

async function step(name, fn) {
  if (ONLY && !name.toLowerCase().includes(ONLY.toLowerCase())) return
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`)
  } catch (error) {
    results.push({ name, ok: false, error: String(error && error.message ? error.message : error).split('\n').filter((line) => line.trim()).slice(0, 4).join(' | ').slice(0, 400) })
    console.log(`  ✗ ${name}: ${results[results.length - 1].error}`)
  }
}
const note = (text) => {
  notes.push(text)
  console.log(`    · ${text}`)
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message)
}

const url = (lang) => `${BASE}/${lang}${ROUTE}`
async function open(page, lang = 'en') {
  await page.goto(url(lang), { waitUntil: 'load' })
  await page.locator('#color').waitFor({ timeout: 40000 })
  await page.waitForTimeout(600)
}

/** What belongs to the SITE: its theme, its tokens on the root, its header, and anything written on <html> or <body>. A visitor's play must leave all of it as it was. */
const siteState = (page) =>
  page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    const header = document.querySelector('header')
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      rootStyle: document.documentElement.getAttribute('style'),
      bodyStyle: document.body.getAttribute('style'),
      brandRed: root.getPropertyValue('--brand-red').trim(),
      brandBlack: root.getPropertyValue('--brand-black').trim(),
      colorBg: root.getPropertyValue('--color-bg').trim(),
      colorAccent: root.getPropertyValue('--color-accent').trim(),
      dur: root.getPropertyValue('--dur-base').trim(),
      headerBg: header ? getComputedStyle(header).backgroundColor : '',
      themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '',
      lang: document.documentElement.getAttribute('lang'),
    }
  })
const storages = (page) => page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }))
const sameSite = (a, b, what) => {
  for (const key of Object.keys(a)) ok(JSON.stringify(a[key]) === JSON.stringify(b[key]), `${what}: the site's ${key} changed from ${JSON.stringify(a[key])} to ${JSON.stringify(b[key])}`)
}

/** A chip of a choice group (a radio button, dressed): checked by its name. */
const choose = async (scope, name) => {
  const radio = scope.getByRole('radio', { name: new RegExp(`^${name}\\b`) })
  // The chip is brought to the middle of the window first: forced, a click lands on whatever is over the element's centre, and the sticky bars can be.
  await radio.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await radio.check({ force: true })
}
const hexField = (page, name) => page.locator('#color fieldset').filter({ hasText: name }).first().locator('input:not([type="color"])')
const colorStage = (page) => page.locator('#color [data-playground-stage]').first()
const tokenOn = (locator, token) => locator.evaluate((el, name) => getComputedStyle(el).getPropertyValue(name).trim(), token)
const live = (page) => page.locator('p[role="status"]').last()
const resetAll = (page) => page.getByRole('button', { name: /^(Reset everything|Mindent visszaállít|Alles terugzetten)$/ })

;(async () => {
  console.log(`Design System Playground journey against ${BASE}`)
  const browser = await launch()
  const { context, page } = await newPage(browser, { width: 1440, height: 900 })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => undefined)
  mainPage = page
  const requests = []
  page.on('pageerror', (error) => errorsOfPage.push(`${page.url()} :: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/WebGL|GPU stall|Failed to load resource|net::ERR|chunk/i.test(message.text())) errorsOfPage.push(`console ${message.text().slice(0, 140)}`)
  })
  page.on('request', (request) => requests.push(request.url()))

  // ── The page and the Lab ─────────────────────────────────────────────────────────────
  await step('the Lab links to the playground from a band of its own, and the six experiences are still six', async () => {
    await page.goto(`${BASE}/en/lab`, { waitUntil: 'load' })
    await page.locator('#experiments article').first().waitFor({ timeout: 40000 })
    ok((await page.locator('#experiments article').count()) === 6, 'the Lab does not list six experiences')
    ok((await page.locator('#experiments a[href*="design-system"]').count()) === 0, 'the playground is among the experiences')
    const band = page.locator('[data-design-tool]')
    ok((await band.count()) === 1, 'no band for the playground')
    ok((await band.locator('a[href$="/lab/design-system"]').count()) === 1, 'the band does not link to the playground')
    await band.locator('a').click()
    await page.locator('#color').waitFor({ timeout: 40000 })
    ok(new URL(page.url()).pathname === `/en${ROUTE}`, `the link went to ${page.url()}`)
  })

  await step('the page: one h1, a labelled navigation, five laboratories, a way back to the Lab, indexable head', async () => {
    await open(page)
    ok((await page.locator('h1').count()) === 1, 'not exactly one h1')
    ok(/Design System\s*Playground/i.test(await page.locator('h1').innerText()), 'the h1 is not the playground')
    ok((await page.getByRole('navigation', { name: 'Playground sections' }).count()) === 1, 'no labelled navigation')
    for (const id of SECTIONS) ok((await page.locator(`section#${id} h2`).count()) === 1, `section ${id} has no h2`)
    const robots = await page.locator('meta[name="robots"]').getAttribute('content').catch(() => null)
    ok(!robots || !/noindex/.test(robots), `robots says ${robots}`)
    ok(/Design System Playground/.test(await page.title()) && /Lab/.test(await page.title()), `title is "${await page.title()}"`)
    await page.getByRole('link', { name: /Back to the Lab/ }).first().click()
    await page.locator('#experiments').waitFor({ timeout: 40000 })
    ok(new URL(page.url()).pathname === '/en/lab', 'the way back did not reach the Lab')
  })

  // ── Colour ─────────────────────────────────────────────────────────────────────────
  await step('colour: starts from the five brand tokens, all marked original, the contrast of the default pair is read', async () => {
    await open(page)
    const expected = { 'Racing Red': '#ff161f', 'Carbon Black': '#0b0b0d', 'Cobalt Blue': '#445cff', 'Warm Paper': '#f4f0e8', Graphite: '#303036' }
    for (const [name, hex] of Object.entries(expected)) ok((await hexField(page, name).inputValue()) === hex, `${name} does not start as ${hex}`)
    ok((await page.locator('#color').getByText('Original brand token').count()) === 5, 'not all five are marked original')
    ok((await page.locator('#color').getByText('Changed here, temporary').count()) === 0, 'something is marked changed at the start')
    ok((await page.locator('#color').getByText('Contrast: 17.30:1').count()) === 1, 'the default pair (paper on black) is not 17.30:1')
    ok((await page.locator('#color').getByText('Every role meets WCAG 2 level AA.').count()) === 1, 'the report does not say every role passes')
    // At the start the stage draws the site's own tokens exactly: nothing is overridden on it.
    ok((await colorStage(page).evaluate((el) => !el.getAttribute('style'))) === true, 'the stage has custom properties before any change')
  })

  await step('colour: a valid HEX reaches the preview at once and nothing outside it; the original stays beside it', async () => {
    await open(page)
    const before = await siteState(page)
    const storeBefore = await storages(page)
    await hexField(page, 'Racing Red').fill('#00ff88')
    await page.waitForTimeout(150)
    ok((await tokenOn(colorStage(page), '--brand-red')) === '#00ff88', 'the stage did not take the colour')
    ok((await tokenOn(colorStage(page), '--color-accent')) === '#00ff88', 'the accent in the stage did not follow')
    const primary = colorStage(page).getByRole('button', { name: /Primary action/ })
    const bg = await primary.evaluate((el) => getComputedStyle(el).backgroundColor)
    ok(bg === 'rgb(0, 255, 136)', `the real button is ${bg}, not the new red`)
    ok((await page.locator('#color').getByText('Changed here, temporary').count()) === 1, 'the change is not marked temporary')
    ok((await page.locator('#color').getByText('Original: #ff161f').count()) === 1, 'the original value is not shown')
    // The site did not change at all.
    sameSite(before, await siteState(page), 'after a colour change')
    ok((await storages(page)) === storeBefore, 'a colour change wrote to storage')
    // The site's own elements outside the stage still use the real red (the header's "Start a project" button).
    const header = await page.locator('header a, header button').filter({ hasText: /Start a project/i }).first().evaluate((el) => getComputedStyle(el).backgroundColor)
    ok(header === 'rgb(255, 22, 31)', `the site's own button is ${header}`)
    // Another section's stage takes the same palette (components and layout are drawn with it).
    await page.locator('#components').scrollIntoViewIfNeeded()
    ok((await tokenOn(page.locator('#components [data-playground-stage]').first(), '--brand-red')) === '#00ff88', 'the component stage did not take the palette')
  })

  await step('colour: a wrong value says why, marks the field invalid, keeps the last valid colour, and a picker works', async () => {
    await open(page)
    const field = hexField(page, 'Racing Red')
    await field.fill('#00ff88')
    for (const [text, message] of [['#12', 'A HEX colour has three or six digits.'], ['#gg0000', 'Only the digits 0–9 and the letters a–f are allowed.'], ['', 'Enter a HEX colour, for example #ff161f.']]) {
      await field.fill(text)
      await page.waitForTimeout(100)
      ok((await field.getAttribute('aria-invalid')) === 'true', `"${text}" is not marked invalid`)
      ok((await page.locator('#color').getByText(message).count()) >= 1, `"${text}" does not say "${message}"`)
      ok((await tokenOn(colorStage(page), '--brand-red')) === '#00ff88', `the preview did not keep the last valid colour after "${text}"`)
    }
    await field.fill('f00')
    ok((await field.getAttribute('aria-invalid')) === null, 'a valid short HEX is still marked invalid')
    ok((await tokenOn(colorStage(page), '--brand-red')) === '#ff0000', 'a three-digit HEX did not become its six-digit colour')
    // The native picker.
    await page.locator('#color input[type="color"]').nth(2).fill('#123456')
    ok((await hexField(page, 'Cobalt Blue').inputValue()) === '#123456', 'the picker did not set the HEX field')
    // Restore one colour.
    await page.getByRole('button', { name: /^Restore Cobalt Blue$/ }).click()
    ok((await hexField(page, 'Cobalt Blue').inputValue()) === '#445cff', 'restore did not bring the original back')
  })

  await step('colour: copy puts the value on the clipboard and says so; the pair shows its WCAG levels in words', async () => {
    await open(page)
    await page.getByRole('button', { name: /^Copy the value of Racing Red$/ }).click()
    await page.waitForTimeout(200)
    const text = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '')
    ok(text === '#ff161f', `the clipboard has "${text}"`)
    ok(/Copied: #ff161f/.test(await live(page).innerText()), 'the copy was not announced')
    // Carbon Black on Carbon Black cannot be read.
    await choose(page.locator('#color fieldset').filter({ hasText: 'Text colour' }), 'Carbon Black')
    ok((await page.locator('#color').getByText('Contrast: 1.00:1').count()) === 1, 'black on black is not 1.00:1')
    ok((await page.locator('#color ul[aria-label="WCAG 2 evaluation"] strong', { hasText: 'Fail' }).count()) === 5, 'not every level fails for black on black')
    await choose(page.locator('#color fieldset').filter({ hasText: 'Text colour' }), 'Warm Paper')
    ok((await page.locator('#color ul[aria-label="WCAG 2 evaluation"] strong', { hasText: 'Pass' }).count()) === 5, 'paper on black does not pass every level')
    // Racing Red on Warm Paper is not readable as text (the brand's own known limit).
    await choose(page.locator('#color fieldset').filter({ hasText: 'Text colour' }), 'Racing Red')
    await choose(page.locator('#color fieldset').filter({ hasText: 'Background' }), 'Warm Paper')
    const aa = page.locator('#color ul[aria-label="WCAG 2 evaluation"] li').first()
    ok(/Fail/.test(await aa.innerText()), 'Racing Red on Warm Paper is said to pass AA text')
  })

  await step('colour: the report lists every role, and says in words which fail when a palette cannot be read', async () => {
    await open(page)
    await page.locator('#color details summary').click()
    ok((await page.locator('#color details tbody tr').count()) === 9, 'the report does not list nine roles')
    for (const name of ['Racing Red', 'Carbon Black', 'Cobalt Blue', 'Warm Paper', 'Graphite']) await hexField(page, name).fill('#808080')
    await page.waitForTimeout(150)
    ok(/Roles that do not reach WCAG 2 level AA: [1-9]/.test(await page.locator('#color details').innerText()), 'a flat grey palette is not reported as failing')
    ok((await page.locator('#color details tbody tr[data-ok="false"]').count()) >= 1, 'no failing row is marked')
    await page.getByRole('button', { name: 'Reset this section' }).first().click()
    ok((await hexField(page, 'Racing Red').inputValue()) === '#ff161f', 'the section reset did not restore the colours')
    ok(/Every role meets/.test(await page.locator('#color details').innerText()), 'the report did not recover after the reset')
  })

  await step('the preview theme: dark and light change the previews only, never the site', async () => {
    await open(page)
    const before = await siteState(page)
    await page.getByRole('radio', { name: 'Light' }).check({ force: true })
    await page.waitForTimeout(200)
    ok((await colorStage(page).getAttribute('data-theme')) === 'light', 'the colour stage is not light')
    ok((await tokenOn(colorStage(page), '--color-bg')) === '#f4f0e8', 'the light stage does not read Warm Paper as its background')
    const type = page.locator('#type [data-playground-stage]')
    ok((await type.count()) === 2 && (await type.nth(0).getAttribute('data-theme')) === 'dark' && (await type.nth(1).getAttribute('data-theme')) === 'light', 'the type previews are not one dark and one light')
    sameSite(before, await siteState(page), 'after the preview theme')
    ok(/light theme/i.test(await live(page).innerText()), 'the theme change is not announced')
    await page.getByRole('radio', { name: 'Dark' }).check({ force: true })
  })

  // ── Typography ─────────────────────────────────────────────────────────────────────
  await step('type: the three project typefaces only; size, weight, line height, spacing and width reach the preview', async () => {
    await open(page)
    const labels = await page.locator('#type fieldset').first().locator('label').allInnerTexts()
    ok(labels.length === 3 && /archivo/i.test(labels[0]) && /system/i.test(labels[1]) && /monospace/i.test(labels[2]), `typefaces: ${labels.join(' | ')}`)
    const heading = page.locator('#type [data-playground-stage]').first().getByRole('heading', { level: 3 })
    const size = (await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)))
    ok(Math.abs(size - 35.2) < 0.3, `the heading is ${size}px, not 18 x 1.25^3 = 35.2`)
    await page.locator('#type').getByLabel('Body size').fill('24')
    await page.waitForTimeout(100)
    const size2 = await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    ok(Math.abs(size2 - 46.9) < 0.3, `after 24px the heading is ${size2}px, not 46.9`)
    await page.locator('#type').getByLabel('Heading weight').fill('300')
    ok((await heading.evaluate((el) => getComputedStyle(el).fontWeight)) === '300', 'the heading weight did not change')
    await page.locator('#type').getByLabel('Width').fill('80')
    ok((await heading.evaluate((el) => getComputedStyle(el).fontStretch)) === '80%', 'the width axis did not reach the heading')
    await page.locator('#type').getByLabel('Line height').fill('1')
    await page.locator('#type').getByLabel('Letter spacing').fill('0.2')
    const spacing = await heading.evaluate((el) => getComputedStyle(el).letterSpacing)
    ok(parseFloat(spacing) > 4, `letter spacing is ${spacing}`)
    // Monospace: two weights, no width axis, and the stack really is a monospace one.
    await choose(page.locator('#type'), 'Monospace')
    ok((await page.locator('#type').getByLabel('Width').count()) === 0, 'the width control is still offered for monospace')
    ok(/mono/i.test(await heading.evaluate((el) => getComputedStyle(el).fontFamily)), 'the heading is not set in the monospace stack')
    ok((await page.locator('#type').getByText('The system and monospace stacks have two weights.').count()) === 1, 'no note about the two weights')
    const light = page.locator('#type [data-playground-stage]').nth(1)
    ok((await light.getByRole('heading', { level: 3 }).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))) > 40, 'the light stage did not follow the same style')
  })

  await step('type: a visitor’s own words are shown as text, limited in length, and go nowhere', async () => {
    await open(page)
    const before = requests.length
    const storeBefore = await storages(page)
    const heading = page.locator('#type').getByLabel('Heading text')
    ok((await heading.getAttribute('maxlength')) === '80', 'the heading field is not limited to 80')
    await heading.fill('<img src=x onerror="window.__xss=1"><b>bold</b>')
    await page.waitForTimeout(150)
    ok((await page.locator('#type [data-playground-stage] img').count()) === 0, 'markup became an element')
    ok(/<img src=x onerror=/.test(await page.locator('#type [data-playground-stage]').first().innerText()), 'the markup is not shown as text')
    ok((await page.evaluate(() => window.__xss)) === undefined, 'a script ran')
    await page.locator('#type').getByLabel('Body text').fill('line one\nline two')
    ok(!/\n/.test(await page.locator('#type [data-playground-stage] p').nth(1).innerText()), 'a line break survived in the paragraph')
    ok((await storages(page)) === storeBefore, 'typing wrote to storage')
    const after = requests.slice(before).filter((u) => !/@vite|\/node_modules\/|\.hot-update|\/src\/|\.(woff2?|ttf)(\?|$)/.test(u))
    ok(after.length === 0, `typing made requests: ${after.slice(0, 3).join(', ')}`)
    await page.getByRole('button', { name: 'Reset this section' }).nth(1).click()
    ok((await heading.inputValue()) === '', 'the reset did not clear the heading text')
  })

  // ── Components ─────────────────────────────────────────────────────────────────────
  await step('components: every real component draws with its variants, and a link in a preview never leaves the page', async () => {
    await open(page)
    const pick = (name) => choose(page.locator('#components fieldset').first(), name)
    const stage = page.locator('#components [data-playground-stage]')
    // Buttons: variant, size, loading, outcome.
    await pick('Buttons')
    ok((await stage.getByRole('button', { name: /Press me/ }).count()) === 1, 'no real button')
    // Located by position: while it waits, its name is the loading label.
    const button = stage.locator('button').first()
    await choose(page.locator('#components'), 'Text')
    await choose(page.locator('#components'), 'Large')
    await choose(page.locator('#components'), 'Success')
    ok((await button.getAttribute('data-status')) === 'success', 'the outcome did not reach the button')
    await button.click()
    ok((await button.getAttribute('aria-busy')) === 'true', 'pressing the button does not show its loading state')
    await page.waitForFunction(() => !document.querySelector('#components button[aria-busy="true"]'), null, { timeout: 4000 })
    // Badges.
    await pick('Badges')
    ok((await stage.locator('span').filter({ hasText: /demo|Demo/ }).count()) >= 1, 'no status badge')
    await choose(page.locator('#components'), 'Neutral')
    ok((await stage.getByText('Badge', { exact: true }).count()) === 1, 'no neutral badge')
    // Fields: label, hint, error, typed text stays here.
    await pick('Form fields')
    ok((await stage.locator('input:not([type]), input[type="text"], textarea, select, input[type="checkbox"]').count()) === 4, 'not four controls')
    await page.locator('#components').getByRole('switch', { name: 'Invalid field' }).check({ force: true })
    await page.waitForTimeout(100)
    ok((await stage.locator('[aria-invalid="true"]').count()) >= 3, 'the invalid state did not reach the fields')
    await stage.getByLabel('Name').first().fill('Typed here')
    // Links: clicking does not leave.
    await pick('Links')
    const here = page.url()
    await stage.getByRole('link', { name: /A link in the middle/ }).click()
    ok(page.url() === here, `a link in the preview navigated to ${page.url()}`)
    await stage.getByRole('link', { name: /Text button/ }).click()
    ok(page.url() === here, 'the text button navigated')
    // Navigation: the real main navigation.
    await pick('Navigation')
    ok((await stage.getByRole('navigation', { name: 'Navigation' }).count()) === 1, 'no navigation')
    await stage.getByRole('link', { name: 'Contact' }).click()
    ok(page.url() === here, 'a navigation link left the playground')
    // Section heading, service card, project card.
    await pick('Section heading')
    ok((await stage.getByRole('heading', { name: 'What I build' }).count()) === 1, 'no section heading')
    await pick('Service card')
    ok((await stage.getByRole('heading', { name: 'Sample service' }).count()) === 1, 'no service card')
    ok((await stage.getByText('Request a custom quote').count()) === 1, 'the price is not one of the real states')
    ok((await stage.getByText(/€|EUR|HUF/).count()) === 0, 'a price was made up')
    await pick('Project card')
    ok((await stage.getByRole('heading', { name: 'Sample project' }).count()) === 1, 'no project card')
    await stage.getByRole('link', { name: /Sample project/ }).first().click()
    ok(page.url() === here, 'the project card navigated')
    // Reset the component.
    await page.getByRole('button', { name: 'Reset this component' }).click()
    ok(page.url() === here, 'still here')
  })

  await step('components: reset restores the component; the component list holds nothing from the admin', async () => {
    await open(page)
    const pick = (name) => choose(page.locator('#components fieldset').first(), name)
    await pick('Buttons')
    await choose(page.locator('#components'), 'Text')
    await page.locator('#components').getByRole('switch', { name: 'Disabled' }).check({ force: true })
    ok((await page.locator('#components [data-playground-stage] button[disabled]').count()) === 1, 'disabled did not reach the button')
    await page.getByRole('button', { name: 'Reset this component' }).click()
    ok((await page.locator('#components [data-playground-stage] button[disabled]').count()) === 0, 'the reset left the button disabled')
    const names = await page.locator('#components fieldset').first().locator('label').allInnerTexts()
    ok(names.length === 8 && !names.some((n) => /admin|login|password|portal/i.test(n)), `component list: ${names.join(' | ')}`)
  })

  // ── Layout ─────────────────────────────────────────────────────────────────────────
  await step('layout: the same layout at three widths, columns that really fit, safe bounds, and no sideways scroll', async () => {
    await open(page)
    const readout = () => page.locator('#layout p').filter({ hasText: /^Frame:/ }).innerText()
    const columns = async () => page.locator('#layout ul').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
    await choose(page.locator('#layout fieldset').first(), 'Phone')
    await page.waitForTimeout(250)
    const phone = await columns()
    await choose(page.locator('#layout fieldset').first(), 'Tablet')
    await page.waitForTimeout(250)
    const tablet = await columns()
    await choose(page.locator('#layout fieldset').first(), 'Desktop')
    await page.waitForTimeout(250)
    const desktop = await columns()
    ok(phone === 1 && tablet >= 2 && desktop === 3 && phone < tablet && tablet <= desktop, `columns at phone/tablet/desktop: ${phone}/${tablet}/${desktop}`)
    note(`layout columns at 360 / 768 / 1280: ${phone} / ${tablet} / ${desktop}; readout "${await readout()}"`)
    const frame = await page.locator('#layout [data-playground-stage] > div').first().evaluate((el) => Math.round(el.getBoundingClientRect().width))
    ok(frame <= 1280, `the frame is ${frame}px`)
    // Bounds of every slider.
    for (const [label, min, max] of [['Container width', 280, 1280], ['Columns', 1, 6], ['Gap', 0, 64], ['Padding', 0, 64], ['Corner radius', 0, 40], ['Preview width', 320, 1280]]) {
      const range = page.locator('#layout').getByLabel(label, { exact: true }).last()
      ok(Number(await range.getAttribute('min')) === min && Number(await range.getAttribute('max')) === max, `${label} is not bounded ${min}..${max}`)
    }
    // Alignment and radius reach the grid and the cards.
    await choose(page.locator('#layout fieldset').filter({ hasText: 'Alignment' }), 'Start')
    ok((await page.locator('#layout ul').first().evaluate((el) => getComputedStyle(el).alignItems)) === 'start' || (await page.locator('#layout ul').first().evaluate((el) => getComputedStyle(el).alignItems)) === 'flex-start', 'alignment did not reach the grid')
    await page.locator('#layout').getByLabel('Corner radius', { exact: true }).fill('40')
    ok((await page.locator('#layout article').first().evaluate((el) => getComputedStyle(el).borderTopLeftRadius)) === '40px', 'the radius did not reach the real card')
    await page.locator('#layout').getByLabel('Gap', { exact: true }).fill('64')
    ok((await page.locator('#layout ul').first().evaluate((el) => getComputedStyle(el).columnGap)) === '64px', 'the gap did not reach the grid')
    ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'the page scrolls sideways')
    await page.getByRole('button', { name: 'Reset this section' }).nth(3).click()
    ok((await page.locator('#layout').getByLabel('Gap', { exact: true }).inputValue()) === '24', 'the reset did not restore the gap')
  })

  // ── Motion ─────────────────────────────────────────────────────────────────────────
  await step('motion: examples replay, parameters reach them, nothing loops', async () => {
    await open(page)
    await page.locator('#motion').scrollIntoViewIfNeeded()
    const cards = page.locator('#motion ul li').filter({ has: page.locator('article') })
    const duration = (locator) => locator.first().evaluate((el) => getComputedStyle(el).animationDuration)
    await page.locator('#motion').getByLabel('Duration').fill('600')
    ok((await duration(cards)) === '0.6s', `the entrance lasts ${await duration(cards)}, not 0.6s`)
    await page.locator('#motion').getByLabel('Distance').fill('48')
    await page.locator('#motion').getByLabel('Stagger').fill('100')
    ok((await cards.nth(2).evaluate((el) => getComputedStyle(el).animationDelay)) === '0.2s', 'the stagger did not reach the third card')
    // Replay restarts the animation (a new element, so a new running animation).
    await page.locator('#motion article').filter({ hasText: 'Card entrance' }).getByRole('button', { name: /Replay/ }).click()
    const running = await page.evaluate(() => document.querySelector('#motion [data-playground-stage]').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length)
    ok(running >= 1, 'the replay did not start an animation')
    ok(/Played again: Card entrance/.test(await live(page).innerText()), 'the replay was not announced')
    await page.waitForTimeout(1500)
    const infinite = await page.evaluate(() => document.querySelector('#motion [data-playground-stage]').getAnimations({ subtree: true }).filter((a) => a.effect.getComputedTiming().iterations === Infinity).length)
    ok(infinite === 0, `${infinite} animation(s) loop for ever`)
    // The easing curves are the site's own.
    await choose(page.locator('#motion fieldset').filter({ hasText: 'Easing' }), 'Elastic')
    const ease = await page.locator('#motion [data-playground-stage]').first().evaluate((el) => getComputedStyle(el).getPropertyValue('--pg-ease').trim())
    ok(/^cubic-bezier\(0\.34, 1\.45, 0\.64, 1\)$/.test(ease), `the curve is ${ease}`)
    // Button feedback: waits, then outcome, then back.
    const send = page.locator('#motion article').filter({ hasText: 'Button feedback' }).locator('button').nth(1)
    await send.click()
    ok((await send.getAttribute('aria-busy')) === 'true', 'the button does not wait')
    await page.waitForFunction(() => document.querySelector('#motion button[data-status="success"]'), null, { timeout: 3000 })
    // Scroll-inspired reveal: items arrive as they come into the box.
    const box = page.getByRole('region', { name: /scroll/i })
    const hidden = () => box.locator('li[data-state="hidden"]').count()
    const h0 = await hidden()
    await box.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    await page.waitForTimeout(900)
    ok(h0 > (await hidden()), `scrolling the box revealed nothing (${h0} hidden before)`)
    // Page transition concept.
    await page.locator('#motion article').filter({ hasText: 'Page transition concept' }).getByRole('button', { name: 'Next screen' }).click()
    ok((await page.locator('#motion article').filter({ hasText: 'Page transition concept' }).getByText('Work (sample)').count()) === 1, 'the next screen did not appear')
  })

  await step('motion: reduced motion (the visitor’s switch) takes every duration, distance and delay out', async () => {
    await open(page)
    await page.locator('#motion').getByRole('switch', { name: 'Simulate reduced motion' }).check({ force: true })
    await page.waitForTimeout(150)
    const vars = await page.locator('#motion [data-playground-stage]').first().evaluate((el) => {
      const s = getComputedStyle(el)
      return { d: s.getPropertyValue('--pg-duration').trim(), x: s.getPropertyValue('--pg-distance').trim(), g: s.getPropertyValue('--pg-stagger').trim(), base: s.getPropertyValue('--dur-base').trim() }
    })
    ok(vars.d === '0.01ms' && vars.x === '0px' && vars.g === '0ms' && vars.base === '0.01ms', `reduced vars: ${JSON.stringify(vars)}`)
    ok((await page.locator('#motion').getByText(/Reduced motion: no travel and no duration/).count()) === 1, 'no reduced-motion note')
    ok(/^0\.01s|^1e-05s|^0s/.test(await page.locator('#motion ul li').filter({ has: page.locator('article') }).first().evaluate((el) => getComputedStyle(el).animationDuration)), 'the entrance still takes time')
    // The site's own tokens on the root are untouched.
    ok((await siteState(page)).dur === '240ms', 'the site’s duration token changed')
  })

  await step('motion: the system’s reduced-motion setting is respected and said', async () => {
    const reduced = await newPage(browser, { width: 1440, height: 900, reduced: true })
    await open(reduced.page)
    ok((await reduced.page.locator('#motion').getByText('Your system asks for reduced motion: here motion is already switched off.').count()) === 1, 'the system setting is not said')
    const d = await reduced.page.locator('#motion [data-playground-stage]').first().evaluate((el) => getComputedStyle(el).getPropertyValue('--pg-duration').trim())
    ok(d === '0.01ms', `the stage duration is ${d} under the system's reduced motion`)
    await reduced.context.close()
  })

  // ── Isolation and reset ────────────────────────────────────────────────────────────
  await step('isolation: after playing in every section, nothing of the site changed, nothing was stored, nothing was requested', async () => {
    await open(page)
    const before = await siteState(page)
    const storeBefore = await storages(page)
    const first = requests.length
    await hexField(page, 'Cobalt Blue').fill('#ffcc00')
    await page.getByRole('radio', { name: 'Light' }).check({ force: true })
    await page.locator('#type').getByLabel('Body size').fill('30')
    await page.locator('#type').getByLabel('Body text').fill('Typed words that must stay here')
    await page.locator('#layout').getByLabel('Columns', { exact: true }).fill('5')
    await page.locator('#motion').getByLabel('Duration').fill('1000')
    await choose(page.locator('#components fieldset').first(), 'Form fields')
    await page.locator('#components [data-playground-stage]').getByLabel('Name').first().fill('Somebody')
    await page.waitForTimeout(300)
    sameSite(before, await siteState(page), 'after play in every section')
    ok((await storages(page)) === storeBefore, 'play wrote to storage')
    const made = requests.slice(first).filter((u) => !/@vite|\/node_modules\/|\.hot-update|\/src\/|\.(woff2?|ttf)(\?|$)/.test(u))
    ok(made.length === 0, `play made requests: ${made.slice(0, 4).join(', ')}`)
    ok((await page.locator('html').getAttribute('data-theme')) === before.theme, 'the html theme changed')
    // The site's own header: its theme toggle still works and is the site's.
    note(`site theme stayed "${before.theme}", root style attribute ${JSON.stringify(before.rootStyle)}`)
  })

  await step('reset: everything restores to the originals, and one section resets only itself', async () => {
    await open(page)
    await hexField(page, 'Racing Red').fill('#00ff88')
    await page.locator('#type').getByLabel('Body size').fill('30')
    await page.locator('#layout').getByLabel('Columns', { exact: true }).fill('5')
    await page.locator('#motion').getByLabel('Duration').fill('1000')
    ok(/you have changes/i.test(await page.locator('main').innerText()), 'the page does not say there are changes')
    await page.getByRole('button', { name: 'Reset this section' }).first().click()
    ok((await hexField(page, 'Racing Red').inputValue()) === '#ff161f', 'the colour section did not reset')
    ok((await page.locator('#type').getByLabel('Body size').inputValue()) === '30', 'resetting colour reset type too')
    await resetAll(page).click()
    ok((await page.locator('#type').getByLabel('Body size').inputValue()) === '18', 'reset everything left the body size')
    ok((await page.locator('#layout').getByLabel('Columns', { exact: true }).inputValue()) === '3', 'reset everything left the columns')
    ok((await page.locator('#motion').getByLabel('Duration').inputValue()) === '240', 'reset everything left the duration')
    ok(/everything is original/i.test(await page.locator('main').innerText()), 'the page does not say everything is original')
    ok(/Everything is back to the original\./.test(await live(page).innerText()), 'the reset was not announced')
  })

  // ── Keyboard ───────────────────────────────────────────────────────────────────────
  await step('keyboard: the sections, the theme, the reset and a switch work by key, with a visible focus', async () => {
    await open(page)
    // Tab through to the first section link and look at the focus ring.
    await page.locator('a[href="#color"]').focus()
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement)
      return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth), shadow: style.boxShadow, text: document.activeElement.textContent }
    })
    ok((ring.outline !== 'none' && ring.width >= 2) || ring.shadow !== 'none', `no visible focus on a section link: ${JSON.stringify(ring)}`)
    await page.keyboard.press('Tab')
    ok((await page.evaluate(() => document.activeElement.getAttribute('href'))) === '#type', 'Tab did not move to the next section link')
    // The theme radios by the arrow keys.
    await page.getByRole('radio', { name: 'Dark' }).focus()
    await page.keyboard.press('ArrowRight')
    ok((await page.getByRole('radio', { name: 'Light' }).isChecked()) === true, 'the arrow key did not choose Light')
    await page.keyboard.press('ArrowLeft')
    // A switch by the space bar.
    const sw = page.locator('#motion').getByRole('switch', { name: 'Simulate reduced motion' })
    await sw.focus()
    await page.keyboard.press('Space')
    ok(await sw.isChecked(), 'Space did not turn the switch on')
    // A slider by arrows.
    const size = page.locator('#type').getByLabel('Body size')
    await size.focus()
    await page.keyboard.press('ArrowRight')
    ok((await size.inputValue()) === '19', 'the arrow key did not move the slider by one step')
    // Reset by Enter.
    await resetAll(page).focus()
    await page.keyboard.press('Enter')
    ok((await size.inputValue()) === '18', 'Enter on Reset everything did not reset')
    // The scrollable box can be reached.
    ok((await page.getByRole('region', { name: /scroll/i }).getAttribute('tabindex')) === '0', 'the scroll box is not focusable')
  })

  await step('keyboard: Escape and Tab never trap: Tab from the last control reaches the footer', async () => {
    await open(page)
    await page.locator('#motion').getByRole('button', { name: /Copy CSS/ }).focus()
    for (let i = 0; i < 60; i += 1) {
      await page.keyboard.press('Tab')
      if (await page.evaluate(() => !!document.activeElement.closest('footer'))) return
    }
    throw new Error('Tab never reached the footer: the playground traps the keyboard')
  })

  // ── Languages ──────────────────────────────────────────────────────────────────────
  for (const lang of LANGS) {
    await step(`${lang}: every section speaks the page's language, with no raw key and no untranslated control`, async () => {
      await open(page, lang)
      ok((await page.locator('html').getAttribute('lang')) === lang, '<html lang> does not follow')
      const text = await page.locator('main').innerText()
      ok(!/playground\.[a-z]+\.[a-z]/i.test(text) && !/\{[a-z]+\}/i.test(text) && !/undefined/.test(text), 'a raw key or placeholder shows')
      const probe = { hu: ['Színlabor', 'Mindent visszaállít', 'Vissza a Labhoz', 'Betűtípus-labor', 'Mozgáslabor'], en: ['Colour laboratory', 'Reset everything', 'Back to the Lab', 'Typography laboratory', 'Motion laboratory'], nl: ['Laboratorium voor kleur', 'Alles terugzetten', 'Terug naar het Lab', 'Laboratorium voor lettertypen', 'Laboratorium voor beweging'] }[lang]
      for (const word of probe) ok(text.toLowerCase().includes(word.toLowerCase()), `"${word}" is missing`)
      // A validation message in the page's language.
      await hexField(page, lang === 'hu' ? 'Racing Red' : 'Racing Red').fill('#12')
      const err = { hu: 'A HEX szín három vagy hat jegyű.', en: 'A HEX colour has three or six digits.', nl: 'Een HEX-kleur heeft drie of zes cijfers.' }[lang]
      ok((await page.locator('#color').getByText(err).count()) >= 1, `no error in ${lang}`)
      // The contrast words and the live status.
      await page.locator('#color input[type="color"]').first().fill('#00ff88')
      ok(((await live(page).innerText()) || '') !== undefined, 'live region missing')
    })
  }

  // ── A phone and the smallest width ─────────────────────────────────────────────────
  await step('phone (390 x 844, touch) and 320 px: no sideways scroll, controls a finger wide, every section usable', async () => {
    for (const [w, h] of [[390, 844], [320, 568]]) {
      const phone = await newPage(browser, { width: w, height: h, mobile: true })
      const p = phone.page
      await open(p)
      for (const scheme of ['light']) void scheme
      ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}px: the page scrolls sideways`)
      const small = await p.evaluate(() => [...document.querySelectorAll('main button, main input:not([type=hidden]):not([type=range]), main select, main textarea, main a[href]')]
        .filter((e) => e.getClientRects().length && !e.closest('[data-playground-stage]') && getComputedStyle(e).visibility !== 'hidden' && !(e.type === 'checkbox' || e.type === 'radio'))
        .map((e) => ({ r: e.getBoundingClientRect(), t: (e.textContent || e.getAttribute('aria-label') || e.type || '').trim().slice(0, 24) }))
        .filter(({ r, t }) => (r.height < 43 || r.width < 24) && !/^$/.test(t) && r.width > 0).slice(0, 5))
      ok(small.length === 0, `${w}px: controls under a finger: ${JSON.stringify(small.map((s) => [s.t, Math.round(s.r.width), Math.round(s.r.height)]))}`)
      // Each section's controls can be used by touch.
      await p.locator('#type').getByLabel('Body size').fill('22')
      await choose(p.locator('#layout fieldset').first(), 'Phone')
      ok((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, `${w}px: the page scrolls sideways after play`)
      const frame = await p.locator('#layout [data-playground-stage] > div').first().evaluate((el) => Math.round(el.getBoundingClientRect().width))
      ok(frame <= w, `${w}px: the layout frame is ${frame}px`)
      await phone.context.close()
    }
  })

  // ── Leaving ────────────────────────────────────────────────────────────────────────
  await step('leaving: the playground starts fresh on return, and what it made is released', async () => {
    const counters = async (p) => {
      const client = await p.context().newCDPSession(p)
      await client.send('Performance.enable')
      await client.send('HeapProfiler.collectGarbage')
      const dom = await client.send('Memory.getDOMCounters')
      await client.detach()
      return dom
    }
    await open(page)
    await hexField(page, 'Racing Red').fill('#00ff88')
    await page.locator('#type').getByLabel('Body size').fill('33')
    const visit = async () => {
      await page.goto(`${BASE}/en`, { waitUntil: 'load' })
      await page.waitForTimeout(500)
      await open(page)
      await page.locator('#motion').scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
    }
    await visit()
    ok((await hexField(page, 'Racing Red').inputValue()) === '#ff161f', 'a colour survived leaving and coming back')
    ok((await page.locator('#type').getByLabel('Body size').inputValue()) === '18', 'a size survived leaving and coming back')
    ok((await storages(page)).indexOf('00ff88') === -1, 'the changed colour was stored')
    // Leave through the app's own navigation (no reload), several times, and compare the document's nodes and listeners.
    const away = async () => {
      await page.getByRole('link', { name: 'Back to the Lab' }).first().click()
      await page.locator('#experiments').waitFor({ timeout: 40000 })
      await page.locator('[data-design-tool] a').click()
      await page.locator('#color').waitFor({ timeout: 40000 })
      await page.waitForTimeout(400)
    }
    await away()
    const first = await counters(page)
    for (let i = 0; i < 4; i += 1) await away()
    const last = await counters(page)
    note(`after 4 more round trips: nodes ${first.nodes} → ${last.nodes}, listeners ${first.jsEventListeners} → ${last.jsEventListeners}, documents ${first.documents} → ${last.documents}`)
    ok(last.nodes <= first.nodes + 60, `DOM nodes grew from ${first.nodes} to ${last.nodes}`)
    ok(last.jsEventListeners <= first.jsEventListeners + 20, `listeners grew from ${first.jsEventListeners} to ${last.jsEventListeners}`)
    ok(last.documents <= first.documents + 1, `documents grew from ${first.documents} to ${last.documents}`)
  })

  if (errorsOfPage.length) {
    results.push({ name: 'no page error or console error during the whole journey', ok: false, error: errorsOfPage.slice(0, 5).join(' || ') })
    console.log(`  ✗ no page error or console error during the whole journey: ${errorsOfPage.slice(0, 5).join(' || ')}`)
  } else {
    results.push({ name: 'no page error or console error during the whole journey', ok: true })
    console.log('  ✓ no page error or console error during the whole journey')
  }

  await context.close()
  await browser.close()
  const failed = results.filter((result) => !result.ok)
  console.log(`\n${results.length - failed.length} / ${results.length} steps passed`)
  if (failed.length) for (const f of failed) console.log(`  FAILED: ${f.name}\n          ${f.error}`)
  process.exit(failed.length ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
