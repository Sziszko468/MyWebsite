#!/usr/bin/env node
/**
 * Lab experience pages (PROMPT 15): do the words on the stage cover each other? The layout matrix catches sideways overflow and
 * off-screen elements but not text lying on text, and the Lab's phone layout stacks several things at the bottom of the screen:
 * the stage's hint ("Drag through the particles..."), a notice (the calm view's, the still view's, a failure's), the closed control
 * panel and the dock. This opens every experience at phone and tablet sizes in every language, in the states that show a notice
 * (reduced motion = the calm view), and fails when the rectangles of any two of those pieces of text intersect.
 *
 *   node tools/audit/audit-lab-overlap.cjs [dist]
 */
const path = require('path')
const { start } = require('./serve.cjs')
const { launch, newPage, LANGS } = require('./lib.cjs')

const DIST = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..', 'dist'))
const IDS = ['particle-universe', 'liquid-matter', 'type-in-motion', 'infinite-space', 'chromatic-distortion']
const SIZES = [[320, 568], [360, 800], [390, 844], [430, 932], [768, 1024], [1024, 768], [1440, 900]]
// The pieces of the screen that carry words, by what they are (the CSS-module class names are hashed: match on the part that is not).
const PIECES = { hint: '[class*="_hint_"]', notice: '[class*="_notice_"]', title: 'h1', crumb: '[class*="_crumb_"]', panel: '[data-lab-panel]', dock: '[class*="_dock_"]' }

;(async () => {
  const srv = await start({ dir: DIST, port: 4253, fallback: '404', headers: true })
  const browser = await launch()
  const findings = []
  let checked = 0
  for (const reduced of [true, false]) {
    for (const [w, h] of SIZES) {
      const mobile = w < 768
      const { context, page } = await newPage(browser, { width: w, height: h, mobile, reduced, seen: true })
      for (const lang of LANGS) {
        for (const id of IDS) {
          await page.goto(`${srv.url}/${lang}/lab/${id}/`, { waitUntil: 'load' })
          await page.waitForSelector('h1', { timeout: 20000 }).catch(() => {})
          await page.waitForTimeout(600)
          const rects = await page.evaluate((pieces) => {
            const out = {}
            for (const [name, selector] of Object.entries(pieces)) {
              const el = document.querySelector(selector)
              if (!el) continue
              const s = getComputedStyle(el)
              if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue
              const r = el.getBoundingClientRect()
              if (r.width > 0 && r.height > 0) out[name] = [r.x, r.y, r.right, r.bottom]
            }
            return out
          }, PIECES)
          checked += 1
          const names = Object.keys(rects)
          for (let i = 0; i < names.length; i += 1) {
            for (let j = i + 1; j < names.length; j += 1) {
              const a = rects[names[i]], b = rects[names[j]]
              const overlapX = Math.min(a[2], b[2]) - Math.max(a[0], b[0])
              const overlapY = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
              // Containers legitimately hold their parts (the panel holds nothing here, the dock holds its own buttons): only text pieces are compared.
              if (overlapX > 2 && overlapY > 2) findings.push(`${w}x${h} ${reduced ? 'reduced' : 'normal'} ${lang}/lab/${id}: "${names[i]}" and "${names[j]}" overlap by ${Math.round(overlapX)}x${Math.round(overlapY)} px`)
            }
          }
        }
      }
      await context.close()
    }
  }
  await browser.close()
  srv.server.close()
  console.log(`${checked} experience screens checked (5 experiences x 3 languages x ${SIZES.length} sizes x reduced and normal motion)`)
  if (findings.length) { for (const f of findings.slice(0, 60)) console.log('  ✗ ' + f); console.log(`${findings.length} overlap(s)`) } else console.log('no overlap')
  process.exit(findings.length ? 1 : 0)
})().catch((error) => { console.error(error); process.exit(2) })
