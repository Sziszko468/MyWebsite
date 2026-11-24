#!/usr/bin/env node
/**
 * Design System Playground (PROMPT 36): the responsive and accessibility audit, on the PRODUCTION build with its real Content-Security-Policy.
 * For the playground's page, in every language, in the site's dark and light theme, at 1440 / 1024 / 768 / 390 / 320 px: the platform's layout checks (no sideways scroll,
 * nothing outside the viewport, text and targets big enough), axe-core (WCAG 2.0 / 2.1 / 2.2 A and AA + best practice, colour contrast included) and what the playground adds:
 *
 *   - exactly one h1, a main landmark, a labelled navigation, five laboratories each with its own h2;
 *   - the same page after the visitor has played in every laboratory (a changed colour that stays readable, the light preview theme, the monospace typeface, the phone
 *     width in the layout laboratory, reduced motion switched on, the contrast report open, a wrong HEX showing its message): the states that carry the most words and colour;
 *   - with --components: every one of the eight components selected in turn (English, the widest and the narrowest width, both themes);
 *   - the Lab's overview with its band, and no console error.
 *
 *   node tools/audit/audit-playground.cjs [dist] [--quick] [--schemes light] [--langs en,nl] [--width 320] [--components]     (--quick: English only, dark only)
 *
 * Needs AUDIT_PLAYWRIGHT and AUDIT_AXE (see tools/audit/README.md) and a built `dist`.
 */
const path = require('path')
const { start } = require('./serve.cjs')
const { launch, newPage, axeRun, layoutCheck, LANGS } = require('./lib.cjs')

const flagValue = (name) => {
  const at = process.argv.indexOf(name)
  return at >= 0 ? process.argv[at + 1] : ''
}
const positional = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--') && !['--quick', '--components'].includes(all[i - 1])))
const DIST = path.resolve(positional[0] || path.join(__dirname, '..', '..', 'dist'))
const QUICK = process.argv.includes('--quick')
const COMPONENTS = process.argv.includes('--components')
const ONLY_SCHEMES = flagValue('--schemes')
const ONLY_LANGS = flagValue('--langs')
const ONLY_WIDTH = flagValue('--width')
const ALL_WIDTHS = [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 568]]
const WIDTHS = ONLY_WIDTH ? ALL_WIDTHS.filter(([w]) => String(w) === ONLY_WIDTH) : ALL_WIDTHS
const ROUTE = '/lab/design-system'
const COMPONENT_NAMES = {
  en: ['Buttons', 'Badges', 'Form fields', 'Links', 'Navigation', 'Section heading', 'Service card', 'Project card'],
}

/** Findings of the generic layout check that are not findings of this task: "no footer" (the check is for immersive Lab pages; this page has a footer). */
const notKnown = (finding) => finding !== 'no footer'

const choose = async (scope, name) => {
  const radio = scope.getByRole('radio', { name: new RegExp(`^${name}\\b`) })
  await radio.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await radio.check({ force: true })
}

/** The visitor plays in every laboratory (nothing here is unreadable: a failing palette is the visitor's choice and is checked by the journey, not by axe). */
async function play(page, lang) {
  const done = []
  await page.locator('#color fieldset').filter({ hasText: 'Racing Red' }).first().locator('input:not([type="color"])').fill('#12')
  done.push('a wrong HEX with its message')
  await page.locator('#color fieldset').filter({ hasText: 'Cobalt Blue' }).first().locator('input:not([type="color"])').fill('#7c3aed')
  done.push('a changed colour')
  await page.locator('#color details summary').click()
  done.push('the contrast report open')
  await page.getByRole('radio', { name: /^(Light|Világos|Licht)/ }).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.getByRole('radio', { name: /^(Light|Világos|Licht)/ }).check({ force: true })
  done.push('the light preview theme')
  await choose(page.locator('#type'), 'Monospace')
  done.push('the monospace typeface')
  await choose(page.locator('#layout fieldset').first(), /(Phone|Telefon|Telefoon)/.source)
  done.push('the phone width')
  await page.locator('#motion').getByRole('switch').first().evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.locator('#motion').getByRole('switch').first().check({ force: true })
  done.push('reduced motion')
  await page.waitForTimeout(300)
  void lang
  return done
}

