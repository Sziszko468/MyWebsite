#!/usr/bin/env node
/**
 * Lab 2.0 (PROMPT 34): the journey of a visitor through the Lab, in a real browser. It checks, per step and with its own
 * words when something fails: the overview (six tiles, what steers each), navigation between the experiences, every experience's
 * own controls (parameters, reset, regenerate), full screen (native, refused, unavailable, leaving by navigating away),
 * the keyboard, the three languages, reduced motion, a browser without WebGL, a lost graphics context, what is left running
 * after leaving, a phone, the theme and language switches, and the hidden NFSU2 egg.
 *
 * It needs the DEVELOPMENT server (`npm run dev`, port 5173 by default): the renderer is exposed there as `window.__labGl`,
 * which is how "what is left after leaving" is measured. The production build has no such handle.
 *
 *   AUDIT_PLAYWRIGHT=<path to playwright> node tools/e2e/lab2-journey.cjs [--url http://localhost:5173] [--only <step words>]
 */
const path = require('path')
const { launch, newPage } = require(path.join(__dirname, '..', 'audit', 'lib.cjs'))

const arg = (name, fallback) => {
  const at = process.argv.indexOf(name)
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1] : fallback
}
const BASE = arg('--url', 'http://localhost:5173').replace(/\/$/, '')
const ONLY = arg('--only', '')
const IDS = ['particle-universe', 'liquid-matter', 'type-in-motion', 'infinite-space', 'chromatic-distortion', 'generative-objects']
const NAMES = ['Particle Universe', 'Liquid Matter', 'Type in Motion', 'Infinite Space', 'Chromatic Distortion', 'Generative Objects']
const LANGS = ['hu', 'en', 'nl']

const results = []
const notes = []
let errorsOfPage = []
let mainPage = null

/** The Lab's own navigation: its links share names with the details section's, so they are always asked for here. */
const dock = (p) => p.locator('nav[aria-label="Lab navigation"]')
const leaveFullscreen = (p) => p.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : undefined)).catch(() => undefined)

async function step(name, fn) {
  if (ONLY && !name.toLowerCase().includes(ONLY.toLowerCase())) return
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`  ✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`)
  } catch (error) {
    results.push({ name, ok: false, error: String(error && error.message ? error.message : error).split('\n')[0] })
    console.log(`  ✗ ${name}: ${results[results.length - 1].error}`)
    // A step that failed inside full screen must not leave the next one there.
    if (mainPage) await leaveFullscreen(mainPage)
  }
}
const note = (text) => {
  notes.push(text)
  console.log(`    · ${text}`)
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message)
}

const url = (lang, route) => `${BASE}/${lang}${route}`
const experimentUrl = (lang, id, query = '') => url(lang, `/lab/${id}${query}`)

async function open(page, lang, id, query = '?lab=medium', { calm = false } = {}) {
  await page.goto(experimentUrl(lang, id, query), { waitUntil: 'load' })
  await page.waitForSelector('h1', { timeout: 30000 })
  // The visitor's choice of view is kept for the session, so a step that picked Calm would leave every later one in it.
  if (!calm && (await page.locator('[data-lab-experiment]').getAttribute('data-view')) === 'calm') await page.locator('label', { hasText: 'Live' }).first().click()
}

/** Whether the middle of the stage is the stage (not the panel or any other chrome lying over it). */
const middleIsFree = (page) =>
  page.evaluate(() => {
    const stage = document.querySelector('[data-lab-tier]')
    const box = stage.getBoundingClientRect()
    return stage.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
  })
async function waitLive(page) {
  await page.waitForSelector('[data-ready="true"]', { timeout: 40000 })
}
const frameMode = (page) => page.locator('[data-lab-experiment]').getAttribute('data-fullscreen')

/** Mean absolute difference, 0..255, between two PNG screenshots, computed in the page. */
async function meanDiff(page, a, b) {
  return page.evaluate(
    async ([x, y]) => {
      const toImage = async (base64) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d')
        context.drawImage(bitmap, 0, 0)
        return context.getImageData(0, 0, bitmap.width, bitmap.height).data
      }
      const [da, db] = await Promise.all([toImage(x), toImage(y)])
      if (da.length !== db.length) return 255
      let sum = 0
      for (let i = 0; i < da.length; i += 4) sum += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])
      return sum / (da.length / 4) / 3
    },
    [a.toString('base64'), b.toString('base64')],
  )
}
const stageShot = (page) => page.locator('[data-lab-tier]').screenshot()

