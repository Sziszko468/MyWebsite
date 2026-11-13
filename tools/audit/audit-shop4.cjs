// Shop 4.0 (PROMPT 20): the states audit-matrix.cjs and audit-a11y.cjs cannot reach, in the built site. For each size × theme × language:
//   - the package finder: closed, every question, the suggestion, and the "tell us more" state;
//   - the request builder's add-on step: the add-ons a package lists, "not available with …" open, and the message that a package change
//     took add-ons off (with "your request so far" beside them);
//   - the FULL EXPERIENCE review with the project size guide.
// Each state gets axe-core (WCAG 2.0/2.1/2.2 A and AA, best practice) and the layout check of the matrix (sideways scroll, anything
// outside the viewport, tiny text or targets, console errors). Driven in English (the states are found by their English names); the
// other languages are loaded at the finder's closed and result states so that long Hungarian and Dutch words are measured too.
// The pages are rendered by a static server: nothing is sent (sending is covered by tools/e2e/shop4-journey.cjs).
// usage: node audit-shop4.cjs [dist dir] [--sizes=320x640,390x844,...] [--langs=en] [--themes=dark]
const { start } = require('./serve.cjs')
const { launch, newPage, axeRun, layoutCheck } = require('./lib.cjs')
const path = require('path')

const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split('=')))
const DIST = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..', 'dist'))
const sizes = (args.sizes || '320x640,360x740,390x844,430x932,768x1024,1024x768,1366x768,1440x900,1920x1080').split(',').map((s) => s.split('x').map(Number))
const langs = (args.langs || 'en,hu,nl').split(',')
const themes = (args.themes || 'dark,light').split(',')
const CART = { lines: [{ need: 'website', plan: 'grow', extras: ['pages', 'api', 'performance'] }] }

