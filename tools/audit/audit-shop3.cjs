// Shop 3.0 (PROMPT 09.1): axe-core on the INTERACTIVE states audit-a11y.cjs cannot reach, in the built site.
//   - the tier comparison: the desktop table with a feature explanation open; the phone switcher with each tab, a group open, and the
//     two-package mode (offered from 24 rem), with and without "only the differences"
//   - a package page and the FULL EXPERIENCE page
//   - the FULL EXPERIENCE configurator: every step, and the states with an error (nothing chosen on a required question, a too short
//     description, empty contact details)
// The configurator is walked to the contact step but never sent (the static server has no backend; sending is covered by
// tools/e2e/shop-journey.cjs).
// The states are found by their English names ("Compare two packages", "Introduced with Build"), so it is driven in English; the other
// languages' pages are covered by audit-a11y.cjs and audit-matrix.cjs.
// usage: node audit-shop3.cjs [dist dir] [--sizes=1440x900,390x844,320x640] [--langs=en] [--themes=dark,light]
const { start } = require('./serve.cjs')
const { launch, newPage, axeRun } = require('./lib.cjs')
const path = require('path')

const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')))
const DIST = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..', 'dist'))
const sizes = (args.sizes || '1440x900,390x844,320x640').split(',').map((s) => s.split('x').map(Number))
const langs = (args.langs || 'en').split(',')
const themes = (args.themes || 'dark,light').split(',')

;(async () => {
  const srv = await start({ dir: DIST, port: 4230, fallback: '404', headers: true })
  const browser = await launch()
  const findings = []
  let audits = 0

  for (const [width, height] of sizes) {
    for (const theme of themes) {
      for (const lang of langs) {
        const { context, page } = await newPage(browser, { width, height, mobile: width < 768, reduced: true, scheme: theme, seen: true })
        await context.addInitScript(`try { localStorage.setItem('theme', '${theme}') } catch (e) {}`)
        const errors = []
        page.on('pageerror', (e) => errors.push(`pageerror ${e.message.slice(0, 120)}`))
        const tag = `${width}x${height} ${theme} ${lang}`
        const open = async (route) => {
          await page.goto(`${srv.url}/${lang}${route}/`, { waitUntil: 'load' })
          await page.waitForSelector('h1', { timeout: 20000 }).catch(() => {})
          await page.waitForTimeout(300)
        }
        const check = async (state) => {
          const violations = await axeRun(page)
          audits++
          for (const v of violations) findings.push(`${tag} / ${state}: ${v.id} (${v.impact}) x${v.count} - ${v.nodes[0]?.target} ${v.nodes[0]?.summary || ''}`)
        }
        const tryStep = async (state, fn) => {
          try { await fn() } catch (e) { findings.push(`${tag} / ${state}: could not be driven (${String(e.message).split('\n')[0].slice(0, 140)})`) }
        }

        // ---- the comparison on the shop's front page
        await open('/services')
        await page.locator('#packages').scrollIntoViewIfNeeded()
        await check('comparison')
        if (width >= 768) {
          await tryStep('comparison, explanation open', async () => {
            await page.getByRole('button', { name: /^What does .* mean\?/ }).first().click()
            await page.waitForTimeout(150)
            await check('comparison, explanation open')
          })
        } else {
          for (const name of ['Launch', 'Grow', 'Build', 'Care']) {
            await tryStep(`switcher ${name}`, async () => {
              await page.getByRole('tab', { name }).click()
              await page.waitForTimeout(150)
              await check(`switcher, ${name}`)
            })
          }
          await tryStep('switcher, a group open', async () => {
            await page.getByRole('tab', { name: 'Build' }).click()
            const group = page.getByRole('button', { name: /Introduced with Build/ })
            if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click()
            await page.waitForTimeout(150)
            await check('switcher, group open')
          })
          if (width >= 384) {
            await tryStep('pair mode', async () => {
              await page.getByRole('button', { name: 'Compare two packages' }).click()
              await page.waitForTimeout(200)
              await check('pair mode')
              await page.getByLabel('Show only the differences').check()
              await page.waitForTimeout(150)
              await check('pair mode, only the differences')
            })
          }
        }
        await open('/services')
        await check('front page (band included)')

        // ---- the pages
        await open('/services/packages/grow')
        await check('package page')
        await open('/services/full-experience')
        await check('FULL EXPERIENCE page')

        // ---- the configurator
        await open('/services/full-experience/start')
        const submit = page.locator('form button[type=submit]')
        await tryStep('configurator', async () => {
          await check('configurator, step 1')
          await submit.click() // nothing chosen on a required question
          await page.waitForTimeout(200)
          await check('configurator, step 1 with its error')
          for (let step = 1; step <= 6; step++) {
            const required = (await page.locator('form').innerText()).length > 0 && step <= 2
            if (required) await page.locator('form input[type=radio]').first().check({ force: true })
            await submit.click()
            await page.waitForTimeout(200)
            await check(`configurator, step ${step + 1}`)
          }
          // the description step: too short, then right
          await page.getByRole('textbox').first().fill('too short')
          await submit.click()
          await page.waitForTimeout(200)
          await check('configurator, description with its error')
          await page.getByRole('textbox').first().fill('A booking platform for a network of small gyms, built from scratch.')
          await submit.click()
          await page.waitForTimeout(200)
          await check('configurator, contact')
          await submit.click() // empty contact details
          await page.waitForTimeout(250)
          await check('configurator, contact with its errors')
        })

        if (errors.length) findings.push(`${tag}: ${errors.slice(0, 2).join(' | ')}`)
        await context.close()
      }
    }
  }

  console.log(`shop 3.0: ${audits} axe audits at ${sizes.map((s) => s.join('x')).join(', ')} (${themes.join('+')}, ${langs.join('+')})`)
  if (!findings.length) console.log('shop 3.0: no findings')
  for (const f of findings) console.log(`- ${f}`)
  await browser.close()
  await srv.close()
  if (findings.length) process.exit(1)
})().catch((e) => { console.error(e); process.exit(2) })