;(async () => {
  const srv = await start({ dir: DIST, port: 4265, fallback: '404', headers: true })
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
        const where = `${scheme} ${w}x${h} ${lang}${ROUTE}`
        const found = []
        consoleErrors.length = 0
        await page.goto(`${srv.url}/${lang}${ROUTE}/`, { waitUntil: 'load' })
        await page.locator('#color').waitFor({ timeout: 30000 }).catch(() => found.push('the page never appeared'))
        // Every view starts at the top, as a new page does for a visitor.
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
        await page.waitForTimeout(900)
        views += 1
        found.push(...(await page.evaluate(layoutCheck)).filter(notKnown))
        if ((await page.locator('h1').count()) !== 1) found.push(`${await page.locator('h1').count()} h1`)
        if ((await page.locator('main, [role=main]').count()) < 1) found.push('no main landmark')
        if ((await page.locator('nav[aria-label]').count()) < 2) found.push('the page has no labelled navigation of its own')
        for (const id of ['color', 'type', 'components', 'layout', 'motion']) if ((await page.locator(`section#${id} h2`).count()) !== 1) found.push(`section ${id} has no single h2`)

        const first = await axeRun(page)
        for (const v of first) found.push(`axe ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target).join(' ; ').slice(0, 140)}${process.env.AUDIT_DETAIL ? ' :: ' + v.nodes.map((n) => n.summary).join(' ; ').slice(0, 260) : ''}`)

        // After play.
        let played = []
        try {
          played = await play(page, lang)
        } catch (error) {
          found.push(`playing failed: ${String(error.message).split('\n')[0].slice(0, 120)}`)
        }
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
        await page.waitForTimeout(300)
        found.push(...(await page.evaluate(layoutCheck)).filter(notKnown).map((f) => `(after play) ${f}`))
        const second = await axeRun(page)
        for (const v of second) if (!first.some((f) => f.id === v.id)) found.push(`(after play: ${played.length} states) axe ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target).join(' ; ').slice(0, 140)}`)
        // In every state the page itself must still fit.
        if ((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) > 1) found.push('(after play) the page scrolls sideways')

        if (consoleErrors.length) found.push(`console: ${consoleErrors.slice(0, 2).join(' | ')}`)
        for (const f of found) findings.push(`${where}: ${f}`)
      }

      // The Lab's overview and its band.
      {
        const where = `${scheme} ${w}x${h} en/lab`
        const found = []
        await page.goto(`${srv.url}/en/lab/`, { waitUntil: 'load' })
        await page.locator('[data-design-tool]').waitFor({ timeout: 30000 }).catch(() => found.push('the Lab has no band for the playground'))
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
        await page.waitForTimeout(700)
        views += 1
        if ((await page.locator('#experiments article').count()) !== 6) found.push(`${await page.locator('#experiments article').count()} experiences instead of six`)
        if ((await page.locator('#experiments a[href*="design-system"]').count()) !== 0) found.push('the playground is among the experiences')
        for (const v of await axeRun(page)) if (v.id !== 'target-size') found.push(`axe ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target).join(' ; ').slice(0, 140)}`)
        for (const f of found) findings.push(`${where}: ${f}`)
      }

      // Every component, in English, at the extremes.
      if (COMPONENTS && (w === 1440 || w === 320)) {
        const lang = 'en'
        await page.goto(`${srv.url}/${lang}${ROUTE}/`, { waitUntil: 'load' })
        await page.locator('#components').waitFor({ timeout: 30000 })
        await page.waitForTimeout(700)
        for (const name of COMPONENT_NAMES.en) {
          const found = []
          await choose(page.locator('#components fieldset').first(), name)
          await page.waitForTimeout(250)
          views += 1
          found.push(...(await page.evaluate(layoutCheck)).filter(notKnown))
          for (const v of await axeRun(page)) found.push(`axe ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target).join(' ; ').slice(0, 140)}`)
          for (const f of found) findings.push(`${scheme} ${w}x${h} en component ${name}: ${f}`)
        }
      }
      await context.close()
    }
  }
  await browser.close()
  srv.server.close()
  console.log(`${views} playground views audited (${langs.length} language(s) x ${schemes.length} scheme(s) x ${WIDTHS.length} widths${COMPONENTS ? ', with the eight components' : ''})`)
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
