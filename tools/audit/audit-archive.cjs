#!/usr/bin/env node
/**
 * Command Center and Digital Archive (PROMPT 37): the responsive and accessibility audit, on the PRODUCTION build with its real Content-Security-Policy.
 * For the Command Center, the archive and the archive's other states (a filtered view, the empty state, an entry opened by a direct link), in every language, dark and light,
 * at 1440 / 1024 / 768 / 390 / 320 px: the platform's layout checks (no sideways scroll, nothing outside the viewport, text and targets big enough), axe-core (WCAG 2.0 / 2.1
 * / 2.2 A and AA + best practice, colour contrast included) and what the pages add: exactly one h1 and a main landmark, headings that never skip a level, the system bar, and
 * the numbers of entries. No console error.
 *
 *   node tools/audit/audit-archive.cjs [dist] [--quick] [--schemes light] [--langs en,nl] [--width 320]     (--quick: English only, dark only)
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
const positional = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--') && all[i - 1] !== '--quick'))
const DIST = path.resolve(positional[0] || path.join(__dirname, '..', '..', 'dist'))
const QUICK = process.argv.includes('--quick')
const ONLY_SCHEMES = flagValue('--schemes')
const ONLY_LANGS = flagValue('--langs')
const ONLY_WIDTH = flagValue('--width')
const ALL_WIDTHS = [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 568]]
const WIDTHS = ONLY_WIDTH ? ALL_WIDTHS.filter(([w]) => String(w) === ONLY_WIDTH) : ALL_WIDTHS

const VIEWS = [
  { name: 'command-center', route: '/command-center', ready: '[data-command-center] [data-sector]', entries: null },
  { name: 'archive', route: '/archive', ready: '[data-archive] article', entries: 14 },
  { name: 'archive filtered', route: '/archive?kind=lab&sort=name', ready: '[data-archive] article', entries: 6 },
  { name: 'archive empty', route: '/archive?q=zzzzqqq', ready: '[data-archive] h3', entries: 0 },
  { name: 'archive linked', route: '/archive#entry-demo-bookinghub', ready: '[data-linked]', entries: 14 },
]

async function waitForData(page) {
  await page.waitForFunction(() => !(document.querySelector('main')?.textContent || '').includes('…'), null, { timeout: 15000 }).catch(() => undefined)
}

;(async () => {
  const srv = await start({ dir: DIST, port: 4271, fallback: '404', headers: true })
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
        // The static build has no backend behind it here: a request for the public project list fails and the website uses its own content, which is what is audited.
        if (m.type() === 'error' && !/WebGL|GPU stall|GL Driver|ReadPixels|Automatic fallback|swiftshader|Failed to load resource|\/api\//i.test(m.text())) consoleErrors.push(m.text().slice(0, 120))
      })
      page.on('pageerror', (e) => consoleErrors.push(`pageerror ${e.message}`.slice(0, 120)))

      for (const lang of langs) {
        for (const view of VIEWS) {
          const where = `${scheme} ${w}x${h} ${lang} ${view.name}`
          const found = []
          consoleErrors.length = 0
          const [route, hash] = view.route.split('#')
          const [pathname, query] = route.split('?')
          await page.goto(`${srv.url}/${lang}${pathname}/${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`, { waitUntil: 'load' })
          await page.locator(view.ready).first().waitFor({ timeout: 30000 }).catch(() => found.push('the view never appeared'))
          await waitForData(page)
          // A new page starts at the top for a visitor (a direct link goes to its entry, which is where it should be).
          if (!hash) await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
          // Let the entrances happen: scroll once through, then back.
          const height = await page.evaluate(() => document.documentElement.scrollHeight)
          for (let y = 0; y < height; y += 700) await page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), y)
          await page.waitForTimeout(500)
          // Back to where a visitor is: the top, or the linked entry. (Measuring wherever the walk ended would find links that are only half scrolled under the sticky header.)
          await page.evaluate((id) => (id ? document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' }) : window.scrollTo({ top: 0, behavior: 'instant' })), hash || '')
          await page.waitForTimeout(500)
          views += 1
          found.push(...(await page.evaluate(layoutCheck)))
          const structure = await page.evaluate(() => {
            const levels = [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')].map((h) => Number(h.tagName[1]))
            return {
              h1: document.querySelectorAll('h1').length,
              main: document.querySelectorAll('main, [role=main]').length,
              skips: levels.some((l, i) => i > 0 && l > levels[i - 1] + 1),
              levels: levels.join(''),
              bar: document.querySelectorAll('nav[aria-label] a[aria-current="page"]').length,
              entries: document.querySelectorAll('[data-archive] article').length,
              raw: /\{[a-z]+\}|\bundefined\b/.test(document.querySelector('main')?.textContent || ''),
            }
          })
          if (structure.h1 !== 1) found.push(`${structure.h1} h1`)
          if (structure.main < 1) found.push('no main landmark')
          if (structure.skips) found.push(`heading levels skip: ${structure.levels}`)
          if (structure.bar < 1) found.push('no current stop in a navigation')
          if (view.entries !== null && structure.entries !== view.entries) found.push(`${structure.entries} entries, expected ${view.entries}`)
          if (structure.raw) found.push('a raw key or undefined shows')
          for (const v of await axeRun(page)) found.push(`axe ${v.id} (${v.impact}): ${v.nodes.map((n) => n.target).join(' ; ').slice(0, 140)}${process.env.AUDIT_DETAIL ? ' :: ' + v.nodes.map((n) => n.summary).join(' ; ').slice(0, 260) : ''}`)
          if (consoleErrors.length) found.push(`console: ${consoleErrors.slice(0, 2).join(' | ')}`)
          for (const f of found) findings.push(`${where}: ${f}`)
        }
      }
      await context.close()
    }
  }
  await browser.close()
  srv.server.close()
  console.log(`${views} views audited (${langs.length} language(s) x ${schemes.length} scheme(s) x ${WIDTHS.length} widths x ${VIEWS.length} views)`)
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