;(async () => {
  const srv = await start({ dir: DIST, port: 4240, fallback: '404', headers: true })
  const browser = await launch()
  const findings = []
  let audits = 0
  let layouts = 0

  for (const [width, height] of sizes) {
    for (const theme of themes) {
      for (const lang of langs) {
        // The full set of states in English at every size, one theme per size pair; the other languages and the other theme get the
        // finder's closed and result states and the add-on step only, which is where long words and the second theme matter.
        const full = lang === 'en'
        if (theme === 'light' && ![320, 390, 1440].includes(width)) continue
        if (lang !== 'en' && ![320, 390, 768].includes(width)) continue
        const { context, page } = await newPage(browser, { width, height, mobile: width < 768, reduced: true, scheme: theme, seen: true })
        await context.addInitScript(`try { localStorage.setItem('theme', '${theme}'); localStorage.setItem('cc-shop-cart-v1', ${JSON.stringify(JSON.stringify(CART))}) } catch (e) {}`)
        const errors = []
        page.on('pageerror', (e) => errors.push(`pageerror ${e.message.slice(0, 120)}`))
        page.on('console', (m) => {
          if (m.type() === 'error' && !/KHR_parallel|X4122|glGetProgramiv|WebGL|GPU stall|Failed to load resource/i.test(m.text())) errors.push(m.text().slice(0, 120))
        })
        const tag = `${width}x${height} ${theme} ${lang}`
        const open = async (route) => {
          await page.goto(`${srv.url}/${lang}${route}`, { waitUntil: 'load' })
          await page.waitForSelector('h1', { timeout: 20000 }).catch(() => {})
          await page.waitForTimeout(300)
        }
        const check = async (state) => {
          const violations = await axeRun(page)
          audits++
          for (const v of violations) findings.push(`${tag} / ${state}: ${v.id} (${v.impact}) x${v.count} - ${v.nodes[0]?.target} ${v.nodes[0]?.summary || ''}`)
          const issues = await page.evaluate(layoutCheck)
          layouts++
          for (const issue of issues) findings.push(`${tag} / ${state}: layout: ${issue}`)
        }
        const tryStep = async (state, fn) => {
          try { await fn() } catch (e) { findings.push(`${tag} / ${state}: could not be driven (${String(e.message).split('\n')[0].slice(0, 160)})`) }
        }
        const next = () => page.locator('form button[type=submit]').click()
        // The words the add-on step is driven by, per language ("Launch" is a proper noun in all three).
        const words = {
          en: { back: /Back/, notWith: /Not available with Launch/ },
          hu: { back: /Vissza/, notWith: /Nem választható ehhez a csomaghoz: Launch/ },
          nl: { back: /Terug/, notWith: /Niet beschikbaar bij Launch/ },
        }[lang]

        // ---- the finder
        await open('/services/')
        await page.locator('#compare').scrollIntoViewIfNeeded()
        await tryStep('finder closed', async () => { await check('finder closed') })
        const openButton = lang === 'hu' ? 'Segíts választani' : lang === 'nl' ? 'Help me kiezen' : 'Help me choose'
        await tryStep('finder open', async () => {
          await page.getByRole('button', { name: openButton }).click()
          await page.waitForSelector('form h4')
          await page.waitForTimeout(150)
          if (full) await check('finder, question 1')
        })
        if (full) {
          for (let question = 2; question <= 4; question += 1) {
            await tryStep(`finder question ${question}`, async () => {
              await page.locator('form input[type=radio]').first().check({ force: true })
              await next()
              await page.waitForTimeout(150)
              await check(`finder, question ${question}`)
            })
          }
        } else {
          await tryStep('finder answers', async () => {
            for (let question = 1; question <= 4; question += 1) {
              await page.locator('form input[type=radio]').nth(question === 1 ? 1 : 0).check({ force: true })
              if (question < 4) await next()
            }
          })
        }
        await tryStep('finder result', async () => {
          await next()
          await page.waitForSelector('h4:has-text("")', { timeout: 5000 }).catch(() => {})
          await page.waitForTimeout(250)
          await check('finder, suggestion')
        })
        if (full) {
          await tryStep('finder, nothing to go on', async () => {
            await page.reload({ waitUntil: 'load' })
            await page.waitForSelector('h1')
            await page.getByRole('button', { name: openButton }).click()
            await page.waitForSelector('form h4')
            for (let question = 1; question <= 4; question += 1) {
              await page.locator('form input[type=radio]').last().check({ force: true })
              await next()
              await page.waitForTimeout(120)
            }
            await page.waitForTimeout(250)
            await check('finder, asks for more')
          })
        }

        // ---- the request builder: the add-on step, and the message after a package change
        await tryStep('builder add-ons', async () => {
          await open('/services/configure/')
          await page.waitForSelector('form h2')
          await next() // need -> package
          await page.waitForSelector('form h2')
          await page.waitForTimeout(150)
          await next() // package -> add-ons
          await page.waitForTimeout(250)
          await check('builder, add-ons (Grow)')
        })
        await tryStep('builder add-ons, package without the API add-on', async () => {
          await page.getByRole('button', { name: words.back }).click()
          await page.waitForTimeout(200)
          await page.getByRole('radio', { name: /Launch/ }).check({ force: true })
          await page.waitForTimeout(250)
          await check('builder, package changed to Launch: add-ons taken off, with the message')
          await next()
          await page.waitForTimeout(250)
          const toggle = page.getByRole('button', { name: words.notWith })
          await toggle.click()
          await page.waitForTimeout(250)
          await check('builder, add-ons (Launch), "not available" open')
        })

        // ---- the FULL EXPERIENCE review with the project size guide
        if (full) {
          await tryStep('configurator review', async () => {
            await open('/services/full-experience/start/')
            await page.waitForSelector('form h2')
            await page.getByRole('radio', { name: /Web application/ }).check({ force: true })
            await next()
            await page.getByRole('radio', { name: /Just an idea/ }).check({ force: true })
            await next()
            for (const part of [/Rules and processes behind the scenes/, /Saving and managing information/]) await page.getByRole('checkbox', { name: part }).check({ force: true })
            await next()
            await page.getByRole('radio', { name: 'Medium' }).check({ force: true })
            for (let index = 0; index < 3; index += 1) { await next(); await page.waitForTimeout(150) }
            await page.getByLabel('Project description').fill('A booking platform for a network of small gyms, built from scratch.')
            await next()
            await page.waitForFunction(() => /How big the project looks/i.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 8000 })
            await check('configurator, review with the project size guide')
          })
        }

        for (const message of [...new Set(errors)].slice(0, 3)) findings.push(`${tag}: ${message}`)
        await context.close()
      }
    }
  }

  await browser.close()
  srv.close?.()
  console.log(`shop 4.0 states: ${audits} axe audits, ${layouts} layout checks (${sizes.length} sizes, ${langs.join('/')}, ${themes.join('/')})`)
  if (findings.length === 0) console.log('no findings')
  else {
    console.log(`${findings.length} findings:`)
    for (const finding of findings) console.log(` - ${finding}`)
  }
  process.exit(findings.length === 0 ? 0 : 1)
})()
