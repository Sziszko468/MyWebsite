#!/usr/bin/env node
/**
 * Lab 2.0 (PROMPT 34): the responsive and accessibility audit of the Lab, on the PRODUCTION build with its real
 * Content-Security-Policy. For the overview and every experience, in every language, in dark and light, at 1440 / 1024 / 768 / 390 /
 * 320 px: the layout checks of the platform's matrix (no sideways scroll, nothing outside the viewport, text and targets big
 * enough), axe-core (WCAG 2.0 / 2.1 / 2.2 A and AA + best practice, colour contrast included), and what the Lab adds:
 *
 *   - exactly one h1 and a main landmark; the stage is a named group; the panel's toggle reports aria-expanded;
 *   - the full-screen button exists, is named in the page's language, is on screen and big enough (44 px on a phone);
 *   - "how to use it" is a native disclosure that opens, and axe is run again with the panel and the disclosure open;
 *   - every tile of the overview names what steers it;
 *   - no console error.
 *
 *   node tools/audit/audit-lab2.cjs [dist] [--quick] [--schemes light] [--langs en,nl]     (--quick: English only, dark only)
 *
 * Needs AUDIT_PLAYWRIGHT and AUDIT_AXE (see tools/audit/README.md) and a built `dist`.
 */
const path = require('path')
const { start } = require('./serve.cjs')
const { launch, newPage, axeRun, layoutCheck, LANGS } = require('./lib.cjs')

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const DIST = path.resolve(positional[0] || path.join(__dirname, '..', '..', 'dist'))
const QUICK = process.argv.includes('--quick')
const flagValue = (name) => {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : ''
}
const ONLY_SCHEMES = flagValue('--schemes') // e.g. light
const ONLY_LANGS = flagValue('--langs') // e.g. en,nl
const IDS = ['particle-universe', 'liquid-matter', 'type-in-motion', 'infinite-space', 'chromatic-distortion', 'generative-objects']
const WIDTHS = [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 568]]
/**
 * Two findings of the platform's layout check that are not findings here: an experience page is immersive (the Lab's own header inside the frame, no
 * site footer by design), and the overview's red full stop is the hidden egg's button, whose ::after makes a 44 px target.
 */
const notKnown = (route) => (finding) => !(route && finding === 'no footer') && !(!route && /^1 target\(s\) under 24px: button \d+x\d+ "\."$/.test(finding))
const FULLSCREEN = { hu: 'Teljes képernyő', en: 'Full screen', nl: 'Volledig scherm' }