;(async () => {
  console.log(`Lab 2.0 journey against ${BASE}`)
  const browser = await launch()
  const { context, page } = await newPage(browser, { width: 1440, height: 900 })
  mainPage = page
  page.on('pageerror', (error) => errorsOfPage.push(`${page.url()} :: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/WebGL|GPU stall|GL Driver|ReadPixels|Automatic fallback|swiftshader/i.test(message.text())) errorsOfPage.push(`console ${message.text().slice(0, 140)}`)
  })

  // ── Overview ──────────────────────────────────────────────────────────────────────────────────
  for (const lang of LANGS) {
    await step(`overview (${lang}): six tiles, each says it is interactive and what steers it`, async () => {
      await page.goto(url(lang, '/lab'), { waitUntil: 'load' })
      await page.waitForSelector('#experiments article', { timeout: 30000 })
      await page.locator('#experiments').scrollIntoViewIfNeeded()
      const tiles = await page.locator('#experiments article').evaluateAll((articles) =>
        articles.map((article) => ({
          id: article.getAttribute('data-id'),
          inputs: [...article.querySelectorAll('li[data-input]')].map((li) => li.getAttribute('data-input')),
          label: article.querySelector('ul[aria-label]')?.getAttribute('aria-label') ?? '',
          words: article.querySelector('ul')?.textContent ?? '',
          badge: [...article.querySelectorAll('span')].some((span) => /Interaktív|Interactive|Interactief/.test(span.textContent ?? '')),
          link: article.querySelector('a[href*="/lab/"]')?.getAttribute('href'),
        })),
      )
      ok(tiles.length === 6, `${tiles.length} tiles`)
      tiles.forEach((tile, index) => {
        ok(tile.id === IDS[index], `tile ${index + 1} is ${tile.id}`)
        ok(tile.inputs.includes('pointer') && tile.inputs.includes('touch') && tile.inputs.includes('keys'), `${tile.id} inputs ${tile.inputs}`)
        ok(tile.label.length > 4, `${tile.id} has no list name`)
        ok(tile.badge, `${tile.id} has no interactive badge`)
        ok(tile.link === `/${lang}/lab/${tile.id}`, `${tile.id} links to ${tile.link}`)
      })
      ok(tiles.filter((tile) => tile.inputs.includes('text')).length === 2, 'two experiences take words')
    })
  }

  // ── Navigation ────────────────────────────────────────────────────────────────────────────────
  await step('navigation: open from the overview, walk next through all six and wrap, previous, back to the overview', async () => {
    await page.goto(url('en', '/lab'), { waitUntil: 'load' })
    await page.waitForSelector('#experiments article', { timeout: 30000 })
    await page.locator('#experiments article').first().getByRole('link', { name: /Open/ }).click()
    await page.waitForURL(/\/en\/lab\/particle-universe/, { timeout: 15000 })
    for (let index = 0; index < 6; index += 1) {
      await page.waitForFunction((name) => document.querySelector('h1')?.innerText.replace(/\s+/g, ' ').toLowerCase().includes(name.toLowerCase()), NAMES[index], { timeout: 20000 })
      ok(page.url().includes(`/en/lab/${IDS[index]}`), `at ${page.url()}, expected ${IDS[index]}`)
      const title = (await page.locator('h1').first().innerText()).replace(/\s+/g, ' ')
      ok(title.toLowerCase().includes(NAMES[index].toLowerCase()) && title.includes(String(index + 1).padStart(2, '0')), `title "${title}"`)
      const position = await page.locator('nav[aria-label="Lab navigation"]').innerText()
      ok(position.includes(`0${index + 1}`) || position.includes(`${index + 1}`), `dock "${position}"`)
      await dock(page).getByRole('link', { name: 'Next experiment' }).click()
      await page.waitForURL(new RegExp(`/en/lab/${IDS[(index + 1) % 6]}`), { timeout: 15000 })
    }
    ok(page.url().includes(IDS[0]), 'did not wrap to the first')
    await dock(page).getByRole('link', { name: 'Previous experiment' }).click()
    await page.waitForURL(new RegExp(`/en/lab/${IDS[5]}`), { timeout: 15000 })
    await dock(page).getByRole('link', { name: 'All experiments' }).click()
    await page.waitForURL(/\/en\/lab\/?$/, { timeout: 15000 })
    await page.goto(experimentUrl('en', IDS[2], '?lab=medium'), { waitUntil: 'load' })
    await page.getByRole('link', { name: /Lab$/ }).first().click()
    await page.waitForURL(/\/en\/lab\/?$/, { timeout: 15000 })
  })

  // ── Every experience: states, panel, help, parameters, reset ─────────────────────────────────
  for (let index = 0; index < 6; index += 1) {
    const id = IDS[index]
    await step(`${id}: live canvas, panel, how-to, a parameter changes and Reset brings it back`, async () => {
      await open(page, 'en', id)
      await waitLive(page)
      ok((await page.locator('[data-lab-tier] canvas').count()) === 1, 'not exactly one canvas on the stage')
      ok((await page.locator('[data-lab-panel]').getAttribute('data-open')) === 'true', 'panel closed on a wide screen')
      const panelBox = await page.locator('[data-lab-panel]').boundingBox()
      ok(panelBox.x + panelBox.width > 1440 - 80 && panelBox.width < 380, `the panel is not at the side: ${JSON.stringify(panelBox)}`)
      ok(await middleIsFree(page), 'something lies over the middle of the stage')
      // How to use it: a native disclosure, opened and closed with the keyboard.
      const summary = page.locator('[data-lab-help] summary')
      await summary.focus()
      await page.keyboard.press('Enter')
      ok(await page.locator('[data-lab-help]').evaluate((el) => el.open), 'how-to did not open')
      ok((await page.locator('[data-lab-help] li').count()) >= 3, 'how-to lists too little')
      await page.keyboard.press('Enter')
      ok(!(await page.locator('[data-lab-help]').evaluate((el) => el.open)), 'how-to did not close')
      // A slider: End on the keyboard, then Reset.
      const slider = page.locator('[data-lab-panel] input[type=range]').first()
      const before = await slider.inputValue()
      await slider.focus()
      await page.keyboard.press('End')
      const changed = await slider.inputValue()
      ok(changed !== before, `slider stayed at ${before}`)
      await page.getByRole('button', { name: 'Reset', exact: true }).click()
      ok((await slider.inputValue()) === before, `Reset left ${await slider.inputValue()} instead of ${before}`)
    })
  }

  await step('particle-universe: the arrangement is a number, Randomise moves it and Reset returns to #1', async () => {
    await open(page, 'en', 'particle-universe')
    await waitLive(page)
    const slider = page.getByLabel('Arrangement')
    ok((await page.locator('output').filter({ hasText: '#1' }).count()) === 1, 'not on #1 at the start')
    await slider.fill('41')
    ok((await page.locator('output').filter({ hasText: '#42' }).count()) === 1, 'the readout is not #42')
    await page.getByRole('button', { name: 'Randomise' }).click()
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    ok((await slider.inputValue()) === '0', 'Reset did not go back to arrangement zero')
    ok((await page.locator('[data-lab-panel] input[type=range]').count()) >= 5, 'too few parameter controls')
  })

  await step('chromatic-distortion: three modes, the direction control goes with the radial mode, Reset returns to Mixed', async () => {
    await open(page, 'en', 'chromatic-distortion')
    await waitLive(page)
    const radios = page.locator('[data-lab-panel] input[type=radio]')
    ok((await page.locator('[data-lab-panel] fieldset').first().locator('input[type=radio]').count()) === 3, 'not three modes')
    ok((await page.getByText('Colour displacement direction').count()) === 1, 'no direction control in Mixed')
    await page.locator('label', { hasText: 'Radial' }).click()
    ok((await page.getByText('Colour displacement direction').count()) === 0, 'direction control still there in Radial')
    await page.locator('label', { hasText: 'Linear' }).click()
    ok((await page.getByText('Colour displacement direction').count()) === 1, 'no direction control in Linear')
    await page.locator('label', { hasText: 'Radial' }).click()
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    ok(await page.locator('label', { hasText: 'Mixed' }).locator('input').isChecked(), 'Reset did not select Mixed')
    ok((await radios.count()) >= 3, 'radios missing')
    // The mode is a different picture: the same stage, calm and still, in two modes.
    await page.locator('label', { hasText: 'Calm' }).click()
    await page.waitForTimeout(900)
    const mixed = await stageShot(page)
    await page.locator('label', { hasText: 'Radial' }).click()
    await page.waitForTimeout(900)
    const radial = await stageShot(page)
    const difference = await meanDiff(page, mixed, radial)
    note(`chromatic: mean pixel difference between Mixed and Radial (calm, pointer away) = ${difference.toFixed(2)} / 255`)
    ok(difference > 1, `changing the mode did not repaint the calm stage (${difference.toFixed(2)})`)
    await page.locator('label', { hasText: 'Live' }).first().click()
  })

  await step('infinite-space: a drag turns the view and it stays where it is let go; Recentre and Reset bring it back; the keyboard recentres with Home', async () => {
    await open(page, 'en', 'infinite-space')
    await waitLive(page)
    const look = () => page.evaluate(() => window.__labView())
    await page.waitForFunction(() => typeof window.__labView === 'function', null, { timeout: 5000 })
    const box = await page.locator('[data-lab-tier]').boundingBox()
    const start = await look()
    ok(Math.abs(start.yaw) < 0.01 && Math.abs(start.pitch) < 0.01, `not straight ahead at the start: ${JSON.stringify(start)}`)
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.4, { steps: 14 })
    await page.mouse.up()
    await page.mouse.move(1300, 500)
    await page.waitForTimeout(1800)
    const turned = await look()
    await page.waitForTimeout(2500)
    const later = await look()
    note(`space look: start ${JSON.stringify(start)}, after a drag left and up ${JSON.stringify(turned)}, 2.5 s later ${JSON.stringify(later)}`)
    ok(turned.yaw > 0.1, `a drag to the left did not turn the view left (yaw ${turned.yaw.toFixed(3)})`)
    ok(turned.pitch > 0.02, `a drag up did not look up (pitch ${turned.pitch.toFixed(3)})`)
    ok(Math.abs(later.yaw - turned.yaw) < 0.01 && Math.abs(later.pitch - turned.pitch) < 0.01, `the view did not stay put: ${JSON.stringify(later)}`)
    // A very long drag stops at the limit.
    for (let i = 0; i < 4; i += 1) {
      await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.1)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.9, { steps: 8 })
      await page.mouse.up()
    }
    await page.mouse.move(1300, 500)
    await page.waitForTimeout(2200)
    const limit = await look()
    ok(Math.abs(limit.yaw) <= 1.02 && Math.abs(limit.pitch) <= 0.57, `past the limit: ${JSON.stringify(limit)}`)
    await page.getByRole('button', { name: 'Centre view' }).click()
    await page.waitForTimeout(2200)
    const back = await look()
    ok(Math.abs(back.yaw) < 0.02 && Math.abs(back.pitch) < 0.02, `Recentre left ${JSON.stringify(back)}`)
    // Reset does the same.
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5, { steps: 8 })
    await page.mouse.up()
    await page.mouse.move(1300, 500)
    await page.waitForTimeout(1200)
    ok(Math.abs((await look()).yaw) > 0.05, 'the second drag did not turn the view')
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await page.waitForTimeout(2200)
    ok(Math.abs((await look()).yaw) < 0.02, 'Reset did not recentre the view')
  })

  await step('generative-objects: the seed is shown and can be typed, another version changes it, Reset returns to the start', async () => {
    await open(page, 'en', 'generative-objects')
    await waitLive(page)
    const seed = page.getByLabel('Seed')
    const text = page.getByLabel('Describe what to build')
    const startSeed = await seed.inputValue()
    const startText = await text.inputValue()
    ok(/^\d+$/.test(startSeed), `seed "${startSeed}"`)
    await page.getByRole('button', { name: 'Another version' }).click()
    const second = await seed.inputValue()
    ok(second !== startSeed && /^\d+$/.test(second), `Another version left the seed at "${second}"`)
    await seed.fill('777')
    ok((await seed.inputValue()) === '777', 'the typed seed was overwritten')
    await seed.fill('7x')
    ok((await seed.inputValue()) === '7x', 'an invalid seed should stay as typed until it is valid')
    await text.fill('a small blue boat')
    await page.getByRole('button', { name: 'Make', exact: true }).click()
    ok((await seed.inputValue()) !== '777', 'making a new description kept the old seed')
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    ok((await seed.inputValue()) === startSeed, `Reset left seed ${await seed.inputValue()}`)
    ok((await text.inputValue()) === startText, 'Reset left the text changed')
  })

  await step('type-in-motion: own words, a preset sentence, Reset', async () => {
    await open(page, 'en', 'type-in-motion')
    await waitLive(page)
    const field = page.getByLabel('Text', { exact: true })
    ok((await field.count()) === 1, 'no text field')
    const before = await field.inputValue()
    await field.fill('hello lab')
    ok((await field.inputValue()).toLowerCase().includes('hello'), 'text not taken')
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    ok((await field.inputValue()) === before, `Reset left "${await field.inputValue()}"`)
  })

  // ── Full screen ───────────────────────────────────────────────────────────────────────────────
  await step('full screen (native): enter, the page stays usable inside it, the browser leaves it, the button follows', async () => {
    await open(page, 'en', 'liquid-matter')
    await waitLive(page)
    await page.getByRole('button', { name: 'Full screen' }).click()
    await page.waitForFunction(() => document.querySelector('[data-lab-experiment]')?.getAttribute('data-fullscreen') === 'native', null, { timeout: 8000 })
    ok(await page.evaluate(() => document.fullscreenElement === document.querySelector('[data-lab-experiment]')), 'the experience frame is not the full-screen element')
    ok((await page.getByRole('button', { name: 'Exit full screen' }).count()) === 1, 'no Exit button')
    ok((await page.getByRole('status').filter({ hasText: 'Full screen is on' }).count()) === 1, 'no announcement')
    const rect = await page.locator('[data-lab-experiment]').boundingBox()
    ok(rect.width >= 1400 && rect.height >= 880, `the frame is ${rect.width}x${rect.height}`)
    for (const [role, name] of [['link', 'All experiments'], ['link', 'Next experiment'], ['link', 'Previous experiment']]) ok((await dock(page).getByRole(role, { name }).isVisible()), `${name} missing in full screen`)
    ok(await page.locator('[data-lab-panel]').isVisible(), 'panel missing in full screen')
    ok(await page.locator('button[role=switch]').isVisible(), 'theme switch missing in full screen')
    ok(await page.locator('nav a[hreflang]').first().isVisible(), 'language switch missing in full screen')
    // What the browser does on Escape: leaves, and the frame follows.
    await page.evaluate(() => document.exitFullscreen())
    await page.waitForFunction(() => document.querySelector('[data-lab-experiment]')?.getAttribute('data-fullscreen') === 'off', null, { timeout: 8000 })
    ok((await page.getByRole('button', { name: 'Full screen', exact: true }).count()) === 1, 'the button did not go back to "Full screen"')
    ok((await page.getByRole('status').filter({ hasText: 'Full screen is off' }).count()) === 1, 'no announcement on leaving')
  })

  await step('full screen (native): the visible Exit button leaves it; the theme and language switches still work inside it', async () => {
    await open(page, 'en', 'liquid-matter')
    await waitLive(page)
    await page.getByRole('button', { name: 'Full screen' }).click()
    await page.waitForFunction(() => document.querySelector('[data-lab-experiment]')?.getAttribute('data-fullscreen') === 'native')
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    await page.locator('button[role=switch]').click()
    await page.waitForTimeout(400)
    const flipped = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
    ok(flipped && flipped !== theme, `theme stayed ${theme}`)
    await page.locator('button[role=switch]').click()
    await page.getByRole('button', { name: 'Exit full screen' }).click()
    await page.waitForFunction(() => document.querySelector('[data-lab-experiment]')?.getAttribute('data-fullscreen') === 'off', null, { timeout: 8000 })
    ok(await page.evaluate(() => document.fullscreenElement === null), 'the document is still in full screen')
  })

  await step('full screen: following a link out of it leaves the browser out of full screen', async () => {
    await open(page, 'en', 'liquid-matter')
    await waitLive(page)
    await page.getByRole('button', { name: 'Full screen' }).click()
    await page.waitForFunction(() => document.fullscreenElement !== null)
    await dock(page).getByRole('link', { name: 'Next experiment' }).click()
    await page.waitForURL(/type-in-motion/, { timeout: 15000 })
    await page.waitForTimeout(600)
    ok(await page.evaluate(() => document.fullscreenElement === null), 'still in full screen after navigating')
    ok((await frameMode(page)) === 'off', 'the next experience starts in full screen')
  })

  for (const [name, script] of [
    ['the browser has no Fullscreen API for an element (an iPhone)', `Element.prototype.requestFullscreen = undefined; Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false })`],
    ['the browser refuses the request', `Element.prototype.requestFullscreen = () => Promise.reject(new TypeError('denied'))`],
  ]) {
    await step(`full screen fallback: ${name} → the same view laid over the viewport; Escape leaves; the page behind does not scroll`, async () => {
      const second = await newPage(browser, { width: 1440, height: 900 })
      await second.context.addInitScript(script)
      const p = second.page
      await open(p, 'en', 'chromatic-distortion')
      await waitLive(p)
      await p.getByRole('button', { name: 'Full screen' }).click()
      await p.waitForFunction(() => document.querySelector('[data-lab-experiment]')?.getAttribute('data-fullscreen') === 'expanded', null, { timeout: 5000 })
      ok(await p.evaluate(() => document.documentElement.hasAttribute('data-lab-expanded')), 'the page is not frozen')
      const style = await p.locator('[data-lab-experiment]').evaluate((el) => ({ position: getComputedStyle(el).position, rect: el.getBoundingClientRect().toJSON(), z: getComputedStyle(el).zIndex }))
      ok(style.position === 'fixed' && style.rect.x === 0 && style.rect.y === 0 && style.rect.width === 1440 && style.rect.height === 900, `frame ${JSON.stringify(style)}`)
      ok(await p.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden'), 'the page can still scroll')
      ok((await p.getByRole('button', { name: 'Exit full screen' }).count()) === 1, 'no Exit button')
      await p.keyboard.press('Escape')
      await p.waitForFunction(() => document.querySelector('[data-lab-experiment]')?.getAttribute('data-fullscreen') === 'off', null, { timeout: 5000 })
      ok(!(await p.evaluate(() => document.documentElement.hasAttribute('data-lab-expanded'))), 'the page stayed frozen')
      // And by the button, then away by a link: nothing is left frozen.
      await p.getByRole('button', { name: 'Full screen' }).click()
      await p.waitForFunction(() => document.querySelector('[data-lab-experiment]')?.getAttribute('data-fullscreen') === 'expanded')
      await dock(p).getByRole('link', { name: 'Next experiment' }).click()
      await p.waitForURL(/generative-objects/, { timeout: 15000 })
      // The old page stays on screen until the next one's code has arrived; once it goes, nothing may stay frozen.
      await p.waitForFunction(() => document.querySelector('h1')?.innerText.toLowerCase().includes('generative'), null, { timeout: 15000 })
      ok(!(await p.evaluate(() => document.documentElement.hasAttribute('data-lab-expanded'))), 'leaving the page left it frozen')
      await second.context.close()
    })
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────────────────────
  await step('keyboard: the stage takes arrows, Enter and Home; the full-screen button works and shows a focus ring', async () => {
    await open(page, 'en', 'particle-universe')
    await waitLive(page)
    // The first stop is the site's skip link; the stage comes right after it. Record the order, it is what a keyboard visitor meets.
    const order = []
    let onStage = false
    for (let i = 0; i < 8 && !onStage; i += 1) {
      await page.keyboard.press('Tab')
      const where = await page.evaluate(() => {
        const el = document.activeElement
        return { stage: el?.hasAttribute('data-lab-tier') === true, label: (el?.getAttribute('aria-label') || el?.textContent || el?.tagName || '').trim().replace(/\s+/g, ' ').slice(0, 40) }
      })
      order.push(where.label)
      onStage = where.stage
    }
    note(`keyboard: Tab order up to the stage: ${order.map((label) => '"' + label + '"').join(' → ')}`)
    ok(onStage, 'Tab did not reach the stage within 8 presses')
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    await page.keyboard.press('Home')
    ok((await page.locator('[data-lab-tier]').getAttribute('data-touched')) === 'true', 'the stage did not register the keys')
    // Tab on through the page's controls until the full-screen button, then use it with the keyboard.
    let reached = false
    for (let i = 0; i < 12 && !reached; i += 1) {
      await page.keyboard.press('Tab')
      reached = await page.evaluate(() => document.activeElement?.hasAttribute('data-fullscreen-mode') === true)
    }
    ok(reached, 'Tab did not reach the full-screen button within 12 presses')
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement)
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), shadow: style.boxShadow }
    })
    ok((ring.style !== 'none' && ring.width > 0) || ring.shadow !== 'none', `no visible focus ring: ${JSON.stringify(ring)}`)
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.fullscreenElement !== null, null, { timeout: 5000 })
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.fullscreenElement === null, null, { timeout: 5000 })
    ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-fullscreen-mode') === true), 'focus was lost from the button')
  })

  // ── Languages ─────────────────────────────────────────────────────────────────────────────────
  await step('three languages: every control, the full-screen button, the how-to and the notices are in the page language (no English left in hu/nl)', async () => {
    const english = /\b(Controls|How to use it|Full screen|Reset|Display|Live|Calm|Still|Previous experiment|Next experiment|All experiments)\b/
    for (const lang of ['hu', 'nl']) {
      for (const id of IDS) {
        await open(page, lang, id)
        await waitLive(page)
        await page.locator('[data-lab-help] summary').click()
        const text = await page.locator('[data-lab-experiment]').evaluate((el) => el.innerText)
        const found = text.match(english)
        ok(!found, `${lang}/${id}: English text left on the page: "${found && found[0]}"`)
        ok((await page.getByRole('button', { name: lang === 'hu' ? 'Teljes képernyő' : 'Volledig scherm' }).count()) === 1, `${lang}/${id}: no full-screen button in the page language`)
        ok((await page.locator('html').getAttribute('lang')) === lang, `${lang}/${id}: <html lang>`)
      }
    }
  })

  await step('three languages: the language switch keeps the experience and translates the shell', async () => {
    await open(page, 'en', 'infinite-space')
    await page.locator('nav a[hreflang="nl"]').click()
    await page.waitForURL(/\/nl\/lab\/infinite-space/, { timeout: 15000 })
    // The old page stays up until the new language's page is ready.
    await page.getByRole('button', { name: 'Volledig scherm' }).waitFor({ timeout: 15000 })
    await page.locator('nav a[hreflang="hu"]').click()
    await page.waitForURL(/\/hu\/lab\/infinite-space/, { timeout: 15000 })
    await page.getByRole('button', { name: 'Teljes képernyő' }).waitFor({ timeout: 15000 })
  })

  // ── Reduced motion ────────────────────────────────────────────────────────────────────────────
  await step('reduced motion: every experience opens in the calm view, says so, stays interactive, and nothing moves on its own', async () => {
    const reduced = await newPage(browser, { width: 1440, height: 900, reduced: true })
    const p = reduced.page
    for (const id of IDS) {
      await open(p, 'en', id, '?lab=medium', { calm: true })
      await waitLive(p)
      ok((await p.locator('[data-lab-experiment]').getAttribute('data-view')) === 'calm', `${id}: not calm`)
      ok((await p.getByRole('status').filter({ hasText: 'Calm view' }).count()) === 1, `${id}: the calm view is not announced`)
      await p.mouse.move(1300, 500)
      await p.waitForTimeout(1500)
      const a = await stageShot(p)
      await p.waitForTimeout(900)
      const b = await stageShot(p)
      const idle = await meanDiff(p, a, b)
      const box = await p.locator('[data-lab-tier]').boundingBox()
      await p.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45)
      await p.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 10 })
      await p.waitForTimeout(500)
      const c = await stageShot(p)
      const answers = await meanDiff(p, b, c)
      note(`reduced motion ${id}: idle drift ${idle.toFixed(3)}, answer to the pointer ${answers.toFixed(2)} (of 255)`)
      ok(idle < 0.6, `${id}: moves by itself under reduced motion (${idle.toFixed(2)})`)
      ok(answers > 0.05, `${id}: does not answer the pointer under reduced motion (${answers.toFixed(3)})`)
    }
    await reduced.context.close()
  })

  // ── States: a browser without WebGL, a lost context ──────────────────────────────────────────
  await step('no WebGL: every experience shows its picture and the words, says why, and the controls stay', async () => {
    const bare = await launch({ args: ['--disable-gpu', '--disable-3d-apis', '--disable-webgl', '--disable-webgl2', '--disable-software-rasterizer'] })
    const second = await newPage(bare, { width: 1440, height: 900 })
    const p = second.page
    const problems = []
    p.on('pageerror', (error) => problems.push(error.message))
    for (const id of IDS) {
      await p.goto(experimentUrl('en', id, ''), { waitUntil: 'load' })
      await p.waitForSelector('h1', { timeout: 30000 })
      await p.waitForTimeout(500)
      ok((await p.locator('[data-lab-experiment]').getAttribute('data-view')) === 'still', `${id}: not the still view`)
      ok((await p.locator('[data-lab-tier] canvas').count()) === 0, `${id}: a canvas exists without WebGL`)
      ok((await p.getByRole('status').filter({ hasText: 'cannot run WebGL 2' }).count()) === 1, `${id}: no explanation`)
      ok((await p.locator('[data-lab-tier] svg').count()) > 0, `${id}: no picture`)
      ok(await p.locator('[data-lab-panel]').isVisible(), `${id}: no panel`)
      ok((await p.getByText('could not start').count()) === 0, `${id}: the crash screen`)
      ok(await dock(p).getByRole('link', { name: 'Next experiment' }).isVisible(), `${id}: no way onward`)
    }
    ok(problems.length === 0, `page errors: ${problems.join(' | ')}`)
    await second.context.close()
    await bare.close()
  })

  await step('lost graphics context: the stage says so, then recovers when the context returns', async () => {
    await open(page, 'en', 'liquid-matter')
    await waitLive(page)
    const hasExtension = await page.evaluate(() => {
      const gl = window.__labGl.getContext()
      const extension = gl.getExtension('WEBGL_lose_context')
      if (!extension) return false
      window.__lose = extension
      extension.loseContext()
      return true
    })
    ok(hasExtension, 'this browser has no WEBGL_lose_context')
    await page.getByRole('status').filter({ hasText: 'graphics context was lost' }).waitFor({ timeout: 5000 })
    ok((await page.locator('[data-lab-tier] [data-ready="false"]').count()) === 1, 'the canvas still shows')
    await page.evaluate(() => window.__lose.restoreContext())
    await page.waitForSelector('[data-ready="true"]', { timeout: 15000 })
    ok((await page.getByRole('status').filter({ hasText: 'graphics context was lost' }).count()) === 0, 'the notice stayed')
  })

  // ── What is left running after leaving ───────────────────────────────────────────────────────
  for (const id of IDS) {
    await step(`${id}: leaving stops everything (renderer, context, frames) and coming back builds one new stage`, async () => {
      await open(page, 'en', id)
      await waitLive(page)
      await page.waitForTimeout(700)
      const before = await page.evaluate(() => {
        window.__keep = window.__labGl
        return { frame: window.__keep.info.render.frame, geometries: window.__keep.info.memory.geometries, textures: window.__keep.info.memory.textures, programs: window.__keep.info.programs?.length ?? -1 }
      })
      ok(before.frame > 10, `the loop was not running (frame ${before.frame})`)
      await dock(page).getByRole('link', { name: 'All experiments' }).click()
      await page.waitForURL(/\/en\/lab\/?$/, { timeout: 15000 })
      await page.waitForTimeout(1500)
      const after = await page.evaluate(async () => {
        const gl = window.__keep
        const first = gl.info.render.frame
        await new Promise((resolve) => setTimeout(resolve, 1200))
        return {
          detached: !gl.domElement.isConnected,
          lost: gl.getContext().isContextLost(),
          framesWhileAway: gl.info.render.frame - first,
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length ?? -1,
          handle: window.__labGl === undefined,
        }
      })
      note(`${id}: before leaving ${JSON.stringify({ geometries: before.geometries, textures: before.textures, programs: before.programs })}; after ${JSON.stringify({ geometries: after.geometries, textures: after.textures, programs: after.programs })}`)
      ok(after.detached, 'the canvas is still in the page')
      ok(after.lost, 'the WebGL context was not released')
      ok(after.framesWhileAway === 0, `${after.framesWhileAway} frames were drawn after leaving`)
      ok(after.handle, 'the renderer handle is still exposed')
      // Generative Objects has one texture in three.js' own counter from the moment it mounts, which none of the code creates; it stays at one
      // (it does not grow, see the 25-rebuild check in the notes) and the lost context frees it. Every other experience ends at zero.
      const allowedTextures = id === 'generative-objects' ? 1 : 0
      ok(after.geometries === 0 && after.textures <= allowedTextures, `GPU resources left: ${after.geometries} geometries, ${after.textures} textures (allowed ${allowedTextures})`)
      await page.goBack()
      await waitLive(page)
      ok((await page.locator('[data-lab-experiment] canvas').count()) === 1, 'not exactly one canvas after coming back')
      ok(await page.evaluate(() => window.__labGl !== window.__keep), 'the old renderer came back')
    })
  }

  await step('a stage scrolled out of view stops drawing, and starts again when it is back', async () => {
    await open(page, 'en', 'particle-universe')
    await waitLive(page)
    await page.waitForTimeout(600)
    const rate = async () =>
      page.evaluate(async () => {
        const first = window.__labGl.info.render.frame
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return window.__labGl.info.render.frame - first
      })
    const visible = await rate()
    // The stage must be wholly out of view, and the details below it are shorter than a window: lengthen the page with a spacer.
    await page.evaluate(() => {
      const spacer = document.createElement('div')
      spacer.id = 'journey-spacer'
      spacer.style.height = '2400px'
      document.body.appendChild(spacer)
      window.scrollTo(0, document.querySelector('[data-lab-experiment]').getBoundingClientRect().bottom + window.scrollY + 40)
    })
    await page.waitForTimeout(600)
    const hidden = await rate()
    await page.evaluate(() => document.getElementById('journey-spacer')?.remove())
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(600)
    const back = await rate()
    note(`frames per second: visible ${visible}, scrolled away ${hidden}, back ${back}`)
    ok(visible > 10, `not drawing while visible (${visible})`)
    ok(hidden <= 1, `still drawing while out of view (${hidden} frames)`)
    ok(back > 10, `did not resume (${back})`)
  })

  // ── A phone ──────────────────────────────────────────────────────────────────────────────────
  await step('phone (390 x 844, touch): the panel starts closed, the full-screen button and the dock fit, a tap is a pulse, no sideways scroll', async () => {
    const phone = await newPage(browser, { width: 390, height: 844, mobile: true })
    const p = phone.page
    for (const id of IDS) {
      await open(p, 'en', id)
      await waitLive(p)
      ok((await p.locator('[data-lab-panel]').getAttribute('data-open')) === 'false', `${id}: the panel starts open on a phone`)
      const button = p.getByRole('button', { name: 'Full screen' })
      const box = await button.boundingBox()
      ok(box && box.x >= 0 && box.x + box.width <= 390 && box.width >= 40 && box.height >= 40, `${id}: the button is ${JSON.stringify(box)}`)
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${id}: scrolls sideways`)
      const stage = await p.locator('[data-lab-tier]').boundingBox()
      await p.touchscreen.tap(stage.x + stage.width / 2, stage.y + stage.height * 0.4)
      await p.waitForTimeout(150)
      ok((await p.locator('[data-lab-tier]').getAttribute('data-touched')) === 'true', `${id}: a tap was not an interaction`)
    }
    // Phone full screen end to end on one experience.
    await open(p, 'en', 'liquid-matter')
    await waitLive(p)
    await p.getByRole('button', { name: 'Full screen' }).tap()
    await p.waitForFunction(() => document.querySelector('[data-lab-experiment]')?.getAttribute('data-fullscreen') !== 'off', null, { timeout: 8000 })
    const mode = await frameMode(p)
    note(`phone emulation: full screen entered as "${mode}"`)
    await p.getByRole('button', { name: 'Exit full screen' }).tap()
    await p.waitForFunction(() => document.querySelector('[data-lab-experiment]')?.getAttribute('data-fullscreen') === 'off', null, { timeout: 8000 })
    await phone.context.close()
  })

  // ── The rest of the site ─────────────────────────────────────────────────────────────────────
  await step('the hidden NFSU2 egg is still its own thing: typed on the overview, it offers one new-tab link, never a frame', async () => {
    await page.goto(url('en', '/lab'), { waitUntil: 'load' })
    await page.waitForSelector('#experiments article', { timeout: 30000 })
    await page.locator('body').click({ position: { x: 5, y: 5 } })
    for (const key of ['n', 'f', 's', 'u', '2']) await page.keyboard.press(key)
    await page.waitForSelector('a[href="https://nfsu2.xyz/"]', { timeout: 8000 })
    const link = await page.locator('a[href="https://nfsu2.xyz/"]').first().evaluate((a) => ({ target: a.target, rel: a.rel }))
    ok(link.target === '_blank' && /noopener/.test(link.rel), `link ${JSON.stringify(link)}`)
    ok((await page.locator('iframe').count()) === 0, 'there is a frame')
  })

  await step('the page head and global navigation are untouched: the Lab overview keeps its header, the experience pages their immersive frame', async () => {
    await page.goto(url('en', '/lab'), { waitUntil: 'load' })
    await page.waitForSelector('h1', { timeout: 30000 })
    ok((await page.locator('header').count()) >= 1, 'no site header on the overview')
    await open(page, 'en', 'chromatic-distortion')
    ok((await page.locator('h1').count()) === 1, 'not exactly one h1')
    ok((await page.locator('main, [role=main]').count()) >= 1, 'no main landmark')
  })

  {
    if (errorsOfPage.length) {
      results.push({ name: 'no page error or console error during the whole journey', ok: false, error: errorsOfPage.slice(0, 5).join(' || ') })
      console.log(`  ✗ no page error or console error during the whole journey: ${errorsOfPage.slice(0, 5).join(' || ')}`)
    } else {
      results.push({ name: 'no page error or console error during the whole journey', ok: true })
      console.log('  ✓ no page error or console error during the whole journey')
    }
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