;(async () => {
  const srv = await start({ dir: DIST, port: 4254, fallback: '404', headers: true })
  const browser = await launch()
  const findings = []
  let views = 0
  const langs = ONLY_LANGS ? ONLY_LANGS.split(',') : QUICK ? ['en'] : LANGS
  const schemes = ONLY_SCHEMES ? ONLY_SCHEMES.split(',') : QUICK ? ['dark'] : ['dark', 'light']

  for (const scheme of schemes) {
    for (const [w, h] of WIDTHS) {
      const mobile = w < 768
      const { context, page } = await newPage(browser, { width: w, height: h, mobile, scheme })
      const consoleErrors = []
      page.on('console', (m) => {
        if (m.type() === 'error' && !/WebGL|GPU stall|GL Driver|ReadPixels|Automatic fallback|swiftshader/i.test(m.text())) consoleErrors.push(m.text().slice(0, 120))
      })
      page.on('pageerror', (e) => consoleErrors.push(`pageerror ${e.message}`.slice(0, 120)))

      for (const lang of langs) {
        for (const route of ['', ...IDS]) {
          const where = `${scheme} ${w}x${h} ${lang}/lab${route ? '/' + route : ''}`
          const found = []
          consoleErrors.length = 0
          await page.goto(`${srv.url}/${lang}/lab${route ? '/' + route : ''}/`, { waitUntil: 'load' })
          await page.waitForSelector('h1', { timeout: 30000 }).catch(() => found.push('no h1'))
          if (route) await page.waitForSelector('[data-ready="true"]', { timeout: 30000 }).catch(() => found.push('the live view never became ready'))
          else {
            await page.waitForSelector('#experiments article', { timeout: 20000 }).catch(() => found.push('no tiles'))
            await page.locator('#experiments').scrollIntoViewIfNeeded().catch(() => undefined)
          }
          await page.waitForTimeout(700)
          views += 1

          found.push(...(await page.evaluate(layoutCheck)).filter(notKnown(route)))
          if ((await page.locator('h1').count()) !== 1) found.push(`${await page.locator('h1').count()} h1`)
          if ((await page.locator('main, [role=main]').count()) < 1) found.push('no main landmark')

          if (!route) {
            const tiles = await page.locator('#experiments article').evaluateAll((articles) =>
              articles.map((a) => ({ listed: a.querySelectorAll('li[data-input]').length, named: !!a.querySelector('ul[aria-label]')?.getAttribute('aria-label') })),
            )
            if (tiles.length !== 6) found.push(`${tiles.length} tiles`)
            tiles.forEach((tile, i) => {
              if (tile.listed < 3 || !tile.named) found.push(`tile ${i + 1} does not say what steers it`)
            })
          } else {
            const stage = await page.locator('[data-lab-tier]').first().evaluate((el) => ({ role: el.getAttribute('role'), name: el.getAttribute('aria-label') }))
            if (stage.role !== 'group' || !stage.name) found.push(`the stage is not a named group: ${JSON.stringify(stage)}`)
            const button = page.getByRole('button', { name: FULLSCREEN[lang], exact: true })
            if ((await button.count()) !== 1) found.push('no full-screen button in the page language')
            else {
              const box = await button.boundingBox()
              const min = mobile ? 43.5 : 31
              if (!box || box.width < min || box.height < min) found.push(`full-screen button is ${box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'not on screen'}`)
              if (box && (box.x < 0 || box.x + box.width > w + 0.5)) found.push('full-screen button is outside the viewport')
            }
            const toggle = page.locator('[data-lab-panel] > button[aria-expanded]')
            if ((await toggle.count()) !== 1) found.push('no panel toggle with aria-expanded')
          }

          const first = await axeRun(page)
          for (const v of first) found.push(`axe ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target).join(' ; ').slice(0, 140)}`)

          // The same page with the panel and "how to use it" open: that is where most of the words are.
          if (route) {
            const toggle = page.locator('[data-lab-panel] > button[aria-expanded]')
            if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
            await page.locator('[data-lab-help] summary').click().catch(() => found.push('how-to did not open'))
            await page.waitForTimeout(300)
            if (!(await page.locator('[data-lab-help]').evaluate((el) => el.open).catch(() => false))) found.push('how-to is not open')
            found.push(...(await page.evaluate(layoutCheck)).filter(notKnown(route)).map((f) => `(panel open) ${f}`))
            const second = await axeRun(page)
            for (const v of second) if (!first.some((f) => f.id === v.id)) found.push(`(panel open) axe ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target).join(' ; ').slice(0, 140)}`)
          }

          if (consoleErrors.length) found.push(`console: ${consoleErrors.slice(0, 2).join(' | ')}`)
          for (const f of found) findings.push(`${where}: ${f}`)
        }
      }
      await context.close()
    }
  }
  await browser.close()
  srv.server.close()
  console.log(`${views} Lab views audited (${langs.length} language(s) x ${schemes.length} scheme(s) x ${WIDTHS.length} widths x 7 pages)`)
  if (findings.length) {
    const unique = [...new Set(findings)]
    for (const f of unique.slice(0, 80)) console.log('  ✗ ' + f)
    console.log(`${findings.length} finding(s)`)
  } else console.log('0 findings')
  process.exit(findings.length ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
